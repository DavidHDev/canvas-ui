"use client";

import { color, custom, presets, scrub, toggle } from "@/components/demos/control-schema";
import { ColorRow, DemoControls } from "@/components/demos/demo-controls";
import { StageHint } from "@/components/demos/demo-stage";
import { useDemoControls } from "@/hooks/use-demo-controls";
import { WireframeObject } from "@/components/docs/live/WireframeObject";
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

const whenNodes = (values: Record<string, unknown>) => values.nodes === true;

const CONTROLS = {
  src: custom(DEFAULT_MODEL, { group: "Object" }),
  scale: scrub("Size", 3, { min: 0.5, max: 6, step: 0.1, decimals: 1, group: "Object" }),
  autoRotate: toggle("Auto rotate", false, { group: "Object" }),
  lineColor: color("Line color", AUTO_COLOR, {
    auto: { label: "Auto", swatch: "currentColor" },
    group: "Lines",
  }),
  lineWidth: scrub("Line width", 1, { min: 0.25, max: 4, step: 0.05, group: "Lines" }),
  hiddenLines: scrub("Hidden lines", 0.22, { min: 0, max: 1, step: 0.01, group: "Lines" }),
  topology: scrub("Topology", 0.1, { min: 0, max: 1, step: 0.01, group: "Lines" }),
  background: backgroundControl("Lines"),
  nodes: toggle("Corner nodes", true, { group: "Highlights" }),
  nodeSize: scrub("Node size", 2.25, {
    min: 0.5,
    max: 8,
    step: 0.05,
    group: "Highlights",
    when: whenNodes,
  }),
  nodeColor: color("Accent", "#066aff", { group: "Highlights" }),
  glow: scrub("Glow", 0.6, { min: 0, max: 1, step: 0.01, group: "Highlights" }),
  scan: scrub("Scan", 0.6, { min: 0, max: 1.5, step: 0.01, group: "Highlights" }),
  creaseAngle: scrub("Crease angle", 30, {
    min: 1,
    max: 90,
    step: 1,
    decimals: 0,
    group: "Lines",
    advanced: true,
  }),
  depthFade: scrub("Depth fade", 0.5, {
    min: 0,
    max: 1,
    step: 0.01,
    group: "Lines",
    advanced: true,
  }),
  opacity: scrub("Opacity", 1, { min: 0, max: 1, step: 0.01, group: "Lines", advanced: true }),
  scanSpeed: scrub("Scan speed", 1, {
    min: 0,
    max: 4,
    step: 0.05,
    group: "Highlights",
    advanced: true,
  }),
  depth: scrub("Extrusion depth", 0.16, {
    min: 0.02,
    max: 0.8,
    step: 0.01,
    group: "Object",
    advanced: true,
  }),
  bevel: scrub("Bevel", 0, { min: 0, max: 1, step: 0.05, group: "Object", advanced: true }),
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
    label: "Blueprint",
    values: {
      lineColor: "#e8f0ff",
      background: "#14408f",
      nodeColor: "#ffffff",
      hiddenLines: 0.35,
      topology: 0.2,
      glow: 0.3,
      scan: 0.4,
    },
  },
  {
    label: "Neon",
    values: {
      lineColor: "#a5f3fc",
      background: "#05070d",
      nodeColor: "#22d3ee",
      lineWidth: 1.25,
      glow: 1,
      scan: 1.2,
    },
  },
  {
    label: "Drafting",
    values: { nodes: false, scan: 0, glow: 0, hiddenLines: 0.45, lineWidth: 1.25, depthFade: 0 },
  },
]);

export function WireframeObjectDemo() {
  const controls = useDemoControls(CONTROLS);
  const { setValue } = controls;
  const themeBackground = useThemeBackground();
  const { background: backgroundValue, src, ...values } = controls.values;
  const background = backgroundValue === "" ? null : backgroundValue;
  const textColor = themeBackground === "#ffffff" ? LIGHT_TEXT : DARK_TEXT;
  const model = useModelSource({
    src,
    setSrc: (next) => setValue("src", next),
    defaultSrc: DEFAULT_MODEL,
  });
  const props = { src, ...values };

  return (
    <>
      <WireframeObject
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
        title="Wireframe Object controls"
        controls={controls}
        presets={PRESETS}
        snippet={{
          component: "WireframeObject",
          props: background ? { ...props, background } : props,
        }}
        onReset={model.onReset}
        rows={{
          src: model.row,
          lineColor: (
            <ColorRow
              label="Line color"
              value={values.lineColor || textColor}
              displayValue={values.lineColor ? undefined : "Auto"}
              onValueChange={(next) => setValue("lineColor", next)}
              onReset={values.lineColor ? () => setValue("lineColor", AUTO_COLOR) : undefined}
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
  CONTROLS as WIREFRAME_OBJECT_CONTROLS,
  PRESETS as WIREFRAME_OBJECT_PRESETS,
};
