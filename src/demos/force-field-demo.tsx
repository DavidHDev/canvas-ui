"use client";

import {
  color,
  hexToRgb,
  presets,
  radio,
  scrub,
  toggle,
} from "@/components/demos/control-schema";
import { DemoControls } from "@/components/demos/demo-controls";
import { StageHint } from "@/components/demos/demo-stage";
import { useDemoSurface, type DemoProps } from "@/components/demos/demo-surface";
import { useDemoControls } from "@/hooks/use-demo-controls";
import { ForceField } from "@/components/docs/live/ForceField";
import { DocsScene } from "@/demos/scenes";

const CONTROLS = {
  color: color("Field color", "#26adff", { group: "Field" }),
  shape: radio(
    "Cells",
    "hexagon",
    [
      { value: "hexagon", label: "Hex" },
      { value: "triangle", label: "Triangle" },
      { value: "square", label: "Square" },
    ],
    { group: "Field" },
  ),
  cellScale: scrub("Cells across", 16, {
    min: 6,
    max: 60,
    step: 1,
    decimals: 0,
    group: "Field",
  }),
  gridOpacity: scrub("Lattice", 0.15, { min: 0, max: 1, step: 0.05, group: "Field" }),
  gridReveal: radio(
    "Show lattice",
    "click",
    [
      { value: "always", label: "Always" },
      { value: "hover", label: "Hover" },
      { value: "click", label: "Click" },
      { value: "both", label: "Both" },
    ],
    { group: "Cursor" },
  ),
  hoverCharge: scrub("Cell charge", 1.6, { min: 0, max: 2, step: 0.05, group: "Cursor" }),
  hoverGlow: scrub("Cursor glow", 0.25, { min: 0, max: 3, step: 0.05, group: "Cursor" }),
  hoverRadius: scrub("Cursor radius", 350, {
    min: 40,
    max: 600,
    step: 10,
    decimals: 0,
    group: "Cursor",
  }),
  rippleIntensity: scrub("Shockwave", 0.1, { min: 0, max: 8, step: 0.1, group: "Click" }),
  rippleSpeed: scrub("Wave speed", 0.5, { min: 0.1, max: 4, step: 0.05, group: "Click" }),
  refraction: scrub("Page bend", 30, {
    min: 0,
    max: 60,
    step: 1,
    decimals: 0,
    group: "Click",
  }),
  aberration: scrub("Color fringe", 2.5, { min: 0, max: 8, step: 0.1, group: "Click" }),
  hideOnHover: toggle("Clear around cursor", false, { group: "Cursor", advanced: true }),
  gridRevealStrength: scrub("Reveal brightness", 1.5, {
    min: 0,
    max: 3,
    step: 0.05,
    group: "Cursor",
    advanced: true,
  }),
  gridRevealRadius: scrub("Reveal radius", 250, {
    min: 60,
    max: 800,
    step: 10,
    decimals: 0,
    group: "Cursor",
    advanced: true,
  }),
  gridFade: scrub("Reveal fade", 0.35, {
    min: 0.02,
    max: 1,
    step: 0.01,
    group: "Cursor",
    advanced: true,
  }),
  rippleBlend: scrub("Wave softness", 1, {
    min: 0,
    max: 1,
    step: 0.02,
    group: "Click",
    advanced: true,
  }),
  edgeColor: color("Edge color", "#80ccff", { group: "Energy", advanced: true }),
  lineWidth: scrub("Line width", 0.03, {
    min: 0.01,
    max: 0.2,
    step: 0.005,
    group: "Energy",
    advanced: true,
  }),
  flowIntensity: scrub("Energy flow", 0, {
    min: 0,
    max: 4,
    step: 0.05,
    group: "Energy",
    advanced: true,
  }),
  flowSpeed: scrub("Flow speed", 0.5, {
    min: 0,
    max: 4,
    step: 0.05,
    group: "Energy",
    advanced: true,
  }),
  flashIntensity: scrub("Cell flicker", 0.1, {
    min: 0,
    max: 1,
    step: 0.02,
    group: "Energy",
    advanced: true,
  }),
  edgeGlow: scrub("Edge glow", 0.2, {
    min: 0,
    max: 4,
    step: 0.05,
    group: "Energy",
    advanced: true,
  }),
  bloom: scrub("Bloom", 1, { min: 0, max: 3, step: 0.05, group: "Energy", advanced: true }),
  haze: scrub("Heat haze", 0.5, { min: 0, max: 2, step: 0.05, group: "Page", advanced: true }),
  tint: scrub("Page tint", 0.1, { min: 0, max: 1, step: 0.02, group: "Page", advanced: true }),
  dim: scrub("Page dim", 0, { min: 0, max: 1, step: 0.02, group: "Page", advanced: true }),
  pageReact: scrub("Page reacts", 0, {
    min: 0,
    max: 1,
    step: 0.02,
    group: "Page",
    advanced: true,
  }),
  reveal: scrub("Materialize", 1, { min: 0, max: 1, step: 0.01, group: "Page", advanced: true }),
  grain: scrub("Grain", 0.2, { min: 0, max: 1, step: 0.02, group: "Page", advanced: true }),
};

const PRESETS = presets(CONTROLS, [
  {
    label: "Shield",
    values: { gridReveal: "always", gridOpacity: 0.3, flowIntensity: 1.2, edgeGlow: 1 },
  },
  {
    label: "Shockwave",
    values: { rippleIntensity: 2.5, refraction: 50, rippleSpeed: 0.8 },
  },
  {
    label: "Red alert",
    values: { color: "#ff4433", edgeColor: "#ffa08a", gridReveal: "both", rippleIntensity: 1.2 },
  },
]);

export function ForceFieldDemo({ children }: DemoProps) {
  const controls = useDemoControls(CONTROLS);
  const surface = useDemoSurface(
    children,
    <DocsScene slug="force-field" photo={3} />,
  );

  const { color: fieldColor, edgeColor, ...values } = controls.values;
  const props = {
    ...values,
    color: hexToRgb(fieldColor),
    edgeColor: hexToRgb(edgeColor),
  };

  return (
    <>
      <ForceField {...props} {...surface.props} />
      <StageHint
        gesture="click"
        label="Click to send a shockwave"
        touchLabel="Tap to send a shockwave"
      />
      <DemoControls
        title="Force Field controls"
        controls={controls}
        presets={PRESETS}
        snippet={{ component: "ForceField", props }}
      />
    </>
  );
}
