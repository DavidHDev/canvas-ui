import type { Metadata } from "next";

import { ComponentDoc } from "@/components/docs/component-doc";
import { Footer } from "@/components/landing/footer";
import type { ApiProp } from "@/components/docs/api-reference";
import { getComponentSources } from "@/lib/registry";
import { highlight } from "@/components/docs/highlight";
import { ChromeObjectDemo } from "@/demos/chrome-object-demo";

export const metadata: Metadata = {
  title: "Chrome Object",
  description:
    "Casts any GLB/glTF model, SVG, or image in polished liquid chrome. A built-in studio environment reflects off the surface, ripples flow across it, and the reflections follow the cursor. Built on three.js, works in any framework.",
  alternates: { canonical: "/docs/components/chrome-object" },
};

const DESCRIPTION =
  "Point it at a 3D model, SVG, or image and it is cast in liquid chrome. A built-in studio lights the mirror finish, slow ripples keep the reflections moving, and the highlights glide toward your cursor.";

const API_REFERENCE: ApiProp[] = [
  {
    name: "src",
    description:
      "URL of the asset to display: GLB/glTF, SVG, PNG, JPEG, WebP, or GIF.",
    type: "string",
  },
  {
    name: "roughness",
    description:
      "Surface roughness (0 to 1). 0 is a perfect mirror; higher values soften the reflections into brushed satin.",
    type: "number",
    defaultValue: "0.08",
  },
  {
    name: "flow",
    description:
      "Strength of the liquid ripples that wobble the reflections. 0 holds the metal still.",
    type: "number",
    defaultValue: "0.5",
  },
  {
    name: "flowSpeed",
    description: "Speed of the liquid ripples.",
    type: "number",
    defaultValue: "0.4",
  },
  {
    name: "flowScale",
    description:
      "Size of the ripple pattern relative to the object. Higher values give more, smaller ripples.",
    type: "number",
    defaultValue: "1.5",
  },
  {
    name: "streaks",
    description:
      "Anisotropic streaking that smears the reflections sideways like brushed metal (0 to 1).",
    type: "number",
    defaultValue: "0.25",
  },
  {
    name: "dispersion",
    description:
      "Rainbow fringes on the reflections, strongest at grazing angles (0 to 1).",
    type: "number",
    defaultValue: "0.3",
  },
  {
    name: "tint",
    description:
      'Tint of the metal as any CSS color, e.g. "#e8c37a" for gold. Leave empty for neutral silver.',
    type: "string",
    defaultValue: '""',
  },
  {
    name: "highlight",
    description: "Accent color of the colored panel in the studio environment.",
    type: "string",
    defaultValue: '"#066aff"',
  },
  {
    name: "environmentIntensity",
    description: "Brightness of the studio environment.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "cursorInfluence",
    description: "How far the reflections swing toward the cursor. 0 disables.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "depth",
    description:
      "Extrusion depth of 2D assets (SVG or image) as a fraction of their longest side.",
    type: "number",
    defaultValue: "0.12",
  },
  {
    name: "bevel",
    description:
      "Edge rounding of extruded 2D assets (0 to 1). Rounded edges catch the most light.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "background",
    description:
      "Background color behind the object. Leave empty for a transparent canvas.",
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

export default async function ChromeObjectPage() {
  const variants = await Promise.all(
    getComponentSources("chrome-object").map(async (file) => ({
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
        title="Chrome Object"
        description={DESCRIPTION}
        variants={[...variants]}
        installItem="chrome-object"
        tags={["webgl", "three.js", "3D"]}
        apiReference={API_REFERENCE}
        preview={<ChromeObjectDemo />}
      />
      <div className="mx-auto mt-24 w-full max-w-4xl">
        <Footer variant="docs" />
      </div>
    </div>
  );
}
