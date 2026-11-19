"use client";

import { color, custom, presets, scrub, toggle } from "@/components/demos/control-schema";
import { ColorRow, DemoControls } from "@/components/demos/demo-controls";
import { StageHint } from "@/components/demos/demo-stage";
import { useDemoControls } from "@/hooks/use-demo-controls";
import { InkObject } from "@/components/docs/live/InkObject";
import {
  DUCK_MODEL,
  ModelStatus,
  backgroundControl,
  stagingControls,
  useModelSource,
  useThemeBackground,
} from "@/demos/object-kit";

const DEFAULT_MODEL = DUCK_MODEL;
const AUTO_INK = "";

const whenInk = (values: Record<string, unknown>) => values.ink === true;

const CONTROLS = {
  src: custom(DEFAULT_MODEL, { group: "Object" }),
  scale: scrub("Size", 3, { min: 0.5, max: 6, step: 0.1, decimals: 1, group: "Object" }),
  autoRotate: toggle("Auto rotate", false, { group: "Object" }),
  ink: toggle("Ink render", true, { group: "Strokes" }),
  inkColor: color("Ink color", AUTO_INK, {
    auto: { label: "Auto" },
    group: "Strokes",
    when: whenInk,
  }),
  lineSpacing: scrub("Line spacing", 8, {
    min: 3,
    max: 32,
    step: 1,
    decimals: 0,
    group: "Strokes",
    when: whenInk,
  }),
  strokeWeight: scrub("Stroke weight", 1, {
    min: 0.1,
    max: 1.5,
    step: 0.05,
    group: "Strokes",
    when: whenInk,
  }),
  angle: scrub("Hatch angle", 0, {
    min: -90,
    max: 90,
    step: 1,
    decimals: 0,
    group: "Strokes",
    when: whenInk,
  }),
  bleed: scrub("Ink bleed", 0.35, { min: 0, max: 1, step: 0.01, group: "Paper", when: whenInk }),
  grain: scrub("Paper grain", 0.32, { min: 0, max: 1, step: 0.01, group: "Paper", when: whenInk }),
  wobble: scrub("Hand wobble", 0.3, { min: 0, max: 1, step: 0.01, group: "Paper", when: whenInk }),
  background: backgroundControl("Paper"),
  dashLength: scrub("Dash length", 14, {
    min: 4,
    max: 140,
    step: 1,
    decimals: 0,
    group: "Strokes",
    advanced: true,
    when: whenInk,
  }),
  variation: scrub("Dash breakup", 1, {
    min: 0,
    max: 2,
    step: 0.05,
    group: "Strokes",
    advanced: true,
    when: whenInk,
  }),
  invert: toggle("Invert", false, { group: "Strokes", advanced: true, when: whenInk }),
  contrast: scrub("Contrast", 2.2, {
    min: 0.2,
    max: 6,
    step: 0.1,
    decimals: 1,
    group: "Tone",
    advanced: true,
    when: whenInk,
  }),
  threshold: scrub("Threshold", 0.2, {
    min: 0,
    max: 1,
    step: 0.01,
    group: "Tone",
    advanced: true,
    when: whenInk,
  }),
  softness: scrub("Softness", 0.4, {
    min: 0,
    max: 1,
    step: 0.01,
    group: "Tone",
    advanced: true,
    when: whenInk,
  }),
  relief: scrub("Relief", 0.5, {
    min: 0,
    max: 2,
    step: 0.05,
    group: "Tone",
    advanced: true,
    when: whenInk,
  }),
  highlight: color("Highlight", "#066aff", { group: "Light", advanced: true }),
  environmentIntensity: scrub("Environment", 0.5, {
    min: 0,
    max: 5,
    step: 0.1,
    decimals: 1,
    group: "Light",
    advanced: true,
  }),
  roughness: scrub("Roughness", 0.35, {
    min: 0,
    max: 1,
    step: 0.01,
    group: "Light",
    advanced: true,
  }),
  depth: scrub("Extrusion depth", 0.08, {
    min: 0.01,
    max: 0.8,
    step: 0.01,
    group: "Object",
    advanced: true,
  }),
  ...stagingControls({
    floatIntensity: 0,
    rotationIntensity: 0,
    floatSpeed: 2,
    fov: 65,
    cameraDistance: 4.2,
    xOffset: 0,
    yOffset: 0,
  }),
};

const PRESETS = presets(CONTROLS, [
  { label: "Engraving", values: { lineSpacing: 4, strokeWeight: 0.6, wobble: 0.05, bleed: 0.1 } },
  { label: "Marker", values: { lineSpacing: 14, strokeWeight: 1.4, bleed: 0.7 } },
  { label: "Crosshatch", values: { angle: 45, dashLength: 60, variation: 0.3 } },
]);

export function InkObjectDemo() {
  const controls = useDemoControls(CONTROLS);
  const { setValue } = controls;
  const themeBackground = useThemeBackground();
  const { background: backgroundValue, src, ...values } = controls.values;
  const background = backgroundValue === "" ? null : backgroundValue;
  const autoInk = themeBackground === "#ffffff" ? "#111111" : "#f5f5f5";
  const model = useModelSource({
    src,
    setSrc: (next) => setValue("src", next),
    defaultSrc: DEFAULT_MODEL,
  });
  const props = { src, ...values };

  return (
    <>
      <InkObject
        {...props}
        background={background ?? ""}
        onLoad={model.onLoad}
        onError={model.onError}
        className="absolute inset-0"
        style={{ position: "absolute" }}
      />
      <ModelStatus status={model.status} />
      {model.status === "ready" ? <StageHint gesture="drag" /> : null}
      <DemoControls
        title="Ink Object controls"
        controls={controls}
        presets={PRESETS}
        snippet={{
          component: "InkObject",
          props: background ? { ...props, background } : props,
        }}
        onReset={model.onReset}
        rows={{
          src: model.row,
          inkColor: values.ink ? (
            <ColorRow
              label="Ink color"
              value={values.inkColor || autoInk}
              displayValue={values.inkColor ? undefined : "Auto"}
              onValueChange={(next) => setValue("inkColor", next)}
              onReset={values.inkColor ? () => setValue("inkColor", AUTO_INK) : undefined}
            />
          ) : undefined,
          background: (
            <ColorRow
              label="Paper"
              value={background ?? themeBackground}
              displayValue={background ? undefined : "Page"}
              onValueChange={(next) => setValue("background", next)}
              onReset={background !== null ? () => setValue("background", "") : undefined}
            />
          ),
        }}
      />
    </>
  );
}

export { CONTROLS as INK_OBJECT_CONTROLS, PRESETS as INK_OBJECT_PRESETS };
