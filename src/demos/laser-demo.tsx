"use client";

import { type ReactNode } from "react";

import { color, hexToRgb, presets, scrub } from "@/components/demos/control-schema";
import { DemoControls } from "@/components/demos/demo-controls";
import { StageHint } from "@/components/demos/demo-stage";
import { PageDemoContent } from "@/components/demos/demo-surface";
import { useDemoControls } from "@/hooks/use-demo-controls";
import { Laser } from "@/components/docs/live/Laser";

const CONTROLS = {
  color: color("Color", "#0d59ff", { group: "Beam" }),
  offset: scrub("Distance from bottom", 140, {
    min: 0,
    max: 400,
    step: 4,
    decimals: 0,
    group: "Beam",
  }),
  width: scrub("Length", 0.55, { min: 0.1, max: 1, step: 0.05, group: "Beam" }),
  thickness: scrub("Core thickness", 6, {
    min: 0.5,
    max: 12,
    step: 0.5,
    decimals: 1,
    group: "Beam",
  }),
  glow: scrub("Glow", 2, { min: 0, max: 3, step: 0.05, group: "Beam" }),
  reveal: scrub("Reveal band", 400, {
    min: 0,
    max: 480,
    step: 8,
    decimals: 0,
    group: "Reveal",
  }),
  heat: scrub("Heat glow", 1.5, { min: 0, max: 1.5, step: 0.05, group: "Reveal" }),
  shimmer: scrub("Shimmer", 12, {
    min: 0,
    max: 12,
    step: 0.5,
    decimals: 1,
    group: "Reveal",
  }),
  reactivity: scrub("Scroll boost", 1, {
    min: 0,
    max: 3,
    step: 0.1,
    decimals: 1,
    group: "Reveal",
  }),
  core: scrub("Core brightness", 1, {
    min: 0,
    max: 2,
    step: 0.05,
    group: "Beam",
    advanced: true,
  }),
  radius: scrub("Glow reach", 20, {
    min: 1,
    max: 60,
    step: 1,
    decimals: 0,
    group: "Beam",
    advanced: true,
  }),
  wave: scrub("Waviness", 10, {
    min: 0,
    max: 24,
    step: 0.5,
    decimals: 1,
    group: "Beam",
    advanced: true,
  }),
  flicker: scrub("Flicker", 0.2, { min: 0, max: 1, step: 0.05, group: "Beam", advanced: true }),
  speed: scrub("Animation speed", 0.3, {
    min: 0,
    max: 4,
    step: 0.1,
    decimals: 1,
    group: "Beam",
    advanced: true,
  }),
  sparkle: scrub("Sparkle", 0.25, {
    min: 0,
    max: 2,
    step: 0.05,
    group: "Reveal",
    advanced: true,
  }),
};

const PRESETS = presets(CONTROLS, [
  { label: "Plasma", values: { color: "#ff3d7f", glow: 2.8, sparkle: 1, wave: 16 } },
  { label: "Scanner", values: { color: "#22c55e", width: 1, wave: 0, flicker: 0.05, heat: 0.6 } },
  { label: "Quiet", values: { glow: 0.8, heat: 0.5, shimmer: 3, sparkle: 0 } },
]);

export function LaserDemo({ children }: { children: ReactNode }) {
  const controls = useDemoControls(CONTROLS);

  const { color, ...values } = controls.values;
  const props = { ...values, color: hexToRgb(color) };

  return (
    <>
      <Laser {...props} className="page-enter inset-0 z-30" style={{ position: "fixed" }}>
        <PageDemoContent>{children}</PageDemoContent>
      </Laser>
      <StageHint gesture="scroll" label="Scroll to print the page through the beam" touchLabel="Swipe up to print through the beam" />
      <DemoControls
        title="Laser controls"
        controls={controls}
        presets={PRESETS}
        snippet={{ component: "Laser", props }}
      />
    </>
  );
}
