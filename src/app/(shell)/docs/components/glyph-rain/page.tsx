import type { Metadata } from "next";

import { ComponentDoc } from "@/components/docs/component-doc";
import { Footer } from "@/components/landing/footer";
import type { ApiProp } from "@/components/docs/api-reference";
import { getComponentSources } from "@/lib/registry";
import { highlight } from "@/components/docs/highlight";
import { GlyphRainDemo } from "@/demos/glyph-rain-demo";
import { PageDemoPhoto } from "@/demos/scenes";

export const metadata: Metadata = {
  title: "Glyph Rain",
  description:
    "Wraps your content in a canvas using the html-in-canvas API and rains glowing glyph streams over it. Each drop head is a real point light that illuminates the page beneath with embossed relief shading, and the columns surge where your cursor cuts through them. No dependencies, works in any framework.",
  alternates: { canonical: "/docs/components/glyph-rain" },
};

const DESCRIPTION =
  "Glyphs rain down a dimmed page, and every drop head drags a pool of light across the content below. Run your cursor through the stream and it surges.";

const API_REFERENCE: ApiProp[] = [
  {
    name: "charset",
    description:
      "Characters used for the falling glyphs. Deduplicated into a glyph atlas.",
    type: "string",
    defaultValue: "katakana + digits",
  },
  {
    name: "cell",
    description: "Size of one glyph cell in CSS pixels (8 to 64).",
    type: "number",
    defaultValue: "15",
  },
  {
    name: "color",
    description: "Rain color as [r, g, b] in 0 to 1 range.",
    type: "[number, number, number]",
    defaultValue: "[0.267, 0.455, 1]",
  },
  {
    name: "headColor",
    description: "Color of the bright head glyph as [r, g, b] in 0 to 1 range.",
    type: "[number, number, number]",
    defaultValue: "[0.169, 0.416, 1]",
  },
  {
    name: "speed",
    description: "Fall speed in screen heights per second (0.05 to 3).",
    type: "number",
    defaultValue: "0.2",
  },
  {
    name: "speedVariance",
    description: "Per-column speed variation (0 to 1).",
    type: "number",
    defaultValue: "0.5",
  },
  {
    name: "density",
    description: "Fraction of drops that spawn each cycle (0 to 1).",
    type: "number",
    defaultValue: "0.15",
  },
  {
    name: "trail",
    description: "Length multiplier for the fading trails (0.2 to 3).",
    type: "number",
    defaultValue: "0.65",
  },
  {
    name: "glow",
    description:
      "Brightness of the drop heads and the light they cast (0 to 3).",
    type: "number",
    defaultValue: "1.75",
  },
  {
    name: "mutate",
    description: "How fast glyphs mutate into other characters (0 to 4).",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "flicker",
    description: "Random brightness flicker of the streaks (0 to 1).",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "layers",
    description: "Parallax rain layers behind the front one (1 to 3).",
    type: "number",
    defaultValue: "2",
  },
  {
    name: "dim",
    description:
      "How much the unlit page dims (0 to 1). 0 keeps it fully readable.",
    type: "number",
    defaultValue: "0.5",
  },
  {
    name: "light",
    description:
      "Strength of the light the drops shine onto the page (0 to 3).",
    type: "number",
    defaultValue: "2.8",
  },
  {
    name: "lightRadius",
    description: "Radius of each drop's light pool in CSS pixels (20 to 600).",
    type: "number",
    defaultValue: "240",
  },
  {
    name: "lightHeight",
    description:
      "How high above the page the lights float, in CSS pixels. Higher is softer.",
    type: "number",
    defaultValue: "172",
  },
  {
    name: "relief",
    description: "Embossed 3D shading of the page under the lights (0 to 2).",
    type: "number",
    defaultValue: "0.05",
  },
  {
    name: "stir",
    description:
      "How strongly the cursor stirs the rain as it passes (0 to 1). 0 disables it.",
    type: "number",
    defaultValue: "0.7",
  },
  {
    name: "stirRadius",
    description:
      "How far the stirring reaches to either side of the cursor, in CSS pixels.",
    type: "number",
    defaultValue: "260",
  },
  {
    name: "settle",
    description:
      "Seconds the stirred wake takes to settle back to its own rhythm.",
    type: "number",
    defaultValue: "0.9",
  },
  {
    name: "className",
    description: "Classes applied to the wrapper element.",
    type: "string",
  },
];

export default async function GlyphRainPage() {
  const variants = await Promise.all(
    getComponentSources("glyph-rain").map(async (file) => ({
      id: file.id,
      label: file.label,
      fileName: file.fileName,
      source: file.source,
      html: await highlight(file.source, file.lang),
    })),
  );

  return (
    <GlyphRainDemo>
      <ComponentDoc
        title="Glyph Rain"
        description={DESCRIPTION}
        variants={[...variants]}
        installItem="glyph-rain"
        tags={["html-in-canvas"]}
        apiReference={API_REFERENCE}
        beforeInstall={<PageDemoPhoto photo={2} />}
      />
      <div className="mx-auto mt-24 w-full max-w-4xl">
        <Footer variant="docs" />
      </div>
    </GlyphRainDemo>
  );
}
