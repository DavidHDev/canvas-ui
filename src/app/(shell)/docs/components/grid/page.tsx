import type { Metadata } from "next";

import { ComponentDoc } from "@/components/docs/component-doc";
import { DemoImageSection } from "@/demos/demo-image-cycler";
import { Footer } from "@/components/landing/footer";
import type { ApiProp } from "@/components/docs/api-reference";
import { getComponentSources } from "@/lib/registry";
import { highlight } from "@/components/docs/highlight";
import { GridDemo } from "@/demos/grid-demo";

export const metadata: Metadata = {
  title: "Grid",
  description:
    "Wraps your content in a canvas using the html-in-canvas API and splits it into a grid of 3D tiles that ripple in staggered waves around the cursor. No dependencies, works in any framework.",
  alternates: { canonical: "/docs/components/grid" },
};

const DESCRIPTION =
  "Your page becomes a grid of 3D tiles. Waves ripple out from the cursor, lifting and magnifying tiles as they pass. This page is the demo.";

const API_REFERENCE: ApiProp[] = [
  {
    name: "tileSize",
    description: "Size of each grid tile in CSS pixels.",
    type: "number",
    defaultValue: "150",
  },
  {
    name: "gap",
    description: "Gap between tiles in CSS pixels.",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "cornerRadius",
    description: "Corner radius of each tile in CSS pixels.",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "amplitude",
    description: "Overall strength of the wave displacement.",
    type: "number",
    defaultValue: "2.5",
  },
  {
    name: "waveSpeed",
    description:
      "How fast the wavefront expands, in screen heights per second.",
    type: "number",
    defaultValue: "0.5",
  },
  {
    name: "frequency",
    description:
      "Spatial oscillation of the wave. Higher means more ripples per wave.",
    type: "number",
    defaultValue: "12",
  },
  {
    name: "waveWidth",
    description: "Width of the wave ring as a fraction of the screen height.",
    type: "number",
    defaultValue: "0.05",
  },
  {
    name: "fadeTime",
    description:
      "Seconds for a wave to fade to roughly a third of its strength.",
    type: "number",
    defaultValue: "0.2",
  },
  {
    name: "maxLift",
    description: "Maximum lift a tile can reach (0 to 1).",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "jitter",
    description:
      "Per-tile randomness in how tiles respond to the wave (0 to 1).",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "liftHeight",
    description: "How high a fully lifted cube rises, in CSS pixels.",
    type: "number",
    defaultValue: "60",
  },
  {
    name: "perspective",
    description:
      "Camera distance in CSS pixels, like CSS perspective. Lower is more dramatic.",
    type: "number",
    defaultValue: "1200",
  },
  {
    name: "tilt",
    description:
      "How much the camera vanishing point leans toward the cursor (0 to 1).",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "shading",
    description: "Strength of the lighting on cube tops and side walls.",
    type: "number",
    defaultValue: "0.05",
  },
  {
    name: "tint",
    description: "Color lifted tiles blend toward as [r, g, b] in 0-1 range.",
    type: "[number, number, number]",
    defaultValue: "[0, 0.33, 1]",
  },
  {
    name: "tintStrength",
    description: "How strongly lifted tiles take on the tint color (0 to 1).",
    type: "number",
    defaultValue: "0.1",
  },
  {
    name: "idleRipples",
    description:
      "Seconds between ambient ripples when the cursor is idle. 0 disables.",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "className",
    description: "Classes applied to the wrapper element.",
    type: "string",
  },
];

export default async function GridPage() {
  const variants = await Promise.all(
    getComponentSources("grid").map(async (file) => ({
      id: file.id,
      label: file.label,
      fileName: file.fileName,
      source: file.source,
      html: await highlight(file.source, file.lang),
    })),
  );

  return (
    <GridDemo>
      <ComponentDoc
        title="Grid"
        description={DESCRIPTION}
        variants={[...variants]}
        installItem="grid"
        tags={["html-in-canvas"]}
        apiReference={API_REFERENCE}
        demoSection
        beforeInstall={
          <DemoImageSection
            hint="Move your cursor across the photo to ripple it tile by tile."
            alt="Demo photo for the Grid effect"
          />
        }
      />
      <div className="mx-auto mt-24 w-full max-w-3xl">
        <Footer variant="docs" />
      </div>
    </GridDemo>
  );
}
