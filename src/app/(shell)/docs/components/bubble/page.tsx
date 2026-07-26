import type { Metadata } from "next";

import { ComponentDoc } from "@/components/docs/component-doc";
import { DemoImageSection } from "@/demos/demo-image-cycler";
import { Footer } from "@/components/landing/footer";
import type { ApiProp } from "@/components/docs/api-reference";
import { getComponentSources } from "@/lib/registry";
import { highlight } from "@/components/docs/highlight";
import { BubbleDemo } from "@/demos/bubble-demo";

export const metadata: Metadata = {
  title: "Bubble",
  description:
    "Wraps your content in a canvas using the html-in-canvas API and attaches a glassy droplet to the cursor: a trail of blending metaballs that refracts the live page beneath it, with chromatic dispersion, frost, and an iridescent sheen. No dependencies, works in any framework.",
  alternates: { canonical: "/docs/components/bubble" },
};

const DESCRIPTION =
  "A glassy droplet rides your cursor, trailing into a string of blending metaballs that refract the live page beneath them. Move fast to stretch it, stop to let it pool back together.";

const API_REFERENCE: ApiProp[] = [
  {
    name: "size",
    description: "Radius of the pooled droplet in CSS pixels.",
    type: "number",
    defaultValue: "30",
  },
  {
    name: "trail",
    description:
      "Number of spheres in the pointer trail (1 to 24). Each sphere holds the cursor position from a previous frame, so the droplet stretches while moving and pools back together at rest.",
    type: "number",
    defaultValue: "24",
  },
  {
    name: "follow",
    description:
      "How quickly the droplet head follows the cursor (0 to 1). 1 sticks to it.",
    type: "number",
    defaultValue: "0.5",
  },
  {
    name: "blend",
    description:
      "Metaball merge sharpness. Lower values melt the trail into one gooey mass, higher values keep the spheres tighter.",
    type: "number",
    defaultValue: "14",
  },
  {
    name: "speed",
    description: "Speed of the animated liquid sheen rolling over the surface.",
    type: "number",
    defaultValue: "2",
  },
  {
    name: "refraction",
    description:
      "Optical thickness of the droplet in CSS pixels. Light bends through it like water (IOR 1.33), so the page stays untouched at the center and bends progressively toward the edges. Negative values bend outward.",
    type: "number",
    defaultValue: "80",
  },
  {
    name: "dispersion",
    description:
      "Chromatic dispersion of the refracted page (0 to 3). 0 disables the color split.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "frost",
    description: "Frosted blur of the page inside the droplet (0 to 1).",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "shine",
    description: "Specular highlight strength (0 to 2).",
    type: "number",
    defaultValue: "0.25",
  },
  {
    name: "rim",
    description: "Darkened glassy band around the droplet edge (0 to 2).",
    type: "number",
    defaultValue: "0.5",
  },
  {
    name: "iridescence",
    description:
      "Strength of the liquid sheen overlaid on the refracted page (0 to 2).",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "intensity",
    description:
      "Brightness of the sheen colors before shaping. Higher values grow the bright hotspots.",
    type: "number",
    defaultValue: "0.9",
  },
  {
    name: "tint",
    description: "Glass tint color as RGB in the 0 to 1 range.",
    type: "[number, number, number]",
    defaultValue: "[1, 1, 1]",
  },
  {
    name: "tintStrength",
    description: "How strongly the tint colors the refracted page (0 to 1).",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "colorA",
    description:
      "First sheen color as RGB in the 0 to 1 range. Also colors the fallback droplet.",
    type: "[number, number, number]",
    defaultValue: "[0.2902, 0.4549, 0.7216]",
  },
  {
    name: "colorB",
    description:
      "Second sheen color as RGB in the 0 to 1 range. Also colors the fallback droplet.",
    type: "[number, number, number]",
    defaultValue: "[0.4118, 0.4118, 0.4157]",
  },
  {
    name: "fallbackOpacity",
    description:
      "Opacity of the droplet when html-in-canvas is unavailable and it renders as a translucent soap-film overlay.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "className",
    description: "Classes applied to the wrapper element.",
    type: "string",
  },
];

export default async function BubblePage() {
  const variants = await Promise.all(
    getComponentSources("bubble").map(async (file) => ({
      id: file.id,
      label: file.label,
      fileName: file.fileName,
      source: file.source,
      html: await highlight(file.source, file.lang),
    })),
  );

  return (
    <BubbleDemo>
      <ComponentDoc
        title="Bubble"
        description={DESCRIPTION}
        variants={[...variants]}
        installItem="bubble"
        tags={["html-in-canvas"]}
        apiReference={API_REFERENCE}
        demoSection
        beforeInstall={
          <DemoImageSection
            hint="Drag the droplet across the photo, then stop and watch it pool back together."
            alt="Demo photo for the Bubble effect"
          />
        }
      />
      <div className="mx-auto mt-24 w-full max-w-3xl">
        <Footer variant="docs" />
      </div>
    </BubbleDemo>
  );
}
