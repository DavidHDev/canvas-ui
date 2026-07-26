import type { Metadata } from "next";

import { ComponentDoc } from "@/components/docs/component-doc";
import { DemoImageSection } from "@/demos/demo-image-cycler";
import { Footer } from "@/components/landing/footer";
import type { ApiProp } from "@/components/docs/api-reference";
import { getComponentSources } from "@/lib/registry";
import { highlight } from "@/components/docs/highlight";
import { FrostDemo } from "@/demos/frost-demo";

export const metadata: Metadata = {
  title: "Frost",
  description:
    "Covers your live page in a frozen pane of ice that melts under the cursor and refreezes over time. Refraction, frost grain and melt trails, all in a single WebGL pass with no dependencies.",
  alternates: { canonical: "/docs/components/frost" },
};

const DESCRIPTION =
  "A pane of ice over your live page. Hover to melt a hole through the frost and watch it freeze back over.";

const API_REFERENCE: ApiProp[] = [
  {
    name: "frost",
    description: "Base frozen coverage added on top of the frost pattern.",
    type: "number",
    defaultValue: "0.05",
  },
  {
    name: "strength",
    description: "Multiplier on the frost noise pattern. Higher freezes more.",
    type: "number",
    defaultValue: "0.7",
  },
  {
    name: "contrast",
    description: "Contrast of the frost noise pattern.",
    type: "number",
    defaultValue: "3",
  },
  {
    name: "crispness",
    description: "Contrast of the final frost mask. Higher is crisper edges.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "highlight",
    description: "How much sparkling grain mixes into the frost.",
    type: "number",
    defaultValue: "0.3",
  },
  {
    name: "highlightStrength",
    description: "How strongly the sparkles tint toward white.",
    type: "number",
    defaultValue: "0.8",
  },
  {
    name: "haze",
    description: "Base blur haze over the content, even outside thick frost.",
    type: "number",
    defaultValue: "0.5",
  },
  {
    name: "tintThin",
    description: "Frost color where the layer is thin, as [r, g, b] in 0-1.",
    type: "[number, number, number]",
    defaultValue: "[0.82, 0.86, 1.05]",
  },
  {
    name: "tintThick",
    description: "Frost color where the layer is thick, as [r, g, b] in 0-1.",
    type: "[number, number, number]",
    defaultValue: "[0.92, 0.96, 1.1]",
  },
  {
    name: "tintStrength",
    description: "How much the frost tint colors the frozen areas.",
    type: "number",
    defaultValue: "0.3",
  },
  {
    name: "saturation",
    description: "Saturation multiplier applied to the frosted content.",
    type: "number",
    defaultValue: "1.2",
  },
  {
    name: "brightness",
    description: "Brightness multiplier applied to the frosted content.",
    type: "number",
    defaultValue: "0.85",
  },
  {
    name: "refraction",
    description: "How far the icy surface bends light. 0 disables it.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "ior",
    description: "Index of refraction of the ice. Water ice is about 1.31.",
    type: "number",
    defaultValue: "1.31",
  },
  {
    name: "detail",
    description: "Strength of the fine surface detail in the refraction.",
    type: "number",
    defaultValue: "2",
  },
  {
    name: "textureScale",
    description: "Scale of the icy relief pattern. Higher is larger features.",
    type: "number",
    defaultValue: "2",
  },
  {
    name: "fresnel",
    description: "Fresnel boost of the refraction at grazing angles.",
    type: "number",
    defaultValue: "0.8",
  },
  {
    name: "meltRadius",
    description: "Radius of the melt spot under the cursor.",
    type: "number",
    defaultValue: "0.25",
  },
  {
    name: "meltNoise",
    description: "Irregularity of the melt edge. 0 is a clean circle.",
    type: "number",
    defaultValue: "0.25",
  },
  {
    name: "meltStrength",
    description: "How quickly hovering melts the frost.",
    type: "number",
    defaultValue: "0.75",
  },
  {
    name: "refreeze",
    description: "How fast melted areas freeze back over. 0 never refreezes.",
    type: "number",
    defaultValue: "2",
  },
  {
    name: "edgeFade",
    description: "Keeps the edges of the pane frozen. 0 lets everything melt.",
    type: "number",
    defaultValue: "0.1",
  },
  {
    name: "meltEdges",
    description: "Lets the frozen borders of the pane melt too.",
    type: "boolean",
    defaultValue: "true",
  },
  {
    name: "introDuration",
    description:
      "Seconds for the frost to grow in from the edges on load. 0 disables.",
    type: "number",
    defaultValue: "2.5",
  },
  {
    name: "opacity",
    description:
      "Overall opacity of the frost layer. Lower shows more content.",
    type: "number",
    defaultValue: "0.6",
  },
  {
    name: "shimmer",
    description: "Animated twinkle of the highlight grain. 0 is static.",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "quality",
    description: "Resolution multiplier for the blur passes (0.25-1).",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "className",
    description: "Classes applied to the wrapper element.",
    type: "string",
  },
];

export default async function FrostPage() {
  const variants = await Promise.all(
    getComponentSources("frost").map(async (file) => ({
      id: file.id,
      label: file.label,
      fileName: file.fileName,
      source: file.source,
      html: await highlight(file.source, file.lang),
    })),
  );

  return (
    <FrostDemo>
      <ComponentDoc
        title="Frost"
        description={DESCRIPTION}
        variants={[...variants]}
        installItem="frost"
        tags={["html-in-canvas"]}
        apiReference={API_REFERENCE}
        demoSection
        beforeInstall={
          <DemoImageSection
            hint="Hover across the photo to melt a hole through the ice."
            alt="Demo photo for the Frost effect"
          />
        }
      />
      <p className="mx-auto mt-16 w-full max-w-3xl text-xs text-muted-foreground">
        The frost effect is adapted from{" "}
        <a
          href="https://github.com/takuma-hmng8/frozen"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 hover:text-foreground"
        >
          frozen by takuma-hmng8
        </a>
        .
      </p>
      <div className="mx-auto mt-24 w-full max-w-3xl">
        <Footer variant="docs" />
      </div>
    </FrostDemo>
  );
}
