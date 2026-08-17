"use client";

import { FileUp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";

import {
  color,
  custom,
  radio,
  scrub,
  toggle,
} from "@/components/demos/control-schema";
import { ColorRow, DemoControls } from "@/components/demos/demo-controls";
import { useDemoControls } from "@/hooks/use-demo-controls";
import { AsciiObject } from "@/lib/AsciiObject/AsciiObject";

const DEFAULT_MODEL = "/assets/models/duck.glb";
const DEFAULT_HIGHLIGHT = "#066aff";
const LIGHT_BACKGROUND = "#ffffff";
const DARK_BACKGROUND = "#0a0a0a";

const CHARSETS: Record<string, string | undefined> = {
  full: undefined,
  simple: " .:-=+*#%@",
  digits: " .012345689",
};

const CONTROLS = {
  src: custom(DEFAULT_MODEL),
  ascii: toggle("ASCII", true),
  colored: toggle("Scene colors", true, {
    when: (values) => values.ascii === true,
  }),
  invert: toggle("Invert", false, {
    when: (values) => values.ascii === true,
  }),
  autoRotate: toggle("Auto rotate", false),
  zoom: toggle("Scroll zoom", false),
  charsetChoice: radio(
    "Characters",
    "full",
    [
      { value: "full", label: "Full" },
      { value: "simple", label: "Simple" },
      { value: "digits", label: "Digits" },
    ],
    { when: (values) => values.ascii === true },
  ),
  cellSize: scrub("Cell size", 10, { min: 4, max: 28, step: 1, decimals: 0 }),
  cellAspect: scrub("Cell aspect", 0.6, { min: 0.35, max: 1.25, step: 0.05 }),
  contrast: scrub("Contrast", 1.5, {
    min: 0.5,
    max: 4,
    step: 0.1,
    decimals: 1,
  }),
  edgeContrast: scrub("Edge snap", 3, {
    min: 1,
    max: 6,
    step: 0.1,
    decimals: 1,
  }),
  exposure: scrub("Exposure", 1, { min: 0, max: 3, step: 0.05 }),
  color: color("Character color", "#ffffff", {
    when: (values) => values.colored === false,
  }),
  environmentIntensity: scrub("Environment", 1, {
    min: 0,
    max: 5,
    step: 0.1,
    decimals: 1,
  }),
  roughness: scrub("Roughness", 0.15, { min: 0, max: 1, step: 0.01 }),
  scale: scrub("Scale", 3, { min: 0.5, max: 6, step: 0.1, decimals: 1 }),
  xOffset: scrub("X offset", 0, { min: -3, max: 3, step: 0.1, decimals: 1 }),
  yOffset: scrub("Y offset", 0, { min: -3, max: 3, step: 0.1, decimals: 1 }),
  floatIntensity: scrub("Float", 2, { min: 0, max: 6, step: 0.1, decimals: 1 }),
  rotationIntensity: scrub("Rocking", 1, {
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
  highlight: color("Highlight", DEFAULT_HIGHLIGHT),
};

export function AsciiObjectDemo() {
  const { resolvedTheme } = useTheme();
  const controls = useDemoControls(CONTROLS);
  const { setValue } = controls;
  const {
    background: backgroundValue,
    highlight,
    src,
    ascii,
    colored,
    invert,
    autoRotate,
    zoom,
    charsetChoice,
    color: glyphColor,
    ...values
  } = controls.values;
  const background = backgroundValue === "" ? null : backgroundValue;
  const toggles = { ascii, colored, invert, autoRotate, zoom };
  const charset = CHARSETS[charsetChoice];
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

  return (
    <>
      <div className="relative h-[420px] overflow-hidden rounded-xl border border-border/60 sm:h-[520px]">
        <AsciiObject
          src={src}
          {...values}
          {...toggles}
          {...(charset ? { charset } : {})}
          color={glyphColor}
          background={background ?? ""}
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
        title="ASCII Object controls"
        snippet={{
          component: "AsciiObject",
          props: {
            src,
            ...values,
            ...toggles,
            ...(charset ? { charset } : {}),
            color: glyphColor,
            highlight,
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
