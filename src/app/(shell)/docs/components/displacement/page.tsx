import type { Metadata } from "next";

import { ComponentDoc } from "@/components/docs/component-doc";
import { Footer } from "@/components/landing/footer";
import type { ApiProp } from "@/components/docs/api-reference";
import { getComponentSources } from "@/lib/registry";
import { highlight } from "@/components/docs/highlight";
import { DisplacementDemo } from "@/demos/displacement-demo";
import { PageDemoPhoto } from "@/demos/scenes";

export const metadata: Metadata = {
  title: "Displacement",
  description:
    "Wraps your content in a canvas using the html-in-canvas API and breaks it into a grid of cells that shear apart as the cursor moves, with per-cell chromatic aberration and film grain. No dependencies, works in any framework.",
  alternates: { canonical: "/docs/components/displacement" },
};

const DESCRIPTION =
  "Your page becomes a grid of cells. Sweep the cursor and they shear apart into offset, color-fringed tiles, then settle back.";

const API_REFERENCE: ApiProp[] = [
  {
    name: "grid",
    description: "Cells across the width of the wrapped area.",
    type: "number",
    defaultValue: "50",
  },
  {
    name: "cellAspect",
    description:
      "Width to height ratio of each cell. 1 is a perfect square, higher is wider, lower is taller.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "radius",
    description: "Radius of the cursor influence as a fraction of the grid.",
    type: "number",
    defaultValue: "0.1",
  },
  {
    name: "strength",
    description: "How hard cursor movement pushes cells around (0 to 1).",
    type: "number",
    defaultValue: "0.1",
  },
  {
    name: "threshold",
    description:
      "Minimum cursor speed in CSS pixels per second before cells react. Slow movement leaves the page alone. 0 reacts to any movement.",
    type: "number",
    defaultValue: "1000",
  },
  {
    name: "relaxation",
    description: "How slowly cells return to rest. Closer to 1 lingers longer.",
    type: "number",
    defaultValue: "0.9",
  },
  {
    name: "shift",
    description: "Multiplier on how far displaced cells shift the content.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "aberration",
    description:
      "Chromatic aberration inside each displaced cell. 0 disables it.",
    type: "number",
    defaultValue: "1.5",
  },
  {
    name: "grain",
    description: "Film grain over displaced cells. 0 disables it.",
    type: "number",
    defaultValue: "0.1",
  },
  {
    name: "grainSize",
    description: "Grain speck size multiplier.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "grainSpeed",
    description: "How fast the grain shimmers.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "scramble",
    description:
      "Random cell scramble on load that relaxes into place. 0 disables it.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "className",
    description: "Classes applied to the wrapper element.",
    type: "string",
  },
];

export default async function DisplacementPage() {
  const variants = await Promise.all(
    getComponentSources("displacement").map(async (file) => ({
      id: file.id,
      label: file.label,
      fileName: file.fileName,
      source: file.source,
      html: await highlight(file.source, file.lang),
    })),
  );

  return (
    <DisplacementDemo>
      <ComponentDoc
        title="Displacement"
        description={DESCRIPTION}
        variants={[...variants]}
        installItem="displacement"
        tags={["html-in-canvas"]}
        apiReference={API_REFERENCE}
        beforeInstall={<PageDemoPhoto photo={2} />}
      />
      <div className="mx-auto mt-24 w-full max-w-4xl">
        <Footer variant="docs" />
      </div>
    </DisplacementDemo>
  );
}
