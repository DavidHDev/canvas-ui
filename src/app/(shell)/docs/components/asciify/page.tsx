import type { Metadata } from "next";

import { ComponentDoc } from "@/components/docs/component-doc";
import { Footer } from "@/components/landing/footer";
import type { ApiProp } from "@/components/docs/api-reference";
import { getComponentSources } from "@/lib/registry";
import { CodeBlock } from "@/components/docs/code-block";
import { highlight } from "@/components/docs/highlight";
import { AsciifyDemo } from "@/demos/asciify-demo";
import { PageDemoPhoto } from "@/demos/scenes";

export const metadata: Metadata = {
  title: "Asciify",
  description:
    "A cursor trail of soft ascii glyphs in a color gradient that drifts like smoke and ripples on click. Works over any page in every browser, and can redraw the page itself as glyphs with HTML-in-Canvas. Works in any framework.",
  alternates: { canonical: "/docs/components/asciify" },
};

const DESCRIPTION =
  "A soft trail of ascii glyphs follows the cursor in a color gradient and ripples outward on click. Drop it over any page, or redraw the page itself as glyphs in Chrome 157 and later.";

const USAGE = [
  {
    title: "Across a whole site",
    body: "Leave out children and pass fixed. The trail follows the cursor over every page without touching your layout.",
    fileName: "layout.tsx",
    source: `<body>
  {children}
  <Asciify fixed />
</body>`,
  },
  {
    title: "Over one section",
    body: "Wrap a hero or a card. Ambient keeps a few glyphs drifting before anyone moves the cursor.",
    fileName: "hero.tsx",
    source: `<Asciify ambient={0.6} colors={["#7c2d12", "#ea580c", "#fff7ed"]}>
  <Hero />
</Asciify>`,
  },
  {
    title: "Redraw the page itself",
    body: "With source=\"page\", glyphs take the colors of the content beneath the trail. It needs html-in-canvas (Chrome 157 and later) and falls back to the gradient elsewhere.",
    fileName: "page.tsx",
    source: `<Asciify source="page">
  <Article />
</Asciify>`,
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
    name: "source",
    description:
      "What the glyphs show: a color gradient that works in every browser, or the page beneath them. \"page\" needs html-in-canvas and falls back to the gradient.",
    type: '"gradient" | "page"',
    defaultValue: '"gradient"',
  },
  {
    name: "colors",
    description:
      "Gradient colors from the trail's faint edge to its core, as CSS colors. Leave empty for a blue ramp that suits the background.",
    type: "string[]",
    defaultValue: "[]",
  },
  {
    name: "characters",
    description:
      "Characters from sparse to dense. The first one is usually a space.",
    type: "string",
    defaultValue: '" .-=+xX0S8#@"',
  },
  {
    name: "fontFamily",
    description:
      "Font family the glyphs are drawn in.",
    type: "string",
    defaultValue: '"Geist Mono", monospace',
  },
  {
    name: "cellSize",
    description:
      "Glyph cell height in CSS pixels.",
    type: "number",
    defaultValue: "12",
  },
  {
    name: "radius",
    description:
      "Radius of the cursor trail in CSS pixels.",
    type: "number",
    defaultValue: "140",
  },
  {
    name: "trail",
    description:
      "Seconds the trail takes to fade once the cursor has passed.",
    type: "number",
    defaultValue: "0.9",
  },
  {
    name: "flow",
    description:
      "How much the trail drifts and billows like smoke (0 to 1).",
    type: "number",
    defaultValue: "0.5",
  },
  {
    name: "click",
    description:
      "What a click does: a ring of glyphs, a burst at the cursor, or nothing.",
    type: '"wave" | "burst" | "none"',
    defaultValue: '"wave"',
  },
  {
    name: "ambient",
    description:
      "Drifting glyphs across the whole surface, even when the cursor is away (0 to 1).",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "density",
    description:
      "Share of cells that draw a glyph (0 to 1).",
    type: "number",
    defaultValue: "0.75",
  },
  {
    name: "opacity",
    description:
      "Glyph opacity (0 to 1).",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "contrast",
    description:
      "Contrast applied before a glyph is picked. Higher values reach the dense glyphs sooner.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "depth",
    description:
      "Share of glyphs drawn out of focus (0 to 1).",
    type: "number",
    defaultValue: "0.3",
  },
  {
    name: "flicker",
    description:
      "How often visible glyphs re-roll (0 to 1).",
    type: "number",
    defaultValue: "0.5",
  },
  {
    name: "glow",
    description:
      "Soft glow around the glyphs (0 to 1).",
    type: "number",
    defaultValue: "0.6",
  },
  {
    name: "grain",
    description:
      "Film grain over the effect (0 to 1).",
    type: "number",
    defaultValue: "0.15",
  },
  {
    name: "veil",
    description:
      "How strongly the background color covers what's behind the glyphs (0 to 1).",
    type: "number",
    defaultValue: "0.35",
  },
  {
    name: "background",
    description:
      "Background color as any CSS color, or \"auto\" to match the page. Also decides whether glyphs glow (dark) or print (light).",
    type: "string",
    defaultValue: '"auto"',
  },
  {
    name: "keepText",
    description:
      "With source \"page\", leave text crisp and readable inside the trail.",
    type: "boolean",
    defaultValue: "true",
  },
  {
    name: "fixed",
    description:
      "Cover the whole viewport as a fixed overlay. Use it without children to add the trail to a full site.",
    type: "boolean",
    defaultValue: "false",
  },
  {
    name: "children",
    description:
      "Content to wrap. Leave it out to use Asciify as an overlay on whatever sits beneath it.",
    type: "ReactNode",
  },
  {
    name: "className",
    description:
      "Classes applied to the wrapper element.",
    type: "string",
  },
];

export default async function AsciifyPage() {
  const files = getComponentSources("asciify");
  const variants = await Promise.all(
    files.map(async (file) => ({
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
    <AsciifyDemo>
      <ComponentDoc
        title="Asciify"
        description={DESCRIPTION}
        variants={[...variants]}
        installItem="asciify"
        apiReference={API_REFERENCE}
        usageMarkdown={USAGE_MARKDOWN}
        beforeInstall={
          <>
            <PageDemoPhoto photo={1} />
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
    </AsciifyDemo>
  );
}
