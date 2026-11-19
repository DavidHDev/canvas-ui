"use client";

import { presets, scrub } from "@/components/demos/control-schema";
import { DemoControls } from "@/components/demos/demo-controls";
import { useDemoSurface, type DemoProps } from "@/components/demos/demo-surface";
import { useDemoControls } from "@/hooks/use-demo-controls";
import { Glitch } from "@/components/docs/live/Glitch";
import { DocsScene } from "@/demos/scenes";

const CONTROLS = {
  intensity: scrub("Intensity", 1, { min: 0, max: 2, step: 0.05, group: "Bursts" }),
  interval: scrub("Every (s)", 3, { min: 0, max: 8, step: 0.25, group: "Bursts" }),
  duration: scrub("Burst length (s)", 0.4, { min: 0.1, max: 2, step: 0.05, group: "Bursts" }),
  shift: scrub("Tear distance", 30, {
    min: 0,
    max: 120,
    step: 2,
    decimals: 0,
    group: "Distortion",
  }),
  rgbShift: scrub("RGB split", 4, {
    min: 0,
    max: 20,
    step: 0.5,
    decimals: 1,
    group: "Distortion",
  }),
  blocks: scrub("Corrupt blocks", 0.5, { min: 0, max: 1, step: 0.02, group: "Distortion" }),
  noise: scrub("Noise", 0.35, { min: 0, max: 1, step: 0.02, group: "Distortion" }),
  slices: scrub("Slices", 24, {
    min: 4,
    max: 80,
    step: 1,
    decimals: 0,
    group: "Distortion",
    advanced: true,
  }),
};

const PRESETS = presets(CONTROLS, [
  { label: "Subtle", values: { intensity: 0.5, interval: 5, rgbShift: 2, blocks: 0.15 } },
  { label: "Constant", values: { interval: 0, intensity: 0.6, noise: 0.5 } },
  { label: "Meltdown", values: { intensity: 2, interval: 1.5, duration: 0.9, shift: 80 } },
]);

export function GlitchDemo({ children }: DemoProps) {
  const controls = useDemoControls(CONTROLS);
  const surface = useDemoSurface(
    children,
    <DocsScene slug="glitch" photo={0} />,
  );
  const props = controls.values;

  return (
    <>
      <Glitch {...props} {...surface.props} />
      <DemoControls
        title="Glitch controls"
        controls={controls}
        presets={PRESETS}
        snippet={{ component: "Glitch", props }}
      />
    </>
  );
}
