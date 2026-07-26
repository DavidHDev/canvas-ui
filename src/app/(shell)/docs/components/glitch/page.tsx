import type { Metadata } from "next";

import { ComponentDoc } from "@/components/docs/component-doc";
import { Footer } from "@/components/landing/footer";
import type { ApiProp } from "@/components/docs/api-reference";
import { getComponentSources } from "@/lib/registry";
import { highlight } from "@/components/docs/highlight";
import { GlitchDemo } from "@/demos/glitch-demo";
import { DemoImageSection } from "@/demos/demo-image-cycler";

export const metadata: Metadata = {
  title: "Glitch",
  description:
    "Wraps your content in a canvas using the html-in-canvas API and hits it with broadcast glitch bursts: torn slices, RGB splits, corrupted blocks, and analog noise. No dependencies, works in any framework.",
  alternates: { canonical: "/docs/components/glitch" },
};

const DESCRIPTION =
  "Broadcast glitch bursts tear this page into shifted slices with RGB splits and corrupted blocks, then let it settle back to a clean read. Tune the timing, tear strength, and noise. This page is the demo.";

const API_REFERENCE: ApiProp[] = [
  {
    name: "intensity",
    description: "Overall strength of the glitch (0 to 2).",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "interval",
    description:
      "Seconds between glitch bursts. 0 keeps the glitch running constantly.",
    type: "number",
    defaultValue: "3",
  },
  {
    name: "duration",
    description: "How long each burst lasts in seconds.",
    type: "number",
    defaultValue: "0.4",
  },
  {
    name: "slices",
    description: "Number of horizontal slices the tear snaps to. Lower is chunkier.",
    type: "number",
    defaultValue: "24",
  },
  {
    name: "shift",
    description: "How far the torn slices shift sideways, in CSS pixels.",
    type: "number",
    defaultValue: "30",
  },
  {
    name: "rgbShift",
    description: "Chromatic RGB split during bursts, in CSS pixels.",
    type: "number",
    defaultValue: "4",
  },
  {
    name: "blocks",
    description: "Amount of corrupted block artifacts during bursts (0 to 1).",
    type: "number",
    defaultValue: "0.5",
  },
  {
    name: "noise",
    description: "Analog noise and scanline flicker during bursts (0 to 1).",
    type: "number",
    defaultValue: "0.35",
  },
  {
    name: "className",
    description: "Classes applied to the wrapper element.",
    type: "string",
  },
];

export default async function GlitchPage() {
  const variants = await Promise.all(
    getComponentSources("glitch").map(async (file) => ({
      id: file.id,
      label: file.label,
      fileName: file.fileName,
      source: file.source,
      html: await highlight(file.source, file.lang),
    })),
  );

  return (
    <GlitchDemo>
      <ComponentDoc
        title="Glitch"
        description={DESCRIPTION}
        variants={[...variants]}
        installItem="glitch"
        tags={["html-in-canvas"]}
        requiresHtmlInCanvas
        apiReference={API_REFERENCE}
        demoSection
        beforeInstall={
          <DemoImageSection
            hint="Photos make the tears and RGB splits easy to see. Drop the interval to 0 for a constant broadcast failure."
            alt="Demo photo for the Glitch effect"
          />
        }
      />
      <div className="mx-auto mt-24 w-full max-w-3xl">
        <Footer variant="docs" />
      </div>
    </GlitchDemo>
  );
}
