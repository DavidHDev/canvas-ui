import type { Metadata } from "next";

import { ComponentDoc } from "@/components/docs/component-doc";
import { DemoImageSection } from "@/demos/demo-image-cycler";
import { Footer } from "@/components/landing/footer";
import type { ApiProp } from "@/components/docs/api-reference";
import { getComponentSources } from "@/lib/registry";
import { highlight } from "@/components/docs/highlight";
import { CloudsDemo } from "@/demos/clouds-demo";

export const metadata: Metadata = {
  title: "Clouds",
  description:
    "Overlays your content with drifting procedural clouds that cast soft, offset shadows on the page below, like weather passing over your UI. No dependencies, works in any framework.",
  alternates: { canonical: "/docs/components/clouds" },
};

const DESCRIPTION =
  "Fog drifts over the page and blurs whatever it covers. Move the cursor and the wind parts the clouds along your trail.";

const API_REFERENCE: ApiProp[] = [
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
    name: "cover",
    description: "Base cloud coverage added everywhere (0 to 1).",
    type: "number",
    defaultValue: "0.1",
  },
  {
    name: "density",
    description:
      "How sharply the cloud shapes condense out of the noise field (0 to 16).",
    type: "number",
    defaultValue: "2.5",
  },
  {
    name: "shading",
    description:
      "Strength of the internal depth shading of the clouds (0 to 1). Darkens crevices on light backgrounds, lifts highlights on dark ones.",
    type: "number",
    defaultValue: "0.1",
  },
  {
    name: "color",
    description:
      'Cloud color as RGB in the 0 to 1 range, or "auto" to resolve the page background so content dissolves into it. Re-resolves on theme changes.',
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
      "How strongly cursor movement parts the clouds (0 to 1). The clearing drifts shut again after the pointer passes.",
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
        demoSection
        beforeInstall={
          <DemoImageSection
            hint="Watch the clouds drift across the photo, and push them around with your cursor."
            alt="Demo photo for the Clouds effect"
          />
        }
      />
      <div className="mx-auto mt-24 w-full max-w-3xl">
        <Footer variant="docs" />
      </div>
    </CloudsDemo>
  );
}
