import type { Metadata } from "next";

import { ComponentCatalogue } from "@/components/docs/component-catalogue";
import { Footer } from "@/components/landing/footer";

export const metadata: Metadata = {
  title: "Components",
  description:
    "Browse the Canvas UI components. Creative canvas effects for React, Solid, Preact, Vue, Svelte, and vanilla JS, each available as a WebGL or WebGPU (vgpu) build.",
  alternates: { canonical: "/components" },
};

export default function ComponentsPage() {
  return (
    <article data-wide-page className="page-enter mx-auto w-full max-w-5xl">
      <h1 className="text-3xl leading-[1.15] font-medium tracking-tighter text-balance">
        Components
      </h1>
      <p className="mt-3 max-w-xl text-base leading-7 text-pretty text-muted-foreground">
        Creative components you can drop into any project. Browse the collection
        and make them yours. More on the way.
      </p>

      <ComponentCatalogue />

      <div className="mt-24">
        <Footer variant="docs" />
      </div>
    </article>
  );
}
