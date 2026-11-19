"use client";

import { useState } from "react";

import { color, hexToRgb, presets, scrub } from "@/components/demos/control-schema";
import { DemoControls } from "@/components/demos/demo-controls";
import { StageTabs, useStageAutoplay } from "@/components/demos/demo-stage";
import { useDemoControls } from "@/hooks/use-demo-controls";
import { FlameWrap } from "@/components/docs/live/FlameWrap";

export { hexToRgb };

export const FLAME_WRAP_CONTROLS = {
  flame: color("Flame color", "#4f8aff", { group: "Fire" }),
  intensity: scrub("Intensity", 0.5, { min: 0, max: 3, step: 0.05, group: "Fire" }),
  height: scrub("Flame height", 170, {
    min: 40,
    max: 200,
    step: 2,
    decimals: 0,
    group: "Fire",
  }),
  smoke: scrub("Smoke", 1.5, { min: 0, max: 2, step: 0.05, group: "Fire" }),
  speed: scrub("Speed", 0.25, { min: 0, max: 3, step: 0.05, group: "Fire" }),
  radius: scrub("Corner radius", 40, {
    min: 0,
    max: 48,
    step: 1,
    decimals: 0,
    group: "Edges",
  }),
  rim: scrub("Molten rim", 2.5, { min: 0, max: 3, step: 0.05, group: "Edges" }),
  melt: scrub("Edge melt", 4.5, { min: 0, max: 24, step: 0.5, decimals: 1, group: "Edges" }),
  ember: scrub("Ember glow", 2, { min: 0, max: 2, step: 0.05, group: "Edges" }),
  scorch: scrub("Scorch", 0, { min: 0, max: 2, step: 0.05, group: "Edges" }),
  sparks: scrub("Sparks", 1.5, { min: 0, max: 3, step: 0.05, group: "Sparks" }),
  sparkSize: scrub("Spark size", 0.35, { min: 0.2, max: 2.5, step: 0.05, group: "Sparks" }),
  sparkDensity: scrub("Spark density", 1, { min: 0.3, max: 2.5, step: 0.05, group: "Sparks" }),
  sparkSpeed: scrub("Spark speed", 1, {
    min: 0.1,
    max: 3,
    step: 0.05,
    group: "Sparks",
    advanced: true,
  }),
  spread: scrub("Glow spread", 8, {
    min: 8,
    max: 96,
    step: 1,
    decimals: 0,
    group: "Fire",
    advanced: true,
  }),
  scale: scrub("Detail", 0.75, { min: 0.05, max: 1, step: 0.01, group: "Fire", advanced: true }),
  distortion: scrub("Heat shimmer", 10, {
    min: 0,
    max: 16,
    step: 0.5,
    decimals: 1,
    group: "Turbulence",
    advanced: true,
  }),
  turbulence: scrub("Turbulence", 0.5, {
    min: 0,
    max: 1,
    step: 0.01,
    group: "Turbulence",
    advanced: true,
  }),
  turbulenceScale: scrub("Turbulence scale", 0.5, {
    min: 0.2,
    max: 3,
    step: 0.05,
    group: "Turbulence",
    advanced: true,
  }),
  turbulenceReach: scrub("Turbulence reach", 25, {
    min: 4,
    max: 80,
    step: 1,
    decimals: 0,
    group: "Turbulence",
    advanced: true,
  }),
};

const PRESETS = presets(FLAME_WRAP_CONTROLS, [
  { label: "Inferno", values: { flame: "#ff5a1f", intensity: 1.2, height: 200, sparks: 2.4 } },
  { label: "Embers", values: { intensity: 0.3, height: 60, smoke: 0.4, scorch: 1 } },
  { label: "Spirit", values: { flame: "#a78bfa", sparks: 0.3, smoke: 2, speed: 0.15 } },
]);

const STATS: [string, string][] = [
  ["1,204", "Followers"],
  ["342", "Following"],
  ["86", "Projects"],
];

export function FlameProfileCard({ radius }: { radius: number }) {
  const [following, setFollowing] = useState(false);
  return (
    <div
      className="flex h-full w-full flex-col border border-border/60 bg-card px-8 pt-10 pb-7 text-center shadow-sm"
      style={{ borderRadius: radius }}
    >
      <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-muted text-[15px] font-medium tracking-tight text-foreground">
        EB
      </div>
      <p className="mt-3 text-[16px] font-medium tracking-tight text-card-foreground">
        Ember Blackwood
      </p>
      <p className="mt-0.5 text-[12.5px] text-muted-foreground">@emberburns</p>
      <p className="mx-auto mt-3 max-w-[220px] text-[12.5px] leading-relaxed text-muted-foreground">
        Pyrotechnics engineer. Building things that burn bright.
      </p>
      <div className="mt-auto border-t border-border/60 pt-4">
        <div className="flex items-center justify-center gap-8">
          {STATS.map(([value, label]) => (
            <div key={label} className="flex flex-col">
              <span className="text-[14px] font-medium tracking-tight text-card-foreground tabular-nums">
                {label === "Followers" && following ? "1,205" : value}
              </span>
              <span className="mt-0.5 text-[11px] text-muted-foreground">{label}</span>
            </div>
          ))}
        </div>
        <button
          type="button"
          aria-pressed={following}
          onClick={() => setFollowing((prev) => !prev)}
          className="mt-4 w-full cursor-pointer rounded-full bg-foreground py-2 text-[12.5px] font-medium text-background transition-opacity hover:opacity-90"
        >
          {following ? "Following" : "Follow"}
        </button>
      </div>
    </div>
  );
}

function FlameNotificationCard({ radius }: { radius: number }) {
  return (
    <div
      className="flex h-full w-full items-center border border-border/60 bg-card px-7 py-6 shadow-sm"
      style={{ borderRadius: radius }}
    >
      <div className="flex w-full items-center gap-4">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-muted text-[15px] font-medium tracking-tight text-foreground">
          EB
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[13.5px] font-medium tracking-tight text-card-foreground">
              Trending now
            </p>
            <span className="shrink-0 text-[11px] text-muted-foreground">2m ago</span>
          </div>
          <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted-foreground">
            Your launch post is blowing up. 2,431 likes in the last hour.
          </p>
        </div>
      </div>
    </div>
  );
}

function FlameStreakCard({ radius }: { radius: number }) {
  return (
    <div
      className="flex h-full w-full flex-col border border-border/60 bg-card px-8 pt-8 pb-7 shadow-sm"
      style={{ borderRadius: radius }}
    >
      <div className="flex items-center justify-between">
        <span className="text-[12px] font-medium text-muted-foreground">Streak</span>
        <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10.5px] font-medium text-foreground">
          Live
        </span>
      </div>
      <div className="mt-auto">
        <p className="text-[44px] leading-none font-medium tracking-tight text-card-foreground tabular-nums">
          47
        </p>
        <p className="mt-1.5 text-[12.5px] text-muted-foreground">days in a row</p>
      </div>
      <div className="mt-5 border-t border-border/60 pt-3.5">
        <p className="text-[11.5px] text-muted-foreground">Personal best · 52 days</p>
      </div>
    </div>
  );
}

const EXAMPLES = [
  { id: "profile", label: "Profile" },
  { id: "notification", label: "Notification" },
  { id: "streak", label: "Streak" },
] as const;

type ExampleId = (typeof EXAMPLES)[number]["id"];

const EXAMPLE_LAYOUT: Record<ExampleId, { width: string; height: number }> = {
  profile: { width: "min(320px, calc(100% - 3rem))", height: 336 },
  notification: { width: "min(360px, calc(100% - 3rem))", height: 128 },
  streak: { width: "min(250px, calc(100% - 3rem))", height: 236 },
};

export function FlameWrapDemo() {
  const controls = useDemoControls(FLAME_WRAP_CONTROLS);
  const [example, setExample] = useState<ExampleId>("profile");
  const [touched, setTouched] = useState(false);
  useStageAutoplay(
    () =>
      setExample((prev) => {
        const index = EXAMPLES.findIndex((item) => item.id === prev);
        return EXAMPLES[(index + 1) % EXAMPLES.length].id;
      }),
    5000,
    !touched,
  );
  const { flame, ...values } = controls.values;
  const props = { ...values, color: hexToRgb(flame) };
  const layout = EXAMPLE_LAYOUT[example];

  return (
    <>
      <div className="absolute inset-0 flex items-center justify-center bg-background pt-[min(18%,90px)] pb-14">
        <FlameWrap
          {...props}
          style={{ width: layout.width, height: layout.height }}
        >
          {example === "profile" ? (
            <FlameProfileCard radius={values.radius} />
          ) : example === "notification" ? (
            <FlameNotificationCard radius={values.radius} />
          ) : (
            <FlameStreakCard radius={values.radius} />
          )}
        </FlameWrap>
      </div>
      <StageTabs
        label="Example"
        position="bottom"
        options={EXAMPLES}
        value={example}
        onValueChange={(next) => {
          setTouched(true);
          setExample(next);
        }}
      />
      <DemoControls
        title="Flame Wrap controls"
        controls={controls}
        presets={PRESETS}
        snippet={{ component: "FlameWrap", props }}
      />
    </>
  );
}

export { PRESETS as FLAME_WRAP_PRESETS };
