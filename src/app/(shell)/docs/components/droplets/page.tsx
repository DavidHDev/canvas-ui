import type { Metadata } from "next";

import { ComponentDoc } from "@/components/docs/component-doc";
import { DemoImageSection } from "@/demos/demo-image-cycler";
import { Footer } from "@/components/landing/footer";
import type { ApiProp } from "@/components/docs/api-reference";
import { getComponentSources } from "@/lib/registry";
import { highlight } from "@/components/docs/highlight";
import { DropletsDemo } from "@/demos/droplets-demo";

export const metadata: Metadata = {
  title: "Droplets",
  description:
    "Wraps your content in a canvas using the html-in-canvas API and renders rain droplets running down it, refracting the content behind them. No dependencies, works in any framework.",
  alternates: { canonical: "/docs/components/droplets" },
};

const DESCRIPTION =
  "Rain runs down the screen and refracts the page behind it. It is raining on this page right now.";

const API_REFERENCE: ApiProp[] = [
  {
    name: "intensity",
    description:
      "How much rain falls, from a light drizzle to a downpour (0 to 1.25).",
    type: "number",
    defaultValue: "0.5",
  },
  {
    name: "speed",
    description: "Animation speed multiplier.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "scale",
    description: "Size of the droplet pattern. Higher means smaller drops.",
    type: "number",
    defaultValue: "0.4",
  },
  {
    name: "dropWidth",
    description: "Width of the droplets and their trails.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "dropLength",
    description: "How elongated the falling droplets are.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "refraction",
    description: "How strongly droplets refract the content behind them.",
    type: "number",
    defaultValue: "0.2",
  },
  {
    name: "blur",
    description:
      "Background blur outside the droplets, like a fogged up window.",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "vignette",
    description: "Darkens the edges of the canvas (0 to 1).",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "fallSpeed",
    description: "How fast the running drops slide down.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "wiggle",
    description: "Horizontal wiggle of the running drops.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "staticDrops",
    description: "Multiplier for the small static droplets.",
    type: "number",
    defaultValue: "0.2",
  },
  {
    name: "interactive",
    description: "Wipe drops off the glass with the pointer.",
    type: "boolean",
    defaultValue: "true",
  },
  {
    name: "interactionRadius",
    description: "Radius of the cursor wipe, relative to the screen height.",
    type: "number",
    defaultValue: "0.3",
  },
  {
    name: "interactionStrength",
    description: "How strongly the cursor wipes drops off the glass (0 to 1).",
    type: "number",
    defaultValue: "0.6",
  },
  {
    name: "interactionDistortion",
    description: "How much the wipe distorts the content behind it.",
    type: "number",
    defaultValue: "3",
  },
  {
    name: "tint",
    description:
      "Tint color layered over the content as [r, g, b] in 0-1 range.",
    type: "[number, number, number]",
    defaultValue: "[1, 1, 1]",
  },
  {
    name: "tintStrength",
    description: "Strength of the tint (0 to 1).",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "className",
    description: "Classes applied to the wrapper element.",
    type: "string",
  },
];

export default async function DropletsPage() {
  const variants = await Promise.all(
    getComponentSources("droplets").map(async (file) => ({
      id: file.id,
      label: file.label,
      fileName: file.fileName,
      source: file.source,
      html: await highlight(file.source, file.lang),
    })),
  );

  return (
    <DropletsDemo>
      <ComponentDoc
        title="Droplets"
        description={DESCRIPTION}
        variants={[...variants]}
        installItem="droplets"
        tags={["html-in-canvas"]}
        apiReference={API_REFERENCE}
        demoSection
        beforeInstall={
          <DemoImageSection
            hint="Raindrops refract the photo beneath them as they slide down the page."
            alt="Demo photo for the Droplets effect"
          />
        }
      />
      <div className="mx-auto mt-24 w-full max-w-3xl">
        <Footer variant="docs" />
      </div>
    </DropletsDemo>
  );
}
