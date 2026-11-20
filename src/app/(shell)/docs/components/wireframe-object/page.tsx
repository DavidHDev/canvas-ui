import type { Metadata } from "next";

import { ComponentDoc } from "@/components/docs/component-doc";
import { Footer } from "@/components/landing/footer";
import type { ApiProp } from "@/components/docs/api-reference";
import { getComponentSources } from "@/lib/registry";
import { highlight } from "@/components/docs/highlight";
import { WireframeObjectDemo } from "@/demos/wireframe-object-demo";

export const metadata: Metadata = {
  title: "Wireframe Object",
  description:
    "Draws any GLB/glTF model, SVG, or image as crisp edge lines with hidden-line removal and glowing nodes at the corners, like a technical drawing that turns in 3D. Built on three.js, works in any framework.",
  alternates: { canonical: "/docs/components/wireframe-object" },
};

const DESCRIPTION =
  "Point it at a 3D model, SVG, or image and it becomes a technical drawing. Creases, outlines, and silhouettes are pulled from the real geometry, lines behind the surface drop to faint dashes, and a scan band sweeps across to light up the mesh.";

const API_REFERENCE: ApiProp[] = [
  {
    name: "src",
    description:
      "URL of the asset to display: GLB/glTF, SVG, PNG, JPEG, WebP, or GIF.",
    type: "string",
  },
  {
    name: "lineColor",
    description:
      "Color of the edge lines as any CSS color. Leave empty to follow the element's CSS color, so the drawing matches the page theme.",
    type: "string",
    defaultValue: '""',
  },
  {
    name: "lineWidth",
    description: "Width of the edge lines in CSS pixels.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "opacity",
    description: "Overall opacity of the drawing (0 to 1).",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "creaseAngle",
    description:
      "Fold angle in degrees above which an edge counts as a crease and is drawn. Silhouettes are always drawn.",
    type: "number",
    defaultValue: "30",
  },
  {
    name: "hiddenLines",
    description:
      "Opacity of the dashed lines hidden behind the surface. 0 hides them.",
    type: "number",
    defaultValue: "0.22",
  },
  {
    name: "topology",
    description:
      "Opacity of the full triangle topology behind the feature edges (0 to 1). Diagonals across flat faces are skipped.",
    type: "number",
    defaultValue: "0.1",
  },
  {
    name: "nodes",
    description: "Draw glowing nodes where feature edges meet at a corner.",
    type: "boolean",
    defaultValue: "true",
  },
  {
    name: "nodeSize",
    description: "Radius of the corner nodes in CSS pixels.",
    type: "number",
    defaultValue: "2.25",
  },
  {
    name: "nodeColor",
    description:
      "Color of the corner nodes and the scan highlight as any CSS color. Leave empty to use the line color.",
    type: "string",
    defaultValue: '"#066aff"',
  },
  {
    name: "glow",
    description: "Strength of the soft glow around nodes and lines (0 to 1).",
    type: "number",
    defaultValue: "0.6",
  },
  {
    name: "depthFade",
    description: "How much edges dim with distance from the camera (0 to 1).",
    type: "number",
    defaultValue: "0.5",
  },
  {
    name: "scan",
    description:
      "Strength of the scan band that sweeps over the object and lights up its topology. 0 disables it.",
    type: "number",
    defaultValue: "0.6",
  },
  {
    name: "scanSpeed",
    description: "Speed of the scan band. 1 sweeps about once every six seconds.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "depth",
    description:
      "Extrusion depth of 2D assets (SVG or image) as a fraction of their longest side.",
    type: "number",
    defaultValue: "0.16",
  },
  {
    name: "bevel",
    description:
      "Edge rounding of extruded 2D assets (0 to 1). Adds a chamfer ring around each outline.",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "background",
    description:
      "Background color behind the drawing. Leave empty for a transparent canvas.",
    type: "string",
    defaultValue: '""',
  },
  {
    name: "scale",
    description:
      "Size of the longest side of the asset in scene units. The camera sits about 4 units away. Portrait canvases shrink it to fit the width.",
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

export default async function WireframeObjectPage() {
  const variants = await Promise.all(
    getComponentSources("wireframe-object").map(async (file) => ({
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
        title="Wireframe Object"
        description={DESCRIPTION}
        variants={[...variants]}
        installItem="wireframe-object"
        tags={["webgl", "three.js", "3D"]}
        apiReference={API_REFERENCE}
        preview={<WireframeObjectDemo />}
      />
      <div className="mx-auto mt-24 w-full max-w-4xl">
        <Footer variant="docs" />
      </div>
    </div>
  );
}
