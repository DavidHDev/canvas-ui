"use client";

import { useState } from "react";

import { color, radio, scrub } from "@/components/demos/control-schema";
import {
  DemoControls,
  useDemoScrollbarGutter,
} from "@/components/demos/demo-controls";
import { MOCK_SITE_COPY, MockSite } from "@/components/playground/mock-site";
import { useDemoControls } from "@/hooks/use-demo-controls";
import { AsciiSweep } from "@/lib/AsciiSweep/AsciiSweep";

const CONTROLS = {
  color: color("Ink color", "#4ade80"),
  charset: radio("Charset", "ascii", [
    { value: "ascii", label: "Ascii" },
    { value: "blocks", label: "Blocks" },
    { value: "binary", label: "Binary" },
  ]),
  blend: radio("Blend", "auto", [
    { value: "auto", label: "Auto" },
    { value: "add", label: "Add" },
    { value: "over", label: "Over" },
  ]),
  angle: scrub("Angle", 0, { min: -180, max: 180, step: 5, decimals: 0 }),
  duration: scrub("Duration", 2, { min: 0.2, max: 4, step: 0.05 }),
  band: scrub("Band width", 0.28, { min: 0.05, max: 1, step: 0.01 }),
  softness: scrub("Softness", 0.45, { min: 0, max: 1, step: 0.01 }),
  turbulence: scrub("Turbulence", 0.5, { min: 0, max: 2, step: 0.05 }),
  trail: scrub("Trail", 0.75, { min: 0, max: 3, step: 0.05 }),
  scale: scrub("Scale", 2, { min: 1, max: 6, step: 0.5, decimals: 1 }),
  spacing: scrub("Spacing", 1, { min: 0, max: 3, step: 1, decimals: 0 }),
  tint: scrub("Tint", 0.75, { min: 0, max: 1, step: 0.05 }),
  glow: scrub("Glow", 2, { min: 0, max: 4, step: 0.05 }),
  aberration: scrub("Color fringe", 5, { min: 0, max: 20, step: 0.5 }),
  flicker: scrub("Flicker", 0.35, { min: 0, max: 1, step: 0.05 }),
  density: scrub("Density", 0.9, { min: 0, max: 1, step: 0.05 }),
  displace: scrub("Row tear", 14, { min: 0, max: 80, step: 1, decimals: 0 }),
  contrast: scrub("Contrast", 1.2, { min: 0.2, max: 4, step: 0.05 }),
  brightness: scrub("Brightness", 0, { min: -0.5, max: 0.5, step: 0.05 }),
  invert: scrub("Invert", 0, { min: 0, max: 1, step: 0.05 }),
  threshold: scrub("Threshold", 0.1, { min: 0.01, max: 0.6, step: 0.01 }),
  fade: scrub("Fade", 0.75, { min: 0, max: 1, step: 0.05 }),
};

/**
 * Both panels lose their native scrollbar, not just the one the gutter hook
 * touches. Leaving the second panel with a scrollbar would pop one in when it
 * comes to the front mid sweep and reflow the page underneath.
 */
const HIDE_PANEL_SCROLLBARS =
  "[&>canvas>div]:[scrollbar-width:none] [&>div]:[scrollbar-width:none]";

function Page({
  variant,
  contentRef,
}: {
  variant: 0 | 1;
  contentRef?: (el: HTMLElement | null) => void;
}) {
  return (
    <main
      ref={contentRef}
      className="min-h-full overflow-x-clip bg-background px-5 pt-24 pb-10 sm:px-8 lg:pt-16 lg:pr-8 lg:pl-72"
    >
      <MockSite copy={MOCK_SITE_COPY[variant]} />
    </main>
  );
}

export function AsciiSweepEntry() {
  const controls = useDemoControls(CONTROLS);
  const [variant, setVariant] = useState<0 | 1>(0);
  // Swaps the panel's native scrollbar for the shared overlay thumb, which is
  // mounted outside the canvas so the sweep never paints over it.
  const setContentEl = useDemoScrollbarGutter();
  const { charset, blend, color: inkColor, ...values } = controls.values;

  return (
    <>
      <AsciiSweep
        {...values}
        charset={charset}
        blend={blend}
        color={inkColor}
        index={variant}
        alternate={<Page variant={1} />}
        className={`page-enter inset-0 z-30 ${HIDE_PANEL_SCROLLBARS}`}
        style={{ position: "fixed" }}
      >
        <Page variant={0} contentRef={setContentEl} />
      </AsciiSweep>

      <div className="pointer-events-none fixed inset-x-0 bottom-6 z-40 flex justify-center">
        <div className="pointer-events-auto flex items-center gap-1 rounded-full border border-border/60 bg-background/80 p-1 backdrop-blur-xl">
          {(
            [
              [0, MOCK_SITE_COPY[0].brand],
              [1, MOCK_SITE_COPY[1].brand],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              aria-pressed={variant === value}
              onClick={() => setVariant(value)}
              className={`cursor-pointer rounded-full px-4 py-1.5 text-[13px] font-medium transition-colors ${
                variant === value
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <DemoControls
        title="ASCII Sweep controls"
        controls={controls}
        snippet={{
          component: "AsciiSweep",
          props: { ...values, charset, blend, color: inkColor },
        }}
      />
    </>
  );
}
