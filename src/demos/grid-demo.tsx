"use client";

import { color, hexToRgb, presets, scrub } from "@/components/demos/control-schema";
import { DemoControls } from "@/components/demos/demo-controls";
import { StageHint } from "@/components/demos/demo-stage";
import { useDemoSurface, type DemoProps } from "@/components/demos/demo-surface";
import { useDemoControls } from "@/hooks/use-demo-controls";
import { Grid } from "@/components/docs/live/Grid";
import { DocsScene } from "@/demos/scenes";

const CONTROLS = {
  tileSize: scrub("Tile size", 150, {
    min: 16,
    max: 160,
    step: 2,
    decimals: 0,
    group: "Tiles",
  }),
  gap: scrub("Gap", 0, { min: 0, max: 12, step: 0.5, decimals: 1, group: "Tiles" }),
  cornerRadius: scrub("Corner radius", 0, {
    min: 0,
    max: 24,
    step: 1,
    decimals: 0,
    group: "Tiles",
  }),
  liftHeight: scrub("Lift height", 60, {
    min: 0,
    max: 160,
    step: 2,
    decimals: 0,
    group: "Tiles",
  }),
  amplitude: scrub("Wave strength", 2.5, { min: 0, max: 3, step: 0.05, group: "Wave" }),
  waveSpeed: scrub("Wave speed", 0.5, { min: 0.1, max: 3, step: 0.05, group: "Wave" }),
  fadeTime: scrub("Fade time", 0.6, {
    min: 0.2,
    max: 6,
    step: 0.1,
    decimals: 1,
    group: "Wave",
  }),
  idleRipples: scrub("Idle ripples (s)", 0, {
    min: 0,
    max: 6,
    step: 0.5,
    decimals: 1,
    group: "Wave",
  }),
  tint: color("Tint", "#0054ff", { group: "Look" }),
  tintStrength: scrub("Tint strength", 0.1, { min: 0, max: 1, step: 0.05, group: "Look" }),
  shading: scrub("Shading", 0.05, { min: 0, max: 2, step: 0.05, group: "Look" }),
  frequency: scrub("Ripple count", 12, {
    min: 1,
    max: 40,
    step: 0.5,
    decimals: 1,
    group: "Wave",
    advanced: true,
  }),
  waveWidth: scrub("Wave width", 0.05, {
    min: 0.02,
    max: 0.5,
    step: 0.01,
    group: "Wave",
    advanced: true,
  }),
  maxLift: scrub("Max lift", 1, { min: 0.1, max: 1, step: 0.05, group: "Tiles", advanced: true }),
  jitter: scrub("Jitter", 0, { min: 0, max: 1, step: 0.05, group: "Tiles", advanced: true }),
  perspective: scrub("Perspective", 1200, {
    min: 300,
    max: 4000,
    step: 50,
    decimals: 0,
    group: "Look",
    advanced: true,
  }),
  tilt: scrub("Camera tilt", 1, { min: 0, max: 1, step: 0.05, group: "Look", advanced: true }),
};

const PRESETS = presets(CONTROLS, [
  { label: "Mosaic", values: { tileSize: 48, gap: 2, cornerRadius: 6, liftHeight: 40 } },
  { label: "Calm", values: { amplitude: 1, waveSpeed: 0.3, fadeTime: 1.5, liftHeight: 30 } },
  { label: "Ambient", values: { idleRipples: 2, tintStrength: 0.3 } },
]);

export function GridDemo({ children }: DemoProps) {
  const controls = useDemoControls(CONTROLS);
  const surface = useDemoSurface(
    children,
    <DocsScene slug="grid" photo={3} />,
  );

  const { tint, ...values } = controls.values;
  const props = { ...values, tint: hexToRgb(tint) };

  return (
    <>
      <Grid {...props} {...surface.props} />
      <StageHint label="Move your cursor to send waves" touchLabel="Drag to send waves" />
      <DemoControls
        title="Grid controls"
        controls={controls}
        presets={PRESETS}
        snippet={{ component: "Grid", props }}
      />
    </>
  );
}
