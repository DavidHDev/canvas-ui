import type { Metadata } from "next";

import { ComponentDoc } from "@/components/docs/component-doc";
import { Footer } from "@/components/landing/footer";
import type { ApiProp } from "@/components/docs/api-reference";
import { getComponentSources } from "@/lib/registry";
import { highlight } from "@/components/docs/highlight";
import { ShatterDemo } from "@/demos/shatter-demo";
import { DemoImageSection } from "@/demos/demo-image-cycler";

export const metadata: Metadata = {
  title: "Shatter",
  description:
    "Wraps your content in a canvas using the html-in-canvas API and shatters the page into 3D glass shards that lift, tilt, and float around the cursor, refracting the content beneath them, with perspective and soft shadows. No dependencies, works in any framework.",
  alternates: { canonical: "/docs/components/shatter" },
};

const DESCRIPTION =
  "The page breaks into 3D glass shards around your cursor. Each shard lifts, tips, and floats above the void, bending the content beneath it and casting soft shadows. Move around, this page is the demo.";

const API_REFERENCE: ApiProp[] = [
  {
    name: "radius",
    description:
      "Radius of the shatter lens around the cursor, relative to the screen height.",
    type: "number",
    defaultValue: "0.4",
  },
  {
    name: "softness",
    description:
      "Edge feather of the lens as a fraction of the radius (0 to 1).",
    type: "number",
    defaultValue: "0.6",
  },
  {
    name: "tileSize",
    description: "Tile size in CSS pixels.",
    type: "number",
    defaultValue: "125",
  },
  {
    name: "shards",
    description:
      "Shape irregularity. 0 keeps a perfect square grid, 1 breaks the page into uneven glass shards.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "corner",
    description: "Corner rounding of fully lifted tiles in CSS pixels.",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "lift",
    description: "How high tiles lift off the page in CSS pixels.",
    type: "number",
    defaultValue: "30",
  },
  {
    name: "tilt",
    description: "How steeply tiles tip out of the page plane (0 to 3).",
    type: "number",
    defaultValue: "2",
  },
  {
    name: "scatter",
    description: "How far tiles slide sideways while lifted, in CSS pixels.",
    type: "number",
    defaultValue: "5",
  },
  {
    name: "perspective",
    description: "Perspective distance in CSS pixels. Lower is more dramatic.",
    type: "number",
    defaultValue: "1500",
  },
  {
    name: "gapColor",
    description:
      "Color of the void behind lifted tiles as [r, g, b] in 0-1 range.",
    type: "[number, number, number]",
    defaultValue: "[0, 0, 0]",
  },
  {
    name: "shadow",
    description: "Opacity of the drop shadows under lifted tiles (0 to 2).",
    type: "number",
    defaultValue: "0.5",
  },
  {
    name: "shading",
    description: "Strength of the per-tile lighting (0 to 2).",
    type: "number",
    defaultValue: "0.5",
  },
  {
    name: "refraction",
    description:
      "How strongly lifted shards refract the content beneath them, like glass (0 to 2).",
    type: "number",
    defaultValue: "1.5",
  },
  {
    name: "dispersion",
    description:
      "Chromatic fringing of the refraction (0 to 1). 0 keeps it color-true.",
    type: "number",
    defaultValue: "0.3",
  },
  {
    name: "floatSpeed",
    description: "Speed of the floating tile motion. 0 freezes the tiles.",
    type: "number",
    defaultValue: "2",
  },
  {
    name: "strength",
    description: "How fully tiles lift inside the lens (0 to 1).",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "baseStrength",
    description:
      "Lift amount across the whole screen, outside the lens (0 to 1).",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "followSpeed",
    description: "How quickly the lens follows the cursor. Higher is snappier.",
    type: "number",
    defaultValue: "3",
  },
];

export default async function ShatterPage() {
  const files = getComponentSources("shatter");
  const variants = await Promise.all(
    files.map(async (file) => ({
      id: file.id,
      label: file.label,
      fileName: file.fileName,
      source: file.source,
      html: await highlight(file.source, file.lang),
    })),
  );

  return (
    <ShatterDemo>
      <ComponentDoc
        title="Shatter"
        description={DESCRIPTION}
        variants={[...variants]}
        installItem="shatter"
        tags={["html-in-canvas"]}
        requiresHtmlInCanvas
        apiReference={API_REFERENCE}
        demoSection
        beforeInstall={
          <DemoImageSection
            hint="Move your cursor over the photo to break it into floating glass shards."
            alt="Demo photo for the Shatter effect"
          />
        }
      />
      <div className="mx-auto mt-24 w-full max-w-3xl">
        <Footer variant="docs" />
      </div>
    </ShatterDemo>
  );
}
