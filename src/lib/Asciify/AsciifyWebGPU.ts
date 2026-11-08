import { getCanvasPixelRatio, createCanvasResizeObserver } from "../canvas-viewport";
import { isHtmlInCanvasBlocked, prepareHtmlInCanvas, drawHtmlInCanvas } from "../html-in-canvas";
import {
  effect,
  frame as gpuFrame,
  init,
  sampler,
  surface,
  type Effect,
  type Gpu,
  type Surface,
} from "vgpu";
import type { Texture } from "vgpu";

export type AsciifyCharset = "ascii" | "blocks" | "binary";

export interface AsciifyOptions {
  /** Radius of the ascii lens around the cursor, relative to the screen height. */
  radius?: number;
  /** Edge feather of the lens as a fraction of the radius (0 to 1). */
  softness?: number;
  /** Size of one glyph pixel in CSS pixels. Characters are 5x5 glyph pixels. */
  scale?: number;
  /** Empty glyph pixels around each character (0 to 3). */
  spacing?: number;
  /** Built-in character ramp: real ascii glyphs, shade blocks, or binary digits. */
  charset?: AsciifyCharset;
  /** Custom ramp of packed 5x5 bitmaps (dark to bright), overrides charset. */
  glyphs?: number[];
  /** Paper color behind the glyphs as [r, g, b] in 0-1 range, or "auto" to match the page background. */
  background?: [number, number, number] | "auto";
  /** Opacity of the background behind the glyphs (0 to 1). */
  backgroundOpacity?: number;
  /** Contrast applied to character density before picking a glyph. */
  contrast?: number;
  /** Density offset applied before picking a glyph (-1 to 1). */
  brightness?: number;
  /** Invert character density inside the effect (0 to 1). */
  invert?: number;
  /** Coverage of asciified cells inside the lens (0 to 1). */
  strength?: number;
  /** Ascii coverage across the whole screen, outside the lens (0 to 1). */
  baseStrength?: number;
  /** How quickly the lens follows the cursor. Higher is snappier. */
  followSpeed?: number;
  /** Soft phosphor glow around the text dots (0 to 1). */
  glow?: number;
  /** Soft chromatic aberration toward the lens edge (0 to 1). */
  aberration?: number;
}

export interface AsciifyElements {
  /** Canvas with layoutsubtree that hosts the HTML content. */
  source: HTMLCanvasElement;
  /** The element inside the source canvas that gets captured. */
  content: HTMLElement;
  /** Canvas the WebGPU effect renders to. */
  output: HTMLCanvasElement;
}

export interface AsciifyInstance {
  /** Update effect options live. */
  setOptions: (options: AsciifyOptions) => void;
  /** Re-read canvas size. Call when the element is resized. */
  resize: () => void;
  /** Stop the loop and release all GPU resources. */
  destroy: () => void;
}

const CHARSETS: Record<AsciifyCharset, number[]> = {
  ascii: [
    0, 128, 131200, 14336, 459200, 469440, 4357252, 18157905, 11512810,
    15724526,
  ],
  blocks: [0, 328000, 22041621, 22369621, 11512810, 33554431],
  binary: [0, 4591758, 15324974],
};

const MAX_GLYPHS = 16;
const FALLBACK_CAPTURE_DELAY = 500;

const DEFAULTS: Required<AsciifyOptions> = {
  radius: 0.4,
  softness: 1,
  scale: 2,
  spacing: 1,
  charset: "ascii",
  glyphs: [],
  background: [0, 0, 0],
  backgroundOpacity: 0,
  contrast: 1,
  brightness: 0,
  invert: 0,
  strength: 1,
  baseStrength: 0,
  followSpeed: 3,
  glow: 0.75,
  aberration: 0.75,
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
  contentOffset: vec2f,
  resolution: vec2f,
  pointer: vec2f,
  bg: vec3f,
  glyphCount: i32,
  radius: f32,
  softness: f32,
  glyphPx: f32,
  spacing: f32,
  activeAmount: f32,
  backingLum: f32,
  bgOpacity: f32,
  lod: f32,
  contrast: f32,
  brightness: f32,
  invert: f32,
  strength: f32,
  baseStrength: f32,
  maxX: f32,
  dotPx: f32,
  dotLod: f32,
  glowAmt: f32,
  aberration: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var uContent: texture_2d<f32>;
@group(0) @binding(2) var uGlyphAtlas: texture_2d<f32>;
@group(0) @binding(3) var uTextMask: texture_2d<f32>;
@group(0) @binding(4) var uSampler: sampler;

fn glyphBit(index: i32, p: vec2i) -> f32 {
  if (p.x < 0 || p.x > 4 || p.y < 0 || p.y > 4) { return 0.0; }
  return textureLoad(uGlyphAtlas, vec2i(index * 5 + p.x, p.y), 0).r;
}

fn hash21(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
}

fn sampleFringe(texUv: vec2f, lod: f32, off: vec2f) -> vec4f {
  var c = textureSampleLevel(uContent, uSampler, texUv, lod);
  c.r = textureSampleLevel(uContent, uSampler, texUv + off, lod).r;
  c.b = textureSampleLevel(uContent, uSampler, texUv - off, lod).b;
  return c;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let bottomUv = vec2f(uv.x, 1.0 - uv.y);

  if (bottomUv.x > params.maxX) {
    return vec4f(0.0);
  }

  let cellPx = (5.0 + 2.0 * params.spacing) * params.glyphPx;
  let frag = bottomUv * params.resolution;
  let cell = floor(frag / cellPx);
  let cellUv = (cell + 0.5) * cellPx / params.resolution;

  let aspect = params.resolution.x / params.resolution.y;
  let dist = length((cellUv - params.pointer) * vec2f(aspect, 1.0));
  let radius = max(params.radius * params.activeAmount, 1e-4);
  let inner = radius * (1.0 - clamp(params.softness, 0.0, 1.0));
  let lens = (1.0 - smoothstep(inner, radius, dist)) * params.activeAmount;
  let mask = clamp(max(lens, clamp(params.baseStrength, 0.0, 1.0)), 0.0, 1.0)
    * clamp(params.strength, 0.0, 1.0);

  let apply = select(step(hash21(cell), mask), 0.0, mask < 0.003);

  if (apply < 0.5) {
    return vec4f(0.0);
  }

  let textureUv = vec2f(cellUv.x, 1.0 - cellUv.y) + params.contentOffset;
  if (textureUv.x < 0.001 || textureUv.x > params.maxX - 0.002 || textureUv.y < 0.001 || textureUv.y > 0.999) {
    return vec4f(0.0);
  }

  let lensDir = (cellUv - params.pointer) * vec2f(aspect, 1.0);
  let fringeAmp = max(params.activeAmount, smoothstep(0.0, 0.25, params.baseStrength));
  var fringe = normalize(lensDir + vec2f(1e-5))
    * clamp(params.aberration, 0.0, 1.0) * 0.005
    * smoothstep(params.radius * 0.15, params.radius, dist) * fringeAmp;
  fringe = vec2f(fringe.x / aspect, -fringe.y);

  let textness = textureSampleLevel(uTextMask, uSampler, vec2f(cellUv.x, 1.0 - cellUv.y), 0.0).r;

  if (textness > 0.4) {
    let dotIdx = floor(frag / params.dotPx);
    let dotUv = (dotIdx + 0.5) * params.dotPx / params.resolution;
    let flippedUv = clamp(
      vec2f(dotUv.x, 1.0 - dotUv.y) + params.contentOffset,
      vec2f(0.001), vec2f(params.maxX - 0.002, 0.999));
    let ink = sampleFringe(flippedUv, params.dotLod, fringe);
    let inkLum = dot(ink.rgb, vec3f(0.299, 0.587, 0.114));
    var density = abs(inkLum - params.backingLum);
    density = clamp((density - 0.5) * params.contrast + 0.5 + params.brightness, 0.0, 1.0);
    density = mix(density, 1.0 - density, clamp(params.invert, 0.0, 1.0));
    let d = length(frag - (dotIdx + 0.5) * params.dotPx) / (params.dotPx * 0.5);
    let reach = sqrt(density);
    let on = (1.0 - smoothstep(reach - 0.3, reach + 0.2, d)) * step(0.03, density);
    let inkColor = clamp(
      params.bg + (ink.rgb - params.bg) / max(abs(inkLum - params.backingLum), 0.2),
      vec3f(0.0), vec3f(1.0));
    let soft = sampleFringe(flippedUv, params.dotLod + 2.5, fringe);
    let softLum = dot(soft.rgb, vec3f(0.299, 0.587, 0.114));
    let halo = clamp(abs(softLum - params.backingLum) * 2.2, 0.0, 1.0)
      * clamp(params.glowAmt, 0.0, 1.0) * 0.55;
    let haloColor = clamp(
      params.bg + (soft.rgb - params.bg) / max(abs(softLum - params.backingLum), 0.2),
      vec3f(0.0), vec3f(1.0));
    let col = mix(haloColor, inkColor, on);
    let alpha = ink.a
      * max(mix(clamp(params.bgOpacity, 0.0, 1.0), 1.0, on), halo * (1.0 - on));
    return vec4f(col * alpha, alpha);
  }

  let pixel = sampleFringe(textureUv, params.lod, fringe);

  let lum = dot(pixel.rgb, vec3f(0.299, 0.587, 0.114));
  var amount = abs(lum - params.backingLum);
  amount = clamp((amount - 0.5) * params.contrast + 0.5 + params.brightness, 0.0, 1.0);
  amount = mix(amount, 1.0 - amount, clamp(params.invert, 0.0, 1.0));

  let glyphCount = max(params.glyphCount, 1);
  let index = min(i32(amount * f32(glyphCount)), glyphCount - 1);

  let local = vec2i(floor((frag - cell * cellPx) / params.glyphPx));
  let pad = i32(params.spacing);
  let on = glyphBit(index, vec2i(local.x - pad, local.y - pad));

  let glyphColor = clamp(
    params.bg + (pixel.rgb - params.bg) / max(abs(lum - params.backingLum), 0.2),
    vec3f(0.0), vec3f(1.0));
  let col = mix(params.bg, glyphColor, on);
  let alpha = pixel.a * mix(clamp(params.bgOpacity, 0.0, 1.0), 1.0, on);
  return vec4f(col * alpha, alpha);
}`;

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

/** One WebGPU device per page, shared by every Asciify instance. */
function acquireGpu(): Promise<Gpu> {
  if (!sharedGpu) {
    sharedGpu = init().catch((error) => {
      sharedGpu = null;
      throw error;
    });
  }
  return sharedGpu;
}

export function createAsciify(
  elements: AsciifyElements,
  options: AsciifyOptions = {},
): AsciifyInstance | null {
  if (!supportsWebGPU()) return null;
  try {
    return initializeAsciify(elements, options);
  } catch (error) {
    console.error("Asciify initialization failed:", error);
    return null;
  }
}

function initializeAsciify(
  elements: AsciifyElements,
  options: AsciifyOptions,
): AsciifyInstance | null {
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

  let destroyed = false;
  let contentDirty = false;
  let wake = () => {};
  let fallbackSource: HTMLCanvasElement | null = null;
  let fallbackCaptureTimer = 0;
  let fallbackCaptureDeadline = 0;
  let fallbackScrollCaptureTimer = 0;
  let capturedScrollLeft = 0;
  let capturedScrollTop = 0;
  let fallbackErrorLogged = false;
  let textureUploadErrorLogged = false;
  let fallback2d: CanvasRenderingContext2D | null = null;

  if (htmlInCanvas) {
    paintable.onpaint = () => {
      try {
        sourceCtx!.reset();
        drawHtmlInCanvas(source, sourceCtx!, content);
        contentDirty = true;
        scheduleTextMask();
        wake();
      } catch {}
    };
  }

  function queueFallbackCapture(immediate = false) {
    if (htmlInCanvas || destroyed) return;
    const delay = immediate ? 0 : FALLBACK_CAPTURE_DELAY;
    const deadline = performance.now() + delay;
    if (fallbackCaptureTimer && fallbackCaptureDeadline <= deadline) return;
    window.clearTimeout(fallbackCaptureTimer);
    fallbackCaptureDeadline = deadline;
    fallbackCaptureTimer = window.setTimeout(captureFallback, delay);
  }

  function captureFallback() {
    window.clearTimeout(fallbackCaptureTimer);
    window.clearTimeout(fallbackScrollCaptureTimer);
    fallbackCaptureTimer = 0;
    fallbackScrollCaptureTimer = 0;
    try {
      paintFallbackSnapshot(content, source, getCanvasPixelRatio(output));
      if (destroyed) return;
      fallbackSource = source;
      capturedScrollLeft = content.scrollLeft;
      capturedScrollTop = content.scrollTop;
      contentDirty = true;
      fallbackErrorLogged = false;
      scheduleTextMask();
      wake();
    } catch (error) {
      if (!destroyed && !fallbackErrorLogged) {
        fallbackErrorLogged = true;
        console.warn("Asciify could not capture its HTML fallback:", error);
      }
    }
  }

  let gpu: Gpu | null = null;
  let screen: Surface | null = null;
  let fx: Effect | null = null;
  let linearSampler: GPUSampler | null = null;
  let mipmapLayout: GPUBindGroupLayout | null = null;
  let mipmapPipeline: GPURenderPipeline | null = null;
  let contentTexture: Texture | null = null;
  let textMaskTexture: Texture | null = null;
  let glyphAtlasTexture: Texture | null = null;
  let contentMaxX = 1;
  let dprNow = 1;

  const MASK_SCALE = 0.25;
  const maskCanvas = document.createElement("canvas");
  const maskCtx = maskCanvas.getContext("2d");
  let maskDirty = false;
  let maskTimer = 0;
  let maskStamp = 0;

  function buildTextMask() {
    if (!maskCtx) return;
    const bounds = output.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds.width * MASK_SCALE));
    const height = Math.max(1, Math.round(bounds.height * MASK_SCALE));
    if (maskCanvas.width !== width || maskCanvas.height !== height) {
      maskCanvas.width = width;
      maskCanvas.height = height;
    }
    maskCtx.clearRect(0, 0, width, height);
    maskCtx.fillStyle = "#fff";
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
    const range = document.createRange();
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (!node.textContent?.trim()) continue;
      const parent = node.parentElement;
      if (!parent || (parent.checkVisibility && !parent.checkVisibility())) {
        continue;
      }
      range.selectNodeContents(node);
      const rects = range.getClientRects();
      for (let i = 0; i < rects.length; i++) {
        const r = rects[i];
        if (r.width < 1 || r.height < 1) continue;
        if (r.bottom < bounds.top || r.top > bounds.bottom) continue;
        maskCtx.fillRect(
          (r.left - bounds.left - 1) * MASK_SCALE,
          (r.top - bounds.top - 1) * MASK_SCALE,
          (r.width + 2) * MASK_SCALE,
          (r.height + 2) * MASK_SCALE,
        );
      }
    }
    const fields = content.querySelectorAll("input, textarea, select");
    for (let i = 0; i < fields.length; i++) {
      const r = fields[i].getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      if (r.bottom < bounds.top || r.top > bounds.bottom) continue;
      maskCtx.fillRect(
        (r.left - bounds.left) * MASK_SCALE,
        (r.top - bounds.top) * MASK_SCALE,
        r.width * MASK_SCALE,
        r.height * MASK_SCALE,
      );
    }
    maskDirty = true;
  }

  function scheduleTextMask() {
    if (maskTimer) return;
    const wait = Math.max(0, 120 - (performance.now() - maskStamp));
    maskTimer = window.setTimeout(() => {
      maskTimer = 0;
      maskStamp = performance.now();
      buildTextMask();
      start();
    }, wait);
  }

  function syncCanvasSize(): boolean {
    let changed = false;
    const dpr = getCanvasPixelRatio(output);
    dprNow = dpr;
    const width = Math.max(1, Math.round(output.clientWidth * dpr));
    const height = Math.max(1, Math.round(output.clientHeight * dpr));
    if (screen) {
      const [w, h] = screen.size;
      if (w !== width || h !== height) {
        screen.resize([width, height]);
        changed = true;
      }
    } else if (output.width !== width || output.height !== height) {
      output.width = width;
      output.height = height;
      changed = true;
    }
    contentMaxX = Math.min(
      1,
      Math.max(0.05, content.clientWidth / Math.max(output.clientWidth, 1)),
    );
    if (htmlInCanvas) {
      const sourceWidth = Math.max(1, Math.round(source.clientWidth * dpr));
      const sourceHeight = Math.max(1, Math.round(source.clientHeight * dpr));
      if (
        source.width !== sourceWidth ||
        source.height !== sourceHeight
      ) {
        source.width = sourceWidth;
        source.height = sourceHeight;
        changed = true;
      }
      paintable.requestPaint!();
    }
    return changed;
  }

  syncCanvasSize();

  let backingRgb: [number, number, number] = [1, 1, 1];
  let backingLum = 1;
  const probe = document.createElement("canvas");
  probe.width = probe.height = 1;
  const probeCtx = probe.getContext("2d", { willReadFrequently: true });

  function syncBacking() {
    backingRgb = [1, 1, 1];
    if (probeCtx) {
      let el: Element | null = content;
      while (el) {
        const bg = getComputedStyle(el).backgroundColor;
        if (bg && bg !== "transparent") {
          probeCtx.clearRect(0, 0, 1, 1);
          probeCtx.fillStyle = bg;
          probeCtx.fillRect(0, 0, 1, 1);
          const [r, g, b, a] = probeCtx.getImageData(0, 0, 1, 1).data;
          if (a > 0) {
            backingRgb = [r / 255, g / 255, b / 255];
            break;
          }
        }
        el = el.parentElement;
      }
    }
    backingLum =
      0.299 * backingRgb[0] + 0.587 * backingRgb[1] + 0.114 * backingRgb[2];
  }

  syncBacking();

  const pointer = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, active: 0, target: 0 };
  const glyphData = new Uint32Array(MAX_GLYPHS);
  const glyphAtlasCanvas = document.createElement("canvas");
  glyphAtlasCanvas.width = MAX_GLYPHS * 5;
  glyphAtlasCanvas.height = 5;
  const glyphAtlasCtx = glyphAtlasCanvas.getContext("2d");
  let glyphAtlasDirty = true;

  function resolveGlyphs(): number {
    const ramp =
      config.glyphs.length > 1
        ? config.glyphs
        : (CHARSETS[config.charset] ?? CHARSETS.ascii);
    const count = Math.min(ramp.length, MAX_GLYPHS);
    let dirty = glyphAtlasDirty;
    for (let i = count; i < MAX_GLYPHS; i++) {
      dirty ||= glyphData[i] !== 0;
      glyphData[i] = 0;
    }
    for (let i = 0; i < count; i++) {
      const value = ramp[i] >>> 0;
      dirty ||= glyphData[i] !== value;
      glyphData[i] = value;
    }
    glyphAtlasDirty = dirty;
    return count;
  }

  function mipLevelCountFor(width: number, height: number): number {
    return Math.floor(Math.log2(Math.max(width, height))) + 1;
  }

  function ensureContentTexture(): Texture {
    const bitmap = htmlInCanvas ? source : fallbackSource;
    const w = Math.max(1, bitmap?.width ?? source.width ?? 1);
    const h = Math.max(1, bitmap?.height ?? source.height ?? 1);
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
        label: "asciify.content",
      });
    }
    return contentTexture;
  }

  function ensureMipmapPipeline(): GPURenderPipeline | null {
    if (!gpu || !linearSampler) return null;
    if (!mipmapLayout) {
      mipmapLayout = gpu.gpu.createBindGroupLayout({
        label: "asciify.mipmap.layout",
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
        label: "asciify.mipmap",
        code: MIPMAP_SHADER,
      });
      mipmapPipeline = gpu.gpu.createRenderPipeline({
        label: "asciify.mipmap",
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
    const encoder = gpu.gpu.createCommandEncoder({ label: "asciify.mipmap" });
    for (let level = 1; level < texture.mipLevelCount; level++) {
      const bindGroup = gpu.gpu.createBindGroup({
        label: "asciify.mipmap",
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
        label: "asciify.mipmap",
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

  function ensureMaskTexture(): Texture {
    const w = Math.max(1, maskCanvas.width || 1);
    const h = Math.max(1, maskCanvas.height || 1);
    if (
      !textMaskTexture ||
      textMaskTexture.size[0] !== w ||
      textMaskTexture.size[1] !== h
    ) {
      // A new wrapper invalidates vgpu's cached bindings to the old texture.
      textMaskTexture?.destroy();
      textMaskTexture = gpu!.device.createTexture({
        size: [w, h],
        format: "rgba8unorm",
        usage: ["texture_binding", "copy_dst", "render_attachment"],
        label: "asciify.text-mask",
      });
    }
    return textMaskTexture;
  }

  function ensureGlyphAtlasTexture(): Texture {
    if (!glyphAtlasTexture) {
      glyphAtlasTexture = gpu!.device.createTexture({
        size: [glyphAtlasCanvas.width, glyphAtlasCanvas.height],
        format: "rgba8unorm",
        usage: ["texture_binding", "copy_dst", "render_attachment"],
        label: "asciify.glyph-atlas",
      });
    }
    return glyphAtlasTexture;
  }

  function uploadGlyphAtlas() {
    if (!gpu || !fx || !glyphAtlasDirty || !glyphAtlasCtx) return;
    glyphAtlasDirty = false;
    glyphAtlasCtx.clearRect(0, 0, glyphAtlasCanvas.width, glyphAtlasCanvas.height);
    glyphAtlasCtx.fillStyle = "#fff";
    for (let index = 0; index < MAX_GLYPHS; index++) {
      const bits = glyphData[index];
      for (let y = 0; y < 5; y++) {
        for (let x = 0; x < 5; x++) {
          if ((bits >> ((4 - x) + 5 * y)) & 1) {
            glyphAtlasCtx.fillRect(index * 5 + x, y, 1, 1);
          }
        }
      }
    }
    const texture = ensureGlyphAtlasTexture();
    gpu.gpu.queue.copyExternalImageToTexture(
      { source: glyphAtlasCanvas },
      { texture: texture.gpu },
      [glyphAtlasCanvas.width, glyphAtlasCanvas.height],
    );
    fx.set({ uGlyphAtlas: texture });
  }

  function uploadContent() {
    if (!gpu || !fx || !contentDirty) return;
    const bitmap = htmlInCanvas ? source : fallbackSource;
    if (!bitmap) return;
    contentDirty = false;
    try {
      const texture = ensureContentTexture();
      gpu.gpu.queue.copyExternalImageToTexture(
        { source: bitmap },
        { texture: texture.gpu, mipLevel: 0 },
        [Math.max(1, bitmap.width), Math.max(1, bitmap.height)],
      );
      generateMipmaps(texture);
      fx.set({ uContent: texture });
      textureUploadErrorLogged = false;
    } catch (error) {
      if (!textureUploadErrorLogged) {
        textureUploadErrorLogged = true;
        console.warn("Asciify could not upload its content texture:", error);
      }
    }
  }

  function uploadMask() {
    if (!gpu || !fx || !maskDirty) return;
    maskDirty = false;
    const texture = ensureMaskTexture();
    gpu.gpu.queue.copyExternalImageToTexture(
      { source: maskCanvas },
      { texture: texture.gpu },
      [Math.max(1, maskCanvas.width), Math.max(1, maskCanvas.height)],
    );
    fx.set({ uTextMask: texture });
  }

  function render() {
    if (!gpu || !fx || !screen) return;
    uploadContent();
    uploadMask();
    const dpr = dprNow;
    const glyphCss = Math.max(config.scale, 0.5);
    const dotCss = Math.max(1.25, glyphCss * 0.75);
    const texelsPerCss = htmlInCanvas
      ? dpr
      : source.width / Math.max(content.clientWidth, 1);
    const spacing = Math.round(Math.min(Math.max(config.spacing, 0), 3));
    const glyphCount = resolveGlyphs();
    uploadGlyphAtlas();
    const bg = config.background === "auto" ? backingRgb : config.background;
    const [width, height] = screen.size;
    fx.set({
      params: {
        contentOffset: [
          htmlInCanvas
            ? 0
            : (content.scrollLeft - capturedScrollLeft) /
                Math.max(content.clientWidth, 1),
          htmlInCanvas
            ? 0
            : (content.scrollTop - capturedScrollTop) /
                Math.max(content.clientHeight, 1),
        ],
        resolution: [width, height],
        glyphPx: glyphCss * dpr,
        spacing,
        glyphCount,
        radius: Math.max(config.radius, 0.01),
        softness: config.softness,
        pointer: [pointer.x, pointer.y],
        activeAmount: pointer.active,
        bg,
        backingLum,
        bgOpacity: config.backgroundOpacity,
        lod: Math.max(0, Math.log2((5 + 2 * spacing) * glyphCss) - 1),
        contrast: Math.max(config.contrast, 0),
        brightness: config.brightness,
        invert: config.invert,
        strength: config.strength,
        baseStrength: config.baseStrength,
        maxX: contentMaxX,
        dotPx: dotCss * dpr,
        dotLod: Math.max(
          0,
          Math.log2((dotCss * Math.max(texelsPerCss, 0.25)) / dpr) - 1,
        ),
        glowAmt: config.glow,
        aberration: config.aberration,
      },
    });
    gpuFrame(gpu, (f) => f.pass(screen!, fx!));
  }

  function renderFallback() {
    if (!fallback2d) return;
    const bitmap = htmlInCanvas ? source : fallbackSource;
    if (!bitmap) return;
    if (!contentDirty && !htmlInCanvas) return;
    contentDirty = false;
    fallback2d.clearRect(0, 0, output.width, output.height);
    fallback2d.drawImage(bitmap, 0, 0, output.width, output.height);
  }

  let raf = 0;
  let lastTime = performance.now();
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
    const ease = reducedMotion
      ? 1
      : 1 - Math.exp(-delta * Math.max(config.followSpeed, 0.5));
    pointer.x += (pointer.tx - pointer.x) * ease;
    pointer.y += (pointer.ty - pointer.y) * ease;
    pointer.active += (pointer.target - pointer.active) * ease;
    const settled =
      Math.abs(pointer.tx - pointer.x) < 5e-4 &&
      Math.abs(pointer.ty - pointer.y) < 5e-4 &&
      Math.abs(pointer.target - pointer.active) < 1e-3;
    if (settled) {
      pointer.x = pointer.tx;
      pointer.y = pointer.ty;
      pointer.active = pointer.target;
    }
    render();
    if (settled && !contentDirty) {
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
        label: "asciify",
      });
      linearSampler = sampler(gpu, {
        minFilter: "linear",
        magFilter: "linear",
        mipmapFilter: "linear",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
      });
      buildTextMask();
      fx = effect(gpu, SHADER, {
        label: "asciify",
        set: {
          uSampler: linearSampler,
          uContent: ensureContentTexture(),
          uGlyphAtlas: ensureGlyphAtlasTexture(),
          uTextMask: ensureMaskTexture(),
        },
      });
      generateMipmaps(ensureContentTexture());
      syncCanvasSize();
      if (htmlInCanvas) paintable.requestPaint!();
      start();
    })
    .catch((error) => {
      if (destroyed) return;
      console.warn("Asciify: WebGPU unavailable, showing content without the effect.", error);
      fallback2d = output.getContext("2d");
      contentDirty = true;
      queueFallbackCapture(true);
      start();
    });

  queueFallbackCapture(true);
  start();

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
      queueFallbackCapture();
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

  let outputRect = output.getBoundingClientRect();
  const refreshOutputRect = () => {
    outputRect = output.getBoundingClientRect();
  };

  const observer = createCanvasResizeObserver(() => {
    refreshOutputRect();
    if (syncCanvasSize()) queueFallbackCapture();
    start();
  });
  observer.observe(output);
  observer.observe(content);
  window.addEventListener("resize", refreshOutputRect, { passive: true });
  window.addEventListener("scroll", refreshOutputRect, {
    capture: true,
    passive: true,
  });

  const intersection = new IntersectionObserver((entries) => {
    visible = entries[entries.length - 1]?.isIntersecting ?? true;
    if (visible) start();
  });
  intersection.observe(output);

  const listenTarget = output.parentElement ?? output;

  const contentObserver = htmlInCanvas
    ? null
    : new MutationObserver(() => queueFallbackCapture());
  contentObserver?.observe(content, {
    attributes: true,
    attributeFilter: ["class", "hidden", "src", "srcset", "style"],
    characterData: true,
    childList: true,
    subtree: true,
  });

  function onContentScroll() {
    if (htmlInCanvas || destroyed) return;
    window.clearTimeout(fallbackScrollCaptureTimer);
    fallbackScrollCaptureTimer = window.setTimeout(
      captureFallback,
      FALLBACK_CAPTURE_DELAY,
    );
    start();
  }
  function onFallbackVisualChange() {
    queueFallbackCapture();
  }
  if (!htmlInCanvas) {
    content.addEventListener("scroll", onContentScroll, {
      capture: true,
      passive: true,
    });
    content.addEventListener("load", onFallbackVisualChange, true);
    content.addEventListener("loadeddata", onFallbackVisualChange, true);
    content.addEventListener("focusin", onFallbackVisualChange, true);
    content.addEventListener("focusout", onFallbackVisualChange, true);
    content.addEventListener("input", onFallbackVisualChange, true);
    content.addEventListener("change", onFallbackVisualChange, true);
    content.addEventListener("transitionend", onFallbackVisualChange, true);
    content.addEventListener("transitioncancel", onFallbackVisualChange, true);
    content.addEventListener("animationend", onFallbackVisualChange, true);
    document.fonts?.addEventListener("loadingdone", onFallbackVisualChange);
  }

  function onPointerMove(event: PointerEvent) {
    pointer.tx =
      (event.clientX - outputRect.left) / Math.max(outputRect.width, 1);
    pointer.ty =
      1 - (event.clientY - outputRect.top) / Math.max(outputRect.height, 1);
    pointer.target = 1;
    queueFallbackCapture();
    start();
  }

  function onPointerLeave() {
    pointer.target = 0;
    queueFallbackCapture();
    start();
  }

  listenTarget.addEventListener("pointermove", onPointerMove, { passive: true });
  listenTarget.addEventListener("pointerleave", onPointerLeave, { passive: true });
  content.addEventListener("scroll", scheduleTextMask, {
    capture: true,
    passive: true,
  });

  return {
    setOptions(next) {
      let changed = false;
      for (const [key, value] of Object.entries(next)) {
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
      if (!changed) {
        Object.assign(config, next);
        return;
      }
      Object.assign(config, next);
      syncBacking();
      scheduleTextMask();
      start();
    },
    resize() {
      syncCanvasSize();
      syncBacking();
      queueFallbackCapture();
      scheduleTextMask();
      start();
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(themeTimer);
      window.clearTimeout(fallbackCaptureTimer);
      window.clearTimeout(fallbackScrollCaptureTimer);
      window.clearTimeout(maskTimer);
      observer.disconnect();
      window.removeEventListener("resize", refreshOutputRect);
      window.removeEventListener("scroll", refreshOutputRect, true);
      intersection.disconnect();
      themeObserver.disconnect();
      contentObserver?.disconnect();
      schemeQuery.removeEventListener("change", onThemeShift);
      motionQuery.removeEventListener("change", onMotionChange);
      listenTarget.removeEventListener("pointermove", onPointerMove);
      listenTarget.removeEventListener("pointerleave", onPointerLeave);
      content.removeEventListener("scroll", onContentScroll, true);
      content.removeEventListener("scroll", scheduleTextMask, {
        capture: true,
      });
      content.removeEventListener("load", onFallbackVisualChange, true);
      content.removeEventListener("loadeddata", onFallbackVisualChange, true);
      content.removeEventListener("focusin", onFallbackVisualChange, true);
      content.removeEventListener("focusout", onFallbackVisualChange, true);
      content.removeEventListener("input", onFallbackVisualChange, true);
      content.removeEventListener("change", onFallbackVisualChange, true);
      content.removeEventListener(
        "transitionend",
        onFallbackVisualChange,
        true,
      );
      content.removeEventListener(
        "transitioncancel",
        onFallbackVisualChange,
        true,
      );
      content.removeEventListener("animationend", onFallbackVisualChange, true);
      document.fonts?.removeEventListener(
        "loadingdone",
        onFallbackVisualChange,
      );
      contentTexture?.destroy();
      textMaskTexture?.destroy();
      glyphAtlasTexture?.destroy();
      screen?.dispose();
      if (htmlInCanvas) paintable.onpaint = null;
    },
  };
}
