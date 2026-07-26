import type { Metadata } from "next";

import { ComponentDoc } from "@/components/docs/component-doc";
import { Footer } from "@/components/landing/footer";
import type { ApiProp } from "@/components/docs/api-reference";
import { getComponentSources } from "@/lib/registry";
import { highlight } from "@/components/docs/highlight";
import { HeadingAnchor } from "@/components/docs/heading-anchor";
import { ParticleRevealDemo } from "@/demos/particle-reveal-demo";

export const metadata: Metadata = {
  title: "Particle Reveal",
  description:
    "Renders your content inside a canvas using the html-in-canvas API as a readable cloud of fine particles, and merges them into the crisp UI around the cursor with chromatic aberration and edge bending. No dependencies, works in any framework.",
  alternates: { canonical: "/docs/components/particle-reveal" },
};

const DESCRIPTION =
  "The page renders as fine grayscale dust. Bring the cursor close and the grains merge back into crisp, full-color UI.";

const API_REFERENCE: ApiProp[] = [
  {
    name: "radius",
    description: "Reveal radius around the cursor in CSS pixels.",
    type: "number",
    defaultValue: "500",
  },
  {
    name: "softness",
    description:
      "Feather of the reveal edge as a fraction of the radius (0 to 1).",
    type: "number",
    defaultValue: "0.75",
  },
  {
    name: "size",
    description: "Particle grain size in CSS pixels.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "scatter",
    description:
      "How far grains wander from their home pixel in CSS pixels. Bright content spawns the farthest specks.",
    type: "number",
    defaultValue: "25",
  },
  {
    name: "drift",
    description: "Speed of the idle grain shimmer (0 freezes the dust).",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "aberration",
    description:
      "Chromatic aberration strength at the reveal edge in CSS pixels.",
    type: "number",
    defaultValue: "40",
  },
  {
    name: "bend",
    description:
      "How strongly unrevealed content smears around the reveal edge in CSS pixels.",
    type: "number",
    defaultValue: "50",
  },
  {
    name: "fade",
    description:
      "How strongly dust specks stand out from the background (0 to 1).",
    type: "number",
    defaultValue: "0.85",
  },
  {
    name: "threshold",
    description:
      "Contrast against the background above which a pixel counts as UI and dissolves into dust. Pixels close to the background color are left untouched.",
    type: "number",
    defaultValue: "0.1",
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
    defaultValue: "0.25",
  },
  {
    name: "className",
    description: "Classes applied to the wrapper element.",
    type: "string",
  },
];

export default async function ParticleRevealPage() {
  const variants = await Promise.all(
    getComponentSources("particle-reveal").map(async (file) => ({
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
        title="Particle Reveal"
        description={DESCRIPTION}
        variants={[...variants]}
        installItem="particle-reveal"
        tags={["html-in-canvas"]}
        requiresHtmlInCanvas
        apiReference={API_REFERENCE}
        demoSection
        beforeInstall={
          <section className="mt-8" aria-label="Demo">
            <h2
              id="demo"
              className="scroll-mt-24 text-lg font-semibold tracking-[-0.01em]"
            >
              <HeadingAnchor id="demo">Demo</HeadingAnchor>
            </h2>
            <p className="mt-2 text-[13px] text-muted-foreground">
              Bring the cursor close to merge the dust back into crisp, full-color UI.
            </p>
            <div className="mt-3">
              <ParticleRevealDemo />
            </div>
          </section>
        }
      />
      <div className="mx-auto mt-24 w-full max-w-3xl">
        <Footer variant="docs" />
      </div>
    </div>
  );
}
