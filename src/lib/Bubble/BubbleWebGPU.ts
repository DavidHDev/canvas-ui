import { getCanvasPixelRatio, createCanvasResizeObserver } from "../canvas-viewport";
import { isHtmlInCanvasBlocked, prepareHtmlInCanvas, drawHtmlInCanvas } from "../html-in-canvas";
import {
  effect as gpuEffect,
  frame as gpuFrame,
  init,
  sampler,
  surface,
  type Effect,
  type Gpu,
  type Surface,
} from "vgpu";
import type { Texture } from "vgpu";
import { resolveOptions } from "../options";

export type BubbleClick = "pop" | "none";

export type BubbleOptions = {
  size?: number;
  trail?: number;
  follow?: number;
  blend?: number;
  speed?: number;
  refraction?: number;
  dispersion?: number;
  frost?: number;
  shine?: number;
  rim?: number;
  iridescence?: number;
  intensity?: number;
  tint?: [number, number, number];
  tintStrength?: number;
  colorA?: [number, number, number];
  colorB?: [number, number, number];
  fallbackOpacity?: number;
  click?: BubbleClick;
  wobble?: number;
  drift?: number;
};

export type BubbleElements = {
  output: HTMLCanvasElement;
  source?: HTMLCanvasElement | null;
  content?: HTMLElement | null;
};

export type BubbleInstance = {
  setOptions: (options: BubbleOptions) => void;
  resize: () => void;
  destroy: () => void;
};

const DEFAULTS: Required<BubbleOptions> = {
  size: 30,
  trail: 24,
  follow: 0.5,
  blend: 14,
  speed: 2,
  refraction: 80,
  dispersion: 1,
  frost: 0,
  shine: 0.5,
  rim: 1,
  iridescence: 1,
  intensity: 0.9,
  tint: [1, 1, 1],
  tintStrength: 0,
  colorA: [0.2902, 0.4549, 0.7216],
  colorB: [0.4118, 0.4118, 0.4157],
  fallbackOpacity: 1,
  click: "none",
  wobble: 0,
  drift: 0,
};

const MAX_TRAIL = 24;
const SPRAY = 10;
const MAX_BLOBS = MAX_TRAIL + SPRAY;
const HISTORY = 256;
const TRAIL_STEP = 1 / 60;

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

const MIPMAP_SHADER = `
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

const SHADER = `
struct Params {
  blobs: array<vec4f, ${MAX_BLOBS}>,
  deform: vec4f,
  tint: vec4f,
  colorA: vec4f,
  colorB: vec4f,
  resolution: vec2f,
  maxX: f32,
  dpr: f32,
  time: f32,
  hasContent: f32,
  count: u32,
  blend: f32,
  refraction: f32,
  dispersion: f32,
  frost: f32,
  shine: f32,
  rim: f32,
  iridescence: f32,
  intensity: f32,
  tintStrength: f32,
  fallbackAlpha: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var uContent: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

const EPS = 0.0001;
const ITR = 16;

fn cubic(uv: vec2f, level: f32) -> vec3f {
  let size = max(floor(vec2f(textureDimensions(uContent, 0)) / exp2(level)), vec2f(1.0));
  let st = uv * size - 0.5;
  let f = fract(st);
  let corner = st - f + 0.5;
  let w0 = (1.0 - f) * (1.0 - f) * (1.0 - f) / 6.0;
  let w1 = (3.0 * f * f * f - 6.0 * f * f + 4.0) / 6.0;
  let w3 = f * f * f / 6.0;
  let g0 = w0 + w1;
  let g1 = 1.0 - g0;
  let p0 = (corner + w1 / g0 - 1.0) / size;
  let p1 = (corner + w3 / g1 + 1.0) / size;
  return g0.y * (g0.x * textureSampleLevel(uContent, uSampler, vec2f(p0.x, p0.y), level).rgb +
      g1.x * textureSampleLevel(uContent, uSampler, vec2f(p1.x, p0.y), level).rgb) +
    g1.y * (g0.x * textureSampleLevel(uContent, uSampler, vec2f(p0.x, p1.y), level).rgb +
      g1.x * textureSampleLevel(uContent, uSampler, vec2f(p1.x, p1.y), level).rgb);
}

fn page(px: vec2f, lod: f32) -> vec3f {
  var uv = px / params.resolution;
  uv.x = clamp(uv.x, 0.0005, params.maxX - 0.0005);
  uv.y = clamp(uv.y, 0.0005, 0.9995);
  uv.y = 1.0 - uv.y;
  var color = textureSampleLevel(uContent, uSampler, uv, lod).rgb;
  if (lod > 0.01) {
    let lower = floor(lod);
    let soft = mix(cubic(uv, lower), cubic(uv, lower + 1.0), lod - lower);
    color = mix(color, soft, min(lod, 1.0));
  }
  return pow(color, vec3f(2.2));
}

fn rnd3D(p: vec3f) -> f32 {
  return fract(sin(dot(p, vec3f(12.9898, 78.233, 37.719))) * 43758.5453123);
}

fn noise3D(p: vec3f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let a000 = rnd3D(i);
  let a100 = rnd3D(i + vec3f(1.0, 0.0, 0.0));
  let a010 = rnd3D(i + vec3f(0.0, 1.0, 0.0));
  let a110 = rnd3D(i + vec3f(1.0, 1.0, 0.0));
  let a001 = rnd3D(i + vec3f(0.0, 0.0, 1.0));
  let a101 = rnd3D(i + vec3f(1.0, 0.0, 1.0));
  let a011 = rnd3D(i + vec3f(0.0, 1.0, 1.0));
  let a111 = rnd3D(i + vec3f(1.0, 1.0, 1.0));
  let u = f * f * (3.0 - 2.0 * f);
  let k0 = a000;
  let k1 = a100 - a000;
  let k2 = a010 - a000;
  let k3 = a001 - a000;
  let k4 = a000 - a100 - a010 + a110;
  let k5 = a000 - a010 - a001 + a011;
  let k6 = a000 - a100 - a001 + a101;
  let k7 = -a000 + a100 + a010 - a110 + a001 - a101 - a011 + a111;
  return k0 + k1 * u.x + k2 * u.y + k3 * u.z + k4 * u.x * u.y +
    k5 * u.y * u.z + k6 * u.z * u.x + k7 * u.x * u.y * u.z;
}

fn smoothMin(d1: f32, d2: f32, k: f32) -> f32 {
  let h = exp(-k * d1) + exp(-k * d2);
  return -log(max(h, 0.000000000001)) / k;
}

fn mapBubble(p: vec3f) -> f32 {
  var d = 100000.0;
  let m = params.deform;
  for (var i = 0u; i < ${MAX_BLOBS}u; i++) {
    if (i >= params.count) { break; }
    let blob = params.blobs[i];
    let o = p.xy - blob.xy;
    let q = vec2f(m.x * o.x + m.y * o.y, m.y * o.x + m.z * o.y);
    let sphere = length(vec3f(q, p.z)) - blob.z;
    d = smoothMin(d, sphere, params.blend);
  }
  return d;
}

fn generateNormal(p: vec3f) -> vec3f {
  return normalize(vec3f(
    mapBubble(p + vec3f(EPS, 0.0, 0.0)) - mapBubble(p + vec3f(-EPS, 0.0, 0.0)),
    mapBubble(p + vec3f(0.0, EPS, 0.0)) - mapBubble(p + vec3f(0.0, -EPS, 0.0)),
    mapBubble(p + vec3f(0.0, 0.0, EPS)) - mapBubble(p + vec3f(0.0, 0.0, -EPS))));
}

fn dropletColor(normal: vec3f, rayDir: vec3f) -> vec3f {
  let reflectDir = reflect(rayDir, normal);
  let noisePosTime = noise3D(reflectDir * 2.0 + params.time);
  let noiseNegTime = noise3D(reflectDir * 2.0 - params.time);
  let color0 = params.colorA.rgb * noisePosTime;
  let color1 = params.colorB.rgb * noiseNegTime;
  return (color0 + color1) * params.intensity;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let frag = vec2f(uv.x * params.resolution.x, (1.0 - uv.y) * params.resolution.y);
  let minRes = min(params.resolution.x, params.resolution.y);
  let p = (frag * 2.0 - params.resolution) / minRes;
  var ray = vec3f(p, 1.0);
  let rayDir = vec3f(0.0, 0.0, -1.0);
  var dist = 0.0;

  for (var i = 0; i < ITR; i++) {
    dist = mapBubble(ray);
    ray += rayDir * dist;
    if (dist < EPS || dist > 8.0) { break; }
  }

  let cov = 1.0 - smoothstep(0.0, 3.0 / minRes, dist);
  if (!(cov > 0.001)) {
    return vec4f(0.0);
  }

  let n = generateNormal(ray);
  let glints = pow(max(dropletColor(n, rayDir), vec3f(0.0)), vec3f(7.0));
  let L = normalize(vec3f(-0.5, 0.7, 0.6));
  let spec = pow(max(dot(reflect(-L, n), vec3f(0.0, 0.0, 1.0)), 0.0), 60.0);

  if (params.hasContent > 0.5) {
    let depth = params.refraction * params.dpr;
    let ca = params.dispersion * 0.03;
    let rvR = refract(rayDir, n, 1.0 / (1.33 - ca));
    let rvG = refract(rayDir, n, 1.0 / 1.33);
    let rvB = refract(rayDir, n, 1.0 / (1.33 + ca));
    let offR = rvR.xy * (depth / max(abs(rvR.z), 0.35));
    let offG = rvG.xy * (depth / max(abs(rvG.z), 0.35));
    let offB = rvB.xy * (depth / max(abs(rvB.z), 0.35));
    let lod = max(params.frost * 5.0, log2(1.0 + length(offG) * 0.05 / params.dpr));
    var refr = vec3f(
      page(frag + offR, lod).r,
      page(frag + offG, lod).g,
      page(frag + offB, lod).b);
    refr *= mix(vec3f(1.0), params.tint.rgb, clamp(params.tintStrength, 0.0, 1.0));
    let edge = pow(1.0 - clamp(n.z, 0.0, 1.0), 3.0);
    refr *= max(1.0 - 0.9 * params.rim * edge, 0.0);
    var color = pow(max(refr, vec3f(0.0)), vec3f(1.0 / 2.2));
    color += glints * params.iridescence;
    color += vec3f(spec * params.shine * 0.9);
    return vec4f(color * cov, cov);
  }

  let edge = pow(1.0 - clamp(n.z, 0.0, 1.0), 1.5);
  let filmTint = mix(vec3f(0.9), params.tint.rgb, clamp(params.tintStrength, 0.0, 1.0));
  let fade = cov * clamp(params.fallbackAlpha, 0.0, 1.0);
  let light = glints * params.iridescence * 0.65 + vec3f(spec * params.shine * 1.5) +
    filmTint * (0.55 * max(params.rim, 0.4) * edge + 0.03);
  let a = fade * clamp(0.08 + 0.4 * edge, 0.0, 1.0);
  return vec4f(light * fade, a);
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

export function supportsWebGPU(): boolean {
  return typeof navigator !== "undefined" && Boolean(navigator.gpu);
}

let sharedGpu: Promise<Gpu> | null = null;

function acquireGpu(): Promise<Gpu> {
  if (!sharedGpu) {
    sharedGpu = init().catch((error) => {
      sharedGpu = null;
      throw error;
    });
  }
  return sharedGpu;
}

function mipLevelCountFor(width: number, height: number): number {
  return Math.floor(Math.log2(Math.max(width, height))) + 1;
}

export function createBubble(
  elements: BubbleElements,
  options: BubbleOptions = {},
): BubbleInstance | null {
  if (!supportsWebGPU()) return null;
  const config = { ...DEFAULTS, ...resolveOptions(DEFAULTS, options) };
  const { output } = elements;
  const source = elements.source ?? null;
  const content = elements.content ?? null;

  const sourceCtx = source
    ? (source.getContext("2d") as ElementImageContext | null)
    : null;
  const paintable = source as PaintableCanvas | null;
  const htmlInCanvas = Boolean(
    !isHtmlInCanvasBlocked() &&
    source &&
    content &&
    source.contains(content) &&
    sourceCtx &&
    typeof sourceCtx.drawElementImage === "function" &&
    typeof paintable?.requestPaint === "function",
  );

  if (htmlInCanvas) prepareHtmlInCanvas(source!, content!);

  let contentDirty = false;
  let wake = () => {};

  if (htmlInCanvas) {
    paintable!.onpaint = () => {
      try {
        sourceCtx!.reset();
        drawHtmlInCanvas(source!, sourceCtx!, content!, true);
        contentDirty = true;
        wake();
      } catch {}
    };
  }

  let gpu: Gpu | null = null;
  let screen: Surface | null = null;
  let fx: Effect | null = null;
  let linearSampler: GPUSampler | null = null;
  let mipmapLayout: GPUBindGroupLayout | null = null;
  let mipmapPipeline: GPURenderPipeline | null = null;
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
    contentMaxX = content
      ? Math.min(
          1,
          Math.max(0.05, content.clientWidth / Math.max(output.clientWidth, 1)),
        )
      : 1;
    if (htmlInCanvas) {
      const sourceWidth = Math.max(1, Math.round(source!.clientWidth * dpr));
      const sourceHeight = Math.max(1, Math.round(source!.clientHeight * dpr));
      if (source!.width !== sourceWidth || source!.height !== sourceHeight) {
        source!.width = sourceWidth;
        source!.height = sourceHeight;
      }
      paintable!.requestPaint!();
    }
  }

  syncCanvasSize();

  function ensureMipmapPipeline(): GPURenderPipeline | null {
    if (!gpu || !linearSampler) return null;
    if (!mipmapLayout) {
      mipmapLayout = gpu.gpu.createBindGroupLayout({
        label: "bubble.mipmap.layout",
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
        label: "bubble.mipmap",
        code: MIPMAP_SHADER,
      });
      mipmapPipeline = gpu.gpu.createRenderPipeline({
        label: "bubble.mipmap",
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
    const encoder = gpu.gpu.createCommandEncoder({ label: "bubble.mipmap" });
    for (let level = 1; level < texture.mipLevelCount; level++) {
      const bindGroup = gpu.gpu.createBindGroup({
        label: "bubble.mipmap",
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
        label: "bubble.mipmap",
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

  function ensureContentTexture(): Texture {
    const w = Math.max(1, source?.width ?? 1);
    const h = Math.max(1, source?.height ?? 1);
    const mipLevelCount = mipLevelCountFor(w, h);
    if (
      !contentTexture ||
      contentTexture.size[0] !== w ||
      contentTexture.size[1] !== h ||
      contentTexture.mipLevelCount !== mipLevelCount
    ) {
      contentTexture?.destroy();
      contentTexture = gpu!.device.createTexture({
        size: [w, h],
        format: "rgba8unorm",
        usage: ["texture_binding", "copy_dst", "render_attachment"],
        mipLevelCount,
        label: "bubble.content",
      });
    }
    return contentTexture;
  }

  function uploadContent() {
    if (!htmlInCanvas || !contentDirty || !gpu || !fx) return;
    contentDirty = false;
    const texture = ensureContentTexture();
    gpu.gpu.queue.copyExternalImageToTexture(
      { source: source! },
      { texture: texture.gpu, mipLevel: 0 },
      [source!.width, source!.height],
    );
    generateMipmaps(texture);
    fx.set({ uContent: texture });
  }

  function clearScreen() {
    if (!gpu || !screen) return;
    gpuFrame(gpu, (f) => f.pass({ target: screen!, clear: [0, 0, 0, 0] }, () => {}));
  }

  function renderFallback() {
    if (!fallback2d || !htmlInCanvas || !contentDirty) return;
    contentDirty = false;
    fallback2d.clearRect(0, 0, output.width, output.height);
    fallback2d.drawImage(source!, 0, 0, output.width, output.height);
  }

  const historyX = new Float32Array(HISTORY);
  const historyY = new Float32Array(HISTORY);
  const historyTime = new Float64Array(HISTORY);
  let historyHead = 0;
  let historyLength = 0;
  let clock = 0;

  function pushHistory(x: number, y: number) {
    historyHead = (historyHead + 1) % HISTORY;
    historyX[historyHead] = x;
    historyY[historyHead] = y;
    historyTime[historyHead] = clock;
    historyLength = Math.min(historyLength + 1, HISTORY);
  }

  function resetHistory(x: number, y: number) {
    historyLength = 0;
    pushHistory(x, y);
  }

  const sampled = { x: 0, y: 0 };

  function sampleHistory(at: number) {
    let newer = historyHead;
    for (let step = 1; step < historyLength; step++) {
      const older = (historyHead - step + HISTORY) % HISTORY;
      if (historyTime[older] <= at) {
        const span = historyTime[newer] - historyTime[older];
        const k = span > 0 ? (at - historyTime[older]) / span : 0;
        sampled.x = historyX[older] + (historyX[newer] - historyX[older]) * k;
        sampled.y = historyY[older] + (historyY[newer] - historyY[older]) * k;
        return;
      }
      newer = older;
    }
    sampled.x = historyX[newer];
    sampled.y = historyY[newer];
  }

  let headX = output.clientWidth / 2;
  let headY = output.clientHeight / 2;
  let targetX = headX;
  let targetY = headY;
  resetHistory(headX, headY);
  let presence = 0;
  let presenceVelocity = 0;
  let pointerInside = false;
  let shown = false;
  let mass = 1;
  let massVelocity = 0;
  let time = 0;
  let driftTime = 0;
  let lastMove = 0;

  let stretchX = 0;
  let stretchY = 0;
  let stretchVelocityX = 0;
  let stretchVelocityY = 0;

  const sprayX = new Float32Array(SPRAY);
  const sprayY = new Float32Array(SPRAY);
  const sprayVelocityX = new Float32Array(SPRAY);
  const sprayVelocityY = new Float32Array(SPRAY);
  const sprayRadius = new Float32Array(SPRAY);
  const sprayAge = new Float32Array(SPRAY);
  const sprayTurn = new Float32Array(SPRAY);
  const sprayAlive = new Uint8Array(SPRAY);
  const sprayMerge = new Float32Array(SPRAY);
  const sprayKeep = new Float32Array(SPRAY);
  let spraying = false;

  function activeCount(): number {
    return Math.min(Math.max(Math.round(config.trail), 1), MAX_TRAIL);
  }

  function pooledRadius(): number {
    const beads = activeCount();
    const blend = Math.max(config.blend, 0.5);
    const unit = Math.min(output.clientWidth, output.clientHeight) / 2;
    const base = Math.max(config.size, 4) / (unit * beads);
    let swell = 0;
    for (let i = 0; i < beads; i++) swell += Math.exp(blend * base * (beads - i));
    return (Math.log(swell) / blend) * unit;
  }

  function driftAmount(): number {
    return reducedMotion ? 0 : Math.min(Math.max(config.drift, 0), 1);
  }

  const blobData: [number, number, number, number][] = Array.from(
    { length: MAX_BLOBS },
    () => [0, 0, 0, 0],
  );

  function render() {
    if (!gpu || !fx || !screen) return;
    uploadContent();
    const dpr = dprNow;
    const [width, height] = screen.size;
    const minRes = Math.min(width, height);
    const blend = Math.max(config.blend, 0.5);
    let count = 0;
    let headRadius = 0;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    const push = (x: number, y: number, radius: number) => {
      const dx = x * dpr;
      const dy = height - y * dpr;
      const blob = blobData[count];
      blob[0] = (dx * 2 - width) / minRes;
      blob[1] = (dy * 2 - height) / minRes;
      blob[2] = radius;
      count++;
      minX = Math.min(minX, dx);
      maxX = Math.max(maxX, dx);
      minY = Math.min(minY, dy);
      maxY = Math.max(maxY, dy);
    };

    if (presence > 0.004 && mass > 0.001) {
      const beads = activeCount();
      headRadius = Math.max(config.size, 4) * dpr * presence;
      const baseRadius = (headRadius * 2) / (minRes * beads);
      let shrink = 0;
      if (mass < 1) {
        let swell = 0;
        for (let i = 0; i < beads; i++) {
          swell += Math.exp(blend * baseRadius * (beads - i));
        }
        shrink = ((1 - mass) * Math.log(swell)) / blend;
      }
      for (let i = 0; i < beads; i++) {
        sampleHistory(clock - i * TRAIL_STEP);
        push(sampled.x, sampled.y, baseRadius * (beads - i) - shrink);
      }
    }
    if (spraying && presence > 0.004) {
      for (let i = 0; i < SPRAY; i++) {
        if (!sprayAlive[i]) continue;
        let overlap = 1;
        for (let j = 0; j < SPRAY; j++) {
          if (j === i || !sprayAlive[j]) continue;
          const gap = Math.hypot(sprayX[i] - sprayX[j], sprayY[i] - sprayY[j]);
          overlap += sprayKeep[j] * Math.exp((-blend * gap * dpr * 2) / minRes);
        }
        push(
          sprayX[i],
          sprayY[i],
          ((sprayRadius[i] * dpr * 2) / minRes) * presence * sprayKeep[i] +
            Math.log(Math.max(sprayKeep[i], 1e-4) / overlap) / blend,
        );
      }
    }
    if (count === 0) {
      clearScreen();
      return;
    }

    const pad =
      headRadius +
      ((Math.log(count + 1) / blend) * minRes) / 2 +
      Math.abs(config.refraction) * dpr * 0.5 +
      32 * dpr;
    const sx = Math.min(width - 1, Math.max(0, Math.floor(minX - pad)));
    const sy = Math.min(height - 1, Math.max(0, Math.floor(minY - pad)));
    const sw = Math.max(
      1,
      Math.min(width - sx, Math.ceil(maxX - minX + pad * 2)),
    );
    const sh = Math.max(
      1,
      Math.min(height - sy, Math.ceil(maxY - minY + pad * 2)),
    );
    const scissorY = Math.max(0, height - sy - sh);

    const amount = Math.min(Math.hypot(stretchX, stretchY), 0.35);
    const angle = Math.atan2(stretchY, stretchX) / 2;
    const stretch = Math.exp(amount);
    const axisX = Math.cos(angle);
    const axisY = Math.sin(angle);
    const deform00 = (axisX * axisX) / stretch + stretch * axisY * axisY;
    const deform01 = axisX * axisY * (1 / stretch - stretch);
    const deform11 = (axisY * axisY) / stretch + stretch * axisX * axisX;

    fx.set({
      params: {
        blobs: blobData,
        deform: [deform00, deform01, deform11, 0],
        tint: [...config.tint, 0],
        colorA: [...config.colorA, 0],
        colorB: [...config.colorB, 0],
        resolution: [width, height],
        maxX: contentMaxX,
        dpr,
        time,
        hasContent: htmlInCanvas ? 1 : 0,
        count,
        blend,
        refraction: config.refraction,
        dispersion: Math.max(config.dispersion, 0),
        frost: Math.min(Math.max(config.frost, 0), 1),
        shine: Math.max(config.shine, 0),
        rim: Math.min(Math.max(config.rim, 0), 2),
        iridescence: Math.max(config.iridescence, 0),
        intensity: Math.max(config.intensity, 0),
        tintStrength: Math.min(Math.max(config.tintStrength, 0), 1),
        fallbackAlpha: Math.min(Math.max(config.fallbackOpacity, 0), 1),
      },
    });
    gpuFrame(gpu, (f) =>
      f.pass(
        { target: screen!, clear: [0, 0, 0, 0], scissor: [sx, scissorY, sw, sh] },
        fx!,
      ),
    );
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
    clock += delta;
    if (!reducedMotion) time += delta * Math.max(config.speed, 0);

    const drifting = !pointerInside && driftAmount() > 0;
    if (drifting) {
      driftTime += delta * (0.25 + driftAmount() * 1.1);
      const width = output.clientWidth;
      const height = output.clientHeight;
      targetX =
        width *
        (0.5 + 0.3 * Math.sin(driftTime * 0.9 + 1.3) + 0.08 * Math.sin(driftTime * 2.3));
      targetY =
        height *
        (0.5 + 0.26 * Math.cos(driftTime * 0.7) + 0.08 * Math.sin(driftTime * 1.9 + 0.5));
      if (!shown) {
        headX = targetX;
        headY = targetY;
        resetHistory(headX, headY);
        shown = true;
      }
    }

    const follow = Math.min(Math.max(config.follow, 0.02), 1);
    const kHead =
      reducedMotion || follow >= 1
        ? 1
        : 1 - Math.exp(-delta * (drifting ? 2.5 : 3 + follow * 30));
    const previousX = headX;
    const previousY = headY;
    headX += (targetX - headX) * kHead;
    headY += (targetY - headY) * kHead;
    pushHistory(headX, headY);
    if (Math.abs(headX - previousX) + Math.abs(headY - previousY) > 0.05) {
      lastMove = clock;
    }

    const wobble = reducedMotion ? 0 : Math.min(Math.max(config.wobble, 0), 1);
    const presenceTarget = pointerInside || drifting ? 1 : 0;
    if (wobble > 0) {
      const stiffness = 13;
      const damping = 1 - 0.55 * wobble;
      presenceVelocity +=
        (stiffness * stiffness * (presenceTarget - presence) -
          2 * damping * stiffness * presenceVelocity) *
        delta;
      presence += presenceVelocity * delta;
      if (presence < 0 || (presenceTarget === 0 && presence < 0.003)) {
        presence = 0;
        presenceVelocity = Math.max(presenceVelocity, 0);
      }
    } else {
      const kScale = reducedMotion ? 1 : 1 - Math.exp(-delta * 10);
      presence += (presenceTarget - presence) * kScale;
      presenceVelocity = 0;
    }
    if (presence < 0.004 && presenceTarget === 0 && !pointerInside) shown = false;

    if (wobble > 0 && delta > 0) {
      const velocityX = (headX - previousX) / delta;
      const velocityY = (headY - previousY) / delta;
      const speed = Math.hypot(velocityX, velocityY);
      const pull = wobble * 0.3 * Math.tanh(speed / 1100);
      const doubled = 2 * Math.atan2(velocityY, velocityX);
      const goalX = speed > 1 ? pull * Math.cos(doubled) : 0;
      const goalY = speed > 1 ? pull * Math.sin(doubled) : 0;
      const stiffness = 20;
      const damping = 0.22;
      stretchVelocityX +=
        (stiffness * stiffness * (goalX - stretchX) -
          2 * damping * stiffness * stretchVelocityX) *
        delta;
      stretchVelocityY +=
        (stiffness * stiffness * (goalY - stretchY) -
          2 * damping * stiffness * stretchVelocityY) *
        delta;
      stretchX += stretchVelocityX * delta;
      stretchY += stretchVelocityY * delta;
    } else {
      stretchX = stretchY = stretchVelocityX = stretchVelocityY = 0;
    }

    if (spraying) {
      spraying = false;
      const drag = Math.exp(-delta * 3.4);
      const pooled = pooledRadius();
      const touch = Math.max(pooled * 0.5, mass * pooled * 0.9);
      const cover = Math.min(Math.max((mass - 0.45) / 0.55, 0), 1);
      const swallowed = cover * cover * (3 - 2 * cover);
      for (let i = 0; i < SPRAY; i++) {
        if (!sprayAlive[i]) continue;
        sprayAge[i] += delta;
        sprayVelocityX[i] *= drag;
        sprayVelocityY[i] *= drag;
        sprayX[i] += sprayVelocityX[i] * delta;
        sprayY[i] += sprayVelocityY[i] * delta;
        const homing = sprayAge[i] - sprayTurn[i];
        if (homing > 0) {
          const pull = Math.min(homing / 0.45, 1);
          const k = 1 - Math.exp(-delta * (1 + 15 * pull * pull));
          sprayX[i] += (headX - sprayX[i]) * k;
          sprayY[i] += (headY - sprayY[i]) * k;
          const gap = Math.hypot(headX - sprayX[i], headY - sprayY[i]);
          if (sprayMerge[i] > 0 || gap < touch || homing > 2) {
            sprayMerge[i] = Math.min(sprayMerge[i] + delta * 4, 1);
          }
          sprayKeep[i] = 1 - swallowed * sprayMerge[i];
          if (sprayKeep[i] < 0.002 || homing > 4) {
            sprayAlive[i] = 0;
            sprayMerge[i] = 1;
            continue;
          }
        }
        spraying = true;
      }
    }
    let merged = 0;
    for (let i = 0; i < SPRAY; i++) merged += sprayMerge[i];
    const massTarget = spraying ? Math.sqrt(merged / SPRAY) : 1;
    if (mass !== massTarget || massVelocity !== 0) {
      const stiffness = 10;
      const damping = 1 - 0.55 * wobble;
      massVelocity +=
        (stiffness * stiffness * (massTarget - mass) -
          2 * damping * stiffness * massVelocity) *
        delta;
      mass = Math.max(mass + massVelocity * delta, 0);
    }
    if (!spraying && Math.abs(1 - mass) < 0.002 && Math.abs(massVelocity) < 0.01) {
      mass = 1;
      massVelocity = 0;
    }

    render();

    const settled = reducedMotion
      ? clock - lastMove > activeCount() * TRAIL_STEP &&
        Math.abs(presenceTarget - presence) < 0.002 &&
        !contentDirty
      : presence < 0.004 && presenceTarget === 0 && !contentDirty;
    if (settled) {
      presence = presenceTarget;
      presenceVelocity = 0;
      mass = 1;
      massVelocity = 0;
      spraying = false;
      sprayAlive.fill(0);
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
        label: "bubble",
      });
      linearSampler = sampler(gpu, {
        minFilter: "linear",
        magFilter: "linear",
        mipmapFilter: "linear",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
      });
      fx = gpuEffect(gpu, SHADER, {
        label: "bubble",
        set: { uSampler: linearSampler, uContent: ensureContentTexture() },
      });
      syncCanvasSize();
      start();
    })
    .catch((error) => {
      if (destroyed) return;
      console.warn("Bubble: WebGPU unavailable, showing content without the effect.", error);
      fallback2d = output.getContext("2d");
      contentDirty = true;
      start();
    });

  const rectCache = createRectCache(output);
  const root = output.parentElement;

  function locate(event: PointerEvent) {
    const rect = rectCache.current;
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
    if (inside && content && root) {
      inside = event.target instanceof Node && root.contains(event.target);
    }
    return { x, y, inside };
  }

  function leave() {
    if (!pointerInside) return;
    pointerInside = false;
    start();
  }

  function onPointerMove(event: PointerEvent) {
    const { x, y, inside } = locate(event);
    if (!inside) {
      leave();
      return;
    }
    targetX = x;
    targetY = y;
    if (!pointerInside && !(shown && driftAmount() > 0)) {
      headX = x;
      headY = y;
      resetHistory(x, y);
    }
    shown = true;
    pointerInside = true;
    start();
  }

  function onPointerDown(event: PointerEvent) {
    onPointerMove(event);
    if (
      !pointerInside ||
      event.pointerType === "touch" ||
      config.click !== "pop" ||
      reducedMotion ||
      presence < 0.5 ||
      mass < 0.9
    )
      return;
    const pooled = pooledRadius();
    const spin = Math.random() * Math.PI * 2;
    for (let i = 0; i < SPRAY; i++) {
      const angle = spin + ((i + Math.random() * 0.7) / SPRAY) * Math.PI * 2;
      const speed = pooled * (4.5 + Math.random() * 5);
      sprayX[i] = headX + Math.cos(angle) * pooled * 0.55;
      sprayY[i] = headY + Math.sin(angle) * pooled * 0.55;
      sprayVelocityX[i] = Math.cos(angle) * speed;
      sprayVelocityY[i] = Math.sin(angle) * speed;
      sprayRadius[i] = pooled * (0.14 + Math.random() * 0.14);
      sprayAge[i] = 0;
      sprayTurn[i] = 0.2 + (i / SPRAY) * 0.3 + Math.random() * 0.08;
      sprayAlive[i] = 1;
      sprayMerge[i] = 0;
      sprayKeep[i] = 1;
    }
    spraying = true;
    mass = 0;
    massVelocity = 0;
    resetHistory(headX, headY);
    start();
  }

  function onPointerEnd(event: PointerEvent) {
    if (event.pointerType !== "mouse") leave();
  }

  function onPointerLeave(event: PointerEvent) {
    if (event.target === document.documentElement || !locate(event).inside) {
      leave();
    }
  }

  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerdown", onPointerDown, { passive: true });
  window.addEventListener("pointerup", onPointerEnd, { passive: true });
  window.addEventListener("pointercancel", onPointerEnd, { passive: true });
  window.addEventListener("pointerleave", onPointerLeave, {
    capture: true,
    passive: true,
  });

  function onScroll() {
    start();
  }
  content?.addEventListener("scroll", onScroll, { passive: true });

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
  if (content) observer.observe(content);

  let intersecting = true;
  function syncVisibility() {
    visible = intersecting && document.visibilityState !== "hidden";
    if (visible) {
      start();
    } else if (running) {
      cancelAnimationFrame(raf);
      running = false;
    }
  }
  const intersection = new IntersectionObserver((entries) => {
    intersecting = entries[entries.length - 1]?.isIntersecting ?? true;
    syncVisibility();
  });
  document.addEventListener("visibilitychange", syncVisibility);
  intersection.observe(output);

  return {
    setOptions(next) {
      next = resolveOptions(DEFAULTS, next);
      if (
        !Object.entries(next).some(
          ([key, value]) => config[key as keyof BubbleOptions] !== value,
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
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerEnd);
      window.removeEventListener("pointercancel", onPointerEnd);
      window.removeEventListener("pointerleave", onPointerLeave, true);
      content?.removeEventListener("scroll", onScroll);
      observer.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", syncVisibility);
      motionQuery.removeEventListener("change", onMotionChange);
      contentTexture?.destroy();
      screen?.dispose();
      if (htmlInCanvas) paintable!.onpaint = null;
    },
  };
}
