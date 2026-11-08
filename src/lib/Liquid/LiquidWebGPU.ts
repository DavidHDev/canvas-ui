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
  type Target as VgpuTarget,
} from "vgpu";
import type { Texture } from "vgpu";

export interface LiquidOptions {
  /** Resolution of the simulation grid. */
  simResolution?: number;
  /** Resolution of the fluid trail texture. */
  dyeResolution?: number;
  /** How much the trail persists each frame (closer to 1 lasts longer). */
  densityDissipation?: number;
  /** How much motion persists each frame (closer to 1 lasts longer). */
  velocityDissipation?: number;
  /** How much pressure carries over between frames. */
  pressure?: number;
  /** Pressure solver iterations. */
  pressureIterations?: number;
  /** Rotational force added back into the flow. */
  curl?: number;
  /** Radius of the pointer splat. */
  radius?: number;
  /** Force multiplier applied on pointer movement. */
  force?: number;
  /** Strength of the color tint left by the flow. */
  intensity?: number;
  /** How strongly the flow warps the content. */
  distortion?: number;
  /** How much of the fluid color blends over the content. */
  blend?: number;
  /** Trail color as [r, g, b] in 0-1 range. Ignored when rainbow is on. */
  color?: [number, number, number];
  /** Color the trail from the flow direction instead of a fixed color. */
  rainbow?: boolean;
}

export interface LiquidElements {
  /** Canvas with layoutsubtree that hosts the HTML content. */
  source: HTMLCanvasElement;
  /** The element inside the source canvas that gets captured. */
  content: HTMLElement;
  /** Canvas the WebGPU effect renders to. */
  output: HTMLCanvasElement;
}

export interface LiquidInstance {
  /** Inject a splat at (x, y) in [0,1] space with velocity (dx, dy).
   * Keeps the newest 64 pending calls while suspended; applies at most 8 per frame.
   */
  splat: (x: number, y: number, dx: number, dy: number) => void;
  /** Update simulation options live, including simulation target resolution. */
  setOptions: (options: LiquidOptions) => void;
  /** Re-read canvas size. Call when the element is resized. */
  resize: () => void;
  /** Stop the loop and release all GPU resources. */
  destroy: () => void;
}

const DEFAULTS: Required<LiquidOptions> = {
  simResolution: 128,
  dyeResolution: 512,
  densityDissipation: 0.96,
  velocityDissipation: 1,
  pressure: 0.8,
  pressureIterations: 4,
  curl: 1.9,
  radius: 0.3,
  force: 1.1,
  intensity: 2,
  distortion: 0.4,
  blend: 5,
  color: [0.145, 0.239, 0.867],
  rainbow: false,
};

const DT = 1 / 60;

function srgbToLinear(value: number): number {
  return value <= 0.04045
    ? value / 12.92
    : Math.pow((value + 0.055) / 1.055, 2.4);
}

type PaintableCanvas = HTMLCanvasElement & {
  onpaint?: (() => void) | null;
  requestPaint?: () => void;
};

type ElementImageContext = CanvasRenderingContext2D & {
  drawElementImage?: (element: Element, x: number, y: number) => void;
};

const DISPLAY_SHADER = /* wgsl */ `
struct Params {
  color: vec3f,
  distortion: f32,
  intensity: f32,
  blend: f32,
  rainbow: f32,
  hasContent: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var uContent: texture_2d<f32>;
@group(0) @binding(2) var uFluid: texture_2d<f32>;
@group(0) @binding(3) var uSampler: sampler;

fn toLinear(c: vec3f) -> vec3f {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3f(2.4)), step(vec3f(0.04045), c));
}

fn toSrgb(c: vec3f) -> vec3f {
  return mix(c * 12.92, 1.055 * pow(c, vec3f(1.0 / 2.4)) - 0.055, step(vec3f(0.0031308), c));
}

fn sampleFluid(glUv: vec2f) -> vec4f {
  return textureSampleLevel(uFluid, uSampler, vec2f(glUv.x, 1.0 - glUv.y), 0.0);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let glUv = vec2f(uv.x, 1.0 - uv.y);
  let fluid = sampleFluid(glUv).rgb;
  if (params.hasContent < 0.5) {
    let mag = length(fluid);
    let tint = select(params.color, clamp(fluid / max(mag, 1e-3), vec3f(0.0), vec3f(1.0)), params.rainbow == 1.0);
    let overlay = (1.0 - exp(-mag * params.intensity * 0.5)) * 0.82;
    return vec4f(toSrgb(clamp(tint, vec3f(0.0), vec3f(1.0))) * overlay, overlay);
  }
  let fluidUv = glUv - fluid.rg * params.distortion * 0.001;
  var content = textureSampleLevel(uContent, uSampler, vec2f(fluidUv.x, 1.0 - fluidUv.y), 0.0);
  content = vec4f(toLinear(content.rgb), content.a);
  let tint = select(params.color * length(fluid), fluid, params.rainbow == 1.0);
  let fluidColor = vec4f(tint, 1.0);
  let blended = mix(content, fluidColor, params.blend * 0.01 * clamp(length(fluid), 0.0, 1.0));
  let finalColor = mix(blended, vec4f(0.0), 1.0 - content.a);
  return vec4f(toSrgb(clamp(finalColor.rgb, vec3f(0.0), vec3f(1.0))), finalColor.a);
}`;

const SPLAT_SHADER = /* wgsl */ `
struct Params {
  color: vec3f,
  aspect: f32,
  point: vec2f,
  radius: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var uTarget: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

fn sampleTarget(glUv: vec2f) -> vec4f {
  return textureSampleLevel(uTarget, uSampler, vec2f(glUv.x, 1.0 - glUv.y), 0.0);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let glUv = vec2f(uv.x, 1.0 - uv.y);
  var p = glUv - params.point;
  p = vec2f(p.x * params.aspect, p.y);
  let splat = exp(-dot(p, p) / params.radius) * params.color;
  let base = sampleTarget(glUv).xyz;
  return vec4f(base + splat, 1.0);
}`;

const ADVECT_SHADER = /* wgsl */ `
struct Params {
  texelSize: vec2f,
  dt: f32,
  dissipation: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var uVelocity: texture_2d<f32>;
@group(0) @binding(2) var uSource: texture_2d<f32>;
@group(0) @binding(3) var uSampler: sampler;

fn sampleVelocity(glUv: vec2f) -> vec4f {
  return textureSampleLevel(uVelocity, uSampler, vec2f(glUv.x, 1.0 - glUv.y), 0.0);
}

fn sampleSource(glUv: vec2f) -> vec4f {
  return textureSampleLevel(uSource, uSampler, vec2f(glUv.x, 1.0 - glUv.y), 0.0);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let glUv = vec2f(uv.x, 1.0 - uv.y);
  let coord = glUv - params.dt * sampleVelocity(glUv).xy * params.texelSize;
  var outColor = params.dissipation * sampleSource(coord);
  outColor = vec4f(outColor.rgb, 1.0);
  return outColor;
}`;

const CLEAR_SHADER = /* wgsl */ `
struct Params {
  value: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let glUv = vec2f(uv.x, 1.0 - uv.y);
  return params.value * textureSampleLevel(uTexture, uSampler, vec2f(glUv.x, 1.0 - glUv.y), 0.0);
}`;

const DIVERGENCE_SHADER = /* wgsl */ `
struct Params {
  texelSize: vec2f,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var uVelocity: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

fn sampleVelocity(glUv: vec2f) -> vec4f {
  return textureSampleLevel(uVelocity, uSampler, vec2f(glUv.x, 1.0 - glUv.y), 0.0);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let glUv = vec2f(uv.x, 1.0 - uv.y);
  let vL = glUv - vec2f(params.texelSize.x, 0.0);
  let vR = glUv + vec2f(params.texelSize.x, 0.0);
  let vT = glUv + vec2f(0.0, params.texelSize.y);
  let vB = glUv - vec2f(0.0, params.texelSize.y);
  var L = sampleVelocity(vL).x;
  var R = sampleVelocity(vR).x;
  var T = sampleVelocity(vT).y;
  var B = sampleVelocity(vB).y;
  let C = sampleVelocity(glUv).xy;
  if (vL.x < 0.0) { L = -C.x; }
  if (vR.x > 1.0) { R = -C.x; }
  if (vT.y > 1.0) { T = -C.y; }
  if (vB.y < 0.0) { B = -C.y; }
  let div = 0.5 * (R - L + T - B);
  return vec4f(div, 0.0, 0.0, 1.0);
}`;

const CURL_SHADER = /* wgsl */ `
struct Params {
  texelSize: vec2f,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var uVelocity: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

fn sampleVelocity(glUv: vec2f) -> vec4f {
  return textureSampleLevel(uVelocity, uSampler, vec2f(glUv.x, 1.0 - glUv.y), 0.0);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let glUv = vec2f(uv.x, 1.0 - uv.y);
  let vL = glUv - vec2f(params.texelSize.x, 0.0);
  let vR = glUv + vec2f(params.texelSize.x, 0.0);
  let vT = glUv + vec2f(0.0, params.texelSize.y);
  let vB = glUv - vec2f(0.0, params.texelSize.y);
  let L = sampleVelocity(vL).y;
  let R = sampleVelocity(vR).y;
  let T = sampleVelocity(vT).x;
  let B = sampleVelocity(vB).x;
  let vorticity = R - L - T + B;
  return vec4f(vorticity, 0.0, 0.0, 1.0);
}`;

const VORTICITY_SHADER = /* wgsl */ `
struct Params {
  texelSize: vec2f,
  curlStrength: f32,
  dt: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var uVelocity: texture_2d<f32>;
@group(0) @binding(2) var uCurl: texture_2d<f32>;
@group(0) @binding(3) var uVelocitySampler: sampler;
@group(0) @binding(4) var uCurlSampler: sampler;

fn sampleVelocity(glUv: vec2f) -> vec4f {
  return textureSampleLevel(uVelocity, uVelocitySampler, vec2f(glUv.x, 1.0 - glUv.y), 0.0);
}

fn sampleCurl(glUv: vec2f) -> vec4f {
  return textureSampleLevel(uCurl, uCurlSampler, vec2f(glUv.x, 1.0 - glUv.y), 0.0);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let glUv = vec2f(uv.x, 1.0 - uv.y);
  let vL = glUv - vec2f(params.texelSize.x, 0.0);
  let vR = glUv + vec2f(params.texelSize.x, 0.0);
  let vT = glUv + vec2f(0.0, params.texelSize.y);
  let vB = glUv - vec2f(0.0, params.texelSize.y);
  let L = sampleCurl(vL).x;
  let R = sampleCurl(vR).x;
  let T = sampleCurl(vT).x;
  let B = sampleCurl(vB).x;
  let C = sampleCurl(glUv).x;
  var force = vec2f(abs(T) - abs(B), abs(R) - abs(L)) * 0.5;
  force /= length(force) + 1.0;
  force *= params.curlStrength * C;
  force = vec2f(force.x, force.y * -1.0);
  let velocity = sampleVelocity(glUv).xy;
  return vec4f(velocity + force * params.dt, 0.0, 1.0);
}`;

const PRESSURE_SHADER = /* wgsl */ `
struct Params {
  texelSize: vec2f,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var uPressure: texture_2d<f32>;
@group(0) @binding(2) var uDivergence: texture_2d<f32>;
@group(0) @binding(3) var uSampler: sampler;

fn samplePressure(glUv: vec2f) -> vec4f {
  return textureSampleLevel(uPressure, uSampler, vec2f(glUv.x, 1.0 - glUv.y), 0.0);
}

fn sampleDivergence(glUv: vec2f) -> vec4f {
  return textureSampleLevel(uDivergence, uSampler, vec2f(glUv.x, 1.0 - glUv.y), 0.0);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let glUv = vec2f(uv.x, 1.0 - uv.y);
  let vL = glUv - vec2f(params.texelSize.x, 0.0);
  let vR = glUv + vec2f(params.texelSize.x, 0.0);
  let vT = glUv + vec2f(0.0, params.texelSize.y);
  let vB = glUv - vec2f(0.0, params.texelSize.y);
  let L = samplePressure(vL).x;
  let R = samplePressure(vR).x;
  let T = samplePressure(vT).x;
  let B = samplePressure(vB).x;
  let divergence = sampleDivergence(glUv).x;
  let pressure = (L + R + B + T - divergence) * 0.25;
  return vec4f(pressure, 0.0, 0.0, 1.0);
}`;

const GRADIENT_SHADER = /* wgsl */ `
struct Params {
  texelSize: vec2f,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var uPressure: texture_2d<f32>;
@group(0) @binding(2) var uVelocity: texture_2d<f32>;
@group(0) @binding(3) var uPressureSampler: sampler;
@group(0) @binding(4) var uVelocitySampler: sampler;

fn samplePressure(glUv: vec2f) -> vec4f {
  return textureSampleLevel(uPressure, uPressureSampler, vec2f(glUv.x, 1.0 - glUv.y), 0.0);
}

fn sampleVelocity(glUv: vec2f) -> vec4f {
  return textureSampleLevel(uVelocity, uVelocitySampler, vec2f(glUv.x, 1.0 - glUv.y), 0.0);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let glUv = vec2f(uv.x, 1.0 - uv.y);
  let vL = glUv - vec2f(params.texelSize.x, 0.0);
  let vR = glUv + vec2f(params.texelSize.x, 0.0);
  let vT = glUv + vec2f(0.0, params.texelSize.y);
  let vB = glUv - vec2f(0.0, params.texelSize.y);
  let L = samplePressure(vL).x;
  let R = samplePressure(vR).x;
  let T = samplePressure(vT).x;
  let B = samplePressure(vB).x;
  let velocity = sampleVelocity(glUv).xy - vec2f(R - L, T - B);
  return vec4f(velocity, 0.0, 1.0);
}`;

interface DoubleTarget {
  read: VgpuTarget;
  write: VgpuTarget;
  swap: () => void;
}

interface FluidTargets {
  velocity: DoubleTarget;
  dye: DoubleTarget;
  divergence: VgpuTarget;
  curl: VgpuTarget;
  pressure: DoubleTarget;
}

interface FluidEffects {
  display: Effect;
  splat: Effect;
  advect: Effect;
  clear: Effect;
  divergence: Effect;
  curl: Effect;
  vorticity: Effect;
  pressure: Effect;
  gradient: Effect;
}

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

/** One WebGPU device per page, shared by every Liquid instance. */
function acquireGpu(): Promise<Gpu> {
  if (!sharedGpu) {
    sharedGpu = init().catch((error) => {
      sharedGpu = null;
      throw error;
    });
  }
  return sharedGpu;
}

function targetSize(value: number) {
  return Math.max(1, Math.round(value));
}

function destroyTarget(t: VgpuTarget) {
  (t as unknown as { destroy(): void }).destroy();
}

export function createLiquid(
  elements: LiquidElements,
  options: LiquidOptions = {},
): LiquidInstance | null {
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
  let contentTexture: Texture | null = null;
  let fallback2d: CanvasRenderingContext2D | null = null;
  let fluidTargets: FluidTargets | null = null;
  let effects: FluidEffects | null = null;

  let texelX = 0;
  let texelY = 0;

  function updateTexelSize() {
    const width = Math.max(output.clientWidth, 1);
    const height = Math.max(output.clientHeight, 1);
    texelX = 1 / (config.simResolution * (width / (height + 400)));
    texelY = 1 / config.simResolution;
  }

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
    if (htmlInCanvas) {
      const sourceWidth = Math.max(1, Math.round(source.clientWidth * dpr));
      const sourceHeight = Math.max(1, Math.round(source.clientHeight * dpr));
      if (source.width !== sourceWidth || source.height !== sourceHeight) {
        source.width = sourceWidth;
        source.height = sourceHeight;
      }
      paintable.requestPaint!();
    }
    updateTexelSize();
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
        label: "liquid.content",
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
    if (!htmlInCanvas || !contentDirty || !gpu || !effects) return;
    contentDirty = false;
    const texture = ensureContentTexture();
    gpu.gpu.queue.copyExternalImageToTexture(
      { source },
      { texture: texture.gpu },
      [source.width, source.height],
    );
    effects.display.set({ uContent: texture });
  }

  function clearTargets(targets: FluidTargets) {
    if (!gpu) return;
    const encoder = gpu.gpu.createCommandEncoder();
    [
      targets.velocity.read,
      targets.velocity.write,
      targets.dye.read,
      targets.dye.write,
      targets.pressure.read,
      targets.pressure.write,
      targets.divergence,
      targets.curl,
    ].forEach((t) => {
      encoder.beginRenderPass(t.renderPassDescriptor({ clear: [0, 0, 0, 1] })).end();
    });
    gpu.gpu.queue.submit([encoder.finish()]);
  }

  function createDoubleTarget(size: number, format: GPUTextureFormat, label: string): DoubleTarget {
    let read = target(gpu!, {
      size: [targetSize(size), targetSize(size)],
      format,
      clearColor: [0, 0, 0, 1],
      label: `${label}.read`,
    });
    let write = target(gpu!, {
      size: [targetSize(size), targetSize(size)],
      format,
      clearColor: [0, 0, 0, 1],
      label: `${label}.write`,
    });
    return {
      get read() {
        return read;
      },
      get write() {
        return write;
      },
      swap() {
        const t = read;
        read = write;
        write = t;
      },
    };
  }

  function createFluidTargets(simResolution: number, dyeResolution: number): FluidTargets {
    const created = {
      velocity: createDoubleTarget(simResolution, "rg16float", "liquid.velocity"),
      dye: createDoubleTarget(dyeResolution, "rgba16float", "liquid.dye"),
      divergence: target(gpu!, {
        size: [targetSize(simResolution), targetSize(simResolution)],
        format: "r16float",
        clearColor: [0, 0, 0, 1],
        label: "liquid.divergence",
      }),
      curl: target(gpu!, {
        size: [targetSize(simResolution), targetSize(simResolution)],
        format: "r16float",
        clearColor: [0, 0, 0, 1],
        label: "liquid.curl",
      }),
      pressure: createDoubleTarget(simResolution, "r16float", "liquid.pressure"),
    };
    clearTargets(created);
    return created;
  }

  function releaseTargets(targets: FluidTargets) {
    [
      targets.velocity.read,
      targets.velocity.write,
      targets.dye.read,
      targets.dye.write,
      targets.pressure.read,
      targets.pressure.write,
      targets.divergence,
      targets.curl,
    ].forEach(destroyTarget);
  }

  function rebuildFluidTargets(simResolution: number, dyeResolution: number) {
    if (!gpu) return;
    const next = createFluidTargets(simResolution, dyeResolution);
    const previous = fluidTargets;
    fluidTargets = next;
    if (previous) releaseTargets(previous);
  }

  function applySplat(x: number, y: number, dx: number, dy: number) {
    if (!fluidTargets || !effects) return;
    const aspect = output.clientWidth / Math.max(output.clientHeight, 1);
    const radius = config.radius / 100;

    effects.splat.set({
      uTarget: fluidTargets.velocity.read,
      params: {
        aspect,
        point: [x, y],
        color: [dx, dy, 10],
        radius,
      },
    });
    effects.splat.draw(fluidTargets.velocity.write);
    fluidTargets.velocity.swap();

    effects.splat.set({ uTarget: fluidTargets.dye.read });
    effects.splat.draw(fluidTargets.dye.write);
    fluidTargets.dye.swap();
  }

  function step(delta: number) {
    if (!fluidTargets || !effects) return;

    effects.curl.set({
      uVelocity: fluidTargets.velocity.read,
      params: { texelSize: [texelX, texelY] },
    });
    effects.curl.draw(fluidTargets.curl);

    effects.vorticity.set({
      uVelocity: fluidTargets.velocity.read,
      uCurl: fluidTargets.curl,
      params: {
        texelSize: [texelX, texelY],
        curlStrength: config.curl,
        dt: DT,
      },
    });
    effects.vorticity.draw(fluidTargets.velocity.write);
    fluidTargets.velocity.swap();

    effects.divergence.set({
      uVelocity: fluidTargets.velocity.read,
      params: { texelSize: [texelX, texelY] },
    });
    effects.divergence.draw(fluidTargets.divergence);

    effects.clear.set({
      uTexture: fluidTargets.pressure.read,
      params: { value: Math.pow(config.pressure, delta * 60) },
    });
    effects.clear.draw(fluidTargets.pressure.write);
    fluidTargets.pressure.swap();

    effects.pressure.set({
      uDivergence: fluidTargets.divergence,
      params: { texelSize: [texelX, texelY] },
    });
    for (let i = 0; i < config.pressureIterations; i++) {
      effects.pressure.set({ uPressure: fluidTargets.pressure.read });
      effects.pressure.draw(fluidTargets.pressure.write);
      fluidTargets.pressure.swap();
    }

    effects.gradient.set({
      uPressure: fluidTargets.pressure.read,
      uVelocity: fluidTargets.velocity.read,
      params: { texelSize: [texelX, texelY] },
    });
    effects.gradient.draw(fluidTargets.velocity.write);
    fluidTargets.velocity.swap();

    effects.advect.set({
      uVelocity: fluidTargets.velocity.read,
      uSource: fluidTargets.velocity.read,
      params: {
        texelSize: [texelX, texelY],
        dt: DT,
        dissipation: Math.pow(config.velocityDissipation, delta * 60),
      },
    });
    effects.advect.draw(fluidTargets.velocity.write);
    fluidTargets.velocity.swap();

    effects.advect.set({
      uVelocity: fluidTargets.velocity.read,
      uSource: fluidTargets.dye.read,
      params: {
        dissipation: Math.pow(config.densityDissipation, delta * 60),
      },
    });
    effects.advect.draw(fluidTargets.dye.write);
    fluidTargets.dye.swap();
  }

  function render() {
    if (!gpu || !screen || !fluidTargets || !effects) return;
    uploadContent();
    effects.display.set({
      uContent: ensureContentTexture(),
      uFluid: fluidTargets.dye.read,
      params: {
        color: [
          srgbToLinear(config.color[0]),
          srgbToLinear(config.color[1]),
          srgbToLinear(config.color[2]),
        ],
        distortion: config.distortion,
        intensity: config.intensity,
        blend: config.blend,
        rainbow: config.rainbow ? 1 : 0,
        hasContent: htmlInCanvas ? 1 : 0,
      },
    });
    gpuFrame(gpu, (f) => f.pass(screen!, effects!.display));
  }

  function renderFallback() {
    if (!fallback2d || !htmlInCanvas || !contentDirty) return;
    contentDirty = false;
    fallback2d.clearRect(0, 0, output.width, output.height);
    fallback2d.drawImage(source, 0, 0, output.width, output.height);
  }

  const MAX_PENDING_SPLATS = 64;
  const MAX_SPLATS_PER_FRAME = 8;
  type Splat = [number, number, number, number];
  const queued: Splat[] = [];
  // Keep the latest pointer position without replaying a drag over later frames.
  const pointerSplats = new Map<number, Splat>();

  let raf = 0;
  let lastTime = performance.now();
  let destroyed = false;
  let running = false;
  let visible = true;
  let idleAt = 0;

  function idleDelayMs() {
    const dissipation = Math.min(config.densityDissipation, 0.999);
    const frames = Math.log(1e-7) / Math.log(dissipation);
    return (frames / 60) * 1000;
  }

  function frame(now: number) {
    if (destroyed) return;
    if (!visible || document.hidden) {
      running = false;
      return;
    }
    if (fallback2d) {
      renderFallback();
      running = false;
      return;
    }
    if (!gpu || !fluidTargets || !effects) {
      running = false;
      return;
    }
    const delta = Math.min((now - lastTime) / 1000, 1 / 30);
    lastTime = now;
    if (queued.length > 0 || pointerSplats.size > 0) {
      idleAt = now + idleDelayMs();
      let remaining = MAX_SPLATS_PER_FRAME;
      // Reserve one slot so continuous pointer motion cannot starve API calls.
      const pointerBudget = remaining - (queued.length > 0 ? 1 : 0);
      let appliedPointers = 0;
      for (const [id, splat] of pointerSplats) {
        if (appliedPointers >= pointerBudget) break;
        pointerSplats.delete(id);
        applySplat(...splat);
        appliedPointers++;
        remaining--;
      }
      const count = Math.min(queued.length, remaining);
      for (let i = 0; i < count; i++) applySplat(...queued.shift()!);
    }
    step(delta);
    render();
    if (now >= idleAt && !contentDirty && queued.length === 0 && pointerSplats.size === 0) {
      running = false;
      return;
    }
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (destroyed || running || !visible || document.hidden) return;
    running = true;
    lastTime = performance.now();
    raf = requestAnimationFrame(frame);
  }

  wake = start;

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reducedMotion = motionQuery.matches;

  acquireGpu()
    .then((device) => {
      if (destroyed) return;
      gpu = device;
      screen = surface(gpu, output, {
        autoResize: false,
        alphaMode: "premultiplied",
        label: "liquid",
      });
      const linear = sampler(gpu, {
        minFilter: "linear",
        magFilter: "linear",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
      });
      const nearest = sampler(gpu, {
        minFilter: "nearest",
        magFilter: "nearest",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
      });
      fluidTargets = createFluidTargets(config.simResolution, config.dyeResolution);
      effects = {
        display: effect(gpu, DISPLAY_SHADER, {
          label: "liquid.display",
          set: { uSampler: linear, uContent: ensureContentTexture(), uFluid: fluidTargets.dye.read },
        }),
        splat: effect(gpu, SPLAT_SHADER, {
          label: "liquid.splat",
          set: { uSampler: linear, uTarget: fluidTargets.velocity.read },
        }),
        advect: effect(gpu, ADVECT_SHADER, {
          label: "liquid.advect",
          set: { uSampler: linear, uVelocity: fluidTargets.velocity.read, uSource: fluidTargets.velocity.read },
        }),
        clear: effect(gpu, CLEAR_SHADER, {
          label: "liquid.clear",
          set: { uSampler: nearest, uTexture: fluidTargets.pressure.read },
        }),
        divergence: effect(gpu, DIVERGENCE_SHADER, {
          label: "liquid.divergence",
          set: { uSampler: linear, uVelocity: fluidTargets.velocity.read },
        }),
        curl: effect(gpu, CURL_SHADER, {
          label: "liquid.curl",
          set: { uSampler: linear, uVelocity: fluidTargets.velocity.read },
        }),
        vorticity: effect(gpu, VORTICITY_SHADER, {
          label: "liquid.vorticity",
          set: {
            uVelocitySampler: linear,
            uCurlSampler: nearest,
            uVelocity: fluidTargets.velocity.read,
            uCurl: fluidTargets.curl,
          },
        }),
        pressure: effect(gpu, PRESSURE_SHADER, {
          label: "liquid.pressure",
          set: {
            uSampler: nearest,
            uPressure: fluidTargets.pressure.read,
            uDivergence: fluidTargets.divergence,
          },
        }),
        gradient: effect(gpu, GRADIENT_SHADER, {
          label: "liquid.gradient",
          set: {
            uPressureSampler: nearest,
            uVelocitySampler: linear,
            uPressure: fluidTargets.pressure.read,
            uVelocity: fluidTargets.velocity.read,
          },
        }),
      };
      syncCanvasSize();
      start();
    })
    .catch((error) => {
      if (destroyed) return;
      console.warn("Liquid: WebGPU unavailable, showing content without the effect.", error);
      fallback2d = output.getContext("2d");
      contentDirty = true;
      start();
    });

  function onMotionChange() {
    reducedMotion = motionQuery.matches;
    if (!reducedMotion) start();
  }
  motionQuery.addEventListener("change", onMotionChange);

  const pointers = new Map<number, { x: number; y: number }>();

  function enqueueSplat(splat: Splat) {
    if (queued.length >= MAX_PENDING_SPLATS) queued.shift();
    queued.push(splat);
  }

  function enqueuePointerSplat(id: number, splat: Splat) {
    const previous = pointerSplats.get(id);
    if (previous) {
      splat[2] += previous[2];
      splat[3] += previous[3];
    } else if (pointerSplats.size >= MAX_SPLATS_PER_FRAME) {
      pointerSplats.delete(pointerSplats.keys().next().value!);
    }
    pointerSplats.set(id, splat);
  }

  function suspend() {
    cancelAnimationFrame(raf);
    running = false;
    pointers.clear();
    pointerSplats.clear();
  }

  function onVisibilityChange() {
    if (document.hidden) suspend();
    else start();
  }
  document.addEventListener("visibilitychange", onVisibilityChange);

  const rectCache = createRectCache(output);

  function onPointerMove(event: PointerEvent) {
    if (destroyed || reducedMotion || !visible || document.hidden) return;
    const rect = rectCache.current;
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    if (px < 0 || px > rect.width || py < 0 || py > rect.height) {
      pointers.delete(event.pointerId);
      return;
    }
    const previous = pointers.get(event.pointerId);
    pointers.set(event.pointerId, { x: px, y: py });
    if (!previous) return;
    const dx = (px - previous.x) * config.force;
    const dy = -(py - previous.y) * config.force;
    enqueuePointerSplat(event.pointerId, [px / rect.width, 1 - py / rect.height, dx, dy]);
    start();
  }

  function onPointerDown(event: PointerEvent) {
    if (destroyed || reducedMotion || !visible || document.hidden) return;
    const rect = output.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (x < 0 || x > rect.width || y < 0 || y > rect.height) return;
    pointers.set(event.pointerId, { x, y });
    enqueuePointerSplat(event.pointerId, [x / rect.width, 1 - y / rect.height, 1, 1]);
    start();
  }

  function onPointerLeave(event: PointerEvent) {
    pointers.delete(event.pointerId);
  }

  const listenTarget = window;
  listenTarget.addEventListener("pointerdown", onPointerDown as EventListener, {
    passive: true,
  });
  listenTarget.addEventListener("pointermove", onPointerMove as EventListener, { passive: true });
  listenTarget.addEventListener("pointerup", onPointerLeave as EventListener, {
    passive: true,
  });
  listenTarget.addEventListener("pointerleave", onPointerLeave as EventListener);
  listenTarget.addEventListener("pointercancel", onPointerLeave as EventListener);

  const observer = createCanvasResizeObserver(() => {
    if (destroyed) return;
    syncCanvasSize();
    start();
  });
  observer.observe(output);

  const intersection = new IntersectionObserver((entries) => {
    visible = entries[entries.length - 1]?.isIntersecting ?? true;
    if (destroyed) return;
    if (visible) start();
    else suspend();
  });
  intersection.observe(output);

  return {
    splat(x, y, dx, dy) {
      if (destroyed || reducedMotion) return;
      // Explicit API input is retained while suspended, up to the queue limit.
      enqueueSplat([x, y, dx, dy]);
      start();
    },
    setOptions(next) {
      if (destroyed) return;
      if (
        !Object.entries(next).some(
          ([key, value]) => config[key as keyof LiquidOptions] !== value,
        )
      )
        return;
      const simResolution = next.simResolution ?? config.simResolution;
      const dyeResolution = next.dyeResolution ?? config.dyeResolution;
      const resolutionChanged =
        simResolution !== config.simResolution || dyeResolution !== config.dyeResolution;

      if (resolutionChanged) {
        rebuildFluidTargets(simResolution, dyeResolution);
        config.simResolution = simResolution;
        config.dyeResolution = dyeResolution;
        updateTexelSize();
      }

      Object.assign(config, next);
      start();
    },
    resize() {
      if (destroyed) return;
      syncCanvasSize();
      start();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      queued.length = 0;
      suspend();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      rectCache.destroy();
      cancelAnimationFrame(raf);
      observer.disconnect();
      intersection.disconnect();
      motionQuery.removeEventListener("change", onMotionChange);
      if (fluidTargets) releaseTargets(fluidTargets);
      contentTexture?.destroy();
      screen?.dispose();
      if (htmlInCanvas) paintable.onpaint = null;
      listenTarget.removeEventListener("pointerdown", onPointerDown as EventListener);
      listenTarget.removeEventListener("pointermove", onPointerMove as EventListener);
      listenTarget.removeEventListener("pointerup", onPointerLeave as EventListener);
      listenTarget.removeEventListener("pointerleave", onPointerLeave as EventListener);
      listenTarget.removeEventListener("pointercancel", onPointerLeave as EventListener);
    },
  };
}
