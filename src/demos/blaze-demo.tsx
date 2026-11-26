"use client";

import { presets, radio, scrub } from "@/components/demos/control-schema";
import { DemoControls } from "@/components/demos/demo-controls";
import { StageHint } from "@/components/demos/demo-stage";
import { useDemoSurface, type DemoProps } from "@/components/demos/demo-surface";
import { useDemoControls } from "@/hooks/use-demo-controls";
import { Blaze } from "@/components/docs/live/Blaze";
import { DocsScene } from "@/demos/scenes";

const PALETTES = {
  fire: [],
  ember: ["#120302", "#5c0d0a", "#b3261e", "#f2643a", "#ffb08a"],
  gas: ["#020617", "#0b2a6f", "#2563eb", "#60a5fa", "#e0f2fe"],
  spirit: ["#03120a", "#064e3b", "#10b981", "#6ee7b7", "#ecfdf5"],
  violet: ["#0d0416", "#3b0764", "#9333ea", "#d8b4fe", "#faf5ff"],
} satisfies Record<string, string[]>;

const CONTROLS = {
  layer: radio(
    "Layer",
    "page",
    [
      { value: "page", label: "Heat haze" },
      { value: "background", label: "Behind" },
      { value: "foreground", label: "Over" },
    ],
    { group: "Fire" },
  ),
  palette: radio(
    "Palette",
    "fire",
    [
      { value: "fire", label: "Fire" },
      { value: "ember", label: "Ember" },
      { value: "gas", label: "Gas" },
      { value: "spirit", label: "Spirit" },
      { value: "violet", label: "Violet" },
    ],
    { group: "Fire" },
  ),
  height: scrub("Height", 0.8, { min: 0.2, max: 1, step: 0.01, group: "Fire" }),
  intensity: scrub("Intensity", 0.8, { min: 0, max: 1, step: 0.05, group: "Fire" }),
  glow: scrub("Glow", 0.6, { min: 0, max: 1, step: 0.05, group: "Fire" }),
  smoke: scrub("Smoke", 0.5, { min: 0, max: 1, step: 0.05, group: "Fire" }),
  haze: scrub("Heat haze", 0.5, {
    min: 0,
    max: 1,
    step: 0.05,
    group: "Fire",
    when: (values) => values.layer === "page",
  }),
  sparks: scrub("Embers", 0.6, { min: 0, max: 1, step: 0.05, group: "Embers" }),
  sparkSize: scrub("Ember size", 1, {
    min: 0.4,
    max: 3,
    step: 0.1,
    decimals: 1,
    group: "Embers",
  }),
  depth: scrub("Depth of field", 0.5, { min: 0, max: 1, step: 0.05, group: "Embers" }),
  stir: scrub("Cursor stir", 0.5, { min: 0, max: 1, step: 0.05, group: "Embers" }),
  turbulence: scrub("Turbulence", 0.5, {
    min: 0,
    max: 1,
    step: 0.05,
    group: "Motion",
  }),
  speed: scrub("Speed", 1, { min: 0.2, max: 2.5, step: 0.05, group: "Motion" }),
  scale: scrub("Billow size", 1, {
    min: 0.4,
    max: 2.5,
    step: 0.05,
    group: "Motion",
    advanced: true,
  }),
};

const PRESETS = presets(CONTROLS, [
  { label: "Hearth", values: { glow: 0.75, smoke: 0.65, sparks: 0.5, haze: 0.5 } },
  { label: "Embers", values: { height: 0.65, glow: 0.3, smoke: 0.15, sparks: 0.95, depth: 0.8 } },
  { label: "Heatwave", values: { glow: 0.4, smoke: 0.3, sparks: 0.25, haze: 1, height: 1 } },
  { label: "Blue flame", values: { palette: "gas", glow: 0.55, smoke: 0.35, sparks: 0.5 } },
  {
    label: "Inferno",
    values: { height: 1, intensity: 1, glow: 0.9, smoke: 0.85, sparks: 1, haze: 0.8, turbulence: 0.75, speed: 1.3 },
  },
]);

export function BlazeDemo({ children }: DemoProps) {
  const controls = useDemoControls(CONTROLS);
  const surface = useDemoSurface(children, <DocsScene slug="blaze" photo={0} />);

  const { palette, ...values } = controls.values;
  const props = { ...values, colors: PALETTES[palette] };
  const behind = values.layer === "background";

  return (
    <>
      <Blaze
        {...props}
        {...surface.props}
        className={[
          surface.props.className,
          behind ? "[&_[data-page-demo]]:bg-transparent" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      />
      <StageHint label="Move your cursor through the flames" touchLabel="Drag through the flames" />
      <DemoControls
        title="Blaze controls"
        controls={controls}
        presets={PRESETS}
        snippet={{ component: "Blaze", props }}
      />
    </>
  );
}
