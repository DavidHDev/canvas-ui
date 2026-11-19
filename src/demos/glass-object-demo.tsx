"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";

import {
  color,
  custom,
  presets,
  scrub,
  toggle,
} from "@/components/demos/control-schema";
import { ColorRow, DemoControls } from "@/components/demos/demo-controls";
import { StageHint } from "@/components/demos/demo-stage";
import { useDemoControls } from "@/hooks/use-demo-controls";
import { GlassObject } from "@/components/docs/live/GlassObject";
import {
  LOGO_SVG,
  ModelStatus,
  backgroundControl,
  stagingControls,
  useModelSource,
  useThemeBackground,
} from "@/demos/object-kit";
import { PHOTOS, photoUrl } from "@/lib/demo-photo";

const DEFAULT_MODEL = LOGO_SVG;

const CONTROLS = {
  src: custom(DEFAULT_MODEL, { group: "Object" }),
  scale: scrub("Size", 3, { min: 0.5, max: 6, step: 0.1, decimals: 1, group: "Object" }),
  autoRotate: toggle("Auto rotate", false, { group: "Object" }),
  backdrop: toggle("Photo backdrop", true, { group: "Object" }),
  ior: scrub("Refraction", 1.75, { min: 1, max: 2.33, step: 0.01, group: "Glass" }),
  dispersion: scrub("Dispersion", 1.5, { min: 0, max: 2, step: 0.05, group: "Glass" }),
  roughness: scrub("Frost", 0.25, { min: 0, max: 1, step: 0.01, group: "Glass" }),
  thickness: scrub("Thickness", 4, { min: 0, max: 4, step: 0.05, group: "Glass" }),
  tint: color("Tint", "", { auto: { label: "Clear" }, group: "Glass" }),
  tintDensity: scrub("Tint density", 2, {
    min: 0.05,
    max: 4,
    step: 0.05,
    group: "Glass",
    when: (values) => values.tint !== "",
  }),
  environmentIntensity: scrub("Lighting", 1, { min: 0, max: 3, step: 0.05, group: "Light" }),
  clearcoat: scrub("Clearcoat", 0.5, { min: 0, max: 1, step: 0.05, group: "Light" }),
  highlight: color("Highlight", "#066aff", { group: "Light" }),
  background: backgroundControl("Light"),
  depth: scrub("Extrusion depth", 0.1, {
    min: 0.04,
    max: 0.8,
    step: 0.01,
    group: "Object",
    advanced: true,
  }),
  bevel: scrub("Bevel", 1, { min: 0, max: 1, step: 0.05, group: "Object", advanced: true }),
  ...stagingControls({
    floatIntensity: 1,
    rotationIntensity: 1,
    floatSpeed: 2,
    fov: 55,
    cameraDistance: 4,
    xOffset: 0,
    yOffset: 0,
  }),
};

const PRESETS = presets(CONTROLS, [
  { label: "Frosted", values: { roughness: 0.7, dispersion: 0.4, clearcoat: 1 } },
  { label: "Prism", values: { dispersion: 2, ior: 2.2, roughness: 0.05 } },
  { label: "Tinted", values: { tint: "#3b82f6", tintDensity: 1.2, roughness: 0.15 } },
]);

function usePhotoCycle(enabled: boolean) {
  const reduceMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!enabled || reduceMotion || PHOTOS.length < 2) return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer === null && !document.hidden) {
        timer = setInterval(() => setIndex((prev) => (prev + 1) % PHOTOS.length), 10000);
      }
    };
    const stop = () => {
      if (timer !== null) clearInterval(timer);
      timer = null;
    };
    const onVisibility = () => (document.hidden ? stop() : start());
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled, reduceMotion]);
  const { resolvedTheme } = useTheme();
  return photoUrl(index, resolvedTheme === "light" ? "light" : "dark");
}

export function GlassObjectDemo() {
  const controls = useDemoControls(CONTROLS);
  const { setValue } = controls;
  const themeBackground = useThemeBackground();
  const { src, backdrop, background, ...values } = controls.values;
  const photo = usePhotoCycle(backdrop);
  const model = useModelSource({
    src,
    setSrc: (next) => setValue("src", next),
    defaultSrc: DEFAULT_MODEL,
  });
  const props = {
    src,
    ...values,
    background: background || themeBackground,
    backgroundImage: backdrop ? photo : "",
  };

  return (
    <>
      <GlassObject
        {...props}
        onLoad={model.onLoad}
        onError={model.onError}
        className="absolute inset-0"
        style={{ position: "absolute" }}
      />
      <ModelStatus status={model.status} />
      {model.status === "ready" ? <StageHint gesture="drag" /> : null}
      <DemoControls
        title="Glass Object controls"
        controls={controls}
        presets={PRESETS}
        snippet={{ component: "GlassObject", props }}
        onReset={model.onReset}
        rows={{
          src: model.row,
          background: (
            <ColorRow
              label="Background"
              value={background || themeBackground}
              displayValue={background ? undefined : "Page"}
              onValueChange={(next) => setValue("background", next)}
              onReset={background ? () => setValue("background", "") : undefined}
            />
          ),
        }}
      />
    </>
  );
}

export { CONTROLS as GLASS_OBJECT_CONTROLS, PRESETS as GLASS_OBJECT_PRESETS };
