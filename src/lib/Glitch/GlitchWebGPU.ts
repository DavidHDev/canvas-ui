import { getCanvasPixelRatio, createCanvasResizeObserver } from "../canvas-viewport";
import { isHtmlInCanvasBlocked, prepareHtmlInCanvas, drawHtmlInCanvas } from "../html-in-canvas";
import { effect, frame as gpuFrame, init, sampler, surface, type Effect, type Gpu, type Surface } from "vgpu";
import type { Texture } from "vgpu";

export interface GlitchOptions {
  /** Overall strength of the glitch (0 to 2). */
  intensity?: number;
  /** Seconds between glitch bursts. 0 keeps the glitch running constantly. */
  interval?: number;
  /** How long each burst lasts in seconds. */
  duration?: number;
  /** Number of horizontal slices the tear snaps to. Lower is chunkier. */
  slices?: number;
  /** How far the torn slices shift sideways, in CSS pixels. */
  shift?: number;
  /** Chromatic RGB split during bursts, in CSS pixels. */
  rgbShift?: number;
  /** Amount of corrupted block artifacts during bursts (0 to 1). */
  blocks?: number;
  /** Analog noise and scanline flicker during bursts (0 to 1). */
  noise?: number;
}

export interface GlitchElements {
  /** Canvas with layoutsubtree that hosts the HTML content. */
  source: HTMLCanvasElement;
  /** The element inside the source canvas that gets captured. */
  content: HTMLElement;
  /** Canvas the WebGPU effect renders to. */
  output: HTMLCanvasElement;
}

export interface GlitchInstance {
  /** Update effect options live. */
  setOptions: (options: GlitchOptions) => void;
  /** Fire a glitch burst right now. */
  burst: () => void;
  /** Re-read canvas size. Call when the element is resized. */
  resize: () => void;
  /** Stop the loop and release all GPU resources. */
  destroy: () => void;
}

const DEFAULTS: Required<GlitchOptions> = {
  intensity: 1,
  interval: 3,
  duration: 0.4,
  slices: 24,
  shift: 30,
  rgbShift: 4,
  blocks: 0.5,
  noise: 0.35,
};

type PaintableCanvas = HTMLCanvasElement & {
  onpaint?: (() => void) | null;
  requestPaint?: () => void;
};

type ElementImageContext = CanvasRenderingContext2D & {
  drawElementImage?: (element: Element, x: number, y: number) => void;
};

const SHADER = /* wgsl */ `
struct Params {
  resolution: vec2f,
  seed: f32,
  amp: f32,
  slices: f32,
  shift: f32,
  rgbShift: f32,
  blocks: f32,
  noise: f32,
  maxX: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var uContent: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

fn hash12(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.x, p.y, p.x) * 0.1031);
  p3 += dot(p3, p3.yzx + vec3f(33.33));
  return fract((p3.x + p3.y) * p3.z);
}

fn page(p: vec2f) -> vec4f {
  let q = vec2f(
    clamp(p.x, 0.0005, params.maxX - 0.0005),
    clamp(p.y, 0.0005, 0.9995),
  );
  return textureSampleLevel(uContent, uSampler, vec2f(q.x, 1.0 - q.y), 0.0);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let glUv = vec2f(uv.x, 1.0 - uv.y);
  if (glUv.x > params.maxX) {
    return vec4f(0.0);
  }

  let e = params.amp;
  var guv = glUv;

  if (e > 0.001) {
    let band = floor(glUv.y * params.slices);
    let pick = hash12(vec2f(band, params.seed));
    let tear = step(1.0 - 0.3 * min(e, 1.0), pick);
    let dir = hash12(vec2f(band, params.seed + 13.0)) * 2.0 - 1.0;
    guv.x += tear * dir * e * params.shift / params.resolution.x;

    let sub = floor(glUv.y * params.slices * 7.0);
    let micro = hash12(vec2f(sub, params.seed + 29.0));
    guv.x += (micro - 0.5) * e * params.noise * 3.0 / params.resolution.x;

    let cell = floor(guv * vec2f(10.0, params.slices * 0.5));
    let br = hash12(cell + vec2f(params.seed * 0.0173));
    if (br > 1.0 - 0.14 * params.blocks * min(e, 1.0)) {
      let jump = vec2f(
        hash12(cell + vec2f(params.seed + 3.1)) - 0.5,
        hash12(cell + vec2f(params.seed + 7.7)) - 0.5,
      );
      guv += jump * vec2f(0.08, 0.02) * e;
    }
  }

  let split = params.rgbShift * e / params.resolution.x;
  let c = page(guv);
  let r = page(guv + vec2f(split, 0.0)).r;
  let b = page(guv - vec2f(split, 0.0)).b;
  var col = vec4f(r, c.g, b, c.a);

  if (e > 0.001 && params.noise > 0.001) {
    let grain = hash12(glUv * params.resolution + vec2f(params.seed * 5.3)) - 0.5;
    let row = floor(glUv.y * params.resolution.y);
    let flicker = hash12(vec2f(row, params.seed + 41.0));
    let lines = step(0.985 - 0.01 * params.noise * e, flicker);
    col = vec4f(col.rgb + (grain * 0.22 + lines * 0.35) * params.noise * min(e, 1.0) * col.a, col.a);
  }

  return vec4f(clamp(col.rgb, vec3f(0.0), vec3f(1.0)) * col.a, col.a);
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

/** One WebGPU device per page, shared by every Glitch instance. */
function acquireGpu(): Promise<Gpu> {
  if (!sharedGpu) {
    sharedGpu = init().catch((error) => {
      sharedGpu = null;
      throw error;
    });
  }
  return sharedGpu;
}

export function createGlitch(
  elements: GlitchElements,
  options: GlitchOptions = {},
): GlitchInstance | null {
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
        label: "glitch.content",
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

  function renderFallback() {
    if (!fallback2d || !htmlInCanvas || !contentDirty) return;
    contentDirty = false;
    fallback2d.clearRect(0, 0, output.width, output.height);
    fallback2d.drawImage(source, 0, 0, output.width, output.height);
  }

  let time = 0;
  let burstAt = 0.6;
  let burstSeed = 1;
  let envelope = 0;

  function hash(n: number) {
    const s = Math.sin(n * 127.1) * 43758.5453;
    return s - Math.floor(s);
  }

  function advanceTimeline(delta: number) {
    time += delta;
    if (config.interval <= 0) {
      envelope = 1;
      return;
    }
    const sinceBurst = time - burstAt;
    const duration = Math.max(config.duration, 0.05);
    if (sinceBurst >= 0 && sinceBurst < duration) {
      const tail = 1 - Math.pow(sinceBurst / duration, 2);
      envelope = tail * (0.7 + 0.3 * hash(burstSeed + Math.floor(time * 24)));
    } else {
      envelope = 0;
      if (sinceBurst >= duration) {
        burstAt = time + Math.max(config.interval, 0.3) * (0.75 + 0.5 * Math.random());
        burstSeed = Math.floor(Math.random() * 1000);
      }
    }
  }

  function render() {
    if (!gpu || !fx || !screen) return;
    uploadContent();
    const [width, height] = screen.size;
    const dpr = dprNow;
    const amp = envelope * Math.max(config.intensity, 0);
    fx.set({
      params: {
        resolution: [width, height],
        seed: Math.floor(time * 24) + burstSeed,
        amp,
        slices: Math.max(config.slices, 3),
        shift: Math.max(config.shift, 0) * dpr,
        rgbShift: Math.max(config.rgbShift, 0) * dpr,
        blocks: Math.min(Math.max(config.blocks, 0), 1),
        noise: Math.min(Math.max(config.noise, 0), 1),
        maxX: contentMaxX,
      },
    });
    gpuFrame(gpu, (f) => f.pass(screen!, fx!));
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
    const delta = Math.min(Math.max((now - lastTime) / 1000, 0), 1 / 30);
    lastTime = now;
    const wasActive = envelope > 0;
    if (!reducedMotion) advanceTimeline(delta);
    else envelope = 0;
    if (envelope > 0 || wasActive || contentDirty) render();
    if (reducedMotion && !contentDirty) {
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
        label: "glitch",
      });
      const linear = sampler(gpu, {
        minFilter: "linear",
        magFilter: "linear",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
      });
      fx = effect(gpu, SHADER, {
        label: "glitch",
        set: { uSampler: linear, uContent: ensureContentTexture() },
      });
      syncCanvasSize();
      start();
    })
    .catch((error) => {
      if (destroyed) return;
      console.warn("Glitch: WebGPU unavailable, showing content without the effect.", error);
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

  return {
    setOptions(next) {
      if (
        !Object.entries(next).some(
          ([key, value]) => config[key as keyof GlitchOptions] !== value,
        )
      )
        return;
      Object.assign(config, next);
      start();
    },
    burst() {
      burstAt = time;
      burstSeed = Math.floor(Math.random() * 1000);
      start();
    },
    resize() {
      syncCanvasSize();
      start();
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      intersection.disconnect();
      motionQuery.removeEventListener("change", onMotionChange);
      contentTexture?.destroy();
      screen?.dispose();
      if (htmlInCanvas) paintable.onpaint = null;
    },
  };
}
