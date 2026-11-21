"use client";

import { useTheme } from "next-themes";

import {
  color,
  custom,
  presets,
  radio,
  scrub,
  toggle,
} from "@/components/demos/control-schema";
import { DemoControls } from "@/components/demos/demo-controls";
import { StageHint } from "@/components/demos/demo-stage";
import { useDemoSurface, type DemoProps } from "@/components/demos/demo-surface";
import { useDemoControls } from "@/hooks/use-demo-controls";
import { Canvas } from "@/components/docs/live/Canvas";
import { DocsScene } from "@/demos/scenes";
import { CANVAS_PRESETS, type CanvasPreset } from "@/lib/Canvas/CanvasVanilla";

const BASE = CANVAS_PRESETS.canvas;

const NIGHT = { color: "#1c1a17", shadow: "#7a7364" };
const BACKDROP = { light: "#e6e3dd", dark: "#050505" };

const CONTROLS = {
  preset: custom<CanvasPreset>("canvas", { group: "Sheet" }),
  layer: radio(
    "Layer",
    "foreground",
    [
      { value: "foreground", label: "Over" },
      { value: "background", label: "Behind" },
      { value: "page", label: "Printed" },
    ],
    { group: "Sheet" },
  ),
  insetX: scrub("Margin X", 0, {
    min: 0,
    max: 240,
    step: 4,
    decimals: 0,
    group: "Sheet",
    when: (values) => values.layer !== "foreground",
  }),
  insetY: scrub("Margin Y", 0, {
    min: 0,
    max: 240,
    step: 4,
    decimals: 0,
    group: "Sheet",
    when: (values) => values.layer !== "foreground",
  }),
  back: color("Backdrop", "", {
    auto: { label: "Theme" },
    group: "Sheet",
    when: (values) =>
      values.layer !== "foreground" &&
      (Number(values.insetX) > 0 || Number(values.insetY) > 0),
  }),
  interactive: toggle("Cursor light", true, { group: "Sheet" }),
  glow: scrub("Light strength", 0.15, {
    min: 0,
    max: 1,
    step: 0.05,
    group: "Sheet",
    when: (values) => values.interactive === true,
  }),
  radius: scrub("Light size", 550, {
    min: 80,
    max: 800,
    step: 10,
    decimals: 0,
    group: "Sheet",
    when: (values) => values.interactive === true,
  }),
  weave: scrub("Weave", BASE.weave, { min: 0, max: 1, step: 0.05, group: "Surface" }),
  weaveSize: scrub("Thread size", BASE.weaveSize, {
    min: 2,
    max: 12,
    step: 0.5,
    decimals: 1,
    group: "Surface",
  }),
  weaveOpen: scrub("Open weave", BASE.weaveOpen, { min: 0, max: 1, step: 0.05, group: "Surface" }),
  slub: scrub("Uneven threads", BASE.slub, { min: 0, max: 1, step: 0.05, group: "Surface" }),
  roughness: scrub("Grain", BASE.roughness, { min: 0, max: 1, step: 0.05, group: "Surface" }),
  fiber: scrub("Fibers", BASE.fiber, { min: 0, max: 1, step: 0.05, group: "Surface" }),
  strength: scrub("Strength", BASE.strength, { min: 0, max: 1, step: 0.05, group: "Finish" }),
  tint: scrub("Tint", BASE.tint, { min: 0, max: 1, step: 0.05, group: "Finish" }),
  color: color("Sheet color", "", { auto: { label: "Material" }, group: "Finish" }),
  shadow: color("Shadow color", "", { auto: { label: "Material" }, group: "Finish" }),
  wrinkles: scrub("Wrinkles", BASE.wrinkles, {
    min: 0,
    max: 1,
    step: 0.05,
    group: "Surface",
    advanced: true,
  }),
  crumples: scrub("Crumples", BASE.crumples, {
    min: 0,
    max: 1,
    step: 0.05,
    group: "Surface",
    advanced: true,
  }),
  folds: scrub("Folds", BASE.folds, {
    min: 0,
    max: 1,
    step: 0.05,
    group: "Surface",
    advanced: true,
  }),
  foldColumns: scrub("Fold columns", BASE.foldColumns, {
    min: 1,
    max: 8,
    step: 1,
    decimals: 0,
    group: "Surface",
    advanced: true,
  }),
  foldRows: scrub("Fold rows", BASE.foldRows, {
    min: 1,
    max: 6,
    step: 1,
    decimals: 0,
    group: "Surface",
    advanced: true,
  }),
  stains: scrub("Stains", BASE.stains, { min: 0, max: 1, step: 0.05, group: "Age", advanced: true }),
  burn: scrub("Burnt edges", BASE.burn, { min: 0, max: 1, step: 0.05, group: "Age", advanced: true }),
  curl: scrub("Rolled ends", BASE.curl, {
    min: 0,
    max: 120,
    step: 2,
    decimals: 0,
    group: "Age",
    advanced: true,
  }),
  angle: scrub("Light angle", BASE.angle, {
    min: 0,
    max: 360,
    step: 5,
    decimals: 0,
    group: "Finish",
    advanced: true,
  }),
  distortion: scrub("Distortion", BASE.distortion, {
    min: -1,
    max: 1,
    step: 0.05,
    group: "Finish",
    advanced: true,
  }),
  seed: scrub("Seed", BASE.seed, {
    min: 0,
    max: 1000,
    step: 1,
    decimals: 0,
    group: "Surface",
    advanced: true,
  }),
};

type MaterialKey = keyof typeof CONTROLS;

function material(preset: CanvasPreset) {
  const values = CANVAS_PRESETS[preset];
  const picked: Record<string, number | string> = { preset };
  for (const key of Object.keys(CONTROLS) as MaterialKey[]) {
    if (key in values && key !== "color" && key !== "shadow") {
      picked[key] = values[key as keyof typeof values] as number;
    }
  }
  return picked;
}

const PRESETS = presets(CONTROLS, [
  {
    label: "Folded print",
    values: {
      ...material("paper"),
      layer: "page",
      insetX: 56,
      insetY: 56,
      folds: 1,
      foldColumns: 4,
      foldRows: 2,
      roughness: 0.45,
      fiber: 0.4,
      wrinkles: 0.1,
      distortion: 0.15,
    },
  },
  { label: "Raw cotton", values: material("raw") },
  { label: "Linen", values: material("linen") },
  { label: "Burlap", values: material("burlap") },
  { label: "Paper", values: material("paper") },
  { label: "Scroll", values: material("scroll") },
]);

export function CanvasDemo({ children }: DemoProps) {
  const { resolvedTheme } = useTheme();
  const controls = useDemoControls(CONTROLS);
  const surface = useDemoSurface(children, <DocsScene slug="canvas" photo={1} />);

  const { color: sheet, shadow, back, ...values } = controls.values;
  const night = resolvedTheme === "dark" && values.layer === "background";
  const props = {
    ...values,
    preset: values.preset as CanvasPreset,
    back:
      back ||
      (values.insetX > 0 || values.insetY > 0
        ? BACKDROP[resolvedTheme === "dark" ? "dark" : "light"]
        : undefined),
    color: sheet || (night ? NIGHT.color : undefined),
    shadow: shadow || (night ? NIGHT.shadow : undefined),
  };
  const behind = values.layer === "background";

  return (
    <>
      <Canvas
        {...props}
        {...surface.props}
        className={[
          surface.props.className,
          behind ? "[&_[data-page-demo]]:bg-transparent" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      />
      <StageHint
        label="Move your cursor across the canvas"
        touchLabel="Drag across the canvas"
      />
      <DemoControls
        title="Canvas controls"
        controls={controls}
        presets={PRESETS}
        snippet={{ component: "Canvas", props }}
      />
    </>
  );
}
