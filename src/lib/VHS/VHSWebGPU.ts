import { getCanvasPixelRatio, createCanvasResizeObserver } from "../canvas-viewport";
import { isHtmlInCanvasBlocked, prepareHtmlInCanvas, drawHtmlInCanvas } from "../html-in-canvas";
import { effect, frame as gpuFrame, init, sampler, surface, type Effect, type Gpu, type Surface } from "vgpu";
import type { Texture } from "vgpu";

export interface VHSOptions {
  /** Playback speed of the tape artifacts. 1 is normal speed. */
  speed?: number;
  /** Strength of the slow horizontal tape wave (0 to 3). */
  wave?: number;
  /** Strength of the fine per-line horizontal jitter (0 to 3). */
  jitter?: number;
  /** Strength of the travelling tape crease band (0 to 3). */
  crease?: number;
  /** Strength of the head-switching noise at the bottom (0 to 3). */
  switching?: number;
  /** Height of the head-switching band as a fraction of the screen. */
  switchingHeight?: number;
  /** Strength of the horizontal glow bleed (0 to 1). */
  bloom?: number;
  /** RGB channel misalignment in CSS pixels. */
  aberration?: number;
  /** Strength of the slow brightness beat rolling down the frame (0 to 1). */
  acBeat?: number;
  /** Amount of animated static grain (0 to 1). */
  grain?: number;
  /** Intensity of the CRT scanline overlay (0 to 1). */
  scanlines?: number;
  /** Darkening toward the frame corners (0 to 1). */
  vignette?: number;
  /** CRT tube curvature bending the frame inward (0 to 1). 0 disables. */
  barrel?: number;
  /** Color saturation. 1 keeps the content's colors, 0 is grayscale. */
  saturation?: number;
  /** Extra brightness multiplier applied at the end. */
  exposure?: number;
}

export interface VHSElements {
  /** Canvas with layoutsubtree that hosts the HTML content. */
  source: HTMLCanvasElement;
  /** The element inside the source canvas that gets captured. */
  content: HTMLElement;
  /** Canvas the WebGPU effect renders to. */
  output: HTMLCanvasElement;
}

export interface VHSInstance {
  /** Update effect options live. */
  setOptions: (options: VHSOptions) => void;
  /** Re-read canvas size. Call when the element is resized. */
  resize: () => void;
  /** Stop the loop and release all GPU resources. */
  destroy: () => void;
}

const DEFAULTS: Required<VHSOptions> = {
  speed: 0.5,
  wave: 1,
  jitter: 0.25,
  crease: 0.1,
  switching: 0.05,
  switchingHeight: 0.02,
  bloom: 0.4,
  aberration: 2,
  acBeat: 1,
  grain: 0.1,
  scanlines: 0.1,
  vignette: 0,
  barrel: 0,
  saturation: 1,
  exposure: 1,
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
  bezel: vec4f,
  resolution: vec2f,
  time: f32,
  wave: f32,
  jitter: f32,
  crease: f32,
  switching: f32,
  switchHeight: f32,
  bloom: f32,
  aberration: f32,
  acBeat: f32,
  grain: f32,
  scanlines: f32,
  vignette: f32,
  saturation: f32,
  exposure: f32,
  barrel: f32,
  creaseNoise: f32,
  maxX: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var uContent: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

const PI: f32 = 3.14159265;

fn mod2(x: vec2f, y: f32) -> vec2f {
  return x - y * floor(x / y);
}

fn hash(v: vec2f) -> f32 {
  return fract(sin(dot(v, vec2f(89.44, 19.36))) * 22189.22);
}

fn iHash(v: vec2f, r: vec2f) -> f32 {
  let h00 = hash(floor(v * r + vec2f(0.0, 0.0)) / r);
  let h10 = hash(floor(v * r + vec2f(1.0, 0.0)) / r);
  let h01 = hash(floor(v * r + vec2f(0.0, 1.0)) / r);
  let h11 = hash(floor(v * r + vec2f(1.0, 1.0)) / r);
  let ip = smoothstep(vec2f(0.0), vec2f(1.0), mod2(v * r, 1.0));
  return (h00 * (1.0 - ip.x) + h10 * ip.x) * (1.0 - ip.y)
    + (h01 * (1.0 - ip.x) + h11 * ip.x) * ip.y;
}

fn noise(v: vec2f) -> f32 {
  var sum = 0.0;
  var s = 2.0;
  for (var i = 1; i < 7; i++) {
    sum += iHash(v + vec2f(f32(i)), vec2f(2.0 * s)) / s;
    s *= 2.0;
  }
  return sum;
}

fn tape(p: vec2f) -> vec4f {
  let q = vec2f(
    clamp(p.x, 0.0005, params.maxX - 0.0005),
    clamp(p.y, 0.0005, 0.9995),
  );
  return textureSampleLevel(uContent, uSampler, vec2f(q.x, 1.0 - q.y), 0.0);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  var glUv = vec2f(uv.x, 1.0 - uv.y);
  if (glUv.x > params.maxX) {
    return vec4f(0.0);
  }

  var edgeMask = 1.0;
  if (params.barrel > 0.0) {
    var c = vec2f(glUv.x / params.maxX, glUv.y) * 2.0 - 1.0;
    c *= 1.0 + params.barrel * 0.15 * dot(c, c);
    let m = max(abs(c.x), abs(c.y));
    edgeMask = 1.0 - smoothstep(1.0 - 0.12 * params.barrel, 1.0, m);
    if (edgeMask <= 0.0) {
      return vec4f(params.bezel.rgb, 1.0);
    }
    glUv = vec2f((c.x * 0.5 + 0.5) * params.maxX, c.y * 0.5 + 0.5);
  }

  var uvn = glUv;
  let t = params.time;

  var lineNoise = 0.0;
  if (params.jitter + params.crease + params.switching > 0.0) {
    lineNoise = noise(vec2f(uvn.y * 100.0, t * 10.0));
  }

  if (params.wave > 0.0) {
    uvn.x += (noise(vec2f(uvn.y, t)) - 0.5) * 0.005 * params.wave;
  }
  uvn.x += (lineNoise - 0.5) * 0.01 * params.jitter;

  let tcPhase = clamp(
    (sin(uvn.y * 8.0 - t * PI * 1.2) - 0.92) * params.creaseNoise,
    0.0, 0.01,
  ) * 10.0 * params.crease;
  let tcNoise = max(lineNoise - 0.5, 0.0);
  uvn.x -= tcNoise * tcPhase;

  let snPhase = smoothstep(max(params.switchHeight, 0.0001), 0.0, uvn.y) * params.switching;
  uvn.y += snPhase * 0.3;
  uvn.x += snPhase * ((lineNoise - 0.5) * 0.2);

  let base = tape(uvn);
  var col = base.rgb;
  col *= 1.0 - tcPhase;

  col = mix(col, col.yzx, clamp(snPhase, 0.0, 1.0));

  if (params.bloom > 0.0) {
    let px = params.aberration / max(params.resolution.x, 1.0);
    var bloomSum = vec3f(0.0);
    for (var i = -8; i <= 2; i++) {
      let s = tape(uvn + vec2f(f32(i) * px, 0.0)).rgb;
      if (i >= -4) { bloomSum.r += s.r; }
      if (i >= -6 && i <= 0) { bloomSum.g += s.g; }
      if (i <= -2) { bloomSum.b += s.b; }
    }
    bloomSum *= 0.1;

    col = mix(col, (col + bloomSum) / 1.7, clamp(params.bloom, 0.0, 1.0));
  }

  if (params.acBeat > 0.0) {
    col *= 1.0 + clamp(
      noise(vec2f(0.0, glUv.y + t * 0.2)) * 0.6 - 0.25, 0.0, 0.1,
    ) * params.acBeat;
  }

  let g = hash(glUv * params.resolution + fract(t) * vec2f(127.1, 311.7)) - 0.5;
  col += g * params.grain;

  let scan = sin(glUv.y * params.resolution.y * PI) * 0.5;
  col *= 1.0 - params.scanlines * 0.35 * scan;

  let vd = (glUv - vec2f(0.5)) * vec2f(params.resolution.x / max(params.resolution.y, 1.0), 1.0);
  col *= 1.0 - params.vignette * smoothstep(0.4, 1.1, length(vd));

  let lum = dot(col, vec3f(0.299, 0.587, 0.114));
  col = mix(vec3f(lum), col, clamp(params.saturation, 0.0, 2.0));

  col *= params.exposure;

  var alpha = max(base.a, clamp(snPhase + tcPhase, 0.0, 1.0));

  if (params.barrel > 0.0) {
    col = mix(params.bezel.rgb, col, edgeMask);
    alpha = 1.0;
  }
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

/** One WebGPU device per page, shared by every VHS instance. */
function acquireGpu(): Promise<Gpu> {
  if (!sharedGpu) {
    sharedGpu = init().catch((error) => {
      sharedGpu = null;
      throw error;
    });
  }
  return sharedGpu;
}

export function createVHS(
  elements: VHSElements,
  options: VHSOptions = {},
): VHSInstance | null {
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

  let bezel: [number, number, number] = [0, 0, 0];
  const bezelProbe = document.createElement("canvas");
  bezelProbe.width = bezelProbe.height = 1;
  const bezelCtx = bezelProbe.getContext("2d", { willReadFrequently: true });

  function syncBezelColor() {
    if (!bezelCtx) return;
    let el: Element | null = content;
    while (el) {
      const bg = getComputedStyle(el).backgroundColor;
      if (bg && bg !== "transparent") {
        bezelCtx.clearRect(0, 0, 1, 1);
        bezelCtx.fillStyle = bg;
        bezelCtx.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = bezelCtx.getImageData(0, 0, 1, 1).data;
        if (a > 0) {
          bezel = [r / 255, g / 255, b / 255];
          return;
        }
      }
      el = el.parentElement;
    }
    bezel = [0, 0, 0];
  }

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
  syncBezelColor();

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
        label: "vhs.content",
      });
    }
    return contentTexture;
  }

  function uploadContent() {
    if (!htmlInCanvas || !contentDirty || !gpu) return;
    contentDirty = false;
    syncBezelColor();
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

  const fract = (x: number) => x - Math.floor(x);
  const hash2 = (x: number, y: number) =>
    fract(Math.sin(x * 89.44 + y * 19.36) * 22189.22);
  const smooth01 = (x: number) => x * x * (3 - 2 * x);
  function iHashCpu(vx: number, vy: number, r: number) {
    const fx0 = Math.floor(vx * r);
    const fy = Math.floor(vy * r);
    const h00 = hash2(fx0 / r, fy / r);
    const h10 = hash2((fx0 + 1) / r, fy / r);
    const h01 = hash2(fx0 / r, (fy + 1) / r);
    const h11 = hash2((fx0 + 1) / r, (fy + 1) / r);
    const ix = smooth01(fract(vx * r));
    const iy = smooth01(fract(vy * r));
    return (
      (h00 * (1 - ix) + h10 * ix) * (1 - iy) + (h01 * (1 - ix) + h11 * ix) * iy
    );
  }
  function noiseCpu(vx: number, vy: number) {
    let sum = 0;
    let s = 2;
    for (let i = 1; i < 7; i++) {
      sum += iHashCpu(vx + i, vy + i, 2 * s) / s;
      s *= 2;
    }
    return sum;
  }

  function render() {
    if (!gpu || !fx || !screen) return;
    uploadContent();
    const [width, height] = screen.size;
    const dpr = dprNow;
    fx.set({
      params: {
        bezel: [bezel[0], bezel[1], bezel[2], 0],
        resolution: [width, height],
        time,
        wave: Math.max(config.wave, 0),
        jitter: Math.max(config.jitter, 0),
        crease: Math.max(config.crease, 0),
        switching: Math.max(config.switching, 0),
        switchHeight: Math.max(config.switchingHeight, 0),
        bloom: config.bloom,
        aberration: Math.max(config.aberration, 0) * dpr,
        acBeat: Math.max(config.acBeat, 0),
        grain: Math.max(config.grain, 0),
        scanlines: Math.max(config.scanlines, 0),
        vignette: Math.max(config.vignette, 0),
        barrel: htmlInCanvas ? Math.max(config.barrel, 0) : 0,
        creaseNoise: noiseCpu(time, time),
        saturation: config.saturation,
        exposure: Math.max(config.exposure, 0),
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
    const delta = Math.min((now - lastTime) / 1000, 1 / 30);
    lastTime = now;
    if (!reducedMotion) time += delta * config.speed;
    render();
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
        label: "vhs",
      });
      const linear = sampler(gpu, {
        minFilter: "linear",
        magFilter: "linear",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
      });
      fx = effect(gpu, SHADER, {
        label: "vhs",
        set: { uSampler: linear, uContent: ensureContentTexture() },
      });
      syncCanvasSize();
      start();
    })
    .catch((error) => {
      if (destroyed) return;
      console.warn("VHS: WebGPU unavailable, showing content without the effect.", error);
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
          ([key, value]) => config[key as keyof VHSOptions] !== value,
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
