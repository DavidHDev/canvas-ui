import { getCanvasPixelRatio, createCanvasResizeObserver } from "../canvas-viewport";
import { isHtmlInCanvasBlocked, prepareHtmlInCanvas, drawHtmlInCanvas } from "../html-in-canvas";
import { effect, frame as gpuFrame, init, sampler, surface, type Effect, type Gpu, type Surface } from "vgpu";
import type { Texture } from "vgpu";

export type AsciiSweepCharset = "ascii" | "blocks" | "binary";

export type AsciiSweepBlend = "auto" | "add" | "over";

export interface AsciiSweepOptions {
  /** Sweep direction in degrees. 0 sweeps left to right, 90 sweeps bottom to top. */
  angle?: number;
  /** Seconds the sweep takes from one panel to the other. */
  duration?: number;
  /** Width of the ascii band as a fraction of the travel (0 to 1). */
  band?: number;
  /** Feather of the band edges as a fraction of the band (0 to 1). */
  softness?: number;
  /** How ragged the sweep edge is. Higher tears the boundary apart row by row. */
  turbulence?: number;
  /** Length of the glowing trail left behind the band, as a fraction of the band. */
  trail?: number;
  /** Drives the sweep manually from 0 to 1. Set to -1 to let the component animate itself. */
  progress?: number;
  /** Size of one glyph pixel in CSS pixels. Characters are 5x5 glyph pixels. */
  scale?: number;
  /** Empty glyph pixels around each character (0 to 3). */
  spacing?: number;
  /** Built-in character ramp: real ascii glyphs, shade blocks, or binary digits. */
  charset?: AsciiSweepCharset;
  /** Custom ramp of packed 5x5 bitmaps (dark to bright), overrides charset. */
  glyphs?: number[];
  /** Color of the sweeping characters, as any CSS color. */
  color?: string;
  /** How strongly the ink color replaces the content color (0 to 1). */
  tint?: number;
  /** Soft phosphor glow around the characters (0 to 1). */
  glow?: number;
  /** Chromatic aberration across the band, in CSS pixels. */
  aberration?: number;
  /** How much characters flicker on and off as the band passes (0 to 1). */
  flicker?: number;
  /** Share of cells inside the band that light up (0 to 1). */
  density?: number;
  /** Horizontal tearing of content rows inside the band, in CSS pixels. */
  displace?: number;
  /** Contrast applied to character density before picking a glyph. */
  contrast?: number;
  /** Density offset applied before picking a glyph (-1 to 1). */
  brightness?: number;
  /** Invert character density inside the band (0 to 1). */
  invert?: number;
  /** Contrast against the background above which a pixel counts as content and grows characters. */
  threshold?: number;
  /** How far the content dims underneath the band (0 to 1). */
  fade?: number;
  /** How characters composite over the content. "auto" adds on dark pages and paints over on light ones. */
  blend?: AsciiSweepBlend;
  /** Color of the page behind the content, as any CSS color, or "auto" to read it from the DOM. */
  background?: string;
  /** Called when a sweep starts. */
  onSweepStart?: (to: number) => void;
  /** Called once the sweep has fully settled on its destination panel. */
  onSweepEnd?: (to: number) => void;
}

export interface AsciiSweepSlot {
  /** Canvas with layoutsubtree that hosts this panel's HTML. */
  source: HTMLCanvasElement;
  /** The element inside the source canvas that gets captured. */
  content: HTMLElement;
}

export interface AsciiSweepElements {
  /** The two panel slots the effect sweeps between. */
  slots: [AsciiSweepSlot, AsciiSweepSlot];
  /** Canvas the WebGPU effect renders to. */
  output: HTMLCanvasElement;
}

export interface AsciiSweepInstance {
  /** Update effect options live. */
  setOptions: (options: AsciiSweepOptions) => void;
  /** Sweep to slot 0 or 1. Pass an angle to override the configured direction for this sweep only. */
  sweep: (to: 0 | 1, options?: { angle?: number }) => void;
  /** The slot the effect is resting on, or animating toward. */
  current: () => 0 | 1;
  /** Force both panels to be captured again. */
  capture: () => void;
  /** Re-read canvas size. Call when the element is resized. */
  resize: () => void;
  /** Stop the loop and release all GPU resources. */
  destroy: () => void;
}

const CHARSETS: Record<AsciiSweepCharset, number[]> = {
  ascii: [
    0, 128, 131200, 14336, 459200, 469440, 4357252, 18157905, 11512810,
    15724526,
  ],
  blocks: [0, 328000, 22041621, 22369621, 11512810, 33554431],
  binary: [0, 4591758, 15324974],
};

/** Seconds the settled effect takes to dissolve away. */
const FADE_OUT_S = 0.45;

const MAX_GLYPHS = 16;
const FALLBACK_CAPTURE_DELAY = 500;

const DEFAULTS: Required<AsciiSweepOptions> = {
  angle: 0,
  duration: 2,
  band: 0.28,
  softness: 0.45,
  turbulence: 0.5,
  trail: 0.75,
  progress: -1,
  scale: 2,
  spacing: 1,
  charset: "ascii",
  glyphs: [],
  color: "#4ade80",
  tint: 0.75,
  glow: 2,
  aberration: 5,
  flicker: 0.35,
  density: 0.9,
  displace: 14,
  contrast: 1.2,
  brightness: 0,
  invert: 0,
  threshold: 0.1,
  fade: 0.75,
  blend: "auto",
  background: "auto",
  onSweepStart: () => {},
  onSweepEnd: () => {},
};

type PaintableCanvas = HTMLCanvasElement & {
  onpaint?: (() => void) | null;
  requestPaint?: () => void;
};

type ElementImageContext = CanvasRenderingContext2D & {
  drawElementImage?: (element: Element, x: number, y: number) => void;
};

const MIPMAP_SHADER = /* wgsl */ `
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

const SHADER = /* wgsl */ `
struct Params {
  glyphs: array<vec4u, 4>,
  ink: vec4f,
  bg: vec4f,
  resolution: vec2f,
  dir: vec2f,
  progress: f32,
  band: f32,
  softness: f32,
  turbulence: f32,
  trail: f32,
  glyphPx: f32,
  spacing: f32,
  tint: f32,
  glow: f32,
  aberration: f32,
  flicker: f32,
  density: f32,
  displace: f32,
  contrast: f32,
  brightness: f32,
  invert: f32,
  threshold: f32,
  fade: f32,
  additive: f32,
  bgLum: f32,
  time: f32,
  lod: f32,
  activeAmount: f32,
  maxX: f32,
  glyphCount: u32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var uFrom: texture_2d<f32>;
@group(0) @binding(2) var uTo: texture_2d<f32>;
@group(0) @binding(3) var uSampler: sampler;

fn S(a: f32, b: f32, t: f32) -> f32 {
  return smoothstep(a, b, t);
}

fn glyphBit(index: u32, p: vec2i) -> f32 {
  if (p.x < 0 || p.x > 4 || p.y < 0 || p.y > 4) { return 0.0; }
  let bits = params.glyphs[index / 4u][index % 4u];
  let shift = u32((4 - p.x) + 5 * p.y);
  return f32((bits >> shift) & 1u);
}

fn hash21(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
}

fn hash31(p: vec3f) -> f32 {
  return fract(sin(dot(p, vec3f(127.1, 311.7, 74.7))) * 43758.5453);
}

fn panelFrom(uv: vec2f, lod: f32, fringe: vec2f) -> vec4f {
  var c = textureSampleLevel(uFrom, uSampler, uv, lod);
  if (params.aberration > 0.001) {
    c = vec4f(
      textureSampleLevel(uFrom, uSampler, uv + fringe, lod).r,
      c.g,
      textureSampleLevel(uFrom, uSampler, uv - fringe, lod).b,
      c.a,
    );
  }
  return c;
}

fn panelTo(uv: vec2f, lod: f32, fringe: vec2f) -> vec4f {
  var c = textureSampleLevel(uTo, uSampler, uv, lod);
  if (params.aberration > 0.001) {
    c = vec4f(
      textureSampleLevel(uTo, uSampler, uv + fringe, lod).r,
      c.g,
      textureSampleLevel(uTo, uSampler, uv - fringe, lod).b,
      c.a,
    );
  }
  return c;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  if (params.activeAmount < 0.001) {
    return vec4f(0.0);
  }

  let glUv = vec2f(uv.x, 1.0 - uv.y);
  if (glUv.x > params.maxX) {
    return vec4f(0.0);
  }
  let cellPx = max((5.0 + 2.0 * params.spacing) * params.glyphPx, 1.0);
  let frag = glUv * params.resolution;
  let cell = floor(frag / cellPx);
  let cellUv = (cell + vec2f(0.5)) * cellPx / params.resolution;

  let extent = max(0.5 * (abs(params.dir.x) + abs(params.dir.y)), 0.0001);
  var axis = dot(cellUv - vec2f(0.5), params.dir) / (2.0 * extent) + 0.5;

  let band = max(params.band, 0.001);

  let rowSeed = hash21(vec2f(floor(cell.y * 0.5), 19.7)) - 0.5;
  let cellSeed = hash21(cell * 0.37 + vec2f(3.1)) - 0.5;
  let jitter = (rowSeed * 0.8 + cellSeed * 0.4) * params.turbulence * band;
  axis += jitter;

  let feather = max(clamp(params.softness, 0.0, 1.0) * band, 0.0001);
  let glowSpan = band * (1.0 + params.trail) + feather;
  let travel = 1.0 + band * (1.0 + params.trail) + params.turbulence * band;
  let head = params.progress * travel;
  let behind = head - axis;
  let swap = S(band * 0.30, band * 0.62, behind);
  let enter = S(0.0, feather, behind);
  let leave = 1.0 - S(band, band + max(params.trail, 0.001) * band, behind);
  let ascii = clamp(enter * leave, 0.0, 1.0);

  let aura = (1.0 - S(0.0, glowSpan, abs(behind - band * 0.5)))
    * S(-feather * 2.0, feather, behind);

  let fringe = (params.dir * params.aberration * max(ascii, aura * 0.5))
    / max(params.resolution, vec2f(1.0));

  var texUv = vec2f(glUv.x, 1.0 - glUv.y);
  if (params.displace > 0.001) {
    let sliceH = max(cellPx * 1.6, 2.0);
    let slice = floor(frag.y / sliceH);
    let tick = floor(params.time * 12.0);
    let pick = hash21(vec2f(slice, tick));
    let tear = (hash21(vec2f(slice * 1.7, tick * 0.31)) - 0.5)
      * step(0.45, pick);
    texUv.x += (tear * 2.0 * params.displace * ascii) / max(params.resolution.x, 1.0);
  }

  let rawFrom = panelFrom(texUv, 0.0, fringe);
  let rawTo = panelTo(texUv, 0.0, fringe);

  var base = mix(
    mix(params.bg.rgb, rawFrom.rgb, rawFrom.a),
    mix(params.bg.rgb, rawTo.rgb, rawTo.a),
    swap);
  var alpha = max(rawFrom.a, rawTo.a);

  let cellTexUv = vec2f(cellUv.x, 1.0 - cellUv.y);

  if (aura > 0.002) {
    let spread = vec2f(cellPx) / max(params.resolution, vec2f(1.0));
    var edge = 0.0;
    for (var i = 0; i < 5; i++) {
      let tap = vec2f(
        select(0.0, 1.0, i == 1) - select(0.0, 1.0, i == 2),
        select(0.0, 1.0, i == 3) - select(0.0, 1.0, i == 4),
      ) * spread;
      let sFrom = textureSampleLevel(uFrom, uSampler, texUv + tap, params.lod);
      let sTo = textureSampleLevel(uTo, uSampler, texUv + tap, params.lod);
      let bFrom = textureSampleLevel(uFrom, uSampler, texUv + tap, params.lod + 2.5);
      let bTo = textureSampleLevel(uTo, uSampler, texUv + tap, params.lod + 2.5);
      let sharpRgb = mix(
        mix(params.bg.rgb, sFrom.rgb, sFrom.a), mix(params.bg.rgb, sTo.rgb, sTo.a), swap);
      let broadRgb = mix(
        mix(params.bg.rgb, bFrom.rgb, bFrom.a), mix(params.bg.rgb, bTo.rgb, bTo.a), swap);
      edge += abs(
        dot(sharpRgb, vec3f(0.299, 0.587, 0.114)) -
        dot(broadRgb, vec3f(0.299, 0.587, 0.114)));
    }
    edge = clamp(edge / (5.0 * 0.16), 0.0, 1.0);
    let haze = edge * aura * clamp(params.glow, 0.0, 2.0) * 0.5;
    base += params.ink.rgb * haze * (0.55 + 0.85 * params.additive);
    alpha = max(alpha, haze * 0.8);
  }

  if (ascii > 0.002) {
    let cellFrom = panelFrom(cellTexUv, params.lod, fringe);
    let cellTo = panelTo(cellTexUv, params.lod, fringe);
    let cellRgb = mix(
      mix(params.bg.rgb, cellFrom.rgb, cellFrom.a),
      mix(params.bg.rgb, cellTo.rgb, cellTo.a),
      swap);

    let lum = dot(cellRgb, vec3f(0.299, 0.587, 0.114));
    let ink = abs(lum - params.bgLum);
    var present = S(params.threshold * 0.5, params.threshold + 0.02, ink);

    let broadFrom = textureSampleLevel(uFrom, uSampler, cellTexUv, params.lod + 2.5);
    let broadTo = textureSampleLevel(uTo, uSampler, cellTexUv, params.lod + 2.5);
    let broadRgb = mix(
      mix(params.bg.rgb, broadFrom.rgb, broadFrom.a),
      mix(params.bg.rgb, broadTo.rgb, broadTo.a),
      swap);
    let detail = abs(lum - dot(broadRgb, vec3f(0.299, 0.587, 0.114)));
    present *= mix(0.5, 1.0, S(0.01, params.threshold + 0.06, detail));

    present *= step(hash21(cell + vec2f(11.3)), clamp(params.density, 0.0, 1.0));
    if (params.flicker > 0.001) {
      let roll = hash31(vec3f(cell, floor(params.time * 18.0)));
      present *= 1.0 - clamp(params.flicker, 0.0, 1.0) * step(roll, 0.4);
    }

    let t = clamp(ink / 0.35, 0.0, 1.0);
    var amount = clamp((t - 0.5) * params.contrast + 0.5 + params.brightness, 0.0, 1.0);
    amount = mix(amount, 1.0 - amount, clamp(params.invert, 0.0, 1.0));

    let churn = hash31(vec3f(cell, floor(params.time * 15.0))) - 0.5;
    let picked = clamp(amount + churn * 0.25, 0.0, 1.0);
    let index = min(u32(picked * f32(params.glyphCount)), params.glyphCount - 1u);

    let local = vec2i(floor((frag - cell * cellPx) / max(params.glyphPx, 0.001)));
    let pad = i32(params.spacing);
    let on = glyphBit(index, vec2i(local.x - pad, local.y - pad));

    let contentInk = clamp(params.bg.rgb + (cellRgb - params.bg.rgb) / max(ink, 0.2), vec3f(0.0), vec3f(1.0));
    var glyphColor = mix(contentInk, params.ink.rgb, clamp(params.tint, 0.0, 1.0));
    let level = 0.72 + 0.28 * hash21(cell * 0.91 + vec2f(7.7));
    glyphColor *= level;
    glyphColor = mix(glyphColor, vec3f(1.0),
      amount * amount * level * 0.55 * params.additive);

    let strength = ascii * present;
    let lit = on * strength;

    base = mix(base, params.bg.rgb, clamp(params.fade, 0.0, 1.0) * ascii * (1.0 - on));
    base = mix(mix(base, glyphColor, lit), base + glyphColor * lit, params.additive);
    alpha = max(alpha, lit);
  }

  base = clamp(base, vec3f(0.0), vec3f(1.0));
  alpha = clamp(alpha, 0.0, 1.0) * params.activeAmount;
  return vec4f(base * alpha, alpha);
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

/** One WebGPU device per page, shared by every AsciiSweep instance. */
function acquireGpu(): Promise<Gpu> {
  if (!sharedGpu) {
    sharedGpu = init().catch((error) => {
      sharedGpu = null;
      throw error;
    });
  }
  return sharedGpu;
}

interface FallbackRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface FallbackPaintState {
  style: CSSStyleDeclaration;
  visible: boolean;
  opacity: number;
  clip: FallbackRect;
  childrenClip: FallbackRect;
}

function intersectFallbackRects(
  first: FallbackRect,
  second: FallbackRect,
): FallbackRect {
  return {
    left: Math.max(first.left, second.left),
    top: Math.max(first.top, second.top),
    right: Math.min(first.right, second.right),
    bottom: Math.min(first.bottom, second.bottom),
  };
}

function paintFallbackSnapshot(
  content: HTMLElement,
  canvas: HTMLCanvasElement,
  dpr: number,
) {
  const rootRect = content.getBoundingClientRect();
  const width = Math.max(1, Math.round(rootRect.width * dpr));
  const height = Math.max(1, Math.round(rootRect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas is unavailable");
  ctx.resetTransform();
  ctx.clearRect(0, 0, width, height);
  ctx.scale(dpr, dpr);

  const rootClip: FallbackRect = {
    left: rootRect.left,
    top: rootRect.top,
    right: rootRect.right,
    bottom: rootRect.bottom,
  };
  const states = new WeakMap<Element, FallbackPaintState>();

  function resolveState(element: Element): FallbackPaintState {
    const cached = states.get(element);
    if (cached) return cached;

    const parent = element.parentElement;
    const parentState =
      parent && content.contains(parent) ? resolveState(parent) : null;
    const style = getComputedStyle(element);
    const ownOpacity = Number.parseFloat(style.opacity);
    const opacity =
      (parentState?.opacity ?? 1) *
      (Number.isFinite(ownOpacity) ? ownOpacity : 1);
    const visible =
      (parentState?.visible ?? true) &&
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.visibility !== "collapse" &&
      opacity > 0;
    const clip = parentState?.childrenClip ?? rootClip;
    const rect = element.getBoundingClientRect();
    const childrenClip = { ...clip };
    if (style.overflowX !== "visible") {
      childrenClip.left = Math.max(childrenClip.left, rect.left);
      childrenClip.right = Math.min(childrenClip.right, rect.right);
    }
    if (style.overflowY !== "visible") {
      childrenClip.top = Math.max(childrenClip.top, rect.top);
      childrenClip.bottom = Math.min(childrenClip.bottom, rect.bottom);
    }

    const state = { style, visible, opacity, clip, childrenClip };
    states.set(element, state);
    return state;
  }

  const walker = document.createTreeWalker(content, NodeFilter.SHOW_ELEMENT);
  let current: Node | null = walker.currentNode;
  while (current) {
    const element = current as HTMLElement;
    const rect = element.getBoundingClientRect();
    const state = resolveState(element);
    const visibleRect = intersectFallbackRects(rect, state.clip);
    if (
      state.visible &&
      visibleRect.right > visibleRect.left &&
      visibleRect.bottom > visibleRect.top
    ) {
      const { style } = state;
      ctx.save();
      ctx.beginPath();
      ctx.rect(
        state.clip.left - rootRect.left,
        state.clip.top - rootRect.top,
        state.clip.right - state.clip.left,
        state.clip.bottom - state.clip.top,
      );
      ctx.clip();
      ctx.globalAlpha = state.opacity;
      const x = rect.left - rootRect.left;
      const y = rect.top - rootRect.top;

      if (style.backgroundColor !== "transparent") {
        ctx.fillStyle = style.backgroundColor;
        ctx.fillRect(x, y, rect.width, rect.height);
      }

      paintFallbackMedia(ctx, element, style, rect, rootRect);
      paintFallbackText(ctx, element, style, rootRect);
      paintFallbackBorders(ctx, style, rect, rootRect);
      ctx.restore();
    }
    current = walker.nextNode();
  }
  ctx.globalAlpha = 1;
}

function paintFallbackMedia(
  ctx: CanvasRenderingContext2D,
  element: HTMLElement,
  style: CSSStyleDeclaration,
  rect: DOMRect,
  rootRect: DOMRect,
) {
  const drawable =
    element instanceof HTMLImageElement
      ? element.complete && element.naturalWidth > 0
        ? element
        : null
      : element instanceof HTMLCanvasElement
        ? element
        : element instanceof HTMLVideoElement && element.readyState >= 2
          ? element
          : null;
  if (!drawable) return;
  if (!isFallbackMediaOriginClean(drawable)) return;

  const sourceWidth =
    drawable instanceof HTMLImageElement
      ? drawable.naturalWidth
      : drawable instanceof HTMLVideoElement
        ? drawable.videoWidth
        : drawable.width;
  const sourceHeight =
    drawable instanceof HTMLImageElement
      ? drawable.naturalHeight
      : drawable instanceof HTMLVideoElement
        ? drawable.videoHeight
        : drawable.height;
  if (!(sourceWidth > 0 && sourceHeight > 0)) return;

  let sourceX = 0;
  let sourceY = 0;
  let cropWidth = sourceWidth;
  let cropHeight = sourceHeight;
  let targetX = rect.left - rootRect.left;
  let targetY = rect.top - rootRect.top;
  let targetWidth = rect.width;
  let targetHeight = rect.height;
  const [positionX, positionY] = resolveObjectPosition(style.objectPosition);
  if (style.objectFit === "cover") {
    const scale = Math.max(
      rect.width / sourceWidth,
      rect.height / sourceHeight,
    );
    cropWidth = rect.width / scale;
    cropHeight = rect.height / scale;
    sourceX = (sourceWidth - cropWidth) * positionX;
    sourceY = (sourceHeight - cropHeight) * positionY;
  } else if (
    style.objectFit === "contain" ||
    style.objectFit === "scale-down"
  ) {
    const containScale = Math.min(
      rect.width / sourceWidth,
      rect.height / sourceHeight,
      style.objectFit === "scale-down" ? 1 : Number.POSITIVE_INFINITY,
    );
    targetWidth = sourceWidth * containScale;
    targetHeight = sourceHeight * containScale;
    targetX += (rect.width - targetWidth) * positionX;
    targetY += (rect.height - targetHeight) * positionY;
  }

  try {
    ctx.drawImage(
      drawable,
      sourceX,
      sourceY,
      cropWidth,
      cropHeight,
      targetX,
      targetY,
      targetWidth,
      targetHeight,
    );
  } catch {}
}

function isFallbackMediaOriginClean(
  drawable: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
): boolean {
  const probe = document.createElement("canvas");
  probe.width = probe.height = 1;
  const ctx = probe.getContext("2d", { willReadFrequently: true });
  if (!ctx) return false;
  try {
    ctx.drawImage(drawable, 0, 0, 1, 1);
    ctx.getImageData(0, 0, 1, 1);
    return true;
  } catch {
    return false;
  }
}

function resolveObjectPosition(position: string): [number, number] {
  const [x = "50%", y = "50%"] = position.split(/\s+/);
  return [
    resolvePositionValue(x, "left", "right"),
    resolvePositionValue(y, "top", "bottom"),
  ];
}

function resolvePositionValue(
  value: string,
  start: string,
  end: string,
): number {
  if (value === start) return 0;
  if (value === end) return 1;
  if (value === "center") return 0.5;
  if (value.endsWith("%")) {
    return Math.min(1, Math.max(0, Number.parseFloat(value) / 100));
  }
  return 0.5;
}

function paintFallbackText(
  ctx: CanvasRenderingContext2D,
  element: HTMLElement,
  style: CSSStyleDeclaration,
  rootRect: DOMRect,
) {
  const textNodes = Array.from(element.childNodes).filter(
    (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
  );
  if (textNodes.length === 0) return;

  ctx.fillStyle = style.color;
  ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  ctx.textBaseline = "alphabetic";
  if ("letterSpacing" in ctx) {
    ctx.letterSpacing =
      style.letterSpacing === "normal" ? "0px" : style.letterSpacing;
  }
  const textAlign: CanvasTextAlign =
    style.textAlign === "center" ||
    style.textAlign === "right" ||
    style.textAlign === "start" ||
    style.textAlign === "end"
      ? style.textAlign
      : "left";
  const direction: CanvasDirection = style.direction === "rtl" ? "rtl" : "ltr";
  ctx.textAlign = textAlign;
  ctx.direction = direction;

  const whiteSpace = style.whiteSpace;
  const preservesNewlines =
    whiteSpace === "pre" ||
    whiteSpace === "pre-wrap" ||
    whiteSpace === "pre-line" ||
    whiteSpace === "break-spaces";
  const preservesSpaces = preservesNewlines && whiteSpace !== "pre-line";

  const anchor =
    textAlign === "center"
      ? 0.5
      : textAlign === "right" ||
          (textAlign === "end" && direction === "ltr") ||
          (textAlign === "start" && direction === "rtl")
        ? 1
        : 0;

  function transform(text: string): string {
    if (style.textTransform === "uppercase") return text.toUpperCase();
    if (style.textTransform === "lowercase") return text.toLowerCase();
    return text;
  }

  function drawAcrossRects(text: string, rects: DOMRect[]) {
    const visible = rects.filter(
      (rect) =>
        rect.right > rootRect.left &&
        rect.left < rootRect.right &&
        rect.bottom > rootRect.top &&
        rect.top < rootRect.bottom,
    );
    if (visible.length === 0) return;
    const totalWidth = visible.reduce((sum, rect) => sum + rect.width, 0);
    let offset = 0;
    for (let index = 0; index < visible.length; index++) {
      const rect = visible[index];
      const remaining = text.length - offset;
      if (remaining <= 0) break;
      const count =
        index === visible.length - 1
          ? remaining
          : Math.min(
              remaining,
              Math.max(1, Math.round((text.length * rect.width) / totalWidth)),
            );
      const slice = text.slice(offset, offset + count);
      offset += count;
      const line = preservesSpaces ? slice : slice.trim();
      if (!line.trim()) continue;
      const x = rect.left - rootRect.left + rect.width * anchor;
      const metrics = ctx.measureText(line);
      const ascent = metrics.fontBoundingBoxAscent ?? 0;
      const descent = metrics.fontBoundingBoxDescent ?? 0;
      const y =
        ascent > 0
          ? rect.top -
            rootRect.top +
            (rect.height - ascent - descent) / 2 +
            ascent
          : rect.bottom - rootRect.top - rect.height * 0.2;
      ctx.fillText(line, x, y, Math.max(rect.width, 1));
    }
  }

  for (const node of textNodes) {
    const raw = node.textContent ?? "";
    const range = document.createRange();

    if (preservesNewlines) {
      let position = 0;
      for (const part of raw.split("\n")) {
        const start = position;
        position += part.length + 1;
        if (!part.trim()) continue;
        range.setStart(node, start);
        range.setEnd(node, start + part.length);
        const text = transform(
          preservesSpaces ? part : part.replace(/\s+/g, " ").trim(),
        );
        drawAcrossRects(text, Array.from(range.getClientRects()));
      }
      continue;
    }

    const text = transform(raw.replace(/\s+/g, " ").trim());
    if (!text) continue;
    range.selectNodeContents(node);
    drawAcrossRects(text, Array.from(range.getClientRects()));
  }
}

function paintFallbackBorders(
  ctx: CanvasRenderingContext2D,
  style: CSSStyleDeclaration,
  rect: DOMRect,
  rootRect: DOMRect,
) {
  const x = rect.left - rootRect.left;
  const y = rect.top - rootRect.top;
  const top = Number.parseFloat(style.borderTopWidth);
  const right = Number.parseFloat(style.borderRightWidth);
  const bottom = Number.parseFloat(style.borderBottomWidth);
  const left = Number.parseFloat(style.borderLeftWidth);
  if (top > 0) {
    ctx.fillStyle = style.borderTopColor;
    ctx.fillRect(x, y, rect.width, top);
  }
  if (right > 0) {
    ctx.fillStyle = style.borderRightColor;
    ctx.fillRect(x + rect.width - right, y, right, rect.height);
  }
  if (bottom > 0) {
    ctx.fillStyle = style.borderBottomColor;
    ctx.fillRect(x, y + rect.height - bottom, rect.width, bottom);
  }
  if (left > 0) {
    ctx.fillStyle = style.borderLeftColor;
    ctx.fillRect(x, y, left, rect.height);
  }
}

export function createAsciiSweep(
  elements: AsciiSweepElements,
  options: AsciiSweepOptions = {},
): AsciiSweepInstance | null {
  if (!supportsWebGPU()) return null;
  try {
    return initializeAsciiSweep(elements, options);
  } catch (error) {
    console.error("AsciiSweep initialization failed:", error);
    return null;
  }
}

interface SlotState {
  source: HTMLCanvasElement;
  content: HTMLElement;
  ctx: ElementImageContext | null;
  paintable: PaintableCanvas;
  texture: Texture | null;
  fallbackCanvas: HTMLCanvasElement | null;
  dirty: boolean;
  /** Timestamp of the most recent capture that reached the texture. */
  stamp: number;
  captureTimer: number;
  captureDeadline: number;
  scrollTimer: number;
  capturedScrollLeft: number;
  capturedScrollTop: number;
  captureErrorLogged: boolean;
  uploadErrorLogged: boolean;
}
function initializeAsciiSweep(
  elements: AsciiSweepElements,
  options: AsciiSweepOptions,
): AsciiSweepInstance | null {
  const config = { ...DEFAULTS, ...options };
  const { slots, output } = elements;
  if (!slots || slots.length !== 2) {
    throw new Error("AsciiSweep needs exactly two slots");
  }

  const probeCtx = (() => {
    const probe = document.createElement("canvas");
    probe.width = probe.height = 1;
    return probe.getContext("2d", { willReadFrequently: true });
  })();

  function parseColor(value: string): [number, number, number] | null {
    if (!probeCtx || !value) return null;
    probeCtx.clearRect(0, 0, 1, 1);
    probeCtx.fillStyle = "#000";
    probeCtx.fillStyle = value;
    const resolved = probeCtx.fillStyle;
    probeCtx.clearRect(0, 0, 1, 1);
    probeCtx.fillStyle = resolved;
    probeCtx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = probeCtx.getImageData(0, 0, 1, 1).data;
    if (a === 0) return null;
    return [r / 255, g / 255, b / 255];
  }

  let destroyed = false;
  let wake = () => {};

  let gpu: Gpu | null = null;
  let screen: Surface | null = null;
  let fx: Effect | null = null;
  let linearSampler: GPUSampler | null = null;
  let fallback2d: CanvasRenderingContext2D | null = null;
  let mipmapLayout: GPUBindGroupLayout | null = null;
  let mipmapPipeline: GPURenderPipeline | null = null;

  const firstCtx = slots[0].source.getContext(
    "2d",
  ) as ElementImageContext | null;
  const htmlInCanvas = Boolean(
    !isHtmlInCanvasBlocked() &&
    slots.every((slot) => slot.source.contains(slot.content)) &&
    firstCtx &&
    typeof firstCtx.drawElementImage === "function" &&
    typeof (slots[0].source as PaintableCanvas).requestPaint === "function",
  );

  if (htmlInCanvas) {
    for (const slot of slots) prepareHtmlInCanvas(slot.source, slot.content);
  }

  const states: SlotState[] = slots.map((slot, index) => ({
    source: slot.source,
    content: slot.content,
    ctx:
      index === 0
        ? firstCtx
        : (slot.source.getContext("2d") as ElementImageContext | null),
    paintable: slot.source as PaintableCanvas,
    texture: null,
    fallbackCanvas: null,
    dirty: false,
    stamp: 0,
    captureTimer: 0,
    captureDeadline: 0,
    scrollTimer: 0,
    capturedScrollLeft: 0,
    capturedScrollTop: 0,
    captureErrorLogged: false,
    uploadErrorLogged: false,
  }));

  function mipLevelCountFor(width: number, height: number): number {
    return Math.floor(Math.log2(Math.max(width, height))) + 1;
  }

  function ensureSlotTexture(state: SlotState, width = state.source.width, height = state.source.height): Texture | null {
    if (!gpu) return null;
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    const mipLevelCount = mipLevelCountFor(w, h);
    if (
      !state.texture ||
      state.texture.size[0] !== w ||
      state.texture.size[1] !== h ||
      state.texture.mipLevelCount !== mipLevelCount
    ) {
      state.texture?.destroy();
      state.texture = gpu.device.createTexture({
        size: [w, h],
        format: "rgba8unorm",
        usage: ["texture_binding", "copy_dst", "render_attachment"],
        mipLevelCount,
        label: "ascii-sweep.panel",
      });
    }
    return state.texture;
  }

  function ensureMipmapPipeline(): GPURenderPipeline | null {
    if (!gpu || !linearSampler) return null;
    if (!mipmapLayout) {
      mipmapLayout = gpu.gpu.createBindGroupLayout({
        label: "ascii-sweep.mipmap.layout",
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
        label: "ascii-sweep.mipmap",
        code: MIPMAP_SHADER,
      });
      mipmapPipeline = gpu.gpu.createRenderPipeline({
        label: "ascii-sweep.mipmap",
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
    const encoder = gpu.gpu.createCommandEncoder({ label: "ascii-sweep.mipmap" });
    for (let level = 1; level < texture.mipLevelCount; level++) {
      const bindGroup = gpu.gpu.createBindGroup({
        label: "ascii-sweep.mipmap",
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
        label: "ascii-sweep.mipmap",
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

  if (htmlInCanvas) {
    for (const state of states) {
      state.paintable.onpaint = () => {
        try {
          state.ctx!.reset();
          drawHtmlInCanvas(state.source, state.ctx!, state.content);
          state.dirty = true;
          wake();
        } catch {}
      };
    }
  }

  function queueCapture(state: SlotState, immediate = false) {
    if (htmlInCanvas || destroyed) return;
    const delay = immediate ? 0 : FALLBACK_CAPTURE_DELAY;
    const deadline = performance.now() + delay;
    if (state.captureTimer && state.captureDeadline <= deadline) return;
    window.clearTimeout(state.captureTimer);
    state.captureDeadline = deadline;
    state.captureTimer = window.setTimeout(
      () => captureFallback(state),
      delay,
    );
  }

  function captureFallback(state: SlotState) {
    window.clearTimeout(state.captureTimer);
    window.clearTimeout(state.scrollTimer);
    state.captureTimer = 0;
    state.scrollTimer = 0;
    try {
      paintFallbackSnapshot(state.content, state.source, getCanvasPixelRatio(output));
      if (destroyed) return;
      state.fallbackCanvas = state.source;
      state.capturedScrollLeft = state.content.scrollLeft;
      state.capturedScrollTop = state.content.scrollTop;
      state.dirty = true;
      state.captureErrorLogged = false;
      wake();
    } catch (error) {
      if (!destroyed && !state.captureErrorLogged) {
        state.captureErrorLogged = true;
        console.warn("AsciiSweep could not capture its HTML fallback:", error);
      }
    }
  }

  function requestCapture(immediate = false) {
    for (const state of states) {
      if (htmlInCanvas) state.paintable.requestPaint?.();
      else queueCapture(state, immediate);
    }
  }

  /**
   * Both panels stay visible and captured at all times, because a panel that
   * is hidden when the browser repaints captures as an empty texture, and
   * sweeping back to it would then reveal nothing. Instead the panel on show
   * is stacked on top and painted opaque, so it occludes the other one while
   * the effect is at rest and the real DOM stays live and selectable.
   */
  function applyStacking(shown: 0 | 1) {
    states.forEach((state, index) => {
      const front = index === shown;
      // The stacking layer is the source canvas under html-in-canvas, because
      // the two canvases are the siblings that overlap. In the DOM fallback the
      // content element is itself the layer.
      const layer = htmlInCanvas ? state.source : state.content;
      // Scrollbars are deliberately left alone. Both panels are the same size
      // and scroll together, so whichever is in front shows a scrollbar in the
      // same place. Toggling it per panel would add and remove a scrollbar
      // mid sweep and reflow the content underneath.
      layer.style.zIndex = front ? "1" : "0";
      layer.style.pointerEvents = front ? "" : "none";
      // The captured element carries the page background so the front panel is
      // opaque and fully occludes the one behind it.
      state.content.style.backgroundColor = backgroundCss;
      // Keep the panel behind out of the tab order and the accessibility tree,
      // so assistive tech never sees both panels at once.
      if (front) layer.removeAttribute("aria-hidden");
      else layer.setAttribute("aria-hidden", "true");
      layer.inert = !front;
    });
  }

  let contentMaxX = 1;

  function syncCanvasSize(): boolean {
    let changed = false;
    // clientWidth excludes the panel's own scrollbar, so this is the fraction
    // of the output the captured content actually covers.
    contentMaxX = Math.min(
      1,
      Math.max(
        0.05,
        states[0].content.clientWidth / Math.max(output.clientWidth, 1),
      ),
    );
    const dpr = getCanvasPixelRatio(output);
    const width = Math.max(1, Math.round(output.clientWidth * dpr));
    const height = Math.max(1, Math.round(output.clientHeight * dpr));
    if (screen) {
      const [currentWidth, currentHeight] = screen.size;
      if (currentWidth !== width || currentHeight !== height) {
        screen.resize([width, height]);
        changed = true;
      }
    } else if (output.width !== width || output.height !== height) {
      output.width = width;
      output.height = height;
      changed = true;
    }
    if (htmlInCanvas) {
      for (const state of states) {
        const sourceWidth = Math.max(1, Math.round(state.source.clientWidth * dpr));
        const sourceHeight = Math.max(1, Math.round(state.source.clientHeight * dpr));
        if (
          state.source.width !== sourceWidth ||
          state.source.height !== sourceHeight
        ) {
          state.source.width = sourceWidth;
          state.source.height = sourceHeight;
          changed = true;
        }
        state.paintable.requestPaint?.();
      }
    }
    return changed;
  }

  syncCanvasSize();

  let backingRgb: [number, number, number] = [1, 1, 1];
  let backingLum = 1;
  let inkRgb: [number, number, number] = [0.29, 0.87, 0.5];
  let backgroundCss = "#ffffff";

  function syncBacking() {
    let resolved: [number, number, number] | null = null;
    let resolvedCss: string | null = null;
    if (config.background && config.background !== "auto") {
      resolved = parseColor(config.background);
      if (resolved) resolvedCss = config.background;
    }
    if (!resolved) {
      let el: Element | null = states[0].content;
      while (el) {
        const bg = getComputedStyle(el).backgroundColor;
        if (bg && bg !== "transparent") {
          const parsed = parseColor(bg);
          if (parsed) {
            resolved = parsed;
            resolvedCss = bg;
            break;
          }
        }
        el = el.parentElement;
      }
    }
    backingRgb = resolved ?? [1, 1, 1];
    backingLum =
      0.299 * backingRgb[0] + 0.587 * backingRgb[1] + 0.114 * backingRgb[2];
    backgroundCss = resolvedCss ?? "#ffffff";
    inkRgb = parseColor(config.color) ?? [0.29, 0.87, 0.5];
  }

  syncBacking();

  const glyphData: [number, number, number, number][] = Array.from(
    { length: MAX_GLYPHS / 4 },
    () => [0, 0, 0, 0],
  );

  function resolveGlyphs(): number {
    const ramp =
      config.glyphs.length > 1
        ? config.glyphs
        : (CHARSETS[config.charset] ?? CHARSETS.ascii);
    const count = Math.min(ramp.length, MAX_GLYPHS);
    for (const packed of glyphData) packed.fill(0);
    for (let i = 0; i < count; i++) {
      glyphData[Math.floor(i / 4)][i % 4] = ramp[i] >>> 0;
    }
    return count;
  }

  function uploadSlot(state: SlotState) {
    const bitmap = htmlInCanvas ? state.source : state.fallbackCanvas;
    if (!bitmap || !state.dirty) return;
    if (bitmap.width < 1 || bitmap.height < 1) return;
    if (!gpu) return;
    state.dirty = false;
    try {
      const texture = ensureSlotTexture(state, bitmap.width, bitmap.height);
      if (!texture) return;
      gpu.gpu.queue.copyExternalImageToTexture(
        { source: bitmap },
        { texture: texture.gpu, mipLevel: 0 },
        [bitmap.width, bitmap.height],
      );
      generateMipmaps(texture);
      state.stamp = performance.now();
      state.uploadErrorLogged = false;
    } catch (error) {
      if (!state.uploadErrorLogged) {
        state.uploadErrorLogged = true;
        console.warn("AsciiSweep could not upload a panel texture:", error);
      }
    }
  }

  let currentSlot: 0 | 1 = 0;
  let fromSlot: 0 | 1 = 0;
  let toSlot: 0 | 1 = 1;
  let progress = 0;
  let sweeping = false;
  let sweepStart = 0;
  let sweepClockSet = false;
  let sweepAngle = config.angle;
  let settleFrames = 0;
  let active = 0;
  let fadingOut = false;

  const controlled = () => config.progress >= 0;

  function renderFallback() {
    if (!fallback2d) return;
    const state = states[currentSlot];
    const bitmap = htmlInCanvas ? state.source : state.fallbackCanvas;
    fallback2d.clearRect(0, 0, output.width, output.height);
    if (bitmap && bitmap.width > 0 && bitmap.height > 0) {
      fallback2d.drawImage(bitmap, 0, 0, output.width, output.height);
      state.dirty = false;
    }
  }

  function render(now: number) {
    if (!gpu || !fx || !screen) return;
    for (const state of states) uploadSlot(state);

    const from = states[fromSlot];
    const to = states[toSlot];
    const fromTexture = ensureSlotTexture(from);
    const toTexture = ensureSlotTexture(to);
    if (!fromTexture || !toTexture) return;

    const radians = (sweepAngle * Math.PI) / 180;
    const dpr = output.width / Math.max(output.clientWidth, 1);
    const glyphCss = Math.max(config.scale, 0.5);
    const spacing = Math.round(Math.min(Math.max(config.spacing, 0), 3));
    const glyphCount = resolveGlyphs();

    fx.set({
      uFrom: fromTexture,
      uTo: toTexture,
      params: {
        glyphs: glyphData,
        ink: [inkRgb[0], inkRgb[1], inkRgb[2], 0],
        bg: [backingRgb[0], backingRgb[1], backingRgb[2], 0],
        resolution: [output.width, output.height],
        dir: [Math.cos(radians), Math.sin(radians)],
        progress,
        band: Math.min(Math.max(config.band, 0.02), 1),
        softness: config.softness,
        turbulence: Math.max(config.turbulence, 0),
        trail: Math.max(config.trail, 0),
        glyphPx: glyphCss * dpr,
        spacing,
        tint: config.tint,
        glow: config.glow,
        aberration: Math.max(config.aberration, 0) * dpr,
        flicker: config.flicker,
        density: config.density,
        displace: Math.max(config.displace, 0) * dpr,
        contrast: Math.max(config.contrast, 0),
        brightness: config.brightness,
        invert: config.invert,
        threshold: Math.max(config.threshold, 0.001),
        fade: config.fade,
        additive:
          config.blend === "add"
            ? 1
            : config.blend === "over"
              ? 0
              : backingLum < 0.5
                ? 1
                : 0,
        bgLum: backingLum,
        time: now / 1000,
        lod: Math.max(0, Math.log2((5 + 2 * spacing) * glyphCss * dpr) - 1),
        activeAmount: active,
        maxX: contentMaxX,
        glyphCount,
      },
    });
    gpuFrame(gpu, (f) => f.pass({ target: screen!, clear: [0, 0, 0, 0] }, fx!));
  }

  let raf = 0;
  let running = false;
  let lastFrame = performance.now();
  let visible = true;
  let pageVisible =
    typeof document === "undefined" || document.visibilityState !== "hidden";

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reducedMotion = motionQuery.matches;

  function ease(t: number): number {
    // Ease out. Velocity is highest at the very start, so the band reacts the
    // instant the panel changes instead of easing in from a standstill.
    const c = 1 - Math.min(Math.max(t, 0), 1);
    return 1 - c * c * c;
  }

  /** Exact inverse of ease(), used to re-anchor the clock mid sweep. */
  function easeInverse(p: number): number {
    return 1 - Math.cbrt(1 - Math.min(Math.max(p, 0), 1));
  }

  function frame(now: number) {
    if (destroyed) return;
    if (!visible || !pageVisible) {
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

    if (controlled()) {
      progress = Math.min(Math.max(config.progress, 0), 1);
      fromSlot = 0;
      toSlot = 1;
      const shown: 0 | 1 = progress >= 0.5 ? 1 : 0;
      if (shown !== currentSlot) {
        currentSlot = shown;
        applyStacking(currentSlot);
      }
      active = 1;
      render(now);
      running = false;
      return;
    }

    if (sweeping) {
      // Start timing from the first frame that actually renders. The first
      // sweep pays for the initial panel paints, texture uploads and mipmap
      // builds, and starting the clock at the click would spend that setup
      // time out of the animation, leaving the band parked at the edge.
      if (!sweepClockSet) {
        sweepClockSet = true;
        sweepStart = now;
      }
      const duration = Math.max(config.duration, 0.05);
      const linear = reducedMotion
        ? 1
        : Math.min(1, (now - sweepStart) / 1000 / duration);
      progress = ease(linear);
      if (linear >= 1) {
        progress = 1;
        sweeping = false;
        // Hold the effect for a couple of frames after it lands so the panel
        // underneath is fully painted before the canvas goes transparent.
        settleFrames = 2;
        config.onSweepEnd?.(currentSlot);
      }
    }

    if (fadingOut) {
      // Ease the whole effect out rather than switching it off, so any glow
      // still lingering at the end of the travel dissolves instead of popping.
      const step = reducedMotion ? 1 : (now - lastFrame) / 1000 / FADE_OUT_S;
      active = Math.max(0, active - Math.max(step, 0));
      if (active <= 0.001) {
        active = 0;
        fadingOut = false;
      }
    }
    lastFrame = now;

    render(now);

    if (!sweeping && !fadingOut) {
      if (settleFrames > 0) {
        settleFrames -= 1;
        if (settleFrames === 0) fadingOut = true;
      } else if (active === 0) {
        running = false;
        return;
      }
    }

    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (destroyed || running || !visible || !pageVisible) return;
    running = true;
    lastFrame = performance.now();
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
        label: "ascii-sweep",
      });
      linearSampler = sampler(gpu, {
        minFilter: "linear",
        magFilter: "linear",
        mipmapFilter: "linear",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
      });
      const fromTexture = ensureSlotTexture(states[0]);
      const toTexture = ensureSlotTexture(states[1]);
      if (!fromTexture || !toTexture) return;
      fx = effect(gpu, SHADER, {
        label: "ascii-sweep",
        set: { uSampler: linearSampler, uFrom: fromTexture, uTo: toTexture },
      });
      syncCanvasSize();
      start();
    })
    .catch((error) => {
      if (destroyed) return;
      console.warn("AsciiSweep: WebGPU unavailable, showing content without the effect.", error);
      fallback2d = output.getContext("2d");
      requestCapture(true);
      start();
    });

  applyStacking(currentSlot);
  requestCapture(true);
  start();

  function sweep(to: 0 | 1, sweepOptions?: { angle?: number }) {
    if (destroyed || controlled()) return;
    const target: 0 | 1 = to === 1 ? 1 : 0;
    // Already resting on this panel, or already on the way to it.
    if (sweeping ? target === toSlot : target === currentSlot) return;

    if (sweeping) {
      // Interrupting a sweep in flight. Run the band backwards from wherever
      // it currently is instead of restarting it at the edge, which would make
      // it jump across the panel. Mirroring the progress and the direction
      // together keeps the band in the same place on screen, and the swap it
      // has already made is hidden under the characters as it passes back.
      progress = 1 - progress;
      const previousFrom = fromSlot;
      fromSlot = toSlot;
      toSlot = previousFrom;
      // Wrapped, so a long run of reversals cannot drift the angle.
      sweepAngle = (sweepAngle + 180) % 360;
      // Anchor the clock to the progress being resumed so the band keeps its
      // speed. The remaining travel then takes exactly as long as it should:
      // an immediate change of mind snaps back, a late one has further to go.
      sweepStart =
        performance.now() -
        easeInverse(progress) * Math.max(config.duration, 0.05) * 1000;
      sweepClockSet = true;
    } else {
      fromSlot = currentSlot;
      toSlot = target;
      progress = 0;
      sweepAngle = sweepOptions?.angle ?? config.angle;
      // Anchor on the first rendered frame instead, so the one-off cost of the
      // first paint and texture upload is not deducted from the animation.
      sweepClockSet = false;
    }

    currentSlot = target;
    sweeping = true;
    settleFrames = 0;
    fadingOut = false;
    active = 1;
    // Raise the destination panel now. Both panels are always captured, so the
    // textures for either side of the sweep are already valid.
    applyStacking(currentSlot);
    requestCapture(true);
    config.onSweepStart?.(target);
    start();
  }

  function onMotionChange() {
    reducedMotion = motionQuery.matches;
    start();
  }
  motionQuery.addEventListener("change", onMotionChange);

  let themeTimer = 0;
  function onThemeShift() {
    syncBacking();
    start();
    window.clearTimeout(themeTimer);
    themeTimer = window.setTimeout(() => {
      syncBacking();
      requestCapture();
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

  const resizeObserver = createCanvasResizeObserver(() => {
    if (syncCanvasSize()) requestCapture();
    start();
  });
  resizeObserver.observe(output);
  for (const state of states) resizeObserver.observe(state.content);

  const intersection = new IntersectionObserver((entries) => {
    visible = entries[entries.length - 1]?.isIntersecting ?? true;
    if (visible) start();
  });
  intersection.observe(output);

  // Keep both panels at the same scroll offset. The panel behind is inert, so
  // it never scrolls on its own, and a sweep would otherwise reveal the
  // incoming content at the top while the outgoing one sits further down.
  let syncingScroll = false;
  function onPanelScroll(event: Event) {
    if (syncingScroll || destroyed) return;
    const source = event.target as HTMLElement | null;
    if (!source) return;
    syncingScroll = true;
    for (const state of states) {
      if (state.content === source) continue;
      if (state.content.scrollTop !== source.scrollTop) {
        state.content.scrollTop = source.scrollTop;
      }
      if (state.content.scrollLeft !== source.scrollLeft) {
        state.content.scrollLeft = source.scrollLeft;
      }
    }
    syncingScroll = false;
    requestCapture();
    start();
  }
  for (const state of states) {
    state.content.addEventListener("scroll", onPanelScroll, { passive: true });
  }

  function onPageVisibility() {
    pageVisible = document.visibilityState !== "hidden";
    if (pageVisible) start();
  }
  document.addEventListener("visibilitychange", onPageVisibility);

  const contentObservers = htmlInCanvas
    ? []
    : states.map((state) => {
        const observer = new MutationObserver(() => queueCapture(state));
        observer.observe(state.content, {
          attributes: true,
          attributeFilter: ["class", "hidden", "src", "srcset", "style"],
          characterData: true,
          childList: true,
          subtree: true,
        });
        return observer;
      });

  function onFallbackVisualChange() {
    for (const state of states) queueCapture(state);
  }

  if (!htmlInCanvas) {
    for (const state of states) {
      state.content.addEventListener("load", onFallbackVisualChange, true);
      state.content.addEventListener(
        "loadeddata",
        onFallbackVisualChange,
        true,
      );
      state.content.addEventListener("input", onFallbackVisualChange, true);
      state.content.addEventListener("change", onFallbackVisualChange, true);
      state.content.addEventListener(
        "transitionend",
        onFallbackVisualChange,
        true,
      );
      state.content.addEventListener(
        "animationend",
        onFallbackVisualChange,
        true,
      );
    }
    document.fonts?.addEventListener("loadingdone", onFallbackVisualChange);
  }

  return {
    setOptions(next) {
      let changed = false;
      for (const [key, value] of Object.entries(next)) {
        if (typeof value === "function") continue;
        const prev = config[key as keyof typeof config];
        if (Array.isArray(value) && Array.isArray(prev)) {
          if (
            value.length !== prev.length ||
            value.some((item, i) => item !== prev[i])
          ) {
            changed = true;
            break;
          }
        } else if (prev !== value) {
          changed = true;
          break;
        }
      }
      Object.assign(config, next);
      if (!changed) return;
      syncBacking();
      start();
    },
    sweep,
    current: () => currentSlot,
    capture: () => {
      requestCapture(true);
      start();
    },
    resize() {
      syncCanvasSize();
      syncBacking();
      requestCapture();
      start();
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(themeTimer);
      resizeObserver.disconnect();
      intersection.disconnect();
      themeObserver.disconnect();
      for (const observer of contentObservers) observer.disconnect();
      schemeQuery.removeEventListener("change", onThemeShift);
      motionQuery.removeEventListener("change", onMotionChange);
      document.removeEventListener("visibilitychange", onPageVisibility);
      if (!htmlInCanvas) {
        for (const state of states) {
          state.content.removeEventListener("load", onFallbackVisualChange, true);
          state.content.removeEventListener(
            "loadeddata",
            onFallbackVisualChange,
            true,
          );
          state.content.removeEventListener(
            "input",
            onFallbackVisualChange,
            true,
          );
          state.content.removeEventListener(
            "change",
            onFallbackVisualChange,
            true,
          );
          state.content.removeEventListener(
            "transitionend",
            onFallbackVisualChange,
            true,
          );
          state.content.removeEventListener(
            "animationend",
            onFallbackVisualChange,
            true,
          );
        }
        document.fonts?.removeEventListener(
          "loadingdone",
          onFallbackVisualChange,
        );
      }
      for (const state of states) {
        state.content.removeEventListener("scroll", onPanelScroll);
        window.clearTimeout(state.captureTimer);
        window.clearTimeout(state.scrollTimer);
        state.texture?.destroy();
        if (htmlInCanvas) state.paintable.onpaint = null;
      }
      screen?.dispose();
    },
  };
}
