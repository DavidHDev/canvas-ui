import type { Metadata } from "next";

import { ComponentDoc } from "@/components/docs/component-doc";
import { Footer } from "@/components/landing/footer";
import type { ApiProp } from "@/components/docs/api-reference";
import { getComponentSources } from "@/lib/registry";
import { highlight } from "@/components/docs/highlight";
import { TopographicObjectDemo } from "@/demos/topographic-object-demo";

export const metadata: Metadata = {
  title: "Topographic Object",
  description:
    "Draws any GLB/glTF model, SVG, or image as contour lines at even height steps, with heavier index contours like a survey map. SVGs and images rise into terrain shaped by their outline. Built on three.js, works in any framework.",
  alternates: { canonical: "/docs/components/topographic-object" },
};

const DESCRIPTION =
  "Point it at a 3D model, SVG, or image and it is drawn like a survey map. SVGs and images rise into terrain shaped by their outline, models are sliced at even heights, and every fifth contour is drawn heavier.";

const API_REFERENCE: ApiProp[] = [
  {
    name: "src",
    description:
      "URL of the asset to display: GLB/glTF, SVG, PNG, JPEG, WebP, or GIF. Transparent assets rise from their outline; opaque photos rise by brightness.",
    type: "string",
  },
  {
    name: "lines",
    description:
      "Number of contour intervals from the lowest to the highest point. Spacing is fixed to the object, so lines never crawl as it turns.",
    type: "number",
    defaultValue: "14",
  },
  {
    name: "indexEvery",
    description:
      "Draw every Nth contour as a heavier index contour. 0 turns index contours off.",
    type: "number",
    defaultValue: "5",
  },
  {
    name: "lineWidth",
    description: "Width of the regular contour lines in CSS pixels.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "indexWidth",
    description: "Width of the index contours and the outline in CSS pixels.",
    type: "number",
    defaultValue: "1.5",
  },
  {
    name: "lineColor",
    description:
      "Color of the contour lines as any CSS color. Leave empty to follow the element's text color, so it adapts to light and dark themes.",
    type: "string",
    defaultValue: '""',
  },
  {
    name: "indexColor",
    description:
      "Color of the index contours and the outline. Leave empty to use the line color.",
    type: "string",
    defaultValue: '""',
  },
  {
    name: "fill",
    description:
      "Strength of the soft surface tone between the lines: a faint tint of the line color that deepens where the surface turns away and steps up with elevation (0 to 1). 0 keeps the object as pure line work.",
    type: "number",
    defaultValue: "0.5",
  },
  {
    name: "shading",
    description:
      "How much the light direction thickens lines on shaded slopes and thins them on lit ones (0 to 1).",
    type: "number",
    defaultValue: "0.5",
  },
  {
    name: "outline",
    description:
      "Opacity of the outline: the coastline of 2D assets and the silhouette of 3D models (0 to 1).",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "drift",
    description:
      "Speed at which the contours climb the surface, in intervals per second. 0 keeps the map still.",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "depth",
    description:
      "Relief height of 2D assets (SVG or image) as a fraction of their longest side.",
    type: "number",
    defaultValue: "0.14",
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

export default async function TopographicObjectPage() {
  const variants = await Promise.all(
    getComponentSources("topographic-object").map(async (file) => ({
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
        title="Topographic Object"
        description={DESCRIPTION}
        variants={[...variants]}
        installItem="topographic-object"
        tags={["webgl", "three.js", "3D"]}
        apiReference={API_REFERENCE}
        preview={<TopographicObjectDemo />}
      />
      <div className="mx-auto mt-24 w-full max-w-4xl">
        <Footer variant="docs" />
      </div>
    </div>
  );
}
