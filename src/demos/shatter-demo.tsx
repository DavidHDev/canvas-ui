"use client";

import { useMemo } from "react";
import { useTheme } from "next-themes";

import { color, hexToRgb, presets, scrub } from "@/components/demos/control-schema";
import { ColorRow, DemoControls } from "@/components/demos/demo-controls";
import { StageHint } from "@/components/demos/demo-stage";
import { useDemoSurface, type DemoProps } from "@/components/demos/demo-surface";
import { useDemoControls } from "@/hooks/use-demo-controls";
import { Shatter } from "@/components/docs/live/Shatter";
import { DocsScene } from "@/demos/scenes";

const AUTO_GAP = "auto";
const LIGHT_GAP = "#ffffff";
const DARK_GAP = "#0a0a0a";

const CONTROLS = {
  radius: scrub("Lens size", 0.4, { min: 0.1, max: 0.8, step: 0.01, group: "Lens" }),
  softness: scrub("Edge softness", 0.6, { min: 0, max: 1, step: 0.05, group: "Lens" }),
  strength: scrub("Lift inside lens", 1, { min: 0, max: 1, step: 0.05, group: "Lens" }),
  followSpeed: scrub("Follow speed", 3, {
    min: 1,
    max: 20,
    step: 0.5,
    decimals: 1,
    group: "Lens",
  }),
  tileSize: scrub("Shard size", 125, {
    min: 40,
    max: 220,
    step: 5,
    decimals: 0,
    group: "Shards",
  }),
  shards: scrub("Irregularity", 1, { min: 0, max: 1, step: 0.05, group: "Shards" }),
  lift: scrub("Lift height", 30, { min: 0, max: 120, step: 2, decimals: 0, group: "Shards" }),
  tilt: scrub("Tilt", 2, { min: 0, max: 3, step: 0.05, group: "Shards" }),
  scatter: scrub("Scatter", 5, { min: 0, max: 30, step: 1, decimals: 0, group: "Shards" }),
  refraction: scrub("Refraction", 1.5, { min: 0, max: 2, step: 0.05, group: "Glass" }),
  dispersion: scrub("Color fringe", 0.3, { min: 0, max: 1, step: 0.05, group: "Glass" }),
  shadow: scrub("Shadow", 0.5, { min: 0, max: 2, step: 0.05, group: "Glass" }),
  gap: color("Void color", AUTO_GAP, { auto: { label: "Auto" }, group: "Glass" }),
  baseStrength: scrub("Lift outside lens", 0, {
    min: 0,
    max: 1,
    step: 0.05,
    group: "Lens",
    advanced: true,
  }),
  corner: scrub("Corner rounding", 0, {
    min: 0,
    max: 30,
    step: 1,
    decimals: 0,
    group: "Shards",
    advanced: true,
  }),
  floatSpeed: scrub("Float speed", 2, {
    min: 0,
    max: 4,
    step: 0.1,
    decimals: 1,
    group: "Shards",
    advanced: true,
  }),
  shading: scrub("Shading", 0.5, { min: 0, max: 2, step: 0.05, group: "Glass", advanced: true }),
  perspective: scrub("Perspective", 1500, {
    min: 300,
    max: 2000,
    step: 50,
    decimals: 0,
    group: "Glass",
    advanced: true,
  }),
};

const PRESETS = presets(CONTROLS, [
  { label: "Tiles", values: { shards: 0, corner: 8, tileSize: 90, scatter: 0 } },
  { label: "Explode", values: { lift: 90, tilt: 3, scatter: 24, radius: 0.55 } },
  { label: "Whole page", values: { baseStrength: 0.35, lift: 18, tilt: 1 } },
]);

export function ShatterDemo({ children }: DemoProps) {
  const controls = useDemoControls(CONTROLS);
  const { setValue } = controls;
  const { resolvedTheme } = useTheme();
  const surface = useDemoSurface(
    children,
    <DocsScene slug="shatter" photo={0} />,
  );

  const { gap, ...values } = controls.values;
  const auto = gap === AUTO_GAP;
  const gapColor = useMemo(
    (): typeof AUTO_GAP | [number, number, number] =>
      gap === AUTO_GAP ? AUTO_GAP : hexToRgb(gap),
    [gap],
  );
  const props = { ...values, gapColor };

  return (
    <>
      <Shatter {...props} {...surface.props} />
      <StageHint touchLabel="Drag across the page" />
      <DemoControls
        title="Shatter controls"
        controls={controls}
        presets={PRESETS}
        snippet={{ component: "Shatter", props }}
        rows={{
          gap: (
            <ColorRow
              label="Void color"
              value={auto ? (resolvedTheme === "dark" ? DARK_GAP : LIGHT_GAP) : gap}
              displayValue={auto ? "Auto" : undefined}
              onValueChange={(next) => setValue("gap", next)}
              onReset={auto ? undefined : () => setValue("gap", AUTO_GAP)}
            />
          ),
        }}
      />
    </>
  );
}
