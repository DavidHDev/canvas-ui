"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
} from "motion/react";
import { Shapes } from "lucide-react";
import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { SiteLogo } from "@/components/common/site-logo";
import {
  COMPONENTS,
  isLightVideo,
  type ComponentEntry,
} from "@/data/components";
import { cn } from "@/lib/utils";

const PREVIEWS = new Map(COMPONENTS.map((entry) => [entry.href, entry]));
const PREVIEW_W = 224;
const PREVIEW_H = 168;
const EASE = [0.23, 1, 0.32, 1] as const;

const HOVER_QUERY = "(hover: hover) and (pointer: fine)";

const NEW_HREFS = new Set([
  "/docs/components/ascii-object",
  "/docs/components/canvas",
  "/docs/components/decrypt-reveal",
  "/docs/components/displacement",
  "/docs/components/flame-wrap",
  "/docs/components/force-field",
  "/docs/components/glyph-rain",
  "/docs/components/ink-object",
  "/docs/components/liquid-object",
]);

function subscribeHover(callback: () => void) {
  const mql = window.matchMedia(HOVER_QUERY);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

const sections = [
  {
    title: "Getting Started",
    items: [
      { href: "/docs", label: "Introduction" },
      { href: "/docs/installation", label: "Installation" },
      { href: "/docs/mcp", label: "MCP" },
    ],
  },
  {
    title: "Components",
    items: [
      { href: "/components", label: "Browse All" },
      { href: "/docs/components/ascii-object", label: "ASCII Object" },
      { href: "/docs/components/asciify", label: "Asciify" },
      { href: "/docs/components/bend", label: "Bend" },
      { href: "/docs/components/blaze", label: "Blaze" },
      { href: "/docs/components/bubble", label: "Bubble" },
      { href: "/docs/components/canvas", label: "Canvas" },
      { href: "/docs/components/cloth", label: "Cloth" },
      { href: "/docs/components/clouds", label: "Clouds" },
      { href: "/docs/components/decrypt-reveal", label: "Decrypt Reveal" },
      { href: "/docs/components/dithered-object", label: "Dithered Object" },
      { href: "/docs/components/displacement", label: "Displacement" },
      { href: "/docs/components/droplets", label: "Droplets" },
      { href: "/docs/components/flame-wrap", label: "Flame Wrap" },
      { href: "/docs/components/force-field", label: "Force Field" },
      { href: "/docs/components/frost", label: "Frost" },
      { href: "/docs/components/glass", label: "Glass" },
      { href: "/docs/components/glass-object", label: "Glass Object" },
      { href: "/docs/components/glitch", label: "Glitch" },
      { href: "/docs/components/glyph-rain", label: "Glyph Rain" },
      { href: "/docs/components/grid", label: "Grid" },
      { href: "/docs/components/hex-float", label: "Hex Float" },
      { href: "/docs/components/ink-object", label: "Ink Object" },
      { href: "/docs/components/laser", label: "Laser" },
      { href: "/docs/components/liquid", label: "Liquid" },
      { href: "/docs/components/magnify", label: "Magnify" },
      { href: "/docs/components/particle-object", label: "Particle Object" },
      { href: "/docs/components/particle-reveal", label: "Particle Reveal" },
      { href: "/docs/components/particle-scroll", label: "Particle Scroll" },
      { href: "/docs/components/peel", label: "Peel" },
      { href: "/docs/components/retro-dither", label: "Retro Dither" },
      { href: "/docs/components/ripple", label: "Ripple" },
      { href: "/docs/components/shatter", label: "Shatter" },
      { href: "/docs/components/liquid-object", label: "Liquid Object" },
      { href: "/docs/components/vhs", label: "VHS" },
    ],
  },
] as const;

export function DocsNavList({
  onNavigate,
  showPreviews = false,
}: {
  onNavigate?: () => void;
  showPreviews?: boolean;
}) {
  const pathname = usePathname();
  const shouldReduceMotion = useReducedMotion();
  const [preview, setPreview] = useState<ComponentEntry | null>(null);
  const activeRef = useRef(false);
  const canHover = useSyncExternalStore(
    subscribeHover,
    () => window.matchMedia(HOVER_QUERY).matches,
    () => false,
  );

  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 350, damping: 38 });
  const sy = useSpring(my, { stiffness: 350, damping: 38 });
  const x = shouldReduceMotion ? mx : sx;
  const y = shouldReduceMotion ? my : sy;

  const enabled = showPreviews && canHover;

  const place = (event: React.PointerEvent, jump: boolean) => {
    const pad = 12;
    const px = Math.min(
      event.clientX + 20,
      window.innerWidth - PREVIEW_W - pad,
    );
    const py = Math.min(
      Math.max(event.clientY - PREVIEW_H / 2, pad),
      window.innerHeight - PREVIEW_H - pad,
    );
    if (jump) {
      mx.jump(px);
      my.jump(py);
      sx.jump(px);
      sy.jump(py);
    } else {
      mx.set(px);
      my.set(py);
    }
  };

  const clearPreview = () => {
    activeRef.current = false;
    setPreview(null);
  };

  return (
    <div onPointerLeave={enabled ? clearPreview : undefined}>
      {sections.map((section) => (
        <div key={section.title} className="mt-4 first:mt-0">
          <p className="px-2 pb-1.5 text-[12px] font-medium text-muted-foreground/70">
            {section.title}
          </p>
          <ul className="flex flex-col gap-0.5">
            {section.items.map((item) => {
              const active = pathname === item.href;
              const entry = enabled ? PREVIEWS.get(item.href) : undefined;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? "page" : undefined}
                    onClick={onNavigate}
                    onPointerEnter={
                      enabled
                        ? (event) => {
                            if (!entry) {
                              clearPreview();
                              return;
                            }
                            place(event, !activeRef.current);
                            activeRef.current = true;
                            setPreview(entry);
                          }
                        : undefined
                    }
                    onPointerMove={
                      entry ? (event) => place(event, false) : undefined
                    }
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm transition-colors duration-150",
                      active
                        ? "bg-muted font-medium text-foreground"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    )}
                  >
                    {item.label}
                    {NEW_HREFS.has(item.href) && (
                      <>
                        <span
                          aria-hidden
                          className="size-1.5 shrink-0 rounded-full bg-blue-500"
                        />
                        <span className="sr-only">New</span>
                      </>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {enabled &&
        createPortal(
          <AnimatePresence>
            {preview && (
              <motion.div
                key="docs-nav-preview"
                initial={
                  shouldReduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, scale: 0.96 }
                }
                animate={{ opacity: 1, scale: 1 }}
                exit={
                  shouldReduceMotion
                    ? { opacity: 0 }
                    : { opacity: 0, scale: 0.97 }
                }
                transition={{ duration: 0.18, ease: EASE }}
                style={{ x, y, width: PREVIEW_W }}
                className="pointer-events-none fixed top-0 left-0 z-50"
              >
                <div className="overflow-hidden rounded-xl border border-border/60 bg-background shadow-2xl shadow-black/20">
                  <video
                    key={preview.video}
                    src={preview.video}
                    autoPlay
                    loop
                    muted
                    playsInline
                    className={cn(
                      "aspect-4/3 w-full object-cover",
                      isLightVideo(preview.video)
                        ? "dark:invert dark:hue-rotate-180"
                        : "invert hue-rotate-180 dark:invert-0 dark:hue-rotate-0",
                    )}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}

export function PlaygroundCta({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="border-t border-border/50 p-2">
      <Link
        href="/playground"
        onClick={onNavigate}
        className="flex items-center justify-center gap-2 rounded-[calc(1rem-0.5rem)] bg-foreground px-3 py-3 text-sm font-medium text-background transition-opacity duration-150 hover:opacity-85"
      >
        <Shapes aria-hidden className="size-4" />
        Playground
      </Link>
    </div>
  );
}

export function DocsSidebar() {
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const el = scrollEl;
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
  }, [scrollEl]);

  return (
    <aside className="fixed top-4 bottom-4 left-4 z-40 hidden w-60 flex-col rounded-2xl border border-border/60 bg-background/70 backdrop-blur-xl backdrop-saturate-150 [view-transition-name:docs-sidebar] lg:flex">
      <div className="px-5 pt-5 pb-4">
        <Link
          href="/"
          aria-label="Canvas UI home"
          className="inline-block transition-opacity duration-150 hover:opacity-70"
        >
          <SiteLogo />
        </Link>
      </div>

      <nav
        ref={setScrollEl}
        aria-label="Docs"
        className="demo-controls-scroll docs-sidebar-scroll flex-1 overflow-y-auto pr-4 pb-5 pl-3"
      >
        <DocsNavList showPreviews />
      </nav>

      <PlaygroundCta />
    </aside>
  );
}
