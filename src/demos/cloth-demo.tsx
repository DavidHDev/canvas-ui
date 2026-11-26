"use client";

import { useEffect, useState } from "react";

import {
  color,
  hexToRgb,
  presets,
  radio,
  scrub,
  toggle,
} from "@/components/demos/control-schema";
import { DemoControls } from "@/components/demos/demo-controls";
import { StageHint } from "@/components/demos/demo-stage";
import { PageDemoSignup, type DemoProps } from "@/components/demos/demo-surface";
import { useDemoControls } from "@/hooks/use-demo-controls";
import { Cloth } from "@/components/docs/live/Cloth";
import { PhotoScene } from "@/demos/scenes";

const AUTO_COLOR = "auto";

const CONTROLS = {
  pin: radio(
    "Hangs from",
    "top",
    [
      { value: "top", label: "Top" },
      { value: "corners", label: "Corners" },
      { value: "left", label: "Left" },
      { value: "none", label: "Nothing" },
    ],
    { group: "Fabric" },
  ),
  wind: scrub("Wind", 0.25, { min: 0, max: 1, step: 0.05, group: "Fabric" }),
  stiffness: scrub("Stiffness", 0.5, { min: 0, max: 1, step: 0.05, group: "Fabric" }),
  settle: scrub("Settle", 0.3, { min: 0, max: 1, step: 0.05, group: "Fabric" }),
  drag: toggle("Drag", true, { group: "Touch" }),
  float: toggle("Float", false, { group: "Touch" }),
  brush: scrub("Brush", 0.4, { min: 0, max: 1, step: 0.05, group: "Touch" }),
  light: scrub("Light", 0.6, { min: 0, max: 1, step: 0.05, group: "Look" }),
  sheen: scrub("Sheen", 0.35, { min: 0, max: 1, step: 0.05, group: "Look" }),
  weave: scrub("Weave", 0.3, { min: 0, max: 1, step: 0.05, group: "Look" }),
  shadow: scrub("Shadow", 0.4, { min: 0, max: 1, step: 0.05, group: "Look" }),
  backing: color("Backing", AUTO_COLOR, { auto: { label: "Auto" }, group: "Look" }),
  cornerRadius: scrub("Corners", 16, {
    min: 0,
    max: 80,
    step: 1,
    decimals: 0,
    group: "Look",
    advanced: true,
  }),
  perspective: scrub("Perspective", 1400, {
    min: 500,
    max: 4000,
    step: 50,
    decimals: 0,
    group: "Look",
    advanced: true,
  }),
  speed: scrub("Speed", 1, { min: 0.2, max: 2, step: 0.05, group: "Fabric", advanced: true }),
};

const PRESETS = presets(CONTROLS, [
  { label: "Linen", values: { stiffness: 0.5, weave: 0.35, sheen: 0.3, wind: 0.25 } },
  { label: "Silk", values: { stiffness: 0.08, weave: 0.1, sheen: 0.85, light: 0.75, wind: 0.4 } },
  { label: "Canvas", values: { stiffness: 0.95, weave: 0.7, sheen: 0.1, wind: 0.15 } },
  { label: "Banner", values: { pin: "corners", wind: 0.55, stiffness: 0.35 } },
  { label: "Floating", values: { pin: "none", wind: 0.15, settle: 0.5 } },
]);

function usePageScrollSync(inner: HTMLElement | null) {
  const [overflowPx, setOverflowPx] = useState(0);

  useEffect(() => {
    if (!inner) return;
    const scroller = inner.parentElement;
    if (!scroller) return;
    const sync = () => {
      if (Math.abs(scroller.scrollTop - window.scrollY) > 1) {
        scroller.scrollTop = window.scrollY;
      }
    };
    /* scrolls that start inside the panel (the signup button, tabbing to a
       link) move the page too once they finish, unless the page is past the
       panel's end; moving the page mid-scroll would cancel a smooth one */
    let settle = 0;
    const pull = () => {
      window.clearTimeout(settle);
      settle = window.setTimeout(() => {
        const end = scroller.scrollHeight - scroller.clientHeight - 1;
        if (Math.abs(scroller.scrollTop - window.scrollY) <= 1) return;
        if (scroller.scrollTop >= end && window.scrollY > scroller.scrollTop) return;
        window.scrollTo(0, scroller.scrollTop);
      }, 120);
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
    scroller.addEventListener("scroll", pull, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", sync);
      scroller.removeEventListener("scroll", pull);
      window.clearTimeout(settle);
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
                <PageDemoSignup />
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
      <StageHint label="Grab the fabric and drag it" touchLabel="Drag the fabric" />
      <DemoControls
        title="Cloth controls"
        controls={controls}
        presets={PRESETS}
        snippet={{ component: "Cloth", props }}
      />
    </>
  );
}
