import type { Metadata } from "next";

import { ComponentDoc } from "@/components/docs/component-doc";
import { Footer } from "@/components/landing/footer";
import type { ApiProp } from "@/components/docs/api-reference";
import { getComponentSources } from "@/lib/registry";
import { highlight } from "@/components/docs/highlight";
import { RippleDemo } from "@/demos/ripple-demo";
import { DemoImageSection } from "@/demos/demo-image-cycler";

export const metadata: Metadata = {
  title: "Ripple",
  description:
    "Wraps your content in a canvas using the html-in-canvas API and spreads water ripples from every click that refract the live page like a pond surface. No dependencies, works in any framework.",
  alternates: { canonical: "/docs/components/ripple" },
};

const DESCRIPTION =
  "Click anywhere and water ripples spread across the page, bending the content like a pond surface. This page is the demo.";

const API_REFERENCE: ApiProp[] = [
  {
    name: "amplitude",
    description: "Height of the waves (0 to 3).",
    type: "number",
    defaultValue: "0.5",
  },
  {
    name: "speed",
    description: "How fast the rings travel outward. 1 is normal speed.",
    type: "number",
    defaultValue: "0.65",
  },
  {
    name: "wavelength",
    description: "Distance between wave crests in CSS pixels.",
    type: "number",
    defaultValue: "80",
  },
  {
    name: "rings",
    description: "Number of crests in each wave train (1 to 8).",
    type: "number",
    defaultValue: "2",
  },
  {
    name: "decay",
    description: "How quickly the waves lose energy (higher dies faster).",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "refraction",
    description:
      "How strongly the waves bend the page content, in CSS pixels.",
    type: "number",
    defaultValue: "100",
  },
  {
    name: "dispersion",
    description:
      "Chromatic dispersion splitting colors along the wave slopes (0 to 1).",
    type: "number",
    defaultValue: "0.5",
  },
  {
    name: "shine",
    description: "Intensity of the light glints on the wave crests (0 to 2).",
    type: "number",
    defaultValue: "0.5",
  },
  {
    name: "trigger",
    description:
      'What spawns ripples. "click" on press, "hover" also leaves a wake while moving, "none" only ambient.',
    type: '"click" | "hover" | "none"',
    defaultValue: '"click"',
  },
  {
    name: "interval",
    description:
      "Seconds between ambient ripples at random positions. 0 disables them.",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "className",
    description: "Classes applied to the wrapper element.",
    type: "string",
  },
];

export default async function RipplePage() {
  const variants = await Promise.all(
    getComponentSources("ripple").map(async (file) => ({
      id: file.id,
      label: file.label,
      fileName: file.fileName,
      source: file.source,
      html: await highlight(file.source, file.lang),
    })),
  );

  return (
    <RippleDemo>
      <ComponentDoc
        title="Ripple"
        description={DESCRIPTION}
        variants={[...variants]}
        installItem="ripple"
        tags={["html-in-canvas"]}
        apiReference={API_REFERENCE}
        demoSection
        beforeInstall={
          <DemoImageSection
            hint="Click the photos. Refraction and dispersion show best over imagery."
            alt="Demo photo for the Ripple effect"
          />
        }
      />
      <div className="mx-auto mt-24 w-full max-w-3xl">
        <Footer variant="docs" />
      </div>
    </RippleDemo>
  );
}
