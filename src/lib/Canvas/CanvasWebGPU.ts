import { getCanvasPixelRatio, createCanvasResizeObserver } from "../canvas-viewport";
import { isHtmlInCanvasBlocked, prepareHtmlInCanvas, drawHtmlInCanvas } from "../html-in-canvas";
import {
  effect,
  frame as gpuFrame,
  init,
  sampler,
  surface,
  target as gpuTarget,
  type Effect,
  type Gpu,
  type Surface,
  type Target,
} from "vgpu";
import type { Texture } from "vgpu";

export interface CanvasOptions {
  /** Height of one woven thread in CSS pixels. */
  threadSize?: number;
  /** Width of the dark seams between threads (0 to 1). */
  threadWidth?: number;
  /** How strongly the woven texture shades the paint (0 to 1). */
  texture?: number;
  /** Canvas paper color as [r, g, b] in 0-1 range. */
  tint?: [number, number, number];
  /** How much the paper color warms the painting (0 to 1). */
  tintStrength?: number;
  /** Amount of photographic grain worked into the paint (0 to 1). */
  grain?: number;
  /** Amount of dotted halftone screen applied to the painting (0 to 1). */
  halftone?: number;
  /** Size of the halftone screen dots in CSS pixels. */
  dotSize?: number;
  /** Overall mix between the raw page (0) and the painting (1). */
  strength?: number;
  /** How far wet paint stands off the weave, lit in 3D (0 to 1). */
  relief?: number;
  /** Sheen on fresh paint. Wet strokes catch the light, dry ones go matte (0 to 1). */
  gloss?: number;
  /** Definition of the bristle grooves combed through each stroke (0 to 1). */
  bristle?: number;
  /** Seconds a stroke takes to level back into the canvas. */
  dry?: number;
  /** Radius of the brush, relative to the screen height. */
  radius?: number;
  /** Duration of the intro fade-in of the painting effect in seconds. 0 skips it. */
  intro?: number;
  /** How quickly the brush follows the cursor. Higher is snappier. */
  followSpeed?: number;
}

export interface CanvasElements {
  /** Canvas with layoutsubtree that hosts the HTML content. */
  source: HTMLCanvasElement;
  /** The element inside the source canvas that gets captured. */
  content: HTMLElement;
  /** Canvas the WebGPU effect renders to. */
  output: HTMLCanvasElement;
}

export interface CanvasInstance {
  /** Update effect options live. */
  setOptions: (options: CanvasOptions) => void;
  /** Re-read canvas size. Call when the element is resized. */
  resize: () => void;
  /** Stop the loop and release all GPU resources. */
  destroy: () => void;
}

const DEFAULTS: Required<CanvasOptions> = {
  threadSize: 2,
  threadWidth: 0.2,
  texture: 1,
  tint: [0.84, 0.81, 0.75],
  tintStrength: 0,
  grain: 0.5,
  halftone: 0.1,
  dotSize: 6,
  strength: 1,
  relief: 0.45,
  gloss: 0.35,
  bristle: 0.4,
  dry: 2.5,
  radius: 0.08,
  intro: 1.6,
  followSpeed: 3,
};

type PaintableCanvas = HTMLCanvasElement & {
  onpaint?: (() => void) | null;
  requestPaint?: () => void;
};

type ElementImageContext = CanvasRenderingContext2D & {
  drawElementImage?: (element: Element, x: number, y: number) => void;
};

const PAINT_SHADER = /* wgsl */ `
struct Params {
  texel: vec2f,
  shift: vec2f,
  point: vec2f,
  prevPoint: vec2f,
  aspect: f32,
  radius: f32,
  deposit: f32,
  bristle: f32,
  level: f32,
  decay: f32,
  dryRate: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var uState: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

fn stateAt(p: vec2f) -> vec4f {
  return textureSampleLevel(uState, uSampler, vec2f(p.x, 1.0 - p.y), 0.0);
}

fn sdSegment(p: vec2f, a: vec2f, b: vec2f) -> f32 {
  let pa = p - a;
  let ba = b - a;
  let h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let vUv = vec2f(uv.x, 1.0 - uv.y);
  let src = vUv + params.shift;
  let inside =
    step(0.0, src.x) * step(src.x, 1.0) *
    step(0.0, src.y) * step(src.y, 1.0);
  let prev = stateAt(src);
  var h = prev.r * inside;
  var wet = prev.g * inside;

  var around =
    stateAt(src + vec2f(params.texel.x, 0.0)).r +
    stateAt(src - vec2f(params.texel.x, 0.0)).r +
    stateAt(src + vec2f(0.0, params.texel.y)).r +
    stateAt(src - vec2f(0.0, params.texel.y)).r;
  around *= 0.25 * inside;

  h = mix(h, around, params.level * (0.15 + 0.85 * wet));
  h *= params.decay;
  wet *= params.dryRate;

  let p = vUv * vec2f(params.aspect, 1.0);
  let a = params.prevPoint * vec2f(params.aspect, 1.0);
  let b = params.point * vec2f(params.aspect, 1.0);
  let r = max(params.radius, 1e-4);
  let d = sdSegment(p, a, b);

  var dome = 1.0 - smoothstep(r * 0.2, r, d);
  dome *= dome;
  let lip = (1.0 - smoothstep(r * 0.55, r, d)) * smoothstep(r * 0.1, r * 0.6, d);

  let travel = b - a;
  let len = length(travel);
  let axis = select(vec2f(1.0, 0.0), travel / len, len > 1e-5);
  let perp = vec2f(-axis.y, axis.x);
  let across = dot(p - a, perp) / r;
  let comb = 0.5 + 0.5 * cos(across * 18.0);
  let bristle = mix(1.0, 0.3 + 0.7 * comb, clamp(params.bristle, 0.0, 1.0));

  let add = (dome + lip * 0.55) * bristle * params.deposit;
  h = clamp(h + add, 0.0, 1.0);
  wet = clamp(max(wet, add * 5.0), 0.0, 1.0);

  return vec4f(h, wet, 0.0, 1.0);
}`;

const FINAL_SHADER = /* wgsl */ `
struct Params {
  tint: vec4f,
  resolution: vec2f,
  paintTexel: vec2f,
  scroll: vec2f,
  threadSize: f32,
  threadWidth: f32,
  textureAmount: f32,
  tintStrength: f32,
  grain: f32,
  halftone: f32,
  dotSize: f32,
  strength: f32,
  relief: f32,
  gloss: f32,
  intro: f32,
  maxX: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var uContent: texture_2d<f32>;
@group(0) @binding(2) var uTextMask: texture_2d<f32>;
@group(0) @binding(3) var uPaint: texture_2d<f32>;
@group(0) @binding(4) var uSampler: sampler;

fn paintAt(p: vec2f) -> vec4f {
  return textureSampleLevel(uPaint, uSampler, vec2f(p.x, 1.0 - p.y), 0.0);
}

fn S(a: f32, b: f32, t: f32) -> f32 {
  return smoothstep(a, b, t);
}

fn mod1(x: f32, y: f32) -> f32 {
  return x - y * floor(x / y);
}

fn hash(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453123);
}

fn threadedEdges(st: vec2f, width: f32) -> f32 {
  return 1.0 - S(0.0, width, st.x) + S(1.0 - width, 1.0, st.x);
}

fn ovalGradient(st: vec2f, radius: f32) -> f32 {
  return S(radius - 0.1, radius + 0.9, 1.0 - length(st - vec2f(0.5)));
}

fn weave(frag: vec2f) -> vec2f {
  var st = frag / max(params.threadSize, 1.0);
  st = vec2f(st.x * 0.5, st.y);
  if (mod1(floor(st.y), 2.0) == 1.0) {
    st = vec2f(st.x - 0.5, st.y);
  }
  let f = fract(st);
  let edges = threadedEdges(f, max(params.threadWidth, 0.001));
  let bump = ovalGradient(f, 0.5);
  let shade = clamp(1.0 - edges * 0.4 + bump * 0.22, 0.45, 1.3);
  return vec2f(shade, bump);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  if (uv.x > params.maxX) {
    return vec4f(0.0);
  }

  let bUv = vec2f(uv.x, 1.0 - uv.y);
  let textness = textureSampleLevel(uTextMask, uSampler, uv, 0.0).r;

  let paintState = paintAt(bUv).rg;
  let thickness = paintState.r;
  let wetness = paintState.g;
  let hL = paintAt(bUv - vec2f(params.paintTexel.x, 0.0)).r;
  let hR = paintAt(bUv + vec2f(params.paintTexel.x, 0.0)).r;
  let hD = paintAt(bUv - vec2f(0.0, params.paintTexel.y)).r;
  let hU = paintAt(bUv + vec2f(0.0, params.paintTexel.y)).r;
  let slope = vec2f(hR - hL, hU - hD) * 0.5;

  let relief = clamp(params.relief, 0.0, 1.0);
  let parallax = -slope * relief * 0.08 * (1.0 - textness);
  var contentUv = vec2f(bUv.x + parallax.x, 1.0 - bUv.y - parallax.y);
  contentUv = clamp(contentUv, vec2f(0.0), vec2f(params.maxX, 1.0));

  let content = textureSampleLevel(uContent, uSampler, contentUv, 0.0);
  let frag = bUv * params.resolution;
  let cloth = frag + params.scroll;

  let fiber = weave(cloth);
  let grainN = hash(floor(cloth));

  let dotPx = max(params.dotSize, 2.0);
  let rot = mat2x2f(0.7071, -0.7071, 0.7071, 0.7071);
  let inv = mat2x2f(0.7071, 0.7071, -0.7071, 0.7071);
  let hFrag = rot * cloth;
  let hCenter = (floor(hFrag / dotPx) + vec2f(0.5)) * dotPx;
  let hLocal = (hFrag - hCenter) / dotPx;
  let hUvBottom = (inv * hCenter - params.scroll) / params.resolution;
  let hUv = clamp(vec2f(hUvBottom.x, 1.0 - hUvBottom.y), vec2f(0.001), vec2f(params.maxX - 0.002, 0.999));
  let cellPix = textureSampleLevel(uContent, uSampler, hUv, 0.0);
  let cellLum = dot(cellPix.rgb, vec3f(0.299, 0.587, 0.114));

  var crisp = 0.0;
  if (textness > 0.4) {
    let fineLum = dot(content.rgb, vec3f(0.299, 0.587, 0.114));
    if (abs(fineLum - cellLum) > 0.08) {
      crisp = 1.0;
    }
  }

  let dotR = (1.0 - cellLum) * 0.55 + (grainN - 0.5) * params.grain * 0.12;
  let dotMask = 1.0 - S(dotR - 0.12, dotR + 0.12, length(hLocal));
  let ink = cellPix.rgb * 0.35;
  let between = mix(cellPix.rgb, vec3f(1.0), 0.55);
  let screened = mix(between, ink, dotMask);

  var paint = content.rgb;
  let halftoneAmt = clamp(params.halftone, 0.0, 1.0) * (1.0 - 0.85 * crisp);
  paint = mix(paint, screened, halftoneAmt);

  var texAmt = clamp(params.textureAmount, 0.0, 1.0) * (1.0 - 0.6 * crisp);
  texAmt *= 1.0 - 0.55 * thickness * relief;
  paint *= mix(1.0, fiber.x, texAmt);

  let tintMax = max(params.tint.r, max(params.tint.g, params.tint.b));
  let tintMul = params.tint.rgb / max(tintMax, 0.001);
  let tintAmt = clamp(params.tintStrength, 0.0, 1.0) * (1.0 - 0.5 * crisp);
  paint *= mix(vec3f(1.0), tintMul, tintAmt);

  paint *= 1.0 + (grainN - 0.5) * params.grain * (0.35 - 0.25 * crisp);

  let nrm = normalize(vec3f(-slope * relief * 18.0, 1.0));
  let lightDir = normalize(vec3f(-0.55, 0.62, 0.56));
  let presence = S(0.0, 0.12, thickness);
  let diffuse = clamp(dot(nrm, lightDir), 0.0, 1.0);
  let shade = (diffuse - lightDir.z) * 1.15 * (1.0 - 0.45 * crisp);
  paint *= clamp(1.0 + shade, 0.55, 1.7);

  let halfVec = normalize(lightDir + vec3f(0.0, 0.0, 1.0));
  var spec = pow(clamp(dot(nrm, halfVec), 0.0, 1.0), 48.0);
  spec = max(spec - pow(clamp(halfVec.z, 0.0, 1.0), 48.0), 0.0);
  let sheen = clamp(params.gloss, 0.0, 1.0) * (0.3 + 0.7 * wetness) * presence;
  paint += spec * sheen * 1.6 * (1.0 - 0.5 * crisp);

  let amt = clamp(params.strength, 0.0, 1.0) * clamp(params.intro, 0.0, 1.0);
  let col = mix(content.rgb, paint, amt);
  let alpha = mix(content.a, 1.0, amt);
  return vec4f(col * alpha, alpha);
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

/** One WebGPU device per page, shared by every Canvas instance. */
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
  return {
    get current() {
      return element.getBoundingClientRect();
    },
    destroy() {},
  };
}

const MASK_SCALE = 0.25;
const PAINT_SCALE = 0.5;
const PAINT_MAX = 1024;

export function createCanvas(
  elements: CanvasElements,
  options: CanvasOptions = {},
): CanvasInstance | null {
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
  let wake = () => {};

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

  let gpu: Gpu | null = null;
  let screen: Surface | null = null;
  let paintFx: Effect | null = null;
  let finalFx: Effect | null = null;
  let contentTexture: Texture | null = null;
  let textMaskTexture: Texture | null = null;
  let paintRead: Target | null = null;
  let paintWrite: Target | null = null;
  let fallback2d: CanvasRenderingContext2D | null = null;

  let paintWidth = 0;
  let paintHeight = 0;

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
        label: "canvas.content",
      });
    }
    return contentTexture;
  }

  function ensureTextMaskTexture(): Texture {
    const w = Math.max(1, maskCanvas.width);
    const h = Math.max(1, maskCanvas.height);
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
        label: "canvas.text-mask",
      });
    }
    return textMaskTexture;
  }

  function clearTarget(t: Target) {
    if (!gpu) return;
    gpuFrame(gpu, (f) => f.pass({ target: t, clear: [0, 0, 0, 0] }, () => {}));
  }

  function releaseTarget(t: Target | null) {
    if (!t) return;
    (t as unknown as { destroy(): void }).destroy();
  }

  function syncPaintTargets() {
    if (!gpu) return;
    const scale = Math.min(
      1,
      PAINT_MAX / Math.max(output.clientWidth, output.clientHeight, 1),
    );
    const width = Math.max(
      1,
      Math.round(output.clientWidth * PAINT_SCALE * scale),
    );
    const height = Math.max(
      1,
      Math.round(output.clientHeight * PAINT_SCALE * scale),
    );
    if (width === paintWidth && height === paintHeight) return;
    releaseTarget(paintRead);
    releaseTarget(paintWrite);
    paintWidth = width;
    paintHeight = height;
    paintRead = gpuTarget(gpu, {
      size: [width, height],
      format: "rgba16float",
      clearColor: [0, 0, 0, 0],
      label: "canvas.paint-read",
    });
    paintWrite = gpuTarget(gpu, {
      size: [width, height],
      format: "rgba16float",
      clearColor: [0, 0, 0, 0],
      label: "canvas.paint-write",
    });
    clearTarget(paintRead);
    clearTarget(paintWrite);
    paintSeeded = false;
  }

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

  let contentMaxX = 1;

  function syncCanvasSize() {
    const dpr = getCanvasPixelRatio(output);
    const width = Math.max(1, Math.round(output.clientWidth * dpr));
    const height = Math.max(1, Math.round(output.clientHeight * dpr));
    if (screen) {
      const [w, h] = screen.size;
      if (w !== width || h !== height) screen.resize([width, height]);
    } else if (output.width !== width || output.height !== height) {
      output.width = width;
      output.height = height;
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
      }
      paintable.requestPaint!();
    }
    syncPaintTargets();
  }

  syncCanvasSize();

  const pointer = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, active: 0, target: 0 };
  let prevPaintX = 0.5;
  let prevPaintY = 0.5;
  let lastPaintScrollX = 0;
  let lastPaintScrollY = 0;
  let paintSeeded = false;
  let activeUntil = 0;

  let introStart = -1;
  let contentReady = false;
  let introDone = false;

  function introProgress(now: number): number {
    if (!contentReady) {
      introDone = !htmlInCanvas;
      return 0;
    }
    if (config.intro <= 0 || reducedMotion) {
      introDone = true;
      return 1;
    }
    const p = Math.min((now - introStart) / (config.intro * 1000), 1);
    if (p >= 1) introDone = true;
    return p * p * (3 - 2 * p);
  }

  function uploadContent() {
    if (!htmlInCanvas || !contentDirty || !gpu || !finalFx) return;
    contentDirty = false;
    const texture = ensureContentTexture();
    gpu.gpu.queue.copyExternalImageToTexture(
      { source },
      { texture: texture.gpu },
      [source.width, source.height],
    );
    finalFx.set({ uContent: texture });
    if (!contentReady) {
      contentReady = true;
      introStart = performance.now();
    }
  }

  function uploadMask() {
    if (!maskDirty || !gpu || !finalFx) return;
    maskDirty = false;
    const texture = ensureTextMaskTexture();
    gpu.gpu.queue.copyExternalImageToTexture(
      { source: maskCanvas },
      { texture: texture.gpu },
      [maskCanvas.width, maskCanvas.height],
    );
    finalFx.set({ uTextMask: texture });
  }

  function stepPaint(delta: number, now: number) {
    if (!paintRead || !paintWrite || !paintFx) return;
    const cssW = Math.max(output.clientWidth, 1);
    const cssH = Math.max(output.clientHeight, 1);
    const scrollX = content.scrollLeft;
    const scrollY = content.scrollTop;
    if (!paintSeeded) {
      lastPaintScrollX = scrollX;
      lastPaintScrollY = scrollY;
      prevPaintX = pointer.x;
      prevPaintY = pointer.y;
      paintSeeded = true;
    }

    const dry = Math.max(config.dry, 0.05);
    const travel = Math.hypot(pointer.x - prevPaintX, pointer.y - prevPaintY);
    const stroke = Math.min(travel / Math.max(config.radius * 0.6, 1e-4), 1.5);
    const painting =
      pointer.active > 0.02 && config.relief > 0.001 && !reducedMotion;
    const deposit = painting ? Math.min(stroke * 0.32, 0.45) : 0;
    if (deposit > 1e-4) activeUntil = now + dry * 1000 + 400;

    paintFx.set({
      uState: paintRead,
      params: {
        texel: [1 / paintWidth, 1 / paintHeight],
        shift: [
          (scrollX - lastPaintScrollX) / cssW,
          -(scrollY - lastPaintScrollY) / cssH,
        ],
        point: [pointer.x, pointer.y],
        prevPoint: [prevPaintX, prevPaintY],
        aspect: cssW / cssH,
        radius: Math.max(config.radius, 0.005),
        deposit,
        bristle: config.bristle,
        level: 1 - Math.exp(-delta * 2),
        decay: Math.exp((-delta / dry) * 3),
        dryRate: Math.exp((-delta / (dry * 0.6)) * 3),
      },
    });
    paintFx.draw(paintWrite);

    const swap = paintRead;
    paintRead = paintWrite;
    paintWrite = swap;
    lastPaintScrollX = scrollX;
    lastPaintScrollY = scrollY;
    prevPaintX = pointer.x;
    prevPaintY = pointer.y;
  }

  function render(now: number) {
    if (!gpu || !screen || !finalFx || !paintRead) return;
    uploadContent();
    uploadMask();
    const dpr = output.width / Math.max(output.clientWidth, 1);
    finalFx.set({
      uPaint: paintRead,
      params: {
        tint: [config.tint[0], config.tint[1], config.tint[2], 0],
        resolution: [output.width, output.height],
        paintTexel: [
          1 / Math.max(paintWidth, 1),
          1 / Math.max(paintHeight, 1),
        ],
        scroll: [content.scrollLeft * dpr, -content.scrollTop * dpr],
        threadSize: Math.max(config.threadSize, 1) * dpr,
        threadWidth: config.threadWidth,
        textureAmount: config.texture,
        tintStrength: config.tintStrength,
        grain: config.grain,
        halftone: config.halftone,
        dotSize: Math.max(config.dotSize, 1.5) * dpr,
        strength: config.strength,
        relief: config.relief,
        gloss: config.gloss,
        intro: introProgress(now),
        maxX: contentMaxX,
      },
    });
    gpuFrame(gpu, (f) => f.pass(screen!, finalFx!));
  }

  function renderFallback() {
    if (!fallback2d || !htmlInCanvas || !contentDirty) return;
    contentDirty = false;
    fallback2d.clearRect(0, 0, output.width, output.height);
    fallback2d.drawImage(source, 0, 0, output.width, output.height);
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
    const ease = reducedMotion
      ? 1
      : 1 - Math.exp(-delta * Math.max(config.followSpeed, 0.5));
    pointer.x += (pointer.tx - pointer.x) * ease;
    pointer.y += (pointer.ty - pointer.y) * ease;
    pointer.active += (pointer.target - pointer.active) * ease;
    stepPaint(delta, now);
    render(now);
    const drying = now < activeUntil;
    const settled =
      Math.abs(pointer.tx - pointer.x) < 5e-4 &&
      Math.abs(pointer.ty - pointer.y) < 5e-4 &&
      Math.abs(pointer.target - pointer.active) < 1e-3 &&
      introDone &&
      !drying;
    if (settled && !contentDirty) {
      pointer.x = pointer.tx;
      pointer.y = pointer.ty;
      pointer.active = pointer.target;
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
        label: "canvas",
      });
      const linear = sampler(gpu, {
        minFilter: "linear",
        magFilter: "linear",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
      });
      if (maskCanvas.width < 1 || maskCanvas.height < 1) {
        maskCanvas.width = 1;
        maskCanvas.height = 1;
      }
      syncCanvasSize();
      paintFx = effect(gpu, PAINT_SHADER, {
        label: "canvas.paint",
        set: { uSampler: linear, uState: paintRead! },
      });
      finalFx = effect(gpu, FINAL_SHADER, {
        label: "canvas.final",
        set: {
          uSampler: linear,
          uContent: ensureContentTexture(),
          uTextMask: ensureTextMaskTexture(),
          uPaint: paintRead!,
        },
      });
      start();
    })
    .catch((error) => {
      if (destroyed) return;
      console.warn("Canvas: WebGPU unavailable, showing content without the effect.", error);
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
    scheduleTextMask();
    start();
  });
  observer.observe(output);
  observer.observe(content);

  const intersection = new IntersectionObserver((entries) => {
    visible = entries[entries.length - 1]?.isIntersecting ?? true;
    if (visible) start();
  });
  intersection.observe(output);

  const listenTarget = output.parentElement ?? output;
  const rectCache = createRectCache(output);

  function onPointerMove(event: PointerEvent) {
    const rect = rectCache.current;
    pointer.tx = (event.clientX - rect.left) / Math.max(rect.width, 1);
    pointer.ty = 1 - (event.clientY - rect.top) / Math.max(rect.height, 1);
    pointer.target = 1;
    start();
  }

  function onPointerLeave() {
    pointer.target = 0;
    start();
  }

  function onScroll() {
    scheduleTextMask();
    start();
  }

  listenTarget.addEventListener("pointermove", onPointerMove, { passive: true });
  listenTarget.addEventListener("pointerleave", onPointerLeave, { passive: true });
  content.addEventListener("scroll", onScroll, {
    capture: true,
    passive: true,
  });
  scheduleTextMask();

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
      Object.assign(config, next);
      if (!changed) return;
      scheduleTextMask();
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
      window.clearTimeout(maskTimer);
      observer.disconnect();
      intersection.disconnect();
      motionQuery.removeEventListener("change", onMotionChange);
      listenTarget.removeEventListener("pointermove", onPointerMove);
      listenTarget.removeEventListener("pointerleave", onPointerLeave);
      content.removeEventListener("scroll", onScroll, {
        capture: true,
      });
      contentTexture?.destroy();
      textMaskTexture?.destroy();
      releaseTarget(paintRead);
      releaseTarget(paintWrite);
      paintRead = null;
      paintWrite = null;
      screen?.dispose();
      if (htmlInCanvas) paintable.onpaint = null;
    },
  };
}
