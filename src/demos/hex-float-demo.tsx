"use client";

import { color, hexToRgb, presets, radio, scrub } from "@/components/demos/control-schema";
import { DemoControls } from "@/components/demos/demo-controls";
import { StageHint } from "@/components/demos/demo-stage";
import { useDemoSurface, type DemoProps } from "@/components/demos/demo-surface";
import { useDemoControls } from "@/hooks/use-demo-controls";
import { HexFloat } from "@/components/docs/live/HexFloat";
import { DocsScene } from "@/demos/scenes";

const CONTROLS = {
  size: scrub("Tile size", 160, { min: 24, max: 160, step: 2, decimals: 0, group: "Tiles" }),
  tilt: scrub("Lean", 24, { min: -30, max: 30, step: 1, decimals: 0, group: "Tiles" }),
  float: scrub("Float", 0, { min: 0, max: 1, step: 0.02, group: "Tiles" }),
  bevel: scrub("Bevel", 1.5, { min: 0, max: 20, step: 0.5, decimals: 1, group: "Tiles" }),
  radius: scrub("Window size", 1200, {
    min: 60,
    max: 1400,
    step: 20,
    decimals: 0,
    group: "Reading window",
  }),
  lift: scrub("Edge lift", 0.1, { min: 0, max: 1, step: 0.02, group: "Reading window" }),
  flow: scrub("Flow", 0, { min: 0, max: 3, step: 0.05, group: "Reading window" }),
  swirl: scrub("Swirl", 0, {
    min: 0,
    max: 15,
    step: 0.5,
    decimals: 1,
    group: "Reading window",
  }),
  shine: scrub("Shine", 0.5, { min: 0, max: 2, step: 0.05, group: "Finish" }),
  iridescence: scrub("Iridescence", 1, { min: 0, max: 2, step: 0.05, group: "Finish" }),
  grain: scrub("Grain", 0.8, { min: 0, max: 1, step: 0.02, group: "Finish" }),
  trail: scrub("Trail", 0, {
    min: 0,
    max: 1,
    step: 0.02,
    group: "Reading window",
    advanced: true,
  }),
  gap: scrub("Seam width", 0, {
    min: 0,
    max: 12,
    step: 0.5,
    decimals: 1,
    group: "Tiles",
    advanced: true,
  }),
  perspective: scrub("Perspective", 0.5, {
    min: 0,
    max: 1,
    step: 0.02,
    group: "Tiles",
    advanced: true,
  }),
  speed: scrub("Float speed", 1, { min: 0.1, max: 3, step: 0.05, group: "Tiles", advanced: true }),
  bloom: scrub("Bloom", 0, { min: 0, max: 1, step: 0.02, group: "Finish", advanced: true }),
  gapMode: radio(
    "Seam color",
    "auto",
    [
      { value: "auto", label: "Auto" },
      { value: "custom", label: "Custom" },
    ],
    { group: "Finish", advanced: true },
  ),
  gapHex: color("Seam", "#101014", {
    group: "Finish",
    advanced: true,
    when: (values) => values.gapMode === "custom",
  }),
};

const PRESETS = presets(CONTROLS, [
  { label: "Floating", values: { float: 0.6, tilt: 16, size: 120 } },
  { label: "Fluid", values: { radius: 480, flow: 1.6, swirl: 6, trail: 0.5 } },
  { label: "Glossy", values: { shine: 1.4, bloom: 0.5, iridescence: 1.6, gap: 2 } },
]);

export function HexFloatDemo({ children }: DemoProps) {
  const controls = useDemoControls(CONTROLS);
  const surface = useDemoSurface(
    children,
    <DocsScene slug="hex-float" photo={3} />,
  );

  const { gapMode, gapHex, ...values } = controls.values;
  const props = {
    ...values,
    gapColor: gapMode === "auto" ? ("auto" as const) : hexToRgb(gapHex),
  };

  return (
    <>
      <HexFloat {...props} {...surface.props} />
      <StageHint
        label="Move your cursor to read through the tiles"
        touchLabel="Drag to read through the tiles"
      />
      <DemoControls
        title="Hex Float controls"
        controls={controls}
        presets={PRESETS}
        snippet={{ component: "HexFloat", props }}
      />
    </>
  );
}
