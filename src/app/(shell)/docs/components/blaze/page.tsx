import type { Metadata } from "next";

import { ComponentDoc } from "@/components/docs/component-doc";
import { DemoImageSection } from "@/demos/demo-image-cycler";
import { Footer } from "@/components/landing/footer";
import type { ApiProp } from "@/components/docs/api-reference";
import { getComponentSources } from "@/lib/registry";
import { highlight } from "@/components/docs/highlight";
import { BlazeDemo } from "@/demos/blaze-demo";

export const metadata: Metadata = {
  title: "Blaze",
  description:
    "Wraps your content in a canvas using the html-in-canvas API and renders fire sparks, smoke, and heat distortion rising from the bottom of the screen. No dependencies, works in any framework.",
  alternates: { canonical: "/docs/components/blaze" },
};

const DESCRIPTION =
  "Fire at the bottom of the page. Sparks, smoke, and heat distortion rise into your content. Look down, it is already burning.";

const API_REFERENCE: ApiProp[] = [
  {
    name: "height",
    description:
      "Height of the blaze zone as a fraction of the screen (0 to 1).",
    type: "number",
    defaultValue: "0.97",
  },
  {
    name: "distortion",
    description: "Strength of the heat distortion bending the content.",
    type: "number",
    defaultValue: "0.6",
  },
  {
    name: "distortionScale",
    description:
      "Scale of the heat distortion noise. Higher means finer ripples.",
    type: "number",
    defaultValue: "0.5",
  },
  {
    name: "speed",
    description: "Animation speed multiplier for the whole effect.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "sparks",
    description: "Brightness of the rising sparks. 0 disables them.",
    type: "number",
    defaultValue: "0.5",
  },
  {
    name: "sparkDensity",
    description:
      "How tightly packed the sparks are. Higher also makes them smaller.",
    type: "number",
    defaultValue: "1.5",
  },
  {
    name: "sparkSize",
    description: "Size of the individual sparks.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "layers",
    description: "Number of spark layers stacked for depth (1 to 10).",
    type: "number",
    defaultValue: "4",
  },
  {
    name: "smoke",
    description: "Intensity of the smoke. 0 disables it.",
    type: "number",
    defaultValue: "0.5",
  },
  {
    name: "glow",
    description: "Warm ambient glow near the bottom edge.",
    type: "number",
    defaultValue: "1.5",
  },
  {
    name: "sparkColor",
    description: "Spark color as [r, g, b] in 0-1 range.",
    type: "[number, number, number]",
    defaultValue: "[1, 0.4, 0.05]",
  },
  {
    name: "smokeColor",
    description: "Smoke and glow color as [r, g, b] in 0-1 range.",
    type: "[number, number, number]",
    defaultValue: "[1, 0.43, 0.1]",
  },
  {
    name: "className",
    description: "Classes applied to the wrapper element.",
    type: "string",
  },
];

export default async function BlazePage() {
  const variants = await Promise.all(
    getComponentSources("blaze").map(async (file) => ({
      id: file.id,
      label: file.label,
      fileName: file.fileName,
      source: file.source,
      html: await highlight(file.source, file.lang),
    })),
  );

  return (
    <BlazeDemo>
      <ComponentDoc
        title="Blaze"
        description={DESCRIPTION}
        variants={[...variants]}
        installItem="blaze"
        tags={["html-in-canvas"]}
        apiReference={API_REFERENCE}
        demoSection
        beforeInstall={
          <DemoImageSection
            hint="Sweep your cursor across the photo to set it alight."
            alt="Demo photo for the Blaze effect"
          />
        }
      />
      <div className="mx-auto mt-24 w-full max-w-3xl">
        <Footer variant="docs" />
      </div>
    </BlazeDemo>
  );
}
