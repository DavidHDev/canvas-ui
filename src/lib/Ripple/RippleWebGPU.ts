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

export type RippleTrigger = "click" | "hover" | "none";

export interface RippleOptions {
  /** Height of the waves (0 to 3). */
  amplitude?: number;
  /** How fast the rings travel outward. 1 is normal speed. */
  speed?: number;
  /** Distance between wave crests in CSS pixels. */
  wavelength?: number;
  /** Number of crests in each wave train (1 to 8). */
  rings?: number;
  /** How quickly the waves lose energy (higher dies faster). */
  decay?: number;
  /** How strongly the waves bend the page content, in CSS pixels. */
  refraction?: number;
  /** Chromatic dispersion splitting colors along the wave slopes (0 to 1). */
  dispersion?: number;
  /** Intensity of the light glints on the wave crests (0 to 2). */
  shine?: number;
  /** What spawns ripples. "click" on press, "hover" also leaves a wake while moving, "none" only ambient. */
  trigger?: RippleTrigger;
  /** Seconds between ambient ripples at random positions. 0 disables them. */
  interval?: number;
}

export interface RippleElements {
  /** Canvas with layoutsubtree that hosts the HTML content. */
  source: HTMLCanvasElement;
  /** The element inside the source canvas that gets captured. */
  content: HTMLElement;
  /** Canvas the WebGPU effect renders to. */
  output: HTMLCanvasElement;
}

export interface RippleInstance {
  /** Update effect options live. */
  setOptions: (options: RippleOptions) => void;
  /** Spawn a ripple at a position in CSS pixels relative to the element. */
  splash: (x: number, y: number, strength?: number) => void;
  /** Re-read canvas size. Call when the element is resized. */
  resize: () => void;
  /** Stop the loop and release all GPU resources. */
  destroy: () => void;
}

const DEFAULTS: Required<RippleOptions> = {
  amplitude: 0.5,
  speed: 0.65,
  wavelength: 80,
  rings: 2,
  decay: 1,
  refraction: 100,
  dispersion: 0.5,
  shine: 0.5,
  trigger: "click",
  interval: 0,
};

const MAX_RIPPLES = 12;
const BASE_SPEED = 340;

type PaintableCanvas = HTMLCanvasElement & {
  onpaint?: (() => void) | null;
  requestPaint?: () => void;
};

type ElementImageContext = CanvasRenderingContext2D & {
  drawElementImage?: (element: Element, x: number, y: number) => void;
};

const SHADER = /* wgsl */ `
struct Params {
  ripples: array<vec4f, 12>,
  resolution: vec2f,
  count: u32,
  speed: f32,
  wavelength: f32,
  width: f32,
  decay: f32,
  refraction: f32,
  dispersion: f32,
  shine: f32,
  hasContent: f32,
  maxX: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var uContent: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

fn page(p: vec2f) -> vec4f {
  let q = vec2f(
    clamp(p.x, 0.0005, params.maxX - 0.0005),
    clamp(p.y, 0.0005, 0.9995),
  );
  return textureSampleLevel(uContent, uSampler, q, 0.0);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  // vgpu's uv is top-origin, which matches the captured page texture directly.
  let pUv = uv;
  let frag = pUv * params.resolution;

  var grad = vec2f(0.0);
  let k = 6.28318530718 / params.wavelength;
  let w2 = params.width * params.width;

  for (var i = 0u; i < 12u; i++) {
    if (i >= params.count) { break; }
    let rp = params.ripples[i];
    let dv = frag - rp.xy;
    let r = length(dv);
    let front = params.speed * rp.z;
    let s = r - front;
    var env = exp(-s * s / w2) * exp(-params.decay * rp.z) * rp.w;
    env *= smoothstep(0.0, 0.08, rp.z);
    env *= inverseSqrt(1.0 + front / max(params.wavelength, 1.0) * 0.2);
    if (env < 0.0015) { continue; }
    let dh = (k * cos(s * k) - 2.0 * s / w2 * sin(s * k)) * env;
    grad += dv / max(r, 1.0) * dh * params.wavelength * 0.16;
  }

  let g = dot(grad, vec2f(-0.55, -0.8));
  let glint = pow(clamp(g * 2.2, 0.0, 1.0), 2.0) * params.shine;
  let shade = pow(clamp(-g * 1.6, 0.0, 1.0), 2.0) * params.shine * 0.3;

  if (params.hasContent < 0.5) {
    let a = clamp(glint * 0.9 + shade * 0.5, 0.0, 0.85);
    return vec4f(vec3f(glint * 0.9), a);
  }

  let offs = grad * params.refraction / params.resolution;
  var col: vec3f;
  if (params.dispersion > 0.001) {
    let d = params.dispersion * 0.35;
    col = vec3f(
      page(pUv + offs * (1.0 + d)).r,
      page(pUv + offs).g,
      page(pUv + offs * (1.0 - d)).b,
    );
  } else {
    col = page(pUv + offs).rgb;
  }
  col += vec3f(glint);
  col *= 1.0 - shade;
  return vec4f(col, 1.0);
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

/** One WebGPU device per page, shared by every Ripple instance. */
function acquireGpu(): Promise<Gpu> {
  if (!sharedGpu) {
    sharedGpu = init().catch((error) => {
      sharedGpu = null;
      throw error;
    });
  }
  return sharedGpu;
}

export function createRipple(
  elements: RippleElements,
  options: RippleOptions = {},
): RippleInstance | null {
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

  // GPU resources are created once the device resolves; everything before that
  // is plain DOM bookkeeping so the instance can be returned synchronously.
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
        label: "ripple.content",
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

  type Wave = { x: number; y: number; age: number; amp: number };
  const ripples: Wave[] = [];
  const rippleData: [number, number, number, number][] = Array.from(
    { length: MAX_RIPPLES },
    () => [0, 0, 0, 0],
  );

  function splash(x: number, y: number, strength = 1) {
    if (reducedMotion) return;
    if (ripples.length >= MAX_RIPPLES) ripples.shift();
    ripples.push({ x, y, age: 0, amp: strength });
    start();
  }

  function pruneRipples(delta: number) {
    const diag = Math.hypot(output.clientWidth, output.clientHeight);
    const speedPx = BASE_SPEED * Math.max(config.speed, 0.05);
    const width = config.wavelength * Math.max(config.rings, 1) * 0.5;
    for (let i = ripples.length - 1; i >= 0; i--) {
      const rp = ripples[i];
      rp.age += delta;
      const gone =
        rp.age * speedPx > diag + width * 3 ||
        Math.exp(-Math.max(config.decay, 0.05) * rp.age) * rp.amp < 0.012;
      if (gone) ripples.splice(i, 1);
    }
  }

  function render() {
    if (!gpu || !fx || !screen) return;
    uploadContent();
    const dpr = dprNow;
    for (let i = 0; i < MAX_RIPPLES; i++) {
      const rp = ripples[i];
      const slot = rippleData[i];
      slot[0] = rp ? rp.x * dpr : 0;
      slot[1] = rp ? rp.y * dpr : 0;
      slot[2] = rp ? rp.age : 0;
      slot[3] = rp ? rp.amp * Math.max(config.amplitude, 0) : 0;
    }
    const [width, height] = screen.size;
    fx.set({
      params: {
        ripples: rippleData,
        resolution: [width, height],
        count: ripples.length,
        speed: BASE_SPEED * Math.max(config.speed, 0.05) * dpr,
        wavelength: Math.max(config.wavelength, 4) * dpr,
        width: Math.max(config.wavelength, 4) * Math.max(config.rings, 1) * 0.5 * dpr,
        decay: Math.max(config.decay, 0.05),
        refraction: Math.max(config.refraction, 0) * dpr,
        dispersion: Math.max(config.dispersion, 0),
        shine: Math.max(config.shine, 0),
        hasContent: htmlInCanvas ? 1 : 0,
        maxX: contentMaxX,
      },
    });
    // Surfaces can only be drawn inside frame(); one pass, one command buffer.
    gpuFrame(gpu, (f) => f.pass(screen!, fx!));
  }

  function renderIdle() {
    if (htmlInCanvas) {
      render();
    } else if (gpu && screen) {
      // Nothing to show without ripples: leave the overlay fully transparent.
      gpuFrame(gpu, (f) => f.pass({ target: screen!, clear: [0, 0, 0, 0] }, () => {}));
    }
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
  let ambientTimer = 0;

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reducedMotion = motionQuery.matches;

  function spawnAmbient() {
    const w = output.clientWidth;
    const h = output.clientHeight;
    if (w < 10 || h < 10) return;
    splash(
      w * (0.15 + Math.random() * 0.7),
      h * (0.15 + Math.random() * 0.7),
      0.6 + Math.random() * 0.5,
    );
  }

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
      // Device still initializing: keep the loop parked until it resolves.
      running = false;
      return;
    }
    const delta = Math.min(Math.max((now - lastTime) / 1000, 0), 1 / 30);
    lastTime = now;
    if (!reducedMotion) {
      pruneRipples(delta);
      if (config.interval > 0) {
        ambientTimer += delta;
        if (ambientTimer >= config.interval) {
          ambientTimer = 0;
          spawnAmbient();
        }
      }
    }
    if (ripples.length > 0) {
      render();
    } else {
      renderIdle();
      if (!contentDirty && (config.interval <= 0 || reducedMotion)) {
        running = false;
        return;
      }
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
        label: "ripple",
      });
      const linear = sampler(gpu, {
        minFilter: "linear",
        magFilter: "linear",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
      });
      fx = effect(gpu, SHADER, {
        label: "ripple",
        set: { uSampler: linear, uContent: ensureContentTexture() },
      });
      syncCanvasSize();
      start();
    })
    .catch((error) => {
      if (destroyed) return;
      console.warn("Ripple: WebGPU unavailable, showing content without the effect.", error);
      fallback2d = output.getContext("2d");
      contentDirty = true;
      start();
    });

  function localPoint(event: PointerEvent): [number, number] {
    const rect = output.getBoundingClientRect();
    return [event.clientX - rect.left, event.clientY - rect.top];
  }

  let hoverX = -1e5;
  let hoverY = -1e5;

  function onPointerDown(event: PointerEvent) {
    if (config.trigger === "none") return;
    const [x, y] = localPoint(event);
    splash(x, y, 1);
  }

  function onPointerMove(event: PointerEvent) {
    if (config.trigger !== "hover") return;
    const [x, y] = localPoint(event);
    if (Math.hypot(x - hoverX, y - hoverY) < 56) return;
    hoverX = x;
    hoverY = y;
    splash(x, y, 0.3);
  }

  content.addEventListener("pointerdown", onPointerDown, { passive: true });
  content.addEventListener("pointermove", onPointerMove, { passive: true });

  function onMotionChange() {
    reducedMotion = motionQuery.matches;
    if (reducedMotion) ripples.length = 0;
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
          ([key, value]) => config[key as keyof RippleOptions] !== value,
        )
      )
        return;
      Object.assign(config, next);
      start();
    },
    splash,
    resize() {
      syncCanvasSize();
      start();
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      content.removeEventListener("pointerdown", onPointerDown);
      content.removeEventListener("pointermove", onPointerMove);
      observer.disconnect();
      intersection.disconnect();
      motionQuery.removeEventListener("change", onMotionChange);
      contentTexture?.destroy();
      screen?.dispose();
      if (htmlInCanvas) paintable.onpaint = null;
    },
  };
}
