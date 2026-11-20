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
import { Magnify } from "@/components/docs/live/Magnify";
import { DocsScene } from "@/demos/scenes";

const CONTROLS = {
  size: scrub("Lens size", 140, { min: 60, max: 260, step: 4, decimals: 0, group: "Lens" }),
  zoom: scrub("Zoom", 1.5, { min: 1, max: 4, step: 0.05, group: "Lens" }),
  follow: scrub("Follow speed", 0.25, { min: 0.02, max: 1, step: 0.02, group: "Lens" }),
  aberration: scrub("Color split", 0.8, { min: 0, max: 3, step: 0.05, group: "Lens" }),
  haze: scrub("Haze", 0.2, { min: 0, max: 1, step: 0.02, group: "Lens" }),
  color: color("Accent", "#cccccc", { group: "HUD" }),
  hud: scrub("HUD opacity", 0.8, { min: 0, max: 1, step: 0.02, group: "HUD" }),
  readout: toggle("Readout", true, { group: "HUD" }),
  ripples: toggle("Click ripples", true, { group: "Click" }),
  rippleBend: scrub("Ripple bend", 20, {
    min: 0,
    max: 120,
    step: 2,
    decimals: 0,
    group: "Click",
    when: (values) => values.ripples === true,
  }),
  rippleGlow: scrub("Ripple glow", 1, {
    min: 0,
    max: 2,
    step: 0.05,
    group: "Click",
    when: (values) => values.ripples === true,
  }),
  ring: toggle("Ring", true, { group: "HUD parts", advanced: true }),
  crosshair: toggle("Crosshair", true, { group: "HUD parts", advanced: true }),
  ticks: toggle("Ticks", true, { group: "HUD parts", advanced: true }),
  brackets: toggle("Brackets", true, { group: "HUD parts", advanced: true }),
  dot: toggle("Center dot", true, { group: "HUD parts", advanced: true }),
  grid: toggle("Grid", false, { group: "HUD parts", advanced: true }),
  rippleSpeed: scrub("Ripple speed", 900, {
    min: 200,
    max: 2400,
    step: 50,
    decimals: 0,
    group: "Ripple",
    advanced: true,
  }),
  rippleWidth: scrub("Ripple outline", 2, {
    min: 0.5,
    max: 24,
    step: 0.5,
    decimals: 1,
    group: "Ripple",
    advanced: true,
  }),
  rippleBendWidth: scrub("Bend band", 100, {
    min: 10,
    max: 240,
    step: 5,
    decimals: 0,
    group: "Ripple",
    advanced: true,
  }),
  scrollZoom: toggle("Scroll to zoom", false, { group: "Scroll zoom", advanced: true }),
  zoomModifier: radio(
    "Hold key",
    "shift",
    [
      { value: "shift", label: "Shift" },
      { value: "alt", label: "Alt" },
      { value: "ctrl", label: "Ctrl" },
      { value: "none", label: "None" },
    ],
    {
      group: "Scroll zoom",
      advanced: true,
      when: (values) => values.scrollZoom === true,
    },
  ),
};

const PRESETS = presets(CONTROLS, [
  {
    label: "Minimal",
    values: {
      crosshair: false,
      ticks: false,
      brackets: false,
      readout: false,
      dot: false,
      aberration: 0,
      haze: 0,
    },
  },
  { label: "Inspector", values: { size: 110, zoom: 2.6, grid: true, color: "#4ade80" } },
  { label: "Big lens", values: { size: 220, zoom: 1.3, hud: 0.4 } },
]);

export function MagnifyDemo({ children }: DemoProps) {
  const controls = useDemoControls(CONTROLS);
  const surface = useDemoSurface(children, <DocsScene slug="magnify" photo={2} />);

  const { color, ...values } = controls.values;
  const props = { ...values, color: hexToRgb(color) };

  return (
    <>
      <Magnify {...props} {...surface.props} />
      <StageHint
        label="Hover the fine print, click for a ripple"
        touchLabel="Drag over the fine print"
      />
      <DemoControls
        title="Magnify controls"
        controls={controls}
        presets={PRESETS}
        snippet={{ component: "Magnify", props }}
      />
    </>
  );
}
