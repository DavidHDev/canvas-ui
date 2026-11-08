import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";

import { HtmlInCanvasBanner } from "@/components/common/html-in-canvas-banner";
import { ApiReference, type ApiProp } from "@/components/docs/api-reference";
import { CodeTabs, type CodeVariant } from "@/components/docs/code-tabs";
import { CopyMenu } from "@/components/docs/copy-menu";
import { DependencyTabs } from "@/components/docs/dependency-tabs";
import { highlight } from "@/components/docs/highlight";
import { InstallNote, InstallTabs } from "@/components/docs/install-tabs";
import {
  getComponentDependencies,
  getComponentSources,
  getDemoSource,
} from "@/lib/registry";
import { COMPONENTS } from "@/data/components";
import { cn } from "@/lib/utils";

export interface ComponentDocProps {
  title: string;
  description: string;
  /** Optional boxed demo. Omit when the whole page is the demo. */
  preview?: ReactNode;
  /** Optional extra content rendered before the Install section. */
  beforeInstall?: ReactNode;
  /** Usage guidance included in Copy for AI and Copy as Markdown. */
  usageMarkdown?: string;
  /** One entry per framework, pre-highlighted on the server. */
  variants: CodeVariant[];
  /** Registry item base name, e.g. "liquid" for /r/liquid-react.json. */
  installItem: string;
  /** Small tag chips shown under the description, e.g. ["html-in-canvas"]. */
  tags?: string[];
  /**
   * Show a warning above the demo when Chrome's HTML-in-Canvas flag is off.
   * Set this only for effects that don't render without the flag, not for
   * effects that degrade to a usable fallback.
   */
  requiresHtmlInCanvas?: boolean;
  /** Props table shown in the API reference section. */
  apiReference?: ApiProp[];
}

/** Pre-highlights the WebGPU (vgpu) sources; empty when the component has none. */
async function getWebGPUVariants(installItem: string): Promise<CodeVariant[]> {
  return Promise.all(
    getComponentSources(installItem, "webgpu").map(async (file) => ({
      id: file.id,
      label: file.label,
      fileName: file.fileName,
      source: file.source,
      html: await highlight(file.source, file.lang),
    })),
  );
}

export async function ComponentDoc({
  title,
  description,
  preview,
  beforeInstall,
  usageMarkdown,
  variants,
  installItem,
  tags,
  apiReference,
  requiresHtmlInCanvas = false,
}: ComponentDocProps) {
  const { dependencies, devDependencies } =
    getComponentDependencies(installItem);
  const webgpuDeps = getComponentDependencies(installItem, "webgpu");
  const demoSource = getDemoSource(installItem);
  const webgpuVariants = await getWebGPUVariants(installItem);
  const hasWebGPU = webgpuVariants.length > 0;

  return (
    <article className="mx-auto w-full max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <h1 className="min-w-0 text-3xl font-semibold tracking-[-0.02em]">
          {title}
        </h1>
        <CopyMenu
          title={title}
          description={description}
          installItem={installItem}
          variants={variants}
          webgpuVariants={webgpuVariants}
          apiReference={apiReference}
          dependencies={dependencies}
          devDependencies={devDependencies}
          webgpuDependencies={webgpuDeps.dependencies}
          webgpuDevDependencies={webgpuDeps.devDependencies}
          demoSource={demoSource}
          usageMarkdown={usageMarkdown}
        />
      </div>
      <p className="mt-3 max-w-xl text-base leading-7 text-muted-foreground">
        {description}
      </p>
      {(tags && tags.length > 0) || hasWebGPU ? (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {Array.from(
            new Set([...(tags ?? []), ...(hasWebGPU ? ["webgl", "webgpu"] : [])]),
          ).map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-border/60 px-2.5 py-0.5 text-[11.5px] text-muted-foreground"
            >
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      {requiresHtmlInCanvas ? <HtmlInCanvasBanner /> : null}

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
          Install
        </h2>
        <div className="mt-3">
          <InstallTabs item={installItem} hasWebGPU={hasWebGPU} />
        </div>
        <InstallNote hasWebGPU={hasWebGPU} />
      </section>

      {dependencies.length > 0 || devDependencies.length > 0 || hasWebGPU ? (
        <section className="mt-8" aria-label="Dependencies">
          <h2
            id="dependencies"
            className="scroll-mt-24 text-lg font-semibold tracking-[-0.01em]"
          >
            Dependencies
          </h2>
          <p className="mt-2 text-[13px] text-muted-foreground">
            The install command above adds these automatically. If you copy the
            source by hand, install them yourself.
          </p>
          <div className="mt-3">
            <DependencyTabs
              dependencies={dependencies}
              devDependencies={devDependencies}
              webgpuDependencies={hasWebGPU ? webgpuDeps.dependencies : undefined}
              webgpuDevDependencies={
                hasWebGPU ? webgpuDeps.devDependencies : undefined
              }
            />
          </div>
        </section>
      ) : null}

      <section className="mt-8" aria-label="Code">
        <h2
          id="code"
          className="scroll-mt-24 text-lg font-semibold tracking-[-0.01em]"
        >
          Code
        </h2>
        <div className="mt-3">
          <CodeTabs variants={variants} webgpuVariants={webgpuVariants} />
        </div>
      </section>

      {apiReference && apiReference.length > 0 ? (
        <section className="mt-8" aria-label="API reference">
          <h2
            id="api-reference"
            className="scroll-mt-24 text-lg font-semibold tracking-[-0.01em]"
          >
            API reference
          </h2>
          <div className="mt-3">
            <ApiReference props={apiReference} />
          </div>
        </section>
      ) : null}

      <ComponentPager slug={installItem} />
    </article>
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
      className="not-typeset mt-12 grid grid-cols-1 gap-3 border-t border-border/60 pt-6 sm:grid-cols-2"
    >
      {prev ? <PagerLink entry={prev} direction="prev" /> : null}
      {next ? <PagerLink entry={next} direction="next" /> : null}
    </nav>
  );
}

function PagerLink({
  entry,
  direction,
}: {
  entry: (typeof COMPONENTS)[number];
  direction: "prev" | "next";
}) {
  const isPrev = direction === "prev";
  const Arrow = isPrev ? ArrowLeft : ArrowRight;

  const arrow = (
    <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-colors duration-150 group-hover:border-foreground/20 group-hover:text-foreground">
      <Arrow
        aria-hidden
        className={cn(
          "size-4 transition-transform duration-200 ease-out",
          isPrev ? "group-hover:-translate-x-0.5" : "group-hover:translate-x-0.5",
        )}
      />
    </span>
  );

  return (
    <Link
      href={entry.href}
      rel={direction}
      className={cn(
        "group flex min-w-0 items-center gap-3 rounded-xl border border-border/60 px-4 py-3.5 transition-colors duration-150 hover:border-border hover:bg-muted/30",
        !isPrev && "text-right sm:col-start-2",
      )}
    >
      {isPrev ? arrow : null}
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-medium tracking-wide text-muted-foreground uppercase">
          {isPrev ? "Previous" : "Next"}
        </span>
        <span className="mt-0.5 block truncate text-sm font-medium text-foreground">
          {entry.name}
        </span>
      </span>
      {isPrev ? null : arrow}
    </Link>
  );
}
