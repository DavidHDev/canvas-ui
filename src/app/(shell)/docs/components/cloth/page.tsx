import type { Metadata } from "next";

import { ComponentDoc } from "@/components/docs/component-doc";
import { Footer } from "@/components/landing/footer";
import type { ApiProp } from "@/components/docs/api-reference";
import { getComponentSources } from "@/lib/registry";
import { CodeBlock } from "@/components/docs/code-block";
import { highlight } from "@/components/docs/highlight";
import { ClothDemo } from "@/demos/cloth-demo";
import { PageDemoPhoto } from "@/demos/scenes";

export const metadata: Metadata = {
  title: "Cloth",
  description:
    "Hangs your live HTML on a simulated piece of fabric. Grab it anywhere to fold and fling it, and it falls back into place. Text, links and buttons keep working, even across folds. No dependencies.",
  alternates: { canonical: "/docs/components/cloth" },
};

const DESCRIPTION =
  "Hangs your live HTML on a piece of fabric. Grab it anywhere to fold and fling it, and it falls back into place. Text, links and buttons keep working, even across folds.";

const USAGE = [
  {
    title: "A hanging card",
    body: "Give the cloth a size and put anything inside. It hangs from its top edge and sways a little in the wind. Dragging across text still selects it; dragging anywhere else grabs the fabric.",
    fileName: "card.tsx",
    source: `<Cloth className="h-[28rem] w-full max-w-xl">
  <Profile />
</Cloth>`,
  },
  {
    title: "A banner on two pins",
    body: "With pin=\"corners\" only the top corners hold, so the middle sags and catches more wind.",
    fileName: "banner.tsx",
    source: `<Cloth pin="corners" wind={0.55} stiffness={0.35} className="h-64">
  <Announcement />
</Cloth>`,
  },
  {
    title: "Fold it and leave it",
    body: "With float the cloth stays wherever you drag and fold it instead of falling back, and the wind stops. Links and buttons on the folded cloth still respond.",
    fileName: "note.tsx",
    source: `<Cloth float className="h-96">
  <Note />
</Cloth>`,
  },
  {
    title: "Wind only",
    body: "Set drag={false} to let the cloth move in the wind without being grabbed. The cursor still brushes the fabric as it passes.",
    fileName: "hero.tsx",
    source: `<Cloth drag={false} wind={0.4} className="h-svh">
  <Hero />
</Cloth>`,
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
    name: "pin",
    description:
      'Where the cloth hangs from: a whole edge, its two top corners, or "none", which lets it float and ease back flat.',
    type: '"top" | "corners" | "left" | "right" | "bottom" | "none"',
    defaultValue: '"top"',
  },
  {
    name: "wind",
    description: "Wind blowing through the fabric (0 to 1).",
    type: "number",
    defaultValue: "0.25",
  },
  {
    name: "stiffness",
    description: "How stiff the fabric is, from silk (0) to canvas (1).",
    type: "number",
    defaultValue: "0.5",
  },
  {
    name: "settle",
    description:
      "How firmly the cloth pulls itself back flat after you let go (0 to 1).",
    type: "number",
    defaultValue: "0.3",
  },
  {
    name: "drag",
    description:
      "Grab the cloth anywhere and drag it. Text selection, links, buttons and inputs still work as usual.",
    type: "boolean",
    defaultValue: "true",
  },
  {
    name: "float",
    description:
      "The cloth stays wherever you drag and fold it instead of falling back. Wind is ignored while floating.",
    type: "boolean",
    defaultValue: "false",
  },
  {
    name: "brush",
    description:
      "How much the fabric follows the cursor as it brushes past (0 to 1).",
    type: "number",
    defaultValue: "0.4",
  },
  {
    name: "light",
    description: "Strength of the light and shade across the folds (0 to 1).",
    type: "number",
    defaultValue: "0.6",
  },
  {
    name: "sheen",
    description:
      "Soft sheen where the fabric turns toward the light (0 to 1).",
    type: "number",
    defaultValue: "0.35",
  },
  {
    name: "weave",
    description: "Visibility of the woven thread texture (0 to 1).",
    type: "number",
    defaultValue: "0.3",
  },
  {
    name: "shadow",
    description:
      "Opacity of the shadow the cloth casts on the wall behind it (0 to 1).",
    type: "number",
    defaultValue: "0.4",
  },
  {
    name: "cornerRadius",
    description: "Corner radius of the fabric in CSS pixels.",
    type: "number",
    defaultValue: "16",
  },
  {
    name: "backing",
    description:
      'Fabric color behind transparent content and on the back of a fold, as RGB in the 0 to 1 range, or "auto" to sample the page background. Re-resolves on theme changes.',
    type: '[number, number, number] | "auto"',
    defaultValue: '"auto"',
  },
  {
    name: "perspective",
    description:
      "Perspective focal length in CSS pixels. Lower values exaggerate the depth.",
    type: "number",
    defaultValue: "1400",
  },
  {
    name: "speed",
    description: "Simulation speed multiplier.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "className",
    description: "Classes applied to the wrapper element.",
    type: "string",
  },
];

export default async function ClothPage() {
  const variants = await Promise.all(
    getComponentSources("cloth").map(async (file) => ({
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
    <ClothDemo>
      <ComponentDoc
        title="Cloth"
        description={DESCRIPTION}
        variants={[...variants]}
        installItem="cloth"
        tags={["html-in-canvas"]}
        requiresHtmlInCanvas
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
    </ClothDemo>
  );
}
