"use client";

import {
  color,
  hexToRgb,
  presets,
  radio,
  scrub,
  toggle,
} from "@/components/demos/control-schema";
import { ColorRow, DemoControls } from "@/components/demos/demo-controls";
import { StageHint } from "@/components/demos/demo-stage";
import { useDemoSurface, type DemoProps } from "@/components/demos/demo-surface";
import { useDemoControls } from "@/hooks/use-demo-controls";
import { Liquid } from "@/components/docs/live/Liquid";
import { DocsScene } from "@/demos/scenes";

const CONTROLS = {
  color: color("Trail color", "#425bff", { group: "Look" }),
  rainbow: toggle("Rainbow trail", false, { group: "Look" }),
  intensity: scrub("Color strength", 2, {
    min: 0,
    max: 8,
    step: 0.1,
    decimals: 1,
    group: "Look",
  }),
  distortion: scrub("Distortion", 0.4, {
    min: 0,
    max: 2,
    step: 0.05,
    group: "Look",
  }),
  force: scrub("Push force", 1.1, {
    min: 0,
    max: 5,
    step: 0.1,
    decimals: 1,
    group: "Motion",
  }),
  radius: scrub("Brush size", 0.3, {
    min: 0.05,
    max: 1.5,
    step: 0.05,
    group: "Motion",
  }),
  curl: scrub("Swirl", 1.9, {
    min: 0,
    max: 10,
    step: 0.1,
    decimals: 1,
    group: "Motion",
  }),
  densityDissipation: scrub("Trail length", 0.96, {
    min: 0.85,
    max: 1,
    step: 0.005,
    decimals: 3,
    group: "Motion",
  }),
  blend: scrub("Color blend", 5, {
    min: 0,
    max: 20,
    step: 0.5,
    decimals: 1,
    group: "Look",
    advanced: true,
  }),
  velocityDissipation: scrub("Momentum", 1, {
    min: 0.85,
    max: 1,
    step: 0.005,
    decimals: 3,
    group: "Motion",
    advanced: true,
  }),
  pressure: scrub("Pressure", 0.8, {
    min: 0,
    max: 1,
    step: 0.05,
    group: "Simulation",
    advanced: true,
  }),
  pressureIterations: scrub("Solver steps", 4, {
    min: 1,
    max: 10,
    step: 1,
    decimals: 0,
    group: "Simulation",
    advanced: true,
  }),
  quality: radio(
    "Quality",
    "medium",
    [
      { value: "low", label: "Low" },
      { value: "medium", label: "Medium" },
      { value: "high", label: "High" },
    ],
    { group: "Simulation", advanced: true },
  ),
};

const PRESETS = presets(CONTROLS, [
  { label: "Rainbow", values: { rainbow: true, intensity: 2.5, curl: 3 } },
  {
    label: "Ink",
    values: { color: "#111111", intensity: 3.5, blend: 8, densityDissipation: 0.985 },
  },
  { label: "Clear", values: { intensity: 0, distortion: 1.2, curl: 3.5, radius: 0.45 } },
]);

const RESOLUTION = {
  low: { simResolution: 32, dyeResolution: 128 },
  medium: { simResolution: 128, dyeResolution: 512 },
  high: { simResolution: 256, dyeResolution: 1024 },
} as const;

export function LiquidDemo({ children }: DemoProps) {
  const controls = useDemoControls(CONTROLS);
  const { setValue } = controls;
  const surface = useDemoSurface(
    children,
    <DocsScene slug="liquid" photo={2} />,
  );

  const { color, rainbow, quality, ...values } = controls.values;
  const props = {
    ...values,
    ...RESOLUTION[quality],
    color: hexToRgb(color),
    rainbow,
  };

  return (
    <>
      <Liquid {...props} {...surface.props} />
      <StageHint label="Move your cursor to stir" touchLabel="Drag to stir" />
      <DemoControls
        title="Liquid controls"
        controls={controls}
        presets={PRESETS}
        snippet={{ component: "Liquid", props }}
        rows={{
          color: (
            <div className={rainbow ? "pointer-events-none opacity-40" : ""}>
              <ColorRow
                label="Trail color"
                value={color}
                onValueChange={(next) => setValue("color", next)}
                onReset={
                  color !== CONTROLS.color.defaultValue
                    ? () => setValue("color", CONTROLS.color.defaultValue)
                    : undefined
                }
              />
            </div>
          ),
        }}
      />
    </>
  );
}
