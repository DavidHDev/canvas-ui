"use client";

import { color, hexToRgb, presets, scrub } from "@/components/demos/control-schema";
import { DemoControls } from "@/components/demos/demo-controls";
import { StageHint } from "@/components/demos/demo-stage";
import { useDemoSurface, type DemoProps } from "@/components/demos/demo-surface";
import { useDemoControls } from "@/hooks/use-demo-controls";
import { Canvas } from "@/components/docs/live/Canvas";
import { PhotoScene } from "@/demos/scenes";

const CONTROLS = {
  strength: scrub("Painting", 1, { min: 0, max: 1, step: 0.05, group: "Canvas" }),
  texture: scrub("Weave", 1, { min: 0, max: 1, step: 0.05, group: "Canvas" }),
  threadSize: scrub("Thread size", 2, {
    min: 2,
    max: 12,
    step: 1,
    decimals: 0,
    group: "Canvas",
  }),
  grain: scrub("Grain", 0.5, { min: 0, max: 1, step: 0.05, group: "Canvas" }),
  halftone: scrub("Halftone", 0.1, { min: 0, max: 1, step: 0.05, group: "Canvas" }),
  radius: scrub("Brush size", 0.08, { min: 0.02, max: 0.25, step: 0.01, group: "Brush" }),
  relief: scrub("Paint relief", 0.45, { min: 0, max: 1, step: 0.05, group: "Brush" }),
  gloss: scrub("Wet gloss", 0.35, { min: 0, max: 1, step: 0.05, group: "Brush" }),
  bristle: scrub("Bristles", 0.4, { min: 0, max: 1, step: 0.05, group: "Brush" }),
  dry: scrub("Dry time", 2.5, {
    min: 0.3,
    max: 8,
    step: 0.1,
    decimals: 1,
    group: "Brush",
  }),
  tint: color("Paper color", "#d6cfbf", { group: "Paper" }),
  tintStrength: scrub("Paper tint", 0, { min: 0, max: 1, step: 0.05, group: "Paper" }),
  threadWidth: scrub("Seam width", 0.2, {
    min: 0,
    max: 0.4,
    step: 0.01,
    group: "Canvas",
    advanced: true,
  }),
  dotSize: scrub("Halftone dot", 6, {
    min: 2,
    max: 10,
    step: 0.5,
    decimals: 1,
    group: "Canvas",
    advanced: true,
  }),
  followSpeed: scrub("Brush follow", 3, {
    min: 1,
    max: 20,
    step: 0.5,
    decimals: 1,
    group: "Brush",
    advanced: true,
  }),
};

const PRESETS = presets(CONTROLS, [
  { label: "Linen", values: { threadSize: 4, tintStrength: 0.45, grain: 0.3 } },
  { label: "Halftone", values: { halftone: 0.85, dotSize: 5, grain: 0.2, texture: 0.4 } },
  { label: "Thick oil", values: { relief: 0.9, gloss: 0.75, bristle: 0.85, radius: 0.13 } },
]);

export function CanvasDemo({ children }: DemoProps) {
  const controls = useDemoControls(CONTROLS);
  const surface = useDemoSurface(
    children,
    <PhotoScene slug="canvas" photo={1} />,
  );

  const { tint, ...values } = controls.values;
  const props = { ...values, tint: hexToRgb(tint) };

  return (
    <>
      <Canvas {...props} {...surface.props} />
      <StageHint label="Move your cursor to paint" touchLabel="Drag to paint" />
      <DemoControls
        title="Canvas controls"
        controls={controls}
        presets={PRESETS}
        snippet={{ component: "Canvas", props }}
      />
    </>
  );
}
