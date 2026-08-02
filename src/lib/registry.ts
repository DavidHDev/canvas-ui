import fs from "node:fs";
import path from "node:path";

const LIB_ROOT = path.join(process.cwd(), "src/lib");

interface ComponentDef {
  /** Directory and file base name under src/lib, e.g. "Liquid". */
  base: string;
  description: string;
  /** npm packages the component needs at runtime. */
  dependencies?: string[];
  /** npm packages the component needs for types only. */
  devDependencies?: string[];
}

const COMPONENTS: Record<string, ComponentDef> = {
  "ascii-object": {
    base: "AsciiObject",
    description:
      "Renders any GLB/glTF model, SVG, or image in a floating studio scene as ASCII characters chosen by shape, so glyphs trace the object's edges. Built on three.js.",
    dependencies: ["three"],
    devDependencies: ["@types/three"],
  },
  asciify: {
    base: "Asciify",
    description:
      "Redraws your page as live ascii characters in a soft radius around the cursor, with real glyph, shade block, and binary ramps. The HTML stays interactive in Chromium and Firefox.",
  },
  bend: {
    base: "Bend",
    description:
      "Folds the top and bottom of your page over virtual edges as you scroll, like scrolling on the face of a cube. The HTML stays interactive. No dependencies.",
  },
  grid: {
    base: "Grid",
    description:
      "Splits your page into a grid of 3D tiles that ripple in waves around the cursor. The HTML stays interactive. No dependencies.",
  },
  blaze: {
    base: "Blaze",
    description:
      "Fire sparks, smoke, and heat distortion rising from the bottom of your page. The HTML stays interactive. No dependencies.",
  },
  bubble: {
    base: "Bubble",
    description:
      "A glassy droplet that trails the cursor as blending metaballs and refracts the live page beneath it, with dispersion, frost, and an iridescent sheen. The HTML stays interactive. No dependencies.",
  },
  canvas: {
    base: "Canvas",
    description:
      "Paints your page onto woven artist canvas, with fiber texture, paper tint, grain, a dotted halftone screen, and a soft intro crossfade. Text stays crisp and readable. The HTML stays interactive. No dependencies.",
  },
  cloth: {
    base: "Cloth",
    description:
      "Hangs your live HTML on a piece of fabric rippling in the wind, with softly lit folds. Cursor strokes send waves across the cloth. The HTML stays interactive. No dependencies.",
  },
  clouds: {
    base: "Clouds",
    description:
      "Procedural fog that drifts over your page and blurs what it covers. Cursor movement parts the clouds. The HTML stays interactive. No dependencies.",
  },
  "decrypt-reveal": {
    base: "DecryptReveal",
    description:
      "Renders your page as real ASCII cipher text that decodes back into crisp UI around the cursor behind a flickering wavefront. The HTML stays interactive. No dependencies.",
  },
  liquid: {
    base: "Liquid",
    description:
      "A pointer-driven WebGL fluid simulation over your page. The HTML stays interactive. No dependencies.",
  },
  magnify: {
    base: "Magnify",
    description:
      "A sci-fi scanner lens that follows the cursor and magnifies the live page inside a configurable HUD reticle, with chromatic aberration haze and click ripples that bend the page. The HTML stays interactive. No dependencies.",
  },
  "dithered-object": {
    base: "DitheredObject",
    description:
      "Renders any GLB/glTF model, SVG, or image in a floating studio scene through a 1-bit Bayer, halftone, or Floyd–Steinberg dither. Built on three.js.",
    dependencies: ["three"],
    devDependencies: ["@types/three"],
  },
  displacement: {
    base: "Displacement",
    description:
      "Warps your live HTML on a displacement grid that ripples away from the cursor, with chromatic fringing and film grain in the disturbed areas. The HTML stays interactive. No dependencies.",
  },
  droplets: {
    base: "Droplets",
    description:
      "Rain droplets that run down the screen and refract your page behind them. The HTML stays interactive. No dependencies.",
  },
  "flame-wrap": {
    base: "FlameWrap",
    description:
      "Wraps any element in a perfectly aligned border of fire: flames rise from the top edge, the outline glows molten, sparks fly, and the content shimmers with heat. The HTML stays interactive. No dependencies.",
  },
  "force-field": {
    base: "ForceField",
    description:
      "Projects an energy shield lattice over your live HTML. The cursor charges cells as it crosses them and every click detonates a shockwave ripple that refracts the page beneath, with bloom, grain, and a burning reveal dissolve. The HTML stays interactive. No dependencies.",
  },
  "particle-object": {
    base: "ParticleObject",
    description:
      "Rebuilds any GLB/glTF model, SVG, or image as a cloud of particles that the cursor pushes, swirls, and springs back into shape. Built on three.js.",
    dependencies: ["three"],
    devDependencies: ["@types/three"],
  },
  "particle-reveal": {
    base: "ParticleReveal",
    description:
      "Renders your page as fine grayscale dust that merges back into crisp UI around the cursor. The HTML stays interactive. No dependencies.",
  },
  "particle-scroll": {
    base: "ParticleScroll",
    description:
      "Dissolves everything below a chosen line into drifting sand that reassembles as you scroll. The HTML stays interactive. No dependencies.",
  },
  peel: {
    base: "Peel",
    description:
      "Peels your page back from a chosen edge as the cursor approaches, revealing a second layer underneath. The HTML stays interactive. No dependencies.",
  },
  glitch: {
    base: "Glitch",
    description:
      "Broadcast glitch bursts that tear the page into shifted slices with RGB splits, corrupted blocks, and analog noise, then settle back to a clean read. The HTML stays interactive. No dependencies.",
  },
  "glyph-rain": {
    base: "GlyphRain",
    description:
      "Rains glowing glyph streams over your live HTML while every drop head casts a real pool of light onto the page beneath, with embossed relief shading. The HTML stays interactive. No dependencies.",
  },
  frost: {
    base: "Frost",
    description:
      "Covers your page in a frozen pane of ice with refraction and frost grain. Hovering melts a hole through the frost, which freezes back over. The HTML stays interactive. No dependencies.",
  },
  "hex-float": {
    base: "HexFloat",
    description:
      "Renders the live page onto a floor of shiny beveled hex tiles that lean back in perspective, bob gently, and rise toward the cursor. The HTML stays interactive. No dependencies.",
  },
  "retro-dither": {
    base: "RetroDither",
    description:
      "A retro dither lens that pixelates and quantizes your page around the cursor. The HTML stays interactive. No dependencies.",
  },
  ripple: {
    base: "Ripple",
    description:
      "Water ripples that spread from every click and refract the live page like a pond surface, with dispersion and light glints on the crests. The HTML stays interactive. No dependencies.",
  },
  shatter: {
    base: "Shatter",
    description:
      "Shatters your page into 3D glass shards that lift, tilt, and float around the cursor, refracting the content beneath them, with perspective and soft shadows. The HTML stays interactive. No dependencies.",
  },
  vhs: {
    base: "VHS",
    description:
      "Plays your page back like a worn VHS tape, with tape wave, head-switch noise, chroma bleed, and grain. The HTML stays interactive. No dependencies.",
  },
  laser: {
    base: "Laser",
    description:
      "Hides everything below a glowing laser beam near the bottom of the viewport. Scrolling prints new content in from behind it. The HTML stays interactive. No dependencies.",
  },
  glass: {
    base: "Glass",
    description:
      "A cursor-following glass lens that refracts your page like real glass, with a crystal ball zoom over target elements. The HTML stays interactive. No dependencies.",
  },
  "glass-object": {
    base: "GlassObject",
    description:
      "Turns any GLB/glTF model, SVG, or image into a floating liquid-glass object with real refraction, chromatic dispersion, frost, and tinted absorption, lit by a studio environment. Built on three.js.",
    dependencies: ["three"],
    devDependencies: ["@types/three"],
  },
  "liquid-object": {
    base: "LiquidObject",
    description:
      "Renders any GLB/glTF model, SVG, or image in a studio environment, then drags it through an invisible GPU fluid that swirls under the cursor and splits the light into chromatic fringes. Built on three.js.",
    dependencies: ["three"],
    devDependencies: ["@types/three"],
  },
};

function read(base: string, fileName: string) {
  return fs.readFileSync(path.join(LIB_ROOT, base, fileName), "utf8");
}

function vanillaImport(base: string) {
  return new RegExp(
    `[ \\t]*import\\s*\\{[^}]*\\}\\s*from\\s*["']\\./${base}Vanilla["'];\\r?\\n*`,
  );
}

function makeStandalone(
  base: string,
  wrapper: string,
  engine: string,
  kind: "react" | "solid" | "preact" | "vue" | "svelte" | "angular",
) {
  const body = engine.trimEnd();
  if (
    kind === "react" ||
    kind === "solid" ||
    kind === "preact" ||
    kind === "angular"
  ) {
    return wrapper
      .replace(vanillaImport(base), body + "\n\n")
      .replace(/\nexport type \{[^}]*\};\n?/, "\n");
  }
  const stripped = wrapper.replace(vanillaImport(base), "");
  if (kind === "vue") {
    return `<script lang="ts">\n${body}\n</script>\n\n${stripped}`;
  }
  const moduleTag = '<script module lang="ts">';
  if (stripped.includes(moduleTag)) {
    return stripped.replace(moduleTag, `${moduleTag}\n${body}\n`);
  }
  return `<script module lang="ts">\n${body}\n</script>\n\n${stripped}`;
}

export interface ComponentSource {
  id: "react" | "solid" | "preact" | "vue" | "svelte" | "angular" | "vanilla";
  label: string;
  fileName: string;
  lang: "tsx" | "vue" | "svelte" | "typescript";
  source: string;
}

export function getComponentDependencies(component: string): {
  dependencies: string[];
  devDependencies: string[];
} {
  const def = COMPONENTS[component];
  return {
    dependencies: def?.dependencies ?? [],
    devDependencies: def?.devDependencies ?? [],
  };
}

export function getDemoSource(component: string): string | null {
  const file = path.join(process.cwd(), "src/demos", `${component}-demo.tsx`);
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, "utf8");
}

export function getComponentSources(component: string): ComponentSource[] {
  const def = COMPONENTS[component];
  if (!def) throw new Error(`Unknown component: ${component}`);
  const { base } = def;
  const engine = read(base, `${base}Vanilla.ts`);
  return [
    {
      id: "react",
      label: "React",
      fileName: `${base}.tsx`,
      lang: "tsx",
      source: makeStandalone(base, read(base, `${base}.tsx`), engine, "react"),
    },
    {
      id: "vue",
      label: "Vue",
      fileName: `${base}.vue`,
      lang: "vue",
      source: makeStandalone(base, read(base, `${base}.vue`), engine, "vue"),
    },
    {
      id: "svelte",
      label: "Svelte",
      fileName: `${base}.svelte`,
      lang: "svelte",
      source: makeStandalone(
        base,
        read(base, `${base}.svelte`),
        engine,
        "svelte",
      ),
    },
    {
      id: "solid",
      label: "Solid",
      fileName: `${base}.tsx`,
      lang: "tsx",
      source: makeStandalone(
        base,
        read(base, `${base}.solid.tsx`),
        engine,
        "solid",
      ),
    },
    {
      id: "preact",
      label: "Preact",
      fileName: `${base}.tsx`,
      lang: "tsx",
      source: makeStandalone(
        base,
        read(base, `${base}.preact.tsx`),
        engine,
        "preact",
      ),
    },
    {
      id: "angular",
      label: "Angular",
      fileName: `${base}.component.ts`,
      lang: "typescript",
      source: makeStandalone(
        base,
        read(base, `${base}.angular.ts`),
        engine,
        "angular",
      ),
    },
    {
      id: "vanilla",
      label: "Vanilla",
      fileName: `${base}Vanilla.ts`,
      lang: "typescript",
      source: engine,
    },
  ];
}

interface RegistryFile {
  path: string;
  content: string;
  type: string;
  target: string;
}

export interface RegistryItem {
  $schema: string;
  name: string;
  type: string;
  title: string;
  description: string;
  dependencies: string[];
  devDependencies: string[];
  files: RegistryFile[];
}

export const REGISTRY_ITEMS = Object.keys(COMPONENTS).flatMap((component) =>
  (
    ["react", "vue", "svelte", "solid", "preact", "angular", "vanilla"] as const
  ).map((flavor) => `${component}-${flavor}`),
);

export function getRegistryItem(name: string): RegistryItem | null {
  const match =
    /^([a-z-]+)-(react|solid|preact|vue|svelte|angular|vanilla)$/.exec(name);
  if (!match) return null;
  const [, component, id] = match;
  const def = COMPONENTS[component];
  if (!def) return null;
  const source = getComponentSources(component).find(
    (entry) => entry.id === id,
  );
  if (!source) return null;

  const target =
    id === "svelte"
      ? `src/lib/components/canvasui/${source.fileName}`
      : `components/canvasui/${source.fileName}`;
  return {
    $schema: "https://ui.shadcn.com/schema/registry-item.json",
    name,
    type: "registry:component",
    title: `${def.base} (${source.label})`,
    description: def.description,
    dependencies:
      id === "solid"
        ? ["solid-js", ...(def.dependencies ?? [])]
        : id === "preact"
          ? ["preact", ...(def.dependencies ?? [])]
          : id === "angular"
            ? ["@angular/core", "@angular/common", ...(def.dependencies ?? [])]
            : (def.dependencies ?? []),
    devDependencies: def.devDependencies ?? [],
    files: [
      {
        path: target,
        content: source.source,
        type: id === "react" ? "registry:component" : "registry:file",
        target,
      },
    ],
  };
}
