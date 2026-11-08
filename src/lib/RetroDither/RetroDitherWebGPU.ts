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

export interface RetroDitherOptions {
  /** Radius of the dither lens around the cursor, relative to the screen height. */
  radius?: number;
  /** Edge feather of the lens as a fraction of the radius (0 to 1). */
  softness?: number;
  /** Size of the retro pixels in CSS pixels. */
  pixelSize?: number;
  /** Number of brightness levels the dither quantizes to. */
  levels?: number;
  /** Dark end of the palette as [r, g, b] in 0-1 range. */
  darkColor?: [number, number, number];
  /** Light end of the palette as [r, g, b] in 0-1 range. */
  lightColor?: [number, number, number];
  /** Blend from the content's own colors (0) to the palette (1). */
  colorize?: number;
  /** Contrast applied to brightness before dithering. */
  contrast?: number;
  /** Brightness offset applied before dithering (-1 to 1). */
  brightness?: number;
  /** Coverage of the dithered pixels inside the lens (0 to 1). */
  strength?: number;
  /** Dither coverage across the whole screen, outside the lens (0 to 1). */
  baseStrength?: number;
  /** Invert brightness inside the effect (0 to 1). */
  invert?: number;
  /** Intensity of the retro scanline overlay (0 to 1). */
  scanlines?: number;
  /** Dither pattern used for intermediate levels. */
  pattern?: "bayer" | "halftone" | "hatch" | "dash";
  /** Phosphor burn-in: the lens leaves a fading ghost along the cursor path (0 to 1). */
  trail?: number;
  /** Strength of the degauss ripple triggered on click (0 to 1). */
  degauss?: number;
  /** How quickly the lens follows the cursor. Higher is snappier. */
  followSpeed?: number;
}

export interface RetroDitherElements {
  /** Canvas with layoutsubtree that hosts the HTML content. */
  source: HTMLCanvasElement;
  /** The element inside the source canvas that gets captured. */
  content: HTMLElement;
  /** Canvas the WebGPU effect renders to. */
  output: HTMLCanvasElement;
}

export interface RetroDitherInstance {
  /** Update effect options live. */
  setOptions: (options: RetroDitherOptions) => void;
  /** Re-read canvas size. Call when the element is resized. */
  resize: () => void;
  /** Stop the loop and release all GPU resources. */
  destroy: () => void;
}

const DEFAULTS: Required<RetroDitherOptions> = {
  radius: 0.5,
  softness: 1,
  pixelSize: 2,
  levels: 4,
  darkColor: [0, 0, 0],
  lightColor: [1, 1, 1],
  colorize: 0.1,
  contrast: 0.6,
  brightness: 0,
  strength: 0.75,
  baseStrength: 0,
  invert: 0,
  scanlines: 0,
  pattern: "bayer",
  trail: 0.4,
  degauss: 0.8,
  followSpeed: 3,
};

const PATTERNS = { bayer: 0, halftone: 1, hatch: 2, dash: 3 } as const;
const TRAIL_N = 24;
const RIPPLE_N = 3;

type PaintableCanvas = HTMLCanvasElement & {
  onpaint?: (() => void) | null;
  requestPaint?: () => void;
};

type ElementImageContext = CanvasRenderingContext2D & {
  drawElementImage?: (element: Element, x: number, y: number) => void;
};

type RectCache = {
  readonly current: DOMRect;
  destroy: () => void;
};

function createRectCache(element: Element): RectCache {
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

const SHADER = /* wgsl */ `
struct Params {
  trail: array<vec4f, 24>,
  ripples: array<vec4f, 3>,
  resolution: vec2f,
  pointer: vec2f,
  darkColor: vec3f,
  lightColor: vec3f,
  pixelSize: f32,
  levels: f32,
  radius: f32,
  softness: f32,
  activeAmount: f32,
  colorize: f32,
  contrast: f32,
  brightness: f32,
  strength: f32,
  baseAmount: f32,
  invertAmount: f32,
  scanlines: f32,
  maxX: f32,
  patternType: u32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var uContent: texture_2d<f32>;
@group(0) @binding(2) var uTextMask: texture_2d<f32>;
@group(0) @binding(3) var uSampler: sampler;

fn S(a: f32, b: f32, t: f32) -> f32 { return smoothstep(a, b, t); }
fn mod1(x: f32, y: f32) -> f32 { return x - y * floor(x / y); }

fn topUv(uv: vec2f) -> vec2f { return vec2f(uv.x, 1.0 - uv.y); }

fn bayer(p0: vec2i) -> f32 {
  let p = vec2i((p0.x % 4 + 4) % 4, (p0.y % 4 + 4) % 4);
  let b = array<i32, 16>(0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  let idx = u32(p.y * 4 + p.x);
  return (f32(b[idx]) + 0.5) / 16.0;
}

fn patternThreshold(cell: vec2i) -> f32 {
  if (params.patternType == 1u) {
    let cp = vec2i((cell.x % 4 + 4) % 4, (cell.y % 4 + 4) % 4);
    let p = vec2f(cp) - vec2f(1.5);
    return clamp(length(p) / 2.6, 0.03, 0.97);
  }
  if (params.patternType == 2u) {
    return fract(f32(cell.x + cell.y) * 0.25 + 0.125);
  }
  if (params.patternType == 3u) {
    return fract(f32(cell.x) * 0.25 + f32((cell.y % 2 + 2) % 2) * 0.5 + 0.125);
  }
  return bayer(cell);
}

fn ditherQuant(v: f32, cell: vec2i) -> f32 {
  let x = v * params.levels;
  return floor(x + step(patternThreshold(cell), fract(x))) / params.levels;
}

@fragment fn fs_main(@location(0) inUv: vec2f) -> @location(0) vec4f {
  var uv = vec2f(inUv.x, 1.0 - inUv.y);

  if (uv.x > params.maxX) {
    return vec4f(0.0);
  }

  let aspect = params.resolution.x / params.resolution.y;

  var rippleReveal = 0.0;
  var rippleWarp = vec2f(0.0);
  for (var i = 0u; i < 3u; i++) {
    let rp = params.ripples[i];
    let amp = rp.w;
    if (amp <= 0.001) { continue; }
    let toUv = (uv - rp.xy) * vec2f(aspect, 1.0);
    let d = length(toUv);
    let band = exp(-pow((d - rp.z) / 0.07, 2.0)) * amp;
    rippleReveal = max(rippleReveal, band);
    rippleWarp += normalize(toUv + vec2f(1e-5)) * band * 0.012 / vec2f(aspect, 1.0);
  }
  uv = clamp(uv + rippleWarp, vec2f(0.0), vec2f(params.maxX, 1.0));

  let content = textureSampleLevel(uContent, uSampler, topUv(uv), 0.0);

  let frag = uv * params.resolution;
  let cell = floor(frag / params.pixelSize);
  var cellUv = (cell + vec2f(0.5)) * params.pixelSize / params.resolution;
  cellUv = clamp(cellUv, vec2f(0.001), vec2f(params.maxX - 0.002, 0.999));
  var pixel = textureSampleLevel(uContent, uSampler, topUv(cellUv), 0.0);
  var rawLum = dot(pixel.rgb, vec3f(0.299, 0.587, 0.114));

  let textness = textureSampleLevel(uTextMask, uSampler, topUv(uv), 0.0).r;
  var crisp = 0.0;
  if (textness > 0.4) {
    let px = max(params.pixelSize * 0.25, 1.0);
    var fineUv = (floor(frag / px) + vec2f(0.5)) * px / params.resolution;
    fineUv = clamp(fineUv, vec2f(0.001), vec2f(params.maxX - 0.002, 0.999));
    let fine = textureSampleLevel(uContent, uSampler, topUv(fineUv), 0.0);
    let fineLum = dot(fine.rgb, vec3f(0.299, 0.587, 0.114));
    if (abs(fineLum - rawLum) > 0.1) {
      crisp = 1.0;
      pixel = fine;
      rawLum = fineLum;
    }
  }

  let contrastAmt = mix(params.contrast, max(params.contrast, 0.5), crisp);
  let brightAmt = params.brightness * mix(1.0, 0.3, crisp);
  var lum = clamp((rawLum - 0.5) * contrastAmt + 0.5 + brightAmt, 0.0, 1.0);
  lum = mix(lum, 1.0 - lum, clamp(params.invertAmount, 0.0, 1.0));
  let q = select(
    ditherQuant(lum, vec2i(cell)),
    clamp(floor(lum * params.levels + 0.5) / params.levels, 0.0, 1.0),
    crisp > 0.5);

  let palette = mix(params.darkColor, params.lightColor, q);
  let keepHue = pixel.rgb * (q / max(lum, 0.001));
  var dithered = mix(keepHue, palette, clamp(params.colorize, 0.0, 1.0));
  let scanAmp = mix(0.45, 0.15, crisp);
  dithered *= 1.0 - params.scanlines * scanAmp * mod1(cell.y, 2.0);
  dithered *= 1.0 + rippleReveal * vec3f(0.22, -0.06, 0.3);

  let dist = length((uv - params.pointer) * vec2f(aspect, 1.0));
  let radius = max(params.radius * params.activeAmount, 1e-4);
  let inner = radius * (1.0 - clamp(params.softness, 0.0, 1.0));
  let lens = (1.0 - S(inner, radius, dist)) * params.activeAmount;

  var ghost = 0.0;
  for (var i = 0u; i < 24u; i++) {
    let tp = params.trail[i];
    let amp = tp.z;
    if (amp <= 0.001) { continue; }
    let td = length((uv - tp.xy) * vec2f(aspect, 1.0));
    let tr = max(params.radius * 0.8, 1e-4);
    ghost = max(ghost, (1.0 - S(tr * 0.2, tr, td)) * amp);
  }

  var mask = clamp(max(max(lens, ghost), clamp(params.baseAmount, 0.0, 1.0)), 0.0, 1.0)
    * clamp(params.strength, 0.0, 1.0);
  mask = clamp(max(mask, rippleReveal), 0.0, 1.0);

  let apply = step(bayer(vec2i(cell)), mask);

  let col = mix(content.rgb, dithered, apply);
  let alpha = mix(content.a, pixel.a, apply);
  return vec4f(col, alpha);
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

/** One WebGPU device per page, shared by every RetroDither instance. */
function acquireGpu(): Promise<Gpu> {
  if (!sharedGpu) {
    sharedGpu = init().catch((error) => {
      sharedGpu = null;
      throw error;
    });
  }
  return sharedGpu;
}

export function createRetroDither(
  elements: RetroDitherElements,
  options: RetroDitherOptions = {},
): RetroDitherInstance | null {
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
  let fx: Effect | null = null;
  let contentTexture: Texture | null = null;
  let textMaskTexture: Texture | null = null;
  let fallback2d: CanvasRenderingContext2D | null = null;

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
  }

  syncCanvasSize();

  const pointer = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, active: 0, target: 0 };

  const trailData: [number, number, number, number][] = Array.from(
    { length: TRAIL_N },
    () => [0, 0, 0, 0],
  );
  const trailPts: { x: number; y: number; t: number }[] = [];
  const rippleData: [number, number, number, number][] = Array.from(
    { length: RIPPLE_N },
    () => [0, 0, 0, 0],
  );
  const ripples: { x: number; y: number; t: number }[] = [];
  let fxAlive = false;

  function updateEffects(nowS: number) {
    fxAlive = false;
    if (config.trail > 0.001 && pointer.active > 0.1 && !reducedMotion) {
      const last = trailPts[trailPts.length - 1];
      if (!last || nowS - last.t >= 0.04) {
        trailPts.push({ x: pointer.x, y: pointer.y, t: nowS });
        if (trailPts.length > TRAIL_N) trailPts.shift();
      }
    }
    for (const slot of trailData) slot.fill(0);
    for (let i = trailPts.length - 1; i >= 0; i--) {
      const p = trailPts[i];
      const age = nowS - p.t;
      const fade = Math.min(Math.max((0.95 - age) / 0.25, 0), 1);
      const s = config.trail * Math.exp(-age * 2.2) * fade;
      if (s < 0.005) {
        trailPts.splice(0, i + 1);
        break;
      }
      trailData[i][0] = p.x;
      trailData[i][1] = p.y;
      trailData[i][2] = s;
      fxAlive = true;
    }
    for (const slot of rippleData) slot.fill(0);
    for (let i = ripples.length - 1; i >= 0; i--) {
      if (nowS - ripples[i].t > 0.9) ripples.splice(i, 1);
    }
    for (let i = 0; i < ripples.length && i < RIPPLE_N; i++) {
      const age = nowS - ripples[i].t;
      rippleData[i][0] = ripples[i].x;
      rippleData[i][1] = ripples[i].y;
      rippleData[i][2] = age * 1.2;
      rippleData[i][3] = config.degauss * (1 - age / 0.9);
      fxAlive = true;
    }
  }

  function ensureContentTexture(): Texture {
    const width = Math.max(1, source.width);
    const height = Math.max(1, source.height);
    if (
      !contentTexture ||
      contentTexture.size[0] !== width ||
      contentTexture.size[1] !== height
    ) {
      // A new wrapper invalidates vgpu's cached bindings to the old texture.
      contentTexture?.destroy();
      contentTexture = gpu!.device.createTexture({
        size: [width, height],
        format: "rgba8unorm",
        usage: ["texture_binding", "copy_dst", "render_attachment"],
        label: "retro-dither.content",
      });
    }
    return contentTexture;
  }

  function ensureTextMaskTexture(): Texture {
    const width = Math.max(1, maskCanvas.width);
    const height = Math.max(1, maskCanvas.height);
    if (
      !textMaskTexture ||
      textMaskTexture.size[0] !== width ||
      textMaskTexture.size[1] !== height
    ) {
      // A new wrapper invalidates vgpu's cached bindings to the old texture.
      textMaskTexture?.destroy();
      textMaskTexture = gpu!.device.createTexture({
        size: [width, height],
        format: "rgba8unorm",
        usage: ["texture_binding", "copy_dst", "render_attachment"],
        label: "retro-dither.text-mask",
      });
    }
    return textMaskTexture;
  }

  function uploadContent() {
    if (!htmlInCanvas || !contentDirty || !gpu) return;
    contentDirty = false;
    const texture = ensureContentTexture();
    gpu.gpu.queue.copyExternalImageToTexture(
      { source },
      { texture: texture.gpu },
      [source.width, source.height],
    );
    fx!.set({ uContent: texture });
  }

  function uploadMask() {
    if (!maskDirty || !gpu) return;
    maskDirty = false;
    const texture = ensureTextMaskTexture();
    gpu.gpu.queue.copyExternalImageToTexture(
      { source: maskCanvas },
      { texture: texture.gpu },
      [maskCanvas.width, maskCanvas.height],
    );
    fx!.set({ uTextMask: texture });
  }

  function render() {
    if (!gpu || !fx || !screen) return;
    uploadContent();
    uploadMask();
    const dpr = output.width / Math.max(output.clientWidth, 1);
    fx.set({
      params: {
        trail: trailData,
        ripples: rippleData,
        resolution: [output.width, output.height],
        pixelSize: Math.max(config.pixelSize, 1) * dpr,
        levels: Math.max(config.levels, 1),
        radius: Math.max(config.radius, 0.01),
        softness: config.softness,
        pointer: [pointer.x, pointer.y],
        activeAmount: pointer.active,
        darkColor: config.darkColor,
        lightColor: config.lightColor,
        colorize: config.colorize,
        contrast: Math.max(config.contrast, 0),
        brightness: config.brightness,
        strength: config.strength,
        baseAmount: config.baseStrength,
        invertAmount: config.invert,
        scanlines: config.scanlines,
        patternType: PATTERNS[config.pattern] ?? 0,
        maxX: contentMaxX,
      },
    });
    gpuFrame(gpu, (f) => f.pass(screen!, fx!));
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
    updateEffects(now / 1000);
    render();
    const settled =
      Math.abs(pointer.tx - pointer.x) < 5e-4 &&
      Math.abs(pointer.ty - pointer.y) < 5e-4 &&
      Math.abs(pointer.target - pointer.active) < 1e-3 &&
      !fxAlive;
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
        label: "retro-dither",
      });
      const linear = sampler(gpu, {
        minFilter: "linear",
        magFilter: "linear",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
      });
      fx = effect(gpu, SHADER, {
        label: "retro-dither",
        set: {
          uSampler: linear,
          uContent: ensureContentTexture(),
          uTextMask: ensureTextMaskTexture(),
        },
      });
      syncCanvasSize();
      start();
    })
    .catch((error) => {
      if (destroyed) return;
      console.warn("RetroDither: WebGPU unavailable, showing content without the effect.", error);
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

  function onPointerDown(event: PointerEvent) {
    if (reducedMotion || config.degauss <= 0.001) return;
    const rect = rectCache.current;
    ripples.push({
      x: (event.clientX - rect.left) / Math.max(rect.width, 1),
      y: 1 - (event.clientY - rect.top) / Math.max(rect.height, 1),
      t: performance.now() / 1000,
    });
    if (ripples.length > RIPPLE_N) ripples.shift();
    start();
  }

  listenTarget.addEventListener("pointermove", onPointerMove, { passive: true });
  listenTarget.addEventListener("pointerleave", onPointerLeave, { passive: true });
  listenTarget.addEventListener("pointerdown", onPointerDown, { passive: true });
  content.addEventListener("scroll", scheduleTextMask, {
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
      listenTarget.removeEventListener("pointerdown", onPointerDown);
      content.removeEventListener("scroll", scheduleTextMask, {
        capture: true,
      });
      contentTexture?.destroy();
      textMaskTexture?.destroy();
      screen?.dispose();
      if (htmlInCanvas) paintable.onpaint = null;
    },
  };
}
