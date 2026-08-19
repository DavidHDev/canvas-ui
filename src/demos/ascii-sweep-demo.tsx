"use client";

import { useState } from "react";

import { motion } from "motion/react";

import { color, radio, scrub } from "@/components/demos/control-schema";
import { DemoControls } from "@/components/demos/demo-controls";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDemoControls } from "@/hooks/use-demo-controls";
import { AsciiSweep } from "@/lib/AsciiSweep/AsciiSweep";
import { cn } from "@/lib/utils";

export const ASCII_SWEEP_CONTROLS = {
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

const EXAMPLES = [
  { id: "agent", label: "Agent" },
  { id: "human", label: "Human" },
] as const;

type ExampleId = (typeof EXAMPLES)[number]["id"];

const CONTENT: Record<
  ExampleId,
  { heading: string; lede: string; rows: [string, string][]; note: string }
> = {
  agent: {
    heading: "## Agent",
    lede: "Runs unattended against the repository, opens its own branches, and reports back when the work is done.",
    rows: [
      ["Creation", "Spawned per task"],
      ["Members", "No seat required"],
      ["Access control", "Scoped repo token"],
      ["Billing", "Metered per run"],
      ["Use case", "Batch and background work"],
    ],
    note: "Best for long jobs you do not want to sit and watch.",
  },
  human: {
    heading: "## Human",
    lede: "Works interactively in a session you drive, with every change visible before it lands.",
    rows: [
      ["Creation", "Manually by a user"],
      ["Members", "Multiple users (invite-only)"],
      ["Access control", "Roles with granular rules"],
      ["Billing", "Tied to a seat"],
      ["Use case", "Review and pairing"],
    ],
    note: "Best for work that needs judgement at each step.",
  },
};

function Panel({ id }: { id: ExampleId }) {
  const { heading, lede, rows, note } = CONTENT[id];
  return (
    <div className="h-full w-full px-7 py-7 font-mono text-[13px] leading-relaxed sm:px-10 sm:py-9 sm:text-[14px]">
      <h3 className="text-[16px] font-semibold text-foreground sm:text-[18px]">
        {heading}
      </h3>
      <p className="mt-2.5 max-w-prose text-muted-foreground">{lede}</p>
      <dl className="mt-6 space-y-2.5">
        {rows.map(([term, value]) => (
          <div
            key={term}
            className="flex gap-4 border-b border-border/40 pb-2.5 last:border-0"
          >
            <dt className="w-36 shrink-0 text-muted-foreground">{term}</dt>
            <dd className="min-w-0 flex-1 text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-6 text-muted-foreground">{note}</p>
    </div>
  );
}

export function AsciiSweepDemo() {
  const controls = useDemoControls(ASCII_SWEEP_CONTROLS);
  const [example, setExample] = useState<ExampleId>("agent");
  const { charset, blend, color: inkColor, ...values } = controls.values;
  const index = example === "agent" ? 0 : 1;

  return (
    <>
      <div className="relative overflow-hidden rounded-xl border border-border/60 bg-background">
        <AsciiSweep
          {...values}
          charset={charset}
          blend={blend}
          color={inkColor}
          index={index}
          alternate={<Panel id="human" />}
          className="h-[420px] w-full sm:h-[440px]"
        >
          <Panel id="agent" />
        </AsciiSweep>
      </div>

      <div className="mt-3 flex justify-center">
        <Tabs
          value={example}
          onValueChange={(value) => setExample(value as ExampleId)}
        >
          <TabsList
            aria-label="Example content"
            className="rounded-full border border-border/60 bg-card p-1 group-data-horizontal/tabs:h-auto"
          >
            {EXAMPLES.map((item) => (
              <TabsTrigger
                key={item.id}
                value={item.id}
                className="h-auto flex-none cursor-pointer rounded-full border-0 px-4 py-1.5 text-[12px] font-medium after:hidden data-active:bg-transparent data-active:shadow-none dark:data-active:bg-transparent"
              >
                {example === item.id ? (
                  <motion.span
                    layoutId="ascii-sweep-example-pill"
                    className="absolute inset-0 rounded-full bg-foreground"
                    transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
                  />
                ) : null}
                <span
                  className={cn(
                    "relative z-10 transition-colors duration-200",
                    example === item.id
                      ? "text-background"
                      : "text-muted-foreground",
                  )}
                >
                  {item.label}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      </div>

      <DemoControls
        title="ASCII Sweep controls"
        controls={controls}
        portal
        snippet={{
          component: "AsciiSweep",
          props: { ...values, charset, blend, color: inkColor },
        }}
      />
    </>
  );
}
