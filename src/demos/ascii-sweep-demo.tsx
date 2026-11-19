"use client";

import { Fragment, useState } from "react";

import { color, presets, radio, scrub } from "@/components/demos/control-schema";
import { DemoControls } from "@/components/demos/demo-controls";
import {
  StageHint,
  StageTabs,
  useStageAutoplay,
} from "@/components/demos/demo-stage";
import { useDemoControls } from "@/hooks/use-demo-controls";
import { AsciiSweep } from "@/components/docs/live/AsciiSweep";

export const ASCII_SWEEP_CONTROLS = {
  duration: scrub("Duration (s)", 2, { min: 0.2, max: 4, step: 0.05, group: "Sweep" }),
  angle: scrub("Direction (°)", 0, {
    min: -180,
    max: 180,
    step: 5,
    decimals: 0,
    group: "Sweep",
  }),
  band: scrub("Band width", 0.28, { min: 0.05, max: 1, step: 0.01, group: "Sweep" }),
  turbulence: scrub("Ragged edge", 0.5, { min: 0, max: 2, step: 0.05, group: "Sweep" }),
  trail: scrub("Trail", 0.75, { min: 0, max: 3, step: 0.05, group: "Sweep" }),
  color: color("Ink color", "#4ade80", { group: "Characters" }),
  charset: radio(
    "Glyphs",
    "ascii",
    [
      { value: "ascii", label: "ASCII" },
      { value: "blocks", label: "Blocks" },
      { value: "binary", label: "Binary" },
    ],
    { group: "Characters" },
  ),
  scale: scrub("Glyph size", 2, {
    min: 1,
    max: 6,
    step: 0.5,
    decimals: 1,
    group: "Characters",
  }),
  glow: scrub("Glow", 2, { min: 0, max: 4, step: 0.05, group: "Characters" }),
  density: scrub("Density", 0.9, { min: 0, max: 1, step: 0.05, group: "Characters" }),
  softness: scrub("Edge softness", 0.45, {
    min: 0,
    max: 1,
    step: 0.01,
    group: "Sweep",
    advanced: true,
  }),
  blend: radio(
    "Blend",
    "auto",
    [
      { value: "auto", label: "Auto" },
      { value: "add", label: "Add" },
      { value: "over", label: "Over" },
    ],
    { group: "Characters", advanced: true },
  ),
  tint: scrub("Ink strength", 0.75, {
    min: 0,
    max: 1,
    step: 0.05,
    group: "Characters",
    advanced: true,
  }),
  aberration: scrub("Color fringe", 5, {
    min: 0,
    max: 20,
    step: 0.5,
    group: "Characters",
    advanced: true,
  }),
  flicker: scrub("Flicker", 0.35, {
    min: 0,
    max: 1,
    step: 0.05,
    group: "Characters",
    advanced: true,
  }),
  spacing: scrub("Glyph spacing", 1, {
    min: 0,
    max: 3,
    step: 1,
    decimals: 0,
    group: "Characters",
    advanced: true,
  }),
  displace: scrub("Row tear", 14, {
    min: 0,
    max: 80,
    step: 1,
    decimals: 0,
    group: "Content",
    advanced: true,
  }),
  fade: scrub("Content fade", 0.75, {
    min: 0,
    max: 1,
    step: 0.05,
    group: "Content",
    advanced: true,
  }),
  threshold: scrub("Edge threshold", 0.1, {
    min: 0.01,
    max: 0.6,
    step: 0.01,
    group: "Content",
    advanced: true,
  }),
  contrast: scrub("Contrast", 1.2, {
    min: 0.2,
    max: 4,
    step: 0.05,
    group: "Content",
    advanced: true,
  }),
  brightness: scrub("Brightness", 0, {
    min: -0.5,
    max: 0.5,
    step: 0.05,
    group: "Content",
    advanced: true,
  }),
  invert: scrub("Invert", 0, { min: 0, max: 1, step: 0.05, group: "Content", advanced: true }),
};

const PRESETS = presets(ASCII_SWEEP_CONTROLS, [
  { label: "Binary", values: { charset: "binary", color: "#22c55e", glow: 3 } },
  { label: "Vertical", values: { angle: 90, turbulence: 0.2 } },
  { label: "Slow & wide", values: { duration: 3.5, band: 0.6, trail: 1.5 } },
]);

const EXAMPLES = [
  { id: "webgl", label: "WebGL" },
  { id: "webgpu", label: "WebGPU" },
] as const;

type ExampleId = (typeof EXAMPLES)[number]["id"];

const SHADERS: Record<ExampleId, string> = {
  webgl: `#version 300 es
precision highp float;
uniform sampler2D page;
uniform float split;
in vec2 uv;
out vec4 color;

void main() {
  vec2 offset = vec2(split, 0.0);
  float r = texture(page, uv + offset).r;
  float g = texture(page, uv).g;
  float b = texture(page, uv - offset).b;
  color = vec4(r, g, b, 1.0);
}`,
  webgpu: `@group(0) @binding(0) var page: texture_2d<f32>;
@group(0) @binding(1) var samp: sampler;
@group(0) @binding(2) var<uniform> split: f32;

@fragment
fn main(@location(0) uv: vec2f)
    -> @location(0) vec4f {
  let offset = vec2f(split, 0.0);
  let r = textureSample(page, samp, uv + offset).r;
  let g = textureSample(page, samp, uv).g;
  let b = textureSample(page, samp, uv - offset).b;
  return vec4f(r, g, b, 1.0);
}`,
};

const KEYWORDS = new Set([
  "#version", "es", "precision", "highp", "uniform", "in", "out", "void", "return",
  "var", "let", "fn", "@group", "@binding", "@fragment", "@location",
]);
const TYPES = new Set([
  "float", "sampler2D", "vec2", "vec4", "texture_2d", "f32", "sampler", "vec2f", "vec4f",
]);

function tone(token: string) {
  if (KEYWORDS.has(token)) return "text-muted-foreground";
  if (TYPES.has(token)) return "text-foreground";
  if (/^\d/.test(token)) return "text-foreground";
  if (/^[#@]?\w+$/.test(token)) return "text-foreground/80";
  return "text-muted-foreground/60";
}

export function SweepPanel({ id }: { id: ExampleId }) {
  const lines = SHADERS[id].split("\n");
  return (
    <div className="@container flex h-full w-full items-center justify-center overflow-hidden bg-background px-4 pt-14 pb-12 text-left @xl:px-10">
      <pre className="font-mono text-[10px] leading-[1.8] @md:text-[12px] @xl:text-[14px] @3xl:text-[15px] @6xl:text-[19px]">
        <code className="grid grid-cols-[auto_1fr] gap-x-5 @xl:gap-x-7">
          {lines.map((line, row) => (
            <Fragment key={row}>
              <span className="text-right text-muted-foreground/40 tabular-nums select-none">
                {row + 1}
              </span>
              <span className="whitespace-pre">
                {line.split(/([#@]?\w+)/).map((token, index) => (
                  <span key={index} className={tone(token)}>
                    {token}
                  </span>
                ))}
              </span>
            </Fragment>
          ))}
        </code>
      </pre>
    </div>
  );
}

export function AsciiSweepDemo() {
  const controls = useDemoControls(ASCII_SWEEP_CONTROLS);
  const [example, setExample] = useState<ExampleId>("webgl");
  const [touched, setTouched] = useState(false);
  useStageAutoplay(
    () => setExample((prev) => (prev === "webgl" ? "webgpu" : "webgl")),
    4200,
    !touched,
  );
  const props = controls.values;

  return (
    <>
      <AsciiSweep
        {...props}
        index={example === "webgl" ? 0 : 1}
        alternate={<SweepPanel id="webgpu" />}
        className="absolute inset-0"
        style={{ position: "absolute" }}
      >
        <SweepPanel id="webgl" />
      </AsciiSweep>
      <StageTabs
        label="Renderer"
        options={EXAMPLES}
        value={example}
        onValueChange={(next) => {
          setTouched(true);
          setExample(next);
        }}
      />
      <StageHint
        gesture="click"
        autopilot={false}
        label="Switch renderers to sweep between them"
        touchLabel="Tap a renderer to sweep"
      />
      <DemoControls
        title="ASCII Sweep controls"
        controls={controls}
        presets={PRESETS}
        snippet={{ component: "AsciiSweep", props }}
      />
    </>
  );
}

export { PRESETS as ASCII_SWEEP_PRESETS };
