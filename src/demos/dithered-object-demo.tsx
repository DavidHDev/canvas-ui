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
import { DitheredObject } from "@/components/docs/live/DitheredObject";
import {
  DUCK_MODEL,
  ModelStatus,
  backgroundControl,
  stagingControls,
  useModelSource,
  useThemeBackground,
} from "@/demos/object-kit";

const DEFAULT_MODEL = DUCK_MODEL;

const whenDither = (values: Record<string, unknown>) => values.dither === true;

const CONTROLS = {
  src: custom(DEFAULT_MODEL, { group: "Object" }),
  scale: scrub("Size", 3, { min: 0.5, max: 6, step: 0.1, decimals: 1, group: "Object" }),
  autoRotate: toggle("Auto rotate", false, { group: "Object" }),
  dither: toggle("Dither", true, { group: "Dither" }),
  method: radio(
    "Pattern",
    "bayer",
    [
      { value: "bayer", label: "Bayer" },
      { value: "halftone", label: "Halftone" },
      { value: "floyd", label: "Diffusion" },
    ],
    { group: "Dither", when: whenDither },
  ),
  gridSize: scrub("Dot size", 4, {
    min: 1,
    max: 20,
    step: 1,
    decimals: 0,
    group: "Dither",
    when: whenDither,
  }),
  pixelSizeRatio: scrub("Pixelation", 1, {
    min: 1,
    max: 10,
    step: 1,
    decimals: 0,
    group: "Dither",
  }),
  grayscale: toggle("Grayscale", true, { group: "Dither" }),
  highlight: color("Highlight", "#066aff", { group: "Light" }),
  environmentIntensity: scrub("Environment", 0.1, {
    min: 0,
    max: 5,
    step: 0.1,
    decimals: 1,
    group: "Light",
  }),
  background: backgroundControl("Light"),
  invert: toggle("Invert", false, { group: "Dither", advanced: true }),
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
  { label: "Newsprint", values: { method: "halftone", gridSize: 6 } },
  { label: "Diffusion", values: { method: "floyd", gridSize: 2 } },
  { label: "Color", values: { grayscale: false, environmentIntensity: 1 } },
]);

export function DitheredObjectDemo() {
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
      <DitheredObject
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
        title="Dithered Object controls"
        controls={controls}
        presets={PRESETS}
        snippet={{
          component: "DitheredObject",
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

export { CONTROLS as DITHERED_OBJECT_CONTROLS, PRESETS as DITHERED_OBJECT_PRESETS };
