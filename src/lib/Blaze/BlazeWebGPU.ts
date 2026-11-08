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
  type Target,
} from "vgpu";
import type { Texture } from "vgpu";

export interface BlazeOptions {
  /** Height of the blaze zone as a fraction of the screen (0 to 1). */
  height?: number;
  /** Strength of the heat distortion bending the content. */
  distortion?: number;
  /** Scale of the heat distortion noise. Higher means finer ripples. */
  distortionScale?: number;
  /** Animation speed multiplier for the whole effect. */
  speed?: number;
  /** Brightness of the rising sparks. 0 disables them. */
  sparks?: number;
  /** How tightly packed the sparks are. Higher also makes them smaller. */
  sparkDensity?: number;
  /** Size of the individual sparks. */
  sparkSize?: number;
  /** Number of spark layers stacked for depth (1 to 10). */
  layers?: number;
  /** Intensity of the smoke. 0 disables it. */
  smoke?: number;
  /** Warm ambient glow near the bottom edge. */
  glow?: number;
  /** Spark color as [r, g, b] in 0-1 range. */
  sparkColor?: [number, number, number];
  /** Smoke and glow color as [r, g, b] in 0-1 range. */
  smokeColor?: [number, number, number];
}

export interface BlazeElements {
  /** Canvas with layoutsubtree that hosts the HTML content. */
  source: HTMLCanvasElement;
  /** The element inside the source canvas that gets captured. */
  content: HTMLElement;
  /** Canvas the WebGPU effect renders to. */
  output: HTMLCanvasElement;
}

export interface BlazeInstance {
  /** Update effect options live. */
  setOptions: (options: BlazeOptions) => void;
  /** Re-read canvas size. Call when the element is resized. */
  resize: () => void;
  /** Stop the loop and release all GPU resources. */
  destroy: () => void;
}

const DEFAULTS: Required<BlazeOptions> = {
  height: 0.97,
  distortion: 0.6,
  distortionScale: 0.5,
  speed: 1,
  sparks: 0.5,
  sparkDensity: 1.5,
  sparkSize: 1,
  layers: 4,
  smoke: 0.5,
  glow: 1.5,
  sparkColor: [1, 0.4, 0.05],
  smokeColor: [1, 0.43, 0.1],
};

type PaintableCanvas = HTMLCanvasElement & {
  onpaint?: (() => void) | null;
  requestPaint?: () => void;
};

type ElementImageContext = CanvasRenderingContext2D & {
  drawElementImage?: (element: Element, x: number, y: number) => void;
};

const FIRE_SHADER = /* wgsl */ `
struct FireParams {
  resolution: vec2f,
  sparkColor: vec3f,
  smokeColor: vec3f,
  time: f32,
  height: f32,
  sparks: f32,
  sparkDensity: f32,
  sparkSize: f32,
  layers: u32,
  smoke: f32,
  glow: f32,
}

@group(0) @binding(0) var<uniform> params: FireParams;

fn mod1(x: f32, y: f32) -> f32 { return x - y * floor(x / y); }
fn mod3(x: vec3f, y: f32) -> vec3f { return x - vec3f(y) * floor(x / vec3f(y)); }

fn hash1_2(x: vec2f) -> f32 {
  return fract(sin(dot(x, vec2f(52.127, 61.2871))) * 521.582);
}

fn hash2_2(x: vec2f) -> vec2f {
  return fract(sin(vec2f(
    dot(x, vec2f(20.52, 24.1994)),
    dot(x, vec2f(70.291, 80.171)),
  )) * 492.194);
}

fn noise2_2(uv: vec2f) -> vec2f {
  let f = smoothstep(vec2f(0.0), vec2f(1.0), fract(uv));
  let uv00 = floor(uv);
  let v00 = hash2_2(uv00);
  let v01 = hash2_2(uv00 + vec2f(0.0, 1.0));
  let v10 = hash2_2(uv00 + vec2f(1.0, 0.0));
  let v11 = hash2_2(uv00 + vec2f(1.0));
  return mix(mix(v00, v01, f.y), mix(v10, v11, f.y), f.x);
}

fn permute(x: vec3f) -> vec3f { return mod3(((x * 34.0) + 1.0) * x, 289.0); }

fn snoise(v: vec2f) -> f32 {
  let C = vec4f(0.211324865405187, 0.366025403784439,
    -0.577350269189626, 0.024390243902439);
  var i = floor(v + dot(v, C.yy));
  let x0 = v - i + dot(i, C.xx);
  let i1 = select(vec2f(0.0, 1.0), vec2f(1.0, 0.0), x0.x > x0.y);
  var x12 = x0.xyxy + C.xxzz;
  x12 = vec4f(x12.xy - i1, x12.zw);
  i = i - vec2f(289.0) * floor(i / vec2f(289.0));
  let p = permute(permute(i.y + vec3f(0.0, i1.y, 1.0)) + i.x + vec3f(0.0, i1.x, 1.0));
  var m = max(0.5 - vec3f(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), vec3f(0.0));
  m = m * m;
  m = m * m;
  let x = 2.0 * fract(p * C.www) - 1.0;
  let h = abs(x) - 0.5;
  let ox = floor(x + 0.5);
  let a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  let g = vec3f(
    a0.x * x0.x + h.x * x0.y,
    a0.y * x12.x + h.y * x12.y,
    a0.z * x12.z + h.z * x12.w,
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
  let rise = vec2f(-t * 0.03, -t * 0.22);
  let q = vec2f(
    fbm(p + rise),
    fbm(p + rise * 0.85 + vec2f(5.2, 1.3)));
  return fbm(p + 0.55 * q + rise);
}

fn rotate2(point: vec2f, deg: f32) -> vec2f {
  let s = sin(deg);
  let c = cos(deg);
  return mat2x2f(s, c, -c, s) * point;
}

fn voronoiPoint(root: vec2f, deg: f32) -> vec2f {
  var point = hash2_2(root) - vec2f(0.5);
  let s = sin(deg);
  let c = cos(deg);
  point = mat2x2f(s, c, -c, s) * point * 0.66;
  point += root + vec2f(0.5);
  return point;
}

fn randomAround(point: vec2f, range: vec2f, uv: vec2f) -> vec2f {
  return point + (hash2_2(uv) - vec2f(0.5)) * range;
}

fn fireParticles(uv: vec2f, originalUV: vec2f) -> vec3f {
  var particles = vec3f(0.0);
  let rootUV = floor(uv);
  let deg = params.time * 0.6 * (hash1_2(rootUV) - 0.5) * 2.0;
  let pointUV = voronoiPoint(rootUV, deg);
  let size = 0.002 * params.sparkSize;

  let tempUV = uv + vec2f(
    snoise(uv * 1.8 + params.time * 0.55),
    snoise(uv * 1.8 - params.time * 0.4 + vec2f(7.3))) * 0.06;

  let dist = length(rotate2(tempUV - pointUV, 0.7)
    * randomAround(vec2f(0.5, 1.6), vec2f(0.25, 0.2), rootUV));
  let distBloom = length(rotate2(tempUV - pointUV, 0.7)
    * randomAround(vec2f(0.5, 0.8), vec2f(0.3, 0.1), rootUV));

  particles += (1.0 - smoothstep(size * 0.6, size * 3.0, dist)) * params.sparkColor * 1.5;
  particles += pow(1.0 - smoothstep(0.0, size * 6.0, distBloom), 3.0) * params.sparkColor * 0.8;

  var border = (hash1_2(rootUV) - 0.5) * 2.0;
  let disappear = 1.0 - smoothstep(border, border + 0.5, originalUV.y);
  border = (hash1_2(rootUV + vec2f(0.214)) - 1.8) * 0.7;
  let appear = smoothstep(border, border + 0.4, originalUV.y);

  return particles * disappear * appear;
}

fn layeredParticles(uv: vec2f, sizeMod: f32, alphaMod: f32, layers: u32, smoke: f32) -> vec3f {
  var particles = vec3f(0.0);
  var size = 1.0;
  var alpha = 1.0;
  var offset = vec2f(0.0);
  for (var i = 0u; i < 10u; i++) {
    if (i >= layers) { break; }
    let noiseOffset = (noise2_2(uv * size * 2.0 + vec2f(0.5)) - vec2f(0.5)) * 0.15;
    let bokehUV = (uv * size * params.sparkDensity + params.time * vec2f(0.0, -1.0) * 0.5)
      + offset + noiseOffset;
    particles += fireParticles(bokehUV, uv) * alpha
      * (1.0 - smoothstep(0.0, 1.0, smoke) * (f32(i) / f32(max(layers, 1u))));
    offset += hash2_2(vec2f(alpha)) * 10.0;
    alpha *= alphaMod;
    size *= sizeMod;
  }
  return particles;
}

@fragment fn fs_main(@location(0) inUv: vec2f) -> @location(0) vec4f {
  let uv = vec2f(inUv.x, 1.0 - inUv.y);

  let zone = clamp(params.height, 0.02, 1.0);
  let fy = uv.y / zone;

  if (fy > 1.0) {
    return vec4f(0.0);
  }

  let aspect = params.resolution.x / params.resolution.y;
  let fireUv = vec2f((uv.x - 0.5) * aspect * 3.2, mix(-0.7, 1.6, fy));

  var smokeIntensity = 0.0;
  if (params.smoke > 0.001) {
    smokeIntensity = smokeField(fireUv * vec2f(0.4, 0.55), params.time);
    smokeIntensity = smoothstep(0.42, 1.15, smokeIntensity);
    smokeIntensity *= pow(1.0 - smoothstep(-1.0, 1.6, fireUv.y), 1.5);
  }
  let smoke = smokeIntensity * params.smokeColor * 0.8 * params.smoke;

  var particles = vec3f(0.0);
  if (params.sparks > 0.001) {
    particles = layeredParticles(fireUv, 1.01, 0.9, params.layers, smokeIntensity) * params.sparks;
  }

  let fade = 1.0 - smoothstep(0.55, 1.0, fy);
  let glow = params.smokeColor * 0.05 * params.glow * pow(1.0 - fy, 2.0);
  let fire = (particles + smoke) * fade + glow;

  return vec4f(fire, max(fire.r, max(fire.g, fire.b)));
}`;

const MAIN_SHADER = /* wgsl */ `
struct MainParams {
  height: f32,
  distortion: f32,
  distortionScale: f32,
  maxX: f32,
  hasContent: f32,
  time: f32,
}

@group(0) @binding(0) var<uniform> params: MainParams;
@group(0) @binding(1) var uContent: texture_2d<f32>;
@group(0) @binding(2) var uFire: texture_2d<f32>;
@group(0) @binding(3) var uSampler: sampler;

fn mod1(x: f32, y: f32) -> f32 { return x - y * floor(x / y); }
fn mod3(x: vec3f, y: f32) -> vec3f { return x - vec3f(y) * floor(x / vec3f(y)); }

fn hash2_2(x: vec2f) -> vec2f {
  return fract(sin(vec2f(
    dot(x, vec2f(20.52, 24.1994)),
    dot(x, vec2f(70.291, 80.171)),
  )) * 492.194);
}

fn permute(x: vec3f) -> vec3f { return mod3(((x * 34.0) + 1.0) * x, 289.0); }

fn snoise(v: vec2f) -> f32 {
  let C = vec4f(0.211324865405187, 0.366025403784439,
    -0.577350269189626, 0.024390243902439);
  var i = floor(v + dot(v, C.yy));
  let x0 = v - i + dot(i, C.xx);
  let i1 = select(vec2f(0.0, 1.0), vec2f(1.0, 0.0), x0.x > x0.y);
  var x12 = x0.xyxy + C.xxzz;
  x12 = vec4f(x12.xy - i1, x12.zw);
  i = i - vec2f(289.0) * floor(i / vec2f(289.0));
  let p = permute(permute(i.y + vec3f(0.0, i1.y, 1.0)) + i.x + vec3f(0.0, i1.x, 1.0));
  var m = max(0.5 - vec3f(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), vec3f(0.0));
  m = m * m;
  m = m * m;
  let x = 2.0 * fract(p * C.www) - 1.0;
  let h = abs(x) - 0.5;
  let ox = floor(x + 0.5);
  let a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  let g = vec3f(
    a0.x * x0.x + h.x * x0.y,
    a0.y * x12.x + h.y * x12.y,
    a0.z * x12.z + h.z * x12.w,
  );
  return 130.0 * dot(m, g);
}

fn snoiseOctaves(uv: vec2f, octaves: u32, alpha: f32, beta: f32, gamma: vec2f, delta: f32) -> f32 {
  var pos = uv;
  var t = 1.0;
  var s = 1.0;
  var q = gamma;
  var r = 0.0;
  for (var i = 0u; i < 8u; i++) {
    if (i >= octaves) { break; }
    r += s * snoise(pos + q);
    pos += t * uv;
    t *= beta;
    s *= alpha;
    q *= delta;
  }
  return r;
}

@fragment fn fs_main(@location(0) inUv: vec2f) -> @location(0) vec4f {
  let uv = vec2f(inUv.x, 1.0 - inUv.y);

  if (uv.x > params.maxX) {
    return vec4f(0.0);
  }

  let zone = clamp(params.height, 0.02, 1.0);
  let fy = uv.y / zone;

  if (params.hasContent < 0.5) {
    if (fy > 1.0) {
      return vec4f(0.0);
    }
    let fire = textureSampleLevel(uFire, uSampler, inUv, 0.0);
    return vec4f(fire.rgb, clamp(fire.a * 0.85, 0.0, 1.0));
  }

  if (fy > 1.0) {
    let c = textureSampleLevel(uContent, uSampler, inUv, 0.0);
    return vec4f(c.rgb * c.a, c.a);
  }

  let heat = params.distortion * pow(1.0 - smoothstep(0.0, 1.0, fy), 1.5);
  var uv1 = uv;
  if (heat > 0.0005) {
    let nUv = uv * 2.0 * params.distortionScale;
    let dx = 0.005 * snoiseOctaves(nUv + params.time * vec2f(0.00323, 0.00345),
      4u, 0.85, -3.0, params.time * vec2f(-0.0323, -0.345), 1.203);
    let dy = 0.0035 * snoiseOctaves(nUv + vec2f(3.0) + params.time * vec2f(-0.00323, 0.00345),
      4u, 0.85, -3.0, params.time * vec2f(-0.0323, -0.345), 1.203);
    uv1 = clamp(uv + vec2f(dx, dy) * heat, vec2f(0.001), vec2f(params.maxX - 0.004, 0.999));
  }
  let content = textureSampleLevel(uContent, uSampler, vec2f(uv1.x, 1.0 - uv1.y), 0.0);

  let fire = textureSampleLevel(uFire, uSampler, inUv, 0.0);

  let luma = dot(content.rgb, vec3f(0.299, 0.587, 0.114)) * content.a;
  let col = content.rgb * content.a * (1.0 - fire.a * luma) + fire.rgb;
  let alpha = clamp(content.a + fire.a, 0.0, 1.0);
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

/** One WebGPU device per page, shared by every Blaze instance. */
function acquireGpu(): Promise<Gpu> {
  if (!sharedGpu) {
    sharedGpu = init().catch((error) => {
      sharedGpu = null;
      throw error;
    });
  }
  return sharedGpu;
}

function destroyTarget(value: Target | null) {
  (value as unknown as { destroy?: () => void } | null)?.destroy?.();
}

export function createBlaze(
  elements: BlazeElements,
  options: BlazeOptions = {},
): BlazeInstance | null {
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
  let fireFx: Effect | null = null;
  let mainFx: Effect | null = null;
  let contentTexture: Texture | null = null;
  let fireTarget: Target | null = null;
  let fallback2d: CanvasRenderingContext2D | null = null;

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
      if (source.width !== sourceWidth || source.height !== sourceHeight) {
        source.width = sourceWidth;
        source.height = sourceHeight;
      }
      paintable.requestPaint!();
    }
  }

  syncCanvasSize();

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
        label: "blaze.content",
      });
    }
    return contentTexture;
  }

  function ensureFireTarget(): Target {
    const width = Math.max(1, Math.floor(output.width / 2));
    const height = Math.max(1, Math.floor(output.height / 2));
    if (!fireTarget) {
      fireTarget = target(gpu!, {
        size: [width, height],
        format: "rgba8unorm",
        label: "blaze.fire",
      });
    } else if (fireTarget.size[0] !== width || fireTarget.size[1] !== height) {
      fireTarget.resize([width, height]);
    }
    return fireTarget;
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
    mainFx!.set({ uContent: texture });
  }

  let time = 0;

  function render() {
    if (!gpu || !fireFx || !mainFx || !screen) return;
    uploadContent();
    const fire = ensureFireTarget();
    fireFx.set({
      params: {
        resolution: [output.width, output.height],
        time,
        height: config.height,
        sparks: config.sparks,
        sparkDensity: Math.max(config.sparkDensity, 0.05),
        sparkSize: Math.max(config.sparkSize, 0.05),
        layers: Math.min(Math.max(Math.round(config.layers), 1), 10),
        smoke: config.smoke,
        glow: config.glow,
        sparkColor: config.sparkColor,
        smokeColor: config.smokeColor,
      },
    });
    mainFx.set({
      uFire: fire,
      params: {
        time,
        height: config.height,
        distortion: config.distortion,
        distortionScale: Math.max(config.distortionScale, 0.05),
        maxX: contentMaxX,
        hasContent: htmlInCanvas ? 1 : 0,
      },
    });
    gpuFrame(gpu, (f) => {
      f.pass(fire, fireFx!);
      f.pass(screen!, mainFx!);
    });
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
        label: "blaze",
      });
      const linear = sampler(gpu, {
        minFilter: "linear",
        magFilter: "linear",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
      });
      fireFx = effect(gpu, FIRE_SHADER, { label: "blaze.fire" });
      mainFx = effect(gpu, MAIN_SHADER, {
        label: "blaze",
        set: { uSampler: linear, uContent: ensureContentTexture() },
      });
      syncCanvasSize();
      start();
    })
    .catch((error) => {
      if (destroyed) return;
      console.warn("Blaze: WebGPU unavailable, showing content without the effect.", error);
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
          ([key, value]) => config[key as keyof BlazeOptions] !== value,
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
      destroyTarget(fireTarget);
      screen?.dispose();
      if (htmlInCanvas) paintable.onpaint = null;
    },
  };
}
