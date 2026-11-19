"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { usePathname } from "next/navigation";
import { Info, Maximize2, SlidersHorizontal, X } from "@/components/icons";
import { useReducedMotion } from "motion/react";

import {
  DemoControlsTargetContext,
  DemoPortalContext,
  StageContext,
  useStage,
} from "@/components/demos/demo-context";
import { DURATION, EASE_DRAWER } from "@/components/common/motion-tokens";
import {
  SegmentedControl,
  type SegmentedOption,
} from "@/components/ui/segmented-control";
import { isHtmlInCanvasBlocked } from "@/lib/html-in-canvas";
import { cn } from "@/lib/utils";

const FRAME_RADIUS = 18;
const EXPAND_MS = 480;
const COLLAPSE_MS = 360;
const SWAP_OUT_MS = 110;
const SWAP_IN_MS = 200;
const FADE_MS = DURATION.base * 1000;
const EASE = `cubic-bezier(${EASE_DRAWER.join(", ")})`;
const SM_QUERY = "(min-width: 640px)";

const emptySubscribe = () => () => {};

type PaintableCanvas = HTMLCanvasElement & { requestPaint?: () => void };
let htmlInCanvasSupport: boolean | null = null;

function supportsHtmlInCanvas() {
  if (typeof document === "undefined" || isHtmlInCanvasBlocked()) return false;
  if (htmlInCanvasSupport !== null) return htmlInCanvasSupport;
  const probe = document.createElement("canvas") as PaintableCanvas;
  const ctx = probe.getContext("2d") as
    | (CanvasRenderingContext2D & { drawElementImage?: unknown })
    | null;
  htmlInCanvasSupport = Boolean(
    ctx &&
      typeof ctx.drawElementImage === "function" &&
      typeof probe.requestPaint === "function",
  );
  return htmlInCanvasSupport;
}

type TopLayerElement = HTMLElement & {
  showPopover?: () => void;
  hidePopover?: () => void;
};

function promote(el: TopLayerElement) {
  if (typeof el.showPopover !== "function") return;
  el.setAttribute("popover", "manual");
  try {
    el.showPopover();
  } catch {}
}

function demote(el: TopLayerElement) {
  if (!el.hasAttribute("popover")) return;
  try {
    el.hidePopover?.();
  } catch {}
  el.removeAttribute("popover");
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function focusables(root: HTMLElement) {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => el.offsetParent !== null || el === document.activeElement,
  );
}

let scrollLock: {
  root: string;
  body: string;
  x: number;
  y: number;
} | null = null;

function lockScroll() {
  if (scrollLock) return;
  const root = document.documentElement;
  const { body } = document;
  const gutter = window.innerWidth - root.clientWidth;
  const x = window.scrollX;
  const y = window.scrollY;
  scrollLock = { root: root.style.cssText, body: body.style.cssText, x, y };
  root.style.overflow = "hidden";
  root.style.scrollBehavior = "auto";
  body.style.position = "fixed";
  body.style.top = `${-y}px`;
  body.style.left = `${-x}px`;
  body.style.right = `${gutter}px`;
  if (gutter > 0) root.style.setProperty("--demo-sbw", `${gutter}px`);
}

function unlockScroll() {
  if (!scrollLock) return;
  const root = document.documentElement;
  root.style.cssText = scrollLock.root;
  document.body.style.cssText = scrollLock.body;
  const behavior = root.style.scrollBehavior;
  root.style.scrollBehavior = "auto";
  window.scrollTo(scrollLock.x, scrollLock.y);
  root.style.scrollBehavior = behavior;
  scrollLock = null;
}

export interface DemoStageProps {
  title: string;
  children: ReactNode;
  htmlInCanvas?: boolean;
  requiresHtmlInCanvas?: boolean;
}

export function DemoStage({
  title,
  children,
  htmlInCanvas = false,
  requiresHtmlInCanvas = false,
}: DemoStageProps) {
  const sectionRef = useRef<HTMLElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openRef = useRef(false);
  const layoutRef = useRef<"inline" | "full">("inline");

  const frameRef = useRef<HTMLDivElement | null>(null);
  const [frameEl, setFrameEl] = useState<HTMLDivElement | null>(null);
  const [body, setBody] = useState<HTMLDivElement | null>(null);
  const [panelHost, setPanelHost] = useState<HTMLDivElement | null>(null);
  const [layout, setLayout] = useState<"inline" | "full">("inline");
  const [open, setOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [hasControls, setHasControls] = useState(false);
  const reduceMotion = useReducedMotion() ?? false;

  const supported = useSyncExternalStore(
    emptySubscribe,
    supportsHtmlInCanvas,
    () => true,
  );
  const fallback = (htmlInCanvas || requiresHtmlInCanvas) && !supported;
  const staticFallback = requiresHtmlInCanvas && !supported;

  useEffect(() => {
    if (!panelHost) return;
    const update = () => setHasControls(panelHost.childElementCount > 0);
    update();
    const observer = new MutationObserver(update);
    observer.observe(panelHost, { childList: true });
    return () => observer.disconnect();
  }, [panelHost]);

  const clearTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  const setFrameLayout = (next: "inline" | "full") => {
    layoutRef.current = next;
    flushSync(() => setLayout(next));
  };

  const insetFor = (rect: DOMRect, el: HTMLElement, radius: number) => {
    const width = el.clientWidth;
    const height = el.clientHeight;
    return `inset(${rect.top}px ${width - rect.right}px ${height - rect.bottom}px ${rect.left}px round ${radius}px)`;
  };

  const offsetFor = (rect: DOMRect, el: HTMLElement) => {
    const dx = rect.left + rect.width / 2 - el.clientWidth / 2;
    const dy = rect.top + rect.height / 2 - el.clientHeight / 2;
    return `translate(${dx}px, ${dy}px)`;
  };

  const finishCollapse = (fadeIn = false) => {
    const frame = frameRef.current;
    const section = sectionRef.current;
    const inner = innerRef.current;
    if (!frame || !inner || !section) return;
    demote(frame);
    frame.style.clipPath = "";
    frame.style.transition = "";
    inner.style.transform = "";
    inner.style.transition = "";
    setFrameLayout("inline");
    section.style.height = "";
    unlockScroll();
    triggerRef.current?.focus({ preventScroll: true });
    if (!fadeIn) {
      frame.style.opacity = "";
      return;
    }
    frame.style.opacity = "0";
    void frame.offsetWidth;
    frame.style.transition = `opacity ${SWAP_IN_MS}ms ease-out`;
    frame.style.opacity = "1";
    timerRef.current = setTimeout(() => {
      frame.style.transition = "";
      frame.style.opacity = "";
    }, SWAP_IN_MS);
  };

  const finishExpand = () => {
    const frame = frameRef.current;
    const inner = innerRef.current;
    if (!frame || !inner) return;
    frame.style.transition = "";
    frame.style.opacity = "";
    inner.style.transition = "";
    inner.style.transform = "";
  };

  const expand = () => {
    const frame = frameRef.current;
    const section = sectionRef.current;
    const inner = innerRef.current;
    if (!frame || !inner || !section || openRef.current) return;
    openRef.current = true;
    setOpen(true);
    clearTimer();

    if (layoutRef.current === "full") {
      if (reduceMotion) {
        frame.style.opacity = "1";
      } else {
        frame.style.transition = `clip-path ${EXPAND_MS}ms ${EASE}, opacity ${SWAP_OUT_MS}ms ease-out`;
        inner.style.transition = `transform ${EXPAND_MS}ms ${EASE}`;
        frame.style.clipPath = `inset(0px 0px 0px 0px round 0px)`;
        inner.style.transform = "translate(0px, 0px)";
        frame.style.opacity = "1";
      }
      timerRef.current = setTimeout(finishExpand, reduceMotion ? FADE_MS : EXPAND_MS);
      closeRef.current?.focus({ preventScroll: true });
      return;
    }

    const rect = frame.getBoundingClientRect();
    section.style.height = `${section.offsetHeight}px`;
    frame.style.opacity = "";
    lockScroll();
    setPanelOpen(window.matchMedia(SM_QUERY).matches);
    setFrameLayout("full");
    promote(frame);

    frame.style.transition = "none";
    inner.style.transition = "none";
    if (reduceMotion) {
      frame.style.opacity = "0";
      void frame.offsetWidth;
      frame.style.transition = `opacity ${FADE_MS}ms ease`;
      frame.style.opacity = "1";
    } else {
      frame.style.clipPath = insetFor(rect, frame, FRAME_RADIUS);
      inner.style.transform = offsetFor(rect, frame);
      void frame.offsetWidth;
      frame.style.transition = `clip-path ${EXPAND_MS}ms ${EASE}`;
      inner.style.transition = `transform ${EXPAND_MS}ms ${EASE}`;
      frame.style.clipPath = `inset(0px 0px 0px 0px round 0px)`;
      inner.style.transform = "translate(0px, 0px)";
    }
    timerRef.current = setTimeout(finishExpand, reduceMotion ? FADE_MS : EXPAND_MS);
    closeRef.current?.focus({ preventScroll: true });
  };

  const collapse = () => {
    const frame = frameRef.current;
    const section = sectionRef.current;
    const inner = innerRef.current;
    if (!frame || !inner || !section || !openRef.current) return;
    openRef.current = false;
    setOpen(false);
    clearTimer();

    if (reduceMotion) {
      frame.style.transition = `opacity ${FADE_MS}ms ease`;
      frame.style.opacity = "0";
      timerRef.current = setTimeout(finishCollapse, FADE_MS);
      return;
    }

    const rect = section.getBoundingClientRect();
    if (!frame.style.clipPath) {
      frame.style.transition = "none";
      inner.style.transition = "none";
      frame.style.clipPath = `inset(0px 0px 0px 0px round 0px)`;
      inner.style.transform = "translate(0px, 0px)";
      void frame.offsetWidth;
    }
    frame.style.transition = `clip-path ${COLLAPSE_MS}ms ${EASE}, opacity ${SWAP_OUT_MS}ms ease-in ${COLLAPSE_MS - SWAP_OUT_MS}ms`;
    inner.style.transition = `transform ${COLLAPSE_MS}ms ${EASE}`;
    frame.style.clipPath = insetFor(rect, frame, FRAME_RADIUS);
    inner.style.transform = offsetFor(rect, frame);
    frame.style.opacity = "0";
    timerRef.current = setTimeout(() => finishCollapse(true), COLLAPSE_MS);
  };

  const collapseRef = useRef(collapse);
  useEffect(() => {
    collapseRef.current = collapse;
  });

  useEffect(() => {
    const frame = frameRef.current;
    if (!open || !frame) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.key === "Escape") {
        event.preventDefault();
        collapseRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables(frame);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (!active || !frame.contains(active)) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && active === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(
    () => () => {
      clearTimer();
      if (layoutRef.current === "full") unlockScroll();
    },
    [],
  );

  const full = layout === "full";
  const stageState = useMemo(
    () => ({ body, expanded: full, staticFallback }),
    [body, full, staticFallback],
  );

  return (
    <section
      ref={sectionRef}
      aria-label="Preview"
      className="not-typeset mt-8"
    >
      <StageContext.Provider value={stageState}>
        <DemoPortalContext.Provider value={full ? frameEl : null}>
          <DemoControlsTargetContext.Provider value={panelHost}>
            <div
              ref={(el) => {
                frameRef.current = el;
                setFrameEl(el);
              }}
              data-demo-stage=""
              data-expanded={full ? "" : undefined}
              role={open ? "dialog" : undefined}
              aria-modal={open ? true : undefined}
              aria-label={open ? `${title} preview, full page` : undefined}
              className={cn(
                full
                  ? "fixed inset-0 z-[100] m-0 size-full max-h-none max-w-none overflow-hidden border-0 bg-background p-0 text-foreground"
                  : "frame relative",
              )}
            >
              <div
                ref={innerRef}
                className={cn(full ? "absolute inset-0" : "flex flex-col")}
              >
                {full ? (
                  <FullToolbar
                    title={title}
                    fallback={fallback}
                    hasControls={hasControls}
                    panelOpen={panelOpen}
                    onTogglePanel={() => setPanelOpen((prev) => !prev)}
                    onClose={collapse}
                    closeRef={closeRef}
                  />
                ) : null}

                <div
                  ref={setBody}
                  data-demo-body=""
                  className={cn(
                    "isolate overflow-hidden bg-background",
                    full
                      ? "absolute inset-0 touch-none"
                      : "frame-inset relative h-[460px] touch-pan-y bg-background sm:h-[540px]",
                  )}
                >
                  {children}
                  {full ? null : (
                    <div className="pointer-events-none absolute inset-x-0 top-0 z-40 flex items-start justify-between gap-2 p-2.5">
                      {fallback ? <FallbackNote /> : <span />}
                      <button
                        ref={triggerRef}
                        type="button"
                        data-demo-expand=""
                        onClick={expand}
                        aria-label="Open full page"
                        title="Open full page"
                        className="surface-floating pressable pointer-events-auto inline-grid size-8 shrink-0 cursor-pointer place-items-center rounded-control text-muted-foreground transition-[color,transform] duration-150 ease-out hover:text-foreground"
                      >
                        <Maximize2 aria-hidden className="size-3.5" />
                      </button>
                    </div>
                  )}
                </div>

                <div
                  className={cn(
                    full
                      ? cn(
                          "surface-panel absolute z-20 rounded-panel p-2 transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-opacity",
                          "inset-x-2 bottom-2 sm:inset-x-auto sm:top-16 sm:right-3 sm:bottom-auto sm:w-[21rem]",
                          panelOpen
                            ? "opacity-100"
                            : "pointer-events-none translate-y-2 opacity-0 motion-reduce:translate-y-0",
                          !hasControls && "hidden",
                        )
                      : cn("mt-[var(--frame-gap)]", !hasControls && "hidden"),
                  )}
                  inert={full && !panelOpen ? true : undefined}
                >
                  <div
                    ref={setPanelHost}
                    className={cn(
                      full
                        ? "demo-controls-scroll -mr-1 max-h-[min(50svh,26rem)] overflow-y-auto p-1 pr-2 sm:max-h-[calc(100svh-7rem)]"
                        : "frame-inset bg-background p-3",
                    )}
                  />
                </div>
              </div>
            </div>
          </DemoControlsTargetContext.Provider>
        </DemoPortalContext.Provider>
      </StageContext.Provider>
    </section>
  );
}

function FallbackNote() {
  return (
    <span
      title="This browser doesn't support HTML-in-Canvas, so the preview shows the fallback. Chrome 157 or later renders the full effect."
      className="chip surface-floating pointer-events-auto h-6 shrink-0 gap-1 px-2.5 text-[11px]"
    >
      <Info aria-hidden className="size-3" />
      Fallback preview
    </span>
  );
}

function FullToolbar({
  title,
  fallback,
  hasControls,
  panelOpen,
  onTogglePanel,
  onClose,
  closeRef,
}: {
  title: string;
  fallback: boolean;
  hasControls: boolean;
  panelOpen: boolean;
  onTogglePanel: () => void;
  onClose: () => void;
  closeRef: React.RefObject<HTMLButtonElement | null>;
}) {
  return (
    <div className="pointer-events-none absolute inset-x-3 top-3 z-30 flex items-start justify-between gap-2">
      <div className="surface-floating pointer-events-auto flex h-10 min-w-0 items-center gap-2 rounded-control px-4">
        <span className="truncate text-[12.5px] font-medium text-foreground/90">
          {title}
        </span>
        {fallback ? <FallbackNote /> : null}
      </div>
      <div className="surface-floating pointer-events-auto flex h-10 shrink-0 items-center gap-0.5 rounded-bar p-1">
        {hasControls ? (
          <button
            type="button"
            onClick={onTogglePanel}
            aria-pressed={panelOpen}
            className={cn(
              "pressable inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-control px-3 text-[12.5px] font-medium transition-[color,background-color,transform] duration-150 ease-out",
              panelOpen
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:bg-[var(--surface-hover)] hover:text-foreground",
            )}
          >
            <SlidersHorizontal aria-hidden className="size-3.5" />
            Controls
          </button>
        ) : null}
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Exit full page"
          title="Exit full page (Esc)"
          className="btn-icon btn-icon-quiet cursor-pointer border-transparent"
        >
          <X aria-hidden className="size-4" />
        </button>
      </div>
    </div>
  );
}

export function useStageAutoplay(tick: () => void, interval: number, enabled = true) {
  const stage = useStage();
  const body = stage?.body ?? null;
  const reduceMotion = useReducedMotion() ?? false;
  const tickRef = useRef(tick);

  useEffect(() => {
    tickRef.current = tick;
  });

  useEffect(() => {
    if (!body || !enabled || reduceMotion) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    let visible = false;
    const start = () => {
      if (timer === null && visible && !document.hidden) {
        timer = setInterval(() => tickRef.current(), interval);
      }
    };
    const stop = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    };
    const observer = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting && entry.intersectionRatio >= 0.45;
        if (visible) start();
        else stop();
      },
      { threshold: [0, 0.45, 0.7] },
    );
    observer.observe(body);
    const onVisibility = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      observer.disconnect();
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [body, enabled, reduceMotion, interval]);
}

export function StageTabs<T extends string>({
  label,
  options,
  value,
  onValueChange,
  position = "top",
}: {
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
  position?: "top" | "bottom";
}) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-x-0 z-20 flex justify-center px-3",
        position === "top" ? "top-3" : "bottom-3",
      )}
    >
      <SegmentedControl
        label={label}
        options={options}
        value={value}
        onValueChange={onValueChange}
        className="pointer-events-auto max-w-full overflow-x-auto shadow-[var(--shadow-float)] [scrollbar-width:none]"
      />
    </div>
  );
}

export type HintGesture = "move" | "click" | "scroll" | "drag";

const DEFAULT_LABELS: Record<HintGesture, [string, string]> = {
  move: ["Move your cursor", "Drag across"],
  click: ["Click anywhere", "Tap anywhere"],
  scroll: ["Scroll inside", "Swipe up inside"],
  drag: ["Drag to rotate", "Drag to rotate"],
};

const COARSE_QUERY = "(hover: none), (pointer: coarse)";

function subscribeCoarse(callback: () => void) {
  const query = window.matchMedia(COARSE_QUERY);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

export type GhostPath = (t: number) => [number, number];

const FIGURE_EIGHT: GhostPath = (t) => [
  0.5 + 0.3 * Math.sin(t * 0.85),
  0.5 + 0.17 * Math.sin(t * 1.7 + 0.6),
];

const CLICK_POINTS: [number, number][] = [
  [0.34, 0.42],
  [0.66, 0.6],
  [0.52, 0.32],
  [0.4, 0.66],
];
const CLICK_PERIOD = 1.9;

const easeInOut = (x: number) =>
  x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

function clickPath(t: number): [number, number] {
  const index = Math.floor(t / CLICK_PERIOD);
  const local = (t % CLICK_PERIOD) / CLICK_PERIOD;
  const from = CLICK_POINTS[index % CLICK_POINTS.length];
  const to = CLICK_POINTS[(index + 1) % CLICK_POINTS.length];
  const k = easeInOut(Math.min(1, local / 0.55));
  return [from[0] + (to[0] - from[0]) * k, from[1] + (to[1] - from[1]) * k];
}

const GHOST_POINTER_ID = 41;

function dispatchPointer(
  body: HTMLElement,
  type: string,
  x: number,
  y: number,
  buttons = 0,
) {
  const hit = document.elementFromPoint(x, y);
  const target =
    hit && body.contains(hit) ? hit : (body.firstElementChild ?? body);
  const init: PointerEventInit = {
    bubbles: true,
    cancelable: true,
    composed: true,
    clientX: x,
    clientY: y,
    pointerId: GHOST_POINTER_ID,
    pointerType: "mouse",
    isPrimary: true,
    buttons,
    button: type === "pointermove" ? -1 : 0,
  };
  target.dispatchEvent(new PointerEvent(type, init));
  if (type === "pointerup") {
    target.dispatchEvent(new MouseEvent("click", init));
  }
}

function findScroller(body: HTMLElement) {
  const candidates = body.querySelectorAll<HTMLElement>("div");
  for (const el of candidates) {
    if (el.scrollHeight - el.clientHeight < 40) continue;
    const overflow = getComputedStyle(el).overflowY;
    if (overflow === "auto" || overflow === "scroll") return el;
  }
  return null;
}

const RESUME_MS = 2200;

export interface StageHintProps {
  gesture?: HintGesture;
  label?: string;
  touchLabel?: string;
  autopilot?: boolean;
  path?: GhostPath;
}

export function StageHint({
  gesture = "move",
  label,
  touchLabel,
  autopilot = gesture !== "drag",
  path,
}: StageHintProps) {
  const stage = useStage();
  const body = stage?.body ?? null;
  const reduceMotion = useReducedMotion() ?? false;
  const coarse = useSyncExternalStore(
    subscribeCoarse,
    () => window.matchMedia(COARSE_QUERY).matches,
    () => false,
  );
  const [done, setDone] = useState(false);
  const [ghostVisible, setGhostVisible] = useState(false);
  const ghostRef = useRef<HTMLDivElement>(null);
  const pressRef = useRef<HTMLSpanElement>(null);

  const pathname = usePathname();
  const [mouseLabel, fingerLabel] = DEFAULT_LABELS[gesture];
  const text = coarse ? (touchLabel ?? label ?? fingerLabel) : (label ?? mouseLabel);

  useEffect(() => {
    if (!body) return;
    let travelled = 0;
    let last: { x: number; y: number } | null = null;
    let resume: ReturnType<typeof setTimeout> | null = null;
    const clearResume = () => {
      if (resume) clearTimeout(resume);
      resume = null;
    };
    const finish = () => {
      clearResume();
      setDone(true);
    };
    const onMove = (event: PointerEvent) => {
      if (!event.isTrusted) return;
      clearResume();
      if (last) travelled += Math.hypot(event.clientX - last.x, event.clientY - last.y);
      last = { x: event.clientX, y: event.clientY };
      if (travelled > 48) finish();
    };
    const onDiscrete = (event: Event) => {
      if (event.isTrusted) finish();
    };
    const onLeave = (event: PointerEvent) => {
      if (!event.isTrusted) return;
      travelled = 0;
      last = null;
      clearResume();
      resume = setTimeout(() => setDone(false), RESUME_MS);
    };
    const discrete =
      gesture === "scroll"
        ? ["pointerdown", "wheel", "touchstart", "keydown"]
        : ["pointerdown", "keydown", "touchstart"];
    body.addEventListener("pointermove", onMove, { passive: true, capture: true });
    body.addEventListener("pointerleave", onLeave);
    for (const type of discrete) {
      body.addEventListener(type, onDiscrete, { passive: true, capture: true });
    }
    return () => {
      clearResume();
      body.removeEventListener("pointermove", onMove, { capture: true });
      body.removeEventListener("pointerleave", onLeave);
      for (const type of discrete) {
        body.removeEventListener(type, onDiscrete, { capture: true });
      }
    };
  }, [body, gesture]);

  useEffect(() => {
    if (!body || done || !autopilot || reduceMotion || stage?.staticFallback) return;
    if (gesture === "drag") return;

    let raf = 0;
    let visible = false;
    let started = 0;
    let elapsed = 0;
    let lastNow = 0;
    let lastClick = -1;
    let scroller: HTMLElement | null = null;
    let scrollBase = 0;
    const pathFn = gesture === "click" ? clickPath : (path ?? FIGURE_EIGHT);

    const tick = (now: number) => {
      raf = 0;
      if (!visible || document.hidden) return;
      if (lastNow) elapsed += Math.min(0.05, (now - lastNow) / 1000);
      lastNow = now;
      if (!started) started = now;
      if (now - started < 900) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const t = elapsed;
      const rect = body.getBoundingClientRect();

      if (gesture === "scroll") {
        scroller ??= findScroller(body);
        if (scroller) {
          const range = Math.min(
            scroller.scrollHeight - scroller.clientHeight,
            rect.height * 0.9,
          );
          const cycle = t % 9;
          const k =
            cycle < 3
              ? easeInOut(cycle / 3)
              : cycle < 4.5
                ? 1
                : cycle < 7
                  ? 1 - easeInOut((cycle - 4.5) / 2.5)
                  : 0;
          scroller.scrollTop = scrollBase + range * k;
        }
        raf = requestAnimationFrame(tick);
        return;
      }

      const [nx, ny] = pathFn(t);
      const lx = nx * rect.width;
      const ly = ny * rect.height;
      const ghost = ghostRef.current;
      if (ghost) ghost.style.transform = `translate3d(${lx}px, ${ly}px, 0)`;
      const x = rect.left + lx;
      const y = rect.top + ly;
      dispatchPointer(body, "pointermove", x, y);

      if (gesture === "click") {
        const index = Math.floor(t / CLICK_PERIOD);
        const local = (t % CLICK_PERIOD) / CLICK_PERIOD;
        if (local > 0.62 && index !== lastClick) {
          lastClick = index;
          dispatchPointer(body, "pointerdown", x, y, 1);
          dispatchPointer(body, "pointerup", x, y);
          const press = pressRef.current;
          press?.animate(
            [
              { transform: "translate(-50%, -50%) scale(0.4)", opacity: 0.7 },
              { transform: "translate(-50%, -50%) scale(1.6)", opacity: 0 },
            ],
            { duration: 520, easing: "cubic-bezier(0.23, 1, 0.32, 1)" },
          );
        }
      }
      raf = requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        const next = entry.isIntersecting && entry.intersectionRatio >= 0.45;
        if (next === visible) return;
        visible = next;
        setGhostVisible(next && gesture !== "scroll");
        if (visible) {
          lastNow = 0;
          if (gesture === "scroll") {
            scroller = findScroller(body);
            scrollBase = scroller?.scrollTop ?? 0;
          }
          if (!raf) raf = requestAnimationFrame(tick);
        } else if (raf) {
          cancelAnimationFrame(raf);
          raf = 0;
        }
      },
      { threshold: [0, 0.45, 0.7] },
    );
    observer.observe(body);
    const onVisibility = () => {
      if (!document.hidden && visible && !raf) {
        lastNow = 0;
        raf = requestAnimationFrame(tick);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      if (raf) cancelAnimationFrame(raf);
      setGhostVisible(false);
      if (gesture !== "scroll" && gesture !== "click") {
        const rect = body.getBoundingClientRect();
        const target = body.firstElementChild ?? body;
        target.dispatchEvent(
          new PointerEvent("pointerleave", {
            bubbles: false,
            clientX: rect.left - 10,
            clientY: rect.top - 10,
            pointerId: GHOST_POINTER_ID,
            pointerType: "mouse",
          }),
        );
      }
    };
  }, [body, done, autopilot, reduceMotion, gesture, path, stage?.staticFallback]);

  if (!stage) {
    return pathname?.startsWith("/docs/components/") ? (
      <PageDemoIndicator gesture={gesture} coarse={coarse} text={text} />
    ) : null;
  }

  if (stage.staticFallback) {
    return (
      <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-3">
        <span className="surface-floating inline-flex h-8 max-w-full items-center gap-1.5 truncate rounded-control px-3 text-[12px] font-medium text-muted-foreground">
          <Info aria-hidden className="size-3.5 shrink-0" />
          Fallback preview. The full effect runs in Chrome 157 or later.
        </span>
      </div>
    );
  }

  return (
    <>
      {autopilot && gesture !== "scroll" && gesture !== "drag" ? (
        <div
          ref={ghostRef}
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-0 left-0 z-20 transition-opacity duration-300 ease-out",
            ghostVisible && !done ? "opacity-100" : "opacity-0",
          )}
        >
          <span
            ref={pressRef}
            className="absolute top-0 left-0 size-10 rounded-full border-2 border-foreground/50 opacity-0"
            style={{ transform: "translate(-50%, -50%)" }}
          />
          {coarse ? (
            <span
              className="absolute top-0 left-0 size-7 rounded-full border border-white/70 bg-black/25 shadow-lg backdrop-blur-[2px]"
              style={{ transform: "translate(-50%, -50%)" }}
            />
          ) : (
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              className="absolute top-0 left-0 -translate-x-[3px] -translate-y-[2px] drop-shadow-[0_2px_4px_rgb(0_0_0/0.25)]"
            >
              <path
                d="M5 3.2v15.6c0 .5.6.8 1 .4l3.9-3.8 2.6 5.9c.2.4.6.5 1 .4l1.9-.8c.4-.2.5-.6.4-1l-2.6-5.8h5.5c.5 0 .8-.6.4-1L6 2.8c-.4-.4-1-.1-1 .4Z"
                fill="#0a0a0a"
                stroke="#fff"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </div>
      ) : null}
      <div
        aria-hidden={done}
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-3 transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-opacity",
          done ? "translate-y-1 opacity-0" : "translate-y-0 opacity-100",
        )}
      >
        <span className="surface-floating inline-flex h-8 max-w-full items-center gap-1.5 truncate rounded-control px-3 text-[12px] font-medium text-muted-foreground">
          <HintIcon gesture={gesture} coarse={coarse} />
          {text}
        </span>
      </div>
    </>
  );
}

function PageDemoIndicator({
  gesture,
  coarse,
  text,
}: {
  gesture: HintGesture;
  coarse: boolean;
  text: string;
}) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 flex justify-start pr-36 pl-4 lg:justify-center lg:pr-8 lg:pl-72">
      <span className="surface-floating inline-flex h-9 max-w-full min-w-0 items-center gap-2.5 rounded-control px-3.5 text-[12.5px] font-medium">
        <span className="shrink-0 text-foreground">Full-page demo</span>
        <span aria-hidden className="h-3.5 w-px shrink-0 bg-border-strong" />
        <span className="inline-flex min-w-0 items-center gap-1.5 text-muted-foreground">
          <HintIcon gesture={gesture} coarse={coarse} />
          <span className="truncate">{text}</span>
        </span>
      </span>
    </div>
  );
}

function HintIcon({ gesture, coarse }: { gesture: HintGesture; coarse: boolean }) {
  const common = {
    width: 13,
    height: 13,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    className: "shrink-0",
  };
  if (gesture === "scroll") {
    return (
      <svg {...common}>
        <rect x="6" y="3" width="12" height="18" rx="6" />
        <path d="M12 7v4" />
      </svg>
    );
  }
  if (gesture === "drag") {
    return (
      <svg {...common}>
        <path d="M21 12a9 9 0 1 1-3-6.7" />
        <path d="M21 4v5h-5" />
      </svg>
    );
  }
  if (coarse) {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="4" />
        <circle cx="12" cy="12" r="8.5" opacity="0.45" />
      </svg>
    );
  }
  if (gesture === "click") {
    return (
      <svg {...common}>
        <path d="M9 9l5 12 1.8-5.2L21 14 9 9z" />
        <path d="M7.2 2.2 8 5.1M5.1 8 2.2 7.2M14 4.1 12 6.2M6.2 12l-2.1 2" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M4 4l7.07 17 2.51-7.39L21 11.07z" />
    </svg>
  );
}
