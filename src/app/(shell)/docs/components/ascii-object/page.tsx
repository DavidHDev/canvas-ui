import type { Metadata } from "next";

import { ComponentDoc } from "@/components/docs/component-doc";
import { Footer } from "@/components/landing/footer";
import type { ApiProp } from "@/components/docs/api-reference";
import { getComponentSources } from "@/lib/registry";
import { highlight } from "@/components/docs/highlight";
import { AsciiObjectDemo } from "@/demos/ascii-object-demo";

export const metadata: Metadata = {
  title: "ASCII Object",
  description:
    "Renders any GLB/glTF model, SVG, or image in a floating studio scene and redraws it as ASCII characters that follow the object's edges and contours, not just its brightness. Configurable charset, cell size, colors, and contrast. Built on three.js, works in any framework.",
  alternates: { canonical: "/docs/components/ascii-object" },
};

const DESCRIPTION =
  "Point it at any GLB or glTF model, SVG, or image and it floats in a lit studio, redrawn in ASCII. Glyphs are matched by shape, so they trace edges, not just brightness. Built on three.js.";

const API_REFERENCE: ApiProp[] = [
  {
    name: "src",
    description:
      "URL of the asset to display: GLB/glTF, SVG, PNG, JPEG, WebP, or GIF.",
    type: "string",
  },
  {
    name: "ascii",
    description:
      "Render the object as ASCII characters. Turn off to see the raw render.",
    type: "boolean",
    defaultValue: "true",
  },
  {
    name: "cellSize",
    description: "Height of one character cell in CSS pixels.",
    type: "number",
    defaultValue: "10",
  },
  {
    name: "cellAspect",
    description:
      "Width of a character cell relative to its height (0.35 to 1.25).",
    type: "number",
    defaultValue: "0.6",
  },
  {
    name: "charset",
    description:
      "Characters the renderer may choose from. Each character's shape is measured and matched against the underlying render, so glyphs like / and _ land on matching edges. A space is always available for empty cells.",
    type: "string",
    defaultValue: "all 95 printable ASCII characters",
  },
  {
    name: "colored",
    description:
      "Tint each character with the scene color underneath it. Turn off for a single-color look.",
    type: "boolean",
    defaultValue: "true",
  },
  {
    name: "color",
    description: "Character color used when colored is off.",
    type: "string",
    defaultValue: '"#ffffff"',
  },
  {
    name: "contrast",
    description:
      "Tone contrast of the character selection. 1 keeps the original tones, higher values deepen shadows.",
    type: "number",
    defaultValue: "1.5",
  },
  {
    name: "edgeContrast",
    description:
      "How strongly characters snap to edges and contours of the object. 1 turns the effect off.",
    type: "number",
    defaultValue: "3",
  },
  {
    name: "exposure",
    description: "Brightness multiplier applied before characters are chosen.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "invert",
    description:
      "Invert the object tones so dark areas get the dense characters.",
    type: "boolean",
    defaultValue: "false",
  },
  {
    name: "background",
    description:
      "Background color behind the characters. Leave empty for a transparent canvas.",
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
    defaultValue: "1",
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

export default async function AsciiObjectPage() {
  const variants = await Promise.all(
    getComponentSources("ascii-object").map(async (file) => ({
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
        title="ASCII Object"
        description={DESCRIPTION}
        variants={[...variants]}
        installItem="ascii-object"
        tags={["webgl", "three.js", "3D"]}
        apiReference={API_REFERENCE}
        beforeInstall={
          <section className="mt-8" aria-label="Demo">
            <h2 className="text-lg font-semibold tracking-[-0.01em]">Demo</h2>
            <p className="mt-2 text-[13px] text-muted-foreground">
              Drag to orbit the object, swap the character set, then open the
              controls to load your own GLB/glTF model, SVG, or image by URL or
              from disk.
            </p>
            <div className="mt-3">
              <AsciiObjectDemo />
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
