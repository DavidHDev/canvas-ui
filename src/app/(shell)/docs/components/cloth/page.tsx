import type { Metadata } from "next";

import { ComponentDoc } from "@/components/docs/component-doc";
import { Footer } from "@/components/landing/footer";
import type { ApiProp } from "@/components/docs/api-reference";
import { getComponentSources } from "@/lib/registry";
import { highlight } from "@/components/docs/highlight";
import { ClothDemo } from "@/demos/cloth-demo";
import { DemoImageSection } from "@/demos/demo-image-cycler";

export const metadata: Metadata = {
  title: "Cloth",
  description:
    "Renders live HTML as a piece of fabric rippling in the wind, with softly lit folds. Cursor strokes send waves traveling across the cloth. The HTML stays fully interactive. No dependencies.",
  alternates: { canonical: "/docs/components/cloth" },
};

const DESCRIPTION =
  "Hangs your live HTML on a piece of fabric rippling in the wind, with softly lit folds. Brush it with your cursor to send waves across the cloth. Everything stays interactive.";

const API_REFERENCE: ApiProp[] = [
  {
    name: "pin",
    description:
      'Edge the cloth hangs from: "top", "bottom", "left", or "right". The opposite side swings free.',
    type: '"top" | "bottom" | "left" | "right"',
    defaultValue: '"top"',
  },
  {
    name: "wind",
    description:
      "Wind force driving the fabric. At 0 the waves die down and the cloth settles.",
    type: "number",
    defaultValue: "3",
  },
  {
    name: "speed",
    description: "Playback speed of the cloth motion.",
    type: "number",
    defaultValue: "0.5",
  },
  {
    name: "amplitude",
    description: "Height of the fabric folds in CSS pixels.",
    type: "number",
    defaultValue: "30",
  },
  {
    name: "drape",
    description:
      "How many CSS pixels the cloth billows toward the viewer on a gust.",
    type: "number",
    defaultValue: "40",
  },
  {
    name: "brush",
    description:
      "How strongly the cursor's touch lifts the fabric (0 disables). The touch glides after the pointer and eases in and out, leaving a soft imprint that settles on its own.",
    type: "number",
    defaultValue: "2.05",
  },
  {
    name: "brushSize",
    description: "Radius of the cursor's influence in CSS pixels.",
    type: "number",
    defaultValue: "150",
  },
  {
    name: "damping",
    description:
      "How quickly waves settle. Higher values calm the fabric faster; lower values let ripples ring longer.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "light",
    description: "Strength of the directional lighting on the folds (0 to 1).",
    type: "number",
    defaultValue: "0.5",
  },
  {
    name: "sheen",
    description: "Strength of the soft sheen on fold crests (0 to 1).",
    type: "number",
    defaultValue: "0.1",
  },
  {
    name: "shadow",
    description:
      "Opacity of the soft contact shadow the fabric casts on the page (0 to 1). On dark pages it becomes a subtle light glow instead.",
    type: "number",
    defaultValue: "0.25",
  },
  {
    name: "cornerRadius",
    description: "Corner radius of the fabric in CSS pixels.",
    type: "number",
    defaultValue: "20",
  },
  {
    name: "backing",
    description:
      'Fabric color behind transparent content as RGB in the 0 to 1 range, or "auto" to sample the page background. Re-resolves on theme changes.',
    type: '[number, number, number] | "auto"',
    defaultValue: '"auto"',
  },
  {
    name: "perspective",
    description:
      "Perspective focal length in CSS pixels. Lower values exaggerate the 3D depth.",
    type: "number",
    defaultValue: "1200",
  },
];

export default async function ClothPage() {
  const variants = await Promise.all(
    getComponentSources("cloth").map(async (file) => ({
      id: file.id,
      label: file.label,
      fileName: file.fileName,
      source: file.source,
      html: await highlight(file.source, file.lang),
    })),
  );

  return (
    <ClothDemo>
      <ComponentDoc
        title="Cloth"
        description={DESCRIPTION}
        variants={[...variants]}
        installItem="cloth"
        tags={["html-in-canvas"]}
        requiresHtmlInCanvas
        apiReference={API_REFERENCE}
        demoSection
        beforeInstall={
          <DemoImageSection
            hint="This whole page is hanging on the fabric. Brush it with your cursor, and open the controls to change the wind."
            alt="Demo photo for the Cloth effect"
          />
        }
      />
      <div className="mx-auto mt-24 w-full max-w-3xl">
        <Footer variant="docs" />
      </div>
    </ClothDemo>
  );
}
