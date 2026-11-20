"use client";

import {
  color,
  custom,
  presets,
  radio,
  scrub,
  toggle,
} from "@/components/demos/control-schema";
import { ColorRow, DemoControls } from "@/components/demos/demo-controls";
import { StageHint } from "@/components/demos/demo-stage";
import { useDemoControls } from "@/hooks/use-demo-controls";
import { AsciiObject } from "@/components/docs/live/AsciiObject";
import {
  DUCK_MODEL,
  ModelStatus,
  backgroundControl,
  stagingControls,
  useModelSource,
  useThemeBackground,
} from "@/demos/object-kit";

const DEFAULT_MODEL = DUCK_MODEL;

export const CHARSETS: Record<string, string | undefined> = {
  full: undefined,
  simple: " .:-=+*#%@",
  digits: " .012345689",
};

const whenAscii = (values: Record<string, unknown>) => values.ascii === true;

const CONTROLS = {
  src: custom(DEFAULT_MODEL, { group: "Object" }),
  scale: scrub("Size", 3, { min: 0.5, max: 6, step: 0.1, decimals: 1, group: "Object" }),
  autoRotate: toggle("Auto rotate", false, { group: "Object" }),
  ascii: toggle("ASCII render", true, { group: "Characters" }),
  charsetChoice: radio(
    "Glyph set",
    "full",
    [
      { value: "full", label: "Full" },
      { value: "simple", label: "Simple" },
      { value: "digits", label: "Digits" },
    ],
    { group: "Characters", when: whenAscii },
  ),
  cellSize: scrub("Cell size", 10, {
    min: 4,
    max: 28,
    step: 1,
    decimals: 0,
    group: "Characters",
    when: whenAscii,
  }),
  colored: toggle("Scene colors", true, { group: "Characters", when: whenAscii }),
  color: color("Character color", "#ffffff", {
    group: "Characters",
    when: (values) => values.ascii === true && values.colored === false,
  }),
  contrast: scrub("Contrast", 1.5, {
    min: 0.5,
    max: 4,
    step: 0.1,
    decimals: 1,
    group: "Light",
  }),
  exposure: scrub("Exposure", 1, { min: 0, max: 3, step: 0.05, group: "Light" }),
  highlight: color("Highlight", "#066aff", { group: "Light" }),
  background: backgroundControl("Light"),
  invert: toggle("Invert", false, { group: "Characters", advanced: true, when: whenAscii }),
  cellAspect: scrub("Cell aspect", 0.6, {
    min: 0.35,
    max: 1.25,
    step: 0.05,
    group: "Characters",
    advanced: true,
  }),
  edgeContrast: scrub("Edge snap", 3, {
    min: 1,
    max: 6,
    step: 0.1,
    decimals: 1,
    group: "Characters",
    advanced: true,
  }),
  environmentIntensity: scrub("Environment", 1, {
    min: 0,
    max: 5,
    step: 0.1,
    decimals: 1,
    group: "Light",
    advanced: true,
  }),
  roughness: scrub("Roughness (−1 keeps model's)", -1, {
    min: -1,
    max: 1,
    step: 0.01,
    group: "Light",
    advanced: true,
  }),
  ...stagingControls({
    floatIntensity: 2,
    rotationIntensity: 1,
    floatSpeed: 2,
    fov: 65,
    cameraDistance: 4.2,
    xOffset: 0,
    yOffset: 0,
  }),
};

const PRESETS = presets(CONTROLS, [
  { label: "Fine", values: { cellSize: 6, contrast: 2 } },
  { label: "Chunky", values: { cellSize: 18, charsetChoice: "simple" } },
  {
    label: "Terminal",
    values: { colored: false, color: "#4ade80", background: "#0a0a0a", charsetChoice: "digits" },
  },
]);

export function AsciiObjectDemo() {
  const controls = useDemoControls(CONTROLS);
  const { setValue } = controls;
  const themeBackground = useThemeBackground();
  const { background: backgroundValue, charsetChoice, src, ...values } =
    controls.values;
  const background = backgroundValue === "" ? null : backgroundValue;
  const charset = CHARSETS[charsetChoice];
  const model = useModelSource({
    src,
    setSrc: (next) => setValue("src", next),
    defaultSrc: DEFAULT_MODEL,
  });

  const props = { src, ...values, ...(charset ? { charset } : {}) };

  return (
    <>
      <AsciiObject
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
        title="ASCII Object controls"
        controls={controls}
        presets={PRESETS}
        snippet={{
          component: "AsciiObject",
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

export { CONTROLS as ASCII_OBJECT_CONTROLS, PRESETS as ASCII_OBJECT_PRESETS };
