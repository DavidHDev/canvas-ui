"use client";

import { presets, radio, scrub } from "@/components/demos/control-schema";
import { DemoControls } from "@/components/demos/demo-controls";
import { StageHint } from "@/components/demos/demo-stage";
import { useDemoSurface, type DemoProps } from "@/components/demos/demo-surface";
import { useDemoControls } from "@/hooks/use-demo-controls";
import { Ripple } from "@/components/docs/live/Ripple";
import { DocsScene } from "@/demos/scenes";

const CONTROLS = {
  trigger: radio(
    "Trigger",
    "click",
    [
      { value: "click", label: "Click" },
      { value: "hover", label: "Hover" },
      { value: "none", label: "None" },
    ],
    { group: "Waves" },
  ),
  amplitude: scrub("Wave height", 0.5, { min: 0, max: 3, step: 0.05, group: "Waves" }),
  wavelength: scrub("Wavelength", 80, {
    min: 8,
    max: 80,
    step: 1,
    decimals: 0,
    group: "Waves",
  }),
  rings: scrub("Rings", 2, { min: 1, max: 8, step: 1, decimals: 0, group: "Waves" }),
  speed: scrub("Speed", 0.65, { min: 0.2, max: 3, step: 0.05, group: "Waves" }),
  decay: scrub("Fade out", 1, { min: 0.2, max: 3, step: 0.05, group: "Waves" }),
  refraction: scrub("Refraction", 100, {
    min: 0,
    max: 160,
    step: 2,
    decimals: 0,
    group: "Water",
  }),
  dispersion: scrub("Color split", 0.5, { min: 0, max: 1, step: 0.02, group: "Water" }),
  shine: scrub("Crest glints", 0.5, { min: 0, max: 2, step: 0.05, group: "Water" }),
  interval: scrub("Raindrops every (s)", 0, {
    min: 0,
    max: 5,
    step: 0.25,
    group: "Water",
  }),
};

const PRESETS = presets(CONTROLS, [
  { label: "Raindrops", values: { interval: 0.75, amplitude: 0.35, rings: 3 } },
  { label: "Pond", values: { amplitude: 1, wavelength: 56, rings: 5, decay: 0.6 } },
  { label: "Wake", values: { trigger: "hover", amplitude: 0.35, rings: 1, decay: 1.6 } },
]);

export function RippleDemo({ children }: DemoProps) {
  const controls = useDemoControls(CONTROLS);
  const surface = useDemoSurface(
    children,
    <DocsScene slug="ripple" photo={1} />,
  );
  const props = controls.values;

  return (
    <>
      <Ripple {...props} {...surface.props} />
      <StageHint
        gesture="click"
        label="Click anywhere to make ripples"
        touchLabel="Tap anywhere to make ripples"
      />
      <DemoControls
        title="Ripple controls"
        controls={controls}
        presets={PRESETS}
        snippet={{ component: "Ripple", props }}
      />
    </>
  );
}
