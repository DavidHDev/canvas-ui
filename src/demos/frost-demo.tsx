"use client";

import { useMemo } from "react";

import { color, hexToRgb, presets, scrub, toggle } from "@/components/demos/control-schema";
import { DemoControls } from "@/components/demos/demo-controls";
import { StageHint } from "@/components/demos/demo-stage";
import { useDemoSurface, type DemoProps } from "@/components/demos/demo-surface";
import { useDemoControls } from "@/hooks/use-demo-controls";
import { Frost } from "@/components/docs/live/Frost";
import { PhotoScene } from "@/demos/scenes";

const CONTROLS = {
  strength: scrub("Frost amount", 0.7, {
    min: 0,
    max: 4,
    step: 0.1,
    decimals: 1,
    group: "Ice",
  }),
  opacity: scrub("Opacity", 0.6, { min: 0, max: 1, step: 0.05, group: "Ice" }),
  haze: scrub("Haze", 0.5, { min: 0, max: 1, step: 0.05, group: "Ice" }),
  refraction: scrub("Refraction", 1, {
    min: 0,
    max: 3,
    step: 0.1,
    decimals: 1,
    group: "Ice",
  }),
  highlight: scrub("Sparkle", 0.3, { min: 0, max: 1, step: 0.05, group: "Ice" }),
  meltRadius: scrub("Melt size", 0.25, { min: 0.05, max: 0.5, step: 0.01, group: "Melt" }),
  meltStrength: scrub("Melt speed", 0.75, { min: 0.05, max: 1, step: 0.05, group: "Melt" }),
  refreeze: scrub("Refreeze speed", 2, {
    min: 0,
    max: 10,
    step: 0.5,
    decimals: 1,
    group: "Melt",
  }),
  meltNoise: scrub("Melt edge noise", 0.25, { min: 0, max: 0.5, step: 0.01, group: "Melt" }),
  meltEdges: toggle("Melt pane edges", true, { group: "Melt", advanced: true }),
  tintThin: color("Thin ice", "#bec7f3", { group: "Color" }),
  tintThick: color("Thick ice", "#d5dfff", { group: "Color" }),
  tintBrightness: scrub("Tint brightness", 1.1, {
    min: 0.5,
    max: 1.5,
    step: 0.01,
    group: "Color",
  }),
  tintStrength: scrub("Tint amount", 0.3, { min: 0, max: 1, step: 0.05, group: "Color" }),
  frost: scrub("Base coverage", 0.05, {
    min: 0,
    max: 1,
    step: 0.05,
    group: "Ice",
    advanced: true,
  }),
  contrast: scrub("Pattern contrast", 3, {
    min: 0.5,
    max: 4,
    step: 0.1,
    decimals: 1,
    group: "Ice",
    advanced: true,
  }),
  crispness: scrub("Edge crispness", 1, {
    min: 0.5,
    max: 4,
    step: 0.1,
    decimals: 1,
    group: "Ice",
    advanced: true,
  }),
  detail: scrub("Surface detail", 2, {
    min: 0,
    max: 6,
    step: 0.1,
    decimals: 1,
    group: "Ice",
    advanced: true,
  }),
  textureScale: scrub("Texture scale", 2, {
    min: 0.3,
    max: 3,
    step: 0.05,
    group: "Ice",
    advanced: true,
  }),
  shimmer: scrub("Twinkle", 0, { min: 0, max: 1, step: 0.05, group: "Ice", advanced: true }),
};

const PRESETS = presets(CONTROLS, [
  { label: "Light frost", values: { strength: 0.4, opacity: 0.45, haze: 0.25 } },
  { label: "Deep freeze", values: { strength: 2, opacity: 0.85, frost: 0.3, refreeze: 0.5 } },
  { label: "Sparkling", values: { highlight: 0.8, shimmer: 0.7, tintStrength: 0.5 } },
]);

function brighten(hex: string, brightness: number): [number, number, number] {
  const [r, g, b] = hexToRgb(hex);
  const scale = (value: number) => Math.round(value * brightness * 100) / 100;
  return [scale(r), scale(g), scale(b)];
}

export function FrostDemo({ children }: DemoProps) {
  const controls = useDemoControls(CONTROLS);
  const surface = useDemoSurface(
    children,
    <PhotoScene slug="frost" photo={2} />,
  );

  const { tintThin, tintThick, tintBrightness, ...values } = controls.values;
  const thin = useMemo(() => brighten(tintThin, tintBrightness), [tintThin, tintBrightness]);
  const thick = useMemo(() => brighten(tintThick, tintBrightness), [tintThick, tintBrightness]);
  const props = { ...values, tintThin: thin, tintThick: thick };

  return (
    <>
      <Frost {...props} {...surface.props} />
      <StageHint label="Move your cursor to melt the ice" touchLabel="Drag to melt the ice" />
      <DemoControls
        title="Frost controls"
        controls={controls}
        presets={PRESETS}
        snippet={{ component: "Frost", props }}
      />
    </>
  );
}
