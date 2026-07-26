import type { Metadata } from "next";

import { ComponentDoc } from "@/components/docs/component-doc";
import { DemoImageSection } from "@/demos/demo-image-cycler";
import { Footer } from "@/components/landing/footer";
import type { ApiProp } from "@/components/docs/api-reference";
import { getComponentSources } from "@/lib/registry";
import { highlight } from "@/components/docs/highlight";
import { LiquidDemo } from "@/demos/liquid-demo";

export const metadata: Metadata = {
  title: "Liquid",
  description:
    "Wraps your content in a canvas using the html-in-canvas API and runs a pointer-driven WebGL fluid simulation over it. No dependencies, works in any framework.",
  alternates: { canonical: "/docs/components/liquid" },
};

const DESCRIPTION =
  "A pointer-driven fluid simulation over your live page. Move the cursor and stir it up.";

const API_REFERENCE: ApiProp[] = [
  {
    name: "force",
    description: "Force multiplier applied on pointer movement.",
    type: "number",
    defaultValue: "1.1",
  },
  {
    name: "radius",
    description: "Radius of the pointer splat.",
    type: "number",
    defaultValue: "0.3",
  },
  {
    name: "curl",
    description: "Rotational force added back into the flow.",
    type: "number",
    defaultValue: "1.9",
  },
  {
    name: "intensity",
    description: "Strength of the color tint left by the flow.",
    type: "number",
    defaultValue: "2",
  },
  {
    name: "distortion",
    description: "How strongly the flow warps the content.",
    type: "number",
    defaultValue: "0.4",
  },
  {
    name: "blend",
    description: "How much of the fluid color blends over the content.",
    type: "number",
    defaultValue: "5",
  },
  {
    name: "densityDissipation",
    description:
      "How much the trail persists each frame. Closer to 1 lasts longer.",
    type: "number",
    defaultValue: "0.96",
  },
  {
    name: "velocityDissipation",
    description:
      "How much motion persists each frame. Closer to 1 lasts longer.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "pressure",
    description: "How much pressure carries over between frames.",
    type: "number",
    defaultValue: "0.8",
  },
  {
    name: "pressureIterations",
    description:
      "Pressure solver iterations. More is more accurate but slower.",
    type: "number",
    defaultValue: "4",
  },
  {
    name: "color",
    description:
      "Trail color as [r, g, b] in 0-1 range. Ignored when rainbow is on.",
    type: "[number, number, number]",
    defaultValue: "[0.145, 0.239, 0.867]",
  },
  {
    name: "rainbow",
    description:
      "Color the trail from the flow direction instead of a fixed color.",
    type: "boolean",
    defaultValue: "false",
  },
  {
    name: "simResolution",
    description: "Resolution of the simulation grid.",
    type: "number",
    defaultValue: "128",
  },
  {
    name: "dyeResolution",
    description: "Resolution of the fluid trail texture.",
    type: "number",
    defaultValue: "512",
  },
  {
    name: "className",
    description: "Classes applied to the wrapper element.",
    type: "string",
  },
];

export default async function LiquidPage() {
  const variants = await Promise.all(
    getComponentSources("liquid").map(async (file) => ({
      id: file.id,
      label: file.label,
      fileName: file.fileName,
      source: file.source,
      html: await highlight(file.source, file.lang),
    })),
  );

  return (
    <LiquidDemo>
      <ComponentDoc
        title="Liquid"
        description={DESCRIPTION}
        variants={[...variants]}
        installItem="liquid"
        tags={["html-in-canvas"]}
        apiReference={API_REFERENCE}
        demoSection
        beforeInstall={
          <DemoImageSection
            hint="Drag across the photo to stir it like liquid."
            alt="Demo photo for the Liquid effect"
          />
        }
      />
      <div className="mx-auto mt-24 w-full max-w-3xl">
        <Footer variant="docs" />
      </div>
    </LiquidDemo>
  );
}
