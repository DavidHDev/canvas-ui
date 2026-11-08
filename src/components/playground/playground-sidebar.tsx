"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ChevronDown, ChevronsUpDown, X } from "lucide-react";
import { useEffect, useLayoutEffect, useState } from "react";

import { SiteLogo } from "@/components/common/site-logo";
import { ThemeToggle } from "@/components/common/theme-toggle";
import { PreviewVideo } from "@/components/common/preview-video";
import { PlaygroundActions } from "@/components/playground/playground-actions";
import { PLAYGROUND_DEMOS } from "@/components/playground/demos";
import { cn } from "@/lib/utils";

const EASE = [0.23, 1, 0.32, 1] as const;

const videoFor = (slug: string) => `/assets/videos/${slug}.webm`;

function useScrollFade() {
  const [el, setEl] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    if (!el) return;
    const update = () => {
      const top = el.scrollTop > 4;
      const bottom = el.scrollHeight - el.clientHeight - el.scrollTop > 4;
      el.style.setProperty("--fade-top", top ? "1" : "0");
      el.style.setProperty("--fade-bottom", bottom ? "1" : "0");
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [el]);
  return setEl;
}

export function PlaygroundSidebar({
  activeSlug,
  onSelect,
  onControlsHostChange,
}: {
  activeSlug: string;
  onSelect: (slug: string) => void;
  onControlsHostChange: (el: HTMLElement | null) => void;
}) {
  const shouldReduceMotion = useReducedMotion();
  const [pickerOpen, setPickerOpen] = useState(false);
  const setScrollEl = useScrollFade();
  const setPickerScrollEl = useScrollFade();

  const active = PLAYGROUND_DEMOS.find((demo) => demo.slug === activeSlug)!;

  useEffect(() => {
    if (!pickerOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPickerOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickerOpen]);

  const pick = (slug: string) => {
    setPickerOpen(false);
    onSelect(slug);
  };

  return (
    <>
      <aside className="fixed top-4 bottom-4 left-4 z-40 hidden w-60 flex-col rounded-2xl border border-border/60 bg-background/70 backdrop-blur-xl backdrop-saturate-150 lg:flex">
        <div className="flex items-center justify-between gap-2 px-3 pt-5 pb-4">
          <Link
            href="/"
            aria-label="Canvas UI home"
            className="inline-block transition-opacity duration-150 hover:opacity-70"
          >
            <SiteLogo />
          </Link>
          <span className="rounded-full border border-border px-3 py-1 text-[12px] font-semibold tracking-tight text-muted-foreground">
            Playground
          </span>
        </div>

        <div className="px-3 pb-3">
          <p className="pb-1.5 text-[12px] font-medium text-muted-foreground/70">
            Component
          </p>
          <button
            type="button"
            data-preview-card
            aria-expanded={pickerOpen}
            aria-haspopup="dialog"
            onClick={() => setPickerOpen((prev) => !prev)}
            className="group w-full cursor-pointer rounded-xl border border-border/60 bg-muted/30 p-2 text-left transition-colors hover:bg-muted/60"
          >
            <span className="block aspect-video overflow-hidden rounded-lg bg-muted/60">
              <PreviewVideo
                key={active.slug}
                src={videoFor(active.slug)}
                className="h-full w-full object-cover"
              />
            </span>
            <span className="mt-2 flex items-center justify-between gap-2 px-1 pb-0.5">
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium">
                  {active.name}
                </span>
                <span className="block truncate text-[11.5px] text-muted-foreground">
                  {active.description}
                </span>
              </span>
              <ChevronsUpDown
                aria-hidden
                className="size-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
              />
            </span>
          </button>
        </div>

        <PlaygroundActions
          slug={active.slug}
          name={active.name}
          description={active.description}
        />

        <div
          ref={setScrollEl}
          className="demo-controls-scroll docs-sidebar-scroll flex-1 overflow-y-auto px-3 pb-3"
        >
          <div ref={onControlsHostChange} />
        </div>

        <div className="border-t border-border/50 p-2">
          <Link
            href="/docs"
            className="flex items-center justify-center gap-2 rounded-[calc(1rem-0.5rem)] bg-foreground px-3 py-3 text-sm font-medium text-background transition-opacity duration-150 hover:opacity-85"
          >
            <ArrowLeft aria-hidden className="size-4" />
            Back to Docs
          </Link>
        </div>
      </aside>

      <AnimatePresence>
        {pickerOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              aria-hidden
              onClick={() => setPickerOpen(false)}
              className="fixed inset-0 z-40 hidden bg-black/10 lg:block"
            />
            <motion.div
              role="dialog"
              aria-label="Pick a component"
              initial={
                shouldReduceMotion
                  ? { opacity: 0 }
                  : { opacity: 0, x: -12, scale: 0.99 }
              }
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={
                shouldReduceMotion
                  ? { opacity: 0 }
                  : { opacity: 0, x: -12, scale: 0.99 }
              }
              transition={{ duration: 0.3, ease: EASE }}
              className="fixed top-4 bottom-4 left-[16.5rem] z-50 hidden w-120 max-w-[calc(100vw-18rem)] flex-col rounded-2xl border border-border/60 bg-background/85 shadow-xl shadow-black/5 backdrop-blur-xl backdrop-saturate-150 lg:flex"
            >
              <div className="flex items-center justify-between border-b border-border/50 py-3 pr-3 pl-5">
                <p className="text-[13px] font-semibold tracking-[-0.01em]">
                  Pick a component
                </p>
                <button
                  type="button"
                  onClick={() => setPickerOpen(false)}
                  aria-label="Close picker"
                  className="grid size-7 cursor-pointer place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
                >
                  <X aria-hidden className="size-3.5" />
                </button>
              </div>
              <div
                ref={setPickerScrollEl}
                className="demo-controls-scroll docs-sidebar-scroll mr-1.5 grid flex-1 auto-rows-min grid-cols-2 gap-2 overflow-y-auto py-3 pr-1.5 pl-3"
              >
                {PLAYGROUND_DEMOS.map((demo) => {
                  const isActive = demo.slug === activeSlug;
                  return (
                    <button
                      key={demo.slug}
                      type="button"
                      data-preview-card
                      aria-current={isActive ? "true" : undefined}
                      onClick={() => pick(demo.slug)}
                      className={cn(
                        "group cursor-pointer rounded-xl border p-1.5 text-left transition-colors",
                        isActive
                          ? "border-foreground/40 bg-muted/60"
                          : "border-border/50 bg-muted/20 hover:bg-muted/50",
                      )}
                    >
                      <span className="block aspect-video overflow-hidden rounded-lg bg-muted/60">
                        <PreviewVideo
                          src={videoFor(demo.slug)}
                          className={cn(
                            "h-full w-full object-cover",
                            isActive && "grayscale-0",
                          )}
                        />
                      </span>
                      <span className="mt-1.5 block truncate px-1 pb-0.5 text-[12.5px] font-medium">
                        {demo.name}
                      </span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="fixed top-4 right-[calc(1rem+var(--demo-sbw,0px))] left-4 z-40 flex items-center gap-2 rounded-2xl border border-border/60 bg-background/70 p-2 backdrop-blur-xl backdrop-saturate-150 lg:hidden">
        <Link
          href="/docs"
          aria-label="Back to Docs"
          className="grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground transition-colors duration-150 hover:bg-muted/60 hover:text-foreground"
        >
          <ArrowLeft aria-hidden className="size-4" />
        </Link>
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Pick a component</span>
          <select
            value={activeSlug}
            onChange={(event) => onSelect(event.target.value)}
            className="h-9 w-full cursor-pointer appearance-none truncate rounded-lg border border-border/60 bg-background pr-8 pl-2.5 text-sm font-medium"
          >
            {PLAYGROUND_DEMOS.map((demo) => (
              <option key={demo.slug} value={demo.slug}>
                {demo.name}
              </option>
            ))}
          </select>
          <ChevronDown
            aria-hidden
            className="pointer-events-none absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
        </label>
        <ThemeToggle />
      </div>
    </>
  );
}
