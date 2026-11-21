import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "@/components/icons";

import { HtmlInCanvasBanner } from "@/components/common/html-in-canvas-banner";
import { ApiReference, type ApiProp } from "@/components/docs/api-reference";
import { CodeTabs, type CodeVariant } from "@/components/docs/code-tabs";
import { CopyMenu } from "@/components/docs/copy-menu";
import { DemoStage } from "@/components/demos/demo-stage";
import { DependencyTabs } from "@/components/docs/dependency-tabs";
import { highlight } from "@/components/docs/highlight";
import { InstallNote, InstallTabs } from "@/components/docs/install-tabs";
import { getDemoSource } from "@/lib/demo-source";
import { getComponentDependencies, getComponentSources } from "@/lib/registry";
import {
  getComponent,
  ORDERED_COMPONENTS,
} from "@/components/common/component-groups";
import { SUPPORT_META, type ComponentEntry } from "@/data/components";
import { cn } from "@/lib/utils";

export interface ComponentDocProps {
  title: string;
  description: string;
  preview?: ReactNode;
  beforeInstall?: ReactNode;
  usageMarkdown?: string;
  variants: CodeVariant[];
  installItem: string;
  tags?: string[];
  requiresHtmlInCanvas?: boolean;
  apiReference?: ApiProp[];
}

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
  const demoSource = getDemoSource(installItem, title);
  const webgpuVariants = await getWebGPUVariants(installItem);
  const hasWebGPU = webgpuVariants.length > 0;
  const entry = getComponent(`/docs/components/${installItem}`);
  const support = entry ? SUPPORT_META[entry.support] : null;
  const chips = Array.from(
    new Set([...(tags ?? []), ...(hasWebGPU ? ["webgl", "webgpu"] : [])]),
  ).filter((tag) => !support?.labels.includes(tag));

  return (
    <article data-wide-page="" className="mx-auto w-full max-w-4xl">
      <div className="flex items-start justify-between gap-4">
        <h1 className="min-w-0 text-3xl leading-[1.15] font-medium tracking-tighter text-balance">
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
      <p className="mt-3 max-w-xl text-base leading-7 text-pretty text-muted-foreground">
        {description}
      </p>
      {support || chips.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {support?.labels.map((label) => (
            <span
              key={label}
              title={support.title}
              className="chip font-medium text-foreground/80"
            >
              {label}
            </span>
          ))}
          {chips.map((tag) => (
            <span key={tag} className="chip">
              {tag}
            </span>
          ))}
        </div>
      ) : null}

      {requiresHtmlInCanvas ? <HtmlInCanvasBanner /> : null}

      {preview ? (
        <DemoStage
          title={title}
          htmlInCanvas={tags?.includes("html-in-canvas") ?? false}
          requiresHtmlInCanvas={requiresHtmlInCanvas}
        >
          {preview}
        </DemoStage>
      ) : null}

      {beforeInstall}

      <section className="mt-12" aria-label="Installation">
        <h2
          id="install"
          className="scroll-mt-24 text-xl font-medium tracking-tight"
        >
          Install
        </h2>
        <div className="mt-3">
          <InstallTabs item={installItem} hasWebGPU={hasWebGPU} />
        </div>
        <InstallNote hasWebGPU={hasWebGPU} />
      </section>

      {dependencies.length > 0 || devDependencies.length > 0 || hasWebGPU ? (
        <section className="mt-12" aria-label="Dependencies">
          <h2
            id="dependencies"
            className="scroll-mt-24 text-xl font-medium tracking-tight"
          >
            Dependencies
          </h2>
          <p className="mt-1.5 text-[13px] leading-5 text-muted-foreground">
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

      <section className="mt-12" aria-label="Code">
        <h2
          id="code"
          className="scroll-mt-24 text-xl font-medium tracking-tight"
        >
          Code
        </h2>
        <div className="mt-3">
          <CodeTabs variants={variants} webgpuVariants={webgpuVariants} />
        </div>
      </section>

      {apiReference && apiReference.length > 0 ? (
        <section className="mt-12" aria-label="API reference">
          <h2
            id="api-reference"
            className="scroll-mt-24 text-xl font-medium tracking-tight"
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
  const index = ORDERED_COMPONENTS.findIndex(
    (entry) => entry.href === `/docs/components/${slug}`,
  );
  if (index === -1) return null;
  const prev = index > 0 ? ORDERED_COMPONENTS[index - 1] : null;
  const next =
    index < ORDERED_COMPONENTS.length - 1 ? ORDERED_COMPONENTS[index + 1] : null;

  return (
    <nav
      aria-label="Component pagination"
      className="not-typeset mt-16 grid grid-cols-1 gap-3 sm:grid-cols-2"
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
  entry: ComponentEntry;
  direction: "prev" | "next";
}) {
  const isPrev = direction === "prev";
  const Arrow = isPrev ? ArrowLeft : ArrowRight;

  return (
    <Link
      href={entry.href}
      rel={direction}
      className={cn(
        "group frame block min-w-0 transition-[background-color,transform] duration-150 ease-out hover:bg-muted/70 active:scale-[0.99]",
        !isPrev && "text-right sm:col-start-2",
      )}
    >
      <span className="frame-inset flex min-w-0 flex-col px-4 py-3.5 transition-colors duration-150 ease-out group-hover:bg-muted/70">
        <span
          className={cn(
            "flex items-center gap-1.5 text-[13px] text-muted-foreground transition-colors duration-150 group-hover:text-foreground",
            !isPrev && "flex-row-reverse",
          )}
        >
          <Arrow
            aria-hidden
            className={cn(
              "size-3.5 shrink-0 transition-transform duration-200 ease-out motion-reduce:transition-none",
              isPrev ? "group-hover:-translate-x-0.5" : "group-hover:translate-x-0.5",
            )}
          />
          {isPrev ? "Previous" : "Next"}
        </span>
        <span className="mt-1 truncate text-[15px] font-medium tracking-tight text-foreground">
          {entry.name}
        </span>
      </span>
    </Link>
  );
}
