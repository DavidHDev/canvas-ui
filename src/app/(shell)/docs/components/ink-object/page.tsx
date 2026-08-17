import type { Metadata } from "next";

import { ComponentDoc } from "@/components/docs/component-doc";
import { Footer } from "@/components/landing/footer";
import type { ApiProp } from "@/components/docs/api-reference";
import { getComponentSources } from "@/lib/registry";
import { highlight } from "@/components/docs/highlight";
import { InkObjectDemo } from "@/demos/ink-object-demo";

export const metadata: Metadata = {
  title: "Ink Object",
  description:
    "Renders any GLB/glTF model, SVG, or image in a floating studio scene as hand-pressed ink strokes that thicken in the shadows and break into dashes in the light, with ragged bleed, dry-brush grain, and a configurable line angle. Built on three.js, works in any framework.",
  alternates: { canonical: "/docs/components/ink-object" },
};

const DESCRIPTION =
  "Point it at any GLB or glTF model, SVG, or image and it floats in a lit studio, printed as rough ink strokes that swell in the shadows and break into dashes in the light. Built on three.js.";

const API_REFERENCE: ApiProp[] = [
  {
    name: "src",
    description:
      "URL of the asset to display: GLB/glTF, SVG, PNG, JPEG, WebP, or GIF. Object URLs from a file input work too. The format is sniffed from the bytes, not the extension. Draco-compressed models are supported via a decoder fetched on demand, and flat art is mounted as a card lit by the same studio.",
    type: "string",
  },
  {
    name: "ink",
    description: "Enable the ink pass. Turn off to see the raw render.",
    type: "boolean",
    defaultValue: "true",
  },
  {
    name: "inkColor",
    description: "Color of the ink strokes.",
    type: "string",
    defaultValue: '"#111111"',
  },
  {
    name: "lineSpacing",
    description: "Distance between stroke centers in CSS pixels.",
    type: "number",
    defaultValue: "8",
  },
  {
    name: "strokeWeight",
    description:
      "Thickness of the strokes relative to the line spacing (0 to 1.5). At 1 the darkest areas fill their line completely.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "angle",
    description:
      "Angle of the stroke lines in degrees. 0 is horizontal, 90 is vertical.",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "dashLength",
    description:
      "Length scale of the dash breakup along each stroke, in CSS pixels. Larger values give longer, calmer dashes.",
    type: "number",
    defaultValue: "14",
  },
  {
    name: "variation",
    description:
      "How aggressively strokes break into dashes as the tone lightens. 0 keeps every line solid.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "bleed",
    description: "Ragged ink bleed along the stroke edges (0 to 1).",
    type: "number",
    defaultValue: "0.35",
  },
  {
    name: "grain",
    description: "Dry-brush speckle eaten out of the ink (0 to 1).",
    type: "number",
    defaultValue: "0.32",
  },
  {
    name: "wobble",
    description: "Hand-pressed waviness of the stroke lines (0 to 1).",
    type: "number",
    defaultValue: "0.3",
  },
  {
    name: "relief",
    description:
      "How strongly the depth of the subject bends each stroke, so the hatching wraps the form instead of running flat across it. 0 keeps the lines straight.",
    type: "number",
    defaultValue: "0.5",
  },
  {
    name: "contrast",
    description:
      "Slope of the tone-to-ink ramp. Higher crushes midtones into solid ink or bare paper.",
    type: "number",
    defaultValue: "2.2",
  },
  {
    name: "threshold",
    description:
      "Tone that lands at half ink coverage. Raise it to ink only the darkest areas.",
    type: "number",
    defaultValue: "0.2",
  },
  {
    name: "softness",
    description:
      "Softness of the stroke edges. 0 is a hard letterpress edge, 1 is a soft wash.",
    type: "number",
    defaultValue: "0.4",
  },
  {
    name: "invert",
    description: "Ink the light areas instead of the dark ones.",
    type: "boolean",
    defaultValue: "false",
  },
  {
    name: "background",
    description:
      "Paper color behind the ink. Leave empty for a transparent canvas.",
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
    defaultValue: "0.5",
  },
  {
    name: "depth",
    description:
      "Extrusion depth of 2D assets (SVG or image) as a fraction of their longest side.",
    type: "number",
    defaultValue: "0.08",
  },
  {
    name: "roughness",
    description:
      "Roughness override applied to every material (0 to 1). Negative keeps the asset's own values.",
    type: "number",
    defaultValue: "0.35",
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
    defaultValue: "0",
  },
  {
    name: "rotationIntensity",
    description: "Strength of the idle rocking rotation (0 disables).",
    type: "number",
    defaultValue: "0",
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

export default async function InkObjectPage() {
  const variants = await Promise.all(
    getComponentSources("ink-object").map(async (file) => ({
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
        title="Ink Object"
        description={DESCRIPTION}
        variants={[...variants]}
        installItem="ink-object"
        tags={["webgl", "three.js", "3D"]}
        apiReference={API_REFERENCE}
        beforeInstall={
          <section className="mt-8" aria-label="Demo">
            <h2 className="text-lg font-semibold tracking-[-0.01em]">Demo</h2>
            <p className="mt-2 text-[13px] text-muted-foreground">
              Drag to orbit the object, push the line spacing and dash breakup
              around, then open the controls to swap in your own GLB/glTF model,
              SVG, or image by URL or from disk.
            </p>
            <div className="mt-3">
              <InkObjectDemo />
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
