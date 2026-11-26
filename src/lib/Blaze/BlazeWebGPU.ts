import { getCanvasPixelRatio, createCanvasResizeObserver } from "../canvas-viewport";
import { isHtmlInCanvasBlocked, prepareHtmlInCanvas, drawHtmlInCanvas } from "../html-in-canvas";
import {
  draw,
  effect as gpuEffect,
  frame as gpuFrame,
  geometry,
  init,
  sampler,
  surface,
  target,
  type Draw,
  type Effect,
  type Geometry,
  type Gpu,
  type Surface,
  type Target,
  type Texture,
} from "vgpu";
import { resolveOptions } from "../options";

export type BlazeLayer = "page" | "background" | "foreground";

export interface BlazeOptions {
  /** "page" draws the live content into the effect so the heat haze can bend it (html-in-canvas; elsewhere it falls back to "foreground"). "background" sits behind the content, "foreground" over it. */
  layer?: BlazeLayer;
  /** How far up the heat reaches, as a fraction of the element (0 to 1). */
  height?: number;
  /** Overall brightness (0 to 1). */
  intensity?: number;
  /** Colors from cool to hot, as CSS colors. Leave empty for natural fire. */
  colors?: string[];
  /** Warm light rising from a fire just below the frame (0 to 1). */
  glow?: number;
  /** Smoke lit from below, billowing up through the glow (0 to 1). */
  smoke?: number;
  /** How many embers drift up (0 to 1). */
  sparks?: number;
  /** Size of the embers. */
  sparkSize?: number;
  /** Out-of-focus embers drifting near and far from the camera (0 to 1). */
  depth?: number;
  /** How much the hot air swirls (0 to 1). */
  turbulence?: number;
  /** Heat haze bending the page, with layer "page" (0 to 1). */
  haze?: number;
  /** Size of the smoke billows and haze ripples. */
  scale?: number;
  /** Animation speed multiplier. */
  speed?: number;
  /** Moving the cursor through the heat swirls the embers and kicks up new ones (0 to 1). */
  stir?: number;
}

export interface BlazeElements {
  output: HTMLCanvasElement;
  source?: HTMLCanvasElement | null;
  content?: HTMLElement | null;
}

export interface BlazeInstance {
  setOptions: (options: BlazeOptions) => void;
  resize: () => void;
  destroy: () => void;
}

const DEFAULTS: Required<BlazeOptions> = {
  layer: "page",
  height: 0.8,
  intensity: 0.8,
  colors: [],
  glow: 0.6,
  smoke: 0.5,
  sparks: 0.6,
  sparkSize: 1,
  depth: 0.5,
  turbulence: 0.5,
  haze: 0.5,
  scale: 1,
  speed: 1,
  stir: 0.5,
};

const FIRE_RAMP = ["#1a0400", "#7a1404", "#d9480f", "#ff8a2a", "#ffd27a", "#fff6e0"];
const MAX_PARTICLES = 1400;
const STRIDE = 8;
const GLOW_SCALE = 0.4;
const FIELD_CELL = 8;
const STIR_RADIUS = 95;
const WARMUP_SECONDS = 5;

type PaintableCanvas = HTMLCanvasElement & {
  onpaint?: (() => void) | null;
  requestPaint?: () => void;
};

type ElementImageContext = CanvasRenderingContext2D & {
  drawElementImage?: (element: Element, x: number, y: number) => void;
};

// The math below runs in the WebGL engine's frame: y measured up from the
// bottom, so pointer, particle and shader coordinates all agree. WebGPU's
// @builtin(position) is top-origin, so each pass flips it into that frame
// (`size.y - position.y`), and `sampleUp` flips the bottom-origin uv back to
// vgpu's top-origin uv when it reads a texture.
const COMMON = `
fn sampleUp(tex: texture_2d<f32>, smp: sampler, uv: vec2f) -> vec4f {
  return textureSampleLevel(tex, smp, vec2f(uv.x, 1.0 - uv.y), 0.0);
}

fn hash12(p: vec2f) -> f32 {
  var q = fract(p.xyx * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

fn hash22(p: vec2f) -> vec2f {
  var q = fract(p.xyx * vec3f(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.xx + q.yz) * q.zy);
}

fn gnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  let a = dot(hash22(i) * 2.0 - 1.0, f);
  let b = dot(hash22(i + vec2f(1.0, 0.0)) * 2.0 - 1.0, f - vec2f(1.0, 0.0));
  let c = dot(hash22(i + vec2f(0.0, 1.0)) * 2.0 - 1.0, f - vec2f(0.0, 1.0));
  let d = dot(hash22(i + vec2f(1.0, 1.0)) * 2.0 - 1.0, f - vec2f(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

fn fbm3(start: vec2f) -> f32 {
  var p = start;
  var total = 0.0;
  var amplitude = 0.5;
  for (var i = 0; i < 3; i++) {
    total += gnoise(p) * amplitude;
    p = mat2x2f(1.6, 1.2, -1.2, 1.6) * p + vec2f(17.3, 9.1);
    amplitude *= 0.5;
  }
  return 0.5 + total * 1.15;
}

fn hotspot(x: f32, t: f32, scale: f32, seed: f32) -> f32 {
  let u = x / (320.0 * scale);
  let v = 0.5
    + 0.25 * sin(u * 1.7 + t * 0.21 + seed * 6.283)
    + 0.15 * sin(u * 3.1 - t * 0.17 + seed * 12.1)
    + 0.10 * sin(u * 5.3 + t * 0.33 + seed * 3.7);
  return smoothstep(0.2, 0.8, v);
}
`;

const GLOW_SHADER = `
struct GlowParams {
  size: vec2f,
  view: vec2f,
  zone: f32,
  time: f32,
  rise: f32,
  scale: f32,
  glow: f32,
  smoke: f32,
  turbulence: f32,
  seed: f32,
}

@group(0) @binding(0) var<uniform> params: GlowParams;
@group(0) @binding(1) var uRamp: texture_2d<f32>;
@group(0) @binding(2) var uField: texture_2d<f32>;
@group(0) @binding(3) var uSampler: sampler;
${COMMON}
fn hue(t: f32) -> vec3f {
  let c = textureSampleLevel(uRamp, uSampler, vec2f(clamp(t, 0.0, 1.0), 0.5), 0.0).rgb;
  return c / max(max(c.r, max(c.g, c.b)), 0.02);
}

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let frag = vec2f(position.x, params.size.y - position.y);
  let css = frag / params.size * params.view;
  let y = max(css.y, 0.0);
  let h = y / params.zone;
  if (h > 1.2) {
    return vec4f(0.0);
  }

  let pos = css + sampleUp(uField, uSampler, frag / params.size).ba;

  let seed = vec2f(params.seed * 31.0, params.seed * 17.0);
  let hot = hotspot(pos.x, params.time, params.scale, params.seed);
  let flicker = 0.9 + 0.1 * gnoise(vec2f(pos.x / (150.0 * params.scale), params.time * 2.2) + seed);
  let base = exp(-y / (params.zone * 0.26)) * mix(0.3, 1.0, hot) * flicker;
  let spill = exp(-y / (params.zone * 0.7)) * mix(0.55, 1.0, hot) * 0.1;

  var smoke = 0.0;
  if (params.smoke > 0.001) {
    let cell = 340.0 * params.scale;
    let p = pos / cell * vec2f(1.0, 0.7);
    let climb = params.time * params.rise / cell * 0.4;
    let warp = 0.5 + 0.9 * params.turbulence;
    let q = vec2f(
      fbm3(p + vec2f(0.0, -climb * 0.8) + seed + params.time * 0.015),
      fbm3(p + vec2f(5.2, 1.3 - climb * 0.7)));
    let f = fbm3(p + (q - 0.5) * 2.0 * warp + vec2f(0.0, -climb));
    let billow = smoothstep(0.42, 0.95, f);
    let lit = exp(-y / (params.zone * 0.62));
    smoke = billow * lit * mix(0.55, 1.0, hot) * params.smoke * 1.25;
  }

  var heat = (base * 0.8 + spill) * params.glow + smoke;
  heat *= 1.0 - smoothstep(0.8, 1.2, h);
  let tone = hue(0.27 + 0.36 * clamp(heat * 1.1, 0.0, 1.0));
  return vec4f(tone * heat * 0.75, 1.0);
}`;

// Cursor flow: rg holds the stirred air's velocity, ba how far it has carried
// the smoke (both in CSS px). Each frame the field is carried along by itself
// and the rising heat, the cursor adds a vortex pair (the divergence-free flow
// a finger leaves in liquid), and both relax back to rest.
const STIR_SHADER = `
struct StirParams {
  segment: vec4f,
  splat: vec4f,
  grid: vec2f,
  view: vec2f,
  dt: f32,
  drift: f32,
}

@group(0) @binding(0) var<uniform> params: StirParams;
@group(0) @binding(1) var uField: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

fn sampleUp(tex: texture_2d<f32>, smp: sampler, uv: vec2f) -> vec4f {
  return textureSampleLevel(tex, smp, vec2f(uv.x, 1.0 - uv.y), 0.0);
}

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let uv = vec2f(position.x, params.grid.y - position.y) / params.grid;
  let css = uv * params.view;
  let here = sampleUp(uField, uSampler, uv).rg;
  let back = (css - (here + vec2f(0.0, params.drift)) * params.dt) / params.view;
  let prev = sampleUp(uField, uSampler, back);
  var velocity = prev.rg * exp(-params.dt * 1.1);
  var offset = (prev.ba - here * params.dt) * exp(-params.dt * 0.65);
  if (params.splat.w > 0.0) {
    let a = params.segment.xy;
    let ab = params.segment.zw - a;
    let t = clamp(dot(css - a, ab) / max(dot(ab, ab), 0.0001), 0.0, 1.0);
    let r = css - (a + ab * t);
    let r2 = params.splat.z * params.splat.z;
    let g = exp(-dot(r, r) / r2);
    let push = params.splat.xy;
    let swirl = push.x * r.y - push.y * r.x;
    velocity += (push * g + swirl * g * vec2f(-2.0 * r.y, 2.0 * r.x) / r2) * params.splat.w;
  }
  velocity = clamp(velocity, vec2f(-2400.0), vec2f(2400.0));
  offset = clamp(offset, vec2f(-180.0), vec2f(180.0));
  return vec4f(velocity, offset);
}`;

const SPARK_SHADER = `
struct SparkParams {
  view: vec2f,
  shutter: f32,
}

struct SparkOut {
  @builtin(position) position: vec4f,
  @location(0) local: vec2f,
  @location(1) halfLength: f32,
  @location(2) radius: f32,
  @location(3) blur: f32,
  @location(4) heat: f32,
  @location(5) alpha: f32,
  @location(6) reach: f32,
}

@group(0) @binding(0) var<uniform> params: SparkParams;
@group(0) @binding(1) var uRamp: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

@vertex fn vs_main(
  @location(0) corner: vec2f,
  @location(1) motion: vec4f,
  @location(2) look: vec4f,
) -> SparkOut {
  let velocity = motion.zw;
  let speed = length(velocity);
  var dir = vec2f(0.0, 1.0);
  if (speed > 0.001) {
    dir = velocity / speed;
  }
  let across = vec2f(-dir.y, dir.x);
  let radius = look.x;
  let blur = look.y;
  let halfLength = min(0.5 * speed * params.shutter, 28.0) * (1.0 - 0.8 * blur);
  let reach = radius * mix(5.0, 1.2, blur);
  let local = corner * vec2f(halfLength + reach, reach);
  let center = motion.xy - dir * halfLength;
  let point = center + dir * local.x + across * local.y;
  var out: SparkOut;
  out.local = local;
  out.halfLength = halfLength;
  out.radius = radius;
  out.blur = blur;
  out.heat = look.z;
  out.alpha = look.w;
  out.reach = reach;
  out.position = vec4f(point / params.view * 2.0 - 1.0, 0.0, 1.0);
  return out;
}

@fragment fn fs_main(in: SparkOut) -> @location(0) vec4f {
  let along = max(abs(in.local.x) - in.halfLength, 0.0);
  let d = length(vec2f(along, in.local.y));
  let r = in.radius;
  let core = exp(-d * d / (r * r * 0.6));
  let halo = exp(-d * d / (r * r * 10.0)) * 0.2 * (1.0 - in.blur);
  let disc = (1.0 - smoothstep(r * 0.72, r, d)) * (0.55 + 0.45 * smoothstep(0.0, r, d));
  let shape = mix(core + halo, disc * 0.42, in.blur) * (1.0 - smoothstep(in.reach * 0.7, in.reach, d));
  var head = 1.0;
  if (in.halfLength > 0.01) {
    head = clamp((in.local.x + in.halfLength) / (2.0 * in.halfLength), 0.0, 1.0);
  }
  let trail = mix(0.3, 1.0, head * head);
  let spread = clamp(2.2 * r / (2.2 * r + 2.0 * in.halfLength), 0.4, 1.0);
  var tint = textureSampleLevel(uRamp, uSampler, vec2f(0.42 + 0.4 * in.heat, 0.5), 0.0).rgb;
  tint /= max(max(tint.r, max(tint.g, tint.b)), 0.02);
  return vec4f(tint * shape * trail * spread * in.alpha * 5.0, 0.0);
}`;

const COMPOSITE_SHADER = `
struct CompositeParams {
  resolution: vec2f,
  mode: f32,
  dpr: f32,
  zone: f32,
  maxX: f32,
  intensity: f32,
  light: f32,
  haze: f32,
  time: f32,
  rise: f32,
  scale: f32,
  frame: f32,
}

@group(0) @binding(0) var<uniform> params: CompositeParams;
@group(0) @binding(1) var uGlowTex: texture_2d<f32>;
@group(0) @binding(2) var uSparkTex: texture_2d<f32>;
@group(0) @binding(3) var uContent: texture_2d<f32>;
@group(0) @binding(4) var uSampler: sampler;
${COMMON}
@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let px = vec2f(position.x, params.resolution.y - position.y);
  let uv = px / params.resolution;
  let css = px / params.dpr;

  let glow = sampleUp(uGlowTex, uSampler, uv).rgb * select(1.0, 0.75, params.light > 0.5);
  let sparks = sampleUp(uSparkTex, uSampler, uv).rgb;
  let lit = 1.0 - exp(-glow * params.intensity * 1.15);
  var embers = 1.0 - exp(-sparks * params.intensity * 1.15);
  if (params.light > 0.5) {
    let peak = max(embers.r, max(embers.g, embers.b));
    if (peak > 0.001) {
      embers = pow(embers / peak, vec3f(1.8)) * peak;
    }
  }
  var fire = 1.0 - (1.0 - lit) * (1.0 - embers);
  let dither = (hash12(px + params.frame * vec2f(17.0, 59.0)) + hash12(px.yx + params.frame * vec2f(41.0, 7.0)) - 1.0) / 255.0;
  fire = clamp(fire + dither, vec3f(0.0), vec3f(1.0));
  let alpha = max(fire.r, max(fire.g, fire.b));

  if (params.mode > 0.5) {
    let y = max(css.y, 0.0);
    let amount = params.haze * exp(-y / (params.zone * 0.45)) * (1.0 - smoothstep(0.85, 1.15, y / params.zone));
    var offset = vec2f(0.0);
    if (amount > 0.002) {
      let cell = 64.0 * params.scale;
      let p = css / cell * vec2f(1.0, 0.45) - vec2f(0.0, params.time * params.rise / cell * 0.4);
      let p2 = p * 2.3 + vec2f(3.1, -params.time * 0.6);
      offset.x = gnoise(p) + 0.45 * gnoise(p2);
      offset.y = gnoise(p + vec2f(7.3, 1.9)) + 0.45 * gnoise(p2 + vec2f(2.7, 5.1));
      offset *= vec2f(1.0, 0.55) * amount * 9.0;
    }
    var at = uv + offset * params.dpr / params.resolution;
    at.x = clamp(at.x, 0.0, params.maxX - 0.001);
    at.y = clamp(at.y, 0.0, 1.0);
    let page = sampleUp(uContent, uSampler, at);
    let luma = dot(page.rgb, vec3f(0.299, 0.587, 0.114));
    let color = page.rgb * (1.0 - alpha * luma) + fire;
    return vec4f(color, clamp(page.a + alpha * (1.0 - page.a), 0.0, 1.0));
  }

  return vec4f(fire, alpha);
}`;

export function supportsHtmlInCanvas(): boolean {
  if (typeof document === "undefined" || isHtmlInCanvasBlocked()) return false;
  const probe = document.createElement("canvas") as PaintableCanvas;
  const ctx = probe.getContext("2d") as ElementImageContext | null;
  return Boolean(
    ctx &&
    typeof ctx.drawElementImage === "function" &&
    typeof probe.requestPaint === "function",
  );
}

export function supportsWebGPU(): boolean {
  return typeof navigator !== "undefined" && Boolean(navigator.gpu);
}

let sharedGpu: Promise<Gpu> | null = null;

function acquireGpu(): Promise<Gpu> {
  if (!sharedGpu) {
    sharedGpu = init().catch((error) => {
      sharedGpu = null;
      throw error;
    });
  }
  return sharedGpu;
}

function destroyTarget(value: Target | null) {
  (value as unknown as { destroy?: () => void } | null)?.destroy?.();
}

type Rgb = [number, number, number];

const colorProbe: { ctx: CanvasRenderingContext2D | null } = { ctx: null };

function readColor(value: string): [number, number, number, number] | null {
  if (typeof document === "undefined") return null;
  if (!colorProbe.ctx) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    colorProbe.ctx = canvas.getContext("2d", { willReadFrequently: true });
  }
  const ctx = colorProbe.ctx;
  if (!ctx) return null;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = "#000";
  ctx.fillStyle = value;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  return [r / 255, g / 255, b / 255, a / 255];
}

function toLinear(value: number) {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function toSrgb(value: number) {
  const v = Math.min(Math.max(value, 0), 1);
  return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
}

function toOklab([r, g, b]: Rgb): Rgb {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function fromOklab([L, A, B]: Rgb): Rgb {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

export function buildBlazeRamp(colors: string[], size = 256): Uint8Array {
  const stops = (colors.length ? colors : FIRE_RAMP).map((color) => {
    const parsed = readColor(color);
    return toOklab(parsed ? [parsed[0], parsed[1], parsed[2]] : [1, 1, 1]);
  });
  if (stops.length === 1) stops.push(stops[0]);
  const data = new Uint8Array(size * 4);
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * (stops.length - 1);
    const index = Math.min(Math.floor(x), stops.length - 2);
    const f = x - index;
    const a = stops[index];
    const b = stops[index + 1];
    const rgb = fromOklab([
      a[0] + (b[0] - a[0]) * f,
      a[1] + (b[1] - a[1]) * f,
      a[2] + (b[2] - a[2]) * f,
    ]);
    data[i * 4] = Math.round(rgb[0] * 255);
    data[i * 4 + 1] = Math.round(rgb[1] * 255);
    data[i * 4 + 2] = Math.round(rgb[2] * 255);
    data[i * 4 + 3] = 255;
  }
  return data;
}

/** Mirror of the shader's `hotspot`: where the fire below the frame burns hottest. */
export function blazeHotspot(x: number, t: number, scale: number, seed: number) {
  const u = x / (320 * scale);
  const v =
    0.5 +
    0.25 * Math.sin(u * 1.7 + t * 0.21 + seed * 6.283) +
    0.15 * Math.sin(u * 3.1 - t * 0.17 + seed * 12.1) +
    0.1 * Math.sin(u * 5.3 + t * 0.33 + seed * 3.7);
  return smoothstep(0.2, 0.8, v);
}

function createNoise(seed: number) {
  const perm = new Uint8Array(512);
  const table = new Uint8Array(256);
  for (let i = 0; i < 256; i++) table[i] = i;
  let state = Math.floor(seed * 2147483646) + 1;
  for (let i = 255; i > 0; i--) {
    state = (state * 16807) % 2147483647;
    const j = state % (i + 1);
    const swap = table[i];
    table[i] = table[j];
    table[j] = swap;
  }
  for (let i = 0; i < 512; i++) perm[i] = table[i & 255];
  const gx = [1, -1, 1, -1, 1.41, -1.41, 0, 0];
  const gy = [1, 1, -1, -1, 0, 0, 1.41, -1.41];
  return (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const X = xi & 255;
    const Y = yi & 255;
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
    const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    const aa = perm[perm[X] + Y] & 7;
    const ba = perm[perm[X + 1] + Y] & 7;
    const ab = perm[perm[X] + Y + 1] & 7;
    const bb = perm[perm[X + 1] + Y + 1] & 7;
    const n00 = gx[aa] * xf + gy[aa] * yf;
    const n10 = gx[ba] * (xf - 1) + gy[ba] * yf;
    const n01 = gx[ab] * xf + gy[ab] * (yf - 1);
    const n11 = gx[bb] * (xf - 1) + gy[bb] * (yf - 1);
    const top = n00 + (n10 - n00) * u;
    const bottom = n01 + (n11 - n01) * u;
    return top + (bottom - top) * v;
  };
}

export function createBlaze(
  elements: BlazeElements,
  options: BlazeOptions = {},
): BlazeInstance | null {
  if (!supportsWebGPU()) return null;
  try {
    return initializeBlaze(elements, options);
  } catch (error) {
    console.error("Blaze initialization failed:", error);
    return null;
  }
}

type Size = [number, number];

function initializeBlaze(
  elements: BlazeElements,
  options: BlazeOptions,
): BlazeInstance | null {
  const config = { ...DEFAULTS, ...resolveOptions(DEFAULTS, options) };
  const { output } = elements;
  const source = elements.source ?? null;
  const content = elements.content ?? null;

  const sourceCtx = source
    ? (source.getContext("2d") as ElementImageContext | null)
    : null;
  const paintable = source as PaintableCanvas | null;
  const htmlInCanvas = Boolean(
    !isHtmlInCanvasBlocked() &&
    source &&
    content &&
    source.contains(content) &&
    sourceCtx &&
    typeof sourceCtx.drawElementImage === "function" &&
    typeof paintable?.requestPaint === "function",
  );

  if (htmlInCanvas) prepareHtmlInCanvas(source!, content!);

  let destroyed = false;
  let contentDirty = false;
  let wake = () => {};

  if (htmlInCanvas) {
    paintable!.onpaint = () => {
      try {
        sourceCtx!.reset();
        drawHtmlInCanvas(source!, sourceCtx!, content!, true);
        contentDirty = true;
        wake();
      } catch {}
    };
  }

  let gpu: Gpu | null = null;
  let screen: Surface | null = null;
  let stirFx: Effect | null = null;
  let glowFx: Effect | null = null;
  let compositeFx: Effect | null = null;
  let sparkDraw: Draw | null = null;
  let sparkGeometry: Geometry | null = null;
  let glowTarget: Target | null = null;
  let sparkTarget: Target | null = null;
  let fieldTargets: Target[] = [];
  let fieldIndex = 0;
  let contentTexture: Texture | null = null;
  let rampTexture: Texture | null = null;
  let fallback2d: CanvasRenderingContext2D | null = null;
  let textureUploadErrorLogged = false;

  function sizeTarget(value: Target | null, [width, height]: Size) {
    if (!value) return;
    if (value.size[0] !== width || value.size[1] !== height) {
      value.resize([width, height]);
    }
  }

  let rampKey: string | null = null;
  function syncRamp() {
    if (!gpu || !rampTexture) return;
    const key = config.colors.join(",");
    if (key === rampKey) return;
    rampKey = key;
    gpu.gpu.queue.writeTexture(
      { texture: rampTexture.gpu },
      buildBlazeRamp(config.colors) as Uint8Array<ArrayBuffer>,
      { bytesPerRow: 256 * 4, rowsPerImage: 1 },
      [256, 1],
    );
  }

  let light = false;
  function syncBacking() {
    let el: Element | null = content ?? output.parentElement ?? output;
    let rgb: Rgb = [0, 0, 0];
    while (el) {
      const color = readColor(getComputedStyle(el).backgroundColor);
      if (color && color[3] > 0.5) {
        rgb = [color[0], color[1], color[2]];
        break;
      }
      el = el.parentElement;
    }
    light = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2] > 0.5;
  }

  let dpr = 1;
  let contentMaxX = 1;
  let glowSize: Size = [1, 1];
  let fieldSize: Size = [1, 1];
  let sparkSize: Size = [1, 1];

  function cssWidth() {
    return Math.max(output.clientWidth, 1);
  }

  function zoneCss() {
    return Math.max(output.clientHeight * clamp(config.height, 0.05, 1), 60);
  }

  function riseSpeed() {
    return 110;
  }

  function sizeTargets() {
    sizeTarget(glowTarget, glowSize);
    for (const field of fieldTargets) sizeTarget(field, fieldSize);
    sizeTarget(sparkTarget, sparkSize);
  }

  function syncCanvasSize() {
    dpr = getCanvasPixelRatio(output);
    const width = Math.max(1, Math.round(output.clientWidth * dpr));
    const height = Math.max(1, Math.round(output.clientHeight * dpr));
    if (screen) {
      const [w, h] = screen.size;
      if (w !== width || h !== height) screen.resize([width, height]);
    } else if (output.width !== width || output.height !== height) {
      output.width = width;
      output.height = height;
    }
    if (htmlInCanvas) {
      const sourceWidth = Math.max(1, Math.round(source!.clientWidth * dpr));
      const sourceHeight = Math.max(1, Math.round(source!.clientHeight * dpr));
      if (source!.width !== sourceWidth || source!.height !== sourceHeight) {
        source!.width = sourceWidth;
        source!.height = sourceHeight;
      }
      paintable!.requestPaint!();
      contentMaxX = Math.min(
        1,
        Math.max(0.05, content!.clientWidth / Math.max(output.clientWidth, 1)),
      );
    }
    glowSize = [
      Math.min(1024, Math.max(1, Math.ceil(output.clientWidth * GLOW_SCALE))),
      Math.min(1024, Math.max(1, Math.ceil(output.clientHeight * GLOW_SCALE))),
    ];
    fieldSize = [
      Math.min(256, Math.max(1, Math.ceil(output.clientWidth / FIELD_CELL))),
      Math.min(256, Math.max(1, Math.ceil(output.clientHeight / FIELD_CELL))),
    ];
    const sparkScale = Math.min(1, 2 / dpr);
    sparkSize = [
      Math.min(4096, Math.max(1, Math.round(width * sparkScale))),
      Math.min(4096, Math.max(1, Math.round(height * sparkScale))),
    ];
    sizeTargets();
  }

  syncBacking();
  syncCanvasSize();

  const seed = Math.random();
  const noise = createNoise(seed);
  let elapsed = 0;
  let frameIndex = 0;
  const stir = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    presence: 0,
    target: 0,
    lastX: 0,
    lastY: 0,
    lastTime: 0,
    debt: 0,
    frameX: 0,
    frameY: 0,
  };

  const splat = { fromX: 0, fromY: 0, toX: 0, toY: 0, vx: 0, vy: 0, amount: 0 };
  let fieldDt = 0;

  function prepareSplat(delta: number) {
    const strength = stir.presence * clamp(config.stir, 0, 1);
    const jump = Math.hypot(stir.x - stir.frameX, stir.y - stir.frameY) > 240;
    splat.fromX = jump ? stir.x : stir.frameX;
    splat.fromY = jump ? stir.y : stir.frameY;
    splat.toX = stir.x;
    splat.toY = stir.y;
    splat.vx = stir.vx;
    splat.vy = stir.vy;
    splat.amount = strength > 0.005 ? strength * delta * 6 : 0;
    stir.frameX = stir.x;
    stir.frameY = stir.y;
  }

  const px = new Float32Array(MAX_PARTICLES);
  const py = new Float32Array(MAX_PARTICLES);
  const pvx = new Float32Array(MAX_PARTICLES);
  const pvy = new Float32Array(MAX_PARTICLES);
  const page = new Float32Array(MAX_PARTICLES);
  const plife = new Float32Array(MAX_PARTICLES);
  const psize = new Float32Array(MAX_PARTICLES);
  const pdepth = new Float32Array(MAX_PARTICLES);
  const pphase = new Float32Array(MAX_PARTICLES);
  const fields = [px, py, pvx, pvy, page, plife, psize, pdepth, pphase];
  const instances = new Float32Array(MAX_PARTICLES * STRIDE);
  let count = 0;
  let instanceCount = 0;
  let spawnDebt = 0;

  function spawn(x0?: number, y0?: number, vx0 = 0, vy0 = 0) {
    if (count >= MAX_PARTICLES) return;
    const width = cssWidth();
    const zone = zoneCss();
    const rise = riseSpeed();
    let x = x0 ?? 0;
    if (x0 === undefined) {
      for (let tries = 0; tries < 6; tries++) {
        x = Math.random() * width;
        if (Math.random() < 0.15 + 0.85 * blazeHotspot(x, elapsed, scale(), seed)) {
          break;
        }
      }
    }
    const y =
      y0 ?? (Math.random() < 0.6 ? -Math.random() * 12 : Math.random() * zone * 0.3);
    const depth = clamp(config.depth, 0, 1);
    const near = depth * 0.08;
    const far = 0.1 + depth * 0.3;
    const roll = Math.random();
    const z =
      roll < near
        ? 0.86 + Math.random() * 0.14
        : roll < near + far
          ? Math.random() * 0.3
          : 0.32 + Math.random() * 0.46;
    const i = count++;
    px[i] = x;
    py[i] = y;
    pvx[i] = vx0 + (Math.random() - 0.5) * 24;
    pvy[i] = vy0 + rise * (0.45 + Math.random() * 0.5);
    page[i] = 0;
    plife[i] = clamp((zone / rise) * (0.3 + Math.random() * 0.75), 0.6, 8);
    psize[i] = 0.6 + Math.random() * 0.9;
    pdepth[i] = z;
    pphase[i] = Math.random();
  }

  function kill(i: number) {
    const last = --count;
    if (i === last) return;
    for (const field of fields) field[i] = field[last];
  }

  function scale() {
    return Math.max(config.scale, 0.2);
  }

  function potential(x: number, y: number, t: number) {
    return (
      noise(x, y) + 0.5 * noise(x * 2.03 + 5.3 + t * 0.11, y * 2.03 - 1.7)
    );
  }

  const flow = { x: 0, y: 0 };
  function sampleFlow(x: number, y: number, t: number) {
    const s = 1 / (240 * scale());
    const X = x * s;
    const Y = y * s - t * 0.16;
    const e = 0.02;
    flow.x = (potential(X, Y + e, t) - potential(X, Y - e, t)) / (2 * e);
    flow.y = -(potential(X + e, Y, t) - potential(X - e, Y, t)) / (2 * e);
  }

  function simulate(dt: number) {
    const width = cssWidth();
    const zone = zoneCss();
    const rise = riseSpeed();
    const amount = clamp(config.sparks, 0, 1);
    const target = amount ** 1.5 * (width / 1440) * 180;
    const meanLife = clamp((zone / rise) * 0.68, 0.6, 8);
    spawnDebt += (target / meanLife) * dt;
    while (spawnDebt >= 1) {
      spawn();
      spawnDebt -= 1;
    }

    const stirAmount = clamp(config.stir, 0, 1) * stir.presence;
    const cursorSpeed = Math.hypot(stir.vx, stir.vy);
    if (splat.amount > 0 && cursorSpeed > 60 && stir.y < zone * 0.75) {
      stir.debt += stirAmount * Math.min(cursorSpeed / 700, 1.5) * 36 * dt;
      while (stir.debt >= 1) {
        spawn(
          stir.x + (Math.random() - 0.5) * 36,
          Math.max(stir.y + (Math.random() - 0.5) * 24, 0),
          stir.vx * 0.3,
          stir.vy * 0.3,
        );
        stir.debt -= 1;
      }
    }

    const swirl = clamp(config.turbulence, 0, 1) * 95;
    const ease = 1 - Math.exp(-dt * 1.6);
    const stirRadius = STIR_RADIUS * scale() ** 0.5;
    const r2 = stirRadius * stirRadius;
    const segX = splat.toX - splat.fromX;
    const segY = splat.toY - splat.fromY;
    const segLength = Math.max(segX * segX + segY * segY, 0.0001);
    for (let i = count - 1; i >= 0; i--) {
      page[i] += dt;
      const x = px[i];
      const y = py[i];
      if (
        page[i] >= plife[i] ||
        y > zone * 1.2 ||
        y < -60 ||
        x < -60 ||
        x > width + 60
      ) {
        kill(i);
        continue;
      }
      const heat = 1 - page[i] / plife[i];
      const parallax = 0.55 + 0.8 * pdepth[i];
      sampleFlow(x, y, elapsed);
      const flutter =
        Math.sin(elapsed * (1.3 + 1.7 * pphase[i]) + pphase[i] * 31) * 42 * (0.4 + heat);
      const tx = (flow.x * swirl + flutter) * parallax;
      const ty = (rise * (0.35 + 0.75 * heat) + flow.y * swirl) * parallax;
      pvx[i] += (tx - pvx[i]) * ease;
      pvy[i] += (ty - pvy[i]) * ease;
      if (splat.amount > 0) {
        const t = clamp(
          ((x - splat.fromX) * segX + (y - splat.fromY) * segY) / segLength,
          0,
          1,
        );
        const rx = x - (splat.fromX + segX * t);
        const ry = y - (splat.fromY + segY * t);
        const d2 = rx * rx + ry * ry;
        if (d2 < r2 * 9) {
          const g = Math.exp(-d2 / r2) * splat.amount * (0.6 + 0.6 * pdepth[i]);
          const twist = splat.vx * ry - splat.vy * rx;
          pvx[i] += (splat.vx - (twist * 2 * ry) / r2) * g;
          pvy[i] += (splat.vy + (twist * 2 * rx) / r2) * g;
        }
      }
      px[i] = x + pvx[i] * dt;
      py[i] = y + pvy[i] * dt;
    }
  }

  function pack() {
    const zone = zoneCss();
    const size = Math.max(config.sparkSize, 0.2);
    let n = 0;
    for (let i = 0; i < count; i++) {
      const heat = clamp(1 - page[i] / plife[i], 0, 1);
      const z = pdepth[i];
      const blur = z > 0.84 ? (z - 0.84) / 0.16 : 0;
      const flicker =
        0.72 + 0.28 * Math.sin(elapsed * (7 + 9 * pphase[i]) + pphase[i] * 40);
      const alpha =
        Math.min(page[i] / 0.25, 1) *
        (1 - smoothstep(zone * 0.85, zone * 1.15, py[i])) *
        heat ** 1.2 *
        flicker *
        (0.45 + 0.55 * z) *
        (1 - 0.7 * blur);
      if (alpha < 0.004) continue;
      const o = n * STRIDE;
      instances[o] = px[i];
      instances[o + 1] = py[i];
      instances[o + 2] = pvx[i];
      instances[o + 3] = pvy[i];
      instances[o + 4] =
        1.6 * size * psize[i] * (0.55 + 0.6 * z) * (1 + blur * 4) * (0.65 + 0.35 * heat);
      instances[o + 5] = blur;
      instances[o + 6] = heat;
      instances[o + 7] = alpha;
      n++;
    }
    instanceCount = n;
  }

  function pageMode() {
    return htmlInCanvas && config.layer === "page";
  }

  function uploadContent() {
    if (!gpu || !compositeFx || !pageMode() || !contentDirty) return;
    contentDirty = false;
    const width = Math.max(1, source!.width);
    const height = Math.max(1, source!.height);
    try {
      if (
        !contentTexture ||
        contentTexture.size[0] !== width ||
        contentTexture.size[1] !== height
      ) {
        contentTexture?.destroy();
        contentTexture = gpu.device.createTexture({
          size: [width, height],
          format: "rgba8unorm",
          usage: ["texture_binding", "copy_dst", "render_attachment"],
          label: "blaze.content",
        });
        compositeFx.set({ uContent: contentTexture });
      }
      gpu.gpu.queue.copyExternalImageToTexture(
        { source: source! },
        { texture: contentTexture.gpu },
        [width, height],
      );
      textureUploadErrorLogged = false;
    } catch (error) {
      if (!textureUploadErrorLogged) {
        textureUploadErrorLogged = true;
        console.warn("Blaze could not upload its content texture:", error);
      }
    }
  }

  function render() {
    if (
      !gpu ||
      !screen ||
      !stirFx ||
      !glowFx ||
      !compositeFx ||
      !sparkDraw ||
      !sparkGeometry ||
      !glowTarget ||
      !sparkTarget
    ) {
      return;
    }
    uploadContent();
    const viewWidth = cssWidth();
    const viewHeight = Math.max(output.clientHeight, 1);
    const zone = zoneCss();

    let stirTarget: Target | null = null;
    if (fieldDt > 0) {
      const from = fieldTargets[fieldIndex];
      const to = fieldTargets[1 - fieldIndex];
      stirFx.set({
        uField: from,
        params: {
          segment: [splat.fromX, splat.fromY, splat.toX, splat.toY],
          splat: [splat.vx, splat.vy, STIR_RADIUS * scale() ** 0.5, splat.amount],
          grid: [to.size[0], to.size[1]],
          view: [viewWidth, viewHeight],
          dt: fieldDt,
          drift: riseSpeed() * 0.55,
        },
      });
      stirTarget = to;
      fieldIndex = 1 - fieldIndex;
    }

    glowFx.set({
      uField: fieldTargets[fieldIndex],
      params: {
        size: [glowTarget.size[0], glowTarget.size[1]],
        view: [viewWidth, viewHeight],
        zone,
        time: elapsed,
        rise: riseSpeed(),
        scale: scale(),
        glow: clamp(config.glow, 0, 1),
        smoke: clamp(config.smoke, 0, 1),
        turbulence: clamp(config.turbulence, 0, 1),
        seed,
      },
    });

    if (instanceCount > 0) {
      sparkGeometry.buffers[1].write(instances.subarray(0, instanceCount * STRIDE));
      sparkDraw.set({
        params: { view: [viewWidth, viewHeight], shutter: 0.045 },
      });
    }

    compositeFx.set({
      uGlowTex: glowTarget,
      uSparkTex: sparkTarget,
      params: {
        resolution: [output.width, output.height],
        mode: pageMode() ? 1 : 0,
        dpr,
        zone,
        maxX: contentMaxX,
        intensity: clamp(config.intensity, 0, 1),
        light: light ? 1 : 0,
        haze: clamp(config.haze, 0, 1),
        time: elapsed,
        rise: riseSpeed(),
        scale: scale(),
        frame: frameIndex % 1024,
      },
    });

    const sparks = sparkTarget;
    const glow = glowTarget;
    const view = screen;
    const sparkCount = instanceCount;
    gpuFrame(gpu, (f) => {
      if (stirTarget) f.pass(stirTarget, stirFx!);
      f.pass(glow, glowFx!);
      f.pass({ target: sparks, clear: [0, 0, 0, 0] }, (pass) => {
        if (sparkCount > 0) pass.draw(sparkDraw!, { instances: sparkCount });
      });
      f.pass(view, compositeFx!);
    });
  }

  function renderFallback() {
    if (!fallback2d || !htmlInCanvas || !contentDirty) return;
    contentDirty = false;
    fallback2d.clearRect(0, 0, output.width, output.height);
    fallback2d.drawImage(source!, 0, 0, output.width, output.height);
  }

  let raf = 0;
  let lastTime = performance.now();
  let running = false;
  let visible = true;
  let warm = true;

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reducedMotion = motionQuery.matches;

  function warmUp() {
    const step = 1 / 30;
    for (let t = 0; t < WARMUP_SECONDS; t += step) {
      elapsed += step;
      simulate(step);
    }
    warm = false;
  }

  function frame(now: number) {
    if (destroyed) return;
    if (!visible) {
      running = false;
      return;
    }
    if (fallback2d) {
      renderFallback();
      running = false;
      return;
    }
    if (!gpu) {
      running = false;
      return;
    }
    const delta = Math.min((now - lastTime) / 1000, 1 / 30);
    lastTime = now;
    if (warm) warmUp();
    const fade = 1 - Math.exp(-delta * 3);
    stir.presence += (stir.target - stir.presence) * fade;
    const damping = Math.exp(-delta * 4);
    stir.vx *= damping;
    stir.vy *= damping;
    if (reducedMotion) {
      pack();
      render();
      running = false;
      return;
    }
    const dt = delta * Math.max(config.speed, 0);
    elapsed += dt;
    frameIndex += 1;
    prepareSplat(delta);
    fieldDt = Math.max(dt, 0.001);
    simulate(dt);
    pack();
    render();
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (destroyed || running || !visible) return;
    running = true;
    lastTime = performance.now();
    raf = requestAnimationFrame(frame);
  }

  wake = start;

  acquireGpu()
    .then((device) => {
      if (destroyed) return;
      gpu = device;
      screen = surface(device, output, {
        size: [output.width, output.height],
        autoResize: false,
        alphaMode: "premultiplied",
        label: "blaze",
      });
      const linear = sampler(device, {
        minFilter: "linear",
        magFilter: "linear",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
      });
      rampTexture = device.device.createTexture({
        size: [256, 1],
        format: "rgba8unorm",
        usage: ["texture_binding", "copy_dst"],
        label: "blaze.ramp",
      });
      contentTexture = device.device.createTexture({
        size: [1, 1],
        format: "rgba8unorm",
        usage: ["texture_binding", "copy_dst", "render_attachment"],
        label: "blaze.content",
      });
      const float = (label: string) =>
        target(device, {
          size: [1, 1],
          format: "rgba16float",
          clearColor: [0, 0, 0, 0],
          label,
        });
      glowTarget = float("blaze.glow");
      sparkTarget = float("blaze.sparks");
      fieldTargets = [float("blaze.field.a"), float("blaze.field.b")];
      sparkGeometry = geometry(device, {
        label: "blaze.sparks",
        topology: "triangle-strip",
        vertexCount: 4,
        buffers: [
          {
            data: new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
            attributes: { corner: "float32x2" },
          },
          {
            data: new Float32Array(MAX_PARTICLES * STRIDE),
            stepMode: "instance",
            stride: STRIDE * 4,
            attributes: {
              motion: { format: "float32x4", offset: 0 },
              look: { format: "float32x4", offset: 16 },
            },
          },
        ],
      });
      stirFx = gpuEffect(device, STIR_SHADER, {
        label: "blaze.stir",
        set: { uSampler: linear },
      });
      glowFx = gpuEffect(device, GLOW_SHADER, {
        label: "blaze.glow",
        set: { uSampler: linear, uRamp: rampTexture },
      });
      sparkDraw = draw(device, {
        label: "blaze.sparks",
        shader: SPARK_SHADER,
        geometry: sparkGeometry,
        blend: {
          color: { src: "one", dst: "one" },
          alpha: { src: "one", dst: "one" },
        },
        set: { uSampler: linear, uRamp: rampTexture },
      });
      compositeFx = gpuEffect(device, COMPOSITE_SHADER, {
        label: "blaze",
        set: { uSampler: linear, uContent: contentTexture },
      });
      syncRamp();
      syncCanvasSize();
      start();
    })
    .catch((error) => {
      if (destroyed) return;
      console.warn("Blaze: WebGPU unavailable, showing content without the effect.", error);
      if (!htmlInCanvas || screen) return;
      fallback2d = output.getContext("2d");
      contentDirty = true;
      start();
    });

  start();

  function onMotionChange() {
    reducedMotion = motionQuery.matches;
    start();
  }
  motionQuery.addEventListener("change", onMotionChange);

  let themeTimer = 0;
  function onThemeShift() {
    syncBacking();
    window.clearTimeout(themeTimer);
    themeTimer = window.setTimeout(() => {
      syncBacking();
      start();
    }, 300);
    start();
  }
  const themeObserver = new MutationObserver(onThemeShift);
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "style", "data-theme"],
  });
  const schemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
  schemeQuery.addEventListener("change", onThemeShift);

  let outputRect = output.getBoundingClientRect();
  const refreshOutputRect = () => {
    outputRect = output.getBoundingClientRect();
  };

  const observer = createCanvasResizeObserver(() => {
    refreshOutputRect();
    syncCanvasSize();
    start();
  });
  observer.observe(output);
  if (content) observer.observe(content);
  window.addEventListener("resize", refreshOutputRect, { passive: true });
  window.addEventListener("scroll", refreshOutputRect, {
    capture: true,
    passive: true,
  });

  let intersecting = true;
  function syncVisibility() {
    visible = intersecting && document.visibilityState !== "hidden";
    if (visible) {
      start();
    } else if (running) {
      cancelAnimationFrame(raf);
      running = false;
    }
  }
  const intersection = new IntersectionObserver((entries) => {
    intersecting = entries[entries.length - 1]?.isIntersecting ?? true;
    syncVisibility();
  });
  document.addEventListener("visibilitychange", syncVisibility);
  intersection.observe(output);

  function onPointerMove(event: PointerEvent) {
    const x = event.clientX - outputRect.left;
    const y = outputRect.height - (event.clientY - outputRect.top);
    const inside =
      x >= 0 && x <= outputRect.width && y >= -40 && y <= zoneCss() * 1.2;
    const now = performance.now() / 1000;
    if (inside && stir.target > 0) {
      const dt = Math.max(now - stir.lastTime, 1 / 240);
      const vx = (x - stir.lastX) / dt;
      const vy = (y - stir.lastY) / dt;
      stir.vx += (clamp(vx, -1600, 1600) - stir.vx) * 0.35;
      stir.vy += (clamp(vy, -1600, 1600) - stir.vy) * 0.35;
    }
    stir.x = x;
    stir.y = y;
    stir.lastX = x;
    stir.lastY = y;
    stir.lastTime = now;
    stir.target = inside ? 1 : 0;
  }

  function onPointerLeave() {
    stir.target = 0;
  }

  window.addEventListener("pointermove", onPointerMove, { passive: true });
  document.documentElement.addEventListener("pointerleave", onPointerLeave, {
    passive: true,
  });

  return {
    setOptions(next) {
      next = resolveOptions(DEFAULTS, next);
      let changed = false;
      for (const [key, value] of Object.entries(next)) {
        const prev = config[key as keyof typeof config];
        if (Array.isArray(value) && Array.isArray(prev)) {
          if (value.length !== prev.length || value.some((item, i) => item !== prev[i])) {
            changed = true;
            break;
          }
        } else if (prev !== value) {
          changed = true;
          break;
        }
      }
      if (!changed) return;
      Object.assign(config, next);
      syncRamp();
      syncBacking();
      start();
    },
    resize() {
      refreshOutputRect();
      syncCanvasSize();
      start();
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(themeTimer);
      observer.disconnect();
      window.removeEventListener("resize", refreshOutputRect);
      window.removeEventListener("scroll", refreshOutputRect, true);
      intersection.disconnect();
      document.removeEventListener("visibilitychange", syncVisibility);
      themeObserver.disconnect();
      schemeQuery.removeEventListener("change", onThemeShift);
      motionQuery.removeEventListener("change", onMotionChange);
      window.removeEventListener("pointermove", onPointerMove);
      document.documentElement.removeEventListener("pointerleave", onPointerLeave);
      for (const value of [glowTarget, sparkTarget, ...fieldTargets]) destroyTarget(value);
      glowTarget = null;
      sparkTarget = null;
      fieldTargets = [];
      contentTexture?.destroy();
      rampTexture?.destroy();
      contentTexture = null;
      rampTexture = null;
      sparkGeometry?.destroy();
      sparkGeometry = null;
      screen?.dispose();
      if (htmlInCanvas) paintable!.onpaint = null;
    },
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
