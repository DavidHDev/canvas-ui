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

export interface CloudsOptions {
  scale?: number;
  speed?: number;
  cover?: number;
  density?: number;
  shading?: number;
  color?: [number, number, number] | "auto";
  opacity?: number;
  shadow?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  shadowSoftness?: number;
  wind?: number;
  windRadius?: number;
  refraction?: number;
  fogBlur?: number;
  quality?: number;
}

export interface CloudsElements {
  source: HTMLCanvasElement;
  content: HTMLElement;
  output: HTMLCanvasElement;
}

export interface CloudsInstance {
  setOptions: (options: CloudsOptions) => void;
  resize: () => void;
  destroy: () => void;
}

type PaintableCanvas = HTMLCanvasElement & {
  requestPaint?: () => void;
  onpaint: (() => void) | null;
};

type ElementImageContext = CanvasRenderingContext2D & {
  drawElementImage?: (element: Element, x: number, y: number) => void;
};

const DEFAULTS: Required<CloudsOptions> = {
  scale: 1,
  speed: 0.6,
  cover: 0.1,
  density: 2.5,
  shading: 0.1,
  color: "auto",
  opacity: 0.64,
  shadow: 0.06,
  shadowOffsetX: 200,
  shadowOffsetY: -10,
  shadowSoftness: 1,
  wind: 0.6,
  windRadius: 350,
  refraction: 0,
  fogBlur: 0,
  quality: 1,
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

const FIELD_SHADER = /* wgsl */ `
struct Params {
  resolution: vec2f,
  offset: vec2f,
  time: f32,
  scale: f32,
  cover: f32,
  density: f32,
}

@group(0) @binding(0) var<uniform> params: Params;

const m = mat2x2f(vec2f(1.6, 1.2), vec2f(-1.2, 1.6));

fn hash(pIn: vec2f) -> vec2f {
  var p = vec2f(dot(pIn, vec2f(127.1, 311.7)), dot(pIn, vec2f(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

fn noise(p: vec2f) -> f32 {
  let K1 = 0.366025404;
  let K2 = 0.211324865;
  let i = floor(p + (p.x + p.y) * K1);
  let a = p - i + (i.x + i.y) * K2;
  let o = select(vec2f(0.0, 1.0), vec2f(1.0, 0.0), a.x > a.y);
  let b = a - o + K2;
  let c = a - vec2f(1.0) + 2.0 * K2;
  let h = max(0.5 - vec3f(dot(a, a), dot(b, b), dot(c, c)), vec3f(0.0));
  let n = h * h * h * h *
    vec3f(dot(a, hash(i)), dot(b, hash(i + o)), dot(c, hash(i + vec2f(1.0))));
  return dot(n, vec3f(70.0));
}

fn fbm(nIn: vec2f) -> f32 {
  var n = nIn;
  var total = 0.0;
  var amplitude = 0.1;
  for (var i = 0; i < 7; i++) {
    total += noise(n) * amplitude;
    n = m * n;
    amplitude *= 0.4;
  }
  return total;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let p = vec2f(uv.x, 1.0 - uv.y) + params.offset;
  let asp = vec2f(params.resolution.x / params.resolution.y, 1.0);
  let q = fbm(p * asp * params.scale * 0.5);

  var r = 0.0;
  var cloudUv = p * asp * params.scale;
  cloudUv -= q - params.time;
  var weight = 0.8;
  for (var i = 0; i < 8; i++) {
    r += abs(weight * noise(cloudUv));
    cloudUv = m * cloudUv + params.time;
    weight *= 0.7;
  }

  var f = 0.0;
  cloudUv = p * asp * params.scale;
  cloudUv -= q - params.time;
  weight = 0.7;
  for (var i = 0; i < 8; i++) {
    f += weight * noise(cloudUv);
    cloudUv = m * cloudUv + params.time;
    weight *= 0.6;
  }
  f *= r + f;

  var c = 0.0;
  let t2 = params.time * 2.0;
  cloudUv = p * asp * params.scale * 2.0;
  cloudUv -= q - t2;
  weight = 0.4;
  for (var i = 0; i < 7; i++) {
    c += weight * noise(cloudUv);
    cloudUv = m * cloudUv + t2;
    weight *= 0.6;
  }

  var c1 = 0.0;
  let t3 = params.time * 3.0;
  cloudUv = p * asp * params.scale * 3.0;
  cloudUv -= q - t3;
  weight = 0.4;
  for (var i = 0; i < 7; i++) {
    c1 += abs(weight * noise(cloudUv));
    cloudUv = m * cloudUv + t3;
    weight *= 0.6;
  }
  c += c1;

  let coverage = clamp(params.cover + params.density * f * r + c, 0.0, 1.0);
  return vec4f(coverage, clamp(c, 0.0, 1.0), 0.0, 1.0);
}`;

const WIND_SHADER = /* wgsl */ `
struct Params {
  resolution: vec2f,
  a: vec2f,
  b: vec2f,
  decay: f32,
  radius: f32,
  strength: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var uPrev: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let bottomUv = vec2f(uv.x, 1.0 - uv.y);
  let prev = textureSampleLevel(uPrev, uSampler, uv, 0.0).r * params.decay;
  let asp = vec2f(params.resolution.x / params.resolution.y, 1.0);
  let p = bottomUv * asp;
  let a = params.a * asp;
  let b = params.b * asp;
  let pa = p - a;
  let ba = b - a;
  let h = clamp(dot(pa, ba) / max(dot(ba, ba), 0.000001), 0.0, 1.0);
  let d = length(pa - ba * h) / max(params.radius, 0.0001);
  let stamp = exp(-d * d * 3.0) * params.strength;
  return vec4f(clamp(prev + stamp, 0.0, 1.0), 0.0, 0.0, 1.0);
}`;

const COMPOSITE_SHADER = /* wgsl */ `
struct Params {
  base: vec4f,
  resolution: vec2f,
  contentScale: vec2f,
  shading: f32,
  opacity: f32,
  shadow: f32,
  shadowLod: f32,
  shadowShift: vec2f,
  windAmt: f32,
  refraction: f32,
  fogBlur: f32,
  hasContent: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var uField: texture_2d<f32>;
@group(0) @binding(2) var uContent: texture_2d<f32>;
@group(0) @binding(3) var uWind: texture_2d<f32>;
@group(0) @binding(4) var uSampler: sampler;

fn topFromBottom(uv: vec2f) -> vec2f {
  return vec2f(uv.x, 1.0 - uv.y);
}

fn fieldAtBottom(uv: vec2f) -> vec2f {
  return textureSampleLevel(uField, uSampler, topFromBottom(uv), 0.0).rg;
}

fn windAtBottom(uv: vec2f) -> f32 {
  return textureSampleLevel(uWind, uSampler, topFromBottom(uv), 0.0).r;
}

fn blurredFieldAtBottom(uv: vec2f) -> f32 {
  return textureSampleLevel(uField, uSampler, topFromBottom(uv), params.shadowLod).r;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let bottomUv = vec2f(uv.x, 1.0 - uv.y);
  let field = fieldAtBottom(bottomUv);
  let wind = windAtBottom(bottomUv) * params.windAmt;
  let cov = field.r - wind;
  let mist = smoothstep(0.04, 0.9, cov);
  let cloudA = mist * params.opacity;

  let lum = dot(params.base.rgb, vec3f(0.299, 0.587, 0.114));
  let sh = clamp(field.g, 0.0, 1.0);
  let k = params.shading * 0.35;
  var cloudRGB = select(
    params.base.rgb + vec3f(sh * k),
    params.base.rgb - vec3f((1.0 - sh) * k),
    lum > 0.5);
  cloudRGB = clamp(cloudRGB, vec3f(0.0), vec3f(1.0));

  let sUv = bottomUv + params.shadowShift;
  let s = blurredFieldAtBottom(sUv) - windAtBottom(sUv) * params.windAmt;
  let shadowA = smoothstep(0.35, 1.0, s) * params.shadow * (1.0 - mist);

  if (params.hasContent > 0.5) {
    let e = vec2f(8.0) / params.resolution;
    let gx = fieldAtBottom(bottomUv + vec2f(e.x, 0.0)).r
      - fieldAtBottom(bottomUv - vec2f(e.x, 0.0)).r;
    let gy = fieldAtBottom(bottomUv + vec2f(0.0, e.y)).r
      - fieldAtBottom(bottomUv - vec2f(0.0, e.y)).r;
    let rUv = bottomUv + vec2f(gx, gy) * params.refraction * mist;
    let contentUv = topFromBottom(rUv) * params.contentScale;
    let fogged = textureSampleLevel(uContent, uSampler, contentUv, mist * params.fogBlur * 5.0).rgb;
    let layer = mix(fogged, cloudRGB, cloudA) * (1.0 - shadowA);
    let aF = smoothstep(0.02, 0.2, mist);
    let a = aF + shadowA * (1.0 - aF);
    return vec4f(layer * aF, a);
  }

  let a = cloudA + shadowA * (1.0 - cloudA);
  return vec4f(cloudRGB * cloudA, a);
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
  (value as unknown as { destroy(): void } | null)?.destroy();
}

function mipLevelCountFor(width: number, height: number): number {
  return Math.floor(Math.log2(Math.max(width, height))) + 1;
}

export function createClouds(
  elements: CloudsElements,
  options: CloudsOptions = {},
): CloudsInstance | null {
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
  let fieldFx: Effect | null = null;
  let windFx: Effect | null = null;
  let compositeFx: Effect | null = null;
  let linearSampler: GPUSampler | null = null;
  let mipmapLayout: GPUBindGroupLayout | null = null;
  let mipmapPipeline: GPURenderPipeline | null = null;
  let fieldTarget: Target | null = null;
  let fieldTexture: Texture | null = null;
  let windTargets: [Target, Target] | null = null;
  let contentTexture: Texture | null = null;
  let fallback2d: CanvasRenderingContext2D | null = null;
  let fieldW = 0;
  let fieldH = 0;
  let contentScaleX = 1;
  let contentScaleY = 1;

  let baseColor: [number, number, number] = [1, 1, 1];
  const probe = document.createElement("canvas");
  probe.width = probe.height = 1;
  const probeCtx = probe.getContext("2d", { willReadFrequently: true });

  function syncBaseColor() {
    if (config.color !== "auto") {
      baseColor = config.color;
      return;
    }
    if (!probeCtx) return;
    let el: Element | null = content;
    while (el) {
      const bg = getComputedStyle(el).backgroundColor;
      if (bg && bg !== "transparent") {
        probeCtx.clearRect(0, 0, 1, 1);
        probeCtx.fillStyle = bg;
        probeCtx.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = probeCtx.getImageData(0, 0, 1, 1).data;
        if (a > 0) {
          baseColor = [r / 255, g / 255, b / 255];
          return;
        }
      }
      el = el.parentElement;
    }
    baseColor = [1, 1, 1];
  }

  function ensureTargets() {
    if (!gpu) return;
    const size: [number, number] = [fieldW, fieldH];
    if (!fieldTarget) {
      fieldTarget = target(gpu, {
        size,
        format: "rgba8unorm",
        clearColor: [0, 0, 0, 1],
        label: "clouds.field",
      });
      windTargets = [
        target(gpu, {
          size,
          format: "rgba8unorm",
          clearColor: [0, 0, 0, 1],
          label: "clouds.wind-a",
        }),
        target(gpu, {
          size,
          format: "rgba8unorm",
          clearColor: [0, 0, 0, 1],
          label: "clouds.wind-b",
        }),
      ];
    }
    for (const t of [fieldTarget, ...(windTargets ?? [])]) {
      if (t && (t.size[0] !== fieldW || t.size[1] !== fieldH)) t.resize(size);
    }
    const mipLevelCount = mipLevelCountFor(fieldW, fieldH);
    if (
      !fieldTexture ||
      fieldTexture.size[0] !== fieldW ||
      fieldTexture.size[1] !== fieldH ||
      fieldTexture.mipLevelCount !== mipLevelCount
    ) {
      fieldTexture?.destroy();
      fieldTexture = gpu.device.createTexture({
        size,
        format: "rgba8unorm",
        usage: ["texture_binding", "copy_dst", "render_attachment"],
        mipLevelCount,
        label: "clouds.field-mips",
      });
    }
  }

  function syncCanvasSize() {
    const cw = content.clientWidth;
    const ch = content.clientHeight;
    if (cw > 0 && ch > 0) {
      const wpx = `${cw}px`;
      const hpx = `${ch}px`;
      if (output.style.width !== wpx) output.style.width = wpx;
      if (output.style.height !== hpx) output.style.height = hpx;
    }
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
    contentScaleX = htmlInCanvas ? Math.min(1, cw / Math.max(source.clientWidth, 1)) : 1;
    contentScaleY = htmlInCanvas ? Math.min(1, ch / Math.max(source.clientHeight, 1)) : 1;
    const quality = Math.min(Math.max(config.quality, 0.2), 1);
    const cap = 1440 / Math.max(output.clientWidth, 1);
    const q = Math.min(quality, cap);
    fieldW = Math.max(16, Math.round(output.clientWidth * q));
    fieldH = Math.max(16, Math.round(output.clientHeight * q));
    ensureTargets();
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
  syncBaseColor();

  function ensureMipmapPipeline(): GPURenderPipeline | null {
    if (!gpu || !linearSampler) return null;
    if (!mipmapLayout) {
      mipmapLayout = gpu.gpu.createBindGroupLayout({
        label: "clouds.mipmap.layout",
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
        label: "clouds.mipmap",
        code: MIPMAP_SHADER,
      });
      mipmapPipeline = gpu.gpu.createRenderPipeline({
        label: "clouds.mipmap",
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
    const encoder = gpu.gpu.createCommandEncoder({ label: "clouds.mipmap" });
    for (let level = 1; level < texture.mipLevelCount; level++) {
      const bindGroup = gpu.gpu.createBindGroup({
        label: "clouds.mipmap",
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
        label: "clouds.mipmap",
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
    const w = Math.max(1, source.width);
    const h = Math.max(1, source.height);
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
        label: "clouds.content",
      });
    }
    return contentTexture;
  }

  function uploadContent() {
    if (!htmlInCanvas || !contentDirty || !gpu || !compositeFx) return;
    contentDirty = false;
    const texture = ensureContentTexture();
    gpu.gpu.queue.copyExternalImageToTexture(
      { source },
      { texture: texture.gpu, mipLevel: 0 },
      [source.width, source.height],
    );
    generateMipmaps(texture);
    compositeFx.set({ uContent: texture });
  }

  let pointerX = 0.5;
  let pointerY = 0.5;
  let prevPointerX = 0.5;
  let prevPointerY = 0.5;
  let hasPointer = false;
  let lastPointerMove = 0;
  let windIndex = 0;
  let time = Math.random() * 64;

  function render(delta: number) {
    if (
      !gpu ||
      !screen ||
      !fieldFx ||
      !windFx ||
      !compositeFx ||
      !fieldTarget ||
      !fieldTexture ||
      !windTargets
    ) {
      return;
    }
    uploadContent();

    fieldFx.set({
      params: {
        resolution: [fieldW, fieldH],
        offset: [
          content.scrollLeft / Math.max(content.clientWidth, 1),
          -content.scrollTop / Math.max(content.clientHeight, 1),
        ],
        time,
        scale: Math.max(config.scale, 0.05),
        cover: Math.max(config.cover, 0),
        density: Math.max(config.density, 0),
      },
    });
    fieldFx.draw(fieldTarget);
    const fieldEncoder = gpu.gpu.createCommandEncoder({ label: "clouds.field-copy" });
    fieldEncoder.copyTextureToTexture(
      { texture: fieldTarget.color.gpu },
      { texture: fieldTexture.gpu, mipLevel: 0 },
      [fieldW, fieldH],
    );
    gpu.gpu.queue.submit([fieldEncoder.finish()]);
    generateMipmaps(fieldTexture);

    const prevWind = windTargets[windIndex];
    const nextWind = windTargets[1 - windIndex];
    windIndex = 1 - windIndex;
    const moved = Math.hypot(pointerX - prevPointerX, pointerY - prevPointerY);
    const stamping = hasPointer && moved > 0;
    windFx.set({
      uPrev: prevWind,
      params: {
        resolution: [fieldW, fieldH],
        a: [prevPointerX, prevPointerY],
        b: [pointerX, pointerY],
        decay: Math.pow(0.5, delta / 0.7),
        radius: Math.max(config.windRadius, 1) / Math.max(output.clientHeight, 1),
        strength: stamping ? Math.min(0.2 + moved * 12, 1) * 0.5 : 0,
      },
    });
    windFx.draw(nextWind);
    prevPointerX = pointerX;
    prevPointerY = pointerY;

    compositeFx.set({
      uField: fieldTexture,
      uWind: nextWind,
      params: {
        base: [...baseColor, 0],
        resolution: screen.size,
        contentScale: [contentScaleX, contentScaleY],
        shading: Math.max(config.shading, 0),
        opacity: Math.min(Math.max(config.opacity, 0), 1),
        shadow: Math.min(Math.max(config.shadow, 0), 1),
        shadowLod: Math.min(Math.max(config.shadowSoftness, 0), 1) * 4,
        shadowShift: [
          -config.shadowOffsetX / Math.max(output.clientWidth, 1),
          config.shadowOffsetY / Math.max(output.clientHeight, 1),
        ],
        windAmt: Math.min(Math.max(config.wind, 0), 1),
        refraction: Math.max(config.refraction, 0) / Math.max(output.clientWidth, 1),
        fogBlur: Math.min(Math.max(config.fogBlur, 0), 1),
        hasContent: htmlInCanvas ? 1 : 0,
      },
    });
    gpuFrame(gpu, (f) => f.pass(screen!, compositeFx!));
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
    if (!reducedMotion) time += delta * config.speed * 0.03;
    render(delta);
    const windActive = now - lastPointerMove < 3000;
    if (reducedMotion && !windActive && !contentDirty) {
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
        label: "clouds",
      });
      linearSampler = sampler(gpu, {
        minFilter: "linear",
        magFilter: "linear",
        mipmapFilter: "linear",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
      });
      fieldFx = effect(gpu, FIELD_SHADER, { label: "clouds.field" });
      windFx = effect(gpu, WIND_SHADER, {
        label: "clouds.wind",
        set: { uSampler: linearSampler },
      });
      compositeFx = effect(gpu, COMPOSITE_SHADER, {
        label: "clouds.composite",
        set: { uSampler: linearSampler, uContent: ensureContentTexture() },
      });
      syncCanvasSize();
      ensureTargets();
      start();
    })
    .catch((error) => {
      if (destroyed) return;
      console.warn("Clouds: WebGPU unavailable, showing content without the effect.", error);
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

  const rectCache = createRectCache(output);

  function onPointerMove(event: PointerEvent) {
    const rect = rectCache.current;
    const x = (event.clientX - rect.left) / Math.max(rect.width, 1);
    const y = 1 - (event.clientY - rect.top) / Math.max(rect.height, 1);
    if (!hasPointer) {
      prevPointerX = x;
      prevPointerY = y;
      hasPointer = true;
    }
    pointerX = x;
    pointerY = y;
    lastPointerMove = performance.now();
    start();
  }

  function onPointerLeave() {
    hasPointer = false;
  }

  content.addEventListener("pointermove", onPointerMove, { passive: true });
  content.addEventListener("pointerleave", onPointerLeave, { passive: true });
  content.addEventListener("scroll", start, { passive: true });

  let themeTimer = 0;
  function onThemeShift() {
    syncBaseColor();
    start();
    window.clearTimeout(themeTimer);
    themeTimer = window.setTimeout(() => {
      syncBaseColor();
      start();
    }, 300);
  }

  const themeObserver = new MutationObserver(onThemeShift);
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "style", "data-theme"],
  });
  const schemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
  schemeQuery.addEventListener("change", onThemeShift);

  return {
    setOptions(next) {
      if (
        !Object.entries(next).some(
          ([key, value]) => config[key as keyof CloudsOptions] !== value,
        )
      )
        return;
      Object.assign(config, next);
      syncCanvasSize();
      syncBaseColor();
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
      themeObserver.disconnect();
      schemeQuery.removeEventListener("change", onThemeShift);
      window.clearTimeout(themeTimer);
      motionQuery.removeEventListener("change", onMotionChange);
      content.removeEventListener("pointermove", onPointerMove);
      content.removeEventListener("pointerleave", onPointerLeave);
      content.removeEventListener("scroll", start);
      if (htmlInCanvas) paintable.onpaint = null;
      contentTexture?.destroy();
      fieldTexture?.destroy();
      destroyTarget(fieldTarget);
      if (windTargets) {
        destroyTarget(windTargets[0]);
        destroyTarget(windTargets[1]);
      }
      screen?.dispose();
    },
  };
}
