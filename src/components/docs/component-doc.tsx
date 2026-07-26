import type { ReactNode } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";

import { HtmlInCanvasBanner } from "@/components/common/html-in-canvas-banner";
import { ApiReference, type ApiProp } from "@/components/docs/api-reference";
import { CodeTabs, type CodeVariant } from "@/components/docs/code-tabs";
import { CopyMenu } from "@/components/docs/copy-menu";
import { DependencyTabs } from "@/components/docs/dependency-tabs";
import { InstallTabs } from "@/components/docs/install-tabs";
import type { TOCItemType } from "@/components/docs/toc-minimap";
import { TOCSetter } from "@/components/docs/toc-layout";
import { HeadingAnchor } from "@/components/docs/heading-anchor";
import { getComponentDependencies, getDemoSource } from "@/lib/registry";
import { COMPONENTS } from "@/data/components";
import { TOCMobile } from "./toc-mobile";

export interface ComponentDocProps {
  title: string;
  description: string;
  /** Optional boxed demo. Omit when the whole page is the demo. */
  preview?: ReactNode;
  /** Optional extra content rendered before the Install section. */
  beforeInstall?: ReactNode;
  /** One entry per framework, pre-highlighted on the server. */
  variants: CodeVariant[];
  /** Registry item base name, e.g. "liquid" for /r/liquid-react.json. */
  installItem: string;
  /** Small tag chips shown under the description, e.g. ["html-in-canvas"]. */
  tags?: string[];
  /**
   * Show a warning above the demo when Chrome's HTML-in-Canvas flag is off.
   * Set this only for effects that don't render without the flag — not for
   * effects that degrade to a usable fallback.
   */
  requiresHtmlInCanvas?: boolean;
  /** Props table shown in the API reference section. */
  apiReference?: ApiProp[];
  /**
   * Add a "Demo" entry at the top of the auto-generated TOC minimap.
   * Set true when beforeInstall contains a section with id="demo".
   */
  demoSection?: boolean;
}

export function ComponentDoc({
  title,
  description,
  preview,
  beforeInstall,
  variants,
  installItem,
  tags,
  apiReference,
  demoSection = false,
  requiresHtmlInCanvas = false,
}: ComponentDocProps) {
  const { dependencies, devDependencies } =
    getComponentDependencies(installItem);
  const demoSource = getDemoSource(installItem);

  const hasDependencies = dependencies.length > 0 || devDependencies.length > 0;
  const hasApiReference = !!apiReference && apiReference.length > 0;
  const toc: TOCItemType[] = [
    ...(demoSection ? [{ title: "Demo", url: "#demo", depth: 2 }] : []),
    { title: "Install", url: "#install", depth: 2 },
    ...(hasDependencies
      ? [{ title: "Dependencies", url: "#dependencies", depth: 2 }]
      : []),
    { title: "Code", url: "#code", depth: 2 },
    ...(hasApiReference
      ? [{ title: "API reference", url: "#api-reference", depth: 2 }]
      : []),
  ];

  return (
    <>
      <article className="mx-auto w-full max-w-3xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-[-0.02em]">
              {title}
            </h1>
            <p className="mt-3 max-w-xl text-base leading-7 text-muted-foreground">
              {description}
            </p>
            {tags && tags.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded-full border border-border/60 px-2.5 py-0.5 text-[11.5px] text-muted-foreground"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
          <CopyMenu
            title={title}
            description={description}
            installItem={installItem}
            variants={variants}
            apiReference={apiReference}
            dependencies={dependencies}
            devDependencies={devDependencies}
            demoSource={demoSource}
          />
        </div>

        {requiresHtmlInCanvas ? <HtmlInCanvasBanner /> : null}

        <TOCMobile items={toc} />

        {preview ? (
          <section className="mt-8" aria-label="Preview">
            <div className="relative h-105 touch-none overflow-hidden rounded-xl border border-border/60 bg-background">
              {preview}
            </div>
          </section>
        ) : null}

        {beforeInstall}

        <section className="mt-8" aria-label="Installation">
          <h2
            id="install"
            className="scroll-mt-24 text-lg font-semibold tracking-[-0.01em]"
          >
            <HeadingAnchor id="install">Install</HeadingAnchor>
          </h2>
          <div className="mt-3">
            <InstallTabs item={installItem} />
          </div>
          <p className="mt-2 text-[13px] text-muted-foreground">
            Or copy the source below into your project.
          </p>
        </section>

        {dependencies.length > 0 || devDependencies.length > 0 ? (
          <section className="mt-8" aria-label="Dependencies">
            <h2
              id="dependencies"
              className="scroll-mt-24 text-lg font-semibold tracking-[-0.01em]"
            >
              <HeadingAnchor id="dependencies">Dependencies</HeadingAnchor>
            </h2>
            <p className="mt-2 text-[13px] text-muted-foreground">
              The install command above adds these automatically. If you copy
              the source by hand, install them yourself.
            </p>
            <div className="mt-3">
              <DependencyTabs
                dependencies={dependencies}
                devDependencies={devDependencies}
              />
            </div>
          </section>
        ) : null}

        <section className="mt-8" aria-label="Code">
          <h2
            id="code"
            className="scroll-mt-24 text-lg font-semibold tracking-[-0.01em]"
          >
            <HeadingAnchor id="code">Code</HeadingAnchor>
          </h2>
          <div className="mt-3">
            <CodeTabs variants={variants} />
          </div>
        </section>

        {apiReference && apiReference.length > 0 ? (
          <section className="mt-8" aria-label="API reference">
            <h2
              id="api-reference"
              className="scroll-mt-24 text-lg font-semibold tracking-[-0.01em]"
            >
              <HeadingAnchor id="api-reference">API reference</HeadingAnchor>
            </h2>
            <div className="mt-3">
              <ApiReference props={apiReference} />
            </div>
          </section>
        ) : null}

        <ComponentPager slug={installItem} />
      </article>

      <TOCSetter items={toc} />
    </>
  );
}

function ComponentPager({ slug }: { slug: string }) {
  const index = COMPONENTS.findIndex(
    (entry) => entry.href === `/docs/components/${slug}`,
  );
  if (index === -1) return null;
  const prev = index > 0 ? COMPONENTS[index - 1] : null;
  const next = index < COMPONENTS.length - 1 ? COMPONENTS[index + 1] : null;

  return (
    <nav
      aria-label="Component pagination"
      className="not-typeset mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2"
    >
      {prev ? (
        <Link
          href={prev.href}
          rel="prev"
          className="group min-w-0 rounded-xl border border-border/60 p-4 transition-colors duration-150 hover:bg-muted/40"
        >
          <span className="flex items-center gap-2 text-sm font-medium text-foreground">
            <ChevronLeft
              aria-hidden
              className="-mx-1 size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out group-hover:-translate-x-0.5"
            />
            {prev.name}
          </span>
          <span className="mt-1 block truncate text-[13px] text-muted-foreground">
            {prev.description}
          </span>
        </Link>
      ) : null}
      {next ? (
        <Link
          href={next.href}
          rel="next"
          className="group min-w-0 rounded-xl border border-border/60 p-4 transition-colors duration-150 hover:bg-muted/40 sm:col-start-2"
        >
          <span className="flex items-center justify-end gap-2 text-sm font-medium text-foreground">
            {next.name}
            <ChevronRight
              aria-hidden
              className="-mx-1 size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out group-hover:translate-x-0.5"
            />
          </span>
          <span className="mt-1 block truncate text-[13px] text-muted-foreground">
            {next.description}
          </span>
        </Link>
      ) : null}
    </nav>
  );
}
