import type { Metadata } from "next";

import { ComponentDoc } from "@/components/docs/component-doc";
import { Footer } from "@/components/landing/footer";
import type { ApiProp } from "@/components/docs/api-reference";
import { getComponentSources } from "@/lib/registry";
import { highlight } from "@/components/docs/highlight";
import { CanvasDemo } from "@/demos/canvas-demo";
import { PageDemoPhoto } from "@/demos/scenes";

export const metadata: Metadata = {
  title: "Canvas",
  description:
    "Wraps your content in a canvas using the html-in-canvas API and paints the whole page onto woven artist canvas, with fiber texture, grain, and a dotted halftone screen. No dependencies, works in any framework.",
  alternates: { canonical: "/docs/components/canvas" },
};

const DESCRIPTION =
  "Your page, painted onto woven artist canvas. Fiber threads, paper tint, grain, and a halftone screen. Drag the cursor and it works like a loaded brush, leaving ridges of wet paint that catch the light and settle as they dry.";

const API_REFERENCE: ApiProp[] = [
  {
    name: "threadSize",
    description: "Height of one woven thread in CSS pixels.",
    type: "number",
    defaultValue: "2",
  },
  {
    name: "threadWidth",
    description: "Width of the dark seams between threads (0 to 1).",
    type: "number",
    defaultValue: "0.2",
  },
  {
    name: "texture",
    description: "How strongly the woven texture shades the paint (0 to 1).",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "tint",
    description: "Canvas paper color as [r, g, b] in 0-1 range.",
    type: "[number, number, number]",
    defaultValue: "[0.84, 0.81, 0.75]",
  },
  {
    name: "tintStrength",
    description: "How much the paper color warms the painting (0 to 1).",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "grain",
    description: "Amount of photographic grain worked into the paint (0 to 1).",
    type: "number",
    defaultValue: "0.5",
  },
  {
    name: "halftone",
    description:
      "Amount of dotted halftone screen applied to the painting (0 to 1).",
    type: "number",
    defaultValue: "0.1",
  },
  {
    name: "dotSize",
    description: "Size of the halftone screen dots in CSS pixels.",
    type: "number",
    defaultValue: "6",
  },
  {
    name: "strength",
    description: "Overall mix between the raw page (0) and the painting (1).",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "relief",
    description: "How far wet paint stands off the weave, lit in 3D (0 to 1).",
    type: "number",
    defaultValue: "0.45",
  },
  {
    name: "gloss",
    description:
      "Sheen on fresh paint. Wet strokes catch the light, dry ones go matte (0 to 1).",
    type: "number",
    defaultValue: "0.35",
  },
  {
    name: "bristle",
    description:
      "Definition of the bristle grooves combed through each stroke (0 to 1).",
    type: "number",
    defaultValue: "0.4",
  },
  {
    name: "dry",
    description: "Seconds a stroke takes to level back into the canvas.",
    type: "number",
    defaultValue: "2.5",
  },
  {
    name: "radius",
    description: "Radius of the brush, relative to the screen height.",
    type: "number",
    defaultValue: "0.08",
  },
  {
    name: "intro",
    description:
      "Duration of the intro fade-in of the painting effect in seconds. 0 skips it.",
    type: "number",
    defaultValue: "1.6",
  },
  {
    name: "followSpeed",
    description:
      "How quickly the brush follows the cursor. Higher is snappier.",
    type: "number",
    defaultValue: "3",
  },
  {
    name: "className",
    description: "Classes applied to the wrapper element.",
    type: "string",
  },
];

export default async function CanvasPage() {
  const variants = await Promise.all(
    getComponentSources("canvas").map(async (file) => ({
      id: file.id,
      label: file.label,
      fileName: file.fileName,
      source: file.source,
      html: await highlight(file.source, file.lang),
    })),
  );

  return (
    <CanvasDemo>
      <ComponentDoc
        title="Canvas"
        description={DESCRIPTION}
        variants={[...variants]}
        installItem="canvas"
        tags={["html-in-canvas"]}
        requiresHtmlInCanvas
        apiReference={API_REFERENCE}
        beforeInstall={<PageDemoPhoto photo={1} />}
      />
      <div className="mx-auto mt-24 w-full max-w-4xl">
        <Footer variant="docs" />
      </div>
    </CanvasDemo>
  );
}
