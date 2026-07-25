import type { Metadata } from "next";
import Link from "next/link";

import { Footer } from "@/components/landing/footer";
import { PreviewVideo } from "@/components/common/preview-video";
import { COMPONENTS } from "@/data/components";

export const metadata: Metadata = {
  title: "Components",
  description:
    "Browse the Canvas UI components. Creative canvas effects for React, Solid, Preact, Lit, Vue, Svelte, and vanilla JS.",
  alternates: { canonical: "/components" },
};

export default function ComponentsPage() {
  return (
    <article className="page-enter mx-auto w-full max-w-5xl">
      <h1 className="text-3xl font-semibold tracking-[-0.02em]">Components</h1>
      <p className="mt-3 max-w-xl text-base leading-7 text-balance text-muted-foreground">
        Creative components you can drop into any project. Browse the collection
        and make them yours. More on the way.
      </p>

      <ul className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {COMPONENTS.map((component) => (
          <li key={component.href}>
            <Link
              href={component.href}
              className="group flex h-full flex-col rounded-2xl border border-border/60 bg-muted/30 p-2 transition-colors duration-150 hover:bg-muted/50"
            >
              <div className="relative flex aspect-4/3 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-border/70 bg-background/60">
                <PreviewVideo
                  src={component.video}
                  className="absolute inset-0 size-full object-cover"
                />
              </div>
              <div className="px-2.5 pt-3.5 pb-2.5">
                <h2 className="text-[15px] font-medium tracking-tight">
                  {component.name}
                </h2>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  {component.description}
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>

      <div className="mt-24">
        <Footer variant="docs" />
      </div>
    </article>
  );
}
