"use client";

import { color, custom, presets, scrub, toggle } from "@/components/demos/control-schema";
import { ColorRow, DemoControls } from "@/components/demos/demo-controls";
import { StageHint } from "@/components/demos/demo-stage";
import { useDemoControls } from "@/hooks/use-demo-controls";
import { TopographicObject } from "@/components/docs/live/TopographicObject";
import {
  LOGO_SVG,
  ModelStatus,
  backgroundControl,
  stagingControls,
  useModelSource,
  useThemeBackground,
} from "@/demos/object-kit";

const DEFAULT_MODEL = LOGO_SVG;
const AUTO_COLOR = "";
const LIGHT_TEXT = "#0a0a0a";
const DARK_TEXT = "#fafafa";

const whenIndex = (values: Record<string, unknown>) => Number(values.indexEvery) > 0;

const CONTROLS = {
  src: custom(DEFAULT_MODEL, { group: "Object" }),
  scale: scrub("Size", 3, { min: 0.5, max: 6, step: 0.1, decimals: 1, group: "Object" }),
  autoRotate: toggle("Auto rotate", false, { group: "Object" }),
  lines: scrub("Contours", 14, { min: 4, max: 48, step: 1, decimals: 0, group: "Lines" }),
  indexEvery: scrub("Index every", 5, {
    min: 0,
    max: 10,
    step: 1,
    decimals: 0,
    group: "Lines",
  }),
  lineWidth: scrub("Line width", 1, { min: 0.25, max: 3, step: 0.05, group: "Lines" }),
  drift: scrub("Drift", 0, { min: 0, max: 2, step: 0.05, group: "Lines" }),
  lineColor: color("Line color", AUTO_COLOR, {
    auto: { label: "Auto", swatch: "currentColor" },
    group: "Surface",
  }),
  indexColor: color("Index color", AUTO_COLOR, {
    auto: { label: "Auto", swatch: "currentColor" },
    group: "Surface",
    when: whenIndex,
  }),
  fill: scrub("Surface tone", 0.5, { min: 0, max: 1, step: 0.01, group: "Surface" }),
  shading: scrub("Shading", 0.5, { min: 0, max: 1, step: 0.01, group: "Surface" }),
  background: backgroundControl("Surface"),
  indexWidth: scrub("Index width", 1.5, {
    min: 0.25,
    max: 4,
    step: 0.05,
    group: "Lines",
    advanced: true,
    when: whenIndex,
  }),
  outline: scrub("Outline", 1, {
    min: 0,
    max: 1,
    step: 0.01,
    group: "Surface",
    advanced: true,
  }),
  depth: scrub("Relief height", 0.14, {
    min: 0.02,
    max: 0.5,
    step: 0.01,
    group: "Object",
    advanced: true,
  }),
  ...stagingControls({
    floatIntensity: 1,
    rotationIntensity: 1,
    floatSpeed: 2,
    fov: 55,
    cameraDistance: 4,
    xOffset: 0,
    yOffset: 0,
  }),
};

const PRESETS = presets(CONTROLS, [
  {
    label: "Survey",
    values: {
      lineColor: "#b07a4f",
      indexColor: "#7c4a2a",
      background: "#f4eee1",
      fill: 0.35,
    },
  },
  {
    label: "Night",
    values: {
      lineColor: "#5eead4",
      indexColor: "#ccfbf1",
      background: "#0b1220",
      fill: 0.4,
    },
  },
  {
    label: "Rising",
    values: { drift: 0.6, lines: 24, indexEvery: 6, fill: 0.7 },
  },
]);

export function TopographicObjectDemo() {
  const controls = useDemoControls(CONTROLS);
  const { setValue } = controls;
  const themeBackground = useThemeBackground();
  const { background: backgroundValue, src, ...values } = controls.values;
  const background = backgroundValue === "" ? null : backgroundValue;
  const textColor = themeBackground === "#ffffff" ? LIGHT_TEXT : DARK_TEXT;
  const lineColor = values.lineColor || textColor;
  const model = useModelSource({
    src,
    setSrc: (next) => setValue("src", next),
    defaultSrc: DEFAULT_MODEL,
  });
  const props = { src, ...values };

  return (
    <>
      <TopographicObject
        {...props}
        background={background ?? ""}
        onLoad={model.onLoad}
        onError={model.onError}
        className="absolute inset-0 text-foreground"
        style={{ position: "absolute" }}
      />
      <ModelStatus status={model.status} />
      {model.status === "ready" ? <StageHint gesture="drag" /> : null}
      <DemoControls
        title="Topographic Object controls"
        controls={controls}
        presets={PRESETS}
        snippet={{
          component: "TopographicObject",
          props: background ? { ...props, background } : props,
        }}
        onReset={model.onReset}
        rows={{
          src: model.row,
          lineColor: (
            <ColorRow
              label="Line color"
              value={lineColor}
              displayValue={values.lineColor ? undefined : "Auto"}
              onValueChange={(next) => setValue("lineColor", next)}
              onReset={values.lineColor ? () => setValue("lineColor", AUTO_COLOR) : undefined}
            />
          ),
          indexColor: (
            <ColorRow
              label="Index color"
              value={values.indexColor || lineColor}
              displayValue={values.indexColor ? undefined : "Auto"}
              onValueChange={(next) => setValue("indexColor", next)}
              onReset={
                values.indexColor ? () => setValue("indexColor", AUTO_COLOR) : undefined
              }
            />
          ),
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

export {
  CONTROLS as TOPOGRAPHIC_OBJECT_CONTROLS,
  PRESETS as TOPOGRAPHIC_OBJECT_PRESETS,
};
