import type { Metadata } from "next";

import { ComponentDoc } from "@/components/docs/component-doc";
import { Footer } from "@/components/landing/footer";
import type { ApiProp } from "@/components/docs/api-reference";
import { getComponentSources } from "@/lib/registry";
import { highlight } from "@/components/docs/highlight";
import { RetroDitherDemo } from "@/demos/retro-dither-demo";
import { DemoImageSection } from "@/demos/demo-image-cycler";

export const metadata: Metadata = {
  title: "Retro Dither",
  description:
    "Wraps your content in a canvas using the html-in-canvas API and applies a retro ordered dither in a smooth radius around the cursor. No dependencies, works in any framework.",
  alternates: { canonical: "/docs/components/retro-dither" },
};

const DESCRIPTION =
  "A retro dither lens follows your cursor, crunching the page beneath it into chunky pixels. Move around, this page is the demo.";

const API_REFERENCE: ApiProp[] = [
  {
    name: "radius",
    description:
      "Radius of the dither lens around the cursor, relative to the screen height.",
    type: "number",
    defaultValue: "0.5",
  },
  {
    name: "softness",
    description:
      "Edge feather of the lens as a fraction of the radius (0 to 1).",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "pixelSize",
    description: "Size of the retro pixels in CSS pixels.",
    type: "number",
    defaultValue: "2",
  },
  {
    name: "levels",
    description: "Number of brightness levels the dither quantizes to.",
    type: "number",
    defaultValue: "4",
  },
  {
    name: "darkColor",
    description: "Dark end of the palette as [r, g, b] in 0-1 range.",
    type: "[number, number, number]",
    defaultValue: "[0, 0, 0]",
  },
  {
    name: "lightColor",
    description: "Light end of the palette as [r, g, b] in 0-1 range.",
    type: "[number, number, number]",
    defaultValue: "[1, 1, 1]",
  },
  {
    name: "colorize",
    description: "Blend from the content's own colors (0) to the palette (1).",
    type: "number",
    defaultValue: "0.1",
  },
  {
    name: "contrast",
    description: "Contrast applied to brightness before dithering.",
    type: "number",
    defaultValue: "0.6",
  },
  {
    name: "brightness",
    description: "Brightness offset applied before dithering (-1 to 1).",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "strength",
    description: "Coverage of the dithered pixels inside the lens (0 to 1).",
    type: "number",
    defaultValue: "0.75",
  },
  {
    name: "baseStrength",
    description:
      "Dither coverage across the whole screen, outside the lens (0 to 1).",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "invert",
    description: "Invert brightness inside the effect (0 to 1).",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "scanlines",
    description: "Intensity of the retro scanline overlay (0 to 1).",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "followSpeed",
    description: "How quickly the lens follows the cursor. Higher is snappier.",
    type: "number",
    defaultValue: "3",
  },
  {
    name: "className",
    description: "Classes applied to the wrapper element.",
    type: "string",
  },
];

export default async function RetroDitherPage() {
  const variants = await Promise.all(
    getComponentSources("retro-dither").map(async (file) => ({
      id: file.id,
      label: file.label,
      fileName: file.fileName,
      source: file.source,
      html: await highlight(file.source, file.lang),
    })),
  );

  return (
    <RetroDitherDemo>
      <ComponentDoc
        title="Retro Dither"
        description={DESCRIPTION}
        variants={[...variants]}
        installItem="retro-dither"
        tags={["html-in-canvas"]}
        requiresHtmlInCanvas
        apiReference={API_REFERENCE}
        demoSection
        beforeInstall={
          <DemoImageSection
            hint="Move your cursor over the photo to see how the dither treats images."
            alt="Demo photo for the Retro Dither effect"
          />
        }
      />
      <div className="mx-auto mt-24 w-full max-w-3xl">
        <Footer variant="docs" />
      </div>
    </RetroDitherDemo>
  );
}
