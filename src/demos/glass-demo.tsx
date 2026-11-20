"use client";

import { presets, radio, scrub } from "@/components/demos/control-schema";
import { DemoControls } from "@/components/demos/demo-controls";
import { StageHint } from "@/components/demos/demo-stage";
import { useDemoSurface, type DemoProps } from "@/components/demos/demo-surface";
import { useDemoControls } from "@/hooks/use-demo-controls";
import { Glass } from "@/components/docs/live/Glass";
import { DocsScene } from "@/demos/scenes";

const TARGETS = "h1, h2, h3, a, button, code";

const CONTROLS = {
  shape: radio(
    "Shape",
    "circle",
    [
      { value: "circle", label: "Circle" },
      { value: "square", label: "Square" },
      { value: "rectangle", label: "Pill" },
    ],
    { group: "Lens" },
  ),
  size: scrub("Size", 120, { min: 40, max: 280, step: 4, decimals: 0, group: "Lens" }),
  zoom: scrub("Target zoom", 1.5, { min: 1, max: 3, step: 0.05, group: "Lens" }),
  follow: scrub("Follow speed", 0.2, { min: 0.02, max: 1, step: 0.02, group: "Lens" }),
  aspect: scrub("Pill aspect", 1.7, {
    min: 1,
    max: 3,
    step: 0.05,
    group: "Lens",
    when: (values) => values.shape === "rectangle",
  }),
  corner: scrub("Corner radius", 32, {
    min: 0,
    max: 120,
    step: 2,
    decimals: 0,
    group: "Lens",
    when: (values) => values.shape !== "circle",
  }),
  ior: scrub("Refraction", 1.5, { min: 1.05, max: 2, step: 0.01, group: "Glass" }),
  aberration: scrub("Color split", 1, { min: 0, max: 3, step: 0.05, group: "Glass" }),
  blur: scrub("Frost", 0, { min: 0, max: 4, step: 0.1, decimals: 1, group: "Glass" }),
  reflection: scrub("Reflection", 1, { min: 0, max: 2, step: 0.05, group: "Glass" }),
  shine: scrub("Rim shine", 0.01, { min: 0, max: 2, step: 0.05, group: "Glass" }),
  edge: scrub("Flat center", 0.7, {
    min: 0,
    max: 0.95,
    step: 0.01,
    group: "Glass",
    advanced: true,
  }),
  bevel: scrub("Rim curve", 4, { min: 1, max: 10, step: 0.25, group: "Glass", advanced: true }),
  depth: scrub("Depth", 250, {
    min: 20,
    max: 800,
    step: 10,
    decimals: 0,
    group: "Glass",
    advanced: true,
  }),
};

const PRESETS = presets(CONTROLS, [
  { label: "Crystal ball", values: { size: 140, zoom: 2.2, ior: 1.8, shine: 0.6 } },
  {
    label: "Frosted pill",
    values: { shape: "rectangle", size: 64, aspect: 2.4, corner: 120, blur: 1.6, shine: 0.5 },
  },
  { label: "Loupe", values: { size: 72, zoom: 2.6, follow: 0.5, aberration: 0.4 } },
]);

export function GlassDemo({ children }: DemoProps) {
  const controls = useDemoControls(CONTROLS);
  const surface = useDemoSurface(
    children,
    <DocsScene slug="glass" photo={1} />,
  );

  const props = { ...controls.values, targets: TARGETS };

  return (
    <>
      <Glass {...props} {...surface.props} />
      <StageHint
        label="Hover the headline, buttons or code"
        touchLabel="Drag over the headline or buttons"
      />
      <DemoControls
        title="Glass controls"
        controls={controls}
        presets={PRESETS}
        snippet={{ component: "Glass", props }}
      />
    </>
  );
}
