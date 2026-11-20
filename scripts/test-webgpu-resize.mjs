import assert from "node:assert/strict";
import { chromium } from "playwright";

const baseUrl = process.env.CANVAS_UI_URL || "http://localhost:3000";
const sourceSelector = 'canvas[layoutsubtree]:has(> div), canvas[content="drawable"]:has(> div)';
const browser = await chromium.launch({
  ...(process.env.CHROME_EXECUTABLE
    ? { executablePath: process.env.CHROME_EXECUTABLE }
    : { channel: process.env.CHROME_CHANNEL || "chrome" }),
  headless: true,
  args: [
    "--enable-blink-features=CanvasDrawElement",
    "--enable-unsafe-webgpu",
    ...(process.platform === "darwin" ? ["--use-angle=metal"] : []),
  ],
});

try {
  for (const component of ["glass", "bubble", "blaze"]) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2,
    });
    try {
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("console", (message) => {
        if (["warning", "error"].includes(message.type()) &&
          /webgpu|gpuvalidationerror|destroyed.*texture|texture.*destroyed|bind.?group|command.?encoder/i.test(message.text())) {
          errors.push(message.text());
        }
      });
      await page.addInitScript(() => {
        localStorage.setItem("canvasui:renderer", "webgpu");
        window.gpuRegression = { devices: 0, captures: 0, errors: [] };
        const draw = CanvasRenderingContext2D.prototype.drawElementImage;
        if (draw) {
          CanvasRenderingContext2D.prototype.drawElementImage = function (...args) {
            try {
              const result = draw.apply(this, args);
              window.gpuRegression.captures++;
              return result;
            } catch (error) {
              window.gpuRegression.errors.push(error.message);
              throw error;
            }
          };
        }
        if (typeof GPUAdapter !== "undefined") {
          const requestDevice = GPUAdapter.prototype.requestDevice;
          GPUAdapter.prototype.requestDevice = async function (...args) {
            const device = await requestDevice.apply(this, args);
            window.gpuRegression.devices++;
            device.addEventListener("uncapturederror", (event) => {
              window.gpuRegression.errors.push(event.error.message);
            });
            return device;
          };
        }
      });
      await page.goto(new URL(`/docs/components/${component}`, baseUrl).href, {
        waitUntil: "domcontentloaded", timeout: 90_000,
      });
      await page.waitForFunction(() => window.gpuRegression.devices > 0 && window.gpuRegression.captures > 0);
      const source = page.locator(sourceSelector).first();

      async function assertNoErrors() {
        assert.deepEqual(await page.evaluate(() => window.gpuRegression.errors), [], `${component}: native capture / WebGPU errors`);
        assert.deepEqual(errors, [], `${component}: browser errors`);
      }

      for (const width of [1280, 390, 1280]) {
        const previousCaptures = await page.evaluate(() => window.gpuRegression.captures);
        await page.setViewportSize({ width, height: 800 });
        await source.evaluate((canvas) => {
          canvas.firstElementChild.scrollTop = 0;
          canvas.requestPaint();
        });
        await page.waitForFunction(({ selector, previous }) => {
          const canvas = document.querySelector(selector);
          return canvas.width === Math.round(canvas.clientWidth * devicePixelRatio) &&
            window.gpuRegression.captures > previous;
        }, { selector: sourceSelector, previous: previousCaptures });

        const point = { x: width === 390 ? 220 : 850, y: 400 };
        assert.equal(await source.evaluate((canvas, point) =>
          canvas.firstElementChild.contains(document.elementFromPoint(point.x, point.y)), point), true,
        `${component} at ${width}px: native content must receive pointer input`);
        await page.mouse.move(point.x - 80, point.y - 50);
        await page.mouse.move(point.x, point.y, { steps: 8 });

        await page.waitForFunction((selector) => {
          const canvas = document.querySelector(selector);
          const output = canvas.parentElement.querySelector("canvas[aria-hidden]");
          if (!output?.getContext("webgpu")) return false;
          const sample = document.createElement("canvas");
          sample.width = 256;
          sample.height = Math.max(1, Math.round(output.height / output.width * 256));
          const ctx = sample.getContext("2d");
          ctx.drawImage(output, 0, 0, sample.width, sample.height);
          const pixels = ctx.getImageData(0, 0, sample.width, sample.height).data;
          let occupied = 0;
          for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 8) occupied++;
          return occupied > 16;
        }, sourceSelector, { timeout: 10_000, polling: "raf" });
        await assertNoErrors();

        const beforeScroll = await source.evaluate((canvas) => canvas.firstElementChild.scrollTop);
        await page.mouse.wheel(0, 550);
        await page.waitForFunction(({ selector, before }) =>
          document.querySelector(selector).firstElementChild.scrollTop > before,
        { selector: sourceSelector, before: beforeScroll });
        await assertNoErrors();
        console.log(`PASS Chrome ${browser.version()} ${component} WebGPU ${width}px DPR 2: visible effect, native wheel scrolling, no GPU errors`);
      }
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
