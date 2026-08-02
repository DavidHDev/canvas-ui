import type { Metadata } from "next";

import { ComponentDoc } from "@/components/docs/component-doc";
import { Footer } from "@/components/landing/footer";
import type { ApiProp } from "@/components/docs/api-reference";
import { getComponentSources } from "@/lib/registry";
import { highlight } from "@/components/docs/highlight";
import { PeelDemo } from "@/demos/peel-demo";

export const metadata: Metadata = {
  title: "Peel",
  description:
    "Renders your content inside a canvas using the html-in-canvas API and peels it back from a chosen edge when the cursor approaches, curling the live page in 3D to reveal a second layer underneath. No dependencies, works in any framework.",
  alternates: { canonical: "/docs/components/peel" },
};

const DESCRIPTION =
  "Move the cursor to an edge and the live page peels back like a sticker, revealing whatever you put underneath.";

const API_REFERENCE: ApiProp[] = [
  {
    name: "side",
    description: "Which edge peels away when the cursor approaches it.",
    type: '"left" | "right" | "top" | "bottom"',
    defaultValue: '"left"',
  },
  {
    name: "mode",
    description:
      "How the peel is driven. Cursor mode peels progressively the closer the pointer gets to the edge, hover mode peels fully once the pointer enters the zone.",
    type: '"cursor" | "hover"',
    defaultValue: '"cursor"',
  },
  {
    name: "reveal",
    description: "How far the sheet peels back at full peel, in CSS pixels.",
    type: "number",
    defaultValue: "250",
  },
  {
    name: "zone",
    description:
      "Depth of the strip along the chosen edge that drives the peel, in CSS pixels.",
    type: "number",
    defaultValue: "200",
  },
  {
    name: "curl",
    description:
      "Radius of the curl cylinder in CSS pixels. Small values roll tightly, large values lift a gentle flap.",
    type: "number",
    defaultValue: "300",
  },
  {
    name: "bow",
    description:
      "How much the lifted edge bows across its length, in CSS pixels. Positive values bow outward, negative values bow inward.",
    type: "number",
    defaultValue: "75",
  },
  {
    name: "shade",
    description:
      "Strength of the curvature shading on the lifted sheet (0 to 1).",
    type: "number",
    defaultValue: "0.25",
  },
  {
    name: "shine",
    description:
      "Strength of the light sheen along the peeling edge (0 to 1). It brightens as the cursor approaches, follows it along the edge, and rides the lifted edge while peeled.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "shineDistance",
    description:
      "Distance from the edge at which the shine starts to appear, in CSS pixels. 0 uses the full container span.",
    type: "number",
    defaultValue: "1200",
  },
  {
    name: "shineColor",
    description:
      'Shine color as RGB in the 0 to 1 range, or "auto" to follow the page theme: light shine on dark backgrounds, dark shine on light ones. Re-resolves on theme changes.',
    type: '[number, number, number] | "auto"',
    defaultValue: '"auto"',
  },
  {
    name: "bulge",
    description:
      "How many CSS pixels the peeled edge bulges toward the cursor, tracking its position along the fold.",
    type: "number",
    defaultValue: "50",
  },
  {
    name: "perspective",
    description:
      "Distance from the camera to the page in CSS pixels. Lower values exaggerate the 3D lift.",
    type: "number",
    defaultValue: "2000",
  },
  {
    name: "smoothing",
    description:
      "Seconds the peel takes to catch up with the cursor. Higher feels more damped.",
    type: "number",
    defaultValue: "0.3",
  },
  {
    name: "under",
    description:
      "Content revealed underneath the peel. A prop in React and Solid, a named slot in Vue and Svelte, an element with the under attribute in Angular. In vanilla, place your own element behind the source canvas.",
    type: "ReactNode",
  },
  {
    name: "className",
    description: "Classes applied to the wrapper element.",
    type: "string",
  },
];

export default async function PeelPage() {
  const variants = await Promise.all(
    getComponentSources("peel").map(async (file) => ({
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
        title="Peel"
        description={DESCRIPTION}
        variants={[...variants]}
        installItem="peel"
        tags={["html-in-canvas"]}
        requiresHtmlInCanvas
        apiReference={API_REFERENCE}
        beforeInstall={<PeelDemo />}
      />
      <div className="mx-auto mt-24 w-full max-w-3xl">
        <Footer variant="docs" />
      </div>
    </div>
  );
}
