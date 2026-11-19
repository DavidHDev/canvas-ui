import type { Metadata } from "next";

import { ComponentDoc } from "@/components/docs/component-doc";
import { Footer } from "@/components/landing/footer";
import type { ApiProp } from "@/components/docs/api-reference";
import { getComponentSources } from "@/lib/registry";
import { highlight } from "@/components/docs/highlight";
import { DecryptRevealDemo } from "@/demos/decrypt-reveal-demo";

export const metadata: Metadata = {
  title: "Decrypt Reveal",
  description:
    "Renders your content inside a canvas using the html-in-canvas API as real ASCII cipher text, and decrypts it back into the crisp UI around the cursor with a flickering glyph wavefront. No dependencies, works in any framework.",
  alternates: { canonical: "/docs/components/decrypt-reveal" },
};

const DESCRIPTION =
  "The page renders as scrambled ASCII cipher. Bring the cursor close and the glyphs decode back into crisp, full-color UI behind a flickering edge.";

const API_REFERENCE: ApiProp[] = [
  {
    name: "radius",
    description: "Decrypt radius around the cursor in CSS pixels.",
    type: "number",
    defaultValue: "400",
  },
  {
    name: "softness",
    description:
      "Feather of the decrypt edge as a fraction of the radius (0 to 1).",
    type: "number",
    defaultValue: "0.5",
  },
  {
    name: "cell",
    description: "Glyph cell height in CSS pixels.",
    type: "number",
    defaultValue: "10",
  },
  {
    name: "aspect",
    description: "Glyph cell width as a fraction of its height.",
    type: "number",
    defaultValue: "0.75",
  },
  {
    name: "charset",
    description:
      "Characters the cipher draws from. Defaults to all printable ASCII.",
    type: "string",
    defaultValue: "printable ASCII",
  },
  {
    name: "colored",
    description:
      "How much glyphs inherit the color of the UI underneath (0 = monochrome cipher color, 1 = fully colored).",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "color",
    description:
      "Cipher color, as any CSS color. Used for monochrome glyphs and the wavefront tint.",
    type: "string",
    defaultValue: '"#4ade80"',
  },
  {
    name: "brightness",
    description: "Brightness multiplier applied to the cipher glyphs.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "legibility",
    description:
      "Minimum contrast the cipher keeps against the background, so subtle UI stays readable while encrypted (0 to 1).",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "contrast",
    description:
      "Shape-matching contrast. Higher values pick bolder glyphs for busy areas.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "exposure",
    description:
      "Signal gain before glyph matching. Higher values make faint UI produce denser cipher text.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "scramble",
    description:
      "Fraction of glyphs that keep rerolling at idle (0 freezes the cipher).",
    type: "number",
    defaultValue: "0.1",
  },
  {
    name: "scrambleSpeed",
    description: "Rerolls per second for scrambling glyphs.",
    type: "number",
    defaultValue: "6",
  },
  {
    name: "edgeWidth",
    description:
      "Thickness of the decrypting wavefront as a fraction of the radius.",
    type: "number",
    defaultValue: "0.2",
  },
  {
    name: "edgeFlicker",
    description:
      "How violently glyphs churn inside the wavefront while decoding (0 to 1).",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "edgeGlow",
    description: "Brightness surge of glyphs caught in the wavefront.",
    type: "number",
    defaultValue: "2",
  },
  {
    name: "edgeTint",
    description:
      "How strongly wavefront glyphs are tinted toward the cipher color (0 to 1).",
    type: "number",
    defaultValue: "0.75",
  },
  {
    name: "aberration",
    description:
      "Chromatic aberration strength on decrypted content at the wavefront, in CSS pixels.",
    type: "number",
    defaultValue: "10",
  },
  {
    name: "passthrough",
    description:
      "How much of the real UI shows through the cipher (0 to 1). 0 keeps the page fully encrypted.",
    type: "number",
    defaultValue: "0.15",
  },
  {
    name: "threshold",
    description:
      "Contrast against the background above which a cell counts as UI and gets a glyph. Cells close to the background color stay empty.",
    type: "number",
    defaultValue: "0.005",
  },
  {
    name: "background",
    description:
      "Color of the backdrop behind the content, as any CSS color. Used to tell UI pixels apart from empty space.",
    type: "string",
    defaultValue: '"#000000"',
  },
  {
    name: "smoothing",
    description:
      "Seconds the reveal takes to catch up with the cursor. Higher feels more damped.",
    type: "number",
    defaultValue: "0.2",
  },
  {
    name: "className",
    description: "Classes applied to the wrapper element.",
    type: "string",
  },
];

export default async function DecryptRevealPage() {
  const variants = await Promise.all(
    getComponentSources("decrypt-reveal").map(async (file) => ({
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
        title="Decrypt Reveal"
        description={DESCRIPTION}
        variants={[...variants]}
        installItem="decrypt-reveal"
        tags={["html-in-canvas"]}
        requiresHtmlInCanvas
        apiReference={API_REFERENCE}
        preview={<DecryptRevealDemo />}
      />
      <div className="mx-auto mt-24 w-full max-w-4xl">
        <Footer variant="docs" />
      </div>
    </div>
  );
}
