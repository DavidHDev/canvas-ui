import type { Metadata } from "next";

import { ComponentDoc } from "@/components/docs/component-doc";
import { DemoImageSection } from "@/demos/demo-image-cycler";
import { Footer } from "@/components/landing/footer";
import type { ApiProp } from "@/components/docs/api-reference";
import { getComponentSources } from "@/lib/registry";
import { highlight } from "@/components/docs/highlight";
import { MagnifyDemo } from "@/demos/magnify-demo";

export const metadata: Metadata = {
  title: "Magnify",
  description:
    "Wraps your content in a canvas using the html-in-canvas API and attaches a sci-fi scanner lens to the cursor: magnified live page content inside a configurable HUD reticle, with chromatic aberration haze, a data readout, and click ripples that bend the page. No dependencies, works in any framework.",
  alternates: { canonical: "/docs/components/magnify" },
};

const DESCRIPTION =
  "A scanner lens rides your cursor and magnifies the live page inside a sci-fi HUD reticle. Click to send a ripple bending across the page.";

const API_REFERENCE: ApiProp[] = [
  {
    name: "size",
    description: "Lens radius in CSS pixels.",
    type: "number",
    defaultValue: "140",
  },
  {
    name: "zoom",
    description: "Magnification inside the lens (1 to 4).",
    type: "number",
    defaultValue: "1.5",
  },
  {
    name: "scrollZoom",
    description:
      "Let the wheel or trackpad adjust the magnification while zoomModifier is held.",
    type: "boolean",
    defaultValue: "false",
  },
  {
    name: "zoomModifier",
    description:
      'Key held to zoom instead of scroll. "none" captures every wheel event over the content.',
    type: '"shift" | "alt" | "ctrl" | "meta" | "none"',
    defaultValue: '"shift"',
  },
  {
    name: "color",
    description:
      "HUD accent color as RGB in the 0 to 1 range. Tints the reticle, readout, and ripple outline.",
    type: "[number, number, number]",
    defaultValue: "[0.8, 0.8, 0.8]",
  },
  {
    name: "follow",
    description:
      "How quickly the lens follows the cursor (0 to 1). 1 snaps to it.",
    type: "number",
    defaultValue: "0.25",
  },
  {
    name: "hud",
    description:
      "Overall HUD intensity (0 to 1). 0 hides every reticle element.",
    type: "number",
    defaultValue: "0.8",
  },
  {
    name: "ring",
    description: "Show the outer ring.",
    type: "boolean",
    defaultValue: "true",
  },
  {
    name: "crosshair",
    description: "Show the crosshair lines through the center.",
    type: "boolean",
    defaultValue: "true",
  },
  {
    name: "ticks",
    description: "Show the tick marks around the ring.",
    type: "boolean",
    defaultValue: "true",
  },
  {
    name: "brackets",
    description: "Show the corner brackets inside the lens.",
    type: "boolean",
    defaultValue: "true",
  },
  {
    name: "dot",
    description: "Show the center dot.",
    type: "boolean",
    defaultValue: "true",
  },
  {
    name: "grid",
    description: "Show a faint measurement grid inside the lens.",
    type: "boolean",
    defaultValue: "false",
  },
  {
    name: "readout",
    description: "Show the data readout beside the lens.",
    type: "boolean",
    defaultValue: "true",
  },
  {
    name: "aberration",
    description:
      "Chromatic aberration split inside the lens (0 to 3). 0 disables it.",
    type: "number",
    defaultValue: "0.8",
  },
  {
    name: "haze",
    description:
      "Dreamy insight haze inside the lens (0 to 1). Softens and lifts the magnified content.",
    type: "number",
    defaultValue: "0.2",
  },
  {
    name: "ripples",
    description: "Emit a ripple across the page on click.",
    type: "boolean",
    defaultValue: "true",
  },
  {
    name: "rippleSpeed",
    description:
      "How fast the ripple wavefront travels, in CSS pixels per second.",
    type: "number",
    defaultValue: "900",
  },
  {
    name: "rippleWidth",
    description: "Thickness of the colored ripple outline in CSS pixels.",
    type: "number",
    defaultValue: "2",
  },
  {
    name: "rippleBendWidth",
    description: "Width of the band the ripple bends, in CSS pixels.",
    type: "number",
    defaultValue: "100",
  },
  {
    name: "rippleBend",
    description: "How many CSS pixels the ripple bends the page.",
    type: "number",
    defaultValue: "20",
  },
  {
    name: "rippleGlow",
    description: "Strength of the colored ripple outline (0 to 2). 0 hides it.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "rippleLife",
    description: "Seconds a ripple lives before it fades out.",
    type: "number",
    defaultValue: "1.4",
  },
  {
    name: "className",
    description: "Classes applied to the wrapper element.",
    type: "string",
  },
];

export default async function MagnifyPage() {
  const variants = await Promise.all(
    getComponentSources("magnify").map(async (file) => ({
      id: file.id,
      label: file.label,
      fileName: file.fileName,
      source: file.source,
      html: await highlight(file.source, file.lang),
    })),
  );

  return (
    <MagnifyDemo>
      <ComponentDoc
        title="Magnify"
        description={DESCRIPTION}
        variants={[...variants]}
        installItem="magnify"
        tags={["html-in-canvas"]}
        apiReference={API_REFERENCE}
        demoSection
        beforeInstall={
          <DemoImageSection
            hint="Scan the photo with the lens, then click to send a ripple through it."
            alt="Demo photo for the Magnify effect"
          />
        }
      />
      <div className="mx-auto mt-24 w-full max-w-3xl">
        <Footer variant="docs" />
      </div>
    </MagnifyDemo>
  );
}
