import type { Metadata } from "next";

import { ComponentDoc } from "@/components/docs/component-doc";
import { Footer } from "@/components/landing/footer";
import type { ApiProp } from "@/components/docs/api-reference";
import { getComponentSources } from "@/lib/registry";
import { highlight } from "@/components/docs/highlight";
import { HeadingAnchor } from "@/components/docs/heading-anchor";
import { LaserDemo } from "@/demos/laser-demo";

export const metadata: Metadata = {
  title: "Laser",
  description:
    "Wraps your content in a canvas using the html-in-canvas API and hides everything below a glowing laser beam near the bottom of the viewport. Scrolling reveals new content from behind the beam, hot and shimmering. No dependencies, works in any framework.",
  alternates: { canonical: "/docs/components/laser" },
};

const DESCRIPTION =
  "A laser beam sits near the bottom of the viewport. Scroll and new content prints in from behind it, hot and shimmering.";

const API_REFERENCE: ApiProp[] = [
  {
    name: "speed",
    description:
      "Animation speed of the beam wave, flicker, and sparkle. 1 is normal.",
    type: "number",
    defaultValue: "0.3",
  },
  {
    name: "offset",
    description: "Distance of the beam from the bottom edge in CSS pixels.",
    type: "number",
    defaultValue: "140",
  },
  {
    name: "color",
    description: "Laser glow color as RGB in the 0 to 1 range.",
    type: "[number, number, number]",
    defaultValue: "[0.05, 0.35, 1]",
  },
  {
    name: "thickness",
    description: "Thickness of the white-hot beam core in CSS pixels.",
    type: "number",
    defaultValue: "6",
  },
  {
    name: "core",
    description: "Intensity of the white beam core (0 to 2). 0 removes it.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "radius",
    description: "Reach of the colored glow around the beam in CSS pixels.",
    type: "number",
    defaultValue: "20",
  },
  {
    name: "glow",
    description: "Brightness of the colored glow (0 to 3). 0 removes it.",
    type: "number",
    defaultValue: "2",
  },
  {
    name: "wave",
    description: "Amplitude of the slow beam waviness in CSS pixels.",
    type: "number",
    defaultValue: "10",
  },
  {
    name: "width",
    description:
      "Beam length as a fraction of the content width (0 to 1). The beam centers on the visible content column and tapers into a fine point at both ends.",
    type: "number",
    defaultValue: "0.55",
  },
  {
    name: "flicker",
    description: "Random intensity flicker of the beam (0 to 1).",
    type: "number",
    defaultValue: "0.2",
  },
  {
    name: "reveal",
    description: "Height of the hot reveal band above the beam in CSS pixels.",
    type: "number",
    defaultValue: "400",
  },
  {
    name: "heat",
    description: "How strongly freshly revealed content glows (0 to 1.5).",
    type: "number",
    defaultValue: "1.5",
  },
  {
    name: "shimmer",
    description:
      "Heat shimmer displacement of freshly revealed content in CSS pixels.",
    type: "number",
    defaultValue: "12",
  },
  {
    name: "sparkle",
    description: "Animated sparkle texture inside the reveal band (0 to 2).",
    type: "number",
    defaultValue: "0.25",
  },
  {
    name: "reactivity",
    description:
      "How much scrolling boosts the beam and the reveal glow (0 to 3).",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "className",
    description: "Classes applied to the wrapper element.",
    type: "string",
  },
];

export default async function LaserPage() {
  const variants = await Promise.all(
    getComponentSources("laser").map(async (file) => ({
      id: file.id,
      label: file.label,
      fileName: file.fileName,
      source: file.source,
      html: await highlight(file.source, file.lang),
    })),
  );

  return (
    <LaserDemo>
      <ComponentDoc
        title="Laser"
        description={DESCRIPTION}
        variants={[...variants]}
        installItem="laser"
        tags={["html-in-canvas"]}
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
              Scroll to see new content print in from behind the laser beam, hot and shimmering.
            </p>
          </section>
        }
      />
      <div className="mx-auto mt-24 w-full max-w-3xl">
        <Footer variant="docs" />
      </div>
    </LaserDemo>
  );
}
