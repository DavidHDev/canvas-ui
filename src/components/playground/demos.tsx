"use client";

import dynamic from "next/dynamic";
import type { ComponentType, ReactNode } from "react";

export type PlaygroundDemoKind = "wrap" | "custom";

export interface PlaygroundDemo {
  slug: string;
  name: string;
  description: string;
  kind: PlaygroundDemoKind;
  Component: DemoComponent;
}

type DemoComponent = ComponentType<{ children?: ReactNode }>;

function Skeleton() {
  return (
    <div
      aria-hidden
      className="fixed right-6 bottom-6 z-40 rounded-full border border-border/60 bg-background/70 px-4 py-2.5 text-[13px] font-medium text-muted-foreground backdrop-blur-xl"
    >
      Loading effect...
    </div>
  );
}

const load = (loader: () => Promise<ComponentType<never>>) =>
  dynamic(() => loader() as Promise<DemoComponent>, {
    ssr: false,
    loading: () => <Skeleton />,
  });

export const PLAYGROUND_DEMOS: PlaygroundDemo[] = [
  {
    slug: "ascii-object",
    name: "ASCII Object",
    description: "A 3D model or image redrawn as shape-matched ASCII.",
    kind: "custom",
    Component: load(() =>
      import("@/components/playground/entries/ascii-object-entry").then(
        (m) => m.AsciiObjectEntry,
      ),
    ),
  },
  {
    slug: "ascii-sweep",
    name: "ASCII Sweep",
    description: "An ascii band that rewrites the whole page as it sweeps.",
    kind: "custom",
    Component: load(() =>
      import("@/components/playground/entries/ascii-sweep-entry").then(
        (m) => m.AsciiSweepEntry,
      ),
    ),
  },
  {
    slug: "asciify",
    name: "Asciify",
    description: "An ascii lens that follows your cursor.",
    kind: "wrap",
    Component: load(() =>
      import("@/demos/asciify-demo").then((m) => m.AsciifyDemo),
    ),
  },
  {
    slug: "bend",
    name: "Bend",
    description: "Folds the page over virtual edges as you scroll.",
    kind: "wrap",
    Component: load(() => import("@/demos/bend-demo").then((m) => m.BendDemo)),
  },
  {
    slug: "blaze",
    name: "Blaze",
    description: "Fire, smoke, and heat rising over the page.",
    kind: "wrap",
    Component: load(() =>
      import("@/demos/blaze-demo").then((m) => m.BlazeDemo),
    ),
  },
  {
    slug: "bubble",
    name: "Bubble",
    description: "A glassy droplet trailing the cursor.",
    kind: "wrap",
    Component: load(() =>
      import("@/demos/bubble-demo").then((m) => m.BubbleDemo),
    ),
  },
  {
    slug: "canvas",
    name: "Canvas",
    description: "The page painted onto canvas, with a brush for a cursor.",
    kind: "wrap",
    Component: load(() =>
      import("@/demos/canvas-demo").then((m) => m.CanvasDemo),
    ),
  },
  {
    slug: "cloth",
    name: "Cloth",
    description: "Hangs the page on rippling fabric.",
    kind: "wrap",
    Component: load(() =>
      import("@/demos/cloth-demo").then((m) => m.ClothDemo),
    ),
  },
  {
    slug: "clouds",
    name: "Clouds",
    description: "Theme-aware mist parted by cursor wind.",
    kind: "wrap",
    Component: load(() =>
      import("@/demos/clouds-demo").then((m) => m.CloudsDemo),
    ),
  },
  {
    slug: "decrypt-reveal",
    name: "Decrypt Reveal",
    description: "UI encrypted into ASCII, decoded by the cursor.",
    kind: "custom",
    Component: load(() =>
      import("@/components/playground/entries/decrypt-reveal-entry").then(
        (m) => m.DecryptRevealEntry,
      ),
    ),
  },
  {
    slug: "dithered-object",
    name: "Dithered Object",
    description: "A 3D model or image rendered through a 1-bit dither.",
    kind: "custom",
    Component: load(() =>
      import("@/components/playground/entries/dithered-object-entry").then(
        (m) => m.DitheredObjectEntry,
      ),
    ),
  },
  {
    slug: "displacement",
    name: "Displacement",
    description: "Grid cells shearing the page apart under the cursor.",
    kind: "wrap",
    Component: load(() =>
      import("@/demos/displacement-demo").then((m) => m.DisplacementDemo),
    ),
  },
  {
    slug: "droplets",
    name: "Droplets",
    description: "Rain droplets refracting the page.",
    kind: "wrap",
    Component: load(() =>
      import("@/demos/droplets-demo").then((m) => m.DropletsDemo),
    ),
  },
  {
    slug: "flame-wrap",
    name: "Flame Wrap",
    description: "A card wrapped in a border of fire.",
    kind: "custom",
    Component: load(() =>
      import("@/components/playground/entries/flame-wrap-entry").then(
        (m) => m.FlameWrapEntry,
      ),
    ),
  },
  {
    slug: "force-field",
    name: "Force Field",
    description: "An energy shield where clicks detonate shockwaves.",
    kind: "wrap",
    Component: load(() =>
      import("@/demos/force-field-demo").then((m) => m.ForceFieldDemo),
    ),
  },
  {
    slug: "frost",
    name: "Frost",
    description: "A frozen pane that melts under the cursor.",
    kind: "wrap",
    Component: load(() =>
      import("@/demos/frost-demo").then((m) => m.FrostDemo),
    ),
  },
  {
    slug: "glass",
    name: "Glass",
    description: "A crystal-ball lens that zooms on targets.",
    kind: "wrap",
    Component: load(() =>
      import("@/demos/glass-demo").then((m) => m.GlassDemo),
    ),
  },
  {
    slug: "glass-object",
    name: "Glass Object",
    description: "Models, SVGs, and images as floating liquid glass.",
    kind: "custom",
    Component: load(() =>
      import("@/components/playground/entries/glass-object-entry").then(
        (m) => m.GlassObjectEntry,
      ),
    ),
  },
  {
    slug: "glitch",
    name: "Glitch",
    description: "Broadcast glitch bursts over the live page.",
    kind: "wrap",
    Component: load(() =>
      import("@/demos/glitch-demo").then((m) => m.GlitchDemo),
    ),
  },
  {
    slug: "glyph-rain",
    name: "Glyph Rain",
    description:
      "Falling glyphs that light up the page, and surge under the cursor.",
    kind: "wrap",
    Component: load(() =>
      import("@/demos/glyph-rain-demo").then((m) => m.GlyphRainDemo),
    ),
  },
  {
    slug: "grid",
    name: "Grid",
    description: "3D tiles rippling around the cursor.",
    kind: "wrap",
    Component: load(() => import("@/demos/grid-demo").then((m) => m.GridDemo)),
  },
  {
    slug: "hex-float",
    name: "Hex Float",
    description: "The page on shiny floating hex tiles.",
    kind: "wrap",
    Component: load(() =>
      import("@/demos/hex-float-demo").then((m) => m.HexFloatDemo),
    ),
  },
  {
    slug: "ink-object",
    name: "Ink Object",
    description: "A 3D model or image printed as rough ink strokes.",
    kind: "custom",
    Component: load(() =>
      import("@/components/playground/entries/ink-object-entry").then(
        (m) => m.InkObjectEntry,
      ),
    ),
  },
  {
    slug: "laser",
    name: "Laser",
    description: "A beam that reveals the page on scroll.",
    kind: "wrap",
    Component: load(() =>
      import("@/demos/laser-demo").then((m) => m.LaserDemo),
    ),
  },
  {
    slug: "liquid",
    name: "Liquid",
    description: "A fluid simulation over the live page.",
    kind: "wrap",
    Component: load(() =>
      import("@/demos/liquid-demo").then((m) => m.LiquidDemo),
    ),
  },
  {
    slug: "magnify",
    name: "Magnify",
    description: "A sci-fi scanner lens with click ripples.",
    kind: "wrap",
    Component: load(() =>
      import("@/demos/magnify-demo").then((m) => m.MagnifyDemo),
    ),
  },
  {
    slug: "particle-object",
    name: "Particle Object",
    description: "Models rebuilt as swirling particle clouds.",
    kind: "custom",
    Component: load(() =>
      import("@/components/playground/entries/particle-object-entry").then(
        (m) => m.ParticleObjectEntry,
      ),
    ),
  },
  {
    slug: "particle-reveal",
    name: "Particle Reveal",
    description: "UI revealed from fine particles by the cursor.",
    kind: "custom",
    Component: load(() =>
      import("@/components/playground/entries/particle-reveal-entry").then(
        (m) => m.ParticleRevealEntry,
      ),
    ),
  },
  {
    slug: "particle-scroll",
    name: "Particle Scroll",
    description: "The page dissolves into sand below a line.",
    kind: "wrap",
    Component: load(() =>
      import("@/demos/particle-scroll-demo").then((m) => m.ParticleScrollDemo),
    ),
  },
  {
    slug: "peel",
    name: "Peel",
    description: "Peels the page back from an edge in 3D.",
    kind: "custom",
    Component: load(() =>
      import("@/components/playground/entries/peel-entry").then(
        (m) => m.PeelEntry,
      ),
    ),
  },
  {
    slug: "retro-dither",
    name: "Retro Dither",
    description: "A retro dithered pass over the live page.",
    kind: "wrap",
    Component: load(() =>
      import("@/demos/retro-dither-demo").then((m) => m.RetroDitherDemo),
    ),
  },
  {
    slug: "ripple",
    name: "Ripple",
    description: "Click to send water ripples across the page.",
    kind: "wrap",
    Component: load(() =>
      import("@/demos/ripple-demo").then((m) => m.RippleDemo),
    ),
  },
  {
    slug: "shatter",
    name: "Shatter",
    description: "Shatters the page into glass shards.",
    kind: "wrap",
    Component: load(() =>
      import("@/demos/shatter-demo").then((m) => m.ShatterDemo),
    ),
  },
  {
    slug: "liquid-object",
    name: "Liquid Object",
    description: "Models dragged through invisible liquid.",
    kind: "custom",
    Component: load(() =>
      import("@/components/playground/entries/liquid-object-entry").then(
        (m) => m.LiquidObjectEntry,
      ),
    ),
  },
  {
    slug: "vhs",
    name: "VHS",
    description: "Analog tape artifacts over the live page.",
    kind: "wrap",
    Component: load(() => import("@/demos/vhs-demo").then((m) => m.VHSDemo)),
  },
];

export const DEFAULT_PLAYGROUND_SLUG = "liquid";

export function getPlaygroundDemo(slug: string | null): PlaygroundDemo {
  return (
    PLAYGROUND_DEMOS.find((demo) => demo.slug === slug) ??
    PLAYGROUND_DEMOS.find((demo) => demo.slug === DEFAULT_PLAYGROUND_SLUG)!
  );
}
