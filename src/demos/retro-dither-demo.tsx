"use client";

import { color, hexToRgb, presets, radio, scrub } from "@/components/demos/control-schema";
import { DemoControls } from "@/components/demos/demo-controls";
import { StageHint } from "@/components/demos/demo-stage";
import { useDemoSurface, type DemoProps } from "@/components/demos/demo-surface";
import { useDemoControls } from "@/hooks/use-demo-controls";
import { RetroDither } from "@/components/docs/live/RetroDither";
import { PhotoScene } from "@/demos/scenes";

const CONTROLS = {
  radius: scrub("Lens size", 0.5, { min: 0.1, max: 0.8, step: 0.01, group: "Lens" }),
  softness: scrub("Edge softness", 1, { min: 0, max: 1, step: 0.05, group: "Lens" }),
  strength: scrub("Coverage", 0.75, { min: 0, max: 1, step: 0.05, group: "Lens" }),
  trail: scrub("Trail", 0.4, { min: 0, max: 1, step: 0.05, group: "Lens" }),
  pattern: radio(
    "Pattern",
    "bayer",
    [
      { value: "bayer", label: "Bayer" },
      { value: "halftone", label: "Halftone" },
      { value: "hatch", label: "Hatch" },
      { value: "dash", label: "Dash" },
    ],
    { group: "Dither" },
  ),
  pixelSize: scrub("Pixel size", 2, {
    min: 1,
    max: 12,
    step: 1,
    decimals: 0,
    group: "Dither",
  }),
  levels: scrub("Tone levels", 4, { min: 1, max: 8, step: 1, decimals: 0, group: "Dither" }),
  dark: color("Dark", "#000000", { group: "Palette" }),
  light: color("Light", "#ffffff", { group: "Palette" }),
  colorize: scrub("Palette mix", 0.1, { min: 0, max: 1, step: 0.05, group: "Palette" }),
  contrast: scrub("Contrast", 0.6, {
    min: 0.5,
    max: 2,
    step: 0.05,
    group: "Dither",
    advanced: true,
  }),
  brightness: scrub("Brightness", 0, {
    min: -0.5,
    max: 0.5,
    step: 0.05,
    group: "Dither",
    advanced: true,
  }),
  invert: scrub("Invert", 0, { min: 0, max: 1, step: 0.05, group: "Dither", advanced: true }),
  scanlines: scrub("Scanlines", 0, {
    min: 0,
    max: 1,
    step: 0.05,
    group: "Dither",
    advanced: true,
  }),
  baseStrength: scrub("Outside the lens", 0, {
    min: 0,
    max: 1,
    step: 0.05,
    group: "Lens",
    advanced: true,
  }),
  degauss: scrub("Click degauss", 0.8, {
    min: 0,
    max: 1,
    step: 0.05,
    group: "Lens",
    advanced: true,
  }),
  followSpeed: scrub("Follow speed", 3, {
    min: 1,
    max: 20,
    step: 0.5,
    decimals: 1,
    group: "Lens",
    advanced: true,
  }),
};

const PRESETS = presets(CONTROLS, [
  {
    label: "Game Boy",
    values: { dark: "#0f380f", light: "#9bbc0f", colorize: 1, levels: 4, pixelSize: 3 },
  },
  { label: "Newsprint", values: { pattern: "halftone", pixelSize: 4, colorize: 1 } },
  { label: "Whole page", values: { baseStrength: 1, strength: 1 } },
]);

export function RetroDitherDemo({ children }: DemoProps) {
  const controls = useDemoControls(CONTROLS);
  const surface = useDemoSurface(
    children,
    <PhotoScene slug="retro-dither" photo={2} />,
  );

  const { dark, light, ...values } = controls.values;
  const props = {
    ...values,
    darkColor: hexToRgb(dark),
    lightColor: hexToRgb(light),
  };

  return (
    <>
      <RetroDither {...props} {...surface.props} />
      <StageHint touchLabel="Drag across the page" />
      <DemoControls
        title="Retro Dither controls"
        controls={controls}
        presets={PRESETS}
        snippet={{ component: "RetroDither", props }}
      />
    </>
  );
}
