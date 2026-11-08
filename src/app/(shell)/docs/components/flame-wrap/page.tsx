import type { Metadata } from "next";

import { ComponentDoc } from "@/components/docs/component-doc";
import { CodeBlock } from "@/components/docs/code-block";
import {
  FLAME_WRAP_VANILLA_HTML,
  FLAME_WRAP_VANILLA_MARKDOWN,
  FLAME_WRAP_VANILLA_TS,
} from "@/components/docs/flame-wrap-vanilla-usage";
import { Footer } from "@/components/landing/footer";
import type { ApiProp } from "@/components/docs/api-reference";
import { getComponentSources } from "@/lib/registry";
import { highlight } from "@/components/docs/highlight";
import { FlameWrapDemo } from "@/demos/flame-wrap-demo";

export const metadata: Metadata = {
  title: "Flame Wrap",
  description:
    "Wrap any element in a perfectly aligned border of fire. Flames rise from the top edge, the outline glows molten hot, sparks fly, and the content shimmers with heat.",
  alternates: { canonical: "/docs/components/flame-wrap" },
};

const DESCRIPTION =
  "Wrap any element in a border of fire. The outline burns molten, sparks drift off the edges, and the content shimmers in the heat.";

const API_REFERENCE: ApiProp[] = [
  {
    name: "color",
    description: "Flame color as [r, g, b] with each channel in 0 to 1.",
    type: "[number, number, number]",
    defaultValue: "[0.31, 0.54, 1]",
  },
  {
    name: "intensity",
    description: "Overall brightness of the fire.",
    type: "number",
    defaultValue: "0.5",
  },
  {
    name: "height",
    description: "How far the flames reach above the top edge, in pixels.",
    type: "number",
    defaultValue: "170",
  },
  {
    name: "spread",
    description:
      "How far the glow reaches past the sides and bottom, in pixels.",
    type: "number",
    defaultValue: "8",
  },
  {
    name: "radius",
    description:
      "Corner radius of the burning outline in pixels. Match it to your content so the fire hugs the shape.",
    type: "number",
    defaultValue: "40",
  },
  {
    name: "speed",
    description: "Animation speed multiplier for the whole effect.",
    type: "number",
    defaultValue: "0.25",
  },
  {
    name: "scale",
    description:
      "Flame detail from 0 (broad, soft licks) to 1 (fine, busy licks).",
    type: "number",
    defaultValue: "0.75",
  },
  {
    name: "turbulence",
    description: "Amplitude of the turbulence waves shaping the flames.",
    type: "number",
    defaultValue: "0.5",
  },
  {
    name: "turbulenceScale",
    description:
      "Frequency multiplier of the turbulence waves. Lower is lazier, higher is choppier.",
    type: "number",
    defaultValue: "0.5",
  },
  {
    name: "turbulenceReach",
    description:
      "How far from the edges the heat warps the content, in pixels.",
    type: "number",
    defaultValue: "25",
  },
  {
    name: "sparks",
    description: "Brightness of the spark highlights. 0 disables them.",
    type: "number",
    defaultValue: "1.5",
  },
  {
    name: "sparkSize",
    description: "Size multiplier for individual sparks.",
    type: "number",
    defaultValue: "0.35",
  },
  {
    name: "sparkDensity",
    description: "How many sparks fly at once.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "sparkSpeed",
    description: "How fast sparks rise and flicker.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "rim",
    description: "Strength of the molten glow hugging the edges.",
    type: "number",
    defaultValue: "2.5",
  },
  {
    name: "melt",
    description:
      "How far the fire eats into the content silhouette, in pixels, so the edges look like they are burning away.",
    type: "number",
    defaultValue: "4.5",
  },
  {
    name: "distortion",
    description:
      "Heat shimmer displacement of the content near the edges, in pixels.",
    type: "number",
    defaultValue: "10",
  },
  {
    name: "smoke",
    description: "Amount of smoke drifting off the flames.",
    type: "number",
    defaultValue: "1.5",
  },
  {
    name: "ember",
    description: "Brightness of the glowing ember line on the burnt edges.",
    type: "number",
    defaultValue: "2",
  },
  {
    name: "scorch",
    description: "Darkness of the charred band on the content edges.",
    type: "number",
    defaultValue: "0",
  },
];

export default async function FlameWrapPage() {
  const [vanillaHtml, vanillaTs] = await Promise.all([
    highlight(FLAME_WRAP_VANILLA_HTML, "html"),
    highlight(FLAME_WRAP_VANILLA_TS, "typescript"),
  ]);
  const variants = await Promise.all(
    getComponentSources("flame-wrap").map(async (file) => ({
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
        title="Flame Wrap"
        description={DESCRIPTION}
        variants={[...variants]}
        installItem="flame-wrap"
        tags={["html-in-canvas"]}
        apiReference={API_REFERENCE}
        usageMarkdown={FLAME_WRAP_VANILLA_MARKDOWN}
        beforeInstall={
          <>
            <section className="mt-8" aria-label="Demo">
              <h2 className="text-lg font-semibold tracking-[-0.01em]">Demo</h2>
              <p className="mt-2 text-[13px] text-muted-foreground">
                Recolor the
                flames, raise them higher, or melt the edges further. Use the
                toggle below the demo to try other UI.
              </p>
              <div className="mt-3">
                <FlameWrapDemo />
              </div>
            </section>
            <section className="mt-8" aria-label="Vanilla setup">
              <h2
                id="vanilla-setup"
                className="scroll-mt-24 text-lg font-semibold tracking-[-0.01em]"
              >
                Vanilla setup
              </h2>
              <p className="mt-2 text-[13px] leading-6 text-muted-foreground">
                Pass three elements to <code>createFlameWrap</code>: the source
                canvas, the content element inside it, and the output canvas.
                Put <code>id=&quot;content&quot;</code> on the first div inside{" "}
                <code>canvas#source</code>. Pointing it at the outer container
                leaves the flames visible but prevents the HTML from being captured.
                Framework wrappers create this structure for you.
              </p>
              <div className="mt-3">
                <CodeBlock
                  html={vanillaHtml}
                  source={FLAME_WRAP_VANILLA_HTML}
                  fileName="index.html (inside body)"
                />
              </div>
              <p className="mt-3 text-[13px] leading-6 text-muted-foreground">
                The example uses the default flame height, spread, and corner
                radius. Keep room around the container for the flames; update the
                output canvas offsets if you increase their reach. Load this
                script after the markup. It keeps the HTML visible when
                html-in-canvas or the GPU context is unavailable.
              </p>
              <div className="mt-3">
                <CodeBlock
                  html={vanillaTs}
                  source={FLAME_WRAP_VANILLA_TS}
                  fileName="src/main.ts"
                />
              </div>
              <p className="mt-3 text-[13px] leading-6 text-muted-foreground">
                For the WebGPU build, change the import to{" "}
                <code>@/components/canvasui/FlameWrapWebGPU</code>. The markup and
                initialization stay the same. Capturing and distorting the
                content needs html-in-canvas, which ships in Chrome 157 and
                later; see the{" "}
                <a
                  href="/docs/installation#requirements"
                  className="underline underline-offset-4"
                >
                  installation requirements
                </a>
                .
              </p>
            </section>
          </>
        }
      />
      <div className="mx-auto mt-24 w-full max-w-3xl">
        <Footer variant="docs" />
      </div>
    </div>
  );
}
