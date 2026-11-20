"use client";

import { color, hexToRgb, presets, scrub } from "@/components/demos/control-schema";
import { DemoControls } from "@/components/demos/demo-controls";
import { StageHint } from "@/components/demos/demo-stage";
import { useDemoSurface, type DemoProps } from "@/components/demos/demo-surface";
import { useDemoControls } from "@/hooks/use-demo-controls";
import { Bubble } from "@/components/docs/live/Bubble";
import { DocsScene } from "@/demos/scenes";

const CONTROLS = {
  size: scrub("Size", 30, { min: 12, max: 140, step: 2, decimals: 0, group: "Droplet" }),
  trail: scrub("Trail length", 24, {
    min: 1,
    max: 24,
    step: 1,
    decimals: 0,
    group: "Droplet",
  }),
  follow: scrub("Follow speed", 0.5, { min: 0.02, max: 1, step: 0.02, group: "Droplet" }),
  blend: scrub("Merge sharpness", 14, {
    min: 1,
    max: 24,
    step: 0.5,
    decimals: 1,
    group: "Droplet",
  }),
  refraction: scrub("Refraction", 80, {
    min: -120,
    max: 120,
    step: 2,
    decimals: 0,
    group: "Glass",
  }),
  dispersion: scrub("Color split", 1, { min: 0, max: 3, step: 0.05, group: "Glass" }),
  frost: scrub("Frost", 0, { min: 0, max: 1, step: 0.02, group: "Glass" }),
  shine: scrub("Shine", 0.5, { min: 0, max: 2, step: 0.05, group: "Glass" }),
  iridescence: scrub("Sheen", 1, { min: 0, max: 2, step: 0.05, group: "Sheen" }),
  colorA: color("Sheen color A", "#4a74b8", { group: "Sheen" }),
  colorB: color("Sheen color B", "#69696a", { group: "Sheen" }),
  rim: scrub("Rim", 1, { min: 0, max: 2, step: 0.05, group: "Glass", advanced: true }),
  speed: scrub("Sheen speed", 2, {
    min: 0,
    max: 6,
    step: 0.1,
    decimals: 1,
    group: "Sheen",
    advanced: true,
  }),
  intensity: scrub("Sheen brightness", 0.9, {
    min: 0,
    max: 5,
    step: 0.1,
    decimals: 1,
    group: "Sheen",
    advanced: true,
  }),
  tint: color("Tint", "#ffffff", { group: "Tint", advanced: true }),
  tintStrength: scrub("Tint strength", 0, {
    min: 0,
    max: 1,
    step: 0.02,
    group: "Tint",
    advanced: true,
  }),
};

const PRESETS = presets(CONTROLS, [
  { label: "Soap", values: { size: 44, iridescence: 2, dispersion: 2, intensity: 1.4 } },
  {
    label: "Water",
    values: { iridescence: 0, dispersion: 0.3, refraction: 110, shine: 0.7, rim: 0.2 },
  },
  { label: "Frosted", values: { size: 56, frost: 0.6, iridescence: 0.4, trail: 12 } },
]);

export function BubbleDemo({ children }: DemoProps) {
  const controls = useDemoControls(CONTROLS);
  const surface = useDemoSurface(
    children,
    <DocsScene slug="bubble" photo={1} />,
  );

  const { tint, colorA, colorB, ...values } = controls.values;
  const props = {
    ...values,
    tint: hexToRgb(tint),
    colorA: hexToRgb(colorA),
    colorB: hexToRgb(colorB),
  };

  return (
    <>
      <Bubble {...props} {...surface.props} />
      <StageHint touchLabel="Drag to pull the droplet" />
      <DemoControls
        title="Bubble controls"
        controls={controls}
        presets={PRESETS}
        snippet={{ component: "Bubble", props }}
      />
    </>
  );
}
