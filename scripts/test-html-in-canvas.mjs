import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";
import ts from "typescript";

const helperSource = await readFile(
  new URL("../src/lib/html-in-canvas.ts", import.meta.url),
  "utf8",
);
const helperJavaScript = ts.transpileModule(helperSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText.replace(/^export /gm, "");

const fixture = `<!doctype html>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; min-height: 1600px; }
  #host { position: relative; margin: 20px; width: min(480px, calc(100vw - 40px)); height: 320px; }
  #source { position: absolute; inset: 0; width: 100%; height: 100%; }
  #content { position: relative; width: 100%; height: 100%; overflow: auto; background: rgb(12, 34, 56); }
  #button { position: absolute; top: 32px; right: 24px; width: 120px; height: 44px; }
  #tall { height: 1200px; }
</style>
<div id="host">
  <canvas id="source" layoutsubtree="true">
    <div id="content" tabindex="0">
      <button id="button">Click me</button>
      <div id="tall"></div>
    </div>
  </canvas>
</div>`;

const helpers = await import(`data:text/javascript,${encodeURIComponent(ts.transpileModule(helperSource, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText)}`);
for (const drawable of [false, true]) {
  const attributes = new Map();
  const contentAttributes = new Map();
  const canvas = { setAttribute: (key, value) => attributes.set(key, value) };
  if (drawable) canvas.content = "";
  helpers.prepareHtmlInCanvas(canvas, {
    setAttribute: (key, value) => contentAttributes.set(key, value),
  });
  assert.equal(attributes.has(drawable ? "content" : "layoutsubtree"), true);
  if (drawable) {
    assert.equal(attributes.get("content"), "drawable");
    assert.equal(contentAttributes.has("drawable"), true);
  }
}
for (const returnsTransform of [false, true]) {
  for (const hasGeometryMethod of [false, true]) {
    const content = {};
    const transform = { a: 2, d: 2, e: 0, f: 0 };
    const calls = [];
    const source = hasGeometryMethod ? {
      updateElementGeometry(element, options) { calls.push([element, options.canvasTransform]); },
    } : {};
    helpers.drawHtmlInCanvas(source, {
      drawElementImage(element, x, y) {
        assert.equal(element, content);
        assert.deepEqual([x, y], [0, 0]);
        return returnsTransform ? transform : undefined;
      },
    }, content);
    assert.deepEqual(calls, returnsTransform && hasGeometryMethod ? [[content, transform]] : []);
  }
}

for (const mode of [
  { name: "native", native: true, flag: "--enable-blink-features=CanvasDrawElement" },
  { name: "automatic geometry", native: true, flag: "--enable-blink-features=CanvasDrawElement,ElementCanvasTransform" },
  { name: "fallback", native: false, flag: "--disable-blink-features=CanvasDrawElement" },
]) {
  const { native } = mode;
  const browser = await chromium.launch({
    ...(process.env.CHROME_EXECUTABLE
      ? { executablePath: process.env.CHROME_EXECUTABLE }
      : { channel: process.env.CHROME_CHANNEL || "chrome" }),
    headless: true,
    args: [mode.flag],
  });
  try {
    for (const deviceScaleFactor of [1, 2]) {
      const context = await browser.newContext({
        viewport: { width: 900, height: 700 }, deviceScaleFactor,
      });
      try {
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.setContent(fixture);
        await page.addScriptTag({ content: `${helperJavaScript}
          const source = document.querySelector('#source');
          const content = document.querySelector('#content');
          const button = document.querySelector('#button');
          const ctx = source.getContext('2d');
          const native = typeof ctx.drawElementImage === 'function' && typeof source.requestPaint === 'function';
          window.fixture = { native, clicks: 0, paints: 0, paintErrors: [] };
          button.addEventListener('click', () => window.fixture.clicks++);
          if (native) {
            prepareHtmlInCanvas(source, content);
            source.onpaint = () => {
              try {
                ctx.reset();
                drawHtmlInCanvas(source, ctx, content);
                window.fixture.paints++;
              } catch (error) { window.fixture.paintErrors.push(error.message); }
            };
            new ResizeObserver(() => {
              source.width = Math.round(source.clientWidth * devicePixelRatio);
              source.height = Math.round(source.clientHeight * devicePixelRatio);
              source.requestPaint();
            }).observe(source);
          } else {
            source.after(content);
            source.style.display = 'none';
          }
        ` });
        assert.equal(await page.evaluate(() => window.fixture.native), native,
          `Expected ${native ? "native CanvasDrawElement" : "DOM fallback"} mode in ${browser.version()}`);
        if (native) await page.waitForFunction(() => window.fixture.paints > 0);

        async function waitForScrollSettled() {
          await page.locator('#content').evaluate((content) => new Promise((resolve) => {
            let timer;
            function settled() {
              content.removeEventListener('scroll', onScroll);
              resolve();
            }
            function onScroll() {
              clearTimeout(timer);
              timer = setTimeout(settled, 120);
            }
            content.addEventListener('scroll', onScroll);
            onScroll();
          }));
        }

        async function verifyVisibleAndClickable(width) {
          await page.setViewportSize({ width, height: 700 });
          await page.evaluate(() => { window.scrollTo(0, 0); document.querySelector('#content').scrollTop = 0; });
          await page.waitForFunction(() => {
            const source = document.querySelector('#source');
            return !window.fixture.native || source.width === Math.round(source.clientWidth * devicePixelRatio);
          });
          if (native) {
            const painted = await page.evaluate(() => {
              const painted = window.fixture.paints;
              document.querySelector('#source').requestPaint();
              return painted;
            });
            await page.waitForFunction((painted) => window.fixture.paints > painted, painted);
            const pixel = await page.evaluate(() => Array.from(document.querySelector('#source')
              .getContext('2d').getImageData(8 * devicePixelRatio, 8 * devicePixelRatio, 1, 1).data));
            assert.deepEqual(pixel, [12, 34, 56, 255], "Native HTML must actually be captured");
          }
          const point = await page.locator('#button').evaluate((button) => {
            const rect = button.getBoundingClientRect();
            return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
          });
          assert.equal(await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.id, point),
            "button", `Painted button must remain in the native hit-test region (${JSON.stringify({ point, width, deviceScaleFactor, native })})`);
          const clicks = await page.evaluate(() => window.fixture.clicks);
          await page.mouse.click(point.x, point.y);
          assert.equal(await page.evaluate(() => window.fixture.clicks), clicks + 1);
          await page.keyboard.press("Enter");
          assert.equal(await page.evaluate(() => window.fixture.clicks), clicks + 2,
            "Clicked native button must accept keyboard activation");
          await page.mouse.move(80, 170);
          await page.mouse.wheel(0, 240);
          await page.waitForFunction(() => document.querySelector('#content').scrollTop > 0);
          await waitForScrollSettled();
          const beforeKeyboard = await page.locator('#content').evaluate((content) => content.scrollTop);
          await page.locator('#content').focus();
          await page.keyboard.press("PageDown");
          await page.waitForFunction((before) => document.querySelector('#content').scrollTop > before, beforeKeyboard);
          await waitForScrollSettled();
        }

        await verifyVisibleAndClickable(900);
        await verifyVisibleAndClickable(360);
        assert.deepEqual(await page.evaluate(() => window.fixture.paintErrors), []);
        assert.deepEqual(errors, []);
        console.log(`PASS Chrome ${browser.version()} ${mode.name} DPR ${deviceScaleFactor}: pixels, hit testing, click, keyboard, wheel, resize`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}
