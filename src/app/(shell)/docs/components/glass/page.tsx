import type { Metadata } from "next";

import { ComponentDoc } from "@/components/docs/component-doc";
import { DemoImageSection } from "@/demos/demo-image-cycler";
import { Footer } from "@/components/landing/footer";
import type { ApiProp } from "@/components/docs/api-reference";
import { getComponentSources } from "@/lib/registry";
import { highlight } from "@/components/docs/highlight";
import { GlassDemo } from "@/demos/glass-demo";

export const metadata: Metadata = {
  title: "Glass",
  description:
    "Wraps your content in a canvas using the html-in-canvas API and floats a cursor-following glass lens above it, with physically based refraction, fresnel reflection, chromatic aberration, and a crystal ball zoom over target elements. No dependencies, works in any framework.",
  alternates: { canonical: "/docs/components/glass" },
};

const DESCRIPTION =
  "A glass lens follows your cursor and refracts the live page. Hover a heading or button and it magnifies like a crystal ball.";

const API_REFERENCE: ApiProp[] = [
  {
    name: "shape",
    description: 'Lens shape: "circle", "square", or "rectangle".',
    type: '"circle" | "square" | "rectangle"',
    defaultValue: '"circle"',
  },
  {
    name: "size",
    description:
      "Lens size (radius, or half height for rectangles) in CSS pixels.",
    type: "number",
    defaultValue: "120",
  },
  {
    name: "aspect",
    description: "Width to height ratio of the rectangle shape (1 to 3).",
    type: "number",
    defaultValue: "1.7",
  },
  {
    name: "corner",
    description: "Corner radius for square and rectangle shapes in CSS pixels.",
    type: "number",
    defaultValue: "32",
  },
  {
    name: "ior",
    description:
      "Index of refraction of the glass (1 to 2). Higher bends light more strongly at the rim.",
    type: "number",
    defaultValue: "1.5",
  },
  {
    name: "edge",
    description:
      "Fraction of the lens that stays optically flat before the rim starts bending (0 to 1).",
    type: "number",
    defaultValue: "0.7",
  },
  {
    name: "bevel",
    description: "How sharply the rim curves away (1 to 10).",
    type: "number",
    defaultValue: "4",
  },
  {
    name: "depth",
    description:
      "Optical depth in CSS pixels: how far the glass floats above the page, which scales the refraction displacement.",
    type: "number",
    defaultValue: "250",
  },
  {
    name: "aberration",
    description:
      "Chromatic aberration strength at the rim (0 to 3). 0 disables the spectral split.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "blur",
    description:
      "Frosted blur of the glass face (0 to 4). 0 keeps the glass optically clear.",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "reflection",
    description:
      "Strength of the fresnel reflection on the rim (0 to 2). 0 disables it.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "shine",
    description:
      "Specular rim highlight (0 to 2) that keeps the lens visible over plain backgrounds. 0 disables it.",
    type: "number",
    defaultValue: "0.01",
  },
  {
    name: "zoom",
    description:
      "Magnification while hovering a target element (1 to 3), like a crystal ball.",
    type: "number",
    defaultValue: "1.5",
  },
  {
    name: "targets",
    description:
      "CSS selector for the elements that trigger the crystal ball zoom on hover.",
    type: "string",
    defaultValue: '"[data-glass-target]"',
  },
  {
    name: "follow",
    description:
      "How quickly the lens follows the cursor (0 to 1). 1 snaps to it.",
    type: "number",
    defaultValue: "0.2",
  },
  {
    name: "className",
    description: "Classes applied to the wrapper element.",
    type: "string",
  },
];

export default async function GlassPage() {
  const variants = await Promise.all(
    getComponentSources("glass").map(async (file) => ({
      id: file.id,
      label: file.label,
      fileName: file.fileName,
      source: file.source,
      html: await highlight(file.source, file.lang),
    })),
  );

  return (
    <GlassDemo>
      <ComponentDoc
        title="Glass"
        description={DESCRIPTION}
        variants={[...variants]}
        installItem="glass"
        tags={["html-in-canvas"]}
        apiReference={API_REFERENCE}
        demoSection
        beforeInstall={
          <DemoImageSection
            hint="Move the lens over the photo to magnify every detail."
            alt="Demo photo for the Glass effect"
          />
        }
      />
      <div className="mx-auto mt-24 w-full max-w-3xl">
        <Footer variant="docs" />
      </div>
    </GlassDemo>
  );
}
