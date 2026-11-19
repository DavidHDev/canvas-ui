"use client";

import { useEffect, useState } from "react";

import {
  color,
  hexToRgb,
  presets,
  radio,
  scrub,
} from "@/components/demos/control-schema";
import { DemoControls } from "@/components/demos/demo-controls";
import { StageHint } from "@/components/demos/demo-stage";
import type { DemoProps } from "@/components/demos/demo-surface";
import { useDemoControls } from "@/hooks/use-demo-controls";
import { Cloth } from "@/components/docs/live/Cloth";
import { PhotoScene } from "@/demos/scenes";

const AUTO_COLOR = "auto";

const CONTROLS = {
  wind: scrub("Wind", 3, { min: 0, max: 5, step: 0.05, group: "Fabric" }),
  amplitude: scrub("Fold height", 30, {
    min: 0,
    max: 60,
    step: 1,
    decimals: 0,
    group: "Fabric",
  }),
  drape: scrub("Billow", 40, { min: 0, max: 50, step: 1, decimals: 0, group: "Fabric" }),
  pin: radio(
    "Pinned edge",
    "top",
    [
      { value: "top", label: "Top" },
      { value: "bottom", label: "Bottom" },
      { value: "left", label: "Left" },
      { value: "right", label: "Right" },
    ],
    { group: "Fabric" },
  ),
  brush: scrub("Brush strength", 2.05, { min: 0, max: 3, step: 0.05, group: "Touch" }),
  brushSize: scrub("Brush size", 150, {
    min: 30,
    max: 260,
    step: 5,
    decimals: 0,
    group: "Touch",
  }),
  damping: scrub("Settle", 1, { min: 0.2, max: 4, step: 0.05, group: "Touch" }),
  light: scrub("Lighting", 0.5, { min: 0, max: 1, step: 0.05, group: "Look" }),
  shadow: scrub("Shadow", 0.25, { min: 0, max: 1, step: 0.05, group: "Look" }),
  backing: color("Backing", AUTO_COLOR, { auto: { label: "Auto" }, group: "Look" }),
  speed: scrub("Speed", 0.5, { min: 0, max: 3, step: 0.05, group: "Fabric", advanced: true }),
  sheen: scrub("Sheen", 0.1, { min: 0, max: 1, step: 0.05, group: "Look", advanced: true }),
  cornerRadius: scrub("Corners", 20, {
    min: 0,
    max: 160,
    step: 2,
    decimals: 0,
    group: "Look",
    advanced: true,
  }),
  perspective: scrub("Perspective", 1200, {
    min: 400,
    max: 4000,
    step: 50,
    decimals: 0,
    group: "Look",
    advanced: true,
  }),
};

const PRESETS = presets(CONTROLS, [
  { label: "Breeze", values: { wind: 1.2, amplitude: 16, drape: 18 } },
  { label: "Storm", values: { wind: 5, amplitude: 52, drape: 50, speed: 1 } },
  { label: "Silk", values: { sheen: 0.7, light: 0.85, damping: 0.5, amplitude: 22 } },
]);

function usePageScrollSync(inner: HTMLElement | null) {
  const [overflowPx, setOverflowPx] = useState(0);

  useEffect(() => {
    if (!inner) return;
    const scroller = inner.parentElement;
    if (!scroller) return;
    const sync = () => {
      scroller.scrollTop = window.scrollY;
    };
    const measure = () => {
      setOverflowPx(Math.max(0, scroller.scrollHeight - scroller.clientHeight));
      sync();
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(inner);
    observer.observe(scroller);
    window.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", sync);
      window.removeEventListener("resize", measure);
    };
  }, [inner]);

  return overflowPx;
}

export function ClothDemo({ children }: DemoProps) {
  const controls = useDemoControls(CONTROLS);
  const [inner, setInner] = useState<HTMLDivElement | null>(null);
  const page = children !== undefined && children !== null;
  const overflowPx = usePageScrollSync(page ? inner : null);

  const { pin, backing, ...values } = controls.values;
  const props = {
    ...values,
    pin,
    backing: backing === AUTO_COLOR ? ("auto" as const) : hexToRgb(backing),
  };

  return (
    <>
      {page ? (
        <>
          <div aria-hidden style={{ height: `calc(100vh - 5rem + ${overflowPx}px)` }} />
          <div className="page-enter pointer-events-none fixed inset-0 z-30 px-5 pt-24 pb-10 sm:px-8 lg:pt-16 lg:pr-8 lg:pl-72">
            <Cloth
              {...props}
              className="pointer-events-auto mx-auto h-full w-full max-w-[52rem]"
            >
              <div ref={setInner} className="min-h-full bg-background px-8 pt-10 pb-12">
                {children}
              </div>
            </Cloth>
          </div>
        </>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center bg-muted/40 px-6 py-9 sm:px-12 sm:py-10">
          <Cloth {...props} className="h-full w-full max-w-[34rem]">
            <PhotoScene slug="cloth" photo={1} />
          </Cloth>
        </div>
      )}
      <StageHint
        label="Move your cursor across the fabric"
        touchLabel="Drag across the fabric"
      />
      <DemoControls
        title="Cloth controls"
        controls={controls}
        presets={PRESETS}
        snippet={{ component: "Cloth", props }}
      />
    </>
  );
}
