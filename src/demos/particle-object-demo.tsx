"use client";

import { color, custom, presets, scrub, toggle } from "@/components/demos/control-schema";
import { ColorRow, DemoControls } from "@/components/demos/demo-controls";
import { StageHint } from "@/components/demos/demo-stage";
import { useDemoControls } from "@/hooks/use-demo-controls";
import { ParticleObject } from "@/components/docs/live/ParticleObject";
import {
  DUCK_MODEL,
  ModelStatus,
  backgroundControl,
  stagingControls,
  useModelSource,
  useThemeBackground,
} from "@/demos/object-kit";

const DEFAULT_MODEL = DUCK_MODEL;

const CONTROLS = {
  src: custom(DEFAULT_MODEL, { group: "Object" }),
  scale: scrub("Size", 3, { min: 0.5, max: 6, step: 0.1, decimals: 1, group: "Object" }),
  autoRotate: toggle("Auto rotate", false, { group: "Object" }),
  count: scrub("Particles", 14000, {
    min: 1000,
    max: 60000,
    step: 1000,
    decimals: 0,
    group: "Particles",
  }),
  size: scrub("Particle size", 2.4, {
    min: 0.5,
    max: 8,
    step: 0.1,
    decimals: 1,
    group: "Particles",
  }),
  color: color("Color", "", { auto: { label: "Model" }, group: "Particles" }),
  drift: scrub("Drift", 0.6, { min: 0, max: 3, step: 0.1, decimals: 1, group: "Particles" }),
  radius: scrub("Push radius", 110, {
    min: 20,
    max: 320,
    step: 5,
    decimals: 0,
    group: "Cursor",
  }),
  strength: scrub("Push strength", 1, {
    min: 0,
    max: 4,
    step: 0.1,
    decimals: 1,
    group: "Cursor",
  }),
  swirl: scrub("Swirl", 0.6, { min: 0, max: 2, step: 0.05, group: "Cursor" }),
  spring: scrub("Spring back", 1, { min: 0.1, max: 4, step: 0.05, group: "Cursor" }),
  background: backgroundControl("Particles"),
  sizeVariance: scrub("Size variance", 0.6, {
    min: 0,
    max: 1,
    step: 0.05,
    group: "Particles",
    advanced: true,
  }),
  damping: scrub("Damping", 0.35, { min: 0, max: 1, step: 0.02, group: "Cursor", advanced: true }),
  ...stagingControls({
    floatIntensity: 2,
    rotationIntensity: 1,
    floatSpeed: 2,
    fov: 65,
    cameraDistance: 4.2,
    xOffset: 0,
    yOffset: 0,
  }),
};

const PRESETS = presets(CONTROLS, [
  { label: "Dense", values: { count: 40000, size: 1.4 } },
  { label: "Swarm", values: { drift: 2, swirl: 1.6, spring: 0.5, radius: 180 } },
  { label: "Mono", values: { color: "#6b7280", sizeVariance: 0.2 } },
]);

export function ParticleObjectDemo() {
  const controls = useDemoControls(CONTROLS);
  const { setValue } = controls;
  const themeBackground = useThemeBackground();
  const { background: backgroundValue, src, ...values } = controls.values;
  const background = backgroundValue === "" ? null : backgroundValue;
  const model = useModelSource({
    src,
    setSrc: (next) => setValue("src", next),
    defaultSrc: DEFAULT_MODEL,
  });
  const props = { src, ...values };

  return (
    <>
      <ParticleObject
        {...props}
        background={background ?? ""}
        onLoad={model.onLoad}
        onError={model.onError}
        className="absolute inset-0"
        style={{ position: "absolute" }}
      />
      <ModelStatus status={model.status} />
      {model.status === "ready" ? (
        <StageHint
          label="Move your cursor to scatter the particles"
          touchLabel="Drag to scatter the particles"
          autopilot
        />
      ) : null}
      <DemoControls
        title="Particle Object controls"
        controls={controls}
        presets={PRESETS}
        snippet={{
          component: "ParticleObject",
          props: background ? { ...props, background } : props,
        }}
        onReset={model.onReset}
        rows={{
          src: model.row,
          background: (
            <ColorRow
              label="Background"
              value={background ?? themeBackground}
              displayValue={background ? undefined : "Page"}
              onValueChange={(next) => setValue("background", next)}
              onReset={background !== null ? () => setValue("background", "") : undefined}
            />
          ),
        }}
      />
    </>
  );
}

export { CONTROLS as PARTICLE_OBJECT_CONTROLS, PRESETS as PARTICLE_OBJECT_PRESETS };
