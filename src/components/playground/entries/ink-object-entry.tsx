"use client";

import { useState } from "react";
import { useTheme } from "next-themes";

import { color, scrub, toggle } from "@/components/demos/control-schema";
import { DemoControls } from "@/components/demos/demo-controls";
import {
  EntryPage,
  HERO_BLEED_CLASS,
  HERO_BLEED_SCALE,
  StatusPill,
  type EntryStatus,
} from "@/components/playground/entries/shared";
import { MockSite } from "@/components/playground/mock-site";
import { useDemoControls } from "@/hooks/use-demo-controls";
import { InkObject } from "@/lib/InkObject/InkObject";

const MODEL_URL = "/assets/models/bolt.glb";
const DEFAULT_HIGHLIGHT = "#066aff";
const LIGHT_INK = "#111111";
const DARK_INK = "#f5f5f5";
const AUTO_INK = "auto";

const whenInk = (values: Record<string, string | number | boolean>) =>
  values.ink === true;

const CONTROLS = {
  ink: toggle("Ink", true),
  invert: toggle("Invert", false, { when: whenInk }),
  autoRotate: toggle("Auto rotate", false),
  lineSpacing: scrub("Line spacing", 8, {
    min: 3,
    max: 32,
    step: 1,
    decimals: 0,
    when: whenInk,
  }),
  strokeWeight: scrub("Stroke weight", 1, {
    min: 0.1,
    max: 1.5,
    step: 0.05,
    when: whenInk,
  }),
  angle: scrub("Angle", 0, {
    min: -90,
    max: 90,
    step: 1,
    decimals: 0,
    when: whenInk,
  }),
  dashLength: scrub("Dash length", 14, {
    min: 4,
    max: 140,
    step: 1,
    decimals: 0,
    when: whenInk,
  }),
  variation: scrub("Dash breakup", 1, {
    min: 0,
    max: 2,
    step: 0.05,
    when: whenInk,
  }),
  bleed: scrub("Bleed", 0.35, { min: 0, max: 1, step: 0.01, when: whenInk }),
  grain: scrub("Grain", 0.32, { min: 0, max: 1, step: 0.01, when: whenInk }),
  wobble: scrub("Wobble", 0.3, { min: 0, max: 1, step: 0.01, when: whenInk }),
  relief: scrub("Relief", 0.5, { min: 0, max: 2, step: 0.05, when: whenInk }),
  contrast: scrub("Contrast", 2.2, {
    min: 0.2,
    max: 6,
    step: 0.1,
    decimals: 1,
    when: whenInk,
  }),
  threshold: scrub("Threshold", 0.2, {
    min: 0,
    max: 1,
    step: 0.01,
    when: whenInk,
  }),
  softness: scrub("Softness", 0.4, {
    min: 0,
    max: 1,
    step: 0.01,
    when: whenInk,
  }),
  environmentIntensity: scrub("Environment", 0.5, {
    min: 0,
    max: 5,
    step: 0.1,
    decimals: 1,
  }),
  roughness: scrub("Roughness", 0.35, { min: 0, max: 1, step: 0.01 }),
  depth: scrub("Depth", 0.08, { min: 0.01, max: 0.8, step: 0.01 }),
  scale: scrub("Scale", 3, { min: 0.5, max: 6, step: 0.1, decimals: 1 }),
  floatIntensity: scrub("Float", 0, { min: 0, max: 6, step: 0.1, decimals: 1 }),
  rotationIntensity: scrub("Rocking", 0, {
    min: 0,
    max: 4,
    step: 0.1,
    decimals: 1,
  }),
  floatSpeed: scrub("Float speed", 2, {
    min: 0,
    max: 8,
    step: 0.1,
    decimals: 1,
  }),
  fov: scrub("Field of view", 65, { min: 20, max: 100, step: 1, decimals: 0 }),
  cameraDistance: scrub("Camera distance", 4.2, {
    min: 2,
    max: 10,
    step: 0.1,
    decimals: 1,
  }),
  inkColor: color("Ink color", AUTO_INK, {
    auto: { label: "Auto", swatch: LIGHT_INK },
    when: whenInk,
  }),
  highlight: color("Highlight", DEFAULT_HIGHLIGHT),
};

export function InkObjectEntry() {
  const { resolvedTheme } = useTheme();
  const controls = useDemoControls(CONTROLS);
  const {
    highlight,
    inkColor: inkColorValue,
    ink,
    invert,
    autoRotate,
    ...values
  } = controls.values;
  const toggles = { ink, invert, autoRotate };
  const isDark = resolvedTheme === "dark";
  const inkColor =
    inkColorValue === AUTO_INK
      ? isDark
        ? DARK_INK
        : LIGHT_INK
      : inkColorValue;
  const [status, setStatus] = useState<EntryStatus>("loading");

  return (
    <>
      <EntryPage>
        <MockSite
          heroBleed
          heroMedia={
            <>
              <div
                className={`absolute inset-0 rounded-2xl ${
                  isDark ? "bg-[#0a0a0a]" : "bg-white"
                }`}
              />
              <div className={HERO_BLEED_CLASS}>
                <InkObject
                  src={MODEL_URL}
                  {...values}
                  {...toggles}
                  scale={values.scale * HERO_BLEED_SCALE}
                  zoom={false}
                  background=""
                  inkColor={inkColor}
                  highlight={highlight}
                  onLoad={() => setStatus("ready")}
                  onError={() => setStatus("error")}
                  className="h-full w-full"
                />
              </div>
              <StatusPill status={status} />
            </>
          }
        />
      </EntryPage>

      <DemoControls
        title="Ink Object controls"
        snippet={{
          component: "InkObject",
          props: { src: MODEL_URL, ...values, ...toggles, inkColor, highlight },
        }}
        controls={controls}
      />
    </>
  );
}
