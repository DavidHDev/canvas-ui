"use client";

import { color, hexToRgb, presets, scrub } from "@/components/demos/control-schema";
import { DemoControls } from "@/components/demos/demo-controls";
import { StageHint } from "@/components/demos/demo-stage";
import { useDemoSurface, type DemoProps } from "@/components/demos/demo-surface";
import { useDemoControls } from "@/hooks/use-demo-controls";
import { Clouds } from "@/components/docs/live/Clouds";
import { PhotoScene } from "@/demos/scenes";

const AUTO_COLOR = "auto";

const CONTROLS = {
  cover: scrub("Coverage", 0.4, { min: 0, max: 1, step: 0.02, group: "Clouds" }),
  opacity: scrub("Thickness", 0.64, { min: 0, max: 1, step: 0.02, group: "Clouds" }),
  density: scrub("Definition", 2.5, {
    min: 0,
    max: 16,
    step: 0.5,
    decimals: 1,
    group: "Clouds",
  }),
  scale: scrub("Pattern scale", 1, { min: 0.3, max: 3, step: 0.05, group: "Clouds" }),
  color: color("Color", AUTO_COLOR, { auto: { label: "Auto" }, group: "Clouds" }),
  speed: scrub("Drift speed", 0.6, {
    min: 0,
    max: 5,
    step: 0.1,
    decimals: 1,
    group: "Wind",
  }),
  wind: scrub("Cursor wind", 0.6, { min: 0, max: 1, step: 0.02, group: "Wind" }),
  windRadius: scrub("Wind radius", 350, {
    min: 40,
    max: 400,
    step: 10,
    decimals: 0,
    group: "Wind",
  }),
  shading: scrub("Shading", 0.1, { min: 0, max: 1, step: 0.02, group: "Light", advanced: true }),
  shadow: scrub("Shadow", 0.06, { min: 0, max: 1, step: 0.02, group: "Light", advanced: true }),
  shadowOffsetX: scrub("Shadow X", 200, {
    min: -300,
    max: 300,
    step: 10,
    decimals: 0,
    group: "Light",
    advanced: true,
  }),
  shadowOffsetY: scrub("Shadow Y", -10, {
    min: -300,
    max: 300,
    step: 10,
    decimals: 0,
    group: "Light",
    advanced: true,
  }),
  shadowSoftness: scrub("Shadow softness", 1, {
    min: 0,
    max: 1,
    step: 0.02,
    group: "Light",
    advanced: true,
  }),
  refraction: scrub("Refraction", 0, {
    min: 0,
    max: 80,
    step: 1,
    decimals: 0,
    group: "Fog",
    advanced: true,
  }),
  fogBlur: scrub("Fog blur", 0, { min: 0, max: 1, step: 0.02, group: "Fog", advanced: true }),
  quality: scrub("Render scale", 1, { min: 0.2, max: 1, step: 0.05, group: "Fog", advanced: true }),
};

const PRESETS = presets(CONTROLS, [
  { label: "Overcast", values: { cover: 0.5, opacity: 0.85, shading: 0.3 } },
  { label: "Wisps", values: { cover: 0, density: 6, opacity: 0.55, scale: 1.6 } },
  { label: "Fog", values: { cover: 0.4, opacity: 0.8, fogBlur: 0.6, refraction: 24 } },
]);

export function CloudsDemo({ children }: DemoProps) {
  const controls = useDemoControls(CONTROLS);
  const surface = useDemoSurface(
    children,
    <PhotoScene slug="clouds" photo={2} />,
  );

  const { color: tone, ...values } = controls.values;
  const props = {
    ...values,
    color: tone === AUTO_COLOR ? ("auto" as const) : hexToRgb(tone),
  };

  return (
    <>
      <Clouds {...props} {...surface.props} />
      <StageHint
        label="Move your cursor to part the clouds"
        touchLabel="Drag to part the clouds"
      />
      <DemoControls
        title="Clouds controls"
        controls={controls}
        presets={PRESETS}
        snippet={{ component: "Clouds", props }}
      />
    </>
  );
}
