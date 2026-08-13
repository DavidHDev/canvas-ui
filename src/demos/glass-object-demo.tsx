"use client";

import { FileUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { useReducedMotion } from "motion/react";

import {
  color,
  custom,
  scrub,
  toggle,
} from "@/components/demos/control-schema";
import { ColorRow, DemoControls } from "@/components/demos/demo-controls";
import { useDemoControls } from "@/hooks/use-demo-controls";
import { GlassObject } from "@/lib/GlassObject/GlassObject";
import { DEMO_IMAGES } from "./demo-image-cycler";

const DEFAULT_MODEL = "/logo-icon.svg";
const CLEAR_TINT = "clear";
const LIGHT_BACKGROUND = "#ffffff";
const DARK_BACKGROUND = "#0a0a0a";

const CONTROLS = {
  src: custom(DEFAULT_MODEL),
  backdrop: toggle("Photo backdrop", true),
  autoRotate: toggle("Auto rotate", false),
  zoom: toggle("Scroll zoom", false),
  ior: scrub("Refraction", 1.75, { min: 1, max: 2.33, step: 0.01 }),
  thickness: scrub("Thickness", 4, { min: 0, max: 4, step: 0.05 }),
  roughness: scrub("Frost", 0.25, { min: 0, max: 1, step: 0.01 }),
  dispersion: scrub("Dispersion", 1.5, { min: 0, max: 2, step: 0.05 }),
  clearcoat: scrub("Clearcoat", 0.5, { min: 0, max: 1, step: 0.05 }),
  tintDensity: scrub("Tint density", 2, { min: 0.05, max: 4, step: 0.05 }),
  depth: scrub("Depth", 0.1, { min: 0.04, max: 0.8, step: 0.01 }),
  bevel: scrub("Bevel", 1, { min: 0, max: 1, step: 0.05 }),
  environmentIntensity: scrub("Lighting", 1, { min: 0, max: 3, step: 0.05 }),
  scale: scrub("Scale", 3, { min: 0.5, max: 6, step: 0.1, decimals: 1 }),
  xOffset: scrub("X offset", 0, { min: -3, max: 3, step: 0.1, decimals: 1 }),
  yOffset: scrub("Y offset", 0, { min: -3, max: 3, step: 0.1, decimals: 1 }),
  floatIntensity: scrub("Float", 1, { min: 0, max: 6, step: 0.1, decimals: 1 }),
  rotationIntensity: scrub("Rocking", 1, { min: 0, max: 4, step: 0.1, decimals: 1 }),
  floatSpeed: scrub("Float speed", 2, { min: 0, max: 8, step: 0.1, decimals: 1 }),
  fov: scrub("Field of view", 55, { min: 20, max: 100, step: 1, decimals: 0 }),
  cameraDistance: scrub("Camera distance", 4, { min: 2, max: 10, step: 0.1, decimals: 1 }),
  background: custom(""),
  tint: color("Tint", CLEAR_TINT, { auto: { label: "Clear" } }),
  highlight: color("Highlight", "#066aff"),
};

export function GlassObjectDemo() {
  const { resolvedTheme } = useTheme();
  const shouldReduceMotion = useReducedMotion();
  const controls = useDemoControls(CONTROLS);
  const {
    src,
    backdrop,
    autoRotate,
    zoom,
    background,
    tint,
    highlight,
    ...values
  } = controls.values;
  const { setValue } = controls;

  const [urlDraft, setUrlDraft] = useState(src);
  const [imageIndex, setImageIndex] = useState(0);
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

  useEffect(() => {
    if (!backdrop || shouldReduceMotion) return;

    let timer: ReturnType<typeof setInterval> | null = null;
    const stop = () => {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
    };
    const start = () => {
      if (timer !== null || document.hidden) return;
      timer = setInterval(
        () => setImageIndex((prev) => (prev + 1) % DEMO_IMAGES.length),
        10000,
      );
    };
    const onVisibilityChange = () => {
      if (document.hidden) stop();
      else start();
    };

    start();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [backdrop, shouldReduceMotion]);

  const effectiveBackground =
    background !== ""
      ? background
      : resolvedTheme === "dark"
        ? DARK_BACKGROUND
        : LIGHT_BACKGROUND;

  return (
    <>
      <div className="relative h-[420px] overflow-hidden rounded-xl border border-border/60 sm:h-[520px]">
        <GlassObject
          src={src}
          {...values}
          autoRotate={autoRotate}
          zoom={zoom}
          tint={tint === CLEAR_TINT ? "" : tint}
          highlight={highlight}
          background={effectiveBackground}
          backgroundImage={backdrop ? DEMO_IMAGES[imageIndex] : ""}
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
        title="Glass Object controls"
        controls={controls}
        portal
        snippet={{
          component: "GlassObject",
          props: {
            src,
            ...values,
            autoRotate,
            zoom,
            tint: tint === CLEAR_TINT ? "" : tint,
            highlight,
            backgroundImage: backdrop ? DEMO_IMAGES[imageIndex] : "",
          },
        }}
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
              label="Background"
              value={effectiveBackground}
              onValueChange={(next) => setValue("background", next)}
              onReset={
                background !== "" ? () => setValue("background", "") : undefined
              }
            />
          ),
        }}
      />
    </>
  );
}
