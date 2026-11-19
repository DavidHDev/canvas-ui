"use client";

import {
  color,
  hexToRgb,
  presets,
  radio,
  scrub,
} from "@/components/demos/control-schema";
import { DemoControls } from "@/components/demos/demo-controls";
import { StageHint } from "@/components/demos/demo-stage";
import { useDemoSurface, type DemoProps } from "@/components/demos/demo-surface";
import { useDemoControls } from "@/hooks/use-demo-controls";
import { Asciify } from "@/components/docs/live/Asciify";
import { PhotoScene } from "@/demos/scenes";

const CONTROLS = {
  radius: scrub("Lens size", 0.4, { min: 0.1, max: 0.8, step: 0.01, group: "Lens" }),
  softness: scrub("Edge softness", 1, { min: 0, max: 1, step: 0.05, group: "Lens" }),
  strength: scrub("Coverage", 1, { min: 0, max: 1, step: 0.05, group: "Lens" }),
  followSpeed: scrub("Follow speed", 3, {
    min: 1,
    max: 20,
    step: 0.5,
    decimals: 1,
    group: "Lens",
  }),
  charset: radio(
    "Glyphs",
    "ascii",
    [
      { value: "ascii", label: "ASCII" },
      { value: "blocks", label: "Blocks" },
      { value: "binary", label: "Binary" },
    ],
    { group: "Characters" },
  ),
  scale: scrub("Glyph size", 2, {
    min: 1,
    max: 6,
    step: 0.5,
    decimals: 1,
    group: "Characters",
  }),
  contrast: scrub("Contrast", 1, { min: 0.5, max: 2, step: 0.05, group: "Characters" }),
  glow: scrub("Glow", 0.75, { min: 0, max: 1, step: 0.05, group: "Characters" }),
  aberration: scrub("Color fringe", 0.75, {
    min: 0,
    max: 1,
    step: 0.05,
    group: "Characters",
  }),
  baseStrength: scrub("Outside the lens", 0, {
    min: 0,
    max: 1,
    step: 0.05,
    group: "Lens",
    advanced: true,
  }),
  spacing: scrub("Glyph spacing", 1, {
    min: 0,
    max: 3,
    step: 1,
    decimals: 0,
    group: "Characters",
    advanced: true,
  }),
  brightness: scrub("Brightness", 0, {
    min: -0.5,
    max: 0.5,
    step: 0.05,
    group: "Characters",
    advanced: true,
  }),
  invert: scrub("Invert", 0, {
    min: 0,
    max: 1,
    step: 0.05,
    group: "Characters",
    advanced: true,
  }),
  background: color("Backdrop", "#000000", { group: "Backdrop", advanced: true }),
  backgroundOpacity: scrub("Backdrop opacity", 0, {
    min: 0,
    max: 1,
    step: 0.05,
    group: "Backdrop",
    advanced: true,
  }),
};

const PRESETS = presets(CONTROLS, [
  {
    label: "Terminal",
    values: { backgroundOpacity: 1, glow: 1, contrast: 1.3, aberration: 0.3 },
  },
  { label: "Blocks", values: { charset: "blocks", scale: 3, spacing: 0 } },
  { label: "Whole page", values: { baseStrength: 1, aberration: 0.3 } },
]);

export function AsciifyDemo({ children }: DemoProps) {
  const controls = useDemoControls(CONTROLS);
  const surface = useDemoSurface(
    children,
    <PhotoScene slug="asciify" photo={1} />,
  );

  const { charset, background, ...values } = controls.values;
  const props = { ...values, charset, background: hexToRgb(background) };

  return (
    <>
      <Asciify {...props} {...surface.props} />
      <StageHint label="Move your cursor over the photo" touchLabel="Drag across the photo" />
      <DemoControls
        title="Asciify controls"
        controls={controls}
        presets={PRESETS}
        snippet={{ component: "Asciify", props }}
      />
    </>
  );
}
