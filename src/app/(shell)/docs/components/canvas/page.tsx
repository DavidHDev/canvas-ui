import type { Metadata } from "next";

import { ComponentDoc } from "@/components/docs/component-doc";
import { Footer } from "@/components/landing/footer";
import type { ApiProp } from "@/components/docs/api-reference";
import { getComponentSources } from "@/lib/registry";
import { CodeBlock } from "@/components/docs/code-block";
import { highlight } from "@/components/docs/highlight";
import { CanvasDemo } from "@/demos/canvas-demo";
import { CanvasPrint } from "@/demos/canvas-print";

export const metadata: Metadata = {
  title: "Canvas",
  description:
    "Woven canvas, linen, burlap, paper and parchment textures you can lay over any page, put behind content, print an image onto, or print the page itself onto with HTML-in-Canvas. A soft cursor light rakes across the weave. Built on Paper Shaders' paper texture. Works in any framework.",
  alternates: { canonical: "/docs/components/canvas" },
};

const DESCRIPTION =
  "A real material under your content: woven canvas, linen, burlap, paper or parchment. Lay it over a page, put it behind one, print an image onto it, or print the page itself onto a folded sheet.";

const USAGE = [
  {
    title: "Over a whole site",
    body: "Leave out children, pass fixed and layer=\"foreground\". The texture sits over every page, as shading on light pages and highlights on dark ones.",
    fileName: "layout.tsx",
    source: `<body>
  {children}
  <Canvas fixed layer="foreground" />
</body>`,
  },
  {
    title: "Behind a section",
    body: "Wrap content with a transparent background. The sheet sits behind it and the cursor light still reaches it.",
    fileName: "hero.tsx",
    source: `<Canvas preset="linen" insetX={48} insetY={48}>
  <Hero />
</Canvas>`,
  },
  {
    title: "Print an image",
    body: "Pass src to print a photo onto the material, with folds and grain bending it like a real print.",
    fileName: "print.tsx",
    source: `<Canvas
  src="/photo.jpg"
  preset="paper"
  folds={1}
  foldColumns={4}
  foldRows={2}
  className="aspect-video"
/>`,
  },
  {
    title: "Print the page on a sheet",
    body: "With layer=\"page\", your live HTML is printed onto the sheet and stays interactive. It needs html-in-canvas (Chrome 157 and later) and falls back to the foreground texture elsewhere.",
    fileName: "page.tsx",
    source: `<Canvas layer="page" preset="paper" folds={1} insetX={56} insetY={56}>
  <Article />
</Canvas>`,
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
    name: "preset",
    description:
      "Material to start from. Every option you pass overrides it.",
    type: '"canvas" | "raw" | "linen" | "burlap" | "paper" | "scroll"',
    defaultValue: '"canvas"',
  },
  {
    name: "layer",
    description:
      "Where the sheet sits: behind the content, laid over it, or with the content printed into it. \"page\" needs html-in-canvas and falls back to \"foreground\".",
    type: '"background" | "foreground" | "page"',
    defaultValue: '"background"',
  },
  {
    name: "src",
    description:
      "Image to print onto the sheet.",
    type: "string",
  },
  {
    name: "fit",
    description:
      "How the image fills the sheet.",
    type: '"cover" | "contain"',
    defaultValue: '"cover"',
  },
  {
    name: "insetX",
    description:
      "Margin left and right of the sheet in CSS pixels. The content is padded to sit on the sheet and the backdrop shows around it.",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "insetY",
    description:
      "Margin above and below the sheet in CSS pixels.",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "back",
    description:
      "Backdrop around the sheet when it has a margin, or around a clipped image, as any CSS color.",
    type: "string",
    defaultValue: '"transparent"',
  },
  {
    name: "color",
    description:
      "Sheet color, as any CSS color.",
    type: "string",
    defaultValue: "from preset",
  },
  {
    name: "shadow",
    description:
      "Color of the shading, grain and stains, as any CSS color.",
    type: "string",
    defaultValue: "from preset",
  },
  {
    name: "weave",
    description:
      "Woven threads (0 to 1).",
    type: "number",
    defaultValue: "0.8",
  },
  {
    name: "weaveSize",
    description:
      "Width of one woven thread in CSS pixels.",
    type: "number",
    defaultValue: "3.5",
  },
  {
    name: "weaveOpen",
    description:
      "How far apart the threads sit, from a tight weave to an open one like burlap (0 to 1).",
    type: "number",
    defaultValue: "0.2",
  },
  {
    name: "slub",
    description:
      "Uneven, lumpy threads, like linen (0 to 1).",
    type: "number",
    defaultValue: "0.3",
  },
  {
    name: "roughness",
    description:
      "Fine grain across the surface (0 to 1).",
    type: "number",
    defaultValue: "0.15",
  },
  {
    name: "roughnessSize",
    description:
      "Scale of the grain (0 to 1).",
    type: "number",
    defaultValue: "0.5",
  },
  {
    name: "roughnessRows",
    description:
      "Lines the grain up into laid-paper rows (0 to 1).",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "fiber",
    description:
      "Curly fibers through the material (0 to 1).",
    type: "number",
    defaultValue: "0.15",
  },
  {
    name: "fiberSize",
    description:
      "Scale of the fibers (0 to 1).",
    type: "number",
    defaultValue: "0.5",
  },
  {
    name: "folds",
    description:
      "Straight fold lines across the sheet (0 to 1).",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "foldColumns",
    description:
      "Panels across the sheet between vertical folds.",
    type: "number",
    defaultValue: "3",
  },
  {
    name: "foldRows",
    description:
      "Panels down the sheet between horizontal folds.",
    type: "number",
    defaultValue: "2",
  },
  {
    name: "wrinkles",
    description:
      "Small crumpled facets repeating across the surface (0 to 1).",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "wrinkleSize",
    description:
      "Scale of the wrinkles (0 to 1).",
    type: "number",
    defaultValue: "0.4",
  },
  {
    name: "crumples",
    description:
      "Large irregular creases, like a sheet crushed and flattened again (0 to 1).",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "crumpleCount",
    description:
      "Number of facets in the crumple field (2 to 15).",
    type: "number",
    defaultValue: "6",
  },
  {
    name: "stains",
    description:
      "Speckled stains across the sheet (0 to 1).",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "curl",
    description:
      "Radius of the rolled top and bottom edges in CSS pixels. 0 keeps the sheet flat.",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "burn",
    description:
      "Darkened, aged edges (0 to 1).",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "size",
    description:
      "Size of one sheet in CSS pixels. Crumples, wrinkles and grain scale with it.",
    type: "number",
    defaultValue: "800",
  },
  {
    name: "seed",
    description:
      "Seed for every pattern (0 to 1000).",
    type: "number",
    defaultValue: "4",
  },
  {
    name: "angle",
    description:
      "Direction the light comes from in degrees (0 to 360).",
    type: "number",
    defaultValue: "300",
  },
  {
    name: "interactive",
    description:
      "A soft, low light follows the cursor and rakes across the texture.",
    type: "boolean",
    defaultValue: "true",
  },
  {
    name: "radius",
    description:
      "Radius of the cursor light in CSS pixels.",
    type: "number",
    defaultValue: "550",
  },
  {
    name: "glow",
    description:
      "How strongly the cursor light picks out the texture (0 to 1).",
    type: "number",
    defaultValue: "0.15",
  },
  {
    name: "strength",
    description:
      "Strength of the texture in the foreground layer (0 to 1).",
    type: "number",
    defaultValue: "0.45",
  },
  {
    name: "tint",
    description:
      "How much the sheet color tints the content in the foreground layer (0 to 1).",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "distortion",
    description:
      "How much an image or the page bends with the surface (-1 to 1).",
    type: "number",
    defaultValue: "0.4",
  },
  {
    name: "blending",
    description:
      "How much of the material shows through an image or the page (0 to 1).",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "clip",
    description:
      "Cut the sheet to the image frame.",
    type: "boolean",
    defaultValue: "false",
  },
  {
    name: "fixed",
    description:
      "Cover the whole viewport. Use it without children for a site-wide texture.",
    type: "boolean",
    defaultValue: "false",
  },
  {
    name: "children",
    description:
      "Content to wrap. Leave it out to use Canvas as a surface on its own or over whatever sits beneath it.",
    type: "ReactNode",
  },
  {
    name: "className",
    description:
      "Classes applied to the wrapper element.",
    type: "string",
  },
];

export default async function CanvasPage() {
  const variants = await Promise.all(
    getComponentSources("canvas").map(async (file) => ({
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
    <CanvasDemo>
      <ComponentDoc
        title="Canvas"
        description={DESCRIPTION}
        variants={[...variants]}
        installItem="canvas"
        apiReference={API_REFERENCE}
        usageMarkdown={USAGE_MARKDOWN}
        beforeInstall={
          <>
            <CanvasPrint />
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
    </CanvasDemo>
  );
}
