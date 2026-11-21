"use client";

import { useTheme } from "next-themes";

import {
  presets,
  radio,
  scrub,
  toggle,
} from "@/components/demos/control-schema";
import { DemoControls } from "@/components/demos/demo-controls";
import { StageHint } from "@/components/demos/demo-stage";
import { useDemoSurface, type DemoProps } from "@/components/demos/demo-surface";
import { useDemoControls } from "@/hooks/use-demo-controls";
import { Asciify } from "@/components/docs/live/Asciify";
import { DocsScene } from "@/demos/scenes";

const PALETTES = {
  blue: { dark: [], light: [] },
  ember: {
    dark: ["#7c2d12", "#ea580c", "#fdba74", "#fff7ed"],
    light: ["#fed7aa", "#fb923c", "#c2410c", "#431407"],
  },
  aurora: {
    dark: ["#4c1d95", "#22d3ee", "#a7f3d0", "#f0fdfa"],
    light: ["#a7f3d0", "#14b8a6", "#6d28d9", "#2e1065"],
  },
  mono: {
    dark: ["#404040", "#a3a3a3", "#e5e5e5", "#ffffff"],
    light: ["#d4d4d4", "#737373", "#262626", "#0a0a0a"],
  },
} satisfies Record<string, { dark: string[]; light: string[] }>;

const CHARACTERS = {
  letters: " .-=+xX0S8#@",
  classic: " .:-=+*#%@",
  binary: " 01",
  blocks: " ░▒▓█",
} as const;

const CONTROLS = {
  source: radio(
    "Glyph color",
    "gradient",
    [
      { value: "gradient", label: "Gradient" },
      { value: "page", label: "Page" },
    ],
    { group: "Look" },
  ),
  palette: radio(
    "Palette",
    "blue",
    [
      { value: "blue", label: "Blue" },
      { value: "ember", label: "Ember" },
      { value: "aurora", label: "Aurora" },
      { value: "mono", label: "Mono" },
    ],
    { group: "Look", when: (values) => values.source !== "page" },
  ),
  characters: radio(
    "Glyphs",
    "letters",
    [
      { value: "letters", label: "Letters" },
      { value: "classic", label: "Classic" },
      { value: "binary", label: "Binary" },
      { value: "blocks", label: "Blocks" },
    ],
    { group: "Look" },
  ),
  click: radio(
    "Click",
    "wave",
    [
      { value: "wave", label: "Wave" },
      { value: "burst", label: "Burst" },
      { value: "none", label: "None" },
    ],
    { group: "Trail" },
  ),
  radius: scrub("Trail size", 140, {
    min: 40,
    max: 320,
    step: 5,
    decimals: 0,
    group: "Trail",
  }),
  trail: scrub("Fade time", 0.9, {
    min: 0.2,
    max: 3,
    step: 0.1,
    decimals: 1,
    group: "Trail",
  }),
  flow: scrub("Flow", 0.5, { min: 0, max: 1, step: 0.05, group: "Trail" }),
  ambient: scrub("Ambient", 0, { min: 0, max: 1, step: 0.05, group: "Trail" }),
  cellSize: scrub("Glyph size", 12, {
    min: 8,
    max: 24,
    step: 1,
    decimals: 0,
    group: "Glyphs",
  }),
  density: scrub("Density", 0.75, { min: 0, max: 1, step: 0.05, group: "Glyphs" }),
  depth: scrub("Depth of field", 0.3, { min: 0, max: 1, step: 0.05, group: "Glyphs" }),
  flicker: scrub("Flicker", 0.5, { min: 0, max: 1, step: 0.05, group: "Glyphs" }),
  glow: scrub("Glow", 0.6, { min: 0, max: 1, step: 0.05, group: "Finish" }),
  grain: scrub("Grain", 0.15, { min: 0, max: 1, step: 0.05, group: "Finish" }),
  veil: scrub("Veil", 0.35, { min: 0, max: 1, step: 0.05, group: "Finish" }),
  contrast: scrub("Contrast", 1, {
    min: 0.5,
    max: 2,
    step: 0.05,
    group: "Glyphs",
    advanced: true,
  }),
  opacity: scrub("Opacity", 1, {
    min: 0,
    max: 1,
    step: 0.05,
    group: "Glyphs",
    advanced: true,
  }),
  keepText: toggle("Keep text readable", true, {
    group: "Look",
    advanced: true,
    when: (values) => values.source === "page",
  }),
};

const PRESETS = presets(CONTROLS, [
  {
    label: "Ambient",
    values: { ambient: 0.7, veil: 0.2, trail: 1.4, density: 0.6 },
  },
  {
    label: "Terminal",
    values: {
      palette: "mono",
      characters: "classic",
      glow: 1,
      grain: 0.35,
      depth: 0,
      veil: 0.85,
    },
  },
  {
    label: "Ember burst",
    values: { palette: "ember", click: "burst", radius: 200, trail: 1.6 },
  },
  { label: "Page", values: { source: "page", veil: 0.2 } },
]);

export function AsciifyDemo({ children }: DemoProps) {
  const { resolvedTheme } = useTheme();
  const controls = useDemoControls(CONTROLS);
  const surface = useDemoSurface(children, <DocsScene slug="asciify" photo={1} />);

  const { palette, characters, ...values } = controls.values;
  const tone = resolvedTheme === "light" ? "light" : "dark";
  const props = {
    ...values,
    colors: PALETTES[palette][tone],
    characters: CHARACTERS[characters],
  };

  return (
    <>
      <Asciify {...props} {...surface.props} />
      <StageHint
        label="Move your cursor, then click"
        touchLabel="Drag across the page, then tap"
      />
      <DemoControls
        title="Asciify controls"
        controls={controls}
        presets={PRESETS}
        snippet={{ component: "Asciify", props }}
      />
    </>
  );
}
