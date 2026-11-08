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

export interface LaserOptions {
  /** Animation speed of the beam wave, flicker, and sparkle. 1 is normal. */
  speed?: number;
  /** Distance of the beam from the bottom edge in CSS pixels. */
  offset?: number;
  /** Laser glow color as RGB in the 0 to 1 range. */
  color?: [number, number, number];
  /** Thickness of the white-hot beam core in CSS pixels. */
  thickness?: number;
  /** Intensity of the white beam core (0 to 2). 0 removes it. */
  core?: number;
  /** Reach of the colored glow around the beam in CSS pixels. */
  radius?: number;
  /** Brightness of the colored glow (0 to 3). 0 removes it. */
  glow?: number;
  /** Amplitude of the slow beam waviness in CSS pixels. */
  wave?: number;
  /** Beam length as a fraction of the content width (0 to 1). */
  width?: number;
  /** Random intensity flicker of the beam (0 to 1). */
  flicker?: number;
  /** Height of the hot reveal band above the beam in CSS pixels. */
  reveal?: number;
  /** How strongly freshly revealed content glows (0 to 1.5). */
  heat?: number;
  /** Heat shimmer displacement of freshly revealed content in CSS pixels. */
  shimmer?: number;
  /** Animated sparkle texture inside the reveal band (0 to 2). */
  sparkle?: number;
  /** How much scrolling boosts the beam and the reveal glow (0 to 3). */
  reactivity?: number;
}

export interface LaserElements {
  /** Canvas with layoutsubtree that hosts the HTML content. */
  source: HTMLCanvasElement;
  /** The element inside the source canvas that gets captured. */
  content: HTMLElement;
  /** Canvas the WebGPU effect renders to. */
  output: HTMLCanvasElement;
}

export interface LaserInstance {
  /** Update effect options live. */
  setOptions: (options: LaserOptions) => void;
  /** Re-read canvas size. Call when the element is resized. */
  resize: () => void;
  /** Stop the loop and release all GPU resources. */
  destroy: () => void;
}

const DEFAULTS: Required<LaserOptions> = {
  speed: 0.3,
  offset: 140,
  color: [0.05, 0.35, 1],
  thickness: 6,
  core: 1,
  radius: 20,
  glow: 2,
  wave: 10,
  width: 0.55,
  flicker: 0.2,
  reveal: 400,
  heat: 1.5,
  shimmer: 12,
  sparkle: 0.25,
  reactivity: 1,
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
  color: vec3f,
  time: f32,
  bezel: vec3f,
  beamY: f32,
  waveAmp: f32,
  beamCX: f32,
  beamHalfW: f32,
  halfCore: f32,
  core: f32,
  radius: f32,
  glow: f32,
  bright: f32,
  revealH: f32,
  heat: f32,
  shimmer: f32,
  sparkle: f32,
  maxX: f32,
  hasContent: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var uContent: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

fn mod1(x: f32, y: f32) -> f32 { return x - y * floor(x / y); }
fn mod2(x: vec2f, y: f32) -> vec2f { return x - vec2f(y) * floor(x / vec2f(y)); }
fn mod3(x: vec3f, y: f32) -> vec3f { return x - vec3f(y) * floor(x / vec3f(y)); }

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

fn permute(x: vec3f) -> vec3f { return mod3(((x * 34.0) + 1.0) * x, 289.0); }

fn snoise(v: vec2f) -> f32 {
  let C = vec4f(0.211324865405187, 0.366025403784439,
    -0.577350269189626, 0.024390243902439);
  var i = floor(v + dot(v, C.yy));
  let x0 = v - i + dot(i, C.xx);
  let i1 = select(vec2f(0.0, 1.0), vec2f(1.0, 0.0), x0.x > x0.y);
  var x12 = x0.xyxy + C.xxzz;
  x12 = vec4f(x12.x - i1.x, x12.y - i1.y, x12.z, x12.w);
  i = mod2(i, 289.0);
  let p = permute(permute(i.y + vec3f(0.0, i1.y, 1.0)) + i.x + vec3f(0.0, i1.x, 1.0));
  var m = max(0.5 - vec3f(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), vec3f(0.0));
  m = m * m;
  m = m * m;
  let x = 2.0 * fract(p * C.www) - vec3f(1.0);
  let h = abs(x) - vec3f(0.5);
  let ox = floor(x + vec3f(0.5));
  let a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  let g = vec3f(
    a0.x * x0.x + h.x * x0.y,
    a0.y * x12.x + h.y * x12.y,
    a0.z * x12.z + h.z * x12.w
  );
  return 130.0 * dot(m, g);
}

fn fbm(pIn: vec2f) -> f32 {
  var p = pIn;
  var v = 0.0;
  var a = 0.5;
  for (var i = 0; i < 3; i++) {
    v += a * snoise(p);
    p = mat2x2f(1.6, 1.2, -1.2, 1.6) * p + vec2f(11.7);
    a *= 0.5;
  }
  return v * 0.5 + 0.5;
}

fn smokeField(p: vec2f, t: f32) -> f32 {
  let rise = vec2f(t * 0.04, -t * 0.35);
  let q = vec2f(
    fbm(p + rise),
    fbm(p + rise * 0.85 + vec2f(5.2, 1.3)));
  return fbm(p + 0.55 * q + rise);
}

fn page(p: vec2f) -> vec4f {
  let py = clamp(p.y, 0.0005, 0.9995);
  let q = vec2f(
    clamp(p.x, 0.0005, params.maxX - 0.0005),
    1.0 - py,
  );
  return textureSampleLevel(uContent, uSampler, q, 0.0);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let glUv = vec2f(uv.x, 1.0 - uv.y);
  if (glUv.x > params.maxX) {
    return vec4f(0.0);
  }
  let t = params.time;

  let nx = (glUv.x - params.beamCX) / max(params.beamHalfW, 1e-4);
  let env = pow(max(1.0 - nx * nx, 0.0), 1.5);

  var bend = 0.0;
  if (params.waveAmp > 0.0) {
    bend = (noise(vec2f(glUv.x * 2.5 + t * 0.6, t * 0.4)) - 0.5) * 2.0 * params.waveAmp;
  }
  let yb = params.beamY + bend;
  let dy = glUv.y - yb;
  let pxd = abs(dy) * params.resolution.y;

  var col: vec3f;
  var alpha: f32;
  if (dy < 0.0 && params.hasContent > 0.5) {
    col = params.bezel;
    alpha = 1.0;
  } else {
    col = vec3f(0.0);
    alpha = 0.0;
  }

  if (dy >= 0.0 && dy < params.revealH && params.revealH > 0.0) {
    let k = dy / params.revealH;
    let w = exp(-3.0 * k) * (1.0 - smoothstep(0.55, 1.0, k));

    let sp = glUv * params.resolution / params.resolution.y;
    if (params.shimmer > 0.0 && env > 0.0 && params.hasContent > 0.5) {
      let dx = snoise(vec2f(sp.x * 5.0, sp.y * 12.0 - t * 1.3))
        * params.shimmer * w * env;
      let sa = w * env;
      col = page(vec2f(glUv.x + dx, glUv.y)).rgb * sa;
      alpha = sa;
    }
    if (params.heat > 0.0 && env > 0.0) {
      let s = smoothstep(0.3, 1.05, smokeField(sp * vec2f(2.4, 3.4), t));
      var heat = w * params.heat * env * (0.4 + 0.9 * s);
      if (params.sparkle > 0.0) {
        let f = fbm(sp * vec2f(9.0, 13.0) + vec2f(0.0, -t * 1.4));
        heat *= 1.0 + params.sparkle * (f - 0.5) * 1.3;
      }
      heat = max(heat, 0.0);
      let emission = params.color * heat * params.bright + vec3f(heat * heat * 0.35);

      let toned = (vec3f(1.0) - exp(-emission)) * env;
      let ea = max(max(toned.r, toned.g), toned.b);

      col = toned + col * (1.0 - ea);
      alpha = ea + alpha * (1.0 - ea);
    }
  }

  var beam = vec3f(0.0);
  if (env > 0.0) {
    let pd = pxd / max(env, 0.18);
    if (params.core > 0.0) {
      beam += 10.0 * params.core * smoothstep(params.halfCore, params.halfCore * 0.3, pd) * vec3f(1.0);
    }
    if (params.glow > 0.0) {
      let g = pow(params.radius / max(pd, 0.75), 0.9) * exp(-0.55 * pd / params.radius);
      beam += params.glow * g * params.color;
    }
    beam *= params.bright;
  }

  let beamToned = (vec3f(1.0) - exp(-beam)) * env;
  let ba = max(max(beamToned.r, beamToned.g), beamToned.b);
  if (ba > 0.003) {
    col = beamToned + col * (1.0 - ba);
    alpha = ba + alpha * (1.0 - ba);
  }

  return vec4f(col, clamp(alpha, 0.0, 1.0));
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

/** One WebGPU device per page, shared by every Laser instance. */
function acquireGpu(): Promise<Gpu> {
  if (!sharedGpu) {
    sharedGpu = init().catch((error) => {
      sharedGpu = null;
      throw error;
    });
  }
  return sharedGpu;
}

export function createLaser(
  elements: LaserElements,
  options: LaserOptions = {},
): LaserInstance | null {
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
  let beamCX = 0.5;
  let beamSpan = 1;
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
    const viewW = Math.max(output.clientWidth, 1);
    beamCX = contentMaxX * 0.5;
    beamSpan = contentMaxX;
    const child = content.firstElementChild;
    if (child instanceof HTMLElement) {
      const childRect = child.getBoundingClientRect();
      const outputRect = output.getBoundingClientRect();
      const style = getComputedStyle(child);
      const left =
        childRect.left - outputRect.left + (parseFloat(style.paddingLeft) || 0);
      const right =
        childRect.right - outputRect.left - (parseFloat(style.paddingRight) || 0);
      if (right - left > 48) {
        beamCX = ((left + right) * 0.5) / viewW;
        beamSpan = (right - left) / viewW;
      }
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
        label: "laser.content",
      });
      gpu!.gpu.queue.writeTexture(
        { texture: contentTexture.gpu },
        new Uint8Array([0, 0, 0, 0]),
        { bytesPerRow: 4, rowsPerImage: 1 },
        [1, 1],
      );
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

  let time = 0;
  let activity = 0;

  const fract = (x: number) => x - Math.floor(x);
  const hash2 = (x: number, y: number) =>
    fract(Math.sin(x * 89.44 + y * 19.36) * 22189.22);
  const smooth01 = (x: number) => x * x * (3 - 2 * x);
  function iHashCpu(vx: number, vy: number, r: number) {
    const fxv = Math.floor(vx * r);
    const fy = Math.floor(vy * r);
    const h00 = hash2(fxv / r, fy / r);
    const h10 = hash2((fxv + 1) / r, fy / r);
    const h01 = hash2(fxv / r, (fy + 1) / r);
    const h11 = hash2((fxv + 1) / r, (fy + 1) / r);
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
    const clientH = Math.max(output.clientHeight, 1);
    const flick =
      1 - Math.min(Math.max(config.flicker, 0), 1) * noiseCpu(time * 1.8, 3.7);
    const boost = 1 + Math.max(config.reactivity, 0) * activity * 1.6;
    fx.set({
      params: {
        resolution: [width, height],
        time,
        beamY: Math.min(Math.max(config.offset, 0) / clientH, 0.95),
        waveAmp: Math.max(config.wave, 0) / clientH,
        beamCX,
        beamHalfW: Math.min(Math.max(config.width, 0.05), 1) * beamSpan * 0.5,
        halfCore: Math.max(config.thickness, 0.5) * dprNow * 0.5,
        core: Math.max(config.core, 0),
        radius: Math.max(config.radius, 0.5) * dprNow,
        glow: Math.max(config.glow, 0),
        color: config.color,
        bright: flick * boost,
        revealH: Math.max(config.reveal, 0) / clientH,
        heat: Math.max(config.heat, 0) * (0.3 + 0.7 * activity),
        shimmer:
          (Math.max(config.shimmer, 0) / Math.max(output.clientWidth, 1)) *
          (0.25 + 0.75 * activity),
        sparkle: Math.max(config.sparkle, 0),
        bezel,
        maxX: contentMaxX,
        hasContent: htmlInCanvas ? 1 : 0,
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
    if (!reducedMotion) {
      time += delta * config.speed;
      activity *= Math.exp(-delta * 2.4);
    }
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
        label: "laser",
      });
      const linear = sampler(gpu, {
        minFilter: "linear",
        magFilter: "linear",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
      });
      fx = effect(gpu, SHADER, {
        label: "laser",
        set: { uSampler: linear, uContent: ensureContentTexture() },
      });
      syncCanvasSize();
      start();
    })
    .catch((error) => {
      if (destroyed) return;
      console.warn("Laser: WebGPU unavailable, showing content without the effect.", error);
      fallback2d = output.getContext("2d");
      contentDirty = true;
      start();
    });

  let lastScrollTop = content.scrollTop;
  function onScroll() {
    const top = content.scrollTop;
    if (!reducedMotion) {
      activity = Math.min(1, activity + Math.abs(top - lastScrollTop) / 600);
    }
    lastScrollTop = top;
    start();
  }
  content.addEventListener("scroll", onScroll, { passive: true });

  function onMotionChange() {
    reducedMotion = motionQuery.matches;
    if (reducedMotion) activity = 0;
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
          ([key, value]) => config[key as keyof LaserOptions] !== value,
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
      content.removeEventListener("scroll", onScroll);
      observer.disconnect();
      intersection.disconnect();
      motionQuery.removeEventListener("change", onMotionChange);
      contentTexture?.destroy();
      screen?.dispose();
      if (htmlInCanvas) paintable.onpaint = null;
    },
  };
}
