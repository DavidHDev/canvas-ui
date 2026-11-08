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

export interface DropletsOptions {
  /** How much rain falls, from a light drizzle to a downpour (0 to 1.25). */
  intensity?: number;
  /** Animation speed multiplier. */
  speed?: number;
  /** Size of the droplet pattern. Higher means smaller drops. */
  scale?: number;
  /** Width of the droplets and their trails. */
  dropWidth?: number;
  /** How elongated the falling droplets are. */
  dropLength?: number;
  /** How strongly droplets refract the content behind them. */
  refraction?: number;
  /** Background blur outside the droplets, like a fogged up window. */
  blur?: number;
  /** Darkens the edges of the canvas (0 to 1). */
  vignette?: number;
  /** How fast the running drops slide down. */
  fallSpeed?: number;
  /** Horizontal wiggle of the running drops. */
  wiggle?: number;
  /** Multiplier for the small static droplets. */
  staticDrops?: number;
  /** Wipe drops off the glass with the pointer. */
  interactive?: boolean;
  /** Radius of the cursor wipe, relative to the screen height. */
  interactionRadius?: number;
  /** How strongly the cursor wipes drops off the glass (0 to 1). */
  interactionStrength?: number;
  /** How much the wipe distorts the content behind it. */
  interactionDistortion?: number;
  /** Tint color layered over the content as [r, g, b] in 0-1 range. */
  tint?: [number, number, number];
  /** Strength of the tint (0 to 1). */
  tintStrength?: number;
}

export interface DropletsElements {
  /** Canvas with layoutsubtree that hosts the HTML content. */
  source: HTMLCanvasElement;
  /** The element inside the source canvas that gets captured. */
  content: HTMLElement;
  /** Canvas the WebGPU effect renders to. */
  output: HTMLCanvasElement;
}

export interface DropletsInstance {
  /** Update effect options live. */
  setOptions: (options: DropletsOptions) => void;
  /** Re-read canvas size. Call when the element is resized. */
  resize: () => void;
  /** Stop the loop and release all GPU resources. */
  destroy: () => void;
}

const DEFAULTS: Required<DropletsOptions> = {
  intensity: 0.5,
  speed: 1,
  scale: 0.4,
  dropWidth: 1,
  dropLength: 1,
  refraction: 0.2,
  blur: 0,
  vignette: 0,
  fallSpeed: 1,
  wiggle: 1,
  staticDrops: 0.2,
  interactive: true,
  interactionRadius: 0.3,
  interactionStrength: 0.6,
  interactionDistortion: 3,
  tint: [1, 1, 1],
  tintStrength: 0,
};

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

const MAIN_SHADER = /* wgsl */ `
struct Params {
  resolution: vec2f,
  offset: vec2f,
  tint: vec3f,
  time: f32,
  intensity: f32,
  scale: f32,
  dropWidth: f32,
  dropLength: f32,
  refraction: f32,
  blur: f32,
  vignette: f32,
  fallSpeed: f32,
  wiggle: f32,
  staticDrops: f32,
  maxX: f32,
  wipe: f32,
  wipeDistort: f32,
  tintStrength: f32,
  hasContent: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var uContent: texture_2d<f32>;
@group(0) @binding(2) var uTrail: texture_2d<f32>;
@group(0) @binding(3) var uSampler: sampler;

fn S(a: f32, b: f32, t: f32) -> f32 { return smoothstep(a, b, t); }
fn topUv(uv: vec2f) -> vec2f { return vec2f(uv.x, 1.0 - uv.y); }

fn N13(p: f32) -> vec3f {
  var p3 = fract(vec3f(p) * vec3f(0.1031, 0.11369, 0.13787));
  p3 += dot(p3, p3.yzx + vec3f(19.19));
  return fract(vec3f(
    (p3.x + p3.y) * p3.z,
    (p3.x + p3.z) * p3.y,
    (p3.y + p3.z) * p3.x
  ));
}

fn N(t: f32) -> f32 {
  return fract(sin(t * 12345.564) * 7658.76);
}

fn Saw(b: f32, t: f32) -> f32 {
  return S(0.0, b, t) * S(1.0, b, t);
}

fn sdEgg(pIn: vec2f, ra: f32, rb: f32) -> f32 {
  let k = 1.7320508;
  let p = vec2f(abs(pIn.x), pIn.y);
  let r = ra - rb;
  var d: f32;
  if (p.y < 0.0) {
    d = length(vec2f(p.x, p.y)) - r;
  } else if (k * (p.x + r) < p.y) {
    d = length(vec2f(p.x, p.y - k * r));
  } else {
    d = length(vec2f(p.x + r, p.y)) - 2.0 * r;
  }
  return d - rb;
}

fn DropLayer(uvIn: vec2f, t: f32) -> vec2f {
  var uv = uvIn;
  let UV = uv;
  let a = vec2f(6.0, 1.0);
  let grid = a * 2.0;

  var id = floor(uv * grid);
  let gridFall = N(id.x) / 3.0 + 0.5;
  uv = vec2f(uv.x, uv.y + t * gridFall / a.y);
  id = floor(uv * grid);
  uv = vec2f(uv.x, uv.y + N(id.x));

  id = floor(uv * grid);
  let st = fract(uv * grid) - vec2f(0.5, 0.0);
  let n = N13(id.x * 35.2 + id.y * 2376.1);

  var x = n.x - 0.5;
  let lambda = UV.y * 20.0;
  let wiggle = sin(lambda + sin(lambda));
  x += wiggle * (0.5 - abs(x)) * (n.z - 0.5) * params.wiggle;
  x *= 0.6;

  let slowStart = 0.85;
  let ti = fract(t * (gridFall + 0.1) + n.z);
  var y = (Saw(slowStart, ti) - 0.5) * 0.9 + 0.5;
  let p = vec2f(x, y);

  let dropShape = select(0.0, -sin(6.2831853 * ti / (1.0 - slowStart)) * 0.5 - 0.5, ti > slowStart);
  let d = sdEgg((st - p) * a.yx / vec2f(params.dropWidth, params.dropLength), 0.0, dropShape);
  let diameter = N(id.x + id.y) / 7.0 + 0.2;
  let mainDrop = S(diameter / 1.5, 0.0, d);

  let r2 = S(1.0, y, st.y);
  let r = sqrt(r2);
  let cd = abs(st.x - x);
  let thickness = diameter * 0.95 * params.dropWidth;
  var trail = S(thickness * r, 0.0, cd);
  let trailFront = S(-0.02, 0.02, st.y - y);
  trail *= r2 * trailFront * 0.5;

  y = UV.y;
  let trail2 = S((thickness - 0.15) * r, 0.0, cd);
  let rndX = N(id.x) / 1.5 + 0.5;
  let rndY = N(st.y) / 40.0 + 0.05;
  y = fract(y * 11.0 * rndX) + (st.y - 0.5);
  let dd = length(st - vec2f(x, y));
  let droplets = S(trail2 * trailFront * n.z + rndY, 0.0, dd);

  let m = mainDrop + droplets * r * trailFront;
  return vec2f(m, trail);
}

fn StaticDrops(uvIn: vec2f, t: f32) -> f32 {
  var uv = uvIn * 40.0;

  let id = floor(uv);
  let n = N13(id.x * 107.45 + id.y * 3543.654);
  let p = (n.xy - vec2f(0.5)) * 0.6;
  uv = fract(uv) - vec2f(0.5);

  let d = length(uv - p);
  let drop = S(0.3 * clamp(params.dropWidth, 0.4, 1.4), 0.0, d);

  let fade = Saw(0.1, fract(t + n.y));
  let intensity = fract(n.x * 27.0);
  return drop * fade * intensity;
}

fn Drops(uv: vec2f, t: f32, tFall: f32, l0: f32, l1: f32, l2: f32, wipeValue: f32) -> vec2f {
  let s = StaticDrops(uv, t) * l0 * (1.0 - wipeValue);
  let m1 = DropLayer(uv, tFall) * (l1 * (1.0 - wipeValue * 0.8));
  let m2 = DropLayer(uv * 1.85, tFall) * (l2 * (1.0 - wipeValue * 0.8));

  var c = s + m1.x + m2.x;
  c = S(0.3, 1.0, c);

  return vec2f(c, m1.y + m2.y);
}

fn trailAt(uv: vec2f) -> f32 {
  return textureSampleLevel(uTrail, uSampler, topUv(uv), 0.0).r;
}

@fragment fn fs_main(@location(0) inUv: vec2f) -> @location(0) vec4f {
  let uv = vec2f(inUv.x, 1.0 - inUv.y);

  if (uv.x > params.maxX) {
    return vec4f(0.0);
  }

  let aspectUv = (uv + params.offset - vec2f(0.5)) * vec2f(params.resolution.x / params.resolution.y, 1.0);
  let t = params.time * 0.2;
  let dropScale = clamp(min(params.resolution.x, params.resolution.y) / 900.0, 0.75, 1.35) * params.scale;
  let scaledUv = aspectUv * dropScale;

  let rainAmount = clamp(params.intensity, 0.0, 1.25);

  let staticDropAmount = S(-0.5, 1.0, rainAmount) * 2.0 * params.staticDrops;
  let layer1 = S(0.25, 0.75, rainAmount);
  let layer2 = S(0.0, 0.5, rainAmount);
  let tFall = t * params.fallSpeed;

  let wipeMask = trailAt(uv);
  let wipeValue = wipeMask * clamp(params.wipe, 0.0, 1.0);

  let c = Drops(scaledUv, t, tFall, staticDropAmount, layer1, layer2, wipeValue);

  let e = vec2f(0.001, 0.0);
  let cx = Drops(scaledUv + e, t, tFall, staticDropAmount, layer1, layer2, wipeValue).x;
  let cy = Drops(scaledUv + e.yx, t, tFall, staticDropAmount, layer1, layer2, wipeValue).x;
  var normal = vec2f(cx - c.x, cy - c.x);

  let e2 = vec2f(0.012, 0.0);
  let wx = trailAt(uv + e2);
  let wy = trailAt(uv + e2.yx);
  normal += vec2f(wipeMask - wx, wipeMask - wy) * 0.05 * params.wipeDistort * clamp(params.wipe, 0.0, 1.0);

  let refractedUv = clamp(uv + normal * params.refraction, vec2f(0.001), vec2f(params.maxX - 0.004, 0.999));
  let fog = clamp(params.blur, 0.0, 8.0) * mix(0.7, 1.0, rainAmount);
  let back = fog * (1.0 - clamp(c.y * 2.0, 0.0, 1.0)) * (1.0 - wipeValue);
  let focus = mix(back, 0.0, S(0.1, 0.2, c.x));

  if (params.hasContent < 0.5) {
    let mask = S(0.02, 0.14, c.x);
    let n3 = normalize(vec3f(normal * 42.0, 1.0));
    let L = normalize(vec3f(-0.35, 0.75, 0.55));
    let spec = pow(max(dot(reflect(vec3f(0.0, 0.0, -1.0), n3), L), 0.0), 34.0);
    let rim = clamp(length(normal) * 26.0, 0.0, 1.0);
    let dropCol = mix(vec3f(0.72), params.tint, clamp(params.tintStrength, 0.0, 1.0));
    let colF = dropCol * (0.12 + 0.5 * rim) + vec3f(spec);
    let alphaF = mask * clamp(0.1 + rim * 0.5 + spec * 0.9, 0.0, 1.0);
    return vec4f(clamp(colF, vec3f(0.0), vec3f(1.0)) * alphaF, alphaF);
  }

  let content = textureSampleLevel(uContent, uSampler, topUv(refractedUv), focus);
  var col = content.rgb;

  col = mix(col, params.tint, clamp(params.tintStrength, 0.0, 1.0) * 0.35);

  let vignetteUv = uv - vec2f(0.5);
  col *= 1.0 - dot(vignetteUv, vignetteUv) * clamp(params.vignette, 0.0, 1.0) * 2.0;

  return vec4f(col * content.a, content.a);
}`;

const TRAIL_SHADER = /* wgsl */ `
struct TrailParams {
  fromPoint: vec2f,
  toPoint: vec2f,
  aspect: f32,
  radius: f32,
  decay: f32,
  drain: f32,
  splat: f32,
}

@group(0) @binding(0) var<uniform> params: TrailParams;
@group(0) @binding(1) var uPrev: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

fn capsule(p: vec2f, a: vec2f, b: vec2f) -> f32 {
  let pa = p - a;
  let ba = b - a;
  let h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}

@fragment fn fs_main(@location(0) inUv: vec2f) -> @location(0) vec4f {
  let uv = vec2f(inUv.x, 1.0 - inUv.y);
  let prev = max(textureSampleLevel(uPrev, uSampler, inUv, 0.0).r * params.decay - params.drain, 0.0);
  let p = vec2f(uv.x * params.aspect, uv.y);
  let a = vec2f(params.fromPoint.x * params.aspect, params.fromPoint.y);
  let b = vec2f(params.toPoint.x * params.aspect, params.toPoint.y);
  let d = capsule(p, a, b);
  let m = smoothstep(params.radius, params.radius * 0.5, d) * params.splat;
  return vec4f(max(prev, m), 0.0, 0.0, 1.0);
}`;

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

/** One WebGPU device per page, shared by every Droplets instance. */
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

export function createDroplets(
  elements: DropletsElements,
  options: DropletsOptions = {},
): DropletsInstance | null {
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
  let trailFx: Effect | null = null;
  let contentTexture: Texture | null = null;
  let fallback2d: CanvasRenderingContext2D | null = null;
  let linearSampler: GPUSampler | null = null;
  let mipmapLayout: GPUBindGroupLayout | null = null;
  let mipmapPipeline: GPURenderPipeline | null = null;

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

  let trailWidth = 0;
  let trailHeight = 0;
  const trailTargets: [Target | null, Target | null] = [null, null];
  let trailIndex = 0;

  function clearTarget(value: Target) {
    gpuFrame(gpu!, (f) => f.pass({ target: value, clear: [0, 0, 0, 1] }, () => {}));
  }

  function ensureTrailTargets() {
    const width = Math.max(1, Math.round(output.width / 4));
    const height = Math.max(1, Math.round(output.height / 4));
    if (width === trailWidth && height === trailHeight && trailTargets[0] && trailTargets[1]) {
      return;
    }
    trailWidth = width;
    trailHeight = height;
    destroyTarget(trailTargets[0]);
    destroyTarget(trailTargets[1]);
    trailTargets[0] = target(gpu!, {
      size: [width, height],
      format: "rgba8unorm",
      label: "droplets.trail-a",
    });
    trailTargets[1] = target(gpu!, {
      size: [width, height],
      format: "rgba8unorm",
      label: "droplets.trail-b",
    });
    clearTarget(trailTargets[0]);
    clearTarget(trailTargets[1]);
    trailIndex = 0;
  }

  const pointer = {
    x: 0.5,
    y: 0.5,
    px: 0.5,
    py: 0.5,
    seen: false,
    moved: false,
  };

  function updateTrail(delta: number): Target | null {
    if (!gpu || !trailFx) return null;
    ensureTrailTargets();
    const prev = trailTargets[trailIndex]!;
    const next = trailTargets[1 - trailIndex]!;
    trailFx.set({
      uPrev: prev,
      params: {
        decay: Math.exp(-delta * 0.5),
        drain: delta * 0.3,
        aspect: output.width / Math.max(output.height, 1),
        fromPoint: [pointer.px, pointer.py],
        toPoint: [pointer.x, pointer.y],
        radius: Math.max(config.interactionRadius, 0.01),
        splat: config.interactive && pointer.moved ? 1 : 0,
      },
    });
    trailIndex = 1 - trailIndex;
    pointer.px = pointer.x;
    pointer.py = pointer.y;
    pointer.moved = false;
    return next;
  }

  function ensureContentTexture(): Texture {
    const width = Math.max(1, source.width);
    const height = Math.max(1, source.height);
    const mipLevelCount = mipLevelCountFor(width, height);
    if (
      !contentTexture ||
      contentTexture.size[0] !== width ||
      contentTexture.size[1] !== height ||
      contentTexture.mipLevelCount !== mipLevelCount
    ) {
      contentTexture?.destroy();
      contentTexture = gpu!.device.createTexture({
        size: [width, height],
        format: "rgba8unorm",
        usage: ["texture_binding", "copy_dst", "render_attachment"],
        mipLevelCount,
        label: "droplets.content",
      });
    }
    return contentTexture;
  }

  function mipLevelCountFor(width: number, height: number): number {
    return Math.floor(Math.log2(Math.max(width, height))) + 1;
  }

  function ensureMipmapPipeline(): GPURenderPipeline | null {
    if (!gpu || !linearSampler) return null;
    if (!mipmapLayout) {
      mipmapLayout = gpu.gpu.createBindGroupLayout({
        label: "droplets.mipmap.layout",
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
        label: "droplets.mipmap",
        code: MIPMAP_SHADER,
      });
      mipmapPipeline = gpu.gpu.createRenderPipeline({
        label: "droplets.mipmap",
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
    const encoder = gpu.gpu.createCommandEncoder({ label: "droplets.mipmap" });
    for (let level = 1; level < texture.mipLevelCount; level++) {
      const bindGroup = gpu.gpu.createBindGroup({
        label: "droplets.mipmap",
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
        label: "droplets.mipmap",
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

  function uploadContent() {
    if (!htmlInCanvas || !contentDirty || !gpu) return;
    contentDirty = false;
    const texture = ensureContentTexture();
    gpu.gpu.queue.copyExternalImageToTexture(
      { source },
      { texture: texture.gpu },
      [source.width, source.height],
    );
    generateMipmaps(texture);
    fx!.set({ uContent: texture });
  }

  function render(timeSec: number, trailTarget: Target | null) {
    if (!gpu || !fx || !screen) return;
    uploadContent();
    ensureTrailTargets();
    fx.set({
      uTrail: trailTargets[trailIndex]!,
      params: {
        hasContent: htmlInCanvas ? 1 : 0,
        resolution: [output.width, output.height],
        offset: [
          content.scrollLeft / Math.max(content.clientWidth, 1),
          -content.scrollTop / Math.max(content.clientHeight, 1),
        ],
        time: timeSec,
        intensity: config.intensity,
        scale: Math.max(config.scale, 0.01),
        dropWidth: Math.max(config.dropWidth, 0.05),
        dropLength: Math.max(config.dropLength, 0.05),
        refraction: config.refraction,
        blur: Math.max(config.blur, 0),
        vignette: config.vignette,
        fallSpeed: config.fallSpeed,
        wiggle: config.wiggle,
        staticDrops: config.staticDrops,
        maxX: contentMaxX,
        wipe: config.interactive
          ? Math.min(Math.max(config.interactionStrength, 0), 1)
          : 0,
        wipeDistort: Math.max(config.interactionDistortion, 0),
        tint: config.tint,
        tintStrength: config.tintStrength,
      },
    });
    gpuFrame(gpu, (f) => {
      if (trailTarget) f.pass(trailTarget, trailFx!);
      f.pass(screen!, fx!);
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
  let elapsed = 0;
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
    elapsed += delta * config.speed;
    const trailTarget = updateTrail(delta);
    render(elapsed, trailTarget);
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
        label: "droplets",
      });
      linearSampler = sampler(gpu, {
        minFilter: "linear",
        magFilter: "linear",
        mipmapFilter: "linear",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
      });
      ensureTrailTargets();
      trailFx = effect(gpu, TRAIL_SHADER, {
        label: "droplets.trail",
        set: { uSampler: linearSampler, uPrev: trailTargets[0]! },
      });
      fx = effect(gpu, MAIN_SHADER, {
        label: "droplets",
        set: {
          uSampler: linearSampler,
          uContent: ensureContentTexture(),
          uTrail: trailTargets[0]!,
        },
      });
      syncCanvasSize();
      start();
    })
    .catch((error) => {
      if (destroyed) return;
      console.warn("Droplets: WebGPU unavailable, showing content without the effect.", error);
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
    if (!config.interactive || reducedMotion) return;
    const rect = rectCache.current;
    const x = (event.clientX - rect.left) / Math.max(rect.width, 1);
    const y = 1 - (event.clientY - rect.top) / Math.max(rect.height, 1);
    if (!pointer.seen) {
      pointer.seen = true;
      pointer.px = x;
      pointer.py = y;
    }
    pointer.x = x;
    pointer.y = y;
    pointer.moved = true;
    start();
  }

  function onPointerLeave() {
    pointer.seen = false;
  }

  listenTarget.addEventListener("pointermove", onPointerMove, { passive: true });
  listenTarget.addEventListener("pointerleave", onPointerLeave, { passive: true });
  content.addEventListener("scroll", start, { passive: true });

  return {
    setOptions(next) {
      if (
        !Object.entries(next).some(
          ([key, value]) => config[key as keyof DropletsOptions] !== value,
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
      content.removeEventListener("scroll", start);
      contentTexture?.destroy();
      destroyTarget(trailTargets[0]);
      destroyTarget(trailTargets[1]);
      screen?.dispose();
      if (htmlInCanvas) paintable.onpaint = null;
    },
  };
}
