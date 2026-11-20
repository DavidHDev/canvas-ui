"use client";

import { Check, Copy } from "@/components/icons";
import { useState } from "react";

import { CATEGORY_META, COMPONENTS } from "@/data/components";
import { photoSrcSet, photoUrl } from "@/lib/demo-photo";
import { cn } from "@/lib/utils";

export { PHOTOS, photoUrl, type PhotoTone } from "@/lib/demo-photo";

function ThemedPhoto({
  index,
  sizes,
  className,
}: {
  index: number;
  sizes?: string;
  className?: string;
}) {
  return (
    <>
      {(["light", "dark"] as const).map((tone) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={tone}
          src={photoUrl(index, tone)}
          srcSet={sizes ? photoSrcSet(index, tone) : undefined}
          sizes={sizes}
          alt=""
          crossOrigin="anonymous"
          draggable={false}
          className={cn(className, tone === "light" ? "dark:hidden" : "hidden dark:block")}
        />
      ))}
    </>
  );
}

export function entryFor(slug: string) {
  const entry = COMPONENTS.find((item) => item.href.endsWith(`/${slug}`));
  if (!entry) throw new Error(`scenes: no component "${slug}" in src/data/components.ts`);
  return entry;
}

function Tags({ slug, className }: { slug: string; className?: string }) {
  const entry = entryFor(slug);
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {[CATEGORY_META[entry.category].label, "WebGL", "WebGPU"].map((tag) => (
        <span key={tag} className="chip">
          {tag}
        </span>
      ))}
    </div>
  );
}

function InstallCommand({ slug, className }: { slug: string; className?: string }) {
  const command = `npx shadcn@latest add @canvas-ui/${slug}-react`;
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {}
  };
  return (
    <div className={cn("frame w-full", className)}>
      <div className="frame-inset flex h-10 items-center gap-2 pr-1 pl-3.5">
        <code className="min-w-0 flex-1 overflow-x-auto font-mono text-[12px] whitespace-nowrap text-foreground/90 [scrollbar-width:none]">
          {command}
        </code>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? "Copied" : "Copy install command"}
          className="pressable inline-grid size-8 shrink-0 cursor-pointer place-items-center rounded-control text-muted-foreground transition-colors duration-150 ease-out hover:bg-muted/60 hover:text-foreground"
        >
          {copied ? (
            <Check aria-hidden className="size-3.5" />
          ) : (
            <Copy aria-hidden className="size-3.5" />
          )}
        </button>
      </div>
    </div>
  );
}

function Photo({ index, className }: { index: number; className?: string }) {
  return (
    <figure className={cn("frame overflow-hidden", className)}>
      <ThemedPhoto index={index} className="h-full w-full rounded-control object-cover" />
    </figure>
  );
}

export interface DocsSceneProps {
  slug: string;
  photo?: number;
  className?: string;
}

export function DocsScene({ slug, photo: index = 0, className }: DocsSceneProps) {
  const entry = entryFor(slug);
  return (
    <div
      className={cn(
        "@container relative flex h-full min-h-full w-full items-center overflow-hidden bg-background text-left text-foreground",
        className,
      )}
    >
      <div className="mx-auto grid w-full max-w-[76rem] grid-cols-1 items-center gap-6 px-6 pt-6 pb-14 @2xl:grid-cols-[1.4fr_1fr] @2xl:gap-12 @2xl:px-12 @2xl:py-10 @6xl:gap-20 @6xl:px-16">
        <Photo
          index={index}
          className="aspect-[2/1] @2xl:order-2 @2xl:aspect-[4/5] @2xl:max-h-[27rem] @6xl:max-h-[40rem]"
        />
        <div className="flex min-w-0 flex-col items-start">
          <h2 className="text-[32px] leading-[1.02] font-medium tracking-[-0.035em] @2xl:text-[48px] @6xl:text-[76px] @6xl:tracking-[-0.045em]">
            {entry.name}
          </h2>
          <p className="mt-3 max-w-[36ch] text-[14px] leading-6 text-pretty text-muted-foreground @2xl:text-[15.5px] @2xl:leading-7 @6xl:mt-5 @6xl:text-[19px] @6xl:leading-8">
            {entry.description}
          </p>
          <Tags slug={slug} className="mt-4 hidden @md:flex @6xl:mt-6" />
          <InstallCommand
            slug={slug}
            className="mt-6 hidden max-w-[32rem] @md:block @2xl:mt-8 @6xl:mt-10"
          />
        </div>
      </div>
    </div>
  );
}

export function PhotoScene({ photo: index = 0, className }: DocsSceneProps) {
  return (
    <div
      className={cn(
        "@container relative h-full min-h-full w-full overflow-hidden bg-background",
        className,
      )}
    >
      <ThemedPhoto
        index={index}
        sizes="100vw"
        className="absolute inset-0 h-full w-full object-cover"
      />
    </div>
  );
}

export function PageDemoPhoto({ photo: index = 0 }: { photo?: number }) {
  return (
    <figure className="frame mt-8 overflow-hidden">
      <ThemedPhoto
        index={index}
        sizes="(min-width: 1024px) 56rem, 100vw"
        className="aspect-[16/9] w-full rounded-control object-cover"
      />
    </figure>
  );
}
