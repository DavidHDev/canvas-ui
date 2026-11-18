// Run with `node scripts/test-liquid-prism.mjs`.
// Prerequisite: npm install --no-save --package-lock=false playwright esbuild
// Uses installed Chrome; CHROME_EXECUTABLE or CHROME_CHANNEL can override it.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const browser = await chromium.launch({
  ...(process.env.CHROME_EXECUTABLE
    ? { executablePath: process.env.CHROME_EXECUTABLE }
    : { channel: process.env.CHROME_CHANNEL || "chrome" }),
  headless: true,
  args: ["--enable-unsafe-webgpu"],
});

try {
  for (const backend of ["Vanilla", "WebGPU"]) {
    const file = path.join(root, `src/lib/Liquid/Liquid${backend}.ts`);
    let source = (await fs.readFile(file, "utf8")).replace(/\r\n/g, "\n");
    if (backend === "WebGPU") {
      source = source.replace("  let gpu: Gpu | null = null;", "  let testOutput: VgpuTarget | null = null;\n  let gpu: Gpu | null = null;");
      source = source.replace("gpuFrame(gpu, (f) => f.pass(screen!, effects!.display));", "effects!.display.draw(testOutput!);");
    }
    const marker = "  return {\n    splat(x, y, dx, dy) {";
    assert.ok(source.includes(marker), `Cannot instrument ${file}`);
    // Freeze time between renders so mode changes use exactly the same dye.
    // No test API is included in installed components.
    source = source.replace(marker, `  return {
    testReady: () => ${backend === "WebGPU" ? "Boolean(effects)" : "true"},
    testCompile: async () => {
      ${backend === "WebGPU" ? `testOutput = target(gpu!, { size: screen!.size, format: "rgba8unorm" });
      await Promise.all([
        effects!.display.compile(testOutput),
        effects!.splat.compile(fluidTargets!.velocity.write),
        effects!.splat.compile(fluidTargets!.dye.write),
        effects!.advect.compile(fluidTargets!.dye.write),
        effects!.advect.compile(fluidTargets!.velocity.write),
        effects!.clear.compile(fluidTargets!.pressure.write),
        effects!.divergence.compile(fluidTargets!.divergence),
        effects!.curl.compile(fluidTargets!.curl),
        effects!.vorticity.compile(fluidTargets!.velocity.write),
        effects!.pressure.compile(fluidTargets!.pressure.write),
        effects!.gradient.compile(fluidTargets!.velocity.write),
      ]);` : ""}
    },
    testFrame: () => frame(performance.now() + 16),
    testRender: async () => {
      render();
      ${backend === "WebGPU" ? "return Array.from(await testOutput!.read());" : ""}
    },
    splat(x, y, dx, dy) {`);
    const bundled = await build({
      stdin: { contents: source, resolveDir: path.dirname(file), loader: "ts" },
      bundle: true, format: "iife", globalName: "Engine", write: false,
    });

    for (const captured of [false, true]) {
      const context = await browser.newContext({ viewport: { width: 240, height: 160 } });
      try {
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        page.on("console", message => {
          if (["warning", "error"].includes(message.type()) &&
              /shader|WebGPU unavailable|validation|bind.?group/i.test(message.text())) {
            errors.push(message.text());
          }
        });
        await page.route("http://localhost/liquid-prism", route => route.fulfill({
          contentType: "text/html",
          body: `<style>body{margin:0}canvas{position:absolute;width:240px;height:160px}#source{visibility:hidden}</style><canvas id="source"></canvas><div id="content">Prism</div><canvas id="output"></canvas>`,
        }));
        await page.goto("http://localhost/liquid-prism");
        await page.evaluate(captured => {
          // Deterministic content bitmap exercises the captured-content shader
          // without requiring Chrome's experimental HTML-in-Canvas flag.
          window.requestAnimationFrame = () => 1;
          window.cancelAnimationFrame = () => {};
          if (captured) {
            const source = document.querySelector("#source");
            source.append(document.querySelector("#content"));
            source.getContext("2d").drawElementImage = function () {
              this.fillStyle = "#ded8cf";
              this.fillRect(0, 0, source.width, source.height);
              if (window.stripedContent) {
                this.fillStyle = "#000";
                this.fillRect(0, 0, source.width, source.height);
                this.fillStyle = "#fff";
                for (let x = 0; x < source.width; x += 16) {
                  this.fillRect(x, 0, 8, source.height);
                }
              }
            };
            source.requestPaint = () => source.onpaint?.();
          }
          if (typeof GPUAdapter !== "undefined") {
            const original = GPUAdapter.prototype.requestDevice;
            GPUAdapter.prototype.requestDevice = async function (...args) {
              const device = await original.apply(this, args);
              window.gpuErrors = [];
              device.addEventListener("uncapturederror", event => window.gpuErrors.push(event.error.message));
              return device;
            };
          }
        }, captured);
        await page.addScriptTag({ content: bundled.outputFiles[0].text });
        await page.evaluate(() => {
          window.liquid = Engine.createLiquid({
            source: document.querySelector("#source"),
            content: document.querySelector("#content"),
            output: document.querySelector("#output"),
          }, { simResolution: 32, dyeResolution: 64 });
        });
        await page.waitForFunction(() => window.liquid?.testReady(), null, { timeout: 15000, polling: 50 }).catch(error => {
          throw new Error(`${backend}: ${errors.join("; ") || error.message}`);
        });
        const result = await page.evaluate(async ({ captured, backend }) => {
          const liquid = window.liquid;
          await liquid.testCompile();
          const canvas = document.querySelector("#output");
          const copy = document.createElement("canvas");
          copy.width = canvas.width;
          copy.height = canvas.height;
          const ctx = copy.getContext("2d");
          const capture = async options => {
            liquid.setOptions(options);
            const pixels = await liquid.testRender();
            if (backend === "WebGPU") return pixels;
            ctx.clearRect(0, 0, copy.width, copy.height);
            ctx.drawImage(canvas, 0, 0);
            return Array.from(ctx.getImageData(0, 0, copy.width, copy.height).data);
          };
          const blank = await capture({ prism: true });
          liquid.splat(0.35, 0.5, 25, -12);
          liquid.splat(0.65, 0.5, -10, 18);
          liquid.testFrame();
          const prism = await capture({ prism: true, rainbow: false, color: [1, 0, 0] });
          const overridden = await capture({ rainbow: true, color: [0, 1, 0] });
          const rainbow = await capture({ prism: false });
          const fixed = await capture({ rainbow: false });
          const restored = await capture({ prism: true });
          const silent = await capture({ intensity: 0 });
          let blur = null;
          let transparent = null;
          if (captured) {
            window.stripedContent = true;
            document.querySelector("#source").requestPaint();
            const sharp = await capture({ distortion: 0 });
            const softened = await capture({ distortion: 0.8 });
            // A displaced single lookup keeps stripe interiors black/white.
            // Directional averaging must create broad intermediate shades.
            const midtones = pixels => {
              let count = 0;
              for (let y = 55; y < 105; y++) {
                for (let x = 65; x < 105; x++) {
                  const value = pixels[(y * copy.width + x) * 4];
                  if (value > 32 && value < 223) count++;
                }
              }
              return count;
            };
            blur = { sharp: midtones(sharp), softened: midtones(softened) };
            document.querySelector("#source").getContext("2d").drawElementImage = () => {};
            document.querySelector("#source").requestPaint();
            transparent = await capture({ intensity: 2 });
          }
          liquid.destroy();
          return { blank, prism, overridden, rainbow, fixed, restored, silent, blur, transparent, gpuErrors: window.gpuErrors ?? [] };
        }, { captured, backend });
        const label = `${backend} / ${captured ? "captured content" : "DOM overlay"}`;
        assert.ok(JSON.stringify(result.prism) === JSON.stringify(result.overridden), `${label}: prism must override rainbow and color`);
        assert.ok(JSON.stringify(result.prism) === JSON.stringify(result.restored), `${label}: prism can be restored live`);
        assert.ok(JSON.stringify(result.prism) !== JSON.stringify(result.rainbow), `${label}: prism must differ from rainbow`);
        assert.ok(JSON.stringify(result.prism) !== JSON.stringify(result.fixed), `${label}: prism must differ from fixed color`);
        assert.ok(JSON.stringify(result.prism) !== JSON.stringify(result.blank), `${label}: splats must produce a visible film`);
        assert.ok(JSON.stringify(result.silent) === JSON.stringify(result.blank), `${label}: zero intensity must remove the film`);
        if (!captured) assert.ok(result.blank.every(value => value === 0), `${label}: empty field must stay transparent`);
        if (captured) assert.ok(result.transparent.every(value => value === 0), `${label}: transparent content must stay transparent`);
        if (captured) assert.ok(result.blur.softened > result.blur.sharp + 200,
          `${label}: moving flow must blur stripe edges (${JSON.stringify(result.blur)})`);
        assert.deepEqual(result.gpuErrors, [], `${label}: GPU errors`);
        assert.deepEqual(errors, [], `${label}: browser errors`);
        console.log(`PASS ${label}: priority, live switching, visible film, zero intensity, transparency${captured ? `, directional blur (${result.blur.softened} softened pixels)` : ""}`);
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}
