"use client";

import { type ReactNode } from "react";

import { presets, radio, scrub, toggle } from "@/components/demos/control-schema";
import { DemoControls } from "@/components/demos/demo-controls";
import { StageHint } from "@/components/demos/demo-stage";
import { PageDemoContent } from "@/components/demos/demo-surface";
import { useDemoControls } from "@/hooks/use-demo-controls";
import { Bend } from "@/components/docs/live/Bend";

const CONTROLS = {
  direction: radio(
    "Direction",
    "in",
    [
      { value: "in", label: "Inward" },
      { value: "out", label: "Outward" },
    ],
    { group: "Fold" },
  ),
  angle: scrub("Fold angle", 80, {
    min: 10,
    max: 160,
    step: 5,
    decimals: 0,
    group: "Fold",
  }),
  zone: scrub("Fold height", 240, {
    min: 60,
    max: 480,
    step: 10,
    decimals: 0,
    group: "Fold",
  }),
  rounding: scrub("Crease radius", 150, {
    min: 0,
    max: 480,
    step: 10,
    decimals: 0,
    group: "Fold",
  }),
  top: toggle("Top edge", true, { group: "Edges" }),
  bottom: toggle("Bottom edge", true, { group: "Edges" }),
  tilt: scrub("Cursor tilt", 0.5, { min: 0, max: 1, step: 0.05, group: "Edges" }),
  tumble: scrub("Overscroll tip", 0.5, {
    min: 0,
    max: 1,
    step: 0.05,
    group: "Edges",
  }),
  perspective: scrub("Perspective", 700, {
    min: 200,
    max: 2400,
    step: 50,
    decimals: 0,
    group: "Fold",
    advanced: true,
  }),
  ease: scrub("Flatten distance", 240, {
    min: 40,
    max: 800,
    step: 20,
    decimals: 0,
    group: "Motion",
    advanced: true,
  }),
  smoothing: scrub("Settle time", 0.1, {
    min: 0,
    max: 0.5,
    step: 0.01,
    group: "Motion",
    advanced: true,
  }),
};

const PRESETS = presets(CONTROLS, [
  { label: "Cube", values: { angle: 90, rounding: 0, zone: 200 } },
  { label: "Gentle", values: { angle: 40, rounding: 320, zone: 160 } },
  { label: "Outward", values: { direction: "out", angle: 60 } },
]);

export function BendDemo({ children }: { children: ReactNode }) {
  const controls = useDemoControls(CONTROLS);
  const props = controls.values;

  return (
    <>
      <Bend {...props} className="page-enter inset-0 z-30" style={{ position: "fixed" }}>
        <PageDemoContent>{children}</PageDemoContent>
      </Bend>
      <StageHint gesture="scroll" label="Scroll to fold the page edges" touchLabel="Swipe up to fold the page edges" />
      <DemoControls
        title="Bend controls"
        controls={controls}
        presets={PRESETS}
        snippet={{ component: "Bend", props }}
      />
    </>
  );
}
