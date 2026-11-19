"use client";

import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  FolderKanban,
  Home,
  Settings,
  Users,
} from "@/components/icons";

import { color, hexToRgb, presets, radio, scrub } from "@/components/demos/control-schema";
import { DemoControls } from "@/components/demos/demo-controls";
import { StageHint, type GhostPath } from "@/components/demos/demo-stage";
import { useDemoControls } from "@/hooks/use-demo-controls";
import { Peel } from "@/components/docs/live/Peel";
import type { PeelSide } from "@/lib/Peel/PeelVanilla";

const AUTO_COLOR = "auto";

const CONTROLS = {
  side: radio(
    "Edge",
    "left",
    [
      { value: "left", label: "Left" },
      { value: "right", label: "Right" },
      { value: "top", label: "Top" },
      { value: "bottom", label: "Bottom" },
    ],
    { group: "Peel" },
  ),
  mode: radio(
    "Trigger",
    "cursor",
    [
      { value: "cursor", label: "Follow cursor" },
      { value: "hover", label: "Hover" },
    ],
    { group: "Peel" },
  ),
  reveal: scrub("Peel distance", 250, {
    min: 80,
    max: 480,
    step: 10,
    decimals: 0,
    group: "Peel",
  }),
  zone: scrub("Trigger zone", 200, { min: 40, max: 400, step: 10, decimals: 0, group: "Peel" }),
  curl: scrub("Curl radius", 300, { min: 40, max: 400, step: 10, decimals: 0, group: "Paper" }),
  shine: scrub("Shine", 1, { min: 0, max: 1, step: 0.05, group: "Paper" }),
  shade: scrub("Shade", 0.25, { min: 0, max: 1, step: 0.05, group: "Paper" }),
  shineColor: color("Shine color", AUTO_COLOR, { auto: { label: "Auto" }, group: "Paper" }),
  bow: scrub("Bow", 75, {
    min: -150,
    max: 150,
    step: 5,
    decimals: 0,
    group: "Paper",
    advanced: true,
  }),
  bulge: scrub("Bulge", 50, {
    min: 0,
    max: 200,
    step: 10,
    decimals: 0,
    group: "Paper",
    advanced: true,
  }),
  shineDistance: scrub("Shine distance", 1200, {
    min: 0,
    max: 1200,
    step: 50,
    decimals: 0,
    group: "Paper",
    advanced: true,
  }),
  perspective: scrub("Perspective", 2000, {
    min: 400,
    max: 3000,
    step: 50,
    decimals: 0,
    group: "Peel",
    advanced: true,
  }),
  smoothing: scrub("Follow lag", 0.3, {
    min: 0.05,
    max: 1,
    step: 0.05,
    group: "Peel",
    advanced: true,
  }),
};

const PRESETS = presets(CONTROLS, [
  { label: "Sticker", values: { curl: 70, reveal: 170, bow: 0, shade: 0.4 } },
  { label: "Page turn", values: { curl: 400, reveal: 440, perspective: 1200 } },
  { label: "Hover reveal", values: { mode: "hover", reveal: 300 } },
]);

function edgePath(side: PeelSide): GhostPath {
  return (t) => {
    const reach = 0.5 + 0.5 * Math.sin(t * 0.9 - Math.PI / 2);
    const depth = 0.42 - 0.39 * reach;
    const along = 0.5 + 0.22 * Math.sin(t * 0.55);
    switch (side) {
      case "left":
        return [depth, along];
      case "right":
        return [1 - depth, along];
      case "top":
        return [along, depth];
      case "bottom":
        return [along, 1 - depth];
    }
  };
}

const STATS = [
  { label: "Revenue", value: "$48.2k", change: "+12.4%", up: true },
  { label: "Active users", value: "8,431", change: "+3.2%", up: true },
  { label: "Conversion", value: "4.6%", change: "-0.8%", up: false },
];

const BARS = [42, 68, 54, 80, 63, 92, 75, 58, 86, 70, 96, 82];

const ROWS = [
  { name: "Q3 landing refresh", status: "In review", time: "2h ago" },
  { name: "Checkout experiment", status: "Shipped", time: "5h ago" },
  { name: "Mobile onboarding", status: "In progress", time: "1d ago" },
];

function DashboardScene() {
  return (
    <div className="flex h-full w-full flex-col bg-background px-5 py-4 sm:px-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-[15px] font-medium tracking-[-0.01em]">
            Overview
          </p>
          <p className="text-[12px] text-muted-foreground">Last 30 days</p>
        </div>
        <div className="flex items-center gap-1 rounded-lg bg-muted/60 p-1">
          {["Overview", "Reports", "Settings"].map((tab, index) => (
            <span
              key={tab}
              className={`rounded-md px-2.5 py-1 text-[12px] font-medium ${
                index === 0
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground"
              }`}
            >
              {tab}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        {STATS.map((stat) => (
          <div
            key={stat.label}
            className="rounded-xl border border-border bg-card px-3.5 py-3"
          >
            <p className="truncate text-[12px] text-muted-foreground">
              {stat.label}
            </p>
            <p className="mt-1 text-lg font-medium tracking-[-0.01em]">
              {stat.value}
            </p>
            <p
              className={`mt-0.5 flex items-center gap-0.5 text-[11.5px] font-medium ${
                stat.up ? "text-emerald-500" : "text-rose-500"
              }`}
            >
              {stat.up ? (
                <ArrowUpRight aria-hidden className="size-3" />
              ) : (
                <ArrowDownRight aria-hidden className="size-3" />
              )}
              {stat.change}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-3 flex-1 rounded-xl border border-border bg-card px-3.5 py-3">
        <p className="text-[12px] font-medium text-muted-foreground">
          Weekly sessions
        </p>
        <div className="mt-2 flex h-[calc(100%-2rem)] min-h-16 items-end gap-1.5">
          {BARS.map((height, index) => (
            <div
              key={index}
              className="flex-1 rounded-t-sm bg-foreground/75"
              style={{ height: `${height}%` }}
            />
          ))}
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-border bg-card px-3.5 py-2">
        {ROWS.map((row, index) => (
          <div
            key={row.name}
            className={`flex items-center justify-between py-2 ${
              index > 0 ? "border-t border-border" : ""
            }`}
          >
            <p className="truncate text-[12.5px] font-medium">{row.name}</p>
            <div className="flex shrink-0 items-center gap-3">
              <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                {row.status}
              </span>
              <span className="hidden text-[11.5px] text-muted-foreground sm:block">
                {row.time}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const NAV = [
  { label: "Dashboard", icon: Home, active: true },
  { label: "Analytics", icon: BarChart3, active: false },
  { label: "Projects", icon: FolderKanban, active: false },
  { label: "Team", icon: Users, active: false },
  { label: "Settings", icon: Settings, active: false },
];

function UnderPanel({ side }: { side: PeelSide }) {
  const horizontal = side === "top" || side === "bottom";

  const nav = (
    <nav
      className={
        horizontal ? "flex items-center gap-1.5" : "flex flex-col gap-1"
      }
    >
      {NAV.map((item) => (
        <button
          key={item.label}
          type="button"
          className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
            item.active
              ? "bg-foreground/10 text-foreground"
              : "text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
          }`}
        >
          <item.icon aria-hidden className="size-4" />
          {item.label}
        </button>
      ))}
    </nav>
  );

  if (horizontal) {
    return (
      <div
        className={`flex h-full w-full bg-muted ${
          side === "top" ? "items-start" : "items-end"
        }`}
      >
        <div className="flex w-full items-center justify-between px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex size-7 items-center justify-center rounded-lg bg-foreground text-[12px] font-medium text-background">
              A
            </span>
            <span className="text-[14px] font-medium tracking-[-0.01em]">
              Acme
            </span>
          </div>
          {nav}
        </div>
      </div>
    );
  }

  return (
    <div
      className={`flex h-full w-full bg-muted ${
        side === "right" ? "justify-end" : "justify-start"
      }`}
    >
      <div className="flex h-full w-66 flex-col px-4 py-5">
        <div className="flex items-center gap-2.5 px-2">
          <span className="flex size-7 items-center justify-center rounded-lg bg-foreground text-[12px] font-medium text-background">
            A
          </span>
          <span className="text-[14px] font-medium tracking-[-0.01em]">
            Acme
          </span>
        </div>
        <div className="mt-5 flex-1">{nav}</div>
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5">
          <span className="flex size-7 items-center justify-center rounded-full bg-foreground/15 text-[11px] font-medium">
            AD
          </span>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-[12.5px] font-medium">Ada Lovelace</p>
            <p className="truncate text-[11px] text-muted-foreground">
              Pro plan
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PeelDemo() {
  const controls = useDemoControls(CONTROLS);
  const { side, shineColor, ...values } = controls.values;
  const props = {
    ...values,
    side,
    shineColor: shineColor === AUTO_COLOR ? ("auto" as const) : hexToRgb(shineColor),
  };

  return (
    <>
      <Peel
        {...props}
        className="absolute inset-0"
        style={{ position: "absolute" }}
        under={<UnderPanel side={side} />}
      >
        <DashboardScene />
      </Peel>
      <StageHint
        key={side}
        path={edgePath(side)}
        label={`Move your cursor to the ${side} edge`}
        touchLabel={`Drag toward the ${side} edge`}
      />
      <DemoControls
        title="Peel controls"
        controls={controls}
        presets={PRESETS}
        snippet={{ component: "Peel", props }}
      />
    </>
  );
}

export { CONTROLS as PEEL_CONTROLS, PRESETS as PEEL_PRESETS };
