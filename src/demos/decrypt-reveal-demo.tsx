"use client";

import { Fingerprint, KeyRound, Lock, ShieldCheck } from "@/components/icons";
import { useLayoutEffect, useState } from "react";

import { color, presets, scrub } from "@/components/demos/control-schema";
import { DemoControls } from "@/components/demos/demo-controls";
import { StageHint } from "@/components/demos/demo-stage";
import { useDemoSurface, type DemoProps } from "@/components/demos/demo-surface";
import { useDemoControls } from "@/hooks/use-demo-controls";
import { DecryptReveal } from "@/components/docs/live/DecryptReveal";

const CONTROLS = {
  radius: scrub("Reveal size", 400, {
    min: 60,
    max: 600,
    step: 10,
    decimals: 0,
    group: "Reveal",
  }),
  softness: scrub("Edge softness", 0.5, { min: 0.05, max: 1, step: 0.05, group: "Reveal" }),
  smoothing: scrub("Follow lag", 0.2, { min: 0, max: 1, step: 0.05, group: "Reveal" }),
  passthrough: scrub("Show-through", 0.15, { min: 0, max: 1, step: 0.02, group: "Reveal" }),
  color: color("Cipher color", "#4ade80", { group: "Cipher" }),
  cell: scrub("Cell size", 10, { min: 6, max: 32, step: 1, decimals: 0, group: "Cipher" }),
  colored: scrub("Scene colors", 1, { min: 0, max: 1, step: 0.05, group: "Cipher" }),
  scramble: scrub("Scramble", 0.1, { min: 0, max: 1, step: 0.02, group: "Cipher" }),
  edgeGlow: scrub("Edge glow", 2, { min: 0, max: 3, step: 0.05, group: "Edge" }),
  edgeWidth: scrub("Edge width", 0.2, { min: 0, max: 1, step: 0.02, group: "Edge" }),
  edgeTint: scrub("Edge tint", 0.75, { min: 0, max: 1, step: 0.02, group: "Edge" }),
  edgeFlicker: scrub("Edge flicker", 1, {
    min: 0,
    max: 1,
    step: 0.02,
    group: "Edge",
    advanced: true,
  }),
  aberration: scrub("Color fringe", 10, {
    min: 0,
    max: 24,
    step: 0.5,
    group: "Edge",
    advanced: true,
  }),
  scrambleSpeed: scrub("Scramble speed", 6, {
    min: 0,
    max: 30,
    step: 0.5,
    decimals: 1,
    group: "Cipher",
    advanced: true,
  }),
  aspect: scrub("Cell aspect", 0.75, {
    min: 0.35,
    max: 1.25,
    step: 0.05,
    group: "Cipher",
    advanced: true,
  }),
  legibility: scrub("Legibility", 1, { min: 0, max: 1, step: 0.05, group: "Tone", advanced: true }),
  brightness: scrub("Brightness", 1, { min: 0.2, max: 3, step: 0.05, group: "Tone", advanced: true }),
  contrast: scrub("Contrast", 1, { min: 0.3, max: 3, step: 0.05, group: "Tone", advanced: true }),
  exposure: scrub("Exposure", 1, { min: 0.2, max: 3, step: 0.05, group: "Tone", advanced: true }),
  threshold: scrub("Threshold", 0.005, {
    min: 0.005,
    max: 0.3,
    step: 0.005,
    decimals: 3,
    group: "Tone",
    advanced: true,
  }),
};

const PRESETS = presets(CONTROLS, [
  { label: "Spotlight", values: { radius: 170, softness: 0.25, edgeGlow: 2.6 } },
  { label: "Terminal", values: { colored: 0, color: "#22c55e", scramble: 0.6 } },
  { label: "Subtle", values: { passthrough: 0.5, edgeGlow: 0.6, aberration: 2 } },
]);

const TILE = "rounded-control bg-muted/60 p-3";
const TILE_LABEL = "flex items-center gap-1.5 text-[12.5px] font-medium text-muted-foreground";

function DossierScene() {
  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden bg-background px-4 py-6 sm:px-6">
      <div className="w-full max-w-md rounded-[calc(var(--radius)+0.5rem)] bg-muted/45 p-2 text-left text-foreground">
        <div className="flex items-center gap-3 px-3 pt-2 pb-3.5">
          <span className="grid size-10 shrink-0 place-items-center rounded-control bg-background">
            <Lock aria-hidden className="size-4.5 text-emerald-500" />
          </span>
          <div className="min-w-0">
            <p className="text-[15px] leading-5 font-medium tracking-[-0.01em]">Classified dossier</p>
            <p className="mt-0.5 text-[12.5px] text-muted-foreground">Clearance level 5, eyes only</p>
          </div>
          <span className="ml-auto flex shrink-0 items-center gap-1.5 text-[12px] text-muted-foreground">
            <span aria-hidden className="size-1.5 rounded-full bg-emerald-500" />
            Encrypted
          </span>
        </div>

        <div className="flex flex-col gap-3 rounded-control bg-background p-3">
          <div className="grid grid-cols-2 gap-3">
            <div className={TILE}>
              <p className={TILE_LABEL}>
                <Fingerprint aria-hidden className="size-3.5" />
                Subject
              </p>
              <p className="mt-2 text-[14px] font-medium">Agent Nightfall</p>
              <p className="text-[12px] text-muted-foreground">ID 7729-BRAVO</p>
            </div>
            <div className={TILE}>
              <p className={TILE_LABEL}>
                <KeyRound aria-hidden className="size-3.5" />
                Cipher
              </p>
              <p className="mt-2 text-[14px] font-medium">AES-256-GCM</p>
              <p className="text-[12px] text-muted-foreground">Rotated 6h ago</p>
            </div>
          </div>
          <div className={TILE}>
            <p className={TILE_LABEL}>Last transmission</p>
            <p className="mt-2 text-[13.5px] leading-relaxed">
              Package secured at the drop point. Extraction window opens at
              02:00 local. Awaiting confirmation on the second key holder.
            </p>
          </div>
        </div>

        <button
          type="button"
          className="pressable mt-2 inline-flex h-10 w-full cursor-pointer items-center justify-center gap-2 rounded-control bg-foreground text-[13.5px] font-medium text-background transition-[opacity,transform] duration-150 ease-out hover:opacity-90"
        >
          <ShieldCheck aria-hidden className="size-3.5" />
          Grant clearance
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

export function DecryptRevealDemo({ children }: DemoProps) {
  const controls = useDemoControls(CONTROLS);
  const background = usePageBackground();
  const surface = useDemoSurface(children, <DossierScene />);
  const props = controls.values;

  return (
    <>
      <DecryptReveal {...props} background={background} {...surface.props} />
      <StageHint label="Move your cursor to decrypt" touchLabel="Drag to decrypt" />
      <DemoControls
        title="Decrypt Reveal controls"
        controls={controls}
        presets={PRESETS}
        snippet={{ component: "DecryptReveal", props: { ...props, background } }}
      />
    </>
  );
}
