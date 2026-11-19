"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowLeft, ChevronDown, ChevronsUpDown, X } from "@/components/icons";
import { useEffect, useState } from "react";

import { SiteLogo } from "@/components/common/site-logo";
import { ThemeToggle } from "@/components/common/theme-toggle";
import { PreviewVideo } from "@/components/common/preview-video";
import { useScrollFade } from "@/components/docs/docs-sidebar";
import { PlaygroundActions } from "@/components/playground/playground-actions";
import { PLAYGROUND_DEMOS } from "@/components/playground/demos";
import { DURATION, EASE_OUT } from "@/components/common/motion-tokens";
import { cn } from "@/lib/utils";

const videoFor = (slug: string) => `/assets/videos/${slug}.webm`;

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
  const [setScrollEl] = useScrollFade();
  const [setPickerScrollEl] = useScrollFade();

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
      <aside className="surface-panel fixed top-4 bottom-4 left-4 z-40 hidden w-60 flex-col rounded-panel lg:flex">
        <div className="flex items-center justify-between gap-2 px-3 pt-5 pb-4">
          <Link
            href="/"
            aria-label="Canvas UI home"
            className="inline-block rounded-sm transition-opacity duration-150 hover:opacity-70"
          >
            <SiteLogo />
          </Link>
          <span className="chip font-medium">
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
            className="group frame w-full cursor-pointer text-left transition-[background-color,transform] duration-150 ease-out hover:bg-muted/70 active:scale-[0.99] aria-expanded:bg-muted/70"
          >
            <span className="frame-inset block aspect-video overflow-hidden bg-background">
              <PreviewVideo
                key={active.slug}
                src={videoFor(active.slug)}
                className="h-full w-full object-cover"
              />
            </span>
            <span className="flex items-center justify-between gap-2 px-2 pt-2 pb-1.5">
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
                className="size-3.5 shrink-0 text-muted-foreground transition-colors duration-150 group-hover:text-foreground"
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

        <div className="p-2">
          <Link
            href="/docs"
            className="pressable flex h-11 items-center justify-center gap-2 rounded-control bg-foreground px-3 text-sm font-medium text-background transition-[opacity,transform] duration-150 hover:opacity-85"
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
              animate={{ opacity: 1, transition: { duration: DURATION.base } }}
              exit={{ opacity: 0, transition: { duration: DURATION.exit } }}
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
                  : { opacity: 0, transform: "translateX(-12px) scale(0.99)" }
              }
              animate={{
                opacity: 1,
                transform: "translateX(0px) scale(1)",
                transition: { duration: DURATION.slow, ease: EASE_OUT },
              }}
              exit={
                shouldReduceMotion
                  ? { opacity: 0, transition: { duration: DURATION.exit } }
                  : {
                      opacity: 0,
                      transform: "translateX(-12px) scale(0.99)",
                      transition: { duration: DURATION.fast, ease: EASE_OUT },
                    }
              }
              className="surface-popover fixed top-4 bottom-4 left-[16.5rem] z-50 hidden w-120 max-w-[calc(100vw-18rem)] origin-left flex-col rounded-panel p-0 lg:flex"
            >
              <div className="flex items-center justify-between border-b border-border-subtle py-3 pr-3 pl-5">
                <p className="text-[13px] font-medium tracking-[-0.01em]">
                  Pick a component
                </p>
                <button
                  type="button"
                  onClick={() => setPickerOpen(false)}
                  aria-label="Close picker"
                  className="pressable grid size-7 cursor-pointer place-items-center rounded-md text-muted-foreground transition-[color,background-color,transform] duration-150 hover:bg-[var(--surface-hover)] hover:text-foreground"
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
                        "group frame cursor-pointer text-left transition-[background-color,transform] duration-150 ease-out active:scale-[0.98]",
                        isActive
                          ? "bg-muted"
                          : "hover:bg-muted/70",
                      )}
                    >
                      <span className="frame-inset block aspect-video overflow-hidden bg-background">
                        <PreviewVideo
                          src={videoFor(demo.slug)}
                          className={cn(
                            "h-full w-full object-cover",
                            isActive && "grayscale-0",
                          )}
                        />
                      </span>
                      <span className="block truncate px-2 pt-1.5 pb-1 text-[12.5px] font-medium">
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

      <div className="surface-floating fixed top-4 right-[calc(1rem+var(--demo-sbw,0px))] left-4 z-40 flex items-center gap-2 rounded-panel p-2 lg:hidden">
        <Link
          href="/docs"
          aria-label="Back to Docs"
          className="pressable grid size-9 shrink-0 place-items-center rounded-control text-muted-foreground transition-[color,background-color,transform] duration-150 hover:bg-[var(--surface-hover)] hover:text-foreground"
        >
          <ArrowLeft aria-hidden className="size-4" />
        </Link>
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Pick a component</span>
          <select
            value={activeSlug}
            onChange={(event) => onSelect(event.target.value)}
            className="h-9 w-full cursor-pointer appearance-none truncate rounded-control bg-muted/60 pr-8 pl-2.5 text-[16px] font-medium transition-colors duration-150 hover:border-border-strong sm:text-sm"
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
