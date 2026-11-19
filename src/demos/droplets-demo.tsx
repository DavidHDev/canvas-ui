"use client";

import { color, hexToRgb, presets, scrub } from "@/components/demos/control-schema";
import { DemoControls } from "@/components/demos/demo-controls";
import { StageHint } from "@/components/demos/demo-stage";
import { useDemoSurface, type DemoProps } from "@/components/demos/demo-surface";
import { useDemoControls } from "@/hooks/use-demo-controls";
import { Droplets } from "@/components/docs/live/Droplets";
import { PhotoScene } from "@/demos/scenes";

const CONTROLS = {
  intensity: scrub("Rain", 0.5, { min: 0, max: 1.25, step: 0.05, group: "Rain" }),
  scale: scrub("Drop scale", 0.4, { min: 0.4, max: 2.5, step: 0.05, group: "Rain" }),
  refraction: scrub("Refraction", 0.2, {
    min: 0,
    max: 3,
    step: 0.1,
    decimals: 1,
    group: "Rain",
  }),
  fallSpeed: scrub("Fall speed", 1, {
    min: 0,
    max: 3,
    step: 0.1,
    decimals: 1,
    group: "Rain",
  }),
  blur: scrub("Fogged glass", 0, {
    min: 0,
    max: 4,
    step: 0.1,
    decimals: 1,
    group: "Glass",
  }),
  vignette: scrub("Vignette", 0, { min: 0, max: 1, step: 0.05, group: "Glass" }),
  tint: color("Tint", "#ffffff", { group: "Glass" }),
  tintStrength: scrub("Tint strength", 0, { min: 0, max: 1, step: 0.05, group: "Glass" }),
  interactionRadius: scrub("Wipe size", 0.3, {
    min: 0.02,
    max: 0.4,
    step: 0.01,
    group: "Wipe",
  }),
  interactionStrength: scrub("Wipe strength", 0.6, {
    min: 0,
    max: 1,
    step: 0.05,
    group: "Wipe",
  }),
  interactionDistortion: scrub("Wipe smear", 3, {
    min: 0,
    max: 3,
    step: 0.1,
    decimals: 1,
    group: "Wipe",
    advanced: true,
  }),
  speed: scrub("Animation speed", 1, {
    min: 0,
    max: 3,
    step: 0.1,
    decimals: 1,
    group: "Rain",
    advanced: true,
  }),
  dropWidth: scrub("Drop width", 1, {
    min: 0.4,
    max: 1.5,
    step: 0.05,
    group: "Rain",
    advanced: true,
  }),
  dropLength: scrub("Drop length", 1, {
    min: 0.4,
    max: 2.5,
    step: 0.05,
    group: "Rain",
    advanced: true,
  }),
  wiggle: scrub("Wiggle", 1, {
    min: 0,
    max: 2,
    step: 0.1,
    decimals: 1,
    group: "Rain",
    advanced: true,
  }),
  staticDrops: scrub("Static drops", 0.2, {
    min: 0,
    max: 3,
    step: 0.1,
    decimals: 1,
    group: "Rain",
    advanced: true,
  }),
};

const PRESETS = presets(CONTROLS, [
  { label: "Drizzle", values: { intensity: 0.25, scale: 0.8, staticDrops: 1.2 } },
  { label: "Downpour", values: { intensity: 1.2, refraction: 0.8, fallSpeed: 1.6 } },
  { label: "Foggy window", values: { blur: 2.4, intensity: 0.7, refraction: 0.6 } },
]);

export function DropletsDemo({ children }: DemoProps) {
  const controls = useDemoControls(CONTROLS);
  const surface = useDemoSurface(
    children,
    <PhotoScene slug="droplets" photo={3} />,
  );

  const { tint, ...values } = controls.values;
  const props = { ...values, tint: hexToRgb(tint) };

  return (
    <>
      <Droplets {...props} {...surface.props} />
      <StageHint
        label="Move your cursor to wipe the glass"
        touchLabel="Drag to wipe the glass"
      />
      <DemoControls
        title="Droplets controls"
        controls={controls}
        presets={PRESETS}
        snippet={{ component: "Droplets", props }}
      />
    </>
  );
}
