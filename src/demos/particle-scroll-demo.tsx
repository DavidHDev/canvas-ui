"use client";

import { type ReactNode } from "react";

import { presets, scrub } from "@/components/demos/control-schema";
import { DemoControls } from "@/components/demos/demo-controls";
import { StageHint } from "@/components/demos/demo-stage";
import { PageDemoContent } from "@/components/demos/demo-surface";
import { useDemoControls } from "@/hooks/use-demo-controls";
import { ParticleScroll } from "@/components/docs/live/ParticleScroll";

const CONTROLS = {
  point: scrub("Dissolve line", 0.68, { min: 0.2, max: 1, step: 0.01, group: "Dissolve" }),
  band: scrub("Band height", 420, {
    min: 60,
    max: 800,
    step: 20,
    decimals: 0,
    group: "Dissolve",
  }),
  density: scrub("Grain density", 2, { min: 1.5, max: 8, step: 0.25, group: "Dissolve" }),
  size: scrub("Grain size", 1.25, { min: 0.5, max: 4, step: 0.25, group: "Dissolve" }),
  fade: scrub("Fade", 0.85, { min: 0, max: 1, step: 0.05, group: "Dissolve" }),
  spread: scrub("Spread", 220, {
    min: 0,
    max: 800,
    step: 20,
    decimals: 0,
    group: "Drift",
  }),
  gravity: scrub("Gravity", 0.35, { min: -1, max: 1, step: 0.05, group: "Drift" }),
  drift: scrub("Wind", 0.7, { min: 0, max: 1, step: 0.05, group: "Drift" }),
  swirl: scrub("Swirl", 60, { min: 0, max: 300, step: 10, decimals: 0, group: "Drift" }),
  stagger: scrub("Stagger", 0.7, { min: 0, max: 1, step: 0.05, group: "Drift", advanced: true }),
  settle: scrub("Settle time", 1.2, {
    min: 0.2,
    max: 3,
    step: 0.05,
    group: "Drift",
    advanced: true,
  }),
  smoothing: scrub("Scroll smoothing", 0.6, {
    min: 0,
    max: 1.5,
    step: 0.05,
    group: "Drift",
    advanced: true,
  }),
};

const PRESETS = presets(CONTROLS, [
  { label: "Sandstorm", values: { spread: 600, swirl: 220, drift: 1, gravity: 0.1 } },
  { label: "Fine dust", values: { density: 6, size: 0.75, fade: 1 } },
  { label: "Rising", values: { gravity: -0.6, swirl: 120, point: 0.5 } },
]);

export function ParticleScrollDemo({ children }: { children: ReactNode }) {
  const controls = useDemoControls(CONTROLS);
  const props = controls.values;

  return (
    <>
      <ParticleScroll {...props} className="page-enter inset-0 z-30" style={{ position: "fixed" }}>
        <PageDemoContent>{children}</PageDemoContent>
      </ParticleScroll>
      <StageHint gesture="scroll" label="Scroll and the page reassembles from sand" touchLabel="Swipe up to reassemble the page" />
      <DemoControls
        title="Particle Scroll controls"
        controls={controls}
        presets={PRESETS}
        snippet={{ component: "ParticleScroll", props }}
      />
    </>
  );
}
