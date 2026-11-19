import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import ts from "typescript";

const sources = await Promise.all(["canvas-viewport", "html-in-canvas"].map((name) =>
  readFile(new URL(`../src/lib/${name}.ts`, import.meta.url), "utf8")));
const helperJavaScript = sources.map((source) => ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText.replace(/^export /gm, "")).join("\n");
const browser = await chromium.launch({
  ...(process.env.CHROME_EXECUTABLE
    ? { executablePath: process.env.CHROME_EXECUTABLE }
    : { channel: process.env.CHROME_CHANNEL || "chrome" }),
  headless: true,
  args: ["--enable-blink-features=CanvasDrawElement", "--enable-unsafe-webgpu",
    ...(process.platform === "darwin" ? ["--use-angle=metal"] : [])],
});

try {
  for (const deviceScaleFactor of [1, 2]) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 }, deviceScaleFactor,
      isMobile: true, hasTouch: true,
    });
    try {
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await page.setContent(`
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { margin: 0; width: 1000px; height: 2200px; }
          #source { position: fixed; left: 0; top: 0; width: 390px; height: 844px; }
          #content { width: 100%; height: 100%; overflow: auto; background: #def; }
          #stripes { position: absolute; top: 0; width: 100%; height: 20px;
            background: repeating-linear-gradient(to right, #fff 0 1px, #000 1px 2px); }
          #button { position: absolute; top: 40px; left: 40px; width: 60px; height: 30px; }
          #tail { height: 2200px; }
        </style>
        <canvas id="source" layoutsubtree><div id="content">
          <div id="stripes"></div><button id="button">Click</button><div id="tail"></div>
        </div></canvas>`);
      await page.addScriptTag({ content: `${helperJavaScript}
        const source = document.querySelector('#source');
        const content = document.querySelector('#content');
        const ctx = source.getContext('2d');
        window.viewportRegression = { clicks: 0, paints: 0, resizes: 0, errors: [] };
        document.querySelector('#button').onclick = () => viewportRegression.clicks++;
        prepareHtmlInCanvas(source, content);
        source.onpaint = () => {
          try { ctx.reset(); drawHtmlInCanvas(source, ctx, content); viewportRegression.paints++; }
          catch (error) { viewportRegression.errors.push(error.message); }
        };
        window.resizeObserver = createCanvasResizeObserver(() => {
          const density = getCanvasPixelRatio(source);
          source.width = Math.round(source.clientWidth * density);
          source.height = Math.round(source.clientHeight * density);
          viewportRegression.resizes++;
          source.requestPaint();
        });
        resizeObserver.observe(source);
      ` });
      await page.waitForFunction(() => window.viewportRegression.paints > 0);

      async function clickNativeButton() {
        const clicks = await page.evaluate(() => window.viewportRegression.clicks);
        const point = await page.locator("#button").evaluate((button) => {
          const rect = button.getBoundingClientRect();
          const x = rect.x + rect.width / 2;
          const y = rect.y + rect.height / 2;
          return {
            hit: document.elementFromPoint(x, y)?.id,
            x: x - visualViewport.offsetLeft, y: y - visualViewport.offsetTop,
          };
        });
        assert.equal(point.hit, "button");
        await page.mouse.click(point.x, point.y);
        assert.equal(await page.evaluate(() => window.viewportRegression.clicks), clicks + 1);
      }

      for (const scale of [1, 1.25, 2, 3, 1]) {
        await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: scale });
        const density = deviceScaleFactor * scale;
        await page.waitForFunction(({ width, height }) => {
          const source = document.querySelector("#source");
          return source.width === width && source.height === height;
        }, { width: Math.round(390 * density), height: Math.round(844 * density) });
        const before = await page.evaluate(() => {
          document.querySelector("#source").requestPaint();
          return window.viewportRegression.paints;
        });
        await page.waitForFunction((before) => window.viewportRegression.paints > before, before);
        const sample = await page.locator("#source").evaluate((canvas) => {
          const rect = document.querySelector("#button").getBoundingClientRect();
          const row = canvas.getContext("2d").getImageData(0, 3, 24, 1).data;
          let firstRun = 0;
          while (firstRun < 24 && row[firstRun * 4] === 255) firstRun++;
          return { css: [canvas.clientWidth, canvas.clientHeight],
            button: [rect.x, rect.y, rect.width, rect.height], firstRun };
        });
        assert.deepEqual(sample.css, [390, 844], "Pinch zoom must not reflow the capture subtree");
        assert.deepEqual(sample.button, [40, 40, 60, 30], "Native geometry must stay in CSS coordinates");
        if (Number.isInteger(density)) assert.equal(sample.firstRun, density,
          "One CSS pixel must capture the increased pixel density without double scaling");
        await clickNativeButton();
      }

      await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: 2 });
      await page.waitForFunction(() => document.querySelector("#source").width === 390 * devicePixelRatio * 2);
      await page.locator("#source").evaluate((source) => { source.style.pointerEvents = "none"; });
      await cdp.send("Input.synthesizeScrollGesture", {
        x: 50, y: 100, xDistance: 0, yDistance: -100, gestureSourceType: "touch",
      });
      await page.waitForFunction(() => visualViewport.offsetTop > 0);
      const paints = await page.evaluate(() => {
        const source = document.querySelector("#source");
        source.style.pointerEvents = "auto";
        document.querySelector("#button").style.top = "180px";
        source.requestPaint();
        return window.viewportRegression.paints;
      });
      await page.waitForFunction((paints) => window.viewportRegression.paints > paints, paints);
      await clickNativeButton();
      assert.deepEqual(await page.locator("#source").evaluate((canvas) => {
        const rect = canvas.getBoundingClientRect();
        return [rect.x, rect.y, rect.width, rect.height];
      }), [0, 0, 390, 844]);

      const bounded = await page.evaluate(() => [
        { clientWidth: 30_000, clientHeight: 1000 },
        { clientWidth: 10_000, clientHeight: 10_000 },
      ].map((element) => {
        const density = getCanvasPixelRatio(element);
        return { width: element.clientWidth * density, height: element.clientHeight * density };
      }));
      for (const { width, height } of bounded) {
        assert.ok(Math.max(width, height) <= 8192);
        assert.ok(width * height <= 16_777_216 + 1);
      }

      const driverLimits = await page.evaluate(() => [
        { texture: 2048, renderbuffer: 8192 },
        { texture: 4096, renderbuffer: 1024 },
      ].map(({ texture, renderbuffer }) => {
        const queried = [];
        const gl = {
          MAX_TEXTURE_SIZE: 0x0d33,
          MAX_RENDERBUFFER_SIZE: 0x84e8,
          getParameter(parameter) {
            queried.push(parameter);
            return parameter === this.MAX_TEXTURE_SIZE ? texture : renderbuffer;
          },
        };
        const first = getCanvasPixelRatio({ clientWidth: 2000, clientHeight: 1000 }, gl);
        const repeated = getCanvasPixelRatio({ clientWidth: 2000, clientHeight: 1000 }, gl);
        const portrait = getCanvasPixelRatio({ clientWidth: 1000, clientHeight: 2000 }, gl);
        return { dimensions: [2000 * first, 2000 * repeated, 2000 * portrait], queried };
      }));
      assert.deepEqual(driverLimits, [
        { dimensions: [2048, 2048, 2048], queried: [0x0d33, 0x84e8] },
        { dimensions: [1024, 1024, 1024], queried: [0x0d33, 0x84e8] },
      ]);

      const resizeCalls = await page.evaluate(async () => {
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        window.viewportRegression.resizes = 0;
        for (let i = 0; i < 5; i++) {
          window.dispatchEvent(new Event("resize"));
          visualViewport.dispatchEvent(new Event("resize"));
        }
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return window.viewportRegression.resizes;
      });
      assert.equal(resizeCalls, 1);
      const afterDisconnect = await page.evaluate(async () => {
        window.viewportRegression.resizes = 0;
        window.dispatchEvent(new Event("resize"));
        window.resizeObserver.disconnect();
        visualViewport.dispatchEvent(new Event("resize"));
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        return window.viewportRegression.resizes;
      });
      assert.equal(afterDisconnect, 0, "Disconnect must cancel queued work and remove viewport listeners");
      assert.deepEqual(await page.evaluate(() => window.viewportRegression.errors), []);
      console.log(`PASS native pinch zoom DPR ${deviceScaleFactor}: sharp capture, fractional scale, click, pan, allocation limits, cleanup`);
    } finally {
      await context.close();
    }
  }

  for (const renderer of ["webgl", "webgpu"]) {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 }, deviceScaleFactor: 2,
      isMobile: true, hasTouch: true,
    });
    try {
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (["warning", "error"].includes(message.type()) &&
          /webgpu|gpuvalidationerror|destroyed.*texture|texture.*destroyed|bind.?group/i.test(message.text())) {
          errors.push(message.text());
        }
      });
      await page.addInitScript((renderer) => localStorage.setItem("canvasui:renderer", renderer), renderer);
      await page.goto(new URL("/docs/components/glass", process.env.CANVAS_UI_URL || "http://localhost:3000").href, {
        waitUntil: "domcontentloaded", timeout: 90_000,
      });
      const selector = 'canvas[layoutsubtree]:has(> div), canvas[content="drawable"]:has(> div)';
      await page.waitForFunction((selector) => document.querySelector(selector)?.width === 780, selector);
      for (const scale of [1, 1.25, 2, 3, 1]) {
        await cdp.send("Emulation.setPageScaleFactor", { pageScaleFactor: scale });
        await page.waitForFunction(({ selector, scale }) => {
          const source = document.querySelector(selector);
          const output = source.parentElement.querySelector("canvas[aria-hidden]");
          return source.width === Math.round(780 * scale) && source.height === Math.round(1688 * scale) &&
            output.width === source.width && output.height === source.height;
        }, { selector, scale });
        await page.mouse.move(70, 140);
        await page.mouse.move(90, 180, { steps: 8 });
        await page.waitForFunction(({ selector, renderer }) => {
          const source = document.querySelector(selector);
          const output = source.parentElement.querySelector("canvas[aria-hidden]");
          if (!output.getContext(renderer === "webgpu" ? "webgpu" : "webgl2")) return false;
          const sample = document.createElement("canvas");
          sample.width = 128; sample.height = 256;
          const ctx = sample.getContext("2d");
          ctx.drawImage(output, 0, 0, 128, 256);
          const pixels = ctx.getImageData(0, 0, 128, 256).data;
          let occupied = 0;
          for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 8) occupied++;
          return occupied > 16;
        }, { selector, renderer }, { polling: "raf", timeout: 10_000 });
        assert.deepEqual(errors, [], `${renderer} at ${scale}x pinch zoom`);
      }
      await page.mouse.wheel(0, 400);
      await page.waitForFunction((selector) => document.querySelector(selector).firstElementChild.scrollTop > 0, selector);
      assert.deepEqual(errors, []);
      console.log(`PASS Glass ${renderer}: real pinch zoom 1→1.25→2→3→1, both buffers resize, effect remains visible, scrolling works`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
