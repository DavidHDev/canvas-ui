"use client";

import { color, custom, presets, scrub, toggle } from "@/components/demos/control-schema";
import { ColorRow, DemoControls } from "@/components/demos/demo-controls";
import { StageHint } from "@/components/demos/demo-stage";
import { useDemoControls } from "@/hooks/use-demo-controls";
import { LiquidObject } from "@/components/docs/live/LiquidObject";
import {
  BOLT_MODEL,
  ModelStatus,
  backgroundControl,
  stagingControls,
  useModelSource,
  useThemeBackground,
} from "@/demos/object-kit";

const DEFAULT_MODEL = BOLT_MODEL;

const CONTROLS = {
  src: custom(DEFAULT_MODEL, { group: "Object" }),
  scale: scrub("Size", 3, { min: 0.5, max: 6, step: 0.1, decimals: 1, group: "Object" }),
  orbit: toggle("Drag to orbit", true, { group: "Object" }),
  autoRotate: toggle("Auto rotate", false, { group: "Object" }),
  cursorSize: scrub("Cursor size", 1, { min: 0.05, max: 1, step: 0.01, group: "Liquid" }),
  cursorForce: scrub("Cursor force", 1, { min: 0, max: 3, step: 0.05, group: "Liquid" }),
  distortion: scrub("Distortion", 2, { min: 0, max: 3, step: 0.02, group: "Liquid" }),
  persistence: scrub("Ripple memory", 0.6, { min: 0, max: 1, step: 0.01, group: "Liquid" }),
  swirl: scrub("Swirl", 0.5, { min: 0, max: 1, step: 0.01, group: "Liquid" }),
  sheen: scrub("Shine", 1.6, { min: 0, max: 2, step: 0.02, group: "Surface" }),
  iridescence: scrub("Iridescence", 1.5, { min: 0, max: 2, step: 0.02, group: "Surface" }),
  aberration: scrub("Color fringe", 0.75, { min: 0, max: 1, step: 0.01, group: "Surface" }),
  tint: color("Tint", "", { auto: { label: "None" }, group: "Surface" }),
  highlight: color("Highlight", "#ffffff", { group: "Surface" }),
  background: backgroundControl("Surface"),
  splash: scrub("Splash", 1.2, { min: 0, max: 2, step: 0.02, group: "Liquid", advanced: true }),
  ambient: scrub("Idle drift", 1, { min: 0, max: 2, step: 0.02, group: "Liquid", advanced: true }),
  wobble: scrub("Wobble", 0, { min: 0, max: 2, step: 0.02, group: "Liquid", advanced: true }),
  grain: scrub("Grain", 1, { min: 0, max: 1, step: 0.01, group: "Surface", advanced: true }),
  gloss: scrub("Gloss", 0.65, { min: 0, max: 1, step: 0.01, group: "Surface", advanced: true }),
  metallic: scrub("Metallic", 0.15, { min: 0, max: 1, step: 0.01, group: "Surface", advanced: true }),
  brightness: scrub("Brightness", 1, { min: 0, max: 2, step: 0.02, group: "Surface", advanced: true }),
  saturation: scrub("Saturation", 1.2, {
    min: 0,
    max: 2,
    step: 0.02,
    group: "Surface",
    advanced: true,
  }),
  environmentIntensity: scrub("Environment", 1, {
    min: 0,
    max: 5,
    step: 0.1,
    decimals: 1,
    group: "Surface",
    advanced: true,
  }),
  depth: scrub("Extrusion depth", 0.05, {
    min: 0.02,
    max: 1,
    step: 0.01,
    group: "Object",
    advanced: true,
  }),
  bevel: scrub("Bevel", 0.5, { min: 0, max: 1, step: 0.01, group: "Object", advanced: true }),
  ...stagingControls({
    floatIntensity: 1,
    rotationIntensity: 0.5,
    floatSpeed: 1.5,
    fov: 60,
    cameraDistance: 4,
    xOffset: 0,
    yOffset: -0.2,
  }),
};

const PRESETS = presets(CONTROLS, [
  { label: "Chrome", values: { metallic: 0.9, iridescence: 0.4, saturation: 0.6, gloss: 0.9 } },
  { label: "Oil slick", values: { iridescence: 2, swirl: 0.9, aberration: 1 } },
  { label: "Calm", values: { distortion: 0.8, persistence: 0.3, ambient: 0.4, splash: 0.5 } },
]);

export function LiquidObjectDemo() {
  const controls = useDemoControls(CONTROLS);
  const { setValue } = controls;
  const themeBackground = useThemeBackground();
  const { background: backgroundValue, src, ...values } = controls.values;
  const background = backgroundValue === "" ? null : backgroundValue;
  const model = useModelSource({
    src,
    setSrc: (next) => setValue("src", next),
    defaultSrc: DEFAULT_MODEL,
  });
  const props = { src, ...values };

  return (
    <>
      <LiquidObject
        {...props}
        background={background ?? ""}
        onLoad={model.onLoad}
        onError={model.onError}
        className="absolute inset-0"
        style={{ position: "absolute" }}
      />
      <ModelStatus status={model.status} />
      {model.status === "ready" ? (
        <StageHint
          label="Move your cursor through the model"
          touchLabel="Drag through the model"
          autopilot
        />
      ) : null}
      <DemoControls
        title="Liquid Object controls"
        controls={controls}
        presets={PRESETS}
        snippet={{
          component: "LiquidObject",
          props: background ? { ...props, background } : props,
        }}
        onReset={model.onReset}
        rows={{
          src: model.row,
          background: (
            <ColorRow
              label="Background"
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

export { CONTROLS as LIQUID_OBJECT_CONTROLS, PRESETS as LIQUID_OBJECT_PRESETS };
