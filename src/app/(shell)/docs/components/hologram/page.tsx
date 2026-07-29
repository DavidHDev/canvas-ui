import type { Metadata } from "next";

import { ComponentDoc } from "@/components/docs/component-doc";
import { Footer } from "@/components/landing/footer";
import type { ApiProp } from "@/components/docs/api-reference";
import { getComponentSources } from "@/lib/registry";
import { highlight } from "@/components/docs/highlight";
import { HologramDemo } from "@/demos/hologram-demo";
import { DemoImageSection } from "@/demos/demo-image-cycler";

export const metadata: Metadata = {
  title: "Hologram",
  description:
    "Wraps your content in a canvas using the html-in-canvas API and overlays a sci-fi holographic effect with vertical scanlines, chromatic RGB fringing, phase shifting wave distortion, flicker, and a cyan/blue tint. No dependencies, works in any framework.",
  alternates: { canonical: "/docs/components/hologram" },
};

const DESCRIPTION =
  "A sci-fi holographic overlay that scans across this page with vertical scanlines, chromatic RGB fringing, and a subtle wave distortion. Tune the intensity, scanline density, color tint, and more. This page is the demo.";

const API_REFERENCE: ApiProp[] = [
  {
    name: "intensity",
    description: "Overall strength of the hologram effect (0 to 2).",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "speed",
    description: "Speed of the scrolling phase shift and wave animation.",
    type: "number",
    defaultValue: "0.5",
  },
  {
    name: "scanlines",
    description: "Density of vertical scanlines. Lower is chunkier.",
    type: "number",
    defaultValue: "12",
  },
  {
    name: "rgbShift",
    description: "Chromatic RGB fringing offset in CSS pixels.",
    type: "number",
    defaultValue: "2",
  },
  {
    name: "flicker",
    description: "Amount of random brightness flicker (0 to 1).",
    type: "number",
    defaultValue: "0.15",
  },
  {
    name: "tint",
    description: "Cyan/blue tint strength (0 to 1).",
    type: "number",
    defaultValue: "0.6",
  },
  {
    name: "opacity",
    description: "Overall opacity of the hologram overlay (0 to 1).",
    type: "number",
    defaultValue: "0.85",
  },
  {
    name: "wave",
    description: "Horizontal phase wave amplitude in CSS pixels.",
    type: "number",
    defaultValue: "3",
  },
  {
    name: "className",
    description: "Classes applied to the wrapper element.",
    type: "string",
  },
];

export default async function HologramPage() {
  const variants = await Promise.all(
    getComponentSources("hologram").map(async (file) => ({
      id: file.id,
      label: file.label,
      fileName: file.fileName,
      source: file.source,
      html: await highlight(file.source, file.lang),
    })),
  );

  return (
    <HologramDemo>
      <ComponentDoc
        title="Hologram"
        description={DESCRIPTION}
        variants={[...variants]}
        installItem="hologram"
        tags={["html-in-canvas"]}
        requiresHtmlInCanvas
        apiReference={API_REFERENCE}
        beforeInstall={
          <DemoImageSection
            hint="Photos make the scanlines, RGB fringing, and cyan/blue tint easy to see. Crank up intensity and wave for a more pronounced effect."
            alt="Demo photo for the Hologram effect"
          />
        }
      />
      <div className="mx-auto mt-24 w-full max-w-3xl">
        <Footer variant="docs" />
      </div>
    </HologramDemo>
  );
}
