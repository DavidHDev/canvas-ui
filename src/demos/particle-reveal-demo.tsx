"use client";

import { Send } from "@/components/icons";
import { useLayoutEffect, useState } from "react";

import { presets, scrub } from "@/components/demos/control-schema";
import { DemoControls } from "@/components/demos/demo-controls";
import { StageHint } from "@/components/demos/demo-stage";
import { useDemoSurface, type DemoProps } from "@/components/demos/demo-surface";
import { useDemoControls } from "@/hooks/use-demo-controls";
import { ParticleReveal } from "@/components/docs/live/ParticleReveal";

const CONTROLS = {
  radius: scrub("Reveal size", 500, {
    min: 60,
    max: 600,
    step: 10,
    decimals: 0,
    group: "Reveal",
  }),
  softness: scrub("Edge softness", 0.75, { min: 0.05, max: 1, step: 0.05, group: "Reveal" }),
  smoothing: scrub("Follow lag", 0.25, { min: 0, max: 1, step: 0.05, group: "Reveal" }),
  fade: scrub("Particle fade", 0.85, { min: 0, max: 1, step: 0.05, group: "Reveal" }),
  size: scrub("Particle size", 1, { min: 0.5, max: 3, step: 0.25, group: "Particles" }),
  scatter: scrub("Scatter", 25, {
    min: 0,
    max: 200,
    step: 5,
    decimals: 0,
    group: "Particles",
  }),
  drift: scrub("Drift", 1, { min: 0, max: 2, step: 0.1, decimals: 1, group: "Particles" }),
  bend: scrub("Swirl", 50, { min: 0, max: 240, step: 10, decimals: 0, group: "Particles" }),
  aberration: scrub("Color fringe", 40, {
    min: 0,
    max: 80,
    step: 2,
    decimals: 0,
    group: "Particles",
    advanced: true,
  }),
  threshold: scrub("Threshold", 0.1, {
    min: 0,
    max: 0.3,
    step: 0.01,
    group: "Particles",
    advanced: true,
  }),
};

const PRESETS = presets(CONTROLS, [
  { label: "Spotlight", values: { radius: 180, softness: 0.35 } },
  { label: "Stardust", values: { size: 0.5, scatter: 120, drift: 1.8, aberration: 10 } },
  { label: "Vortex", values: { bend: 220, scatter: 80 } },
]);

const AVATAR_URL =
  "https://pbs.twimg.com/profile_images/2122817143783776257/0VUcNXYh_400x400.jpg";

const FIELD =
  "w-full rounded-control bg-muted/60 px-3 text-[13px] text-foreground outline-none transition-colors duration-150 ease-out placeholder:text-muted-foreground hover:bg-muted focus-visible:bg-muted";

function ContactScene() {
  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden bg-background px-4 py-6 sm:px-6">
      <div className="w-full max-w-md rounded-[calc(var(--radius)+0.5rem)] bg-muted/45 p-2 text-left text-foreground">
        <div className="flex items-center gap-3 px-3 pt-2 pb-3.5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={AVATAR_URL}
            crossOrigin="anonymous"
            alt="David's profile picture"
            className="size-10 shrink-0 rounded-full object-cover"
          />
          <div className="min-w-0">
            <p className="text-[15px] leading-5 font-medium tracking-[-0.01em]">Contact David</p>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">Typically replies within a day</p>
          </div>
          <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[12px] text-muted-foreground">
            <span aria-hidden className="size-1.5 rounded-full bg-emerald-500" />
            Online
          </span>
        </div>

        <div className="flex flex-col gap-3.5 rounded-control bg-background p-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[12.5px] font-medium text-muted-foreground">Name</span>
              <input placeholder="Ada Lovelace" className={`${FIELD} h-9`} />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[12.5px] font-medium text-muted-foreground">Email</span>
              <input type="email" placeholder="ada@example.com" className={`${FIELD} h-9`} />
            </label>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-medium text-muted-foreground">Message</span>
            <textarea
              placeholder="Hey David, I have an idea for a new canvas component..."
              className={`${FIELD} min-h-24 resize-none py-2.5 leading-5`}
            />
          </label>
        </div>

        <button
          type="button"
          className="pressable mt-2 inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-control bg-foreground text-[13.5px] font-medium text-background transition-[opacity,transform] duration-150 ease-out hover:opacity-90"
        >
          <Send aria-hidden className="size-3.5" />
          Send message
        </button>
      </div>
    </div>
  );
}

function usePageBackground() {
  const [pageBg, setPageBg] = useState("#000000");
  useLayoutEffect(() => {
    const read = () => setPageBg(getComputedStyle(document.body).backgroundColor);
    read();
    const observer = new MutationObserver(read);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });
    return () => observer.disconnect();
  }, []);
  return pageBg;
}

export function ParticleRevealDemo({ children }: DemoProps) {
  const controls = useDemoControls(CONTROLS);
  const background = usePageBackground();
  const surface = useDemoSurface(children, <ContactScene />);
  const props = controls.values;

  return (
    <>
      <ParticleReveal {...props} background={background} {...surface.props} />
      <StageHint
        label="Move your cursor to assemble the form"
        touchLabel="Drag to assemble the form"
      />
      <DemoControls
        title="Particle Reveal controls"
        controls={controls}
        presets={PRESETS}
        snippet={{ component: "ParticleReveal", props: { ...props, background } }}
      />
    </>
  );
}
