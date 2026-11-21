// Powered by Paper Shaders: https://shaders.paper.design
// The paper surface is adapted from paper-texture in paper-design/shaders (Apache-2.0) and modified.

import { getCanvasPixelRatio, createCanvasResizeObserver } from "../canvas-viewport";
import { isHtmlInCanvasBlocked, prepareHtmlInCanvas, drawHtmlInCanvas } from "../html-in-canvas";
import {
  effect as gpuEffect,
  frame as gpuFrame,
  init,
  sampler,
  surface,
  type Effect,
  type Gpu,
  type Surface,
} from "vgpu";
import type { Texture } from "vgpu";
import { resolveOptions } from "../options";

export type CanvasPreset =
  | "canvas"
  | "raw"
  | "linen"
  | "burlap"
  | "paper"
  | "scroll";
export type CanvasLayer = "background" | "foreground" | "page";
export type CanvasFit = "cover" | "contain";

export interface CanvasOptions {
  /** Material to start from. Every option you pass overrides it. */
  preset?: CanvasPreset;
  /** Where the sheet sits: behind the content, laid over it, or with the content printed into it (html-in-canvas only, falls back to foreground). */
  layer?: CanvasLayer;
  /** Image to print onto the sheet. */
  src?: string;
  /** How the image fills the sheet. */
  fit?: CanvasFit;
  /** Sheet color, as any CSS color. */
  color?: string;
  /** Color of creases, grain and stains, as any CSS color. */
  shadow?: string;
  /** Backdrop around the sheet when it has an inset, or around a clipped image, as any CSS color. */
  back?: string;
  /** Margin left and right of the sheet in CSS pixels. The content is padded to sit on the sheet and the backdrop shows around it. */
  insetX?: number;
  /** Margin above and below the sheet in CSS pixels. */
  insetY?: number;
  /** Size of one sheet in CSS pixels. Folds, crumples and wrinkles scale with it. */
  size?: number;
  /** Seed for every pattern (0 to 1000). */
  seed?: number;
  /** Fine grain across the surface (0 to 1). */
  roughness?: number;
  /** Scale of the grain (0 to 1). */
  roughnessSize?: number;
  /** Lines the grain up into laid-paper rows (0 to 1). */
  roughnessRows?: number;
  /** Curly fibers through the paper (0 to 1). */
  fiber?: number;
  /** Scale of the fibers (0 to 1). */
  fiberSize?: number;
  /** Straight fold lines across the sheet (0 to 1). */
  folds?: number;
  /** Panels across the sheet between vertical folds. */
  foldColumns?: number;
  /** Panels down the sheet between horizontal folds. */
  foldRows?: number;
  /** Small crumpled facets repeating across the surface (0 to 1). */
  wrinkles?: number;
  /** Scale of the wrinkles (0 to 1). */
  wrinkleSize?: number;
  /** Large irregular creases, like a sheet crushed and flattened again (0 to 1). */
  crumples?: number;
  /** Number of facets in the crumple field (2 to 15). */
  crumpleCount?: number;
  /** Woven threads (0 to 1). */
  weave?: number;
  /** Width of one woven thread in CSS pixels. */
  weaveSize?: number;
  /** How far apart the threads sit, from a tight weave to an open one like burlap (0 to 1). */
  weaveOpen?: number;
  /** Uneven, lumpy threads, like linen (0 to 1). */
  slub?: number;
  /** Speckled stains across the sheet (0 to 1). */
  stains?: number;
  /** Radius of the rolled top and bottom edges in CSS pixels. 0 keeps the sheet flat. */
  curl?: number;
  /** Darkened, aged edges (0 to 1). */
  burn?: number;
  /** Direction the light comes from in degrees (0 to 360). */
  angle?: number;
  /** How much an image or the page bends with the surface (-1 to 1). */
  distortion?: number;
  /** How much of the paper shows through an image or the page (0 to 1). */
  blending?: number;
  /** Cut the sheet to the image frame. */
  clip?: boolean;
  /** Strength of the texture in the foreground layer (0 to 1). */
  strength?: number;
  /** How much the sheet color tints the content in the foreground layer (0 to 1). */
  tint?: number;
  /** A soft, low light follows the cursor and rakes across the texture. */
  interactive?: boolean;
  /** Radius of the cursor light in CSS pixels. */
  radius?: number;
  /** How strongly the cursor light picks out the texture (0 to 1). */
  glow?: number;
}

export interface CanvasElements {
  output: HTMLCanvasElement;
  source?: HTMLCanvasElement | null;
  content?: HTMLElement | null;
}

export interface CanvasInstance {
  setOptions: (options: CanvasOptions) => void;
  resize: () => void;
  destroy: () => void;
}

type Material = Omit<
  Required<CanvasOptions>,
  | "preset"
  | "layer"
  | "src"
  | "fit"
  | "back"
  | "insetX"
  | "insetY"
  | "clip"
  | "interactive"
  | "radius"
  | "glow"
  | "size"
>;

const BASE: Material = {
  color: "#f3efe6",
  shadow: "#968e80",
  seed: 4,
  roughness: 0.15,
  roughnessSize: 0.5,
  roughnessRows: 0,
  fiber: 0.15,
  fiberSize: 0.5,
  folds: 0,
  foldColumns: 3,
  foldRows: 2,
  wrinkles: 0,
  wrinkleSize: 0.4,
  crumples: 0,
  crumpleCount: 6,
  weave: 0.8,
  weaveSize: 3.5,
  weaveOpen: 0.2,
  slub: 0.3,
  stains: 0,
  curl: 0,
  burn: 0,
  angle: 300,
  distortion: 0.4,
  blending: 1,
  strength: 0.45,
  tint: 0,
};

export const CANVAS_PRESETS: Record<CanvasPreset, Material> = {
  canvas: BASE,
  raw: {
    ...BASE,
    color: "#ddd0b7",
    shadow: "#7a6d57",
    seed: 31,
    roughness: 0.2,
    fiber: 0.35,
    weave: 1,
    weaveSize: 4,
    weaveOpen: 0.3,
    slub: 0.6,
    tint: 0.15,
  },
  linen: {
    ...BASE,
    color: "#d6cebf",
    shadow: "#80786a",
    seed: 77,
    roughness: 0.15,
    fiber: 0.3,
    fiberSize: 0.7,
    weave: 0.9,
    weaveSize: 2.5,
    weaveOpen: 0.15,
    slub: 1,
    tint: 0.1,
  },
  burlap: {
    ...BASE,
    color: "#b3935f",
    shadow: "#4c3a20",
    seed: 140,
    roughness: 0.2,
    fiber: 0.6,
    fiberSize: 0.8,
    weave: 1,
    weaveSize: 7,
    weaveOpen: 0.6,
    slub: 0.8,
    strength: 0.35,
    tint: 0.2,
  },
  paper: {
    ...BASE,
    color: "#fbfaf6",
    shadow: "#b4afa4",
    roughness: 0.35,
    fiber: 0.35,
    wrinkles: 0.2,
    weave: 0,
  },
  scroll: {
    ...BASE,
    color: "#eedfba",
    shadow: "#7d5e36",
    seed: 211,
    roughness: 0.4,
    fiber: 0.5,
    fiberSize: 0.6,
    wrinkles: 0.2,
    weave: 0,
    stains: 0.25,
    curl: 36,
    burn: 0.35,
    angle: 30,
    tint: 0.25,
  },
};

const DEFAULTS: Required<CanvasOptions> = {
  ...BASE,
  preset: "canvas",
  layer: "background",
  src: "",
  fit: "cover",
  back: "transparent",
  insetX: 0,
  insetY: 0,
  size: 800,
  clip: false,
  interactive: true,
  radius: 550,
  glow: 0.15,
};

const MAX_CRUMPLES = 15;

type PaintableCanvas = HTMLCanvasElement & {
  onpaint?: (() => void) | null;
  requestPaint?: () => void;
};

type ElementImageContext = CanvasRenderingContext2D & {
  drawElementImage?: (element: Element, x: number, y: number) => void;
};

const SHADER = `
struct Params {
  colorBack: vec4f,
  colorPaper: vec4f,
  colorShadow: vec4f,
  lamp: vec4f,
  resolution: vec2f,
  scroll: vec2f,
  inset: vec2f,
  imageScale: vec2f,
  foldCount: vec2f,
  size: f32,
  mode: i32,
  blending: f32,
  distortion: f32,
  clip: f32,
  angle: f32,
  seed: f32,
  roughness: f32,
  roughnessSize: f32,
  roughnessRows: f32,
  fiber: f32,
  fiberSize: f32,
  folds: f32,
  wrinkles: f32,
  wrinkleSize: f32,
  crumples: f32,
  crumpleCount: f32,
  drops: f32,
  weave: f32,
  weaveSize: f32,
  weaveOpen: f32,
  slub: f32,
  curl: f32,
  burn: f32,
  strength: f32,
  tint: f32,
}

struct Folds {
  slope: vec2f,
  dark: vec2f,
  lift: vec2f,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var uImage: texture_2d<f32>;
@group(0) @binding(2) var uNoise: texture_2d<f32>;
@group(0) @binding(3) var uImageSampler: sampler;
@group(0) @binding(4) var uNoiseSampler: sampler;

const TWO_PI = 6.28318530718;
const PI = 3.14159265358979323846;

fn glslMod(x: f32, y: f32) -> f32 {
  return x - y * floor(x / y);
}

fn noiseAt(uv: vec2f) -> vec4f {
  return textureSampleLevel(uNoise, uNoiseSampler, uv, 0.0);
}

fn hash21(v: vec2f) -> f32 {
  var p = fract(v * vec2f(0.3183099, 0.3678794)) + 0.1;
  p += dot(p, p + 19.19);
  return fract(p.x * p.y);
}

fn hash22(v: vec2f) -> vec2f {
  var p = fract(v * vec2f(0.3183099, 0.3678794)) + 0.1;
  p += dot(p, p.yx + 19.19);
  return fract(vec2f(p.x * p.y, p.x + p.y));
}

fn getUvFrame(uv: vec2f) -> f32 {
  let invAA = 0.5 / clamp(fwidth(uv), vec2f(1e-5), vec2f(0.02));
  let lo = clamp(uv * invAA + 0.5, vec2f(0.0), vec2f(1.0));
  let hi = clamp((1.0 - uv) * invAA + 0.5, vec2f(0.0), vec2f(1.0));
  return lo.x * hi.x * lo.y * hi.y;
}

fn lst(edge0: f32, edge1: f32, x: f32) -> f32 {
  return clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
}

fn getRoughness(p: vec2f, lightDir: vec2f, seedShift: vec2f, basePixel: f32) -> f32 {
  let u = p / vec2f(2.0, 4.0);
  let w = 100.0 * basePixel;
  let eps = 4.0 * w;
  let size = mix(3.2, 0.8, params.roughnessSize);
  let logLac = log2(2.1);
  let level = -log2(w + 1e-8) / logLac;
  let baseLevel = floor(level) - 2.0;
  let fade = fract(level);
  let px = (u.x + vec2f(eps, -eps)) * 0.1;
  let py = u.y * 0.1;
  var sum = vec2f(0.0);
  var norm = 0.0;
  var amp = 0.5;
  var freq = exp2(baseLevel * logLac);
  for (var i = 0; i < 4; i++) {
    let absIdx = baseLevel + f32(i);
    let qx = size * px * freq;
    let qy = size * py * freq;
    var wi = 1.0;
    if (i == 0) { wi = 1.0 - fade; }
    if (i == 3) { wi = fade; }
    let fx = fract(qx);
    let fy = fract(qy);
    let shift = 0.5 + absIdx * 0.3 + seedShift;
    let uvY = floor(qy) / 50.0 + shift.y;
    let s0a = noiseAt(fract(vec2f(floor(qx.x) / 50.0 + shift.x, uvY))).rg;
    let s1a = noiseAt(fract(vec2f(ceil(qx.x) / 50.0 + shift.x, uvY))).rg;
    let s0b = noiseAt(fract(vec2f(floor(qx.y) / 50.0 + shift.x, uvY))).rg;
    let s1b = noiseAt(fract(vec2f(ceil(qx.y) / 50.0 + shift.x, uvY))).rg;
    let ny0 = mix(vec2f(s0a.r, s0b.r), vec2f(s0a.g, s0b.g), fy);
    let ny1 = mix(vec2f(s1a.r, s1b.r), vec2f(s1a.g, s1b.g), fy);
    let n = mix(ny0, ny1, fx);
    sum += amp * wi * n;
    norm += amp * wi;
    amp *= 0.8;
    freq *= 2.1;
  }
  let r = sum / norm;
  let dx = 0.5 + r.x - r.y;
  let grain = 3.0 * dx * dx - 0.7;
  let rowBand = fract(dot(p, lightDir) * 0.05 * size);
  return grain + 0.6 * params.roughnessRows * (rowBand - 0.5);
}

fn getFiber(p: vec2f, seedShift: vec2f, basePixel: f32) -> f32 {
  let size = mix(4.0, 1.0, params.fiberSize);
  let w = 50.0 * basePixel;
  let level = -log2(w + 1e-8);
  let baseLevel = floor(level) - 3.0;
  let fade = fract(level);
  var grad = vec2f(0.0);
  var scale = 1.0;
  var amp = 1.0;
  var freq = pow(1.7, baseLevel);
  for (var i = 0; i < 5; i++) {
    let absIdx = baseLevel + f32(i);
    var q = size * p * freq;
    let an = absIdx * 0.8;
    let rc = cos(an);
    let rs = sin(an);
    q = vec2f(rc * q.x - rs * q.y, rs * q.x + rc * q.y);
    var wi = 1.0;
    if (i == 0) { wi = 1.0 - fade; }
    if (i == 4) { wi = fade; }
    let iq = floor(q);
    let fq = fract(q);
    let shift = absIdx * 0.3;
    let uv = fract(vec4f(iq, iq + 1.0) / 50.0 + 0.5 + shift + seedShift.xyxy);
    let aF = noiseAt(uv.xy).b;
    let bF = noiseAt(uv.zy).b;
    let cF = noiseAt(uv.xw).b;
    let dF = noiseAt(uv.zw).b;
    let u = fq * fq * (3.0 - 2.0 * fq);
    let du = 8.0 * fq * (1.0 - fq);
    let dx = du.x * mix(bF - aF, dF - cF, u.y);
    let dy = du.y * mix(cF - aF, dF - bF, u.x);
    grad += wi * amp * scale * vec2f(rc * dx + rs * dy, -rs * dx + rc * dy);
    scale *= 1.7;
    amp *= 0.5;
    freq *= 1.7;
  }
  return clamp(0.333 * length(grad), 0.0, 1.0);
}

fn smoothNoise(p: vec2f) -> vec2f {
  let t = p * 50.0 - 0.5;
  let i = floor(t);
  var f = fract(t);
  f = f * f * (3.0 - 2.0 * f);
  return noiseAt(fract((i + f + 0.5) / vec2f(50.0))).rg;
}

fn getDrops(uv: vec2f, seedShift: vec2f) -> f32 {
  let iDropsUV = floor(uv);
  let fDropsUV = fract(uv);
  var dropsMinDist = 1.0;
  for (var y = -1; y < 2; y++) {
    for (var x = -1; x < 2; x++) {
      let neighbor = vec2f(f32(y), f32(x));
      let offset = hash22(iDropsUV + neighbor + 50.0 * seedShift);
      let pos = neighbor + offset - fDropsUV;
      dropsMinDist *= min(1.0, dot(pos, pos));
    }
  }
  return 0.5 * lst(0.09, 0.08, sqrt(sqrt(dropsMinDist)));
}

fn getCellTilt(idx: f32, radius: f32) -> vec2f {
  let rand = hash22(vec2f(idx + 31.0, idx * params.seed + 17.0));
  let an = rand.x * TWO_PI;
  return vec2f(cos(an), sin(an)) * mix(0.3, 1.7, rand.y * rand.y) * mix(0.7, 1.0, radius);
}

fn getCrumpleDetail(uv: vec2f, freq: f32, shift: f32, basePixel: f32) -> vec3f {
  let v = uv * freq;
  let pixel = 0.9 * freq * basePixel;
  let base = floor(v);
  var n1 = 9.0;
  var n2 = 9.0;
  var s1 = vec2f(0.0);
  var s2 = vec2f(0.0);
  var q1 = vec2f(0.0);
  var q2 = vec2f(0.0);
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      let cell = base + vec2f(f32(x), f32(y));
      let q = hash22(vec2f(cell.y * 1.9 + 3.1 + shift, cell.x * 1.3 + 0.11 * params.seed));
      if (q.y > 0.8) { continue; }
      let r = hash22(vec2f(cell.x + 0.37 * params.seed + shift + 11.1, cell.y - 0.21 * params.seed + 5.7));
      let s = cell + 0.06 + 0.88 * r;
      let d = v - s;
      let dsq = dot(d, d);
      if (dsq < n1) {
        n2 = n1;
        s2 = s1;
        q2 = q1;
        n1 = dsq;
        s1 = s;
        q1 = q;
      } else if (dsq < n2) {
        n2 = dsq;
        s2 = s;
        q2 = q;
      }
    }
  }
  if (n1 > 8.0) { return vec3f(0.0); }
  let an1 = q1.x * TWO_PI;
  let mag1 = q1.y / 0.8;
  let t1 = vec2f(cos(an1), sin(an1)) * mix(0.3, 1.7, mag1 * mag1);
  let an2 = q2.x * TWO_PI;
  let mag2 = q2.y / 0.8;
  let t2 = vec2f(cos(an2), sin(an2)) * mix(0.3, 1.7, mag2 * mag2);
  let span = s1 - s2;
  let spanLen = max(length(span), 1e-4);
  let toEdge = (n2 - n1) / (2.0 * spanLen);
  let pair = hash21(s1 + s2 + 1.7 * abs(s1 - s2));
  let pairSoft = 0.05 + 0.1 * step(pair, 0.4);
  var b = clamp(toEdge / max(1.5 * pixel, 0.5 * pairSoft), 0.0, 1.0);
  b = b * b * (3.0 - 2.0 * b);
  let d1 = max(sqrt(n1), 1e-4);
  let depth = 0.2 * d1;
  let shoulderAmt = max(0.0, 1.0 - toEdge / 0.42) * b;
  var shoulder = vec2f(0.0);
  if (shoulderAmt > 0.0) {
    let d2 = max(sqrt(n2), 1e-4);
    shoulder = shoulderAmt * ((v - s2) / d2 - (v - s1) / d1);
  }
  let mid = 0.5 * (t1 + t2);
  return vec3f(mid + (t1 - mid) * b + 0.9 * shoulder, depth);
}

fn getCrumples(uv: vec2f) -> vec4f {
  let crumpleN = max(2.0, floor(params.crumpleCount + 0.5));
  var near = 60000.0;
  var nearB = 60000.0;
  var idx = 0.0;
  var rad = 0.0;
  var nearP = vec2f(0.0);
  var nearPb = vec2f(0.0);
  var seeds: array<vec4f, ${MAX_CRUMPLES}>;
  for (var i = 0; i < ${MAX_CRUMPLES}; i++) {
    seeds[i] = vec4f(0.0);
    if (f32(i) >= crumpleN) { continue; }
    let rand = hash22(vec2f(f32(i), f32(i) * params.seed));
    let an = rand.x * TWO_PI;
    let p = vec2f(cos(an), sin(an)) * rand.y;
    seeds[i] = vec4f(p, rand);
    let d = uv - p;
    let dsq = dot(d, d);
    if (dsq < near) {
      nearB = near;
      nearPb = nearP;
      near = dsq;
      idx = f32(i);
      rad = rand.y;
      nearP = p;
    } else if (dsq < nearB) {
      nearB = dsq;
      nearPb = p;
    }
  }
  let l = sqrt(near);
  let lb = sqrt(nearB);
  let dir = (uv - nearP) / max(l, 1e-4);
  let edge = lst(0.0, 0.5, lb - l);
  let shoulderLimit = l + 0.5;
  var tilt = getCellTilt(idx, rad);
  var tiltSum = 1.0;
  var wide = vec2f(0.0);
  var wideSum = 0.0;
  var toEdge = 9.0;
  var edgeSoft = 0.0;
  for (var i = 0; i < ${MAX_CRUMPLES}; i++) {
    if (f32(i) >= crumpleN) { break; }
    if (f32(i) == idx) { continue; }
    let cellSeed = seeds[i];
    let p = cellSeed.xy;
    let rand = cellSeed.zw;
    let d = uv - p;
    let dsq = dot(d, d);
    if (dsq < shoulderLimit * shoulderLimit) {
      let di = sqrt(dsq);
      let shoulder = lst(0.5, 0.0, di - l);
      wide += shoulder * (d / max(di, 1e-4) - dir);
      wideSum += shoulder;
    }
    let pairSoft = 0.01 + 0.05 * step(0.2, rand.x) + 0.3 * rand.y;
    let toBisector = (dsq - near) / (0.2 * max(length(p - nearP), 1e-4));
    if (toBisector < toEdge) {
      toEdge = toBisector;
      edgeSoft = pairSoft;
    }
    var w = 1.0 - toBisector / pairSoft;
    if (w > 0.0) {
      w *= w;
      tilt += w * getCellTilt(f32(i), rand.y);
      tiltSum += w;
    }
  }
  let blend = clamp(toEdge / max(edgeSoft, 1e-4), 0.0, 1.0);
  let sharp = (1.0 - edge) * ((uv - nearPb) / max(lb, 1e-4) - dir);
  let rounding = mix(sharp, wide / max(wideSum, 1.0), min(2.0 * edgeSoft, 1.0));
  let radial = l / max(l + toEdge, 1e-4);
  return vec4f(tilt / tiltSum + rounding * blend * radial, 0.2 * l, edge);
}

fn getFolds(coord: vec2f, offset: vec2f, count: vec2f, noise: vec2f, baseFwidth: vec2f) -> Folds {
  let g = coord * count + 0.5 * offset + noise;
  let dx = fract(g) - 0.5;
  let adx = abs(dx);
  let t = clamp(adx / 0.3, vec2f(0.0), vec2f(1.0));
  let dark = t * t * (3.0 - 2.0 * t);
  var lift = 1.0 - t;
  lift *= lift;
  let crease = clamp(dx / max(count * baseFwidth, vec2f(1e-5)), vec2f(-1.0), vec2f(1.0));
  var slope = crease * (1.0 - dark);
  let lineWidth = 0.02 * count * mix(vec2f(2.5), vec2f(0.8), dark.yx) + 0.1 * noise;
  slope -= 1.0 - smoothstep(vec2f(0.0), lineWidth, adx);
  return Folds(slope, dark, lift);
}

fn weaveHeight(t: vec2f) -> f32 {
  let cell = floor(t);
  let f = fract(t) - 0.5;
  let over = glslMod(cell.x + cell.y, 2.0);
  let jx = hash21(vec2f(cell.x, 3.1 + params.seed)) - 0.5;
  let jy = hash21(vec2f(7.7 + params.seed, cell.y)) - 0.5;
  let slubV = smoothNoise(vec2f(cell.x * 0.37, t.y * 0.045) + 0.13).x - 0.5;
  let slubH = smoothNoise(vec2f(t.x * 0.045, cell.y * 0.37) + 0.71).y - 0.5;
  let halfWidth = mix(0.47, 0.24, params.weaveOpen);
  let wV = halfWidth * (1.0 + params.slub * (0.7 * slubV + 0.2 * jx));
  let wH = halfWidth * (1.0 + params.slub * (0.7 * slubH + 0.2 * jy));
  let vx = clamp(abs(f.x + 0.06 * params.slub * jx) / max(wV, 0.05), 0.0, 1.0);
  let hy = clamp(abs(f.y + 0.06 * params.slub * jy) / max(wH, 0.05), 0.0, 1.0);
  let twistV = 0.07 * sin((t.y * 2.4 + f.x * 1.3) * TWO_PI) * (1.0 - vx);
  let twistH = 0.07 * sin((t.x * 2.4 + f.y * 1.3) * TWO_PI) * (1.0 - hy);
  let vertical = (sqrt(1.0 - vx * vx) + twistV) * mix(0.45 + 0.2 * cos(f.y * PI), 0.65 + 0.35 * cos(f.y * PI), over);
  let horizontal = (sqrt(1.0 - hy * hy) + twistH) * mix(0.65 + 0.35 * cos(f.x * PI), 0.45 + 0.2 * cos(f.x * PI), over);
  return max(vertical, horizontal);
}

@fragment fn fs_main(@builtin(position) position: vec4f) -> @location(0) vec4f {
  let px = position.xy;
  let sheetUv = px / params.resolution;
  let sheetSize = max(params.resolution - 2.0 * params.inset, vec2f(1.0));
  let sheet01 = (px - params.inset) / sheetSize;
  let basePixel = 1.0 / params.size;

  let lightRad = radians(params.angle);
  let lightDir = vec2f(sin(lightRad), -cos(lightRad));
  let lightPower = mix(0.75, 1.0, clamp(0.5 + dot(sheetUv - 0.5, lightDir), 0.0, 1.0));
  let foldAngleInSector = glslMod(params.angle, 90.0);
  let foldLightRad = radians(params.angle - foldAngleInSector + mix(12.0, 78.0, foldAngleInSector / 90.0));
  let foldLightDir = vec2f(sin(foldLightRad), -cos(foldLightRad));

  let grazing = 0.7;
  var relief = vec2f(0.0);
  var foldSlope = vec2f(0.0);
  var reliefAmount = 0.0;
  var foldInk = 1.0;
  var crumpleFlow = vec2f(0.0);
  var crumpleDepth = 0.0;
  var wrinkleDepth = 0.0;
  var foldDepth = 0.0;

  let warped = px + params.scroll;
  var patternUV = (warped - 0.5 * params.resolution) / params.size;
  var lamp = 0.0;
  var lampDir = lightDir;
  if (params.lamp.w > 0.001) {
    let toLamp = px - params.lamp.xy;
    let height = 0.55 * params.lamp.z;
    lamp = params.lamp.w * exp(-dot(toLamp, toLamp) / max(params.lamp.z * params.lamp.z, 1.0));
    lampDir = (toLamp + lightDir * height * 0.7) / sqrt(dot(toLamp, toLamp) + height * height);
  }

  let warpNoise = smoothNoise(patternUV * 0.1 + 0.2 + 0.6 * fract(0.017 * params.seed)) - 0.5;
  let crumplesUV = patternUV * 0.9 + 0.012 * warpNoise;

  if (params.crumples > 0.0) {
    let crumples = getCrumples(crumplesUV);
    var crumpleTilt = 0.5 * params.crumples * crumples.xy;
    crumpleTilt -= 0.1 * max(dot(crumpleTilt, lightDir), 0.0) * lightDir;
    relief += crumpleTilt;
    reliefAmount += 0.6 * params.crumples;
    crumpleFlow = crumples.w * crumpleTilt;
    crumpleDepth = clamp(5.0 * crumples.z, 0.0, 1.0);
  }

  if (params.wrinkles > 0.0) {
    var detailFreq = mix(10.0, 1.0, params.wrinkleSize);
    var detailAmp = 0.2;
    var detailGrad = vec2f(0.0);
    var detailDepth = 0.0;
    var depthSum = 0.0;
    for (var i = 0; i < 3; i++) {
      let detail = getCrumpleDetail(crumplesUV, detailFreq, 31.0 * f32(i), basePixel);
      detailGrad += detailAmp * detail.xy;
      detailDepth += detailAmp * detail.z;
      depthSum += detailAmp;
      detailAmp *= (0.5 + 0.2 * detailGrad.x);
      detailFreq *= 2.1;
    }
    var detailTilt = 1.5 * params.wrinkles * detailGrad;
    detailTilt -= 0.65 * max(dot(detailTilt, lightDir), 0.0) * lightDir;
    relief += detailTilt;
    reliefAmount += 0.6 * params.wrinkles;
    wrinkleDepth = clamp(5.0 * detailDepth / max(depthSum, 1e-4), 0.0, 1.0);
  }

  if (params.folds > 0.0) {
    let foldCount = max(params.foldCount, vec2f(1.0));
    let foldNoise = 0.003 * warpNoise * foldCount;
    let uv = sheet01 + 0.03 * crumpleFlow * params.size / sheetSize;
    let folds = getFolds(uv, vec2f(1.0), foldCount, foldNoise, 1.0 / sheetSize);
    foldSlope = params.folds * folds.slope;
    reliefAmount += params.folds;
    let ink = mix(vec2f(0.96), vec2f(1.0), folds.dark);
    let flatness = folds.dark.x * folds.dark.y;
    foldInk *= mix(1.0, ink.x * ink.y * mix(0.5, 0.3, flatness), params.folds);
    foldDepth = params.folds * (folds.lift.y * foldLightDir.y - folds.lift.x * foldLightDir.x);
  }

  var weaveDark = 0.0;
  if (params.weave > 0.0) {
    let t = warped / max(params.weaveSize, 1.0);
    let e = 0.12;
    let h = weaveHeight(t);
    let grad = vec2f(
      weaveHeight(t + vec2f(e, 0.0)) - weaveHeight(t - vec2f(e, 0.0)),
      weaveHeight(t + vec2f(0.0, e)) - weaveHeight(t - vec2f(0.0, e))
    ) / (2.0 * e);
    relief += 0.3 * params.weave * grad;
    reliefAmount += 0.5 * params.weave;
    let cell = floor(t);
    let slub = hash21(vec2f(cell.x * 1.7, 0.0)) * hash21(vec2f(0.0, cell.y * 1.3));
    weaveDark = params.weave * ((1.0 - smoothstep(0.0, 0.4, h)) * mix(0.4, 0.6, params.weaveOpen) + 0.1 * (slub - 0.25));
  }

  var contentUv = sheetUv;
  var curlShade = 0.0;
  if (params.curl > 0.5) {
    let radius = params.curl;
    for (var s = 0; s < 2; s++) {
      let y = select(params.resolution.y - params.inset.y - px.y, px.y - params.inset.y, s == 0);
      let side = select(-1.0, 1.0, s == 0);
      if (y < 2.0 * radius) {
        let q = (y - radius) / radius;
        relief += vec2f(0.0, side * q * 1.2);
        reliefAmount += 0.4;
        let theta = asin(clamp(q, -1.0, 1.0));
        let rolled = 2.0 * radius - radius * (PI * 0.5 - theta);
        contentUv.y = select(params.resolution.y - params.inset.y - rolled, rolled + params.inset.y, s == 0) / params.resolution.y;
        curlShade += (1.0 - smoothstep(-1.0, -0.25, q)) * 0.4 + smoothstep(0.75, 1.0, q) * 0.3;
      } else {
        curlShade += (1.0 - smoothstep(2.0 * radius, 2.7 * radius, y)) * 0.22;
      }
    }
  }

  let unlit = cos(grazing);
  var lit = unlit;
  var pattern = 0.0;
  var shade = 0.0;
  var sheen = 0.0;
  if (reliefAmount > 0.0) {
    let slope = clamp(dot(relief, lightDir) + dot(foldSlope, foldLightDir), -1.2, 1.2);
    lit = max(cos(slope + grazing), 0.0);
    shade = (lit - unlit) * foldInk * lightPower;
    if (lamp > 0.001) {
      let raking = clamp(dot(relief + foldSlope, lampDir) * 1.8, -1.4, 1.4);
      let lampShade = (max(cos(raking + 1.05), 0.0) - cos(1.05)) * foldInk;
      shade = mix(shade, lampShade * 1.6, lamp);
      sheen = lamp * max(-lampShade, 0.0);
    }
    pattern += 0.35 * clamp(reliefAmount, 0.0, 1.0) * unlit * foldInk * lightPower + shade;
  }

  patternUV += 0.04 * crumpleFlow;
  let seedShift = floor(fract(params.seed * vec2f(0.7548776662, 0.5698402909)) * 50.0) / 50.0;
  var roughness = 0.0;
  var fiber = 0.0;
  var drops = 0.0;
  if (params.roughness > 0.0) {
    roughness = params.roughness * getRoughness(1000.0 * patternUV, lightDir, seedShift, basePixel);
  }
  if (params.fiber > 0.0) {
    fiber = params.fiber * getFiber(50.0 * patternUV, seedShift, basePixel);
  }
  if (params.drops > 0.0) {
    drops = params.drops * getDrops(patternUV * 10.0, seedShift);
  }
  let grain = roughness + fiber + weaveDark + curlShade;
  pattern = clamp(pattern + grain, 0.0, 1.0);

  var burn = 0.0;
  if (params.burn > 0.0) {
    let edge = min(px - params.inset, params.resolution - params.inset - px) / params.size;
    let e = min(edge.x, edge.y)
      + 0.07 * (smoothNoise(patternUV * 0.35 + 0.3).x - 0.5)
      + 0.03 * (smoothNoise(patternUV * 1.7 + 0.7).y - 0.5);
    burn = params.burn * (1.0 - smoothstep(0.0, 0.2, e));
  }

  if (params.mode == 3) {
    let surfaceShade = 1.2 * shade + 0.7 * (grain - 0.14 * params.fiber - 0.05 * params.roughness) + 0.5 * drops + 0.8 * burn;
    let dark = (surfaceShade - 0.3 * sheen) * params.strength;
    let aDark = clamp(dark, 0.0, 1.0);
    let aLight = clamp(-dark, 0.0, 1.0) * 0.8;
    var rgb = params.colorShadow.rgb * aDark + vec3f(1.0) * aLight;
    var alpha = aDark + aLight;
    rgb += params.colorPaper.rgb * params.tint * (1.0 - alpha);
    alpha += params.tint * (1.0 - alpha);
    return vec4f(rgb, alpha);
  }

  let backColor = params.colorBack.rgb * params.colorBack.a;
  let backOpacity = params.colorBack.a;
  let baseColor = params.colorPaper.rgb * params.colorPaper.a;
  let baseOpacity = params.colorPaper.a;
  let shadowColor = params.colorShadow.rgb * params.colorShadow.a;
  let shadowOpacity = params.colorShadow.a;

  var color = shadowColor * pattern;
  var opacity = shadowOpacity * pattern;
  color += baseColor * (1.0 - opacity);
  opacity += baseOpacity * (1.0 - opacity);

  if (params.mode == 1 || params.mode == 2) {
    let notClipped = select(1.0, 0.1, params.clip > 0.5);
    let imageCenteredUV = (select(contentUv, sheet01, params.mode == 1) - 0.5) * params.imageScale;
    let edgeDist = 2.0 * max(abs(sheetUv.x - 0.5), abs(sheetUv.y - 0.5));
    let wrinkleDistortion = mix(0.38, 0.0175, smoothstep(0.0, 1.0, edgeDist));
    let scaleDistortion = 0.15 * params.crumples * (crumpleDepth - 0.5)
      + wrinkleDistortion * params.wrinkles * (wrinkleDepth - 0.5)
      + 0.05 * foldDepth;
    let linearDistortion = notClipped * 0.002 * lightDir * drops;
    let radialDistortion = notClipped * 0.02 * (roughness + fiber);
    var centeredUV = imageCenteredUV * (1.0 - params.distortion * scaleDistortion);
    centeredUV -= params.distortion * linearDistortion;
    let imageUV = 0.5 + centeredUV * (1.0 - abs(params.distortion) * radialDistortion * dot(centeredUV, centeredUV));

    var frame = getUvFrame(imageUV);
    var image = textureSampleLevel(uImage, uImageSampler, clamp(imageUV, vec2f(0.0), vec2f(1.0)), 0.0);
    image = vec4f(image.rgb / max(image.a, 0.0001), image.a);
    frame *= image.a;

    let maxC = max(max(image.r, image.g), image.b);
    let minC = min(min(image.r, image.g), image.b);
    var sat = 0.0;
    if (maxC > 0.0) { sat = (maxC - minC) / maxC; }
    let midC = image.r + image.g + image.b - maxC - minC;
    var secondaryness = 0.0;
    if (maxC > minC) { secondaryness = (midC - minC) / (maxC - minC); }
    let satDampen = sat * (1.0 - 0.5 * secondaryness);
    let darkDampen = 1.0 - dot(vec3f(0.2126, 0.7152, 0.0722), image.rgb);
    let dampen = mix(0.0, 0.7, params.blending) * max(satDampen, darkDampen);

    let paper = vec3f(1.0) - opacity + color;
    var pic = image.rgb * paper * params.blending + image.rgb * (1.0 - params.blending);
    pic = mix(pic, vec3f(1.0), select(0.6, 0.25, params.mode == 2) * pow(dampen, 2.0 + 3.0 * pattern));

    color = mix(color, pic, frame);
    opacity = frame + opacity * (1.0 - frame);

    if (params.clip > 0.5) {
      color *= frame;
      opacity *= frame;
    }
  }

  color += sheen * 0.12 * opacity;
  color *= mix(vec3f(1.0), 0.5 * params.colorShadow.rgb, drops * shadowOpacity);
  color = mix(color, params.colorShadow.rgb * 0.28 * opacity, burn);

  let margin = max(params.inset.x, params.inset.y);
  if (margin > 0.5) {
    let inner = min(px - params.inset, params.resolution - params.inset - px);
    let inside = clamp(min(inner.x, inner.y) + 0.5, 0.0, 1.0);
    let shadowPx = px - vec2f(0.0, 0.1 * margin);
    let shadowInner = min(shadowPx - params.inset, params.resolution - params.inset - shadowPx);
    let away = max(-min(shadowInner.x, shadowInner.y), 0.0);
    let drop = (1.0 - inside) * 0.3 * exp(-away / max(0.3 * margin, 1.0));
    color *= inside;
    opacity *= inside;
    opacity += drop * (1.0 - opacity);
  }

  color += backColor * (1.0 - opacity);
  opacity += backOpacity * (1.0 - opacity);
  return vec4f(color, opacity);
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

type Rgba = [number, number, number, number];

const colorProbe: { ctx: CanvasRenderingContext2D | null } = { ctx: null };

function parseColor(value: string, fallback: Rgba): Rgba {
  if (typeof document === "undefined") return fallback;
  if (!colorProbe.ctx) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    colorProbe.ctx = canvas.getContext("2d", { willReadFrequently: true });
  }
  const ctx = colorProbe.ctx;
  if (!ctx) return fallback;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = "#000";
  ctx.fillStyle = value;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  if (a === 0) return [0, 0, 0, 0];
  return [r / 255, g / 255, b / 255, a / 255];
}

export function buildCanvasNoise(size = 128): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  let state = 0x9e3779b9;
  for (let i = 0; i < data.length; i++) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    data[i] = (state >>> 0) & 255;
  }
  return data;
}

export function resolveCanvasOptions(options: CanvasOptions): Required<CanvasOptions> {
  const preset = options.preset ?? DEFAULTS.preset;
  const base: Required<CanvasOptions> = {
    ...DEFAULTS,
    ...(CANVAS_PRESETS[preset] ?? CANVAS_PRESETS.paper),
    preset,
  };
  return { ...base, ...resolveOptions(base, options) };
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

export function createCanvas(
  elements: CanvasElements,
  options: CanvasOptions = {},
): CanvasInstance | null {
  if (!supportsWebGPU()) return null;
  try {
    return initializeCanvas(elements, options);
  } catch (error) {
    console.error("Canvas initialization failed:", error);
    return null;
  }
}

function initializeCanvas(
  elements: CanvasElements,
  options: CanvasOptions,
): CanvasInstance | null {
  let config = resolveCanvasOptions(options);
  let colors = resolveColors();

  function resolveColors() {
    return {
      back: parseColor(config.back, [0, 0, 0, 0]),
      paper: parseColor(config.color, [1, 1, 1, 1]),
      shadow: parseColor(config.shadow, [0.7, 0.7, 0.7, 1]),
    };
  }
  let raw: CanvasOptions = { ...options };
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
  let pageDirty = false;
  let textureUploadErrorLogged = false;
  let dirty = true;
  let wake = () => {};

  if (htmlInCanvas) {
    paintable!.onpaint = () => {
      try {
        sourceCtx!.reset();
        drawHtmlInCanvas(source!, sourceCtx!, content!, true);
        pageDirty = true;
        wake();
      } catch {}
    };
  }

  let gpu: Gpu | null = null;
  let screen: Surface | null = null;
  let fx: Effect | null = null;
  let noiseTexture: Texture | null = null;
  let imageTexture: Texture | null = null;
  let fallback2d: CanvasRenderingContext2D | null = null;

  function writeImageTexture(
    image: HTMLImageElement | HTMLCanvasElement,
    width: number,
    height: number,
  ) {
    if (
      !imageTexture ||
      imageTexture.size[0] !== width ||
      imageTexture.size[1] !== height
    ) {
      imageTexture?.destroy();
      imageTexture = gpu!.device.createTexture({
        size: [width, height],
        format: "rgba8unorm",
        usage: ["texture_binding", "copy_dst", "render_attachment"],
        label: "canvas.image",
      });
      fx?.set({ uImage: imageTexture });
    }
    gpu!.gpu.queue.copyExternalImageToTexture(
      { source: image },
      { texture: imageTexture.gpu, premultipliedAlpha: true },
      [width, height],
    );
  }

  let imageReady = false;
  let imageAspect = 1;
  let imageSrc = "";
  let pendingImage: HTMLImageElement | null = null;

  function uploadImage() {
    if (!gpu || !pendingImage) return;
    const img = pendingImage;
    pendingImage = null;
    try {
      writeImageTexture(
        img,
        Math.max(1, img.naturalWidth),
        Math.max(1, img.naturalHeight),
      );
      imageReady = true;
    } catch (error) {
      console.warn("Canvas could not use its image:", error);
    }
    dirty = true;
  }

  function loadImage() {
    const next = config.src;
    if (next === imageSrc) return;
    imageSrc = next;
    imageReady = false;
    pendingImage = null;
    dirty = true;
    if (!next) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => {
      if (destroyed || imageSrc !== next) return;
      imageAspect = img.naturalWidth / Math.max(img.naturalHeight, 1);
      pendingImage = img;
      uploadImage();
      dirty = true;
      wake();
    };
    img.onerror = () => {
      if (!destroyed) console.warn("Canvas could not load its image:", next);
    };
    img.src = next;
  }

  let dpr = 1;

  function syncCanvasSize(): boolean {
    let changed = false;
    dpr = getCanvasPixelRatio(output);
    const width = Math.max(1, Math.round(output.clientWidth * dpr));
    const height = Math.max(1, Math.round(output.clientHeight * dpr));
    if (output.width !== width || output.height !== height) {
      if (screen) {
        screen.resize([width, height]);
      } else {
        output.width = width;
        output.height = height;
      }
      changed = true;
    }
    if (htmlInCanvas) {
      const sourceWidth = Math.max(1, Math.round(source!.clientWidth * dpr));
      const sourceHeight = Math.max(1, Math.round(source!.clientHeight * dpr));
      if (source!.width !== sourceWidth || source!.height !== sourceHeight) {
        source!.width = sourceWidth;
        source!.height = sourceHeight;
        changed = true;
      }
      paintable!.requestPaint!();
    }
    dirty = true;
    return changed;
  }

  syncCanvasSize();
  loadImage();

  function pageMode() {
    return htmlInCanvas && config.layer === "page";
  }

  function mode(): number {
    if (pageMode()) return 2;
    if (imageReady) return 1;
    if (config.layer !== "background") return 3;
    return 0;
  }

  function uploadPage() {
    if (!gpu || !pageDirty) return;
    pageDirty = false;
    if (!pageMode()) return;
    try {
      writeImageTexture(
        source!,
        Math.max(1, source!.width),
        Math.max(1, source!.height),
      );
      textureUploadErrorLogged = false;
    } catch (error) {
      if (!textureUploadErrorLogged) {
        textureUploadErrorLogged = true;
        console.warn("Canvas could not upload its content texture:", error);
      }
    }
  }

  const lamp = { x: 0, y: 0, tx: 0, ty: 0, presence: 0, over: false };

  const overlayFixed =
    !content &&
    output.parentElement !== null &&
    getComputedStyle(output.parentElement).position === "fixed";

  function scrollOffset(): [number, number] {
    if (mode() === 1 || mode() === 2) return [0, 0];
    if (content) return [content.scrollLeft, content.scrollTop];
    if (overlayFixed) return [window.scrollX, window.scrollY];
    return [0, 0];
  }

  function sheetInset(): [number, number] {
    if (mode() === 3) return [0, 0];
    return [
      Math.min(Math.max(config.insetX, 0) * dpr, output.width * 0.45),
      Math.min(Math.max(config.insetY, 0) * dpr, output.height * 0.45),
    ];
  }

  function imageScale(): [number, number] {
    if (mode() !== 1) return [1, 1];
    const [insetX, insetY] = sheetInset();
    const sheetAspect =
      Math.max(output.width - 2 * insetX, 1) / Math.max(output.height - 2 * insetY, 1);
    const ratio = imageAspect / sheetAspect;
    if (config.fit === "contain") {
      return ratio > 1 ? [1, ratio] : [1 / ratio, 1];
    }
    return ratio > 1 ? [1 / ratio, 1] : [1, ratio];
  }

  function render() {
    if (!gpu || !screen || !fx) return;
    uploadPage();
    const { back, paper, shadow } = colors;
    const [scrollX, scrollY] = scrollOffset();
    fx.set({
      params: {
        colorBack: back,
        colorPaper: paper,
        colorShadow: shadow,
        lamp: [
          lamp.x * dpr,
          lamp.y * dpr,
          Math.max(config.radius, 20) * dpr,
          lamp.presence * clamp(config.glow, 0, 1),
        ],
        resolution: [output.width, output.height],
        scroll: [scrollX * dpr, scrollY * dpr],
        inset: sheetInset(),
        imageScale: imageScale(),
        foldCount: [Math.max(config.foldColumns, 1), Math.max(config.foldRows, 1)],
        size: Math.max(config.size, 50) * dpr,
        mode: mode(),
        blending: clamp(config.blending, 0, 1),
        distortion: clamp(config.distortion, -1, 1),
        clip: config.clip && mode() === 1 ? 1 : 0,
        angle: config.angle,
        seed: config.seed,
        roughness: clamp(config.roughness, 0, 1),
        roughnessSize: clamp(config.roughnessSize, 0, 1),
        roughnessRows: clamp(config.roughnessRows, 0, 1),
        fiber: clamp(config.fiber, 0, 1),
        fiberSize: clamp(config.fiberSize, 0, 1),
        folds: clamp(config.folds, 0, 1),
        wrinkles: clamp(config.wrinkles, 0, 1),
        wrinkleSize: clamp(config.wrinkleSize, 0, 1),
        crumples: clamp(config.crumples, 0, 1),
        crumpleCount: clamp(config.crumpleCount, 2, MAX_CRUMPLES),
        drops: clamp(config.stains, 0, 1),
        weave: clamp(config.weave, 0, 1),
        weaveSize: Math.max(config.weaveSize, 1) * dpr,
        weaveOpen: clamp(config.weaveOpen, 0, 1),
        slub: clamp(config.slub, 0, 1),
        curl: Math.max(config.curl, 0) * dpr,
        burn: clamp(config.burn, 0, 1),
        strength: clamp(config.strength, 0, 1),
        tint: clamp(config.tint, 0, 1),
      },
    });
    gpuFrame(gpu, (f) => f.pass(screen!, fx!));
    dirty = false;
  }

  function renderFallback() {
    if (!fallback2d || !htmlInCanvas || !pageDirty) return;
    pageDirty = false;
    fallback2d.clearRect(0, 0, output.width, output.height);
    fallback2d.drawImage(source!, 0, 0, output.width, output.height);
  }

  let raf = 0;
  let lastTime = performance.now();
  let running = false;
  let visible = true;

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reducedMotion = motionQuery.matches;

  function step(delta: number): boolean {
    const follow = reducedMotion ? 1 : 1 - Math.exp(-delta * 9);
    const fade = reducedMotion ? 1 : 1 - Math.exp(-delta * 5);
    lamp.x += (lamp.tx - lamp.x) * follow;
    lamp.y += (lamp.ty - lamp.y) * follow;
    const target = config.interactive && lamp.over ? 1 : 0;
    lamp.presence += (target - lamp.presence) * fade;
    const moving =
      Math.abs(lamp.tx - lamp.x) > 0.3 ||
      Math.abs(lamp.ty - lamp.y) > 0.3 ||
      Math.abs(target - lamp.presence) > 0.002;
    if (!moving) {
      lamp.x = lamp.tx;
      lamp.y = lamp.ty;
      lamp.presence = target;
    }
    return moving;
  }

  function frame(time: number) {
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
    const delta = Math.min((time - lastTime) / 1000, 1 / 20);
    lastTime = time;
    const busy = step(delta);
    if (busy || dirty || pageDirty) render();
    if (!busy && !dirty && !pageDirty) {
      running = false;
      return;
    }
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
        label: "canvas",
      });
      const linear = sampler(device, {
        minFilter: "linear",
        magFilter: "linear",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
      });
      const repeat = sampler(device, {
        minFilter: "linear",
        magFilter: "linear",
        addressModeU: "repeat",
        addressModeV: "repeat",
      });
      noiseTexture = device.device.createTexture({
        size: [128, 128],
        format: "rgba8unorm",
        usage: ["texture_binding", "copy_dst"],
        label: "canvas.noise",
      });
      device.gpu.queue.writeTexture(
        { texture: noiseTexture.gpu },
        buildCanvasNoise(128) as Uint8Array<ArrayBuffer>,
        { bytesPerRow: 128 * 4, rowsPerImage: 128 },
        [128, 128],
      );
      imageTexture = device.device.createTexture({
        size: [1, 1],
        format: "rgba8unorm",
        usage: ["texture_binding", "copy_dst", "render_attachment"],
        label: "canvas.image",
      });
      uploadImage();
      fx = gpuEffect(device, SHADER, {
        label: "canvas",
        set: {
          uImage: imageTexture,
          uNoise: noiseTexture,
          uImageSampler: linear,
          uNoiseSampler: repeat,
        },
      });
      syncCanvasSize();
      start();
    })
    .catch((error) => {
      if (destroyed) return;
      console.warn("Canvas: WebGPU unavailable, showing content without the effect.", error);
      if (!htmlInCanvas || screen) return;
      fallback2d = output.getContext("2d");
      pageDirty = true;
      start();
    });

  start();

  function onMotionChange() {
    reducedMotion = motionQuery.matches;
    dirty = true;
    start();
  }
  motionQuery.addEventListener("change", onMotionChange);

  let outputRect = output.getBoundingClientRect();
  const refreshOutputRect = () => {
    outputRect = output.getBoundingClientRect();
  };
  const onScroll = () => {
    refreshOutputRect();
    dirty = true;
    start();
  };

  const observer = createCanvasResizeObserver(() => {
    refreshOutputRect();
    syncCanvasSize();
    start();
  });
  observer.observe(output);
  if (content) observer.observe(content);
  window.addEventListener("resize", refreshOutputRect, { passive: true });
  window.addEventListener("scroll", onScroll, {
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

  function localPoint(event: PointerEvent) {
    const x = event.clientX - outputRect.left;
    const y = event.clientY - outputRect.top;
    const inside =
      x >= 0 && y >= 0 && x <= outputRect.width && y <= outputRect.height;
    return { x, y, inside };
  }

  function onPointerMove(event: PointerEvent) {
    const { x, y, inside } = localPoint(event);
    if (inside) {
      if (lamp.presence < 0.01) {
        lamp.x = x;
        lamp.y = y;
      }
      lamp.tx = x;
      lamp.ty = y;
    }
    lamp.over = inside;
    start();
  }

  function onPointerLeave() {
    lamp.over = false;
    start();
  }

  window.addEventListener("pointermove", onPointerMove, { passive: true });
  document.documentElement.addEventListener("pointerleave", onPointerLeave, {
    passive: true,
  });

  return {
    setOptions(next) {
      const keys = new Set([...Object.keys(raw), ...Object.keys(next)]);
      let changed = false;
      for (const key of keys) {
        const a = raw[key as keyof CanvasOptions];
        const b = next[key as keyof CanvasOptions];
        if (a !== b) {
          changed = true;
          break;
        }
      }
      raw = next;
      if (!changed) return;
      config = resolveCanvasOptions(next);
      colors = resolveColors();
      loadImage();
      dirty = true;
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
      observer.disconnect();
      window.removeEventListener("resize", refreshOutputRect);
      window.removeEventListener("scroll", onScroll, true);
      intersection.disconnect();
      document.removeEventListener("visibilitychange", syncVisibility);
      motionQuery.removeEventListener("change", onMotionChange);
      window.removeEventListener("pointermove", onPointerMove);
      document.documentElement.removeEventListener("pointerleave", onPointerLeave);
      noiseTexture?.destroy();
      imageTexture?.destroy();
      noiseTexture = null;
      imageTexture = null;
      pendingImage = null;
      screen?.dispose();
      if (htmlInCanvas) paintable!.onpaint = null;
    },
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
