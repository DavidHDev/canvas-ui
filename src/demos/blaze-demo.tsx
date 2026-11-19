"use client";

import { color, hexToRgb, presets, scrub } from "@/components/demos/control-schema";
import { DemoControls } from "@/components/demos/demo-controls";
import { useDemoSurface, type DemoProps } from "@/components/demos/demo-surface";
import { useDemoControls } from "@/hooks/use-demo-controls";
import { Blaze } from "@/components/docs/live/Blaze";
import { DocsScene } from "@/demos/scenes";

const CONTROLS = {
  height: scrub("Flame height", 0.97, { min: 0.1, max: 1, step: 0.01, group: "Fire" }),
  glow: scrub("Glow", 2.5, { min: 0, max: 3, step: 0.1, decimals: 1, group: "Fire" }),
  smoke: scrub("Smoke", 0.8, { min: 0, max: 2, step: 0.05, group: "Fire" }),
  distortion: scrub("Heat haze", 0.6, {
    min: 0,
    max: 3,
    step: 0.1,
    decimals: 1,
    group: "Fire",
  }),
  speed: scrub("Speed", 1, { min: 0, max: 3, step: 0.1, decimals: 1, group: "Fire" }),
  sparks: scrub("Sparks", 0.7, { min: 0, max: 2, step: 0.05, group: "Sparks" }),
  sparkDensity: scrub("Spark density", 1.5, {
    min: 0.3,
    max: 3,
    step: 0.05,
    group: "Sparks",
  }),
  sparkSize: scrub("Spark size", 1, { min: 0.5, max: 3, step: 0.05, group: "Sparks" }),
  spark: color("Spark color", "#ff660d", { group: "Color" }),
  smokeColor: color("Smoke & glow", "#ff6e1a", { group: "Color" }),
  distortionScale: scrub("Haze detail", 0.5, {
    min: 0.3,
    max: 3,
    step: 0.05,
    group: "Fire",
    advanced: true,
  }),
  layers: scrub("Spark layers", 4, {
    min: 1,
    max: 10,
    step: 1,
    decimals: 0,
    group: "Sparks",
    advanced: true,
  }),
};

const PRESETS = presets(CONTROLS, [
  {
    label: "Embers",
    values: { height: 0.45, glow: 1, smoke: 0.2, distortion: 0.3, sparks: 1.2 },
  },
  {
    label: "Inferno",
    values: { glow: 2.6, smoke: 1.2, distortion: 1.6, sparks: 1, speed: 1.4 },
  },
  {
    label: "Blue flame",
    values: { spark: "#3d8bff", smokeColor: "#2463ff", glow: 2, smoke: 0.3 },
  },
]);

export function BlazeDemo({ children }: DemoProps) {
  const controls = useDemoControls(CONTROLS);
  const surface = useDemoSurface(
    children,
    <DocsScene slug="blaze" photo={0} />,
  );

  const { spark, smokeColor, ...values } = controls.values;
  const props = {
    ...values,
    sparkColor: hexToRgb(spark),
    smokeColor: hexToRgb(smokeColor),
  };

  return (
    <>
      <Blaze {...props} {...surface.props} />
      <DemoControls
        title="Blaze controls"
        controls={controls}
        presets={PRESETS}
        snippet={{ component: "Blaze", props }}
      />
    </>
  );
}
