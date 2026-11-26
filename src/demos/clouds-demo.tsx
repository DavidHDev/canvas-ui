"use client";

import {
  color,
  hexToRgb,
  presets,
  radio,
  scrub,
} from "@/components/demos/control-schema";
import { DemoControls } from "@/components/demos/demo-controls";
import { StageHint } from "@/components/demos/demo-stage";
import { useDemoSurface, type DemoProps } from "@/components/demos/demo-surface";
import { useDemoControls } from "@/hooks/use-demo-controls";
import { Clouds } from "@/components/docs/live/Clouds";
import { PhotoScene } from "@/demos/scenes";

const AUTO_COLOR = "auto";

const onPage = (values: Record<string, unknown>) => values.layer === "page";

const CONTROLS = {
  layer: radio(
    "Layer",
    "page",
    [
      { value: "page", label: "Over page" },
      { value: "background", label: "Behind" },
    ],
    { group: "Clouds" },
  ),
  cover: scrub("Coverage", 0.4, { min: 0, max: 1, step: 0.02, group: "Clouds" }),
  opacity: scrub("Thickness", 0.64, { min: 0, max: 1, step: 0.02, group: "Clouds" }),
  density: scrub("Definition", 2.5, {
    min: 0,
    max: 16,
    step: 0.5,
    decimals: 1,
    group: "Clouds",
  }),
  softness: scrub("Edge softness", 1, { min: 0, max: 1, step: 0.02, group: "Clouds" }),
  billow: scrub("Billow", 0, { min: 0, max: 1, step: 0.02, group: "Clouds" }),
  scale: scrub("Pattern scale", 1, { min: 0.3, max: 3, step: 0.05, group: "Clouds" }),
  legibility: scrub("Text legibility", 0.85, {
    min: 0,
    max: 1,
    step: 0.05,
    group: "Clouds",
    when: onPage,
  }),
  speed: scrub("Drift speed", 0.6, {
    min: 0,
    max: 5,
    step: 0.1,
    decimals: 1,
    group: "Wind",
  }),
  direction: scrub("Drift direction", 225, {
    min: 0,
    max: 360,
    step: 5,
    decimals: 0,
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
  linger: scrub("Trail linger", 0.7, {
    min: 0.1,
    max: 4,
    step: 0.1,
    decimals: 1,
    group: "Wind",
  }),
  color: color("Color", AUTO_COLOR, { auto: { label: "Auto" }, group: "Light" }),
  shading: scrub("Shading", 0.5, { min: 0, max: 1, step: 0.02, group: "Light" }),
  lightColor: color("Lit side", AUTO_COLOR, {
    auto: { label: "Auto" },
    group: "Light",
    advanced: true,
  }),
  shadeColor: color("Shaded side", AUTO_COLOR, {
    auto: { label: "Auto" },
    group: "Light",
    advanced: true,
  }),
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
    when: onPage,
  }),
  fogBlur: scrub("Fog blur", 0, {
    min: 0,
    max: 1,
    step: 0.02,
    group: "Fog",
    advanced: true,
    when: onPage,
  }),
  quality: scrub("Render scale", 1, { min: 0.2, max: 1, step: 0.05, group: "Fog", advanced: true }),
};

const PRESETS = presets(CONTROLS, [
  { label: "Overcast", values: { cover: 0.5, opacity: 0.85, shading: 0.7 } },
  { label: "Wisps", values: { cover: 0, density: 6, opacity: 0.55, scale: 1.6 } },
  { label: "Fog", values: { cover: 0.4, opacity: 0.8, fogBlur: 0.6, refraction: 24 } },
  {
    label: "Cumulus",
    values: {
      cover: 0.15,
      density: 8,
      softness: 0.1,
      billow: 0.8,
      opacity: 0.92,
      shading: 1,
      scale: 1.3,
    },
  },
  {
    label: "Storm",
    values: {
      color: "#6b7380",
      lightColor: "#b8bfcc",
      shadeColor: "#292e38",
      cover: 0.7,
      density: 5,
      softness: 0.6,
      billow: 0.7,
      opacity: 0.9,
      shading: 1,
    },
  },
  {
    label: "Dusk",
    values: {
      layer: "background",
      color: "#f2b89e",
      lightColor: "#ffebb8",
      shadeColor: "#5c4580",
      cover: 0.15,
      density: 8,
      softness: 0.15,
      billow: 0.8,
      opacity: 1,
      shading: 1,
    },
  },
]);

function tone(value: string) {
  return value === AUTO_COLOR ? ("auto" as const) : hexToRgb(value);
}

export function CloudsDemo({ children }: DemoProps) {
  const controls = useDemoControls(CONTROLS);
  const surface = useDemoSurface(
    children,
    <PhotoScene slug="clouds" photo={2} />,
  );

  const { color: base, lightColor, shadeColor, ...values } = controls.values;
  const props = {
    ...values,
    color: tone(base),
    lightColor: tone(lightColor),
    shadeColor: tone(shadeColor),
  };
  const behind = values.layer === "background";

  return (
    <>
      <Clouds
        {...props}
        {...surface.props}
        className={[
          surface.props.className,
          behind ? "[&_[data-page-demo]]:bg-transparent" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      />
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
