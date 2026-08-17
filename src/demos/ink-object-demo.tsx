"use client";

import { FileUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";

import {
  color,
  custom,
  scrub,
  toggle,
} from "@/components/demos/control-schema";
import { ColorRow, DemoControls } from "@/components/demos/demo-controls";
import { useDemoControls } from "@/hooks/use-demo-controls";
import { InkObject } from "@/lib/InkObject/InkObject";

const DEFAULT_MODEL = "/assets/models/duck.glb";
const DEFAULT_HIGHLIGHT = "#066aff";
const LIGHT_BACKGROUND = "#ffffff";
const DARK_BACKGROUND = "#0a0a0a";
const LIGHT_INK = "#111111";
const DARK_INK = "#f5f5f5";
const AUTO_INK = "auto";

const whenInk = (values: Record<string, string | number | boolean>) =>
  values.ink === true;

const CONTROLS = {
  src: custom(DEFAULT_MODEL),
  ink: toggle("Ink", true),
  invert: toggle("Invert", false, { when: whenInk }),
  autoRotate: toggle("Auto rotate", false),
  zoom: toggle("Scroll zoom", false),
  lineSpacing: scrub("Line spacing", 8, {
    min: 3,
    max: 32,
    step: 1,
    decimals: 0,
    when: whenInk,
  }),
  strokeWeight: scrub("Stroke weight", 1, {
    min: 0.1,
    max: 1.5,
    step: 0.05,
    when: whenInk,
  }),
  angle: scrub("Angle", 0, {
    min: -90,
    max: 90,
    step: 1,
    decimals: 0,
    when: whenInk,
  }),
  dashLength: scrub("Dash length", 14, {
    min: 4,
    max: 140,
    step: 1,
    decimals: 0,
    when: whenInk,
  }),
  variation: scrub("Dash breakup", 1, {
    min: 0,
    max: 2,
    step: 0.05,
    when: whenInk,
  }),
  bleed: scrub("Bleed", 0.35, { min: 0, max: 1, step: 0.01, when: whenInk }),
  grain: scrub("Grain", 0.32, { min: 0, max: 1, step: 0.01, when: whenInk }),
  wobble: scrub("Wobble", 0.3, { min: 0, max: 1, step: 0.01, when: whenInk }),
  relief: scrub("Relief", 0.5, { min: 0, max: 2, step: 0.05, when: whenInk }),
  contrast: scrub("Contrast", 2.2, {
    min: 0.2,
    max: 6,
    step: 0.1,
    decimals: 1,
    when: whenInk,
  }),
  threshold: scrub("Threshold", 0.2, {
    min: 0,
    max: 1,
    step: 0.01,
    when: whenInk,
  }),
  softness: scrub("Softness", 0.4, {
    min: 0,
    max: 1,
    step: 0.01,
    when: whenInk,
  }),
  environmentIntensity: scrub("Environment", 0.5, {
    min: 0,
    max: 5,
    step: 0.1,
    decimals: 1,
  }),
  roughness: scrub("Roughness", 0.35, { min: 0, max: 1, step: 0.01 }),
  depth: scrub("Depth", 0.08, { min: 0.01, max: 0.8, step: 0.01 }),
  scale: scrub("Scale", 3, { min: 0.5, max: 6, step: 0.1, decimals: 1 }),
  xOffset: scrub("X offset", 0, { min: -3, max: 3, step: 0.1, decimals: 1 }),
  yOffset: scrub("Y offset", 0, { min: -3, max: 3, step: 0.1, decimals: 1 }),
  floatIntensity: scrub("Float", 0, { min: 0, max: 6, step: 0.1, decimals: 1 }),
  rotationIntensity: scrub("Rocking", 0, {
    min: 0,
    max: 4,
    step: 0.1,
    decimals: 1,
  }),
  floatSpeed: scrub("Float speed", 2, {
    min: 0,
    max: 8,
    step: 0.1,
    decimals: 1,
  }),
  fov: scrub("Field of view", 65, { min: 20, max: 100, step: 1, decimals: 0 }),
  cameraDistance: scrub("Camera distance", 4.2, {
    min: 2,
    max: 10,
    step: 0.1,
    decimals: 1,
  }),
  background: custom(""),
  inkColor: color("Ink color", AUTO_INK, {
    auto: { label: "Auto", swatch: LIGHT_INK },
    when: whenInk,
  }),
  highlight: color("Highlight", DEFAULT_HIGHLIGHT),
};

export function InkObjectDemo() {
  const { resolvedTheme } = useTheme();
  const controls = useDemoControls(CONTROLS);
  const { setValue } = controls;
  const {
    background: backgroundValue,
    inkColor: inkColorValue,
    highlight,
    src,
    ink,
    invert,
    autoRotate,
    zoom,
    ...values
  } = controls.values;
  const background = backgroundValue === "" ? null : backgroundValue;
  const toggles = { ink, invert, autoRotate, zoom };
  const isDark = resolvedTheme === "dark";
  const inkColor =
    inkColorValue === AUTO_INK
      ? isDark
        ? DARK_INK
        : LIGHT_INK
      : inkColorValue;
  const [urlDraft, setUrlDraft] = useState(src);
  const [status, setStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const objectUrlRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    };
  }, []);

  const applySrc = (next: string) => {
    if (!next || next === src) return;
    setStatus("loading");
    setValue("src", next);
  };

  const applyUrl = () => {
    const next = urlDraft.trim();
    if (objectUrlRef.current && next !== objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    applySrc(next);
  };

  const applyFile = (file: File) => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    setUrlDraft(file.name);
    applySrc(url);
  };

  const swatchBackground =
    background ?? (isDark ? DARK_BACKGROUND : LIGHT_BACKGROUND);

  return (
    <>
      <div className="relative h-[420px] overflow-hidden rounded-xl border border-border/60 sm:h-[520px]">
        <InkObject
          src={src}
          {...values}
          {...toggles}
          background={background ?? ""}
          inkColor={inkColor}
          highlight={highlight}
          onLoad={() => setStatus("ready")}
          onError={() => setStatus("error")}
          className="h-full w-full"
        />
        {status !== "ready" ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center">
            <span className="rounded-full border border-border/60 bg-background/80 px-3 py-1 text-[12px] font-medium text-muted-foreground backdrop-blur-sm">
              {status === "loading"
                ? "Loading asset…"
                : "Could not load that asset. Check the URL or try another file."}
            </span>
          </div>
        ) : null}
      </div>

      <DemoControls
        title="Ink Object controls"
        snippet={{
          component: "InkObject",
          props: { src, ...values, ...toggles, inkColor, highlight },
        }}
        controls={controls}
        portal
        onReset={() => {
          setUrlDraft(DEFAULT_MODEL);
          if (objectUrlRef.current) {
            URL.revokeObjectURL(objectUrlRef.current);
            objectUrlRef.current = null;
          }
          if (src !== DEFAULT_MODEL) setStatus("loading");
        }}
        rows={{
          src: (
            <div className="flex w-full shrink-0 items-center gap-1.5">
              <input
                type="text"
                value={urlDraft}
                onChange={(e) => setUrlDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") applyUrl();
                }}
                onBlur={applyUrl}
                placeholder="Asset URL (.glb / .gltf / .svg / .png)"
                aria-label="Asset URL"
                spellCheck={false}
                className="h-8 w-full min-w-0 rounded-lg bg-muted/60 px-3 text-[12.5px] font-medium text-foreground/90 outline-none transition-colors placeholder:text-muted-foreground hover:bg-muted/80 focus:bg-muted/80"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Open an asset file"
                title="Open an asset file"
                className="inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-muted/60 text-muted-foreground transition-colors hover:bg-muted/80 hover:text-foreground"
              >
                <FileUp aria-hidden className="size-3.5" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".glb,.gltf,.svg,.png,.jpg,.jpeg,.webp,.gif,model/gltf-binary,model/gltf+json,image/svg+xml,image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) applyFile(file);
                  e.target.value = "";
                }}
              />
            </div>
          ),
          background: (
            <ColorRow
              label="Paper"
              value={swatchBackground}
              onValueChange={(next) => setValue("background", next)}
              onReset={
                background !== null
                  ? () => setValue("background", "")
                  : undefined
              }
            />
          ),
        }}
      />
    </>
  );
}
