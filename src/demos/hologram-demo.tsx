"use client";

import { type ReactNode } from "react";

import { scrub } from "@/components/demos/control-schema";
import {
  DemoControls,
  useDemoScrollbarGutter,
} from "@/components/demos/demo-controls";
import { useDemoControls } from "@/hooks/use-demo-controls";
import { Hologram } from "@/lib/Hologram/Hologram";

const CONTROLS = {
  intensity: scrub("Intensity", 1, { min: 0, max: 2, step: 0.05 }),
  speed: scrub("Speed", 0.5, { min: 0, max: 3, step: 0.1, decimals: 1 }),
  scanlines: scrub("Scanlines", 12, { min: 1, max: 30, step: 1, decimals: 0 }),
  rgbShift: scrub("RGB Shift", 2, { min: 0, max: 12, step: 0.5, decimals: 1 }),
  flicker: scrub("Flicker", 0.15, { min: 0, max: 1, step: 0.02 }),
  tint: scrub("Tint", 0.6, { min: 0, max: 1, step: 0.02 }),
  opacity: scrub("Opacity", 0.85, { min: 0, max: 1, step: 0.02 }),
  wave: scrub("Wave", 3, { min: 0, max: 15, step: 1, decimals: 0 }),
};

export function HologramDemo({ children }: { children: ReactNode }) {
  const controls = useDemoControls(CONTROLS);
  const values = controls.values;
  const setContentEl = useDemoScrollbarGutter();

  return (
    <>
      <Hologram
        {...values}
        className="page-enter inset-0 z-30"
        style={{ position: "fixed" }}
      >
        <div
          ref={setContentEl}
          className="min-h-full bg-background px-5 pt-24 pb-10 sm:px-8 lg:pt-16 lg:pr-8 lg:pl-72"
        >
          {children}
        </div>
      </Hologram>

      <DemoControls
        title="Hologram controls"
        snippet={{
          component: "Hologram",
          props: values,
        }}
        controls={controls}
      />
    </>
  );
}
