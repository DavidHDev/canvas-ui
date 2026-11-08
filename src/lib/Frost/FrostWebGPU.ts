import { getCanvasPixelRatio, createCanvasResizeObserver } from "../canvas-viewport";
import { isHtmlInCanvasBlocked, prepareHtmlInCanvas, drawHtmlInCanvas } from "../html-in-canvas";
import {
  effect,
  frame as gpuFrame,
  init,
  sampler,
  surface,
  target,
  type Effect,
  type Gpu,
  type Surface,
  type Target as GpuTarget,
} from "vgpu";
import type { Texture } from "vgpu";


export interface FrostOptions {
  /** Base frozen coverage added on top of the frost pattern (0-1). */
  frost?: number;
  /** Multiplier on the frost noise pattern. Higher freezes more of the pane. */
  strength?: number;
  /** Contrast of the frost noise pattern. */
  contrast?: number;
  /** Contrast of the final frost mask. Higher gives crisper frost edges. */
  crispness?: number;
  /** How much sparkling highlight grain mixes into the frost (0-1). */
  highlight?: number;
  /** How strongly highlights tint toward white (0-1). */
  highlightStrength?: number;
  /** Base blur haze mixed over the content, even outside thick frost (0-1). */
  haze?: number;
  /** Frost color where the layer is thin, as [r, g, b] in 0-1 range. */
  tintThin?: [number, number, number];
  /** Frost color where the layer is thick, as [r, g, b] in 0-1 range. */
  tintThick?: [number, number, number];
  /** How much the frost tint colors the frozen areas (0-1). */
  tintStrength?: number;
  /** Saturation multiplier applied to the frosted content. */
  saturation?: number;
  /** Brightness multiplier applied to the frosted content. */
  brightness?: number;
  /** How far the icy surface bends light. 0 disables refraction. */
  refraction?: number;
  /** Index of refraction of the ice. Water ice is about 1.31. */
  ior?: number;
  /** Strength of the fine surface detail in the refraction. */
  detail?: number;
  /** Scale of the icy relief pattern. Higher is larger features. */
  textureScale?: number;
  /** Fresnel boost at grazing angles (0-2). */
  fresnel?: number;
  /** Radius of the melt spot under the cursor (0-1, fraction of height). */
  meltRadius?: number;
  /** Irregularity of the melt edge. 0 is a clean circle. */
  meltNoise?: number;
  /** How quickly hovering melts the frost (0-1). */
  meltStrength?: number;
  /** How fast melted areas freeze back over. 0 never refreezes. */
  refreeze?: number;
  /** Keeps the edges of the pane frozen. 0 lets everything melt. */
  edgeFade?: number;
  /** Lets the frozen borders of the pane melt too. */
  meltEdges?: boolean;
  /** Seconds for the frost to grow in from the edges on load. 0 disables. */
  introDuration?: number;
  /** Overall opacity of the frost layer (0-1). Lower shows more content. */
  opacity?: number;
  /** Animated twinkle of the highlight grain (0-1). 0 is static. */
  shimmer?: number;
  /** Resolution multiplier for the blur passes (0.25-1). */
  quality?: number;
}

export interface FrostElements {
  /** Canvas with layoutsubtree that hosts the HTML content. */
  source: HTMLCanvasElement;
  /** The element inside the source canvas that gets captured. */
  content: HTMLElement;
  /** Canvas the WebGPU effect renders to. */
  output: HTMLCanvasElement;
}

export interface FrostInstance {
  /** Melt a spot at (x, y) in [0,1] space, top-left origin.
   * Keeps the newest 32 pending calls while suspended; applies at most 4 per frame.
   */
  melt: (x: number, y: number) => void;
  /** Update options live. */
  setOptions: (options: FrostOptions) => void;
  /** Re-read canvas size. Call when the element is resized. */
  resize: () => void;
  /** Stop the loop and release all GPU resources. */
  destroy: () => void;
}

const DEFAULTS: Required<FrostOptions> = {
  frost: 0.05,
  strength: 0.7,
  contrast: 3,
  crispness: 1,
  highlight: 0.3,
  highlightStrength: 0.8,
  haze: 0.5,
  tintThin: [0.82, 0.86, 1.05],
  tintThick: [0.92, 0.96, 1.1],
  tintStrength: 0.3,
  saturation: 1.2,
  brightness: 0.85,
  refraction: 1,
  ior: 1.31,
  detail: 2,
  textureScale: 2,
  fresnel: 0.8,
  meltRadius: 0.25,
  meltNoise: 0.25,
  meltStrength: 0.75,
  refreeze: 2,
  edgeFade: 0.1,
  meltEdges: true,
  introDuration: 2.5,
  opacity: 0.6,
  shimmer: 0,
  quality: 1,
};

const HEIGHT_RES = 512;
const NOISE_RES = 1024;

type PaintableCanvas = HTMLCanvasElement & {
  onpaint?: (() => void) | null;
  requestPaint?: () => void;
};

type ElementImageContext = CanvasRenderingContext2D & {
  drawElementImage?: (element: Element, x: number, y: number) => void;
};

const FRAG_NOISE = /* wgsl */ `
fn mod2(x: vec2f, y: f32) -> vec2f {
  return x - vec2f(y) * floor(x / vec2f(y));
}

fn mod1(x: f32, y: f32) -> f32 {
  return x - y * floor(x / y);
}

fn prnd(n0: vec2f, period: f32) -> f32 {
  let n = mod2(n0, period);
  let dt = dot(n, vec2f(0.129898, 0.78233));
  return fract(sin(mod1(dt, 3.14159265)) * 437.585453);
}

fn pnoise(p: vec2f, period: f32) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let a = prnd(i, period);
  let b = prnd(i + vec2f(1.0, 0.0), period);
  let c = prnd(i + vec2f(0.0, 1.0), period);
  let d = prnd(i + vec2f(1.0, 1.0), period);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

fn pfbm(p0: vec2f, period0: f32, octaves: i32) -> f32 {
  var p = p0;
  var period = period0;
  var v = 0.0;
  var a = 0.5;
  for (var i = 0; i < 4; i++) {
    if (i >= octaves) { break; }
    v += a * pnoise(p, period);
    p = p * 2.0 + vec2f(17.0, 31.0);
    period *= 2.0;
    a *= 0.5;
  }
  return v;
}

fn pwarp(p: vec2f, period: f32, g: f32) -> f32 {
  var val = 0.0;
  for (var i = 0; i < 2; i++) {
    val = pfbm(
      p + g * vec2f(cos(6.28318 * val), sin(6.28318 * val)), period, 4);
  }
  return val;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let pattern = pwarp(uv * 20.0, 20.0, 4.0);
  let mottle = pfbm(uv * 26.0, 26.0, 3);
  let sparkle =
    smoothstep(0.8, 0.95, pnoise(uv * 200.0, 200.0)) *
    (0.35 + 0.65 * pnoise(uv * 50.0, 50.0));
  let meltEdge = pfbm(uv * 9.0, 9.0, 3);
  return vec4f(pattern, mottle, sparkle, meltEdge);
}`;

const FRAG_HEIGHT = /* wgsl */ `
fn mod2(x: vec2f, y: f32) -> vec2f {
  return x - vec2f(y) * floor(x / vec2f(y));
}

fn mod1(x: f32, y: f32) -> f32 {
  return x - y * floor(x / y);
}

fn prnd(n0: vec2f, period: f32) -> f32 {
  let n = mod2(n0, period);
  let dt = dot(n, vec2f(0.129898, 0.78233));
  return fract(sin(mod1(dt, 3.14159265)) * 437.585453);
}

fn pnoise(p: vec2f, period: f32) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let a = prnd(i, period);
  let b = prnd(i + vec2f(1.0, 0.0), period);
  let c = prnd(i + vec2f(0.0, 1.0), period);
  let d = prnd(i + vec2f(1.0, 1.0), period);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

fn pfbm(p0: vec2f, period0: f32, octaves: i32) -> f32 {
  var p = p0;
  var period = period0;
  var v = 0.0;
  var a = 0.5;
  for (var i = 0; i < 5; i++) {
    if (i >= octaves) { break; }
    v += a * pnoise(p, period);
    p *= 2.0;
    period *= 2.0;
    a *= 0.5;
  }
  return v;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  var broad = pfbm(uv * 6.0, 6.0, 4);
  broad = broad * broad * 1.4;
  let fine = pfbm(uv * 28.0, 28.0, 3);
  return vec4f(broad, fine, 0.0, 1.0);
}`;

const FRAG_BLUR = /* wgsl */ `
struct Params {
  texelSize: vec2f,
  stepDir: vec2f,
  flipY: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var uScene: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

const KERNEL_SIZE: i32 = 10;
const WEIGHT_CENTER: f32 = 0.084613;
const WEIGHTS = array<f32, 9>(0.082937, 0.078108, 0.070675, 0.061442, 0.051320, 0.041186, 0.031756, 0.023526, 0.016745);

fn srcUv(uv: vec2f) -> vec2f {
  return select(uv, vec2f(uv.x, 1.0 - uv.y), params.flipY > 0.5);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  var sum = textureSampleLevel(uScene, uSampler, srcUv(uv), 0.0) * WEIGHT_CENTER;
  for (var i = 1; i < KERNEL_SIZE; i++) {
    let delta = f32(i) * params.texelSize * params.stepDir;
    sum += textureSampleLevel(uScene, uSampler, srcUv(clamp(uv + delta, vec2f(0.0), vec2f(1.0))), 0.0) * WEIGHTS[i - 1];
    sum += textureSampleLevel(uScene, uSampler, srcUv(clamp(uv - delta, vec2f(0.0), vec2f(1.0))), 0.0) * WEIGHTS[i - 1];
  }
  return sum;
}`;

const FRAG_POINTER = /* wgsl */ `
struct Params {
  point: vec2f,
  prevPoint: vec2f,
  backShift: vec2f,
  scroll: vec2f,
  aspect: f32,
  textureScale: f32,
  decay: f32,
  meltNoise: f32,
  meltStrength: f32,
  radius: f32,
  edgeFade: f32,
  touching: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var uBack: texture_2d<f32>;
@group(0) @binding(2) var uNoise: texture_2d<f32>;
@group(0) @binding(3) var uClampSampler: sampler;
@group(0) @binding(4) var uRepeatSampler: sampler;

fn sdSegment(p: vec2f, a: vec2f, b: vec2f) -> f32 {
  let pa = p - a;
  let ba = b - a;
  let h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let backUv = uv + params.backShift;
  let back = textureSampleLevel(uBack, uClampSampler, backUv, 0.0);
  let inside =
    step(0.0, backUv.x) * step(backUv.x, 1.0) *
    step(0.0, backUv.y) * step(backUv.y, 1.0);
  var melt = clamp(back.r * inside - params.decay, 0.0, 1.0);

  let nUv = (uv + params.scroll) * vec2f(params.aspect, 1.0)
    / max(params.textureScale, 0.05);
  let n = textureSampleLevel(uNoise, uRepeatSampler, nUv, 0.0).a - 0.5;

  let p = uv * vec2f(params.aspect, 1.0);
  let a = params.prevPoint * vec2f(params.aspect, 1.0);
  let b = params.point * vec2f(params.aspect, 1.0);
  let d = sdSegment(p, a, b) + n * params.meltNoise;

  var m =
    (1.0 - smoothstep(params.radius * 0.35, params.radius, d)) * params.meltStrength;
  let dSide = min(uv, 1.0 - uv);
  let side = smoothstep(0.0, max(params.edgeFade, 1e-4), min(dSide.x, dSide.y));
  m *= mix(1.0, side, step(1e-3, params.edgeFade));
  m *= params.touching;

  melt = clamp(melt + m, 0.0, 1.0);
  return vec4f(vec3f(melt), 1.0);
}`;

const FRAG_FROST = /* wgsl */ `
struct Params {
  scroll: vec2f,
  tintThin: vec3f,
  aspect: f32,
  tintThick: vec3f,
  textureScale: f32,
  meltEdges: f32,
  intro: f32,
  highlight: f32,
  strength: f32,
  frost: f32,
  contrast: f32,
  crispness: f32,
  haze: f32,
  tintStrength: f32,
  highlightStrength: f32,
  saturation: f32,
  brightness: f32,
  shimmer: f32,
  time: f32,
  opacity: f32,
  hasContent: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var uContent: texture_2d<f32>;
@group(0) @binding(2) var uBlur: texture_2d<f32>;
@group(0) @binding(3) var uNoise: texture_2d<f32>;
@group(0) @binding(4) var uPointer: texture_2d<f32>;
@group(0) @binding(5) var uClampSampler: sampler;
@group(0) @binding(6) var uRepeatSampler: sampler;

fn contrastFn(x: f32, strength: f32) -> f32 {
  return clamp((x - 0.5) * strength + 0.5, 0.0, 1.0);
}

fn rand2(uv0: vec2f) -> f32 {
  let uv = floor(uv0 * 5000.0) / 5000.0;
  let a = dot(uv, vec2f(92.0, 80.0));
  let b = dot(uv, vec2f(41.0, 62.0));
  return fract(sin(a) + cos(b) * 51.0);
}

fn hsv2rgb(c: vec3f) -> vec3f {
  let K = vec4f(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  let p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, vec3f(0.0), vec3f(1.0)), c.y);
}

fn rgb2hsv(c: vec3f) -> vec3f {
  let K = vec4f(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  let p = mix(vec4f(c.bg, K.wz), vec4f(c.gb, K.xy), step(c.b, c.g));
  let q = mix(vec4f(p.xyw, c.r), vec4f(c.r, p.yzx), step(p.x, c.r));
  let d = q.x - min(q.w, q.y);
  let e = 1.0e-10;
  return vec3f(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let nUv = (uv + params.scroll) * vec2f(params.aspect, 1.0)
    / max(params.textureScale, 0.05);
  let noise = textureSampleLevel(uNoise, uRepeatSampler, nUv, 0.0);
  let warpN = noise.r;

  let meltRaw = textureSampleLevel(uPointer, uClampSampler, uv, 0.0).r;

  let edgeDist = min(uv, 1.0 - uv);
  let edgeBoost =
    (1.0 - smoothstep(0.0, 0.4, min(edgeDist.x, edgeDist.y)))
    * (1.0 - params.meltEdges * smoothstep(0.0, 0.5, meltRaw));
  var strength = params.strength * (0.62 + 0.65 * edgeBoost);

  let ed = min(edgeDist.x, edgeDist.y)
    + (0.5 - warpN) * 0.34 + (0.5 - noise.g) * 0.16;
  let local = clamp((params.intro * 3.0 - ed * 2.0 - 0.3) / 1.1, 0.0, 1.0);
  strength *= local;

  let body = contrastFn(warpN * strength + params.frost * local, params.contrast);

  let gUv = uv + params.scroll;
  let h = rand2(gUv + warpN * 0.05);
  let grain = h * warpN;
  var glint = smoothstep(0.85, 1.0, h);
  glint *= mix(
    1.0,
    0.5 + 0.5 * sin(params.time * 2.4 + h * 6.28),
    clamp(params.shimmer, 0.0, 1.0)
  );
  let micro = mix(grain, glint, params.highlight);

  let m = clamp(meltRaw * (1.1 + (noise.a - 0.5) * 0.9), 0.0, 1.0);

  let d = body - m * (0.9 + 0.35 * body);
  let frozen = smoothstep(0.0, 0.22, d);
  var wet = (1.0 - frozen) * (1.0 - smoothstep(0.0, 0.55, -d));
  wet *= smoothstep(0.01, 0.1, m);

  let cover = smoothstep(0.03, 0.35, body);
  let ice = clamp(
    contrastFn(micro * cover * frozen + body, params.crispness), 0.0, 1.0);
  let frostMask = ice * frozen;

  let wobble = vec2f(noise.a - 0.5, noise.g - 0.5) * wet * 0.018;

  let icy = mix(params.tintThin, params.tintThick, body);
  var base: vec4f;
  var blur: vec4f;
  if (params.hasContent > 0.5) {
    let cUv = clamp(uv + wobble, vec2f(0.0), vec2f(1.0));
    base = textureSampleLevel(uContent, uClampSampler, cUv, 0.0);
    blur = textureSampleLevel(uBlur, uClampSampler, cUv, 0.0);
  } else {
    base = vec4f(icy, 1.0);
    blur = base;
  }
  let blurMix = clamp(
    frostMask + params.haze * max(frozen, wet * 0.5), 0.0, 1.0);
  var color = mix(base, blur, blurMix);

  var hsv = rgb2hsv(color.rgb);
  hsv = vec3f(hsv.x, clamp(hsv.y * params.saturation, 0.0, 1.0), clamp(hsv.z * params.brightness, 0.0, 1.0));
  let adjusted = hsv2rgb(hsv);
  color = vec4f(mix(color.rgb, adjusted, frostMask), color.a);

  let frostTint = mix(params.tintThin, params.tintThick, body);
  var frostColor = mix(color.rgb, frostTint, params.tintStrength);
  frostColor = mix(
    frostColor,
    vec3f(1.0),
    glint * params.highlightStrength * step(0.001, params.highlight));

  color = vec4f(mix(color.rgb, frostColor, frostMask), color.a);
  color = vec4f(color.rgb + wet * glint * 0.25, color.a);

  let op = clamp(params.opacity, 0.0, 1.0);
  color = vec4f(mix(base.rgb, color.rgb, op), color.a);
  return vec4f(clamp(color.rgb, vec3f(0.0), vec3f(1.0)), frostMask * op);
}`;

const FRAG_OUTPUT = /* wgsl */ `
struct Params {
  resolution: vec2f,
  scrollPx: vec2f,
  ior: f32,
  refraction: f32,
  detail: f32,
  textureScale: f32,
  fresnel: f32,
  hasContent: f32,
  fallbackAlpha: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var uFrost: texture_2d<f32>;
@group(0) @binding(2) var uHeights: texture_2d<f32>;
@group(0) @binding(3) var uClampSampler: sampler;
@group(0) @binding(4) var uRepeatSampler: sampler;

const TEXEL: f32 = 1.0 / 512.0;

fn heightNormal(channel: f32, mapUv: vec2f, bump: f32) -> vec3f {
  let hx = vec2f(TEXEL, 0.0);
  let hy = vec2f(0.0, TEXEL);
  let c = textureSampleLevel(uHeights, uRepeatSampler, mapUv, 0.0).rg;
  let x = textureSampleLevel(uHeights, uRepeatSampler, mapUv + hx, 0.0).rg;
  let y = textureSampleLevel(uHeights, uRepeatSampler, mapUv + hy, 0.0).rg;
  let dx = select(x.g - c.g, x.r - c.r, channel < 0.5);
  let dy = select(y.g - c.g, y.r - c.r, channel < 0.5);
  return normalize(vec3f(-dx * bump, -dy * bump, 1.0));
}

@fragment fn fs_main(@location(0) uv: vec2f, @builtin(position) pos: vec4f) -> @location(0) vec4f {
  let baseUv = uv;
  let frostMask = textureSampleLevel(uFrost, uClampSampler, baseUv, 0.0).a;

  let V = vec3f(0.0, 0.0, 1.0);

  let mainScale = max(params.textureScale, 0.05) * 900.0;
  let subScale = max(params.textureScale, 0.05) * 260.0;
  let mapCoord = vec2f(pos.x, params.resolution.y - pos.y) + params.scrollPx;
  let mainUv = mapCoord / mainScale;
  let subUv = mapCoord / subScale;

  let nMain = heightNormal(0.0, mainUv, 14.0);
  let nSub = heightNormal(1.0, subUv, 8.0);

  let heightW = smoothstep(0.1, 0.95, textureSampleLevel(uHeights, uRepeatSampler, mainUv, 0.0).r);

  let R1 = refract(-V, nMain, 1.0 / params.ior);
  let R2 = refract(-V, nSub, 1.0 / params.ior);
  let offset = (R1.xy * 0.3 + R2.xy * params.detail * heightW * 0.5)
    * params.refraction * 0.2;

  let refractedUv = clamp(baseUv + offset, vec2f(0.0), vec2f(1.0));

  let baseColor = textureSampleLevel(uFrost, uClampSampler, uv, 0.0);
  let refractedColor = textureSampleLevel(uFrost, uClampSampler, refractedUv, 0.0);

  let cosTheta = clamp(dot(-V, nMain), 0.0, 1.0);
  let F0 = pow((params.ior - 1.0) / (params.ior + 1.0), 2.0);
  let fresnel = F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);

  var refractionMix = frostMask;
  refractionMix = clamp(refractionMix * (1.0 + fresnel * params.fresnel), 0.0, 1.0);

  let mixed = mix(baseColor, refractedColor, refractionMix);
  if (params.hasContent > 0.5) {
    return vec4f(mixed.rgb, 1.0);
  }
  let alpha = clamp(mixed.a * params.fallbackAlpha, 0.0, 1.0);
  return vec4f(mixed.rgb * alpha, alpha);
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

/** True when the browser exposes WebGPU. The device itself is requested lazily. */
export function supportsWebGPU(): boolean {
  return typeof navigator !== "undefined" && Boolean(navigator.gpu);
}

let sharedGpu: Promise<Gpu> | null = null;

/** One WebGPU device per page, shared by every Frost instance. */
function acquireGpu(): Promise<Gpu> {
  if (!sharedGpu) {
    sharedGpu = init().catch((error) => {
      sharedGpu = null;
      throw error;
    });
  }
  return sharedGpu;
}

function createRectCache(element: Element) {
  let current = element.getBoundingClientRect();
  const refresh = () => {
    current = element.getBoundingClientRect();
  };
  const observer = new ResizeObserver(refresh);
  observer.observe(element);
  window.addEventListener("resize", refresh, { passive: true });
  window.addEventListener("scroll", refresh, {
    capture: true,
    passive: true,
  });
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

function destroyTarget(gpuTarget: GpuTarget | null) {
  (gpuTarget as unknown as { destroy?: () => void })?.destroy?.();
}

interface DoubleTarget {
  read: GpuTarget;
  write: GpuTarget;
  swap: () => void;
}

export function createFrost(
  elements: FrostElements,
  options: FrostOptions = {},
): FrostInstance | null {
  if (!supportsWebGPU()) return null;
  const config = { ...DEFAULTS, ...options };
  const { source, content, output } = elements;

  const sourceCtx = source.getContext("2d") as ElementImageContext | null;
  const paintable = source as PaintableCanvas;
  const htmlInCanvas = Boolean(
    !isHtmlInCanvasBlocked() &&
    source.contains(content) &&
    sourceCtx &&
      typeof sourceCtx.drawElementImage === "function" &&
      typeof paintable.requestPaint === "function",
  );

  if (htmlInCanvas) prepareHtmlInCanvas(source, content);

  let contentDirty = false;
  let contentReady = !htmlInCanvas;
  let wake = () => {};
  let fallback2d: CanvasRenderingContext2D | null = null;

  function captureContent() {
    try {
      sourceCtx!.reset();
      drawHtmlInCanvas(source, sourceCtx!, content);
      contentDirty = true;
      wake();
    } catch {}
  }

  if (htmlInCanvas) {
    paintable.onpaint = captureContent;
  }

  let gpu: Gpu | null = null;
  let screen: Surface | null = null;
  let linearClamp: GPUSampler | null = null;
  let linearRepeat: GPUSampler | null = null;
  let noiseFx: Effect | null = null;
  let heightFx: Effect | null = null;
  let blurFx: Effect | null = null;
  let pointerFx: Effect | null = null;
  let frostFx: Effect | null = null;
  let outputFx: Effect | null = null;
  let contentTexture: Texture | null = null;
  let frostTarget: GpuTarget | null = null;
  let blurA: GpuTarget | null = null;
  let blurB: GpuTarget | null = null;
  let pointer: DoubleTarget | null = null;
  let heightTarget: GpuTarget | null = null;
  let noiseTarget: GpuTarget | null = null;
  let blurDirty = true;
  let targetsReady = false;
  let dprNow = 1;

  function ensureContentTexture(): Texture {
    const w = Math.max(1, source.width);
    const h = Math.max(1, source.height);
    if (
      !contentTexture ||
      contentTexture.size[0] !== w ||
      contentTexture.size[1] !== h
    ) {
      // A new wrapper invalidates vgpu's cached bindings to the old texture.
      contentTexture?.destroy();
      contentTexture = gpu!.device.createTexture({
        size: [w, h],
        format: "rgba8unorm",
        usage: ["texture_binding", "copy_dst", "render_attachment"],
        label: "frost.content",
      });
    }
    return contentTexture;
  }

  function createRenderTarget(
    width: number,
    height: number,
    format: GPUTextureFormat = "rgba8unorm",
    label?: string,
  ): GpuTarget {
    return target(gpu!, {
      size: [Math.max(1, width), Math.max(1, height)],
      format,
      clearColor: [0, 0, 0, 0],
      label,
    });
  }

  function createDoubleTarget(width: number, height: number): DoubleTarget {
    let read = createRenderTarget(width, height, "rgba16float", "frost.pointer.read");
    let write = createRenderTarget(width, height, "rgba16float", "frost.pointer.write");
    return {
      get read() {
        return read;
      },
      get write() {
        return write;
      },
      swap() {
        const t = read;
        read = write;
        write = t;
      },
    };
  }

  function rebuildTargets() {
    if (!gpu || !screen) return;
    const [width, height] = screen.size;
    const blurScale = 0.35 * Math.min(Math.max(config.quality, 0.25), 1);
    const bw = Math.max(1, Math.round(width * blurScale));
    const bh = Math.max(1, Math.round(height * blurScale));
    destroyTarget(frostTarget);
    destroyTarget(blurA);
    destroyTarget(blurB);
    if (pointer) {
      destroyTarget(pointer.read);
      destroyTarget(pointer.write);
    }
    frostTarget = createRenderTarget(width, height, "rgba8unorm", "frost.layer");
    blurA = createRenderTarget(bw, bh, "rgba8unorm", "frost.blur-a");
    blurB = createRenderTarget(bw, bh, "rgba8unorm", "frost.blur-b");
    pointer = createDoubleTarget(
      Math.max(1, Math.round(width * 0.5)),
      Math.max(1, Math.round(height * 0.5)),
    );
    targetsReady = true;
    blurDirty = true;
  }

  function syncCanvasSize() {
    const dpr = getCanvasPixelRatio(output);
    dprNow = dpr;
    const width = Math.max(1, Math.round(output.clientWidth * dpr));
    const height = Math.max(1, Math.round(output.clientHeight * dpr));
    if (screen) {
      const [w, h] = screen.size;
      if (w !== width || h !== height) {
        screen.resize([width, height]);
        rebuildTargets();
      } else if (!targetsReady) {
        rebuildTargets();
      }
    } else if (output.width !== width || output.height !== height) {
      output.width = width;
      output.height = height;
    }
    if (htmlInCanvas) {
      const sourceWidth = Math.max(1, Math.round(source.clientWidth * dpr));
      const sourceHeight = Math.max(1, Math.round(source.clientHeight * dpr));
      if (source.width !== sourceWidth || source.height !== sourceHeight) {
        source.width = sourceWidth;
        source.height = sourceHeight;
      }
      paintable.requestPaint!();
    }
  }

  syncCanvasSize();

  function uploadContent() {
    if (!gpu || !htmlInCanvas || !contentDirty) return;
    contentDirty = false;
    blurDirty = true;
    const texture = ensureContentTexture();
    gpu.gpu.queue.copyExternalImageToTexture(
      { source },
      { texture: texture.gpu },
      [Math.max(1, source.width), Math.max(1, source.height)],
    );
    frostFx?.set({ uContent: texture });
    if (!contentReady) {
      contentReady = true;
      introStart = performance.now();
    }
  }

  function renderBlur() {
    if (!blurDirty || !htmlInCanvas || !blurA || !blurB || !blurFx || !contentTexture) return;
    blurDirty = false;
    blurFx.set({
      uScene: contentTexture,
      params: {
        texelSize: [1 / blurA.size[0], 1 / blurA.size[1]],
        stepDir: [0, 1],
        flipY: 0,
      },
    });
    blurFx.draw(blurA);
    blurFx.set({
      uScene: blurA,
      params: {
        texelSize: [1 / blurA.size[0], 1 / blurA.size[1]],
        stepDir: [1, 0],
        flipY: 0,
      },
    });
    blurFx.draw(blurB);
  }

  let pointerOn = false;
  let pointerX = 0.5;
  let pointerY = 0.5;
  let prevPointerX = 0.5;
  let prevPointerY = 0.5;
  let lastScrollX = 0;
  let lastScrollY = 0;
  const MAX_PENDING_MELTS = 32;
  const MAX_MELTS_PER_FRAME = 4;
  const queuedMelts: Array<[number, number]> = [];

  function pointerParams(pointX: number, pointY: number, prevX: number, prevY: number, touching: number) {
    const cssW = Math.max(output.clientWidth, 1);
    const cssH = Math.max(output.clientHeight, 1);
    const sx = content.scrollLeft;
    const sy = content.scrollTop;
    return {
      point: [pointX, pointY],
      prevPoint: [prevX, prevY],
      backShift: [(sx - lastScrollX) / cssW, (sy - lastScrollY) / cssH],
      scroll: [sx / cssW, sy / cssH],
      aspect: (screen?.size[0] ?? output.width) / Math.max(screen?.size[1] ?? output.height, 1),
      textureScale: config.textureScale,
      decay: config.refreeze * 0.001,
      meltNoise: config.meltNoise,
      meltStrength: config.meltStrength * 0.2,
      radius: config.meltRadius,
      edgeFade: config.meltEdges ? 0 : config.edgeFade,
      touching,
    };
  }

  function renderPointer() {
    if (!pointer || !pointerFx || !noiseTarget) {
      queuedMelts.length = 0;
      return;
    }
    const sx = content.scrollLeft;
    const sy = content.scrollTop;
    if (queuedMelts.length > 0) {
      const count = Math.min(queuedMelts.length, MAX_MELTS_PER_FRAME);
      for (let i = 0; i < count; i++) {
        const [mx, my] = queuedMelts.shift()!;
        pointerFx.set({
          uBack: pointer.read,
          params: pointerParams(mx, my, mx, my, 1),
        });
        pointerFx.draw(pointer.write);
        pointer.swap();
      }
    } else {
      pointerFx.set({
        uBack: pointer.read,
        params: pointerParams(pointerX, pointerY, prevPointerX, prevPointerY, pointerOn ? 1 : 0),
      });
      pointerFx.draw(pointer.write);
      pointer.swap();
    }
    lastScrollX = sx;
    lastScrollY = sy;
    prevPointerX = pointerX;
    prevPointerY = pointerY;
  }

  function renderFrost(now: number) {
    if (!frostTarget || !pointer || !blurB || !frostFx || !contentTexture || !noiseTarget) return;
    const cssW = Math.max(output.clientWidth, 1);
    const cssH = Math.max(output.clientHeight, 1);
    const [width, height] = screen?.size ?? [output.width, output.height];
    frostFx.set({
      uContent: contentTexture,
      uBlur: blurB,
      uNoise: noiseTarget,
      uPointer: pointer.read,
      params: {
        scroll: [content.scrollLeft / cssW, content.scrollTop / cssH],
        aspect: width / Math.max(height, 1),
        textureScale: config.textureScale,
        meltEdges: config.meltEdges ? 1 : 0,
        intro: introProgress(now),
        highlight: config.highlight,
        strength: config.strength,
        frost: config.frost,
        contrast: config.contrast,
        crispness: config.crispness,
        haze: config.haze,
        tintThin: config.tintThin,
        tintThick: config.tintThick,
        tintStrength: config.tintStrength,
        highlightStrength: config.highlightStrength,
        saturation: config.saturation,
        brightness: config.brightness,
        shimmer: config.shimmer,
        time: now / 1000,
        opacity: Math.min(Math.max(config.opacity, 0), 1),
        hasContent: htmlInCanvas ? 1 : 0,
      },
    });
    frostFx.draw(frostTarget);
  }

  function renderOutput() {
    if (!gpu || !frostTarget || !heightTarget || !outputFx || !screen) return;
    const dpr = dprNow;
    outputFx.set({
      uFrost: frostTarget,
      uHeights: heightTarget,
      params: {
        resolution: screen.size,
        ior: Math.max(config.ior, 1.01),
        refraction: config.refraction,
        detail: config.detail,
        textureScale: config.textureScale,
        fresnel: config.fresnel,
        scrollPx: [content.scrollLeft * dpr, -content.scrollTop * dpr],
        hasContent: htmlInCanvas ? 1 : 0,
        fallbackAlpha: 0.85,
      },
    });
    gpuFrame(gpu, (f) => f.pass(screen!, outputFx!));
  }

  function renderFallback() {
    if (!fallback2d || !htmlInCanvas || !contentDirty) return;
    contentDirty = false;
    fallback2d.clearRect(0, 0, output.width, output.height);
    fallback2d.drawImage(source, 0, 0, output.width, output.height);
  }

  let raf = 0;
  let destroyed = false;
  let running = false;
  let visible = true;
  let activeUntil = 0;
  let introStart = performance.now();

  function introProgress(now: number) {
    const introMs = Math.max(config.introDuration, 0) * 1000;
    if (introMs <= 0 || reducedMotion) return 1;
    const t = Math.min(Math.max((now - introStart) / introMs, 0), 1);
    return t * t * (3 - 2 * t);
  }

  function refreezeDelayMs() {
    const decay = Math.max(config.refreeze * 0.001, 1e-5);
    return (1 / decay / 60) * 1000 + 500;
  }

  function frame(now: number) {
    if (destroyed) return;
    if (!visible || document.hidden) {
      running = false;
      return;
    }
    if (fallback2d) {
      renderFallback();
      running = false;
      return;
    }
    if (!gpu || !screen || !targetsReady) {
      running = false;
      return;
    }
    uploadContent();
    if (!contentReady) {
      running = false;
      return;
    }
    renderBlur();
    if (queuedMelts.length > 0) activeUntil = now + refreezeDelayMs();
    renderPointer();
    renderFrost(now);
    renderOutput();

    const animating =
      pointerOn ||
      now < activeUntil ||
      now < introStart + Math.max(config.introDuration, 0) * 1000 + 120 ||
      contentDirty ||
      config.shimmer > 0.001 ||
      queuedMelts.length > 0;
    if (!animating) {
      running = false;
      return;
    }
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (destroyed || running || !visible || document.hidden) return;
    running = true;
    raf = requestAnimationFrame(frame);
  }

  wake = start;

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reducedMotion = motionQuery.matches;

  function onMotionChange() {
    reducedMotion = motionQuery.matches;
    if (!reducedMotion) start();
  }
  motionQuery.addEventListener("change", onMotionChange);

  acquireGpu()
    .then((device) => {
      if (destroyed) return;
      gpu = device;
      screen = surface(gpu, output, {
        autoResize: false,
        alphaMode: "premultiplied",
        label: "frost",
      });
      linearClamp = sampler(gpu, {
        minFilter: "linear",
        magFilter: "linear",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
      });
      linearRepeat = sampler(gpu, {
        minFilter: "linear",
        magFilter: "linear",
        addressModeU: "repeat",
        addressModeV: "repeat",
      });
      noiseFx = effect(gpu, FRAG_NOISE, { label: "frost.noise" });
      heightFx = effect(gpu, FRAG_HEIGHT, { label: "frost.height" });
      blurFx = effect(gpu, FRAG_BLUR, {
        label: "frost.blur",
        set: { uSampler: linearClamp, uScene: ensureContentTexture() },
      });
      heightTarget = createRenderTarget(HEIGHT_RES, HEIGHT_RES, "rgba8unorm", "frost.height-map");
      noiseTarget = createRenderTarget(NOISE_RES, NOISE_RES, "rgba8unorm", "frost.noise-map");
      heightFx.draw(heightTarget);
      noiseFx.draw(noiseTarget);
      pointerFx = effect(gpu, FRAG_POINTER, {
        label: "frost.pointer",
        set: { uClampSampler: linearClamp, uRepeatSampler: linearRepeat, uNoise: noiseTarget },
      });
      frostFx = effect(gpu, FRAG_FROST, {
        label: "frost.layer",
        set: { uClampSampler: linearClamp, uRepeatSampler: linearRepeat, uContent: ensureContentTexture(), uNoise: noiseTarget },
      });
      outputFx = effect(gpu, FRAG_OUTPUT, {
        label: "frost.output",
        set: { uClampSampler: linearClamp, uRepeatSampler: linearRepeat, uHeights: heightTarget },
      });
      syncCanvasSize();
      if (htmlInCanvas) captureContent();
      start();
    })
    .catch((error) => {
      if (destroyed) return;
      console.warn("Frost: WebGPU unavailable, showing content without the effect.", error);
      fallback2d = output.getContext("2d");
      contentDirty = true;
      start();
    });

  start();

  const rectCache = createRectCache(output);

  function suspend() {
    cancelAnimationFrame(raf);
    running = false;
    pointerOn = false;
    prevPointerX = pointerX;
    prevPointerY = pointerY;
  }

  function onVisibilityChange() {
    if (document.hidden) suspend();
    else start();
  }
  document.addEventListener("visibilitychange", onVisibilityChange);

  function onPointerMove(event: PointerEvent) {
    if (destroyed || reducedMotion || !visible || document.hidden) return;
    const rect = rectCache.current;
    pointerX = (event.clientX - rect.left) / Math.max(rect.width, 1);
    pointerY = (event.clientY - rect.top) / Math.max(rect.height, 1);
    pointerOn = true;
    activeUntil = performance.now() + refreezeDelayMs();
    start();
  }

  function onPointerLeave() {
    pointerOn = false;
    activeUntil = performance.now() + refreezeDelayMs();
    start();
  }

  const listenTarget = output.parentElement ?? output;
  listenTarget.addEventListener("pointermove", onPointerMove as EventListener, { passive: true });
  listenTarget.addEventListener("pointerdown", onPointerMove as EventListener, { passive: true });
  listenTarget.addEventListener(
    "pointerleave",
    onPointerLeave as EventListener,
  );
  listenTarget.addEventListener(
    "pointercancel",
    onPointerLeave as EventListener,
  );

  function onScroll() {
    activeUntil = Math.max(activeUntil, performance.now() + 400);
    if (htmlInCanvas) paintable.requestPaint?.();
    start();
  }
  content.addEventListener("scroll", onScroll, { passive: true });

  const observer = createCanvasResizeObserver(() => {
    if (destroyed) return;
    syncCanvasSize();
    start();
  });
  observer.observe(output);

  const intersection = new IntersectionObserver((entries) => {
    visible = entries[entries.length - 1]?.isIntersecting ?? true;
    if (destroyed) return;
    if (visible) start();
    else suspend();
  });
  intersection.observe(output);

  return {
    melt(x, y) {
      if (destroyed || reducedMotion) return;
      // Explicit API input is retained while suspended, up to the queue limit.
      if (queuedMelts.length >= MAX_PENDING_MELTS) queuedMelts.shift();
      queuedMelts.push([x, y]);
      activeUntil = performance.now() + refreezeDelayMs();
      start();
    },
    setOptions(next) {
      if (destroyed) return;
      if (
        !Object.entries(next).some(
          ([key, value]) => config[key as keyof FrostOptions] !== value,
        )
      )
        return;
      const { quality, ...rest } = next;
      const qualityChanged =
        quality !== undefined && quality !== config.quality;
      Object.assign(config, rest);
      if (qualityChanged) {
        config.quality = quality!;
        rebuildTargets();
      }
      activeUntil = Math.max(activeUntil, performance.now() + 100);
      start();
    },
    resize() {
      if (destroyed) return;
      syncCanvasSize();
      start();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      queuedMelts.length = 0;
      suspend();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      rectCache.destroy();
      cancelAnimationFrame(raf);
      observer.disconnect();
      intersection.disconnect();
      motionQuery.removeEventListener("change", onMotionChange);
      destroyTarget(noiseTarget);
      destroyTarget(frostTarget);
      destroyTarget(blurA);
      destroyTarget(blurB);
      if (pointer) {
        destroyTarget(pointer.read);
        destroyTarget(pointer.write);
      }
      destroyTarget(heightTarget);
      contentTexture?.destroy();
      screen?.dispose();
      if (htmlInCanvas) paintable.onpaint = null;
      content.removeEventListener("scroll", onScroll);
      listenTarget.removeEventListener(
        "pointermove",
        onPointerMove as EventListener,
      );
      listenTarget.removeEventListener(
        "pointerdown",
        onPointerMove as EventListener,
      );
      listenTarget.removeEventListener(
        "pointerleave",
        onPointerLeave as EventListener,
      );
      listenTarget.removeEventListener(
        "pointercancel",
        onPointerLeave as EventListener,
      );
    },
  };
}
