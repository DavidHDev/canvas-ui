import type { Metadata } from "next";

import { ComponentDoc } from "@/components/docs/component-doc";
import { Footer } from "@/components/landing/footer";
import type { ApiProp } from "@/components/docs/api-reference";
import { getComponentSources } from "@/lib/registry";
import { highlight } from "@/components/docs/highlight";
import { ForceFieldDemo } from "@/demos/force-field-demo";
import { PageDemoPhoto } from "@/demos/scenes";

export const metadata: Metadata = {
  title: "Force Field",
  description:
    "Wraps your content in a canvas using the html-in-canvas API and projects an energy shield lattice over it. Clicks send expanding shockwave ripples that refract the page beneath, with bloom, grain and a burning reveal dissolve. No dependencies, works in any framework.",
  alternates: { canonical: "/docs/components/force-field" },
};

const DESCRIPTION =
  "An energy shield stretched over your page. The cursor charges cells as it crosses the lattice, and every click sends a shockwave bending the content behind it.";

const API_REFERENCE: ApiProp[] = [
  {
    name: "shape",
    description: "Cell shape of the energy lattice.",
    type: '"hexagon" | "triangle" | "square"',
    defaultValue: '"hexagon"',
  },
  {
    name: "color",
    description: "Field color as [r, g, b] in 0 to 1 range.",
    type: "[number, number, number]",
    defaultValue: "[0.15, 0.68, 1]",
  },
  {
    name: "edgeColor",
    description:
      "Color of the dissolve edge glow as [r, g, b] in 0 to 1 range.",
    type: "[number, number, number]",
    defaultValue: "[0.5, 0.8, 1]",
  },
  {
    name: "opacity",
    description: "Overall field opacity (0 to 1).",
    type: "number",
    defaultValue: "0.9",
  },
  {
    name: "cellScale",
    description: "Cells across the shorter screen axis (4 to 80).",
    type: "number",
    defaultValue: "16",
  },
  {
    name: "lineWidth",
    description: "Thickness of the lattice lines (0.005 to 0.2).",
    type: "number",
    defaultValue: "0.03",
  },
  {
    name: "gridOpacity",
    description: "Brightness of the lattice grid (0 to 1).",
    type: "number",
    defaultValue: "0.15",
  },
  {
    name: "gridReveal",
    description:
      "How the lattice is revealed: always visible, near the cursor, by click ripples, or both.",
    type: '"always" | "hover" | "click" | "both"',
    defaultValue: '"click"',
  },
  {
    name: "gridRevealStrength",
    description:
      "Brightness of the revealed lattice in hover, click or both modes (0 to 3).",
    type: "number",
    defaultValue: "1.5",
  },
  {
    name: "gridRevealRadius",
    description: "Radius of the hover reveal in CSS pixels (60 to 800).",
    type: "number",
    defaultValue: "250",
  },
  {
    name: "gridFade",
    description: "Fade smoothness of the reveal edge (0.02 to 1).",
    type: "number",
    defaultValue: "0.35",
  },
  {
    name: "flashSpeed",
    description: "Random per-cell flash speed (0 to 4).",
    type: "number",
    defaultValue: "0.6",
  },
  {
    name: "flashIntensity",
    description: "Random per-cell flash brightness (0 to 1).",
    type: "number",
    defaultValue: "0.1",
  },
  {
    name: "flowScale",
    description: "Scale of the drifting energy noise (0.5 to 12).",
    type: "number",
    defaultValue: "3",
  },
  {
    name: "flowSpeed",
    description: "Drift speed of the energy noise (0 to 4).",
    type: "number",
    defaultValue: "0.5",
  },
  {
    name: "flowIntensity",
    description: "Brightness of the energy noise (0 to 4).",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "edgeGlow",
    description: "Glow creeping in from the screen edges (0 to 4).",
    type: "number",
    defaultValue: "0.2",
  },
  {
    name: "edgeFalloff",
    description: "How far the edge glow reaches into the screen (0.02 to 0.6).",
    type: "number",
    defaultValue: "0.18",
  },
  {
    name: "reveal",
    description:
      "Reveal progress. 1 is fully materialized, 0 dissolves the field away through burning noise.",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "dissolveScale",
    description: "Scale of the dissolve noise (0.5 to 12).",
    type: "number",
    defaultValue: "3.5",
  },
  {
    name: "dissolveWidth",
    description: "Width of the burning dissolve edge (0.005 to 0.2).",
    type: "number",
    defaultValue: "0.05",
  },
  {
    name: "dissolveGlow",
    description: "Brightness of the dissolve edge (0 to 12).",
    type: "number",
    defaultValue: "6",
  },
  {
    name: "rippleSpeed",
    description:
      "Expansion speed of click ripples in screens per second (0.1 to 4).",
    type: "number",
    defaultValue: "0.5",
  },
  {
    name: "rippleWidth",
    description: "Ring thickness of click ripples (0.01 to 0.4).",
    type: "number",
    defaultValue: "0.045",
  },
  {
    name: "rippleBlend",
    description:
      "How softly ripple rings feather into the page, 0 is tight, 1 is airy (0 to 1).",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "rippleDuration",
    description: "Lifetime of one ripple in seconds (0.3 to 5).",
    type: "number",
    defaultValue: "1.6",
  },
  {
    name: "rippleIntensity",
    description: "Brightness of ripples and impact flashes (0 to 8).",
    type: "number",
    defaultValue: "0.1",
  },
  {
    name: "rippleMaxRadius",
    description: "Max radius a ripple can reach, in screens (0.1 to 2).",
    type: "number",
    defaultValue: "0.85",
  },
  {
    name: "impactRadius",
    description: "Radius of the cell flash burst around an impact (0 to 0.5).",
    type: "number",
    defaultValue: "0.16",
  },
  {
    name: "refraction",
    description:
      "How much ripples push the page outward and warp the lattice (0 to 60).",
    type: "number",
    defaultValue: "30",
  },
  {
    name: "aberration",
    description: "Chromatic aberration inside ripple rings (0 to 8).",
    type: "number",
    defaultValue: "2.5",
  },
  {
    name: "haze",
    description:
      "Living heat-haze shimmer that warps the page beneath the field (0 to 2).",
    type: "number",
    defaultValue: "0.5",
  },
  {
    name: "pageReact",
    description:
      "Lattice reacts to the page: cells over bright content glow brighter (0 to 1).",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "tint",
    description:
      "Tints the page toward the field color, like looking through the shield (0 to 1).",
    type: "number",
    defaultValue: "0.1",
  },
  {
    name: "hoverGlow",
    description: "Glow following the cursor (0 to 3).",
    type: "number",
    defaultValue: "0.25",
  },
  {
    name: "hoverRadius",
    description: "Radius of the cursor glow in CSS pixels (40 to 600).",
    type: "number",
    defaultValue: "350",
  },
  {
    name: "hoverCharge",
    description: "Cells light up when the cursor crosses them (0 to 2).",
    type: "number",
    defaultValue: "1.6",
  },
  {
    name: "hideOnHover",
    description:
      "Fade the field out around the cursor instead of intensifying it.",
    type: "boolean",
    defaultValue: "false",
  },
  {
    name: "dim",
    description: "How much the page dims beneath the field (0 to 1).",
    type: "number",
    defaultValue: "0",
  },
  {
    name: "bloom",
    description: "Bloom amount applied to bright field energy (0 to 3).",
    type: "number",
    defaultValue: "1",
  },
  {
    name: "bloomThreshold",
    description: "Bloom brightness cutoff (0 to 1).",
    type: "number",
    defaultValue: "0.3",
  },
  {
    name: "grain",
    description: "Animated film grain over the field (0 to 1).",
    type: "number",
    defaultValue: "0.2",
  },
  {
    name: "clickRipples",
    description: "Spawn ripples on click.",
    type: "boolean",
    defaultValue: "true",
  },
  {
    name: "onHit",
    description:
      "Called with the impact position in CSS pixels after each click.",
    type: "((x: number, y: number) => void) | null",
  },
  {
    name: "className",
    description: "Classes applied to the wrapper element.",
    type: "string",
  },
];

export default async function ForceFieldPage() {
  const variants = await Promise.all(
    getComponentSources("force-field").map(async (file) => ({
      id: file.id,
      label: file.label,
      fileName: file.fileName,
      source: file.source,
      html: await highlight(file.source, file.lang),
    })),
  );

  return (
    <ForceFieldDemo>
      <ComponentDoc
        title="Force Field"
        description={DESCRIPTION}
        variants={[...variants]}
        installItem="force-field"
        tags={["html-in-canvas"]}
        apiReference={API_REFERENCE}
        beforeInstall={<PageDemoPhoto photo={3} />}
      />
      <div className="mx-auto mt-24 w-full max-w-4xl">
        <Footer variant="docs" />
      </div>
    </ForceFieldDemo>
  );
}
