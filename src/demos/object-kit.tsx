"use client";

import { FileUp, Plus } from "@/components/icons";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTheme } from "next-themes";

import { color, scrub, toggle } from "@/components/demos/control-schema";
import { SegmentedRow, TRACK_BUTTON } from "@/components/demos/segmented-row";

export const MODELS = [
  { id: "bolt", label: "Bolt", src: "/assets/models/bolt.glb" },
  { id: "duck", label: "Duck", src: "/assets/models/duck.glb" },
  { id: "logo", label: "Logo", src: "/logo-icon.svg" },
] as const;

export const BOLT_MODEL = MODELS[0].src;
export const DUCK_MODEL = MODELS[1].src;
export const LOGO_SVG = MODELS[2].src;

const ACCEPT =
  ".glb,.gltf,.svg,.png,.jpg,.jpeg,.webp,.gif,model/gltf-binary,model/gltf+json,image/svg+xml,image/png,image/jpeg,image/webp,image/gif";

export type AssetStatus = "loading" | "ready" | "error";

export function useModelSource({
  src,
  setSrc,
  defaultSrc,
}: {
  src: string;
  setSrc: (next: string) => void;
  defaultSrc: string;
}) {
  const [status, setStatus] = useState<AssetStatus>("loading");
  const [draft, setDraft] = useState(src);
  const [sourceOpen, setSourceOpen] = useState(false);
  const objectUrlRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(
    () => () => {
      if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    },
    [],
  );

  const apply = (next: string, label = next) => {
    if (!next || next === src) return;
    if (objectUrlRef.current && next !== objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setDraft(label);
    setStatus("loading");
    setSrc(next);
  };

  const applyFile = (file: File) => {
    if (objectUrlRef.current) URL.revokeObjectURL(objectUrlRef.current);
    const url = URL.createObjectURL(file);
    objectUrlRef.current = url;
    setDraft(file.name);
    setStatus("loading");
    setSrc(url);
  };

  const onReset = () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setDraft(defaultSrc);
    if (src !== defaultSrc) setStatus("loading");
  };

  const preset = MODELS.find((model) => model.src === src)?.id ?? "custom";

  const showSource = sourceOpen || preset === "custom";
  const row: ReactNode = (
    <div className="flex w-full min-w-0 shrink-0 flex-col">
      <SegmentedRow
        label="Model"
        options={[
          ...MODELS.map((model) => ({ id: model.id, label: model.label })),
          ...(preset === "custom" ? [{ id: "custom", label: "Yours" }] : []),
        ]}
        value={preset}
        onValueChange={(id) => {
          const model = MODELS.find((entry) => entry.id === id);
          if (model) {
            apply(model.src);
            setSourceOpen(false);
          }
        }}
        trailing={
          <button
            type="button"
            onClick={() => setSourceOpen((open) => !open)}
            aria-expanded={showSource}
            aria-label="Use your own model or image"
            title="Use your own model or image"
            className={TRACK_BUTTON}
          >
            <Plus
              aria-hidden
              className={`size-3.5 transition-transform duration-200 ease-out motion-reduce:transition-none ${showSource ? "rotate-45" : ""}`}
            />
          </button>
        }
      />
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none"
        style={{ gridTemplateRows: showSource ? "1fr" : "0fr" }}
      >
        <div className="-m-1 min-h-0 overflow-hidden p-1" inert={!showSource}>
          <div className="flex w-full items-center gap-1.5 pt-1.5">
            <input
              type="text"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") apply(draft.trim());
              }}
              onBlur={() => apply(draft.trim())}
              placeholder="Paste a .glb, .svg or image URL"
              aria-label="Model or image URL"
              spellCheck={false}
              className="h-8 w-full min-w-0 rounded-control bg-muted/60 px-3 text-[12.5px] font-medium text-foreground/90 transition-colors duration-150 ease-out placeholder:text-muted-foreground hover:bg-muted/80 focus:bg-muted/80"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="pressable inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-control bg-muted/60 px-2.5 text-[12.5px] font-medium text-muted-foreground transition-colors duration-150 ease-out hover:bg-muted/80 hover:text-foreground"
            >
              <FileUp aria-hidden className="size-3.5" />
              Browse
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) applyFile(file);
                event.target.value = "";
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );

  return {
    status,
    onLoad: () => setStatus("ready"),
    onError: () => setStatus("error"),
    onReset,
    row,
  };
}

export function ModelStatus({ status }: { status: AssetStatus }) {
  if (status === "ready") return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-30 flex justify-center px-3">
      <span className="surface-floating inline-flex h-8 items-center rounded-control px-3 text-[12px] font-medium text-muted-foreground">
        {status === "loading"
          ? "Loading model…"
          : "Couldn't load that asset. Check the URL or try another file."}
      </span>
    </div>
  );
}

export function backgroundControl(group: string) {
  return color("Background", "", {
    auto: { label: "Page", swatch: "var(--background)" },
    group,
  });
}

export function stagingControls(defaults: {
  floatIntensity: number;
  rotationIntensity: number;
  floatSpeed: number;
  fov: number;
  cameraDistance: number;
  xOffset: number;
  yOffset: number;
}) {
  const motion = { group: "Motion", advanced: true } as const;
  const camera = { group: "Camera", advanced: true } as const;
  return {
    floatIntensity: scrub("Float", defaults.floatIntensity, {
      min: 0,
      max: 6,
      step: 0.1,
      decimals: 1,
      ...motion,
    }),
    rotationIntensity: scrub("Rocking", defaults.rotationIntensity, {
      min: 0,
      max: 4,
      step: 0.1,
      decimals: 1,
      ...motion,
    }),
    floatSpeed: scrub("Float speed", defaults.floatSpeed, {
      min: 0,
      max: 8,
      step: 0.1,
      decimals: 1,
      ...motion,
    }),
    zoom: toggle("Scroll to zoom", false, camera),
    fov: scrub("Field of view", defaults.fov, {
      min: 20,
      max: 100,
      step: 1,
      decimals: 0,
      ...camera,
    }),
    cameraDistance: scrub("Camera distance", defaults.cameraDistance, {
      min: 2,
      max: 10,
      step: 0.1,
      decimals: 1,
      ...camera,
    }),
    xOffset: scrub("X offset", defaults.xOffset, {
      min: -3,
      max: 3,
      step: 0.1,
      decimals: 1,
      ...camera,
    }),
    yOffset: scrub("Y offset", defaults.yOffset, {
      min: -3,
      max: 3,
      step: 0.1,
      decimals: 1,
      ...camera,
    }),
  };
}

const LIGHT_BACKGROUND = "#ffffff";
const DARK_BACKGROUND = "#0a0a0a";

export function useThemeBackground() {
  const { resolvedTheme } = useTheme();
  return resolvedTheme === "dark" ? DARK_BACKGROUND : LIGHT_BACKGROUND;
}
