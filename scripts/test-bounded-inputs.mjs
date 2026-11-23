import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";

const browser = await chromium.launch({
  ...(process.env.CHROME_EXECUTABLE
    ? { executablePath: process.env.CHROME_EXECUTABLE }
    : { channel: process.env.CHROME_CHANNEL || "chrome" }),
  headless: true,
  args: ["--disable-blink-features=CanvasDrawElement", "--enable-unsafe-webgpu", "--use-angle=metal"],
});

try {
  for (const component of ["Liquid", "Frost"]) {
    for (const renderer of ["Vanilla", "WebGPU"]) {
      const file = `src/lib/${component}/${component}${renderer}.ts`;
      let source = process.env.SOURCE_REF
        ? execFileSync("git", ["show", `${process.env.SOURCE_REF}:${file}`], { encoding: "utf8" })
        : await readFile(file, "utf8");
      source = source.replaceAll("\r\n", "\n");
      const liquid = component === "Liquid";
      const queue = liquid ? "queued" : "queuedMelts";
      const method = liquid ? "splat" : "melt";
      const limit = liquid ? 64 : 32;
      const perFrame = liquid ? 8 : 4;
      const ready = renderer === "Vanilla" ? "true"
        : liquid ? "Boolean(gpu && effects && fluidTargets)"
          : "Boolean(gpu && targetsReady && pointerFx)";
      // Observe the real engine's private queue and GPU work, only in this test
      // bundle. No diagnostic API is included in installed components.
      source = source.replace("  function frame(now: number) {", "  function frame(now: number) { globalThis.testFrame++;");
      if (liquid) {
        source = source.replace(
          "  function applySplat(x: number, y: number, dx: number, dy: number, fromX = x, fromY = y) {",
          "  function applySplat(x: number, y: number, dx: number, dy: number, fromX = x, fromY = y) { globalThis.applied.push({ frame: globalThis.testFrame, input: [x,y,dx,dy] });",
        );
      } else {
        source = source.replace("const [mx, my] = queuedMelts.shift()!;", "const [mx, my] = queuedMelts.shift()!; globalThis.applied.push({ frame: globalThis.testFrame, input: [mx,my] });");
        source = source.replace("for (const [mx, my] of queuedMelts) {", "for (const [mx, my] of queuedMelts) { globalThis.applied.push({ frame: globalThis.testFrame, input: [mx,my] });");
      }
      const marker = `  return {\n    ${method}(x, y`;
      assert.ok(source.includes(marker), `Cannot instrument ${file}`);
      source = source.replace(marker, `  return {\n    inspect: () => ({ queued: ${queue}.map(input => [...input]), pointerCount: ${liquid ? "typeof pointerSplats === 'undefined' ? 0 : pointerSplats.size" : "Number(pointerOn)"}, running, visible, destroyed, ready: ${ready} }),\n    ${method}(x, y`);
      const bundled = await build({
        stdin: { contents: source, resolveDir: path.resolve(path.dirname(file)), loader: "ts" },
        bundle: true, format: "iife", globalName: "Engine", write: false,
      });
      const context = await browser.newContext({ viewport: { width: 420, height: 320 } });
      try {
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", error => errors.push(error.message));
        page.on("console", message => {
          if (["error", "warning"].includes(message.type())) errors.push(message.text());
        });
        await page.route("http://localhost/bounded-inputs", route => route.fulfill({
          contentType: "text/html",
          body: `<style>body{margin:0}#host{position:relative;width:200px;height:120px}#source{display:none}#output{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}</style><div id="host"><canvas id="source"></canvas><div id="content">Input stress test</div><canvas id="output"></canvas></div>`,
        }));
        await page.goto("http://localhost/bounded-inputs");
        await page.evaluate(() => {
          window.applied = [];
          window.testFrame = 0;
          window.testHidden = false;
          Object.defineProperty(document, "hidden", { configurable: true, get: () => window.testHidden });
          const frames = new Map();
          let nextFrame = 0;
          window.requestAnimationFrame = callback => { frames.set(++nextFrame, callback); return nextFrame; };
          window.cancelAnimationFrame = id => frames.delete(id);
          window.flushFrame = () => {
            const callbacks = [...frames.values()];
            frames.clear();
            callbacks.forEach(callback => callback(performance.now()));
          };
          window.IntersectionObserver = class {
            constructor(callback) { this.callback = callback; }
            observe(target) {
              if (target.id === "output") window.setVisible = visible => this.callback([{ isIntersecting: visible }]);
            }
            disconnect() {}
          };
          window.setHidden = hidden => {
            window.testHidden = hidden;
            document.dispatchEvent(new Event("visibilitychange"));
          };
        });
        await page.addScriptTag({ content: bundled.outputFiles[0].text });
        await page.evaluate(component => {
          const options = component === "Liquid"
            ? { simResolution: 16, dyeResolution: 32, pressureIterations: 1 }
            : { quality: 0.25, introDuration: 0, shimmer: 0 };
          window.instance = Engine[`create${component}`]({
            source: document.querySelector("#source"),
            content: document.querySelector("#content"),
            output: document.querySelector("#output"),
          }, options);
        }, component);
        await page.waitForFunction(() => window.instance?.inspect().ready, null, { polling: 50 });

        // Ten thousand explicit calls made offscreen stay bounded, survive
        // suspension, and resume in FIFO order over multiple capped frames.
        const offscreen = await page.evaluate(({ method }) => {
          setVisible(false);
          for (let i = 0; i < 10000; i++) instance[method](i / 10000, 0.5, 1, 1);
          return instance.inspect();
        }, { method });
        assert.equal(offscreen.queued.length, limit, `${file}: imperative queue must be bounded`);
        assert.equal(offscreen.running, false);
        assert.equal(offscreen.queued[0][0], (10000 - limit) / 10000);
        await page.evaluate(() => setVisible(true));
        for (let i = 0; i < limit / perFrame; i++) {
          const applied = await page.evaluate(() => {
            const before = window.applied.length;
            flushFrame();
            return window.applied.slice(before);
          });
          assert.equal(applied.length, perFrame, `${file}: per-frame work cap`);
        }
        assert.equal(await page.evaluate(() => instance.inspect().queued.length), 0);
        assert.deepEqual(await page.evaluate(() => applied.map(item => item.input[0])),
          Array.from({ length: limit }, (_, i) => (10000 - limit + i) / 10000));

        // A background tab cancels existing work immediately but retains
        // explicitly requested API input. Unhiding cannot override offscreen.
        const hidden = await page.evaluate(({ method }) => {
          setHidden(true);
          for (let i = 0; i < 10000; i++) instance[method](0.5, 0.5, 1, 1);
          const result = instance.inspect();
          setVisible(false);
          setHidden(false);
          return { result, afterUnhide: instance.inspect() };
        }, { method });
        assert.equal(hidden.result.queued.length, limit);
        assert.equal(hidden.result.running, false);
        assert.equal(hidden.afterUnhide.running, false);
        await page.evaluate(() => setVisible(true));
        for (let i = 0; i < limit / perFrame; i++) await page.evaluate(() => flushFrame());

        if (liquid) {
          const drag = await page.evaluate(() => {
            const host = document.querySelector("#host");
            host.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerId: 7, clientX: 10, clientY: 20 }));
            for (let i = 0; i < 1000; i++) host.dispatchEvent(new PointerEvent("pointermove", {
              bubbles: true, pointerId: 7, clientX: 10 + i * 0.1, clientY: 20,
            }));
            const pending = instance.inspect();
            const before = applied.length;
            flushFrame();
            return { pending, applied: applied.slice(before) };
          });
          assert.equal(drag.pending.pointerCount, 1, "Fast drags must coalesce into one current splat");
          assert.equal(drag.applied.length, 1);
          assert.ok(Math.abs(drag.applied[0].input[0] - 109.9 / 200) < 1e-6);

          const simultaneous = await page.evaluate(() => {
            for (let i = 0; i < 10; i++) instance.splat(0.5, 0.5, 1, 1);
            for (let id = 10; id < 26; id++) document.querySelector("#host").dispatchEvent(new PointerEvent("pointerdown", {
              bubbles: true, pointerId: id, clientX: 40, clientY: 30,
            }));
            const pending = instance.inspect();
            const before = applied.length;
            flushFrame();
            return { pending, after: instance.inspect(), applied: applied.slice(before) };
          });
          assert.equal(simultaneous.pending.pointerCount, 8, "Pointer input also has a fixed storage bound");
          assert.equal(simultaneous.applied.length, 8, "API and pointer input share the frame budget");
          assert.equal(simultaneous.after.queued.length, 9, "Pointer input must leave budget for API input");
        }

        const suspendedPointer = await page.evaluate(() => {
          setHidden(true);
          for (let i = 0; i < 1000; i++) document.querySelector("#host").dispatchEvent(new PointerEvent("pointermove", {
            bubbles: true, pointerId: 8, clientX: 20 + i % 100, clientY: 20,
          }));
          return instance.inspect();
        });
        assert.equal(suspendedPointer.pointerCount, 0);
        assert.equal(suspendedPointer.running, false);
        const destroyed = await page.evaluate(({ method }) => {
          instance.destroy();
          for (let i = 0; i < 10000; i++) instance[method](0.5, 0.5, 1, 1);
          instance.resize();
          instance.setOptions({ quality: 0.5, simResolution: 32 });
          instance.destroy();
          setHidden(false);
          flushFrame();
          return instance.inspect();
        }, { method });
        assert.equal(destroyed.queued.length, 0);
        assert.equal(destroyed.running, false);
        assert.equal(destroyed.destroyed, true);
        assert.deepEqual(errors, []);
        console.log(`PASS ${component} ${renderer}: 10k inputs bounded to ${limit}, ${perFrame}/frame, FIFO, visibility, pointer handling, disposal`);
      } finally {
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}
