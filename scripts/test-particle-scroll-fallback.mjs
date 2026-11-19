import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, devices, webkit } from "playwright";

const baseUrl = process.env.CANVAS_UI_URL || "http://localhost:3000";
const screenshots = await mkdtemp(join(tmpdir(), "particle-scroll-fallback-"));

async function instrument(page, renderer, rejectGpu = false) {
  await page.addInitScript(({ renderer, rejectGpu }) => {
    localStorage.setItem("canvasui:renderer", renderer);
    window.particleFallback = { gpuContexts: 0, adapters: 0, captures: 0, tapped: false };
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      if (["webgl", "webgl2", "webgpu"].includes(type)) {
        window.particleFallback.gpuContexts++;
        if (rejectGpu) return null;
      }
      return getContext.call(this, type, ...args);
    };
    if (navigator.gpu) {
      const requestAdapter = navigator.gpu.requestAdapter.bind(navigator.gpu);
      navigator.gpu.requestAdapter = (...args) => {
        window.particleFallback.adapters++;
        if (rejectGpu) return Promise.resolve(null);
        return requestAdapter(...args);
      };
    }
    const draw = CanvasRenderingContext2D.prototype.drawElementImage;
    if (draw) {
      CanvasRenderingContext2D.prototype.drawElementImage = function (...args) {
        const result = draw.apply(this, args);
        window.particleFallback.captures++;
        return result;
      };
    }
  }, { renderer, rejectGpu });
}

async function checkPage(context, name, { renderer, native = false, rejectGpu = false, mobile = false }) {
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await instrument(page, renderer, rejectGpu);
  await page.goto(new URL("/playground?c=particle-scroll", baseUrl).href, {
    waitUntil: "domcontentloaded", timeout: 90_000,
  });
  const host = page.locator(".page-enter").first();
  const heading = host.locator("h1").first();
  await heading.waitFor({ state: "visible" });
  const output = host.locator("canvas[aria-hidden]");
  if (native) {
    await page.waitForFunction(() => window.particleFallback.captures > 0);
    assert.equal(await output.isVisible(), true, `${name}: native output must remain visible`);
  } else {
    await page.waitForFunction(() => {
      const canvas = document.querySelector(".page-enter canvas[aria-hidden]");
      return canvas && getComputedStyle(canvas).display === "none";
    });
    assert.equal(await output.isVisible(), false, `${name}: no GPU overlay over the fallback`);
  }
  const content = native ? host.locator("canvas > div").first() : host.locator(":scope > div").first();
  assert.equal(await content.evaluate((element) => element.contains(document.querySelector(".page-enter h1"))), true);
  await heading.evaluate((element) => element.addEventListener("click", () => { window.particleFallback.tapped = true; }));
  if (mobile) await heading.tap();
  else await heading.click();
  assert.equal(await page.evaluate(() => window.particleFallback.tapped), true, `${name}: content accepts input`);

  await page.screenshot({ path: join(screenshots, `${name}.png`) });
  if (mobile) {
    await content.evaluate((element) => { element.scrollTop = 500; });
  } else {
    const rect = await content.boundingBox();
    await page.mouse.move(rect.x + rect.width * 0.65, rect.y + rect.height * 0.5);
    await page.mouse.wheel(0, 500);
  }
  await page.waitForFunction((selector) => document.querySelector(selector)?.scrollTop > 0,
    native ? ".page-enter canvas > div" : ".page-enter > div");
  const state = await page.evaluate(() => window.particleFallback);
  if (!native && !rejectGpu) {
    assert.equal(state.gpuContexts, 0, `${name}: plain HTML needs no GPU context`);
    assert.equal(state.adapters, 0, `${name}: plain HTML needs no GPU adapter`);
  }
  if (rejectGpu) assert.ok(state.gpuContexts > 0 || state.adapters > 0, `${name}: the native GPU failure was exercised`);
  assert.deepEqual(errors, [], `${name}: browser errors`);
  console.log(`PASS ${name}: visible content, input, scrolling; ${JSON.stringify(state)}`);
  await page.close();
}

const safari = await webkit.launch();
try {
  for (const mobile of [false, true]) {
    for (const renderer of ["webgl", "webgpu"]) {
      const context = await safari.newContext(mobile
        ? devices["iPhone 12"]
        : { viewport: { width: 1280, height: 800 } });
      try {
        await checkPage(context, `webkit-${mobile ? "iphone" : "desktop"}-${renderer}`, { renderer, mobile });
      } finally { await context.close(); }
    }
  }
} finally { await safari.close(); }

const chrome = await chromium.launch({
  ...(process.env.CHROME_EXECUTABLE
    ? { executablePath: process.env.CHROME_EXECUTABLE }
    : { channel: process.env.CHROME_CHANNEL || "chrome" }),
  headless: true,
  args: ["--enable-blink-features=CanvasDrawElement", "--enable-unsafe-webgpu",
    ...(process.platform === "darwin" ? ["--use-angle=metal"] : [])],
});
try {
  for (const renderer of ["webgl", "webgpu"]) {
    const context = await chrome.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    try { await checkPage(context, `chrome-native-${renderer}`, { renderer, native: true }); }
    finally { await context.close(); }
  }
  for (const renderer of ["webgl", "webgpu"]) {
    const context = await chrome.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
    try {
      await checkPage(context, `chrome-rejected-${renderer}`, {
        renderer, native: renderer === "webgpu", rejectGpu: true,
      });
    } finally { await context.close(); }
  }
} finally { await chrome.close(); }
console.log(`Screenshots: ${screenshots}`);
