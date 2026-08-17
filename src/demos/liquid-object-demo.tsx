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
import { LiquidObject } from "@/lib/LiquidObject/LiquidObject";

const DEFAULT_MODEL = "/assets/models/duck.glb";
const LIGHT_BACKGROUND = "#ffffff";
const DARK_BACKGROUND = "#0a0a0a";

const CONTROLS = {
  src: custom(DEFAULT_MODEL),
  orbit: toggle("Orbit", true),
  autoRotate: toggle("Auto rotate", false),
  zoom: toggle("Scroll zoom", false),
  distortion: scrub("Distortion", 2, { min: 0, max: 3, step: 0.02 }),
  aberration: scrub("Color fringe", 0.75, { min: 0, max: 1, step: 0.01 }),
  grain: scrub("Grain", 1, { min: 0, max: 1, step: 0.01 }),
  sheen: scrub("Shine", 1.6, { min: 0, max: 2, step: 0.02 }),
  cursorSize: scrub("Cursor size", 1, { min: 0.05, max: 1, step: 0.01 }),
  persistence: scrub("Ripples", 0.6, { min: 0, max: 1, step: 0.01 }),
  swirl: scrub("Swirl", 0.5, { min: 0, max: 1, step: 0.01 }),
  iridescence: scrub("Iridescence", 1.5, { min: 0, max: 2, step: 0.02 }),
  splash: scrub("Splash", 1.2, { min: 0, max: 2, step: 0.02 }),
  ambient: scrub("Idle drift", 1, { min: 0, max: 2, step: 0.02 }),
  wobble: scrub("Wobble", 0, { min: 0, max: 2, step: 0.02 }),
  depth: scrub("Depth", 0.05, { min: 0.02, max: 1, step: 0.01 }),
  bevel: scrub("Bevel", 0.5, { min: 0, max: 1, step: 0.01 }),
  metallic: scrub("Metallic", 0.15, { min: 0, max: 1, step: 0.01 }),
  brightness: scrub("Brightness", 1, { min: 0, max: 2, step: 0.02 }),
  saturation: scrub("Saturation", 1.2, { min: 0, max: 2, step: 0.02 }),
  environmentIntensity: scrub("Environment", 1, {
    min: 0,
    max: 5,
    step: 0.1,
    decimals: 1,
  }),
  scale: scrub("Scale", 3, { min: 0.5, max: 6, step: 0.1, decimals: 1 }),
  xOffset: scrub("X offset", 0, { min: -3, max: 3, step: 0.1, decimals: 1 }),
  yOffset: scrub("Y offset", -0.2, { min: -3, max: 3, step: 0.1, decimals: 1 }),
  floatIntensity: scrub("Float", 1, { min: 0, max: 6, step: 0.1, decimals: 1 }),
  rotationIntensity: scrub("Rocking", 0.5, {
    min: 0,
    max: 4,
    step: 0.1,
    decimals: 1,
  }),
  floatSpeed: scrub("Float speed", 1.5, {
    min: 0,
    max: 8,
    step: 0.1,
    decimals: 1,
  }),
  fov: scrub("Field of view", 60, { min: 20, max: 100, step: 1, decimals: 0 }),
  cameraDistance: scrub("Camera distance", 4, {
    min: 2,
    max: 10,
    step: 0.1,
    decimals: 1,
  }),
  highlight: color("Highlight", "#ffffff"),
  tint: custom(""),
  background: custom(""),
};

export function LiquidObjectDemo() {
  const { resolvedTheme } = useTheme();
  const controls = useDemoControls(CONTROLS);
  const { setValue } = controls;
  const {
    background: backgroundValue,
    src,
    orbit,
    autoRotate,
    ...values
  } = controls.values;
  const background = backgroundValue === "" ? null : backgroundValue;
  const toggles = { orbit, autoRotate };
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
    background ??
    (resolvedTheme === "dark" ? DARK_BACKGROUND : LIGHT_BACKGROUND);
  const swatchTint = values.tint === "" ? "#ffffff" : values.tint;

  return (
    <>
      <div className="relative h-[420px] overflow-hidden rounded-xl border border-border/60 sm:h-[520px]">
        <LiquidObject
          src={src}
          {...values}
          {...toggles}
          background={background ?? ""}
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
        title="Liquid Object controls"
        snippet={{
          component: "LiquidObject",
          props: {
            src,
            ...values,
            ...toggles,
          },
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
          tint: (
            <ColorRow
              label="Tint"
              value={swatchTint}
              onValueChange={(next) => setValue("tint", next)}
              onReset={
                values.tint !== "" ? () => setValue("tint", "") : undefined
              }
            />
          ),
          background: (
            <ColorRow
              label="Background"
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
