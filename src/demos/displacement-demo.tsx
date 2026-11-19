"use client";

import { presets, scrub } from "@/components/demos/control-schema";
import { DemoControls } from "@/components/demos/demo-controls";
import { StageHint, type GhostPath } from "@/components/demos/demo-stage";
import { useDemoSurface, type DemoProps } from "@/components/demos/demo-surface";
import { useDemoControls } from "@/hooks/use-demo-controls";
import { Displacement } from "@/components/docs/live/Displacement";
import { DocsScene } from "@/demos/scenes";

const CONTROLS = {
  strength: scrub("Strength", 0.1, { min: 0, max: 1, step: 0.01, group: "Cursor" }),
  radius: scrub("Reach", 0.1, { min: 0.02, max: 0.6, step: 0.01, group: "Cursor" }),
  threshold: scrub("Speed threshold", 1000, {
    min: 0,
    max: 3000,
    step: 50,
    decimals: 0,
    group: "Cursor",
  }),
  relaxation: scrub("Linger", 0.9, { min: 0.5, max: 0.99, step: 0.005, group: "Cursor" }),
  grid: scrub("Cells across", 50, { min: 4, max: 60, step: 1, decimals: 0, group: "Cells" }),
  shift: scrub("Shift", 1, { min: 0, max: 4, step: 0.05, group: "Cells" }),
  aberration: scrub("Color fringe", 1.5, { min: 0, max: 3, step: 0.05, group: "Cells" }),
  grain: scrub("Grain", 0.1, { min: 0, max: 1, step: 0.05, group: "Cells" }),
  cellAspect: scrub("Cell aspect", 1, {
    min: 0.25,
    max: 4,
    step: 0.05,
    group: "Cells",
    advanced: true,
  }),
  scramble: scrub("Intro scramble", 1, {
    min: 0,
    max: 3,
    step: 0.1,
    group: "Cells",
    advanced: true,
  }),
  grainSize: scrub("Grain size", 1, {
    min: 0.5,
    max: 4,
    step: 0.1,
    group: "Grain",
    advanced: true,
  }),
  grainSpeed: scrub("Grain speed", 1, {
    min: 0,
    max: 4,
    step: 0.1,
    group: "Grain",
    advanced: true,
  }),
};

const PRESETS = presets(CONTROLS, [
  { label: "Mosaic", values: { grid: 18, strength: 0.25, shift: 2 } },
  { label: "Strips", values: { grid: 14, cellAspect: 4, strength: 0.2 } },
  { label: "Hair trigger", values: { threshold: 150, strength: 0.18, relaxation: 0.95 } },
]);

const easeInOut = (x: number) =>
  x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

const SWIPE: GhostPath = (t) => {
  const period = 1.7;
  const k = easeInOut(Math.min(1, (t % period) / 0.38));
  const forward = Math.floor(t / period) % 2 === 0;
  return [forward ? 0.12 + 0.76 * k : 0.88 - 0.76 * k, 0.5 + 0.2 * Math.sin(t * 0.6)];
};

export function DisplacementDemo({ children }: DemoProps) {
  const controls = useDemoControls(CONTROLS);
  const surface = useDemoSurface(
    children,
    <DocsScene slug="displacement" photo={2} />,
  );
  const props = controls.values;

  return (
    <>
      <Displacement {...props} {...surface.props} />
      <StageHint path={SWIPE} label="Swipe your cursor fast" touchLabel="Swipe fast across" />
      <DemoControls
        title="Displacement controls"
        controls={controls}
        presets={PRESETS}
        snippet={{ component: "Displacement", props }}
      />
    </>
  );
}
