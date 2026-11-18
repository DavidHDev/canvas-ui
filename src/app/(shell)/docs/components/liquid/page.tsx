import type { Metadata } from "next";

import { ComponentDoc } from "@/components/docs/component-doc";
import { CodeBlock } from "@/components/docs/code-block";
import { DemoImageSection } from "@/demos/demo-image-cycler";
import { Footer } from "@/components/landing/footer";
import type { ApiProp } from "@/components/docs/api-reference";
import { getComponentSources } from "@/lib/registry";
import { highlight } from "@/components/docs/highlight";
import { LiquidDemo } from "@/demos/liquid-demo";

export const metadata: Metadata = {
  title: "Liquid",
  description:
    "Wraps your content in a canvas using the html-in-canvas API and runs a pointer-driven GPU fluid simulation over it, in WebGL or WebGPU via vgpu. No dependencies, works in any framework.",
  alternates: { canonical: "/docs/components/liquid" },
};

const DESCRIPTION =
  "A pointer-driven fluid simulation over your live page. Move the cursor and stir it up.";

const PRISM_EXAMPLE = `import { Liquid } from "@/components/canvasui/Liquid";

export default function Page() {
  return (
    <Liquid prism blur={1}>
      <main>Your content here</main>
    </Liquid>
  );
}`;

const PRISM_USAGE =
  "Set prism to true for iridescent oil-film colors inspired by Fluid Prism. " +
  "Prism takes priority over rainbow and color. Turn it off to restore those settings. " +
  "Use intensity and blend to adjust the film, distortion to adjust the warp, and blur to soften captured content along the flow. " +
  "Without HTML-in-Canvas, the effect falls back to a colored trail over the live HTML; content distortion and blur require capture.";

const BLUR_EXAMPLE = `<Liquid rainbow blur={1} distortion={0}>
  <main>Your content here</main>
</Liquid>`;

const BLUR_USAGE =
  "Blur works independently with Prism, Rainbow, or a fixed color. " +
  "It defaults to 0 (off); 1 is the base strength, and larger values spread the nine samples farther along the flow. " +
  "Set distortion to 0 to keep the blur without warping the content. " +
  "Set blend to 0 to remove the color tint and keep only the content effects. " +
  "Blur requires HTML-in-Canvas and has no effect on the DOM overlay fallback.";

const API_REFERENCE: ApiProp[] = [
  {
    name: "force",
    description: "Force multiplier applied on pointer movement.",
    type: "number",
    defaultValue: "1.1",
  },
  {
    name: "radius",
    description: "Radius of the pointer splat.",
    type: "number",
    defaultValue: "0.3",
  },
  {
    name: "curl",
    description: "Rotational force added back into the flow.",
    type: "number",
    defaultValue: "1.9",
  },
  {
    name: "intensity",
    description: "Strength of the color tint left by the flow.",
    type: "number",
    defaultValue: "2",
  },
  {
    name: "distortion",
    description: "How strongly the flow warps the content. Independent of blur.",
    type: "number",
    defaultValue: "0.4",
  },
  {
    name: "blur",
    description:
      "Directional blur strength in every color mode. 0 disables it; 1 is the base strength. Requires captured content.",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "blend",
    description: "How much of the fluid color blends over the content.",
    type: "number",
    defaultValue: "5",
  },
  {
    name: "densityDissipation",
    description:
      "How much the trail persists each frame. Closer to 1 lasts longer.",
    type: "number",
    defaultValue: "0.96",
  },
  {
    name: "velocityDissipation",
    description:
      "How much motion persists each frame. Closer to 1 lasts longer.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "pressure",
    description: "How much pressure carries over between frames.",
    type: "number",
    defaultValue: "0.8",
  },
  {
    name: "pressureIterations",
    description:
      "Pressure solver iterations. More is more accurate but slower.",
    type: "number",
    defaultValue: "4",
  },
  {
    name: "color",
    description:
      "Trail color as [r, g, b] in 0-1 range. Ignored when rainbow or prism is on.",
    type: "[number, number, number]",
    defaultValue: "[0.145, 0.239, 0.867]",
  },
  {
    name: "rainbow",
    description:
      "Color the trail from the flow direction. Ignored when prism is on.",
    type: "boolean",
    defaultValue: "false",
  },
  {
    name: "prism",
    description:
      "Add iridescent oil-film colors, overriding rainbow and color.",
    type: "boolean",
    defaultValue: "false",
  },
  {
    name: "simResolution",
    description: "Resolution of the simulation grid.",
    type: "number",
    defaultValue: "128",
  },
  {
    name: "dyeResolution",
    description: "Resolution of the fluid trail texture.",
    type: "number",
    defaultValue: "512",
  },
  {
    name: "className",
    description: "Classes applied to the wrapper element.",
    type: "string",
  },
];

export default async function LiquidPage() {
  const prismExampleHtml = await highlight(PRISM_EXAMPLE, "tsx");
  const blurExampleHtml = await highlight(BLUR_EXAMPLE, "tsx");
  const variants = await Promise.all(
    getComponentSources("liquid").map(async (file) => ({
      id: file.id,
      label: file.label,
      fileName: file.fileName,
      source: file.source,
      html: await highlight(file.source, file.lang),
    })),
  );

  return (
    <LiquidDemo>
      <ComponentDoc
        title="Liquid"
        description={DESCRIPTION}
        variants={[...variants]}
        installItem="liquid"
        tags={["html-in-canvas"]}
        apiReference={API_REFERENCE}
        usageMarkdown={`## Prism\n\n${PRISM_USAGE}\n\n\`\`\`tsx\n${PRISM_EXAMPLE}\n\`\`\`\n\n## Blur\n\n${BLUR_USAGE}\n\n\`\`\`tsx\n${BLUR_EXAMPLE}\n\`\`\``}
        beforeInstall={
          <>
            <DemoImageSection
              hint="Drag across the photo to stir it like liquid. Try Prism for iridescent colors and Blur to soften the flow."
              alt="Demo photo for the Liquid effect"
            />
            <section className="mt-8" aria-label="Prism">
              <h2 className="text-lg font-semibold tracking-[-0.01em]">
                Prism
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {PRISM_USAGE}
              </p>
              <div className="mt-4">
                <CodeBlock
                  html={prismExampleHtml}
                  source={PRISM_EXAMPLE}
                  fileName="page.tsx"
                />
              </div>
            </section>
            <section className="mt-8" aria-label="Blur">
              <h2 className="text-lg font-semibold tracking-[-0.01em]">
                Blur
              </h2>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">
                {BLUR_USAGE}
              </p>
              <div className="mt-4">
                <CodeBlock
                  html={blurExampleHtml}
                  source={BLUR_EXAMPLE}
                  fileName="page.tsx"
                />
              </div>
            </section>
          </>
        }
      />
      <div className="mx-auto mt-24 w-full max-w-3xl">
        <Footer variant="docs" />
      </div>
    </LiquidDemo>
  );
}
