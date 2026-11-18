"use client";

import { type ReactNode } from "react";

import { color, radio, scrub, toggle } from "@/components/demos/control-schema";
import {
  ColorRow,
  DemoControls,
  SwitchRow,
  useDemoScrollbarGutter,
} from "@/components/demos/demo-controls";
import { useDemoControls } from "@/hooks/use-demo-controls";
import { Liquid } from "@/components/docs/live/Liquid";

const CONTROLS = {
  quality: radio("Quality", "medium", [
    { value: "low", label: "Low" },
    { value: "medium", label: "Medium" },
    { value: "high", label: "High" },
  ]),
  force: scrub("Force", 1.1, { min: 0, max: 5, step: 0.1, decimals: 1 }),
  radius: scrub("Radius", 0.3, { min: 0.05, max: 1.5, step: 0.05 }),
  curl: scrub("Curl", 1.9, { min: 0, max: 10, step: 0.1, decimals: 1 }),
  pressureIterations: scrub("Swirl", 4, {
    min: 1,
    max: 10,
    step: 1,
    decimals: 0,
  }),
  pressure: scrub("Pressure", 0.8, { min: 0, max: 1, step: 0.05 }),
  intensity: scrub("Intensity", 2, { min: 0, max: 10, step: 0.1, decimals: 1 }),
  distortion: scrub("Distortion", 0.4, { min: 0, max: 2, step: 0.05 }),
  blend: scrub("Blend", 5, { min: 0, max: 20, step: 0.5, decimals: 1 }),
  densityDissipation: scrub("Trail fade", 0.96, {
    min: 0.85,
    max: 1,
    step: 0.005,
    decimals: 3,
  }),
  velocityDissipation: scrub("Motion fade", 1, {
    min: 0.85,
    max: 1,
    step: 0.005,
    decimals: 3,
  }),
  color: color("Color", "#425bff"),
  rainbow: toggle("Rainbow", false),
  prism: toggle("Prism", false),
};

const RESOLUTION_PRESETS = {
  low: { simResolution: 32, dyeResolution: 128 },
  medium: { simResolution: 128, dyeResolution: 512 },
  high: { simResolution: 256, dyeResolution: 1024 },
} as const;

function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [
    ((value >> 16) & 255) / 255,
    ((value >> 8) & 255) / 255,
    (value & 255) / 255,
  ];
}

export function LiquidDemo({ children }: { children: ReactNode }) {
  const controls = useDemoControls(CONTROLS);
  const { setValue } = controls;
  const setContentEl = useDemoScrollbarGutter();

  const { color, rainbow, prism, quality, ...values } = controls.values;
  const resolution = RESOLUTION_PRESETS[quality];

  return (
    <>
      <Liquid
        {...values}
        {...resolution}
        color={hexToRgb(color)}
        rainbow={rainbow}
        prism={prism}
        className="page-enter inset-0 z-30"
        style={{ position: "fixed" }}
      >
        <div
          ref={setContentEl}
          className="min-h-full bg-background px-5 pt-24 pb-10 sm:px-8 lg:pt-16 lg:pr-8 lg:pl-72"
        >
          {children}
        </div>
      </Liquid>

      <DemoControls
        title="Liquid controls"
        snippet={{
          component: "Liquid",
          props: {
            ...values,
            ...resolution,
            color: hexToRgb(color),
            rainbow,
            prism,
          },
        }}
        controls={controls}
        rows={{
          color: (
            <div
              inert={rainbow || prism}
              className={rainbow || prism ? "pointer-events-none opacity-40" : ""}
            >
              <ColorRow
                label="Color"
                value={color}
                onValueChange={(next) => setValue("color", next)}
                onReset={
                  color !== CONTROLS.color.defaultValue
                    ? () => setValue("color", CONTROLS.color.defaultValue)
                    : undefined
                }
              />
            </div>
          ),
          rainbow: (
            <div
              inert={prism}
              className={prism ? "pointer-events-none opacity-40" : ""}
            >
              <SwitchRow
                label="Rainbow"
                checked={rainbow}
                onCheckedChange={(next) => setValue("rainbow", next)}
              />
            </div>
          ),
        }}
      />
    </>
  );
}
