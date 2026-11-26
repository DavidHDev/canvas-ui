import type { Metadata } from "next";

import { ComponentDoc } from "@/components/docs/component-doc";
import { Footer } from "@/components/landing/footer";
import type { ApiProp } from "@/components/docs/api-reference";
import { getComponentSources } from "@/lib/registry";
import { CodeBlock } from "@/components/docs/code-block";
import { highlight } from "@/components/docs/highlight";
import { BlazeDemo } from "@/demos/blaze-demo";
import { PageDemoPhoto } from "@/demos/scenes";

export const metadata: Metadata = {
  title: "Blaze",
  description:
    "Warm firelight, lit smoke and drifting embers rising from the bottom of any page. With html-in-canvas the heat haze bends your live HTML; in every other browser it sits behind or over your content. Works in any framework.",
  alternates: { canonical: "/docs/components/blaze" },
};

const DESCRIPTION =
  "Firelight, smoke and drifting embers rising from below the page. Over live HTML the heat haze bends your content; anywhere else it sits behind or over it.";

const USAGE = [
  {
    title: "Heat haze over a hero",
    body: "Wrap a section and the heat bends it as the embers drift up. It needs html-in-canvas (Chrome 157 and later) and falls back to the embers and glow over your content elsewhere.",
    fileName: "hero.tsx",
    source: `<Blaze className="h-svh">
  <Hero />
</Blaze>`,
  },
  {
    title: "Behind a footer",
    body: "With layer=\"background\" the fire sits behind the content in every browser. Give the content a transparent background so the light shows through.",
    fileName: "footer.tsx",
    source: `<Blaze layer="background" height={0.7} smoke={0.3}>
  <Footer />
</Blaze>`,
  },
  {
    title: "Over a whole site",
    body: "Leave out children and pass fixed with layer=\"foreground\" for a low glow and a few embers over every page. It never blocks clicks.",
    fileName: "layout.tsx",
    source: `<body>
  {children}
  <Blaze fixed layer="foreground" height={0.45} glow={0.4} smoke={0.2} sparks={0.4} />
</body>`,
  },
  {
    title: "Your own colors",
    body: "Pass colors from cool to hot. The glow uses the cooler end and the embers the hotter end.",
    fileName: "cta.tsx",
    source: `<Blaze colors={["#020617", "#0b2a6f", "#2563eb", "#60a5fa", "#e0f2fe"]}>
  <CallToAction />
</Blaze>`,
  },
];

const USAGE_MARKDOWN = [
  "## Usage",
  "",
  ...USAGE.flatMap((entry) => [
    `### ${entry.title}`,
    "",
    entry.body,
    "",
    "```tsx",
    entry.source,
    "```",
    "",
  ]),
].join("\n");

const API_REFERENCE: ApiProp[] = [
  {
    name: "layer",
    description:
      "\"page\" draws your content into the effect so the heat haze can bend it (html-in-canvas; falls back to \"foreground\"). \"background\" sits behind the content, \"foreground\" over it.",
    type: '"page" | "background" | "foreground"',
    defaultValue: '"page"',
  },
  {
    name: "fixed",
    description:
      "Pin the effect to the viewport. Without children it never blocks clicks.",
    type: "boolean",
    defaultValue: "false",
  },
  {
    name: "height",
    description: "How far up the heat reaches, as a fraction of the element (0 to 1).",
    type: "number",
    defaultValue: "0.8",
  },
  {
    name: "intensity",
    description: "Overall brightness (0 to 1).",
    type: "number",
    defaultValue: "0.8",
  },
  {
    name: "colors",
    description:
      "Colors from cool to hot, as CSS colors. Leave empty for natural fire.",
    type: "string[]",
    defaultValue: "[]",
  },
  {
    name: "glow",
    description: "Warm light rising from a fire just below the frame (0 to 1).",
    type: "number",
    defaultValue: "0.6",
  },
  {
    name: "smoke",
    description: "Smoke lit from below, billowing up through the glow (0 to 1).",
    type: "number",
    defaultValue: "0.5",
  },
  {
    name: "haze",
    description: "Heat haze bending the page, with layer \"page\" (0 to 1).",
    type: "number",
    defaultValue: "0.5",
  },
  {
    name: "sparks",
    description: "How many embers drift up (0 to 1).",
    type: "number",
    defaultValue: "0.6",
  },
  {
    name: "sparkSize",
    description: "Size of the embers.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "depth",
    description:
      "Out-of-focus embers drifting near and far from the camera (0 to 1).",
    type: "number",
    defaultValue: "0.5",
  },
  {
    name: "stir",
    description:
      "Moving the cursor through the heat swirls the smoke and embers like liquid and kicks up new embers (0 to 1).",
    type: "number",
    defaultValue: "0.5",
  },
  {
    name: "turbulence",
    description: "How much the hot air swirls (0 to 1).",
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
    description: "Size of the smoke billows and haze ripples.",
    type: "number",
    defaultValue: "1",
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
  const usage = await Promise.all(
    USAGE.map(async (entry) => ({
      ...entry,
      html: await highlight(entry.source, "tsx"),
    })),
  );

  return (
    <BlazeDemo>
      <ComponentDoc
        title="Blaze"
        description={DESCRIPTION}
        variants={[...variants]}
        installItem="blaze"
        apiReference={API_REFERENCE}
        usageMarkdown={USAGE_MARKDOWN}
        beforeInstall={
          <>
            <PageDemoPhoto photo={0} />
            <section className="mt-12" aria-label="Usage">
              <h2
                id="usage"
                className="scroll-mt-24 text-xl font-medium tracking-tight"
              >
                Usage
              </h2>
              <div className="mt-3 flex flex-col gap-6">
                {usage.map((entry) => (
                  <div key={entry.title}>
                    <h3 className="text-[15px] font-medium tracking-tight">
                      {entry.title}
                    </h3>
                    <p className="mt-1 mb-3 max-w-xl text-[13px] leading-6 text-muted-foreground">
                      {entry.body}
                    </p>
                    <CodeBlock
                      html={entry.html}
                      source={entry.source}
                      fileName={entry.fileName}
                    />
                  </div>
                ))}
              </div>
            </section>
          </>
        }
      />
      <div className="mx-auto mt-24 w-full max-w-4xl">
        <Footer variant="docs" />
      </div>
    </BlazeDemo>
  );
}
