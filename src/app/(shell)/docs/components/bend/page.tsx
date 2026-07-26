import type { Metadata } from "next";

import { ComponentDoc } from "@/components/docs/component-doc";
import { DemoImageSection } from "@/demos/demo-image-cycler";
import { Footer } from "@/components/landing/footer";
import type { ApiProp } from "@/components/docs/api-reference";
import { getComponentSources } from "@/lib/registry";
import { highlight } from "@/components/docs/highlight";
import { BendDemo } from "@/demos/bend-demo";

export const metadata: Metadata = {
  title: "Bend",
  description:
    "Wraps your content in a canvas using the html-in-canvas API and folds the top and bottom of the page over straight virtual edges, like scrolling on the face of a cube. No dependencies, works in any framework.",
  alternates: { canonical: "/docs/components/bend" },
};

const DESCRIPTION =
  "Your page scrolls on the face of a cube. The top and bottom fold over virtual edges and flatten back out at the scroll ends. This page is the demo, scroll it.";

const API_REFERENCE: ApiProp[] = [
  {
    name: "zone",
    description: "Height of the folded region at each edge in CSS pixels.",
    type: "number",
    defaultValue: "240",
  },
  {
    name: "angle",
    description:
      "Maximum fold angle in degrees, reached away from the scroll ends. 90 is a cube edge.",
    type: "number",
    defaultValue: "80",
  },
  {
    name: "rounding",
    description:
      "Radius in CSS pixels of the circular arc that rounds each fold crease. 0 keeps a sharp cube edge. Clamped to the zone height.",
    type: "number",
    defaultValue: "150",
  },
  {
    name: "perspective",
    description:
      "Perspective focal length in CSS pixels. Smaller values pinch the folded edges harder.",
    type: "number",
    defaultValue: "700",
  },
  {
    name: "direction",
    description:
      '"out" folds the edges away from the viewer like the outside of a cube, "in" tilts them toward the viewer.',
    type: '"out" | "in"',
    defaultValue: '"in"',
  },
  {
    name: "ease",
    description:
      "Scroll distance in CSS pixels over which an edge flattens near its scroll end.",
    type: "number",
    defaultValue: "240",
  },
  {
    name: "smoothing",
    description:
      "Seconds the bend takes to settle after a scroll. 0 snaps instantly.",
    type: "number",
    defaultValue: "0.1",
  },
  {
    name: "top",
    description: "Bend the top edge.",
    type: "boolean",
    defaultValue: "true",
  },
  {
    name: "bottom",
    description: "Bend the bottom edge.",
    type: "boolean",
    defaultValue: "true",
  },
  {
    name: "tumble",
    description:
      "Overscroll tip strength (0 to 1). Rubber-banding past a scroll end tips the whole face over that edge, then springs back. 0 disables.",
    type: "number",
    defaultValue: "0.5",
  },
  {
    name: "tilt",
    description:
      "Pointer tilt strength (0 to 1). The face leans subtly toward the cursor. 0 disables.",
    type: "number",
    defaultValue: "0.5",
  },
  {
    name: "className",
    description: "Classes applied to the wrapper element.",
    type: "string",
  },
];

export default async function BendPage() {
  const variants = await Promise.all(
    getComponentSources("bend").map(async (file) => ({
      id: file.id,
      label: file.label,
      fileName: file.fileName,
      source: file.source,
      html: await highlight(file.source, file.lang),
    })),
  );

  return (
    <BendDemo>
      <ComponentDoc
        title="Bend"
        description={DESCRIPTION}
        variants={[...variants]}
        installItem="bend"
        tags={["html-in-canvas"]}
        requiresHtmlInCanvas
        apiReference={API_REFERENCE}
        demoSection
        beforeInstall={
          <DemoImageSection
            hint="Scroll to watch the photo bend over the fold along with the rest of the page."
            alt="Demo photo for the Bend effect"
          />
        }
      />
      <div className="mx-auto mt-24 w-full max-w-3xl">
        <Footer variant="docs" />
      </div>
    </BendDemo>
  );
}
