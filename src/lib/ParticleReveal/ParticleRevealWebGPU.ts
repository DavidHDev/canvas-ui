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

export interface ParticleRevealOptions {
  /** Reveal radius around the cursor in CSS pixels. */
  radius?: number;
  /** Feather of the reveal edge as a fraction of the radius (0 to 1). */
  softness?: number;
  /** Particle grain size in CSS pixels. */
  size?: number;
  /** How far grains wander from their home pixel in CSS pixels. Bright content spawns the farthest specks. */
  scatter?: number;
  /** Speed of the idle grain shimmer (0 freezes the dust). */
  drift?: number;
  /** Chromatic aberration strength at the reveal edge in CSS pixels. */
  aberration?: number;
  /** How strongly unrevealed content smears around the reveal edge in CSS pixels. */
  bend?: number;
  /** How strongly dust specks stand out from the background (0 to 1). */
  fade?: number;
  /** Contrast against the background above which a pixel counts as UI and dissolves into dust. Pixels close to the background color are left untouched. */
  threshold?: number;
  /** Color of the backdrop behind the content, as any CSS color. Used to tell UI pixels apart from empty space. */
  background?: string;
  /** Seconds the reveal takes to catch up with the cursor. Higher feels more damped. */
  smoothing?: number;
}

export interface ParticleRevealElements {
  /** Canvas with layoutsubtree that hosts the HTML content. */
  source: HTMLCanvasElement;
  /** The element inside the source canvas that gets captured. */
  content: HTMLElement;
  /** Canvas the WebGPU effect renders to. */
  output: HTMLCanvasElement;
}

export interface ParticleRevealInstance {
  /** Update effect options live. */
  setOptions: (options: ParticleRevealOptions) => void;
  /** Re-read canvas size. Call when the element is resized. */
  resize: () => void;
  /** Stop the loop and release all GPU resources. */
  destroy: () => void;
}

const DEFAULTS: Required<ParticleRevealOptions> = {
  radius: 500,
  softness: 0.75,
  size: 1,
  scatter: 25,
  drift: 1,
  aberration: 40,
  bend: 50,
  fade: 0.85,
  threshold: 0.1,
  background: "#000000",
  smoothing: 0.25,
};

type PaintableCanvas = HTMLCanvasElement & {
  onpaint?: (() => void) | null;
  requestPaint?: () => void;
};

type ElementImageContext = CanvasRenderingContext2D & {
  drawElementImage?: (element: Element, x: number, y: number) => void;
};

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

const SHADER = /* wgsl */ `
struct Params {
  bg: vec4f,
  res: vec2f,
  outputRes: vec2f,
  pointer: vec2f,
  dpr: f32,
  revealActive: f32,
  radius: f32,
  softness: f32,
  size: f32,
  scatter: f32,
  drift: f32,
  aberration: f32,
  bend: f32,
  fade: f32,
  threshold: f32,
  time: f32,
  maxX: f32,
  crisp: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var uContent: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

fn hash(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.x, p.y, p.x) * 0.1031);
  p3 += vec3f(dot(p3, p3.yzx + vec3f(33.33)));
  return fract((p3.x + p3.y) * p3.z);
}

fn samp(p: vec2f) -> vec4f {
  let uv = clamp(
    p / params.res,
    vec2f(0.001),
    vec2f(params.maxX - 0.001, 0.999),
  );
  return textureSampleLevel(uContent, uSampler, uv, 0.0);
}

fn premul(c: vec4f) -> vec4f {
  return vec4f(c.rgb * c.a, c.a);
}

@fragment fn fs_main(
  @location(0) uv: vec2f,
  @builtin(position) position: vec4f,
) -> @location(0) vec4f {
  // vgpu's uv is top-origin, matching the page texture and the WebGL pUv.
  let pc = uv * params.res;
  if (pc.x > params.maxX * params.res.x) {
    return vec4f(0.0);
  }
  if (params.crisp > 0.5) {
    return premul(samp(pc));
  }

  let dist = length(pc - params.pointer);
  let radius = max(params.radius, 1.0);
  let inner = radius * (1.0 - clamp(params.softness, 0.02, 1.0));
  let e = (1.0 - smoothstep(inner, radius, dist)) * params.revealActive;

  let band = radius * 0.9;
  let ring = smoothstep(inner, radius, dist)
    * (1.0 - smoothstep(radius, radius + band, dist))
    * params.revealActive;

  let dir = (pc - params.pointer) / max(dist, 1e-3);
  let tang = vec2f(-dir.y, dir.x);
  let warp = (dir * -1.0 + tang * 0.6) * params.bend * ring;
  let ca = params.aberration * ring;

  let cellPx = max(params.size, 0.5) * params.dpr;
  let glFragCoord = vec2f(position.x, params.outputRes.y - position.y);
  let cell = floor(glFragCoord / cellPx);
  let n1 = hash(cell);
  let n2 = hash(cell + vec2f(3.1, 7.7));
  let n3 = hash(cell + vec2f(9.3, 1.3));
  let ft = floor(params.time * (2.0 + params.drift * 6.0));
  let n4 = hash(cell + vec2f(ft * 0.613, ft * 0.831));

  let g0 = params.threshold * 0.6;
  let g1 = params.threshold * 1.6 + 0.01;
  let lw = vec3f(0.299, 0.587, 0.114);

  let bp = pc + warp;
  let bR = samp(bp + dir * ca);
  let bC = samp(bp);
  let bB = samp(bp - dir * ca);
  let baseRgb = vec3f(bR.r, bC.g, bB.b);
  let uiHome = smoothstep(g0, g1, dot(abs(baseRgb - params.bg.rgb), lw));

  let rad = params.scatter * pow(n1, 2.5) * (1.0 - e);
  let ang = n2 * 6.2832 + params.time * params.drift * (0.5 + n3 * 1.5);
  let dustP = bp + vec2f(cos(ang), sin(ang)) * rad;

  let dR = samp(dustP + dir * ca);
  let dC = samp(dustP);
  let dB = samp(dustP - dir * ca);
  let dustRgb = vec3f(dR.r, dC.g, dB.b);
  let lumD = dot(dustRgb, lw);
  let dDust = dot(abs(dustRgb - params.bg.rgb), lw);

  let gate = smoothstep(g0, g1, dDust);
  let falloff = 1.0 - 0.7 * rad / max(params.scatter, 1.0);
  let prob = clamp(gate * (0.15 + 1.2 * sqrt(dDust)) * falloff, 0.0, 1.0) * uiHome;
  let speck = step(n4 * 0.999, prob);

  let shade = pow(lumD, 0.4) * (0.8 + 0.4 * n3);
  let dustCol = mix(params.bg.rgb, vec3f(shade), clamp(params.fade, 0.0, 1.0));

  let unrevealed = mix(mix(baseRgb, params.bg.rgb, uiHome), dustCol, speck);
  let col = mix(unrevealed, baseRgb, e);
  let alpha = mix(bC.a, dC.a, speck * (1.0 - e));
  return vec4f(col * alpha, alpha);
}`;

let colorProbe: CanvasRenderingContext2D | null = null;

function parseColor(input: string): [number, number, number] {
  if (typeof document === "undefined") return [0, 0, 0];
  if (!colorProbe) {
    const probe = document.createElement("canvas");
    probe.width = 1;
    probe.height = 1;
    colorProbe = probe.getContext("2d", { willReadFrequently: true });
  }
  if (!colorProbe) return [0, 0, 0];
  colorProbe.fillStyle = "#000000";
  colorProbe.fillStyle = input;
  colorProbe.clearRect(0, 0, 1, 1);
  colorProbe.fillRect(0, 0, 1, 1);
  const data = colorProbe.getImageData(0, 0, 1, 1).data;
  return [data[0] / 255, data[1] / 255, data[2] / 255];
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

/** One WebGPU device per page, shared by every ParticleReveal instance. */
function acquireGpu(): Promise<Gpu> {
  if (!sharedGpu) {
    sharedGpu = init().catch((error) => {
      sharedGpu = null;
      throw error;
    });
  }
  return sharedGpu;
}

export function createParticleReveal(
  elements: ParticleRevealElements,
  options: ParticleRevealOptions = {},
): ParticleRevealInstance | null {
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
        wake();
      } catch {}
    };
  }

  let gpu: Gpu | null = null;
  let screen: Surface | null = null;
  let fx: Effect | null = null;
  let contentTexture: Texture | null = null;
  let fallback2d: CanvasRenderingContext2D | null = null;

  let contentMaxX = 1;
  let dprNow = 1;

  function syncCanvasSize() {
    const dpr = getCanvasPixelRatio(output);
    dprNow = dpr;
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
      if (source.width !== sourceWidth || source.height !== sourceHeight) {
        source.width = sourceWidth;
        source.height = sourceHeight;
      }
      paintable.requestPaint!();
    }
  }

  const pointer = {
    x: -1e5,
    y: -1e5,
    tx: -1e5,
    ty: -1e5,
    active: 0,
    target: 0,
  };
  let time = 0;
  let bgKey = "";
  let bg: [number, number, number] = [0, 0, 0];

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reducedMotion = motionQuery.matches;

  syncCanvasSize();

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
        label: "particle-reveal.content",
      });
    }
    return contentTexture;
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

  function render() {
    if (!gpu || !fx || !screen) return;
    uploadContent();
    const w = Math.max(output.clientWidth, 1);
    const h = Math.max(output.clientHeight, 1);
    if (config.background !== bgKey) {
      bgKey = config.background;
      bg = parseColor(config.background);
    }
    const [width, height] = screen.size;
    fx.set({
      params: {
        bg: [bg[0], bg[1], bg[2], 0],
        res: [w, h],
        outputRes: [width, height],
        pointer: [pointer.x, pointer.y],
        dpr: dprNow,
        revealActive: pointer.active,
        radius: Math.max(config.radius, 1),
        softness: config.softness,
        size: Math.max(config.size, 0.5),
        scatter: Math.max(config.scatter, 0),
        drift: Math.max(config.drift, 0),
        aberration: Math.max(config.aberration, 0),
        bend: Math.max(config.bend, 0),
        fade: config.fade,
        threshold: Math.max(config.threshold, 0),
        time,
        maxX: contentMaxX,
        crisp: reducedMotion || !htmlInCanvas ? 1 : 0,
      },
    });
    gpuFrame(gpu, (f) => f.pass(screen!, fx!));
  }

  /** Without a GPU device the page still has to show: blit the capture as-is. */
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
    time += delta;
    const tau = Math.max(config.smoothing, 1e-4);
    const k = reducedMotion ? 1 : 1 - Math.exp(-delta / tau);
    pointer.x += (pointer.tx - pointer.x) * k;
    pointer.y += (pointer.ty - pointer.y) * k;
    pointer.active += (pointer.target - pointer.active) * k;
    render();
    const settled =
      Math.abs(pointer.tx - pointer.x) < 0.1 &&
      Math.abs(pointer.ty - pointer.y) < 0.1 &&
      Math.abs(pointer.target - pointer.active) < 1e-3;
    if (
      settled &&
      !contentDirty &&
      (reducedMotion || !htmlInCanvas || config.drift <= 0)
    ) {
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
        label: "particle-reveal",
      });
      const linear = sampler(gpu, {
        minFilter: "linear",
        magFilter: "linear",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
      });
      fx = effect(gpu, SHADER, {
        label: "particle-reveal",
        set: { uSampler: linear, uContent: ensureContentTexture() },
      });
      syncCanvasSize();
      start();
    })
    .catch((error) => {
      if (destroyed) return;
      console.warn(
        "ParticleReveal: WebGPU unavailable, showing content without the effect.",
        error,
      );
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
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (pointer.target === 0 && pointer.active < 1e-3) {
      pointer.x = x;
      pointer.y = y;
    }
    pointer.tx = x;
    pointer.ty = y;
    pointer.target = 1;
    start();
  }

  function onPointerLeave() {
    pointer.target = 0;
    start();
  }

  listenTarget.addEventListener("pointermove", onPointerMove, { passive: true });
  listenTarget.addEventListener("pointerleave", onPointerLeave, { passive: true });

  return {
    setOptions(next) {
      if (
        !Object.entries(next).some(
          ([key, value]) =>
            config[key as keyof ParticleRevealOptions] !== value,
        )
      )
        return;
      Object.assign(config, next);
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
      motionQuery.removeEventListener("change", onMotionChange);
      listenTarget.removeEventListener("pointermove", onPointerMove);
      listenTarget.removeEventListener("pointerleave", onPointerLeave);
      contentTexture?.destroy();
      screen?.dispose();
      if (htmlInCanvas) paintable.onpaint = null;
    },
  };
}
