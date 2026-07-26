import type { Metadata } from "next";

import { ComponentDoc } from "@/components/docs/component-doc";
import { Footer } from "@/components/landing/footer";
import type { ApiProp } from "@/components/docs/api-reference";
import { getComponentSources } from "@/lib/registry";
import { highlight } from "@/components/docs/highlight";
import { GlassObjectDemo } from "@/demos/glass-object-demo";
import { HeadingAnchor } from "@/components/docs/heading-anchor";

export const metadata: Metadata = {
  title: "Glass Object",
  description:
    "Turns any GLB/glTF model, SVG, or image into a floating liquid-glass object with real refraction, chromatic dispersion, frost, and tinted absorption, lit by a studio environment. Built on three.js, works in any framework.",
  alternates: { canonical: "/docs/components/glass-object" },
};

const DESCRIPTION =
  "Point it at a 3D model, SVG, or image and it becomes solid glass. 2D assets are traced and extruded into a smooth liquid slab; light bends, disperses, and frosts through the volume like the real thing.";

const API_REFERENCE: ApiProp[] = [
  {
    name: "src",
    description:
      "URL of the asset: GLB/glTF, SVG, PNG, JPEG, WebP, or GIF. Object URLs from a file input work too. The format is detected from the bytes, not the extension. SVGs and images are traced and extruded into a rounded glass slab; models keep their geometry. Draco-compressed models are supported via a decoder fetched on demand.",
    type: "string",
  },
  {
    name: "ior",
    description: "Index of refraction of the glass (1 to 2.33).",
    type: "number",
    defaultValue: "1.75",
  },
  {
    name: "thickness",
    description:
      "Thickness of the glass volume in scene units. Drives how strongly light bends.",
    type: "number",
    defaultValue: "4",
  },
  {
    name: "roughness",
    description: "Surface roughness (0 to 1). Higher values frost the glass.",
    type: "number",
    defaultValue: "0.25",
  },
  {
    name: "dispersion",
    description:
      "Chromatic dispersion of the refraction (0 to 2). Splits light into rainbow fringes like real glass.",
    type: "number",
    defaultValue: "1.5",
  },
  {
    name: "clearcoat",
    description: "Clearcoat layer on top of the glass (0 to 1).",
    type: "number",
    defaultValue: "0.5",
  },
  {
    name: "tint",
    description:
      "Tint color of the glass volume as any CSS color. Leave empty to keep the glass clear.",
    type: "string",
    defaultValue: '""',
  },
  {
    name: "tintDensity",
    description: "How strongly the tint absorbs light through the volume.",
    type: "number",
    defaultValue: "2",
  },
  {
    name: "depth",
    description:
      "Extrusion depth of 2D assets (SVG or image) as a fraction of their longest side.",
    type: "number",
    defaultValue: "0.1",
  },
  {
    name: "bevel",
    description:
      "Edge rounding of extruded 2D assets (0 to 1). Higher values melt the edges into a liquid lip.",
    type: "number",
    defaultValue: "1",
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
    name: "background",
    description:
      "Background color behind the glass. Leave empty for a transparent canvas; an opaque color shows through the refraction.",
    type: "string",
    defaultValue: '""',
  },
  {
    name: "backgroundImage",
    description:
      "URL of an image shown as a backdrop behind the glass, cover-fit to the view. The glass samples and refracts it. Leave empty to disable.",
    type: "string",
    defaultValue: '""',
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
    defaultValue: "0",
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
    defaultValue: "55",
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

export default async function GlassObjectPage() {
  const variants = await Promise.all(
    getComponentSources("glass-object").map(async (file) => ({
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
        title="Glass Object"
        description={DESCRIPTION}
        variants={[...variants]}
        installItem="glass-object"
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
              Drag to orbit the glass, then open the controls to tune the
              refraction or swap in your own model, SVG, or image by URL or from
              disk.
            </p>
            <div className="mt-3">
              <GlassObjectDemo />
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
