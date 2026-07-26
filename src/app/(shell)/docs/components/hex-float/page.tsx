import type { Metadata } from "next";

import { ComponentDoc } from "@/components/docs/component-doc";
import { Footer } from "@/components/landing/footer";
import type { ApiProp } from "@/components/docs/api-reference";
import { getComponentSources } from "@/lib/registry";
import { highlight } from "@/components/docs/highlight";
import { HexFloatDemo } from "@/demos/hex-float-demo";
import { DemoImageSection } from "@/demos/demo-image-cycler";

export const metadata: Metadata = {
  title: "Hex Float",
  description:
    "Wraps your content in a canvas using the html-in-canvas API and renders the live page onto a floor of shiny beveled hex tiles that lean back in perspective and bob gently. A fluid simulation flattens the tiles into a readable window around your cursor, and clicks are remapped so everything stays interactive. No dependencies, works in any framework.",
  alternates: { canonical: "/docs/components/hex-float" },
};

const DESCRIPTION =
  "The page becomes a floor of shiny hex tiles that lean back in perspective and float gently. Your cursor injects a fluid that flattens the tiles into a readable window, swirling as you move and healing when you leave. This page is the demo.";

const API_REFERENCE: ApiProp[] = [
  {
    name: "size",
    description: "Width of each hex tile in CSS pixels.",
    type: "number",
    defaultValue: "160",
  },
  {
    name: "gap",
    description: "Seam between tiles in CSS pixels.",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "bevel",
    description: "Width of the shiny beveled rim in CSS pixels.",
    type: "number",
    defaultValue: "1.5",
  },
  {
    name: "tilt",
    description:
      "Backward lean of the page in degrees (-30 to 30). Positive tilts the top away.",
    type: "number",
    defaultValue: "24",
  },
  {
    name: "perspective",
    description:
      "Camera closeness (0 to 1). Higher exaggerates the perspective of the tilt.",
    type: "number",
    defaultValue: "0.5",
  },
  {
    name: "float",
    description:
      "How far tiles bob up and down as they float (0 to 1). 0 keeps them still.",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "speed",
    description: "Speed of the floating motion. 1 is normal speed.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "shine",
    description:
      "Intensity of the specular glints on rims and tile faces (0 to 2).",
    type: "number",
    defaultValue: "0.5",
  },
  {
    name: "lift",
    description:
      "How strongly tiles rise along the edges of the fluid reading window (0 to 1).",
    type: "number",
    defaultValue: "0.1",
  },
  {
    name: "radius",
    description:
      "Size of the fluid splats the cursor injects, in CSS pixels. Sets the reading window's scale.",
    type: "number",
    defaultValue: "1200",
  },
  {
    name: "flow",
    description: "How strongly cursor movement pushes the fluid around (0 to 3).",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "swirl",
    description:
      "Vorticity of the fluid (0 to 15). Higher makes the window's trail curl into eddies.",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "trail",
    description: "How long the fluid trail lingers before healing (0 to 1).",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "iridescence",
    description:
      "Strength of the iridescent hue shift on highlights (0 to 2). 0 keeps highlights neutral.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "bloom",
    description:
      "Bloom glow around bright highlights (0 to 1). 0 skips the pass entirely.",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "grain",
    description:
      "Animated film grain over the final image (0 to 1). 0 skips the pass entirely.",
    type: "number",
    defaultValue: "0.8",
  },
  {
    name: "gapColor",
    description:
      'Seam color as [r, g, b] in 0-1 range, or "auto" to derive a dark seam from the page background.',
    type: '[number, number, number] | "auto"',
    defaultValue: '"auto"',
  },
  {
    name: "className",
    description: "Classes applied to the wrapper element.",
    type: "string",
  },
];

export default async function HexFloatPage() {
  const variants = await Promise.all(
    getComponentSources("hex-float").map(async (file) => ({
      id: file.id,
      label: file.label,
      fileName: file.fileName,
      source: file.source,
      html: await highlight(file.source, file.lang),
    })),
  );

  return (
    <HexFloatDemo>
      <ComponentDoc
        title="Hex Float"
        description={DESCRIPTION}
        variants={[...variants]}
        installItem="hex-float"
        tags={["html-in-canvas"]}
        apiReference={API_REFERENCE}
        demoSection
        beforeInstall={
          <DemoImageSection
            hint="Move your cursor over the photos to open a readable window and watch the ring of tiles glint."
            alt="Demo photo for the Hex Float effect"
          />
        }
      />
      <div className="mx-auto mt-24 w-full max-w-3xl">
        <Footer variant="docs" />
      </div>
    </HexFloatDemo>
  );
}
