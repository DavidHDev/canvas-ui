"use client";

import { color, custom, presets, scrub, toggle } from "@/components/demos/control-schema";
import { ColorRow, DemoControls } from "@/components/demos/demo-controls";
import { StageHint } from "@/components/demos/demo-stage";
import { useDemoControls } from "@/hooks/use-demo-controls";
import { ChromeObject } from "@/components/docs/live/ChromeObject";
import {
  LOGO_SVG,
  ModelStatus,
  backgroundControl,
  stagingControls,
  useModelSource,
  useThemeBackground,
} from "@/demos/object-kit";

const DEFAULT_MODEL = LOGO_SVG;

const CONTROLS = {
  src: custom(DEFAULT_MODEL, { group: "Object" }),
  scale: scrub("Size", 3, { min: 0.5, max: 6, step: 0.1, decimals: 1, group: "Object" }),
  autoRotate: toggle("Auto rotate", false, { group: "Object" }),
  roughness: scrub("Roughness", 0.08, { min: 0, max: 1, step: 0.01, group: "Metal" }),
  streaks: scrub("Brushed streaks", 0.25, { min: 0, max: 1, step: 0.01, group: "Metal" }),
  dispersion: scrub("Dispersion", 0.3, { min: 0, max: 1, step: 0.01, group: "Metal" }),
  tint: color("Tint", "", { auto: { label: "Silver", swatch: "#c8c8cc" }, group: "Metal" }),
  flow: scrub("Ripples", 0.5, { min: 0, max: 2, step: 0.05, group: "Reflections" }),
  cursorInfluence: scrub("Cursor pull", 1, {
    min: 0,
    max: 2,
    step: 0.05,
    group: "Reflections",
  }),
  environmentIntensity: scrub("Lighting", 1, {
    min: 0,
    max: 3,
    step: 0.05,
    group: "Reflections",
  }),
  highlight: color("Highlight", "#066aff", { group: "Reflections" }),
  background: backgroundControl("Reflections"),
  flowSpeed: scrub("Ripple speed", 0.4, {
    min: 0,
    max: 2,
    step: 0.05,
    group: "Reflections",
    advanced: true,
  }),
  flowScale: scrub("Ripple scale", 1.5, {
    min: 0.2,
    max: 5,
    step: 0.1,
    decimals: 1,
    group: "Reflections",
    advanced: true,
  }),
  depth: scrub("Extrusion depth", 0.12, {
    min: 0.04,
    max: 0.8,
    step: 0.01,
    group: "Object",
    advanced: true,
  }),
  bevel: scrub("Bevel", 1, { min: 0, max: 1, step: 0.05, group: "Object", advanced: true }),
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
    label: "Gold",
    values: { tint: "#e9c46a", highlight: "#ff8a3d", roughness: 0.12, dispersion: 0.1 },
  },
  {
    label: "Brushed",
    values: { roughness: 0.3, streaks: 0.9, flow: 0.15, dispersion: 0.05 },
  },
  {
    label: "Mercury",
    values: { roughness: 0, flow: 1.4, flowSpeed: 0.9, flowScale: 2.4, dispersion: 0.6 },
  },
]);

export function ChromeObjectDemo() {
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
      <ChromeObject
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
          label="Move your cursor to steer the reflections"
          touchLabel="Drag to rotate the chrome"
        />
      ) : null}
      <DemoControls
        title="Chrome Object controls"
        controls={controls}
        presets={PRESETS}
        snippet={{
          component: "ChromeObject",
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

export { CONTROLS as CHROME_OBJECT_CONTROLS, PRESETS as CHROME_OBJECT_PRESETS };
