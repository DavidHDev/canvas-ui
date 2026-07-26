import type { Metadata } from "next";

import { ComponentDoc } from "@/components/docs/component-doc";
import { Footer } from "@/components/landing/footer";
import type { ApiProp } from "@/components/docs/api-reference";
import { getComponentSources } from "@/lib/registry";
import { highlight } from "@/components/docs/highlight";
import { ParticleScrollDemo } from "@/demos/particle-scroll-demo";
import { DemoImageSection } from "@/demos/demo-image-cycler";

export const metadata: Metadata = {
  title: "Particle Scroll",
  description:
    "Wraps your content in a canvas using the html-in-canvas API and dissolves everything below a chosen line into fine drifting sand particles that reassemble into the page as you scroll. No dependencies, works in any framework.",
  alternates: { canonical: "/docs/components/particle-scroll" },
};

const DESCRIPTION =
  "Everything below a chosen line dissolves into drifting sand. Scroll down and the page reassembles, grain by grain.";

const API_REFERENCE: ApiProp[] = [
  {
    name: "point",
    description:
      "Viewport fraction of the formation line. Content assembles as it scrolls up past this line and dissolves back below it.",
    type: "number",
    defaultValue: "0.68",
  },
  {
    name: "band",
    description:
      "Height in CSS pixels of the transition band where particles progressively reassemble.",
    type: "number",
    defaultValue: "420",
  },
  {
    name: "density",
    description:
      "Grain spacing in CSS pixels. Smaller values mean finer, denser sand.",
    type: "number",
    defaultValue: "2",
  },
  {
    name: "size",
    description:
      "Size of fully scattered dust grains in CSS pixels. Grains grow to cover their cell as they land.",
    type: "number",
    defaultValue: "1.25",
  },
  {
    name: "spread",
    description:
      "Maximum distance in CSS pixels particles scatter from their home position.",
    type: "number",
    defaultValue: "220",
  },
  {
    name: "gravity",
    description:
      "Downward bias of the scattered cloud (-1 to 1), like sand settling. Negative values lift it.",
    type: "number",
    defaultValue: "0.35",
  },
  {
    name: "drift",
    description:
      "Idle float speed of scattered particles (0 to 1). 0 freezes the cloud.",
    type: "number",
    defaultValue: "0.7",
  },
  {
    name: "swirl",
    description: "Sideways arc in CSS pixels particles take while flying home.",
    type: "number",
    defaultValue: "60",
  },
  {
    name: "stagger",
    description: "Per-particle randomness of reassembly timing (0 to 1).",
    type: "number",
    defaultValue: "0.7",
  },
  {
    name: "fade",
    description: "Opacity of fully scattered particles (0 to 1).",
    type: "number",
    defaultValue: "0.85",
  },
  {
    name: "settle",
    description:
      "Seconds a row of dust takes to condense into the page once the reveal reaches it.",
    type: "number",
    defaultValue: "1.2",
  },
  {
    name: "smoothing",
    description:
      "Seconds the damped scroll takes to catch up with the real scroll. Higher feels more fluid.",
    type: "number",
    defaultValue: "0.6",
  },
  {
    name: "className",
    description: "Classes applied to the wrapper element.",
    type: "string",
  },
];

export default async function ParticleScrollPage() {
  const variants = await Promise.all(
    getComponentSources("particle-scroll").map(async (file) => ({
      id: file.id,
      label: file.label,
      fileName: file.fileName,
      source: file.source,
      html: await highlight(file.source, file.lang),
    })),
  );

  return (
    <ParticleScrollDemo>
      <ComponentDoc
        title="Particle Scroll"
        description={DESCRIPTION}
        variants={[...variants]}
        installItem="particle-scroll"
        tags={["html-in-canvas"]}
        requiresHtmlInCanvas
        apiReference={API_REFERENCE}
        demoSection
        beforeInstall={
          <DemoImageSection
            hint="Rich imagery makes the effect shine, watch every pixel of the photo scatter into dust and settle back as it crosses the line."
            alt="Demo photo for the Particle Scroll effect"
          />
        }
      />
      <div className="mx-auto mt-24 w-full max-w-3xl">
        <Footer variant="docs" />
      </div>
    </ParticleScrollDemo>
  );
}
