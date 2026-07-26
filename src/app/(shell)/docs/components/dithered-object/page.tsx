import type { Metadata } from "next";

import { ComponentDoc } from "@/components/docs/component-doc";
import { Footer } from "@/components/landing/footer";
import type { ApiProp } from "@/components/docs/api-reference";
import { getComponentSources } from "@/lib/registry";
import { highlight } from "@/components/docs/highlight";
import { HeadingAnchor } from "@/components/docs/heading-anchor";
import { DitheredObjectDemo } from "@/demos/dithered-object-demo";

export const metadata: Metadata = {
  title: "Dithered Object",
  description:
    "Renders any GLB/glTF model, SVG, or image in a floating studio scene and dithers the render into 1-bit Bayer, halftone, or Floyd–Steinberg patterns, with pixelation, grayscale, orbit controls, and a configurable environment. Built on three.js, works in any framework.",
  alternates: { canonical: "/docs/components/dithered-object" },
};

const DESCRIPTION =
  "Point it at any GLB or glTF model, SVG, or image and it floats in a lit studio, rendered through a Bayer, halftone, or Floyd–Steinberg dither. Built on three.js.";

const API_REFERENCE: ApiProp[] = [
  {
    name: "src",
    description:
      "URL of the asset to display: GLB/glTF, SVG, PNG, JPEG, WebP, or GIF. Object URLs from a file input work too. The format is sniffed from the bytes, not the extension. Draco-compressed models are supported via a decoder fetched on demand, and flat art is mounted as a card lit by the same studio.",
    type: "string",
  },
  {
    name: "method",
    description:
      "Dither pattern: an ordered Bayer grid, clustered halftone dots, or Floyd–Steinberg error diffusion.",
    type: '"bayer" | "halftone" | "floyd"',
    defaultValue: '"bayer"',
  },
  {
    name: "gridSize",
    description: "Size of the dither cells in CSS pixels.",
    type: "number",
    defaultValue: "4",
  },
  {
    name: "pixelSizeRatio",
    description: "Extra pixelation applied on top of the grid size (1 to 10).",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "grayscale",
    description: "Collapse the scene to grayscale before dithering.",
    type: "boolean",
    defaultValue: "true",
  },
  {
    name: "invert",
    description: "Invert the final colors.",
    type: "boolean",
    defaultValue: "false",
  },
  {
    name: "dither",
    description: "Enable the dither pass. Turn off to see the raw render.",
    type: "boolean",
    defaultValue: "true",
  },
  {
    name: "background",
    description:
      "Background color behind the object. Leave empty for a transparent canvas.",
    type: "string",
    defaultValue: '"" (transparent)',
  },
  {
    name: "highlight",
    description: "Accent color of the ring light in the studio environment.",
    type: "string",
    defaultValue: '"#066aff"',
  },
  {
    name: "environmentIntensity",
    description: "Brightness of the studio environment lighting.",
    type: "number",
    defaultValue: "0.1",
  },
  {
    name: "roughness",
    description:
      "Roughness override applied to every material (0 to 1). Negative keeps the asset's own values.",
    type: "number",
    defaultValue: "-1",
  },
  {
    name: "scale",
    description:
      "Size of the longest side of the object in scene units. The camera sits about 4 units away.",
    type: "number",
    defaultValue: "3",
  },
  {
    name: "xOffset",
    description: "Horizontal offset of the object in scene units.",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "yOffset",
    description: "Vertical offset of the object in scene units.",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "floatIntensity",
    description: "Strength of the floating bob animation (0 disables).",
    type: "number",
    defaultValue: "2",
  },
  {
    name: "rotationIntensity",
    description: "Strength of the idle rocking rotation (0 disables).",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "floatSpeed",
    description: "Speed of the float and rocking animation.",
    type: "number",
    defaultValue: "2",
  },
  {
    name: "orbit",
    description: "Let the user orbit the camera by dragging.",
    type: "boolean",
    defaultValue: "true",
  },
  {
    name: "zoom",
    description: "Let the user zoom with the scroll wheel or pinch.",
    type: "boolean",
    defaultValue: "false",
  },
  {
    name: "autoRotate",
    description: "Spin the camera around the object turntable-style.",
    type: "boolean",
    defaultValue: "false",
  },
  {
    name: "autoRotateSpeed",
    description: "Turntable speed when autoRotate is on.",
    type: "number",
    defaultValue: "2",
  },
  {
    name: "fov",
    description: "Camera field of view in degrees.",
    type: "number",
    defaultValue: "65",
  },
  {
    name: "cameraDistance",
    description: "Camera distance from the center of the object.",
    type: "number",
    defaultValue: "4.2",
  },
  {
    name: "dracoDecoderPath",
    description:
      "Base URL of the Draco decoder, fetched only when a model needs it.",
    type: "string",
    defaultValue: '"https://www.gstatic.com/draco/versioned/decoders/1.5.7/"',
  },
  {
    name: "onLoad",
    description: "Called after an asset finishes loading.",
    type: "() => void",
  },
  {
    name: "onError",
    description: "Called when an asset fails to load.",
    type: "(error: unknown) => void",
  },
  {
    name: "className",
    description: "Classes applied to the wrapper element.",
    type: "string",
  },
];

export default async function DitheredObjectPage() {
  const variants = await Promise.all(
    getComponentSources("dithered-object").map(async (file) => ({
      id: file.id,
      label: file.label,
      fileName: file.fileName,
      source: file.source,
      html: await highlight(file.source, file.lang),
    })),
  );

  return (
    <div className="page-enter">
      <ComponentDoc
        title="Dithered Object"
        description={DESCRIPTION}
        variants={[...variants]}
        installItem="dithered-object"
        tags={["webgl", "three.js", "3D"]}
        apiReference={API_REFERENCE}
        demoSection
        beforeInstall={
          <section className="mt-8" aria-label="Demo">
            <h2
              id="demo"
              className="scroll-mt-24 text-lg font-semibold tracking-[-0.01em]"
            >
              <HeadingAnchor id="demo">Demo</HeadingAnchor>
            </h2>
            <p className="mt-2 text-[13px] text-muted-foreground">
              Drag to orbit the object, switch the dither pattern, then open the
              controls to swap in your own GLB/glTF model, SVG, or image by URL
              or from disk.
            </p>
            <div className="mt-3">
              <DitheredObjectDemo />
            </div>
          </section>
        }
      />
      <div className="mx-auto mt-24 w-full max-w-3xl">
        <Footer variant="docs" />
      </div>
    </div>
  );
}
