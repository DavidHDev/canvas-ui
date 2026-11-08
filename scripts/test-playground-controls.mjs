// Run with `node scripts/test-playground-controls.mjs`.
// Prerequisite: npm install --no-save --package-lock=false playwright esbuild
// SOURCE_REF=HEAD tests committed sources without changing the checkout.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stubs = {
  "@/components/demos/demo-controls": `
    import { createContext, useLayoutEffect } from "react";
    export const DemoControlsTargetContext = createContext(null);
    export const ColorRow = () => null;
    const setContent = () => {};
    export const useDemoScrollbarGutter = () => setContent;
    export function DemoControls({ controls, title }) {
      window.controlRenders.push({ title, values: controls.values });
      useLayoutEffect(() => { window.controls = controls; });
      return <output id="controls" data-title={title}>{JSON.stringify(controls.values)}</output>;
    }
  `,
  "@/components/playground/mock-site": `export const MockSite = () => <div>Example content</div>;`,
  "@/components/docs/live/Liquid": `export const Liquid = ({ children }) => <div>{children}</div>;`,
  "@/components/docs/live/ParticleReveal": `export const ParticleReveal = ({ children }) => <div>{children}</div>;`,
  "@/components/playground/playground-sidebar": `
    export function PlaygroundSidebar({ activeSlug, onSelect, onControlsHostChange }) {
      return <aside>
        <div ref={onControlsHostChange} />
        <output id="active">{activeSlug}</output>
        <button id="liquid" onClick={() => onSelect("liquid")}>Liquid</button>
        <button id="particle" onClick={() => onSelect("particle-reveal")}>Particle Reveal</button>
        <button id="custom" onClick={() => onSelect("custom-probe")}>Custom</button>
        <button id="edit-and-switch" onClick={() => {
          window.controls.setValue("radius", 1.5);
          onSelect("particle-reveal");
        }}>Edit and switch in one event</button>
        <button id="same-component" onClick={() => {
          window.controls.setValue("radius", 1.5);
          onSelect(activeSlug);
        }}>Select current component</button>
      </aside>;
    }
  `,
  "@/components/playground/demos": `
    import { lazy, Suspense } from "react";
    import { LiquidDemo } from "@/demos/liquid-demo";
    import { ParticleRevealEntry } from "@/components/playground/entries/particle-reveal-entry";
    import { DemoControls } from "@/components/demos/demo-controls";
    import { custom } from "@/components/demos/control-schema";
    import { useDemoControls } from "@/hooks/use-demo-controls";
    const CUSTOM_CONTROLS = { count: custom(7), source: custom("/default.svg") };
    function CustomProbe() {
      return <DemoControls title="Custom controls" controls={useDemoControls(CUSTOM_CONTROLS)} />;
    }
    const LazyLiquid = lazy(() => new Promise(resolve => {
      window.finishLiquidLoad = () => resolve({ default: LiquidDemo });
    }));
    function DelayedLiquid(props) {
      return <Suspense fallback={<div id="loading">Loading effect...</div>}><LazyLiquid {...props} /></Suspense>;
    }
    export const DEFAULT_PLAYGROUND_SLUG = "liquid";
    const demos = [
      { slug: "liquid", kind: "wrap", Component: new URLSearchParams(location.search).has("delayLiquid") ? DelayedLiquid : LiquidDemo },
      { slug: "particle-reveal", kind: "custom", Component: ParticleRevealEntry },
      { slug: "custom-probe", kind: "custom", Component: CustomProbe },
    ];
    export const getPlaygroundDemo = slug => demos.find(demo => demo.slug === slug) ?? demos[0];
  `,
};

// Keep the actual state, selection and production demo schemas. Replacing only
// rendering-heavy modules makes this independent of GPU/browser feature flags.
const bundled = await build({
  absWorkingDir: root,
  stdin: {
    contents: `
      import { StrictMode } from "react";
      import { createRoot } from "react-dom/client";
      import { NuqsAdapter } from "nuqs/adapters/react";
      import { PlaygroundClient } from "@/components/playground/playground-client";
      window.controlRenders = [];
      createRoot(document.querySelector("#root")).render(
        <StrictMode><NuqsAdapter><PlaygroundClient /></NuqsAdapter></StrictMode>
      );
    `,
    resolveDir: root,
    loader: "tsx",
  },
  bundle: true,
  write: false,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"development"' },
  plugins: [{
    name: "playground-fixtures",
    setup(builder) {
      builder.onResolve({ filter: /^@\// }, args => {
        if (Object.hasOwn(stubs, args.path)) return { path: args.path, namespace: "fixture" };
      });
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({
        contents: stubs[args.path], loader: "tsx", resolveDir: root,
      }));
      if (process.env.SOURCE_REF) {
        builder.onLoad({ filter: /[/\\]src[/\\].*\.tsx?$/ }, args => ({
          contents: execFileSync("git", ["show", `${process.env.SOURCE_REF}:${path.relative(root, args.path)}`], {
            cwd: root, encoding: "utf8",
          }),
          loader: args.path.endsWith(".tsx") ? "tsx" : "ts",
        }));
      }
    },
  }],
});

const browser = await chromium.launch({
  ...(process.env.CHROME_EXECUTABLE
    ? { executablePath: process.env.CHROME_EXECUTABLE }
    : { channel: process.env.CHROME_CHANNEL || "chrome" }),
  headless: true,
});
const context = await browser.newContext();
const page = await context.newPage();
page.setDefaultTimeout(10000);
const errors = [];
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => {
  if (message.type() === "error") errors.push(message.text());
});
await page.route("http://localhost/playground**", route => route.fulfill({
  contentType: "text/html",
  body: '<!doctype html><div id="root"></div>',
}));

async function load(query = "", waitForControls = true) {
  await page.goto(`http://localhost/playground${query}`);
  await page.addScriptTag({ content: bundled.outputFiles[0].text });
  await page.waitForFunction(waitForControls
    ? () => Boolean(window.controls)
    : () => Boolean(window.finishLiquidLoad));
}

async function values() {
  return page.locator("#controls").evaluate(element => JSON.parse(element.textContent));
}

async function waitForQuery(expected) {
  await page.waitForFunction(expected => {
    const params = new URLSearchParams(location.search);
    return Object.entries(expected).every(([key, value]) => params.get(key) === value);
  }, expected);
}

try {
  // A shared URL can be changed before its dynamically imported demo mounts.
  // The outgoing schema must still reset before the next component renders.
  await load("?delayLiquid=1&radius=1.5&tracking=keep", false);
  await page.locator("#particle").click();
  await page.evaluate(() => window.finishLiquidLoad());
  await waitForQuery({ c: "particle-reveal", radius: null, delayLiquid: "1", tracking: "keep" });
  assert.equal((await values()).radius, 500);
  assert.ok(await page.evaluate(() => window.controlRenders
    .filter(render => render.title === "Particle Reveal controls")
    .every(render => render.values.radius === 500)));

  // While the initial chunk loads, the latest request wins. Selecting the
  // current component again cancels the pending switch and preserves its URL.
  await load("?delayLiquid=1&radius=1.5&tracking=keep", false);
  await page.locator("#particle").click();
  await page.locator("#custom").click();
  await page.evaluate(() => window.finishLiquidLoad());
  await waitForQuery({ c: "custom-probe", radius: null, tracking: "keep" });
  assert.equal((await values()).count, 7);
  await load("?delayLiquid=1&radius=1.5&tracking=keep", false);
  await page.locator("#particle").click();
  await page.locator("#liquid").click();
  await page.evaluate(() => window.finishLiquidLoad());
  await page.waitForFunction(() => Boolean(window.controls));
  assert.equal(await page.locator("#active").textContent(), "liquid");
  assert.equal((await values()).radius, 1.5);
  assert.equal(new URL(page.url()).searchParams.get("radius"), "1.5");

  // Existing share links hydrate normally, and clicking the active component
  // retains even a control change still queued in the same event.
  await load("?radius=0.75&color=abcdef&rainbow=true&tracking=keep");
  assert.equal((await values()).radius, 0.75);
  await page.locator("#same-component").click();
  await waitForQuery({ radius: "1.5", color: "abcdef", rainbow: "true", tracking: "keep" });
  assert.equal((await values()).radius, 1.5);
  assert.equal(await page.locator("#active").textContent(), "liquid");

  // Switching clears every outgoing control, including those absent from the
  // new schema, while preserving unrelated query parameters.
  await page.locator("#particle").click();
  await waitForQuery({ c: "particle-reveal", radius: null, color: null, rainbow: null, tracking: "keep" });
  assert.equal((await values()).radius, 500);
  const particleRenders = await page.evaluate(() => window.controlRenders.filter(render => render.title === "Particle Reveal controls"));
  assert.ok(particleRenders.length > 0);
  assert.ok(particleRenders.every(render => render.values.radius === 500), "The new component must never render with the outgoing radius");

  // Reverse switching restores Liquid's default and removes the default c key.
  await page.evaluate(() => window.controls.setValue("radius", 700));
  await waitForQuery({ radius: "700" });
  await page.locator("#liquid").click();
  await waitForQuery({ c: null, radius: null, tracking: "keep" });
  assert.equal((await values()).radius, 0.3);

  // A pending edit must be replaced by the reset before nuqs flushes the URL.
  await page.locator("#edit-and-switch").click();
  await waitForQuery({ c: "particle-reveal", radius: null, tracking: "keep" });
  assert.equal((await values()).radius, 500);
  await page.reload();
  await page.addScriptTag({ content: bundled.outputFiles[0].text });
  await page.waitForFunction(() => Boolean(window.controls));
  assert.equal((await values()).radius, 500, "Reload must retain the reset");

  // Exercise actual configured ranges plus stricter numeric URL parsing.
  for (const [query, expected] of [
    ["-10", 60], ["1.5", 60], ["9000", 900], ["325.5", 325.5],
    ["", 500], [" ", 500], ["12oops", 500], ["NaN", 500],
    ["Infinity", 500], ["-Infinity", 500], ["1e309", 500],
  ]) {
    await load(`?c=particle-reveal&radius=${encodeURIComponent(query)}`);
    assert.equal((await values()).radius, expected, `Unexpected radius for ${JSON.stringify(query)}`);
  }
  for (const [query, expected] of [["-12.5", -12.5], ["", 7], ["12oops", 7], ["Infinity", 7]]) {
    await load(`?c=custom-probe&count=${encodeURIComponent(query)}`);
    assert.equal((await values()).count, expected, `Unexpected custom number for ${JSON.stringify(query)}`);
  }

  // Local upload URLs remain local and cannot leak into a newly selected demo.
  await page.evaluate(() => window.controls.setValue("source", "blob:local-upload"));
  await page.waitForFunction(() => window.controls.values.source === "blob:local-upload");
  assert.equal(new URL(page.url()).searchParams.get("source"), null);
  await page.locator("#liquid").click();
  await waitForQuery({ c: null, count: null, source: null });
  assert.equal((await values()).radius, 0.3);
  assert.deepEqual(errors, []);
  console.log("Playground controls passed: delayed loading, reset, queued edits, active selection, unrelated params, numeric parsing, transient uploads.");
} finally {
  await browser.close();
}
