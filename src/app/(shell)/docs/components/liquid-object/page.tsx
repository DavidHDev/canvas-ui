import type { Metadata } from "next";

import { ComponentDoc } from "@/components/docs/component-doc";
import { Footer } from "@/components/landing/footer";
import type { ApiProp } from "@/components/docs/api-reference";
import { getComponentSources } from "@/lib/registry";
import { highlight } from "@/components/docs/highlight";
import { LiquidObjectDemo } from "@/demos/liquid-object-demo";

export const metadata: Metadata = {
  title: "Liquid Object",
  description:
    "Drop any 3D model, SVG, or image into a pool of invisible liquid. The cursor stirs it, the object warps with the flow, and the light splits into color. Built with three.js.",
  alternates: { canonical: "/docs/components/liquid-object" },
};

const DESCRIPTION =
  "Point it at a 3D model, SVG, or image and it sinks behind a sheet of invisible liquid. Move the cursor and the flow drags it along, splitting light into color.";

const API_REFERENCE: ApiProp[] = [
  {
    name: "src",
    description:
      "URL of the asset to display: GLB/glTF, SVG, PNG, JPEG, WebP, or GIF.",
    type: "string",
  },
  {
    name: "distortion",
    description: "How far the liquid drags the object as it flows.",
    type: "number",
    defaultValue: "2",
  },
  {
    name: "aberration",
    description:
      "Strength of the chromatic lens fringe in a soft radius around the cursor.",
    type: "number",
    defaultValue: "0.75",
  },
  {
    name: "grain",
    description:
      "Amount of animated film grain. Subtle across the frame, strongest inside the cursor lens.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "sheen",
    description: "Brightness of the light glinting off the moving liquid.",
    type: "number",
    defaultValue: "1.6",
  },
  {
    name: "cursorSize",
    description: "Size of the area the cursor disturbs.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "cursorForce",
    description: "How hard the cursor pushes the liquid.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "persistence",
    description: "How long the ripples keep flowing after the cursor stops.",
    type: "number",
    defaultValue: "0.6",
  },
  {
    name: "swirl",
    description: "How much the flow curls into swirls and eddies.",
    type: "number",
    defaultValue: "0.5",
  },
  {
    name: "iridescence",
    description: "Strength of the rainbow shimmer where the liquid flows.",
    type: "number",
    defaultValue: "1.5",
  },
  {
    name: "splash",
    description:
      "Strength of the liquid burst fired when the canvas is clicked or tapped. 0 disables.",
    type: "number",
    defaultValue: "1.2",
  },
  {
    name: "ambient",
    description:
      "Amount of slow idle drift that keeps the surface alive while the cursor is away.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "wobble",
    description:
      "How much the object tilts and bounces like jelly in response to the cursor.",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "gloss",
    description:
      "Surface finish of extruded 2D assets, from matte to mirror. Models keep their own materials.",
    type: "number",
    defaultValue: "0.65",
  },
  {
    name: "metallic",
    description:
      "How metallic the asset reads. 0 keeps the original material finish, 1 turns it to polished metal.",
    type: "number",
    defaultValue: "0.15",
  },
  {
    name: "tint",
    description:
      "Tint multiplied over the asset colors. Empty string keeps the original colors.",
    type: "string",
  },
  {
    name: "depth",
    description:
      "Extrusion depth of 2D assets (SVG or image) as a fraction of their longest side.",
    type: "number",
    defaultValue: "0.05",
  },
  {
    name: "bevel",
    description:
      "Edge rounding of extruded 2D assets (0 to 1). Higher values melt the edges into a liquid lip.",
    type: "number",
    defaultValue: "0.5",
  },
  {
    name: "highlight",
    description: "Accent color of the ring light in the studio environment.",
    type: "string",
    defaultValue: "#ffffff",
  },
  {
    name: "environmentIntensity",
    description: "Brightness of the studio environment lighting.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "brightness",
    description: "Output brightness. 1 is neutral.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "saturation",
    description: "Output color saturation. 0 is grayscale, 1 is neutral.",
    type: "number",
    defaultValue: "1.2",
  },
  {
    name: "background",
    description:
      "Background color behind the object. Empty string keeps the canvas transparent.",
    type: "string",
  },
  {
    name: "scale",
    description:
      "Size of the longest side of the asset in scene units. The camera sits about 4 units away.",
    type: "number",
    defaultValue: "3",
  },
  {
    name: "xOffset",
    description: "Horizontal offset of the asset in scene units.",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "yOffset",
    description: "Vertical offset of the asset in scene units.",
    type: "number",
    defaultValue: "-0.2",
  },
  {
    name: "floatIntensity",
    description: "Strength of the floating bob animation (0 disables).",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "rotationIntensity",
    description: "Strength of the idle rocking rotation (0 disables).",
    type: "number",
    defaultValue: "0.5",
  },
  {
    name: "floatSpeed",
    description: "Speed of the float and rocking animation.",
    type: "number",
    defaultValue: "1.5",
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
    description: "Spin the camera around the asset turntable-style.",
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
    defaultValue: "60",
  },
  {
    name: "cameraDistance",
    description: "Camera distance from the center of the asset.",
    type: "number",
    defaultValue: "4",
  },
  {
    name: "dracoDecoderPath",
    description:
      "Base URL of the Draco decoder, fetched only when a model needs it.",
    type: "string",
    defaultValue: "https://www.gstatic.com/draco/versioned/decoders/1.5.7/",
  },
  {
    name: "onLoad",
    description: "Called after an asset finishes loading.",
    type: "(() => void) | null",
  },
  {
    name: "onError",
    description: "Called when an asset fails to load.",
    type: "((error: unknown) => void) | null",
  },
];

export default async function LiquidObjectPage() {
  const variants = await Promise.all(
    getComponentSources("liquid-object").map(async (file) => ({
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
        title="Liquid Object"
        description={DESCRIPTION}
        variants={[...variants]}
        installItem="liquid-object"
        tags={["webgl", "three.js", "3D"]}
        apiReference={API_REFERENCE}
        beforeInstall={
          <section className="mt-8" aria-label="Demo">
            <h2 className="text-lg font-semibold tracking-[-0.01em]">Demo</h2>
            <p className="mt-2 text-[13px] text-muted-foreground">
              Sweep the cursor across the object to stir the liquid, drag to
              orbit, then open the controls to swap in your own model, SVG, or
              image by URL or from disk.
            </p>
            <div className="mt-3">
              <LiquidObjectDemo />
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
