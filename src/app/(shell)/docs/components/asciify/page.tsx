import type { Metadata } from "next";

import { ComponentDoc } from "@/components/docs/component-doc";
import { Footer } from "@/components/landing/footer";
import type { ApiProp } from "@/components/docs/api-reference";
import { getComponentSources } from "@/lib/registry";
import { highlight } from "@/components/docs/highlight";
import { AsciifyDemo } from "@/demos/asciify-demo";
import { DemoImageSection } from "@/demos/demo-image-cycler";

export const metadata: Metadata = {
  title: "Asciify",
  description:
    "Redraws visible content as ascii characters in a soft radius around the cursor, using HTML-in-Canvas where available and lightweight viewport snapshots in browsers such as Firefox. Works in any framework.",
  alternates: { canonical: "/docs/components/asciify" },
};

const DESCRIPTION =
  "A soft lens follows your cursor, redrawing the page beneath it as ascii characters. Move around, this page is the demo.";

const API_REFERENCE: ApiProp[] = [
  {
    name: "radius",
    description:
      "Radius of the ascii lens around the cursor, relative to the screen height.",
    type: "number",
    defaultValue: "0.4",
  },
  {
    name: "softness",
    description:
      "Edge feather of the lens as a fraction of the radius (0 to 1).",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "scale",
    description:
      "Size of one glyph pixel in CSS pixels. Characters are 5x5 glyph pixels.",
    type: "number",
    defaultValue: "2",
  },
  {
    name: "spacing",
    description: "Empty glyph pixels around each character (0 to 3).",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "charset",
    description:
      "Built-in character ramp: real ascii glyphs, shade blocks, or binary digits.",
    type: '"ascii" | "blocks" | "binary"',
    defaultValue: '"ascii"',
  },
  {
    name: "glyphs",
    description:
      "Custom ramp of packed 5x5 bitmaps (dark to bright), overrides charset.",
    type: "number[]",
    defaultValue: "[]",
  },
  {
    name: "background",
    description:
      'Paper color behind the glyphs as [r, g, b] in 0-1 range, or "auto" to match the page background.',
    type: '[number, number, number] | "auto"',
    defaultValue: "[0, 0, 0]",
  },
  {
    name: "backgroundOpacity",
    description: "Opacity of the background behind the glyphs (0 to 1).",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "contrast",
    description:
      "Contrast applied to character density before picking a glyph.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "brightness",
    description: "Density offset applied before picking a glyph (-1 to 1).",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "invert",
    description: "Invert character density inside the effect (0 to 1).",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "strength",
    description: "Coverage of asciified cells inside the lens (0 to 1).",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "baseStrength",
    description:
      "Ascii coverage across the whole screen, outside the lens (0 to 1).",
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

export default async function AsciifyPage() {
  const files = getComponentSources("asciify");
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
    <AsciifyDemo>
      <ComponentDoc
        title="Asciify"
        description={DESCRIPTION}
        variants={[...variants]}
        installItem="asciify"
        tags={["html-in-canvas"]}
        requiresHtmlInCanvas
        apiReference={API_REFERENCE}
        demoSection
        beforeInstall={
          <DemoImageSection
            hint="Move your cursor over the photo to see how it reads as ascii characters."
            alt="Demo photo for the Asciify effect"
          />
        }
      />
      <div className="mx-auto mt-24 w-full max-w-3xl">
        <Footer variant="docs" />
      </div>
    </AsciifyDemo>
  );
}
