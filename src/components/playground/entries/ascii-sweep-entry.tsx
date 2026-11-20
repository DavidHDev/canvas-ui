"use client";

import { useState } from "react";

import {
  DemoControls,
  useDemoScrollbarGutter,
} from "@/components/demos/demo-controls";
import { MOCK_SITE_COPY, MockSite } from "@/components/playground/mock-site";
import { useDemoControls } from "@/hooks/use-demo-controls";
import { AsciiSweep } from "@/components/docs/live/AsciiSweep";
import { SegmentedControl } from "@/components/ui/segmented-control";
import {
  ASCII_SWEEP_CONTROLS,
  ASCII_SWEEP_PRESETS,
} from "@/demos/ascii-sweep-demo";


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
  const controls = useDemoControls(ASCII_SWEEP_CONTROLS);
  const [variant, setVariant] = useState<0 | 1>(0);
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
        <SegmentedControl
          label="Site"
          options={[
            { id: "0", label: MOCK_SITE_COPY[0].brand },
            { id: "1", label: MOCK_SITE_COPY[1].brand },
          ]}
          value={String(variant)}
          onValueChange={(id) => setVariant(id === "1" ? 1 : 0)}
          className="pointer-events-auto shadow-[var(--shadow-float)]"
        />
      </div>

      <DemoControls
        title="ASCII Sweep controls"
        controls={controls}
        presets={ASCII_SWEEP_PRESETS}
        snippet={{
          component: "AsciiSweep",
          props: { ...values, charset, blend, color: inkColor },
        }}
      />
    </>
  );
}
