// Run with `node scripts/test-flame-wrap-vanilla.mjs`.
// Prerequisites: Playwright and installed Chrome (or CHROME_EXECUTABLE).
// Set BROWSER=webkit to test DOM fallbacks with Playwright's WebKit browser.
// Exercises the exact HTML and TypeScript displayed in the vanilla docs.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium, webkit } from "playwright";
import ts from "typescript";

function transpile(source) {
  return ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
}

function standalone(source) {
  return transpile(source)
    .replace(/^import[\s\S]*?from ["'][^"']+["'];\n/gm, "")
    .replace(/^export /gm, "");
}

const [exampleSource, ...engineSources] = await Promise.all([
  "../src/components/docs/flame-wrap-vanilla-usage.ts",
  "../src/lib/canvas-viewport.ts",
  "../src/lib/html-in-canvas.ts",
  "../src/lib/FlameWrap/FlameWrapVanilla.ts",
].map((path) => readFile(new URL(path, import.meta.url), "utf8")));
const { FLAME_WRAP_VANILLA_HTML, FLAME_WRAP_VANILLA_TS } = await import(
  `data:text/javascript,${encodeURIComponent(transpile(exampleSource))}`
);
const fixture = `<!doctype html>${FLAME_WRAP_VANILLA_HTML.replace(/<script[\s\S]*?<\/script>/, "")}`;
const script = [...engineSources, FLAME_WRAP_VANILLA_TS].map(standalone).join("\n");
const browserName = process.env.BROWSER || "chrome";
assert.ok(["chrome", "webkit"].includes(browserName), "BROWSER must be chrome or webkit");

for (const native of browserName === "webkit" ? [false] : [true, false]) {
  const browser = browserName === "webkit" ? await webkit.launch() : await chromium.launch({
    ...(process.env.CHROME_EXECUTABLE
      ? { executablePath: process.env.CHROME_EXECUTABLE }
      : { channel: process.env.CHROME_CHANNEL || "chrome" }),
    headless: true,
    args: [
      `${native ? "--enable" : "--disable"}-blink-features=CanvasDrawElement`,
      ...(process.platform === "darwin" ? ["--use-angle=metal"] : []),
    ],
  });
  try {
    for (const rejectGpu of [false, true]) {
      const context = await browser.newContext({ viewport: { width: 900, height: 800 }, deviceScaleFactor: 2 });
      try {
        const page = await context.newPage();
        const errors = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.setContent(fixture);
        await page.evaluate(({ rejectGpu }) => {
          window.fixture = { native: false, captures: 0, pixels: [], paintErrors: [], clicks: 0, draws: 0 };
          const getContext = HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext = function (type, ...args) {
            if (rejectGpu && type === "webgl2") return null;
            return getContext.call(this, type, ...args);
          };
          const draw = CanvasRenderingContext2D.prototype.drawElementImage;
          window.fixture.native = typeof draw === "function" && typeof HTMLCanvasElement.prototype.requestPaint === "function";
          if (draw) {
            CanvasRenderingContext2D.prototype.drawElementImage = function (...args) {
              try {
                const result = draw.apply(this, args);
                window.fixture.captures++;
                window.fixture.pixels = Array.from(this.getImageData(150 * devicePixelRatio, 150 * devicePixelRatio, 1, 1).data);
                return result;
              } catch (error) {
                window.fixture.paintErrors.push(error.message);
                throw error;
              }
            };
          }
          const drawArrays = WebGL2RenderingContext.prototype.drawArrays;
          WebGL2RenderingContext.prototype.drawArrays = function (...args) {
            const result = drawArrays.apply(this, args);
            window.fixture.draws++;
            return result;
          };
          document.querySelector("button").addEventListener("click", () => window.fixture.clicks++);
        }, { rejectGpu });
        await page.addScriptTag({ content: script });
        assert.equal(await page.evaluate(() => window.fixture.native), native);

        if (native && !rejectGpu) {
          await page.waitForFunction(() => window.fixture.captures > 0 && window.fixture.draws > 0);
          assert.deepEqual(await page.evaluate(() => window.fixture.pixels), [24, 32, 51, 255],
            "The nested HTML must produce captured pixels, not only flames");
          assert.equal(await page.locator("#content").evaluate((element) => element.parentElement.id), "source");
        } else {
          assert.equal(await page.locator("#source").isVisible(), false);
          assert.equal(await page.locator("#content").evaluate((element) => element.parentElement.tagName), "DIV");
          assert.equal(await page.locator("#output").isVisible(), !rejectGpu);
        }
        await page.locator("button").click();
        assert.equal(await page.evaluate(() => window.fixture.clicks), 1, "Visible content must accept clicks");
        assert.deepEqual(await page.evaluate(() => window.fixture.paintErrors), []);
        assert.deepEqual(errors, []);
        await page.evaluate(() => flameWrap?.destroy());
        console.log(`PASS ${browserName} ${browser.version()} ${native ? "native" : "DOM fallback"}${rejectGpu ? ", rejected GPU" : ""}: content capture/visibility and input`);
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}
