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
import { Shapes } from "@/components/icons";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";

import { COMPONENT_GROUPS } from "@/components/common/component-groups";
import { DURATION, EASE_OUT } from "@/components/common/motion-tokens";
import { SiteLogo } from "@/components/common/site-logo";
import {
  COMPONENTS,
  isLightVideo,
  type ComponentEntry,
} from "@/data/components";
import { cn } from "@/lib/utils";

const PREVIEWS = new Map(COMPONENTS.map((entry) => [entry.href, entry]));
const PREVIEW_W = 224;
const PREVIEW_H = 176;

const HOVER_QUERY = "(hover: hover) and (pointer: fine)";

function subscribeHover(callback: () => void) {
  const mql = window.matchMedia(HOVER_QUERY);
  mql.addEventListener("change", callback);
  return () => mql.removeEventListener("change", callback);
}

interface NavItem {
  href: string;
  label: string;
  isNew?: boolean;
}

interface NavSection {
  title: string;
  count?: number;
  items: NavItem[];
}

const SECTIONS: NavSection[] = [
  {
    title: "Getting Started",
    items: [
      { href: "/docs", label: "Introduction" },
      { href: "/docs/installation", label: "Installation" },
      { href: "/docs/rendering", label: "Rendering" },
      { href: "/docs/mcp", label: "MCP" },
    ],
  },
  {
    title: "Components",
    items: [{ href: "/components", label: "Browse All" }],
  },
  ...COMPONENT_GROUPS.map((group) => ({
    title: group.label,
    count: group.items.length,
    items: group.items.map((entry) => ({
      href: entry.href,
      label: entry.name,
      isNew: entry.isNew,
    })),
  })),
];

function useActiveIndicator(pathname: string) {
  const listRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const lastTop = useRef<number | null>(null);

  const place = (animate: boolean) => {
    const list = listRef.current;
    const indicator = indicatorRef.current;
    if (!list || !indicator) return;
    const active = list.querySelector<HTMLElement>('[aria-current="page"]');
    if (!active) {
      indicator.style.opacity = "0";
      lastTop.current = null;
      return;
    }
    const top = active.offsetTop;
    const height = active.offsetHeight;
    const previous = lastTop.current;
    const far = previous === null || Math.abs(top - previous) > height * 6;

    indicator.style.height = `${height}px`;
    if (animate && !far) {
      indicator.style.transform = `translateY(${top}px)`;
      indicator.style.opacity = "1";
    } else {
      indicator.style.transition = "none";
      indicator.style.transform = `translateY(${top}px)`;
      indicator.style.opacity = animate ? "0" : "1";
      void indicator.offsetWidth;
      indicator.style.transition = "";
      indicator.style.opacity = "1";
    }
    lastTop.current = top;
  };
  const placeRef = useRef(place);
  useLayoutEffect(() => {
    placeRef.current = place;
  });

  useLayoutEffect(() => {
    placeRef.current(lastTop.current !== null);
  }, [pathname]);

  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const observer = new ResizeObserver(() => {
      placeRef.current(false);
    });
    observer.observe(list);
    return () => observer.disconnect();
  }, []);

  return { listRef, indicatorRef };
}

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
  const { listRef, indicatorRef } = useActiveIndicator(pathname);

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
    <div
      ref={listRef}
      className="relative"
      onPointerLeave={enabled ? clearPreview : undefined}
    >
      <span
        ref={indicatorRef}
        aria-hidden
        className="nav-indicator pointer-events-none absolute inset-x-0 top-0 rounded-control bg-muted opacity-0"
      />
      {SECTIONS.map((section) => (
        <div key={section.title} className="mt-5 first:mt-0">
          <p className="flex items-baseline justify-between px-2 pb-1.5 text-[12px] font-medium text-muted-foreground/70">
            {section.title}
            {section.count !== undefined ? (
              <span className="text-[11px] font-normal tabular-nums text-muted-foreground/50">
                {section.count}
              </span>
            ) : null}
          </p>
          <ul className="flex flex-col gap-px">
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
                      "relative flex items-center gap-1.5 rounded-control px-2 py-1.5 text-sm transition-colors duration-150 ease-out",
                      active
                        ? "font-medium text-foreground"
                        : "text-muted-foreground hover:bg-[var(--surface-hover)] hover:text-foreground",
                    )}
                  >
                    {item.label}
                    {item.isNew ? <NewDot /> : null}
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
                animate={{
                  opacity: 1,
                  scale: 1,
                  transition: { duration: DURATION.base, ease: EASE_OUT },
                }}
                exit={
                  shouldReduceMotion
                    ? { opacity: 0, transition: { duration: DURATION.exit } }
                    : {
                        opacity: 0,
                        scale: 0.97,
                        transition: { duration: DURATION.exit, ease: EASE_OUT },
                      }
                }
                style={{ x, y, width: PREVIEW_W, transformOrigin: "0% 50%" }}
                className="pointer-events-none fixed top-0 left-0 z-50"
              >
                <div className="frame shadow-[var(--shadow-popover)]">
                  <video
                    key={preview.video}
                    src={preview.video}
                    autoPlay
                    loop
                    muted
                    playsInline
                    className={cn(
                      "aspect-4/3 w-full rounded-control object-cover",
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

export function NewDot() {
  return (
    <>
      <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-blue-500" />
      <span className="sr-only">New</span>
    </>
  );
}

export function PlaygroundCta({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="p-2">
      <Link
        href="/playground"
        onClick={onNavigate}
        className="pressable flex h-11 items-center justify-center gap-2 rounded-control bg-foreground px-3 text-sm font-medium text-background transition-[opacity,transform] duration-150 hover:opacity-85"
      >
        <Shapes aria-hidden className="size-4" />
        Playground
      </Link>
    </div>
  );
}

export function useScrollFade() {
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

  return [setEl, el] as const;
}

export function centerActiveLink(container: HTMLElement | null) {
  const active = container?.querySelector<HTMLElement>('[aria-current="page"]');
  if (!container || !active) return;
  const box = container.getBoundingClientRect();
  const link = active.getBoundingClientRect();
  container.scrollTop +=
    link.top - box.top - container.clientHeight / 2 + link.height / 2;
}

export function DocsSidebar() {
  const [setScrollEl, scrollEl] = useScrollFade();

  useEffect(() => {
    centerActiveLink(scrollEl);
  }, [scrollEl]);

  return (
    <aside className="surface-floating fixed top-4 bottom-4 left-4 z-40 hidden w-60 flex-col rounded-panel [view-transition-name:docs-sidebar] lg:flex">
      <div className="px-5 pt-5 pb-4">
        <Link
          href="/"
          aria-label="Canvas UI home"
          className="inline-block rounded-sm transition-opacity duration-150 hover:opacity-70"
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
