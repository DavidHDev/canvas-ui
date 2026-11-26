import { getCanvasPixelRatio, createCanvasResizeObserver } from "../canvas-viewport";
import { isHtmlInCanvasBlocked, prepareHtmlInCanvas, drawHtmlInCanvas } from "../html-in-canvas";
import {
  effect as gpuEffect,
  frame as gpuFrame,
  init,
  sampler,
  surface,
  target,
  type Effect,
  type Gpu,
  type Surface,
  type Target,
} from "vgpu";
import type { Texture } from "vgpu";
import { resolveOptions } from "../options";

export type CloudsLayer = "page" | "background" | "foreground";
export type CloudsColor = [number, number, number] | "auto";

export interface CloudsOptions {
  /** "page" draws the live content into the effect so the mist can fog, blur and bend it while text stays legible (html-in-canvas; elsewhere it falls back to "foreground"). "background" sits behind the content, "foreground" over it. */
  layer?: CloudsLayer;
  scale?: number;
  speed?: number;
  /** Direction the clouds travel in degrees. 0 points right, 90 up. */
  direction?: number;
  cover?: number;
  density?: number;
  /** Edge feather (0 to 1). 1 is soft mist, lower values give clouds a defined outline. */
  softness?: number;
  /** Rounded, cauliflower-like lumps carved into the cloud shapes (0 to 1). */
  billow?: number;
  shading?: number;
  color?: CloudsColor;
  /** Color of the slopes facing the light. */
  lightColor?: CloudsColor;
  /** Color of the slopes facing away from the light. */
  shadeColor?: CloudsColor;
  opacity?: number;
  /** How much text and fine detail cut through the clouds with layer "page" (0 to 1). */
  legibility?: number;
  shadow?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  shadowSoftness?: number;
  wind?: number;
  windRadius?: number;
  /** Seconds for half of a cleared trail to close again. */
  linger?: number;
  refraction?: number;
  fogBlur?: number;
  quality?: number;
}

export interface CloudsElements {
  output: HTMLCanvasElement;
  source?: HTMLCanvasElement | null;
  content?: HTMLElement | null;
}

export interface CloudsInstance {
  setOptions: (options: CloudsOptions) => void;
  resize: () => void;
  destroy: () => void;
}

type PaintableCanvas = HTMLCanvasElement & {
  requestPaint?: () => void;
  onpaint: (() => void) | null;
};

type ElementImageContext = CanvasRenderingContext2D & {
  drawElementImage?: (element: Element, x: number, y: number) => void;
};

type Rgb = [number, number, number];

const DEFAULTS: Required<CloudsOptions> = {
  layer: "page",
  scale: 1,
  speed: 0.6,
  direction: 225,
  cover: 0.4,
  density: 2.5,
  softness: 1,
  billow: 0,
  shading: 0.5,
  color: "auto",
  lightColor: "auto",
  shadeColor: "auto",
  opacity: 0.64,
  legibility: 0.85,
  shadow: 0.06,
  shadowOffsetX: 200,
  shadowOffsetY: -10,
  shadowSoftness: 1,
  wind: 0.6,
  windRadius: 350,
  linger: 0.7,
  refraction: 0,
  fogBlur: 0,
  quality: 1,
};

const REST = 128 / 255;
const MARGIN = 80;

function createRectCache(element: Element) {
  let current = element.getBoundingClientRect();
  const refresh = () => {
    current = element.getBoundingClientRect();
  };
  const observer = new ResizeObserver(refresh);
  observer.observe(element);
  window.addEventListener("resize", refresh, { passive: true });
  window.addEventListener("scroll", refresh, { capture: true, passive: true });
  return {
    get current() {
      return current;
    },
    destroy() {
      observer.disconnect();
      window.removeEventListener("resize", refresh);
      window.removeEventListener("scroll", refresh, true);
    },
  };
}

const MIPMAP_SHADER = `
struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
}

@group(0) @binding(0) var uSrc: texture_2d<f32>;
@group(0) @binding(1) var uSampler: sampler;

@vertex fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VSOut {
  let pos = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f(3.0, -1.0),
    vec2f(-1.0, 3.0),
  );
  let p = pos[vertexIndex];
  var out: VSOut;
  out.pos = vec4f(p, 0.0, 1.0);
  out.uv = vec2f(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);
  return out;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  return textureSampleLevel(uSrc, uSampler, uv, 0.0);
}`;

const FIELD_SHADER = `
struct Params {
  resolution: vec2f,
  offset: vec2f,
  span: vec2f,
  pad: vec2f,
  drift: vec2f,
  aspect: f32,
  scale: f32,
  cover: f32,
  density: f32,
  billow: f32,
}

@group(0) @binding(0) var<uniform> params: Params;

const m = mat2x2f(vec2f(1.6, 1.2), vec2f(-1.2, 1.6));

fn hash(pIn: vec2f) -> vec2f {
  var p = vec2f(dot(pIn, vec2f(127.1, 311.7)), dot(pIn, vec2f(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

fn noise(p: vec2f) -> f32 {
  let K1 = 0.366025404;
  let K2 = 0.211324865;
  let i = floor(p + (p.x + p.y) * K1);
  let a = p - i + (i.x + i.y) * K2;
  let o = select(vec2f(0.0, 1.0), vec2f(1.0, 0.0), a.x > a.y);
  let b = a - o + K2;
  let c = a - vec2f(1.0) + 2.0 * K2;
  let h = max(0.5 - vec3f(dot(a, a), dot(b, b), dot(c, c)), vec3f(0.0));
  let n = h * h * h * h *
    vec3f(dot(a, hash(i)), dot(b, hash(i + o)), dot(c, hash(i + vec2f(1.0))));
  return dot(n, vec3f(70.0));
}

fn fbm(nIn: vec2f) -> f32 {
  var n = nIn;
  var total = 0.0;
  var amplitude = 0.1;
  for (var i = 0; i < 7; i++) {
    total += noise(n) * amplitude;
    n = m * n;
    amplitude *= 0.4;
  }
  return total;
}

fn cells(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  var blend = 0.0;
  for (var y = -1; y <= 1; y++) {
    for (var x = -1; x <= 1; x++) {
      let g = vec2f(f32(x), f32(y));
      let r = g + 0.5 + 0.5 * hash(i + g) - f;
      blend += exp(-10.0 * dot(r, r));
    }
  }
  return sqrt(max(-log(blend / 1.6) / 10.0, 0.0));
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = vec2f(uv.x, 1.0 - uv.y) * params.span - params.pad + params.offset;
  let asp = vec2f(params.aspect, 1.0);
  let q = fbm(p * asp * params.scale * 0.5);
  let rough = 0.6 - 0.22 * params.billow;

  var r = 0.0;
  var cloudUv = p * asp * params.scale;
  cloudUv -= vec2f(q) - params.drift;
  var weight = 0.8;
  for (var i = 0; i < 8; i++) {
    r += abs(weight * noise(cloudUv));
    cloudUv = m * cloudUv + params.drift;
    weight *= rough + 0.1;
  }

  var f = 0.0;
  cloudUv = p * asp * params.scale;
  cloudUv -= vec2f(q) - params.drift;
  weight = 0.7;
  for (var i = 0; i < 8; i++) {
    f += weight * noise(cloudUv);
    cloudUv = m * cloudUv + params.drift;
    weight *= rough;
  }
  f *= r + f;

  var c = 0.0;
  let t2 = params.drift * 2.0;
  cloudUv = p * asp * params.scale * 2.0;
  cloudUv -= vec2f(q) - t2;
  weight = 0.4;
  for (var i = 0; i < 7; i++) {
    c += weight * noise(cloudUv);
    cloudUv = m * cloudUv + t2;
    weight *= rough;
  }

  var c1 = 0.0;
  let t3 = params.drift * 3.0;
  cloudUv = p * asp * params.scale * 3.0;
  cloudUv -= vec2f(q) - t3;
  weight = 0.4;
  for (var i = 0; i < 7; i++) {
    c1 += abs(weight * noise(cloudUv));
    cloudUv = m * cloudUv + t3;
    weight *= rough;
  }
  c += c1;

  var raw = params.cover + params.density * f * r + c;
  var lumps = 0.5;
  if (params.billow > 0.0) {
    let bp = (p * asp * params.scale - vec2f(q * 1.5) + params.drift) * 2.6;
    lumps = 1.0 - (cells(bp) * 0.6 + cells(bp * 2.1 + 7.3) * 0.28 + cells(bp * 4.3 + 3.1) * 0.12);
    raw += params.billow * (lumps - 0.56) * 1.5;
  }
  let lifted = max(raw, 0.0);
  return vec4f(clamp(raw, 0.0, 1.0), clamp(c, 0.0, 1.0), lifted / (1.0 + lifted), lumps);
}`;

const WIND_SHADER = `
struct Params {
  resolution: vec2f,
  a: vec2f,
  b: vec2f,
  push: vec2f,
  decay: f32,
  relax: f32,
  quantum: f32,
  advect: f32,
  radius: f32,
  strength: f32,
  part: f32,
  reset: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var uPrev: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

const REST = ${REST};

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  if (params.reset > 0.5) {
    return vec4f(0.0, REST, REST, 1.0);
  }
  let bottomUv = vec2f(uv.x, 1.0 - uv.y);
  let asp = vec2f(params.resolution.x / params.resolution.y, 1.0);
  let carried = (textureSampleLevel(uPrev, uSampler, uv, 0.0).gb - REST) * 2.0;
  let back = bottomUv - carried * params.advect / asp;
  let prev = textureSampleLevel(uPrev, uSampler, vec2f(back.x, 1.0 - back.y), 0.0);
  var clearing = prev.r * params.decay;
  var shove = (prev.gb - REST) * 2.0 * params.relax;

  let p = bottomUv * asp;
  let a = params.a * asp;
  let b = params.b * asp;
  let pa = p - a;
  let ba = b - a;
  let h = clamp(dot(pa, ba) / max(dot(ba, ba), 0.000001), 0.0, 1.0);
  let away = pa - ba * h;
  let span = length(away);
  let d = span / max(params.radius, 0.0001);
  let stamp = exp(-d * d * 3.0);
  clearing += stamp * params.strength;
  shove += params.push * stamp + (away / max(span, 0.00001)) * d * exp(-d * d * 2.0) * params.part;

  clearing = max(clearing - params.quantum, 0.0);
  shove -= sign(shove) * min(abs(shove), vec2f(params.quantum * 2.0));
  return vec4f(
    clamp(clearing, 0.0, 1.0),
    clamp(shove * 0.5 + REST, vec2f(0.0), vec2f(1.0)),
    1.0
  );
}`;

const INK_SHADER = `
struct Params {
  texel: vec2f,
  fine: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var uContent: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

fn tone(p: vec2f) -> f32 {
  return dot(textureSampleLevel(uContent, uSampler, p, params.fine).rgb, vec3f(0.299, 0.587, 0.114));
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let across = vec2f(params.texel.x, 0.0);
  let down = vec2f(0.0, params.texel.y);
  var sx = 0.0;
  var sy = 0.0;
  for (var y = 0; y < 6; y++) {
    for (var x = 0; x < 6; x++) {
      let p = uv + (vec2f(f32(x), f32(y)) - 2.5) * 1.3333 * params.texel;
      let gx = tone(p + across) - tone(p - across);
      let gy = tone(p + down) - tone(p - down);
      sx += gx * gx * gx * gx;
      sy += gy * gy * gy * gy;
    }
  }
  return vec4f(vec3f(pow(min(sx, sy) / 36.0, 0.25)), 1.0);
}`;

const COMPOSITE_SHADER = `
struct Params {
  base: vec4f,
  light: vec4f,
  shade: vec4f,
  resolution: vec2f,
  contentScale: vec2f,
  shadowShift: vec2f,
  disp: vec2f,
  edge: vec2f,
  lightStep: vec2f,
  span: vec2f,
  pad: vec2f,
  shading: f32,
  opacity: f32,
  shadow: f32,
  shadowLod: f32,
  windAmt: f32,
  refraction: f32,
  fogBlur: f32,
  hasContent: f32,
  lodBias: f32,
  legibility: f32,
  pixelRatio: f32,
  billow: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var uField: texture_2d<f32>;
@group(0) @binding(2) var uContent: texture_2d<f32>;
@group(0) @binding(3) var uWind: texture_2d<f32>;
@group(0) @binding(4) var uSampler: sampler;
@group(0) @binding(5) var uMirror: sampler;
@group(0) @binding(6) var uInk: texture_2d<f32>;

const REST = ${REST};

fn topFromBottom(uv: vec2f) -> vec2f {
  return vec2f(uv.x, 1.0 - uv.y);
}

fn fieldAt(uv: vec2f, lod: f32) -> vec4f {
  return textureSampleLevel(uField, uMirror, topFromBottom((uv + params.pad) / params.span), lod);
}

fn windAt(uv: vec2f) -> vec4f {
  return textureSampleLevel(uWind, uSampler, topFromBottom(uv), 0.0);
}

fn height(uv: vec2f, shift: vec2f, lod: f32) -> f32 {
  let packed = min(fieldAt(uv - shift, max(lod + params.lodBias, 0.0)).b, 0.96);
  return packed / (1.0 - packed) - windAt(uv).r * params.windAmt * 2.0;
}

fn form(uv: vec2f, shift: vec2f, lod: f32) -> f32 {
  return fieldAt(uv - shift, max(lod + params.lodBias, 0.0)).a;
}

fn cubic(uv: vec2f, level: f32) -> vec3f {
  let size = max(floor(vec2f(textureDimensions(uContent, 0)) / exp2(level)), vec2f(1.0));
  let st = uv * size - 0.5;
  let f = fract(st);
  let corner = st - f + 0.5;
  let w0 = (1.0 - f) * (1.0 - f) * (1.0 - f) / 6.0;
  let w1 = (3.0 * f * f * f - 6.0 * f * f + 4.0) / 6.0;
  let w3 = f * f * f / 6.0;
  let g0 = w0 + w1;
  let g1 = 1.0 - g0;
  let p0 = (corner + w1 / g0 - 1.0) / size;
  let p1 = (corner + w3 / g1 + 1.0) / size;
  return g0.y * (g0.x * textureSampleLevel(uContent, uSampler, vec2f(p0.x, p0.y), level).rgb +
      g1.x * textureSampleLevel(uContent, uSampler, vec2f(p1.x, p0.y), level).rgb) +
    g1.y * (g0.x * textureSampleLevel(uContent, uSampler, vec2f(p0.x, p1.y), level).rgb +
      g1.x * textureSampleLevel(uContent, uSampler, vec2f(p1.x, p1.y), level).rgb);
}

fn page(uv: vec2f, lod: f32) -> vec3f {
  var color = textureSampleLevel(uContent, uSampler, uv, lod).rgb;
  if (lod > 0.01) {
    let lower = floor(lod);
    let soft = mix(cubic(uv, lower), cubic(uv, lower + 1.0), lod - lower);
    color = mix(color, soft, min(lod, 1.0));
  }
  return color;
}

@fragment fn fs_main(@location(0) uvIn: vec2f) -> @location(0) vec4f {
  let uv = vec2f(uvIn.x, 1.0 - uvIn.y);
  let gust = windAt(uv);
  let rim = min(uv, 1.0 - uv);
  let shift = (gust.gb - REST) * 2.0 * params.disp
    * smoothstep(0.0, 0.1, rim.x) * smoothstep(0.0, 0.1, rim.y);
  let field = fieldAt(uv - shift, 0.0).rgb;
  let cov = field.r - gust.r * params.windAmt * (0.7 + 0.6 * field.g);
  let mist = smoothstep(params.edge.x, params.edge.y, cov);
  let cloudA = mist * params.opacity;

  let fine = height(uv, shift, 1.5);
  let broad = height(uv, shift, 4.5);
  let relief = (fine - height(uv + params.lightStep * 8.0, shift, 1.5)) * 0.7
    + (height(uv, shift, 3.0) - height(uv + params.lightStep * 24.0, shift, 3.0)) * 1.0
    + (broad - height(uv + params.lightStep * 72.0, shift, 4.5)) * 1.3
    + (fine - broad) * 0.35;
  var lit = relief * params.shading * 2.2;
  lit /= 1.0 + abs(lit);
  var cloudRGB = mix(params.base.rgb, params.shade.rgb, max(-lit, 0.0));
  cloudRGB = mix(cloudRGB, params.light.rgb, max(lit, 0.0));
  if (params.billow > 0.0) {
    let puff = form(uv, shift, 1.2);
    var crease = ((puff - form(uv + params.lightStep * 7.0, shift, 1.2)) * 5.0
      + (puff - form(uv, shift, 3.0)) * 2.4) * params.billow * params.shading * 2.2;
    crease /= 1.0 + abs(crease);
    cloudRGB = mix(cloudRGB, params.shade.rgb, max(-crease, 0.0) * 0.7);
    cloudRGB = mix(cloudRGB, params.light.rgb, max(crease, 0.0) * 0.7);
  }

  let sUv = uv + params.shadowShift;
  let s = fieldAt(sUv - shift, params.shadowLod).r - windAt(sUv).r * params.windAmt;
  let shadowA = smoothstep(0.35, 1.0, s) * params.shadow * (1.0 - mist);

  if (params.hasContent > 0.5) {
    let cUv = topFromBottom(uv) * params.contentScale;
    let reach = 10.0 * params.contentScale / (params.resolution / params.pixelRatio);
    var ink = 0.0;
    for (var y = -1; y <= 1; y++) {
      for (var x = -1; x <= 1; x++) {
        let trace = textureSampleLevel(uInk, uSampler, cUv + vec2f(f32(x), f32(y)) * reach, 0.0).r;
        ink += smoothstep(0.09, 0.17, trace)
          * (2.0 - abs(f32(x))) * (2.0 - abs(f32(y)));
      }
    }
    let keep = smoothstep(0.0, 0.75, ink / 16.0) * params.legibility;
    let veil = cloudA * (1.0 - keep);

    let e = vec2f(8.0) / params.resolution;
    let gx = fieldAt(uv - shift + vec2f(e.x, 0.0), 0.0).r
      - fieldAt(uv - shift - vec2f(e.x, 0.0), 0.0).r;
    let gy = fieldAt(uv - shift + vec2f(0.0, e.y), 0.0).r
      - fieldAt(uv - shift - vec2f(0.0, e.y), 0.0).r;
    let rUv = uv + vec2f(gx, gy) * params.refraction * mist * (1.0 - keep);
    let fogged = page(
      topFromBottom(rUv) * params.contentScale,
      mist * params.fogBlur * 5.0 * (1.0 - keep)
    );
    let layer = mix(fogged, cloudRGB, veil) * (1.0 - shadowA);
    let aF = smoothstep(0.02, 0.2, mist);
    let a = aF + shadowA * (1.0 - aF);
    return vec4f(layer * aF, a);
  }

  let a = cloudA + shadowA * (1.0 - cloudA);
  return vec4f(cloudRGB * cloudA, a);
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
  (value as unknown as { destroy(): void } | null)?.destroy();
}

function mipLevelCountFor(width: number, height: number): number {
  return Math.floor(Math.log2(Math.max(width, height))) + 1;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function sameValue(a: unknown, b: unknown) {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => item === b[i]);
  }
  return a === b;
}

export function createClouds(
  elements: CloudsElements,
  options: CloudsOptions = {},
): CloudsInstance | null {
  if (!supportsWebGPU()) return null;
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
  let fieldFx: Effect | null = null;
  let windFx: Effect | null = null;
  let compositeFx: Effect | null = null;
  let inkFx: Effect | null = null;
  let inkTarget: Target | null = null;
  let linearSampler: GPUSampler | null = null;
  let mirrorSampler: GPUSampler | null = null;
  let mipmapLayout: GPUBindGroupLayout | null = null;
  let mipmapPipeline: GPURenderPipeline | null = null;
  let fieldTarget: Target | null = null;
  let fieldTexture: Texture | null = null;
  let windTargets: [Target, Target] | null = null;
  let windReset = 2;
  let contentTexture: Texture | null = null;
  let fallback2d: CanvasRenderingContext2D | null = null;
  let fieldW = 0;
  let fieldH = 0;
  let windW = 0;
  let windH = 0;
  let contentScaleX = 1;
  let contentScaleY = 1;
  let dpr = 1;

  let baseColor: Rgb = [1, 1, 1];
  let lightColor: Rgb = [1, 1, 1];
  let shadeColor: Rgb = [1, 1, 1];
  const probe = document.createElement("canvas");
  probe.width = probe.height = 1;
  const probeCtx = probe.getContext("2d", { willReadFrequently: true });

  function readBackdrop(): Rgb {
    if (!probeCtx) return [1, 1, 1];
    let el: Element | null = content ?? output.parentElement ?? output;
    while (el) {
      const bg = getComputedStyle(el).backgroundColor;
      if (bg && bg !== "transparent") {
        probeCtx.clearRect(0, 0, 1, 1);
        probeCtx.fillStyle = bg;
        probeCtx.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = probeCtx.getImageData(0, 0, 1, 1).data;
        if (a > 0) return [r / 255, g / 255, b / 255];
      }
      el = el.parentElement;
    }
    return [1, 1, 1];
  }

  function syncBaseColor() {
    baseColor = config.color === "auto" ? readBackdrop() : config.color;
    const [r, g, b] = baseColor;
    const bright = 0.299 * r + 0.587 * g + 0.114 * b > 0.5;
    lightColor =
      config.lightColor !== "auto"
        ? config.lightColor
        : bright
          ? [r + (1 - r) * 0.85, g + (1 - g) * 0.85, b + (1 - b) * 0.85]
          : [r + (0.72 - r) * 0.5, g + (0.79 - g) * 0.5, b + (0.93 - b) * 0.5];
    shadeColor =
      config.shadeColor !== "auto"
        ? config.shadeColor
        : bright
          ? [r * 0.6, g * 0.68, b * 0.82]
          : [r * 0.45, g * 0.47, b * 0.55];
  }

  function ensureTargets() {
    if (!gpu) return;
    const size: [number, number] = [fieldW, fieldH];
    const windSize: [number, number] = [windW, windH];
    if (!fieldTarget) {
      fieldTarget = target(gpu, {
        size,
        format: "rgba8unorm",
        clearColor: [0, 0, 0, 1],
        label: "clouds.field",
      });
      windTargets = [
        target(gpu, {
          size: windSize,
          format: "rgba16float",
          clearColor: [0, REST, REST, 1],
          label: "clouds.wind-a",
        }),
        target(gpu, {
          size: windSize,
          format: "rgba16float",
          clearColor: [0, REST, REST, 1],
          label: "clouds.wind-b",
        }),
      ];
      windReset = 2;
    }
    if (fieldTarget.size[0] !== fieldW || fieldTarget.size[1] !== fieldH) {
      fieldTarget.resize(size);
    }
    for (const t of windTargets ?? []) {
      if (t.size[0] !== windW || t.size[1] !== windH) {
        t.resize(windSize);
        windReset = 2;
      }
    }
    const mipLevelCount = mipLevelCountFor(fieldW, fieldH);
    if (
      !fieldTexture ||
      fieldTexture.size[0] !== fieldW ||
      fieldTexture.size[1] !== fieldH ||
      fieldTexture.mipLevelCount !== mipLevelCount
    ) {
      fieldTexture?.destroy();
      fieldTexture = gpu.device.createTexture({
        size,
        format: "rgba8unorm",
        usage: ["texture_binding", "copy_dst", "render_attachment"],
        mipLevelCount,
        label: "clouds.field-mips",
      });
    }
  }

  function syncCanvasSize() {
    const cw = content ? content.clientWidth : output.clientWidth;
    const ch = content ? content.clientHeight : output.clientHeight;
    if (content && cw > 0 && ch > 0) {
      const wpx = `${cw}px`;
      const hpx = `${ch}px`;
      if (output.style.width !== wpx) output.style.width = wpx;
      if (output.style.height !== hpx) output.style.height = hpx;
    }
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
    contentScaleX = htmlInCanvas
      ? Math.min(1, cw / Math.max(source!.clientWidth, 1))
      : 1;
    contentScaleY = htmlInCanvas
      ? Math.min(1, ch / Math.max(source!.clientHeight, 1))
      : 1;
    const quality = clamp(config.quality, 0.2, 1);
    const cap = 1440 / Math.max(output.clientWidth, 1);
    const q = Math.min(quality, cap);
    windW = Math.max(16, Math.round(output.clientWidth * q));
    windH = Math.max(16, Math.round(output.clientHeight * q));
    fieldW = Math.max(16, Math.round((output.clientWidth + MARGIN * 2) * q));
    fieldH = Math.max(16, Math.round((output.clientHeight + MARGIN * 2) * q));
    ensureTargets();
    if (htmlInCanvas) {
      const sourceWidth = Math.max(1, Math.round(source!.clientWidth * dpr));
      const sourceHeight = Math.max(1, Math.round(source!.clientHeight * dpr));
      if (source!.width !== sourceWidth || source!.height !== sourceHeight) {
        source!.width = sourceWidth;
        source!.height = sourceHeight;
      }
      paintable!.requestPaint!();
    }
  }

  syncCanvasSize();
  syncBaseColor();

  function ensureMipmapPipeline(): GPURenderPipeline | null {
    if (!gpu || !linearSampler) return null;
    if (!mipmapLayout) {
      mipmapLayout = gpu.gpu.createBindGroupLayout({
        label: "clouds.mipmap.layout",
        entries: [
          {
            binding: 0,
            visibility: GPUShaderStage.FRAGMENT,
            texture: { sampleType: "float", viewDimension: "2d" },
          },
          {
            binding: 1,
            visibility: GPUShaderStage.FRAGMENT,
            sampler: { type: "filtering" },
          },
        ],
      });
    }
    if (!mipmapPipeline) {
      const shaderModule = gpu.gpu.createShaderModule({
        label: "clouds.mipmap",
        code: MIPMAP_SHADER,
      });
      mipmapPipeline = gpu.gpu.createRenderPipeline({
        label: "clouds.mipmap",
        layout: gpu.gpu.createPipelineLayout({ bindGroupLayouts: [mipmapLayout] }),
        vertex: { module: shaderModule, entryPoint: "vs_main" },
        fragment: {
          module: shaderModule,
          entryPoint: "fs_main",
          targets: [{ format: "rgba8unorm" }],
        },
        primitive: { topology: "triangle-list" },
      });
    }
    return mipmapPipeline;
  }

  function generateMipmaps(texture: Texture) {
    if (!gpu || !linearSampler || texture.mipLevelCount <= 1) return;
    const pipeline = ensureMipmapPipeline();
    if (!pipeline || !mipmapLayout) return;
    const encoder = gpu.gpu.createCommandEncoder({ label: "clouds.mipmap" });
    for (let level = 1; level < texture.mipLevelCount; level++) {
      const bindGroup = gpu.gpu.createBindGroup({
        label: "clouds.mipmap",
        layout: mipmapLayout,
        entries: [
          {
            binding: 0,
            resource: texture.gpu.createView({
              baseMipLevel: level - 1,
              mipLevelCount: 1,
            }),
          },
          { binding: 1, resource: linearSampler },
        ],
      });
      const pass = encoder.beginRenderPass({
        label: "clouds.mipmap",
        colorAttachments: [
          {
            view: texture.gpu.createView({ baseMipLevel: level, mipLevelCount: 1 }),
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3);
      pass.end();
    }
    gpu.gpu.queue.submit([encoder.finish()]);
  }

  function ensureContentTexture(): Texture {
    const w = Math.max(1, source?.width ?? 1);
    const h = Math.max(1, source?.height ?? 1);
    const mipLevelCount = mipLevelCountFor(w, h);
    if (
      !contentTexture ||
      contentTexture.size[0] !== w ||
      contentTexture.size[1] !== h ||
      contentTexture.mipLevelCount !== mipLevelCount
    ) {
      contentTexture?.destroy();
      contentTexture = gpu!.device.createTexture({
        size: [w, h],
        format: "rgba8unorm",
        usage: ["texture_binding", "copy_dst", "render_attachment"],
        mipLevelCount,
        label: "clouds.content",
      });
    }
    return contentTexture;
  }

  function uploadContent() {
    if (!htmlInCanvas || !contentDirty || !gpu || !compositeFx) return;
    contentDirty = false;
    const texture = ensureContentTexture();
    gpu.gpu.queue.copyExternalImageToTexture(
      { source: source! },
      { texture: texture.gpu, mipLevel: 0 },
      [source!.width, source!.height],
    );
    generateMipmaps(texture);
    compositeFx.set({ uContent: texture });

    if (!inkFx) return;
    const cssW = Math.max(source!.clientWidth, 1);
    const cssH = Math.max(source!.clientHeight, 1);
    const size: [number, number] = [
      Math.max(1, Math.ceil(cssW / 8)),
      Math.max(1, Math.ceil(cssH / 8)),
    ];
    if (!inkTarget) {
      inkTarget = target(gpu, {
        size,
        format: "rgba8unorm",
        clearColor: [0, 0, 0, 1],
        label: "clouds.ink",
      });
    } else if (inkTarget.size[0] !== size[0] || inkTarget.size[1] !== size[1]) {
      inkTarget.resize(size);
    }
    inkFx.set({
      uContent: texture,
      params: {
        texel: [1 / cssW, 1 / cssH],
        fine: Math.log2(Math.max(dpr, 1)),
      },
    });
    inkFx.draw(inkTarget);
    compositeFx.set({ uInk: inkTarget });
  }

  let pointerX = 0.5;
  let pointerY = 0.5;
  let prevPointerX = 0.5;
  let prevPointerY = 0.5;
  let hasPointer = false;
  let lastPointerMove = -1e9;
  let burst = false;
  let windIndex = 0;
  let time = Math.random() * 64;

  function render(delta: number) {
    if (
      !gpu ||
      !screen ||
      !fieldFx ||
      !windFx ||
      !compositeFx ||
      !fieldTarget ||
      !fieldTexture ||
      !windTargets
    ) {
      return;
    }
    uploadContent();
    const cssW = Math.max(output.clientWidth, 1);
    const cssH = Math.max(output.clientHeight, 1);
    const aspect = cssW / cssH;

    const padX = MARGIN / cssW;
    const padY = MARGIN / cssH;
    const heading = (config.direction * Math.PI) / 180;
    fieldFx.set({
      params: {
        resolution: [fieldW, fieldH],
        span: [1 + padX * 2, 1 + padY * 2],
        pad: [padX, padY],
        aspect,
        offset: [
          content ? content.scrollLeft / Math.max(content.clientWidth, 1) : 0,
          content ? -content.scrollTop / Math.max(content.clientHeight, 1) : 0,
        ],
        drift: [
          -Math.cos(heading) * Math.SQRT2 * time,
          -Math.sin(heading) * Math.SQRT2 * time,
        ],
        scale: Math.max(config.scale, 0.05),
        cover: Math.max(config.cover, 0),
        density: Math.max(config.density, 0),
        billow: clamp(config.billow, 0, 1),
      },
    });
    fieldFx.draw(fieldTarget);
    const fieldEncoder = gpu.gpu.createCommandEncoder({ label: "clouds.field-copy" });
    fieldEncoder.copyTextureToTexture(
      { texture: fieldTarget.color.gpu },
      { texture: fieldTexture.gpu, mipLevel: 0 },
      [fieldW, fieldH],
    );
    gpu.gpu.queue.submit([fieldEncoder.finish()]);
    generateMipmaps(fieldTexture);

    const prevWind = windTargets[windIndex];
    const nextWind = windTargets[1 - windIndex];
    windIndex = 1 - windIndex;
    const linger = Math.max(config.linger, 0.05);
    const radius = Math.max(config.windRadius, 1) / cssH;
    const reach = clamp(config.wind, 0, 1) * radius * 0.12;
    const dx = pointerX - prevPointerX;
    const dy = pointerY - prevPointerY;
    const moved = Math.hypot(dx, dy);
    const stamping = hasPointer && (moved > 0 || burst);
    const strength = stamping ? Math.min(0.2 + moved * 12, 1) * 0.5 : 0;
    let pushX = stamping ? ((dx * aspect) / radius) * 0.55 : 0;
    let pushY = stamping ? (dy / radius) * 0.55 : 0;
    const pushLength = Math.hypot(pushX, pushY);
    if (pushLength > 0.3) {
      pushX *= 0.3 / pushLength;
      pushY *= 0.3 / pushLength;
    }
    windFx.set({
      uPrev: prevWind,
      params: {
        resolution: [windW, windH],
        a: [prevPointerX, prevPointerY],
        b: [pointerX, pointerY],
        push: [pushX, pushY],
        decay: Math.pow(0.5, delta / linger),
        relax: Math.pow(0.5, delta / (linger * 1.6)),
        quantum: 0.0002,
        advect: delta * 1.5 * reach,
        radius: burst ? radius * 1.35 : radius,
        strength: burst ? Math.max(strength, 0.75) : strength,
        part: burst ? 1.6 : stamping ? Math.min(moved * 14, 0.5) : 0,
        reset: windReset > 0 ? 1 : 0,
      },
    });
    windFx.draw(nextWind);
    if (windReset > 0) windReset -= 1;
    prevPointerX = pointerX;
    prevPointerY = pointerY;
    burst = false;

    let lightX = -config.shadowOffsetX;
    let lightY = config.shadowOffsetY;
    const lightLength = Math.hypot(lightX, lightY);
    if (lightLength < 1) {
      lightX = -0.6;
      lightY = 0.8;
    } else {
      lightX /= lightLength;
      lightY /= lightLength;
    }
    const soft = clamp(config.softness, 0, 1);
    compositeFx.set({
      uField: fieldTexture,
      uWind: nextWind,
      params: {
        base: [...baseColor, 0],
        light: [...lightColor, 0],
        shade: [...shadeColor, 0],
        resolution: screen.size,
        contentScale: [contentScaleX, contentScaleY],
        shadowShift: [-config.shadowOffsetX / cssW, config.shadowOffsetY / cssH],
        disp: [reach / aspect, reach],
        edge: [0.04 + (1 - soft) * 0.4, 0.9 - (1 - soft) * 0.36],
        lightStep: [lightX / cssW, lightY / cssH],
        shading: Math.max(config.shading, 0),
        opacity: clamp(config.opacity, 0, 1),
        shadow: clamp(config.shadow, 0, 1),
        shadowLod: clamp(config.shadowSoftness, 0, 1) * 4,
        windAmt: clamp(config.wind, 0, 1),
        refraction: Math.max(config.refraction, 0) / cssW,
        fogBlur: clamp(config.fogBlur, 0, 1),
        hasContent: htmlInCanvas && config.layer === "page" ? 1 : 0,
        lodBias: Math.log2(windW / cssW),
        span: [1 + padX * 2, 1 + padY * 2],
        pad: [padX, padY],
        legibility: clamp(config.legibility, 0, 1),
        billow: clamp(config.billow, 0, 1),
        pixelRatio: screen.size[0] / cssW,
      },
    });
    gpuFrame(gpu, (f) => f.pass(screen!, compositeFx!));
  }

  function renderFallback() {
    if (!fallback2d || !htmlInCanvas || !contentDirty) return;
    contentDirty = false;
    fallback2d.clearRect(0, 0, output.width, output.height);
    fallback2d.drawImage(source!, 0, 0, output.width, output.height);
  }

  let raf = 0;
  let lastTime = performance.now();
  let destroyed = false;
  let running = false;
  let visible = true;

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reducedMotion = motionQuery.matches;

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
    if (!reducedMotion) time += delta * config.speed * 0.03;
    render(delta);
    const windActive =
      now - lastPointerMove < 3000 + Math.max(config.linger, 0) * 6000;
    if (reducedMotion && !windActive && !contentDirty) {
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
      screen = surface(gpu, output, {
        autoResize: false,
        alphaMode: "premultiplied",
        label: "clouds",
      });
      linearSampler = sampler(gpu, {
        minFilter: "linear",
        magFilter: "linear",
        mipmapFilter: "linear",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
      });
      mirrorSampler = sampler(gpu, {
        minFilter: "linear",
        magFilter: "linear",
        mipmapFilter: "linear",
        addressModeU: "mirror-repeat",
        addressModeV: "mirror-repeat",
      });
      fieldFx = gpuEffect(gpu, FIELD_SHADER, { label: "clouds.field" });
      windFx = gpuEffect(gpu, WIND_SHADER, {
        label: "clouds.wind",
        set: { uSampler: linearSampler },
      });
      inkFx = gpuEffect(gpu, INK_SHADER, {
        label: "clouds.ink",
        set: { uSampler: linearSampler },
      });
      const blank = ensureContentTexture();
      compositeFx = gpuEffect(gpu, COMPOSITE_SHADER, {
        label: "clouds.composite",
        set: {
          uSampler: linearSampler,
          uMirror: mirrorSampler,
          uContent: blank,
          uInk: blank,
        },
      });
      syncCanvasSize();
      ensureTargets();
      start();
    })
    .catch((error) => {
      if (destroyed) return;
      console.warn("Clouds: WebGPU unavailable, showing content without the effect.", error);
      fallback2d = output.getContext("2d");
      contentDirty = true;
      start();
    });

  function onMotionChange() {
    reducedMotion = motionQuery.matches;
    start();
  }
  motionQuery.addEventListener("change", onMotionChange);

  const observer = createCanvasResizeObserver(() => {
    syncCanvasSize();
    start();
  });
  observer.observe(output);
  if (content) observer.observe(content);

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

  const rectCache = createRectCache(output);

  function locate(event: PointerEvent) {
    const rect = rectCache.current;
    const x = (event.clientX - rect.left) / Math.max(rect.width, 1);
    const y = 1 - (event.clientY - rect.top) / Math.max(rect.height, 1);
    const inside = x >= 0 && x <= 1 && y >= 0 && y <= 1;
    if (!inside) {
      hasPointer = false;
      return false;
    }
    if (!hasPointer) {
      prevPointerX = x;
      prevPointerY = y;
      hasPointer = true;
    }
    pointerX = x;
    pointerY = y;
    lastPointerMove = performance.now();
    return true;
  }

  function onPointerMove(event: PointerEvent) {
    if (locate(event)) start();
  }

  function onPointerDown(event: PointerEvent) {
    if (!locate(event) || reducedMotion) return;
    burst = true;
    start();
  }

  function onPointerLeave() {
    hasPointer = false;
  }

  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerdown", onPointerDown, { passive: true });
  document.documentElement.addEventListener("pointerleave", onPointerLeave, {
    passive: true,
  });
  content?.addEventListener("scroll", start, { passive: true });

  let themeTimer = 0;
  function onThemeShift() {
    syncBaseColor();
    start();
    window.clearTimeout(themeTimer);
    themeTimer = window.setTimeout(() => {
      syncBaseColor();
      start();
    }, 300);
  }

  const themeObserver = new MutationObserver(onThemeShift);
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "style", "data-theme"],
  });
  const schemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
  schemeQuery.addEventListener("change", onThemeShift);

  return {
    setOptions(next) {
      next = resolveOptions(DEFAULTS, next);
      if (
        !Object.entries(next).some(
          ([key, value]) =>
            !sameValue(config[key as keyof CloudsOptions], value),
        )
      )
        return;
      Object.assign(config, next);
      syncCanvasSize();
      syncBaseColor();
      start();
    },
    resize() {
      syncCanvasSize();
      start();
    },
    destroy() {
      destroyed = true;
      rectCache.destroy();
      cancelAnimationFrame(raf);
      observer.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", syncVisibility);
      themeObserver.disconnect();
      schemeQuery.removeEventListener("change", onThemeShift);
      window.clearTimeout(themeTimer);
      motionQuery.removeEventListener("change", onMotionChange);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      document.documentElement.removeEventListener(
        "pointerleave",
        onPointerLeave,
      );
      content?.removeEventListener("scroll", start);
      if (htmlInCanvas) paintable!.onpaint = null;
      contentTexture?.destroy();
      fieldTexture?.destroy();
      destroyTarget(fieldTarget);
      destroyTarget(inkTarget);
      if (windTargets) {
        destroyTarget(windTargets[0]);
        destroyTarget(windTargets[1]);
      }
      screen?.dispose();
    },
  };
}
