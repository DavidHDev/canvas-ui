import type { Metadata } from "next";

import { ComponentDoc } from "@/components/docs/component-doc";
import { Footer } from "@/components/landing/footer";
import type { ApiProp } from "@/components/docs/api-reference";
import { getComponentSources } from "@/lib/registry";
import { highlight } from "@/components/docs/highlight";
import { HeadingAnchor } from "@/components/docs/heading-anchor";
import { ParticleObjectDemo } from "@/demos/particle-object-demo";

export const metadata: Metadata = {
  title: "Particle Object",
  description:
    "Rebuilds any GLB/glTF model, SVG, or PNG as a floating cloud of particles that keep the asset's own colors. The cursor pushes them around with a springy, swirling response before they settle back into shape. Built on three.js, works in any framework.",
  alternates: { canonical: "/docs/components/particle-object" },
};

const DESCRIPTION =
  "Point it at a 3D model, SVG, or image and it rebuilds as thousands of particles. Sweep the cursor through them and they scatter, swirl, and spring back into shape.";

const API_REFERENCE: ApiProp[] = [
  {
    name: "src",
    description:
      "URL of the asset: GLB/glTF, SVG, PNG, JPEG, WebP, or GIF. Object URLs from a file input work too. The format is detected from the bytes, not the extension. Draco-compressed models are supported via a decoder fetched on demand.",
    type: "string",
  },
  {
    name: "count",
    description: "Number of particles the asset is rebuilt from.",
    type: "number",
    defaultValue: "14000",
  },
  {
    name: "size",
    description: "Particle size in CSS pixels at the model's distance.",
    type: "number",
    defaultValue: "2.4",
  },
  {
    name: "sizeVariance",
    description: "Random per-particle size variation (0 to 1).",
    type: "number",
    defaultValue: "0.6",
  },
  {
    name: "color",
    description:
      "Override color as any CSS color. Leave empty to keep the asset's own colors.",
    type: "string",
    defaultValue: '""',
  },
  {
    name: "radius",
    description: "Radius of the cursor's push field in CSS pixels.",
    type: "number",
    defaultValue: "110",
  },
  {
    name: "strength",
    description: "How hard the cursor pushes particles away.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "swirl",
    description:
      "Tangential curl of the push (0 to 2). Particles spiral around the cursor instead of only fleeing it.",
    type: "number",
    defaultValue: "0.6",
  },
  {
    name: "spring",
    description: "How quickly displaced particles spring back home.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "damping",
    description:
      "Velocity damping (0 to 1). Lower values keep particles wobbling longer.",
    type: "number",
    defaultValue: "0.35",
  },
  {
    name: "drift",
    description: "Idle shimmer of the resting particles (0 disables).",
    type: "number",
    defaultValue: "0.6",
  },
  {
    name: "background",
    description:
      "Background color behind the particles. Leave empty for a transparent canvas.",
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
    defaultValue: "65",
  },
  {
    name: "cameraDistance",
    description: "Camera distance from the center of the asset.",
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

export default async function ParticleObjectPage() {
  const variants = await Promise.all(
    getComponentSources("particle-object").map(async (file) => ({
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
        title="Particle Object"
        description={DESCRIPTION}
        variants={[...variants]}
        installItem="particle-object"
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
              Sweep the cursor through the particles, drag to orbit, then open
              the controls to swap in your own model, SVG, or image by URL or
              from disk.
            </p>
            <div className="mt-3">
              <ParticleObjectDemo />
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
