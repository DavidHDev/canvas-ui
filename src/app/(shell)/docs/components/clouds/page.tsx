import type { Metadata } from "next";

import { ComponentDoc } from "@/components/docs/component-doc";
import { Footer } from "@/components/landing/footer";
import type { ApiProp } from "@/components/docs/api-reference";
import { getComponentSources } from "@/lib/registry";
import { highlight } from "@/components/docs/highlight";
import { CloudsDemo } from "@/demos/clouds-demo";
import { PageDemoPhoto } from "@/demos/scenes";

export const metadata: Metadata = {
  title: "Clouds",
  description:
    "Lit, drifting clouds that pass over your page while text stays readable, or sit behind it as a background. Cursor wind parts them. No dependencies, works in any framework.",
  alternates: { canonical: "/docs/components/clouds" },
};

const DESCRIPTION =
  "Lit clouds drift over the page while text stays readable, or sit behind it as a background. Move the cursor and the wind parts them along your trail.";

const API_REFERENCE: ApiProp[] = [
  {
    name: "layer",
    description:
      '"page" draws the live content into the effect so the clouds can fog, blur and bend it while text stays legible (html-in-canvas; elsewhere it falls back to "foreground"). "background" sits behind the content, "foreground" over it.',
    type: '"page" | "background" | "foreground"',
    defaultValue: '"page"',
  },
  {
    name: "scale",
    description:
      "Cloud pattern scale (0.3 to 3). Lower values make bigger clouds.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "speed",
    description: "Drift speed multiplier (0 to 5). 0 freezes the sky.",
    type: "number",
    defaultValue: "0.6",
  },
  {
    name: "direction",
    description:
      "Direction the clouds travel in degrees. 0 points right, 90 up.",
    type: "number",
    defaultValue: "225",
  },
  {
    name: "cover",
    description: "Base cloud coverage added everywhere (0 to 1).",
    type: "number",
    defaultValue: "0.4",
  },
  {
    name: "density",
    description:
      "How sharply the cloud shapes condense out of the noise field (0 to 16).",
    type: "number",
    defaultValue: "2.5",
  },
  {
    name: "softness",
    description:
      "Edge feather (0 to 1). 1 is soft mist, lower values give each cloud a defined outline.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "billow",
    description:
      "Rounded, cauliflower-like lumps in the cloud shapes and their shading (0 to 1). Pair it with a low softness for cumulus.",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "shading",
    description:
      "How strongly the clouds are lit from the side (0 to 1). Slopes facing the light move toward lightColor, slopes facing away toward shadeColor. The light comes from the side opposite the shadow offset. 0 gives a flat color.",
    type: "number",
    defaultValue: "0.5",
  },
  {
    name: "color",
    description:
      'Cloud color as RGB in the 0 to 1 range, or "auto" to resolve the page background so content dissolves into it. Re-resolves on theme changes.',
    type: '[number, number, number] | "auto"',
    defaultValue: '"auto"',
  },
  {
    name: "lightColor",
    description:
      'Color of the lit slopes as RGB in the 0 to 1 range, or "auto" to derive it from color.',
    type: '[number, number, number] | "auto"',
    defaultValue: '"auto"',
  },
  {
    name: "shadeColor",
    description:
      'Color of the shaded slopes as RGB in the 0 to 1 range, or "auto" to derive it from color.',
    type: '[number, number, number] | "auto"',
    defaultValue: '"auto"',
  },
  {
    name: "opacity",
    description:
      "Maximum opacity of the cloud layer over the content (0 to 1). At 1 the thickest clouds fully hide the content.",
    type: "number",
    defaultValue: "0.64",
  },
  {
    name: "legibility",
    description:
      'How much the clouds thin out over text so it stays readable (0 to 1). Only active with layer "page" when html-in-canvas is available.',
    type: "number",
    defaultValue: "0.85",
  },
  {
    name: "shadow",
    description:
      "Strength of the shadows the clouds cast on the content (0 to 1).",
    type: "number",
    defaultValue: "0.06",
  },
  {
    name: "shadowOffsetX",
    description:
      "Horizontal shadow displacement in CSS pixels. Positive shifts shadows right.",
    type: "number",
    defaultValue: "200",
  },
  {
    name: "shadowOffsetY",
    description:
      "Vertical shadow displacement in CSS pixels. Positive shifts shadows down.",
    type: "number",
    defaultValue: "-10",
  },
  {
    name: "shadowSoftness",
    description: "How diffuse the shadow edges are (0 to 1).",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "wind",
    description:
      "How strongly the cursor parts and pushes the clouds (0 to 1). A click or tap sends out a puff. The clearing drifts shut again after the pointer passes.",
    type: "number",
    defaultValue: "0.6",
  },
  {
    name: "windRadius",
    description: "Radius of the cursor wind clearing in CSS pixels.",
    type: "number",
    defaultValue: "350",
  },
  {
    name: "linger",
    description: "Seconds for half of a cleared trail to close again.",
    type: "number",
    defaultValue: "0.7",
  },
  {
    name: "refraction",
    description:
      "How far the fog bends the captured page in CSS pixels. Only active where the mist is thick, and only when html-in-canvas is available.",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "fogBlur",
    description:
      "How much the fog blurs the captured page underneath it (0 to 1). Only active when html-in-canvas is available.",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "quality",
    description:
      "Internal render resolution of the cloud field as a fraction of the viewport (0.2 to 1). Clouds are soft, so lower values look nearly identical and cost far less.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "fixed",
    description:
      'Pins the wrapper to the viewport. With layer "background" it sits behind the page, otherwise above it.',
    type: "boolean",
    defaultValue: "false",
  },
  {
    name: "children",
    description:
      "Content to cover. Leave it out to render the clouds alone, filling the wrapper.",
    type: "ReactNode",
  },
  {
    name: "className",
    description: "Classes applied to the wrapper element.",
    type: "string",
  },
];

export default async function CloudsPage() {
  const variants = await Promise.all(
    getComponentSources("clouds").map(async (file) => ({
      id: file.id,
      label: file.label,
      fileName: file.fileName,
      source: file.source,
      html: await highlight(file.source, file.lang),
    })),
  );

  return (
    <CloudsDemo>
      <ComponentDoc
        title="Clouds"
        description={DESCRIPTION}
        variants={[...variants]}
        installItem="clouds"
        tags={["html-in-canvas"]}
        apiReference={API_REFERENCE}
        beforeInstall={<PageDemoPhoto photo={2} />}
      />
      <div className="mx-auto mt-24 w-full max-w-4xl">
        <Footer variant="docs" />
      </div>
    </CloudsDemo>
  );
}
