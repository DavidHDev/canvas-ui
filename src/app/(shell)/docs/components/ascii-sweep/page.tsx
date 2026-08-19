import type { Metadata } from "next";

import { ComponentDoc } from "@/components/docs/component-doc";
import { Footer } from "@/components/landing/footer";
import type { ApiProp } from "@/components/docs/api-reference";
import { getComponentSources } from "@/lib/registry";
import { highlight } from "@/components/docs/highlight";
import { AsciiSweepDemo } from "@/demos/ascii-sweep-demo";

export const metadata: Metadata = {
  title: "ASCII Sweep",
  description:
    "Swaps two panels of live HTML with a band of glowing ascii characters that sweeps across the exact text lines, using HTML-in-Canvas where available and lightweight snapshots in browsers such as Firefox. Works in any framework.",
  alternates: { canonical: "/docs/components/ascii-sweep" },
};

const DESCRIPTION =
  "A band of glowing ascii characters sweeps across the panel and swaps one set of content for another, growing characters on the exact text lines it passes over. Switch the tabs to fire it.";

const API_REFERENCE: ApiProp[] = [
  {
    name: "children",
    description:
      "Panels to sweep between. Each child is one panel, and only the two panels involved in a sweep stay mounted.",
    type: "ReactNode",
  },
  {
    name: "index",
    description: "Index of the panel to show. Changing it sweeps to that panel.",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "directional",
    description:
      "Flip the sweep 180 degrees when moving to an earlier panel, so tabs sweep the way you travel.",
    type: "boolean",
    defaultValue: "true",
  },
  {
    name: "angle",
    description:
      "Sweep direction in degrees. 0 sweeps left to right, 90 sweeps bottom to top.",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "duration",
    description: "Seconds the sweep takes from one panel to the other.",
    type: "number",
    defaultValue: "2",
  },
  {
    name: "band",
    description: "Width of the ascii band as a fraction of the travel (0 to 1).",
    type: "number",
    defaultValue: "0.28",
  },
  {
    name: "softness",
    description: "Feather of the band edges as a fraction of the band (0 to 1).",
    type: "number",
    defaultValue: "0.45",
  },
  {
    name: "turbulence",
    description:
      "How ragged the sweep edge is. Higher tears the boundary apart row by row.",
    type: "number",
    defaultValue: "0.5",
  },
  {
    name: "trail",
    description:
      "Length of the glowing trail left behind the band, as a fraction of the band.",
    type: "number",
    defaultValue: "0.75",
  },
  {
    name: "progress",
    description:
      "Drives the sweep manually from 0 to 1. Set to -1 to let the component animate itself.",
    type: "number",
    defaultValue: "-1",
  },
  {
    name: "scale",
    description:
      "Size of one glyph pixel in CSS pixels. Characters are 5x5 glyph pixels.",
    type: "number",
    defaultValue: "2",
  },
  {
    name: "spacing",
    description: "Empty glyph pixels around each character (0 to 3).",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "charset",
    description:
      "Built-in character ramp: real ascii glyphs, shade blocks, or binary digits.",
    type: '"ascii" | "blocks" | "binary"',
    defaultValue: '"ascii"',
  },
  {
    name: "glyphs",
    description:
      "Custom ramp of packed 5x5 bitmaps (dark to bright), overrides charset.",
    type: "number[]",
    defaultValue: "[]",
  },
  {
    name: "color",
    description: "Color of the sweeping characters, as any CSS color.",
    type: "string",
    defaultValue: '"#4ade80"',
  },
  {
    name: "tint",
    description:
      "How strongly the ink color replaces the content color (0 to 1).",
    type: "number",
    defaultValue: "0.75",
  },
  {
    name: "glow",
    description: "Soft phosphor glow around the characters (0 to 1).",
    type: "number",
    defaultValue: "2",
  },
  {
    name: "aberration",
    description: "Chromatic aberration across the band, in CSS pixels.",
    type: "number",
    defaultValue: "5",
  },
  {
    name: "flicker",
    description:
      "How much characters flicker on and off as the band passes (0 to 1).",
    type: "number",
    defaultValue: "0.35",
  },
  {
    name: "density",
    description: "Share of cells inside the band that light up (0 to 1).",
    type: "number",
    defaultValue: "0.9",
  },
  {
    name: "displace",
    description:
      "Horizontal tearing of content rows inside the band, in CSS pixels.",
    type: "number",
    defaultValue: "14",
  },
  {
    name: "contrast",
    description: "Contrast applied to character density before picking a glyph.",
    type: "number",
    defaultValue: "1.2",
  },
  {
    name: "brightness",
    description: "Density offset applied before picking a glyph (-1 to 1).",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "invert",
    description: "Invert character density inside the band (0 to 1).",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "threshold",
    description:
      "Contrast against the background above which a pixel counts as content and grows characters.",
    type: "number",
    defaultValue: "0.1",
  },
  {
    name: "fade",
    description: "How far the content dims underneath the band (0 to 1).",
    type: "number",
    defaultValue: "0.75",
  },
  {
    name: "blend",
    description:
      'How characters composite over the content. "auto" adds on dark pages and paints over on light ones.',
    type: '"auto" | "add" | "over"',
    defaultValue: '"auto"',
  },
  {
    name: "background",
    description:
      'Color of the page behind the content, as any CSS color, or "auto" to read it from the DOM.',
    type: "string",
    defaultValue: '"auto"',
  },
  {
    name: "onSweepStart",
    description: "Called with the destination panel index when a sweep starts.",
    type: "(to: number) => void",
  },
  {
    name: "onSweepEnd",
    description:
      "Called with the destination panel index once the sweep has settled.",
    type: "(to: number) => void",
  },
];

export default async function AsciiSweepPage() {
  const files = getComponentSources("ascii-sweep");
  const variants = await Promise.all(
    files.map(async (file) => ({
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
        title="ASCII Sweep"
        description={DESCRIPTION}
        variants={[...variants]}
        installItem="ascii-sweep"
        tags={["html-in-canvas"]}
        requiresHtmlInCanvas
        apiReference={API_REFERENCE}
        beforeInstall={
          <section className="mt-8" aria-label="Demo">
            <h2 className="text-lg font-semibold tracking-[-0.01em]">Demo</h2>
            <p className="mt-2 text-[13px] text-muted-foreground">
              Switch tabs to fire the sweep. The tab you move toward sets the
              direction, and the characters grow on the text lines the band
              crosses.
            </p>
            <div className="mt-3">
              <AsciiSweepDemo />
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
