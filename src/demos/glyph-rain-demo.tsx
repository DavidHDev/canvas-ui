"use client";

import { color, hexToRgb, presets, scrub } from "@/components/demos/control-schema";
import { DemoControls } from "@/components/demos/demo-controls";
import { StageHint } from "@/components/demos/demo-stage";
import { useDemoSurface, type DemoProps } from "@/components/demos/demo-surface";
import { useDemoControls } from "@/hooks/use-demo-controls";
import { GlyphRain } from "@/components/docs/live/GlyphRain";
import { DocsScene } from "@/demos/scenes";

const CONTROLS = {
  color: color("Rain color", "#4474ff", { group: "Rain" }),
  headColor: color("Head color", "#2b6aff", { group: "Rain" }),
  density: scrub("Density", 0.15, { min: 0, max: 1, step: 0.05, group: "Rain" }),
  speed: scrub("Fall speed", 0.2, { min: 0.05, max: 3, step: 0.05, group: "Rain" }),
  cell: scrub("Glyph size", 15, { min: 8, max: 48, step: 1, decimals: 0, group: "Rain" }),
  trail: scrub("Trail length", 0.65, { min: 0.2, max: 3, step: 0.05, group: "Rain" }),
  dim: scrub("Page dim", 0.5, { min: 0, max: 1, step: 0.05, group: "Light" }),
  light: scrub("Light on page", 2.8, { min: 0, max: 3, step: 0.05, group: "Light" }),
  glow: scrub("Head glow", 1.75, { min: 0, max: 3, step: 0.05, group: "Light" }),
  lightRadius: scrub("Light radius", 240, {
    min: 20,
    max: 600,
    step: 10,
    decimals: 0,
    group: "Light",
  }),
  stir: scrub("Cursor stir", 0.7, { min: 0, max: 1, step: 0.05, group: "Cursor" }),
  stirRadius: scrub("Stir radius", 260, {
    min: 40,
    max: 900,
    step: 10,
    decimals: 0,
    group: "Cursor",
  }),
  settle: scrub("Settle time", 0.9, { min: 0.1, max: 4, step: 0.05, group: "Cursor" }),
  speedVariance: scrub("Speed variance", 0.5, {
    min: 0,
    max: 1,
    step: 0.05,
    group: "Rain",
    advanced: true,
  }),
  mutate: scrub("Mutation", 0, { min: 0, max: 4, step: 0.1, group: "Rain", advanced: true }),
  flicker: scrub("Flicker", 0, { min: 0, max: 1, step: 0.05, group: "Rain", advanced: true }),
  layers: scrub("Depth layers", 2, {
    min: 1,
    max: 3,
    step: 1,
    decimals: 0,
    group: "Rain",
    advanced: true,
  }),
  lightHeight: scrub("Light height", 172, {
    min: 4,
    max: 300,
    step: 2,
    decimals: 0,
    group: "Light",
    advanced: true,
  }),
  relief: scrub("Relief", 0.05, { min: 0, max: 2, step: 0.05, group: "Light", advanced: true }),
};

const PRESETS = presets(CONTROLS, [
  {
    label: "Matrix",
    values: { color: "#22c55e", headColor: "#bbf7d0", density: 0.45, speed: 0.5, mutate: 1.5 },
  },
  { label: "Drizzle", values: { density: 0.06, speed: 0.12, dim: 0.25, trail: 1.4 } },
  { label: "Storm", values: { density: 0.8, speed: 1.2, layers: 3, flicker: 0.4 } },
]);

export function GlyphRainDemo({ children }: DemoProps) {
  const controls = useDemoControls(CONTROLS);
  const surface = useDemoSurface(
    children,
    <DocsScene slug="glyph-rain" photo={2} />,
  );

  const { color: rainColor, headColor, ...values } = controls.values;
  const props = {
    ...values,
    color: hexToRgb(rainColor),
    headColor: hexToRgb(headColor),
  };

  return (
    <>
      <GlyphRain {...props} {...surface.props} />
      <StageHint
        label="Move your cursor through the rain"
        touchLabel="Drag through the rain"
      />
      <DemoControls
        title="Glyph Rain controls"
        controls={controls}
        presets={PRESETS}
        snippet={{ component: "GlyphRain", props }}
      />
    </>
  );
}
