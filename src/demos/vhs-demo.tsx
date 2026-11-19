"use client";

import { presets, scrub } from "@/components/demos/control-schema";
import { DemoControls } from "@/components/demos/demo-controls";
import { useDemoSurface, type DemoProps } from "@/components/demos/demo-surface";
import { useDemoControls } from "@/hooks/use-demo-controls";
import { VHS } from "@/components/docs/live/VHS";
import { PhotoScene } from "@/demos/scenes";

const CONTROLS = {
  wave: scrub("Tape wave", 1, { min: 0, max: 3, step: 0.05, group: "Tape" }),
  jitter: scrub("Line jitter", 0.25, { min: 0, max: 3, step: 0.05, group: "Tape" }),
  crease: scrub("Crease band", 0.1, { min: 0, max: 3, step: 0.05, group: "Tape" }),
  switching: scrub("Head noise", 0.05, { min: 0, max: 3, step: 0.05, group: "Tape" }),
  speed: scrub("Playback speed", 0.5, {
    min: 0,
    max: 4,
    step: 0.1,
    decimals: 1,
    group: "Tape",
  }),
  aberration: scrub("Color bleed", 2, {
    min: 0,
    max: 12,
    step: 0.5,
    decimals: 1,
    group: "Picture",
  }),
  bloom: scrub("Glow", 0.4, { min: 0, max: 1, step: 0.05, group: "Picture" }),
  grain: scrub("Static", 0.1, { min: 0, max: 0.5, step: 0.01, group: "Picture" }),
  scanlines: scrub("Scanlines", 0.1, { min: 0, max: 1, step: 0.05, group: "Picture" }),
  saturation: scrub("Saturation", 1, { min: 0, max: 2, step: 0.05, group: "Picture" }),
  barrel: scrub("CRT curve", 0, { min: 0, max: 1, step: 0.05, group: "Screen" }),
  vignette: scrub("Vignette", 0, { min: 0, max: 1, step: 0.05, group: "Screen" }),
  switchingHeight: scrub("Head noise height", 0.02, {
    min: 0,
    max: 0.2,
    step: 0.005,
    decimals: 3,
    group: "Tape",
    advanced: true,
  }),
  acBeat: scrub("Brightness roll", 1, {
    min: 0,
    max: 3,
    step: 0.05,
    group: "Picture",
    advanced: true,
  }),
  exposure: scrub("Exposure", 1, {
    min: 0.5,
    max: 2,
    step: 0.05,
    group: "Picture",
    advanced: true,
  }),
};

const PRESETS = presets(CONTROLS, [
  {
    label: "Worn tape",
    values: { wave: 2, jitter: 1, crease: 1.2, switching: 1, grain: 0.25 },
  },
  { label: "CRT", values: { barrel: 0.6, vignette: 0.5, scanlines: 0.5, bloom: 0.6 } },
  { label: "Faded", values: { saturation: 0.45, exposure: 1.15, aberration: 4 } },
]);

export function VHSDemo({ children }: DemoProps) {
  const controls = useDemoControls(CONTROLS);
  const surface = useDemoSurface(
    children,
    <PhotoScene slug="vhs" photo={0} />,
  );
  const props = controls.values;

  return (
    <>
      <VHS {...props} {...surface.props} />
      <DemoControls
        title="VHS controls"
        controls={controls}
        presets={PRESETS}
        snippet={{ component: "VHS", props }}
      />
    </>
  );
}
