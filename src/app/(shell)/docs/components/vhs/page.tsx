import type { Metadata } from "next";

import { ComponentDoc } from "@/components/docs/component-doc";
import { Footer } from "@/components/landing/footer";
import type { ApiProp } from "@/components/docs/api-reference";
import { getComponentSources } from "@/lib/registry";
import { highlight } from "@/components/docs/highlight";
import { VHSDemo } from "@/demos/vhs-demo";
import { DemoImageSection } from "@/demos/demo-image-cycler";

export const metadata: Metadata = {
  title: "VHS",
  description:
    "Wraps your content in a canvas using the html-in-canvas API and plays it back like a worn VHS tape, with tape wave, head-switching noise, chroma bleed, and grain. No dependencies, works in any framework.",
  alternates: { canonical: "/docs/components/vhs" },
};

const DESCRIPTION =
  "Your page plays back like a worn VHS tape. Tape wave, head-switch noise, chroma bleed, grain, and scanlines. This page is the demo.";

const API_REFERENCE: ApiProp[] = [
  {
    name: "speed",
    description: "Playback speed of the tape artifacts. 1 is normal speed.",
    type: "number",
    defaultValue: "0.5",
  },
  {
    name: "wave",
    description: "Strength of the slow horizontal tape wave (0 to 3).",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "jitter",
    description: "Strength of the fine per-line horizontal jitter (0 to 3).",
    type: "number",
    defaultValue: "0.25",
  },
  {
    name: "crease",
    description: "Strength of the travelling tape crease band (0 to 3).",
    type: "number",
    defaultValue: "0.1",
  },
  {
    name: "switching",
    description: "Strength of the head-switching noise at the bottom (0 to 3).",
    type: "number",
    defaultValue: "0.05",
  },
  {
    name: "switchingHeight",
    description:
      "Height of the head-switching band as a fraction of the screen.",
    type: "number",
    defaultValue: "0.02",
  },
  {
    name: "bloom",
    description: "Strength of the horizontal glow bleed (0 to 1).",
    type: "number",
    defaultValue: "0.4",
  },
  {
    name: "aberration",
    description: "RGB channel misalignment in CSS pixels.",
    type: "number",
    defaultValue: "2",
  },
  {
    name: "acBeat",
    description:
      "Strength of the slow brightness beat rolling down the frame (0 to 1).",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "grain",
    description: "Amount of animated static grain (0 to 1).",
    type: "number",
    defaultValue: "0.1",
  },
  {
    name: "scanlines",
    description: "Intensity of the CRT scanline overlay (0 to 1).",
    type: "number",
    defaultValue: "0.1",
  },
  {
    name: "vignette",
    description: "Darkening toward the frame corners (0 to 1).",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "barrel",
    description:
      "CRT tube curvature bending the content inward like a tube TV (0 to 1). The page around the curved glass stays untouched. 0 disables.",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "saturation",
    description:
      "Color saturation. 1 keeps the content's colors, 0 is grayscale.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "exposure",
    description: "Extra brightness multiplier applied at the end.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "className",
    description: "Classes applied to the wrapper element.",
    type: "string",
  },
];

export default async function VHSPage() {
  const variants = await Promise.all(
    getComponentSources("vhs").map(async (file) => ({
      id: file.id,
      label: file.label,
      fileName: file.fileName,
      source: file.source,
      html: await highlight(file.source, file.lang),
    })),
  );

  return (
    <VHSDemo>
      <ComponentDoc
        title="VHS"
        description={DESCRIPTION}
        variants={[...variants]}
        installItem="vhs"
        tags={["html-in-canvas"]}
        requiresHtmlInCanvas
        apiReference={API_REFERENCE}
        demoSection
        beforeInstall={
          <DemoImageSection
            hint="Photos show the tape playback treatment best, wave, chroma bleed, and grain included."
            alt="Demo photo for the VHS effect"
          />
        }
      />
      <div className="mx-auto mt-24 w-full max-w-3xl">
        <Footer variant="docs" />
      </div>
    </VHSDemo>
  );
}
