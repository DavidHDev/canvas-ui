// Run with `node scripts/test-android-fallback.mjs`.
// Prerequisite: npm install --no-save --package-lock=false playwright esbuild
// Desktop Chrome with an Android identity verifies the fallback policy, not
// Android's GPU driver or the original renderer-process crash.
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";

const root = path.resolve(import.meta.dirname, "..");
const engines = [];
for (const directory of await readdir(path.join(root, "src/lib"), { withFileTypes: true })) {
  if (!directory.isDirectory()) continue;
  for (const flavor of ["Vanilla", "WebGPU"]) {
    const name = `${directory.name}${flavor}`;
    const file = `./src/lib/${directory.name}/${name}.ts`;
    const source = await readFile(path.join(root, file), "utf8").catch(() => "");
    if (source.includes("export function supportsHtmlInCanvas")) engines.push({ name, file });
  }
}
assert.equal(engines.length, 58, "Include every HTML-in-Canvas engine in the policy regression");
const bundle = await build({
  stdin: {
    contents: engines.map(({ name, file }) => `import * as ${name} from ${JSON.stringify(file)};`).join("\n") +
      `\nwindow.engines = { ${engines.map(({ name }) => name).join(", ")} };`,
    resolveDir: root,
  },
  bundle: true, format: "iife", write: false,
});

const browser = await chromium.launch({
  ...(process.env.CHROME_EXECUTABLE
    ? { executablePath: process.env.CHROME_EXECUTABLE }
    : { channel: process.env.CHROME_CHANNEL || "chrome" }),
  headless: true,
  args: ["--enable-blink-features=CanvasDrawElement", "--enable-unsafe-webgpu",
    ...(process.platform === "darwin" ? ["--use-angle=metal"] : [])],
});
const android = "Mozilla/5.0 (Linux; Android 16; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/155.0.8059.39 Mobile Safari/537.36";

try {
  for (const profile of ["android-ua", "android-client-hints", "desktop"]) {
    const context = await browser.newContext({
      viewport: { width: 412, height: 915 }, deviceScaleFactor: 3,
      isMobile: true, hasTouch: true,
      ...(profile === "android-ua" ? { userAgent: android } : {}),
    });
    try {
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("crash", () => errors.push("Renderer crashed"));
      page.on("console", message => {
        if (["warning", "error"].includes(message.type()) && /webgpu|gpuvalidationerror|shader error/i.test(message.text())) {
          errors.push(message.text());
        }
      });
      await page.route("http://localhost/android-fallback", route => route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1">
          <style>body{margin:0}#host{position:relative;width:320px;height:240px}
          #source,#output{position:absolute;inset:0;width:100%;height:100%}
          #output{pointer-events:none}#content{position:relative;width:100%;height:100%;overflow:auto;background:rgb(12,34,56);color:white}
          #tail{height:1000px}</style><div id="host"><canvas id="source"></canvas>
          <div id="content"><button id="button">Still clickable</button><div id="tail">Still scrollable</div></div>
          <canvas id="output"></canvas></div>`,
      }));
      await page.goto("http://localhost/android-fallback");
      await page.evaluate(profile => {
        Object.defineProperty(navigator, "userAgentData", { configurable: true,
          value: profile === "android-client-hints" ? { platform: "Android" } : undefined });
        window.captureCalls = 0;
        window.paintRequests = 0;
        window.gpuContexts = 0;
        window.gpuErrors = [];
        window.outputVisible = false;
        window.clicks = 0;
        const draw = CanvasRenderingContext2D.prototype.drawElementImage;
        if (typeof draw !== "function" || typeof HTMLCanvasElement.prototype.requestPaint !== "function") {
          throw new Error("Test requires a real native HTML-in-Canvas implementation");
        }
        CanvasRenderingContext2D.prototype.drawElementImage = function (...args) {
          window.captureCalls++;
          return draw.apply(this, args);
        };
        const requestPaint = HTMLCanvasElement.prototype.requestPaint;
        HTMLCanvasElement.prototype.requestPaint = function (...args) {
          window.paintRequests++;
          return requestPaint.apply(this, args);
        };
        const getContext = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type, ...args) {
          if (["webgl2", "webgpu"].includes(type)) window.gpuContexts++;
          return getContext.call(this, type, ...args);
        };
        const requestDevice = GPUAdapter.prototype.requestDevice;
        GPUAdapter.prototype.requestDevice = async function (...args) {
          const device = await requestDevice.apply(this, args);
          device.addEventListener("uncapturederror", event => window.gpuErrors.push(event.error.message));
          return device;
        };
        // A WebGPU presentation texture may be cleared after compositing. Read
        // just after submission, while the rendered texture is still current.
        const submit = GPUQueue.prototype.submit;
        GPUQueue.prototype.submit = function (...args) {
          const result = submit.apply(this, args);
          const output = document.querySelector("#output");
          const sample = document.createElement("canvas");
          sample.width = 32; sample.height = 24;
          const ctx = sample.getContext("2d");
          ctx.drawImage(output, 0, 0, 32, 24);
          window.outputVisible ||= ctx.getImageData(0, 0, 32, 24).data
            .some((value, index) => index % 4 === 3 && value > 8);
          return result;
        };
      }, profile);
      await page.addScriptTag({ content: bundle.outputFiles[0].text });
      const support = await page.evaluate(() => Object.values(window.engines).map(engine => engine.supportsHtmlInCanvas()));
      assert.deepEqual(support, engines.map(() => profile === "desktop"), `${profile}: all engines must agree`);

      // A native-capable browser can still have sibling fallback content, e.g.
      // the first React effect during hydration or after native-init failure.
      for (const layout of profile === "desktop" ? ["fallback", "native"] : ["fallback", "capture-child"]) {
        for (const component of ["Bend", "Blaze"]) {
          for (const flavor of ["Vanilla", "WebGPU"]) {
            const native = layout === "native";
            const label = `${profile} ${layout} ${component} ${flavor}`;
            await page.evaluate(({ component, flavor, layout }) => {
              const host = document.querySelector("#host");
              host.innerHTML = `<canvas id="source"></canvas><div id="content"><button id="button">Still clickable</button><div id="tail">Still scrollable</div></div><canvas id="output"></canvas>`;
              const source = document.querySelector("#source");
              const content = document.querySelector("#content");
              const output = document.querySelector("#output");
              if (layout !== "fallback") source.append(content);
              else source.style.display = "none";
              window.captureCalls = window.paintRequests = window.gpuContexts = 0;
              window.outputVisible = false;
              document.querySelector("#button").onclick = () => window.clicks++;
              window.instance = engines[`${component}${flavor}`][`create${component}`]({ source, content, output });
            }, { component, flavor, layout });
            if (component === "Bend" && !native) {
              assert.equal(await page.evaluate(() => window.instance), null, label);
              assert.equal(await page.evaluate(() => window.gpuContexts), 0, `${label}: no unnecessary GPU context`);
            } else {
              assert.equal(await page.evaluate(() => Boolean(window.instance)), true, label);
              await page.waitForFunction(() => {
                if (window.outputVisible) return true;
                const canvas = document.querySelector("#output");
                const sample = document.createElement("canvas");
                sample.width = 32; sample.height = 24;
                const ctx = sample.getContext("2d");
                ctx.drawImage(canvas, 0, 0, 32, 24);
                const pixels = ctx.getImageData(0, 0, 32, 24).data;
                return pixels.some((value, index) => index % 4 === 3 && value > 8);
              }, {}, { polling: "raf", timeout: 15_000 }).catch(async error => {
                console.error(label, errors, await page.evaluate(() => ({
                  captures: window.captureCalls, requests: window.paintRequests,
                  contexts: window.gpuContexts,
                  gpuErrors: window.gpuErrors,
                  output: document.querySelector("#output").outerHTML,
                })));
                throw error;
              });
            }
            if (native) {
              assert.ok(await page.evaluate(() => window.captureCalls > 0), `${label}: native capture retained`);
            } else {
              assert.equal(await page.evaluate(() => window.captureCalls), 0, `${label}: never invoke native capture`);
              assert.equal(await page.evaluate(() => window.paintRequests), 0, `${label}: never request native painting`);
              assert.equal(await page.locator("#source").getAttribute("content"), null, `${label}: no drawable subtree`);
            }
            if (layout === "fallback") {
              const before = await page.evaluate(() => window.clicks);
              await page.locator("#button").click();
              assert.equal(await page.evaluate(() => window.clicks), before + 1, `${label}: HTML clickable`);
              await page.mouse.move(80, 100);
              await page.mouse.wheel(0, 180);
              await page.waitForFunction(() => document.querySelector("#content").scrollTop > 0);
            }
            await page.evaluate(() => { window.instance?.destroy(); window.instance = null; });
            assert.deepEqual(errors, [], label);
            assert.deepEqual(await page.evaluate(() => window.gpuErrors), [], label);
            console.log(`PASS ${label}`);
          }
        }
      }
    } finally {
      await context.close();
    }
  }
  console.log(`PASS ${engines.length} engines: Android UA/client hints policy; real native-enabled fallback and desktop capture`);
} finally {
  await browser.close();
}
