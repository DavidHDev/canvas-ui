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

export interface GlyphRainOptions {
  /** Characters used for the falling glyphs. Deduplicated into a glyph atlas. */
  charset?: string;
  /** Size of one glyph cell in CSS pixels (8 to 64). */
  cell?: number;
  /** Rain color as [r, g, b] in 0-1 range. */
  color?: [number, number, number];
  /** Color of the bright head glyph as [r, g, b] in 0-1 range. */
  headColor?: [number, number, number];
  /** Fall speed in screen heights per second (0.05 to 3). */
  speed?: number;
  /** Per-column speed variation (0 to 1). */
  speedVariance?: number;
  /** Fraction of drops that spawn each cycle (0 to 1). */
  density?: number;
  /** Length multiplier for the fading trails (0.2 to 3). */
  trail?: number;
  /** Brightness of the drop heads and the light they cast (0 to 3). */
  glow?: number;
  /** How fast glyphs mutate into other characters (0 to 4). */
  mutate?: number;
  /** Random brightness flicker of the streaks (0 to 1). */
  flicker?: number;
  /** Parallax rain layers behind the front one (1 to 3). */
  layers?: number;
  /** How much the unlit page dims (0 to 1). 0 keeps it fully readable. */
  dim?: number;
  /** Strength of the light the drops shine onto the page (0 to 3). */
  light?: number;
  /** Radius of each drop's light pool in CSS pixels (20 to 600). */
  lightRadius?: number;
  /** How high above the page the lights float, in CSS pixels. Higher is softer. */
  lightHeight?: number;
  /** Embossed 3D shading of the page under the lights (0 to 2). */
  relief?: number;
  /** How strongly the cursor stirs the rain as it passes (0 to 1). 0 disables it. */
  stir?: number;
  /** How far the stirring reaches to either side of the cursor, in CSS pixels. */
  stirRadius?: number;
  /** Seconds the stirred wake takes to settle back to its own rhythm. */
  settle?: number;
}

export interface GlyphRainElements {
  /** Canvas with layoutsubtree that hosts the HTML content. */
  source: HTMLCanvasElement;
  /** The element inside the source canvas that gets captured. */
  content: HTMLElement;
  /** Canvas the WebGPU effect renders to. */
  output: HTMLCanvasElement;
}

export interface GlyphRainInstance {
  /** Update effect options live. */
  setOptions: (options: GlyphRainOptions) => void;
  /** Re-read canvas size. Call when the element is resized. */
  resize: () => void;
  /** Stop the loop and release all GPU resources. */
  destroy: () => void;
}

const DEFAULT_CHARSET =
  "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789Z*+-<>¦=:.";

const DEFAULTS: Required<GlyphRainOptions> = {
  charset: DEFAULT_CHARSET,
  cell: 15,
  color: [0.267, 0.455, 1],
  headColor: [0.169, 0.416, 1],
  speed: 0.2,
  speedVariance: 0.5,
  density: 0.15,
  trail: 0.65,
  glow: 1.75,
  mutate: 0,
  flicker: 0,
  layers: 2,
  dim: 0.5,
  light: 2.8,
  lightRadius: 240,
  lightHeight: 172,
  relief: 0.05,
  stir: 0.7,
  stirRadius: 260,
  settle: 0.9,
};

const WAKE_RES = 256;
const ATLAS_CELL_PX = 64;

type PaintableCanvas = HTMLCanvasElement & {
  onpaint?: (() => void) | null;
  requestPaint?: () => void;
};

type ElementImageContext = CanvasRenderingContext2D & {
  drawElementImage?: (element: Element, x: number, y: number) => void;
};

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

const SHADER = /* wgsl */ `
struct Params {
  color: vec4f,
  headColor: vec4f,
  resolution: vec2f,
  time: f32,
  cell: f32,
  glyphCount: f32,
  atlasGrid: f32,
  speed: f32,
  speedVar: f32,
  density: f32,
  trail: f32,
  glow: f32,
  mutate: f32,
  flicker: f32,
  layers: f32,
  dim: f32,
  light: f32,
  lightRadius: f32,
  lightHeight: f32,
  relief: f32,
  stir: f32,
  scroll: f32,
  pageLum: f32,
  hasContent: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var uContent: texture_2d<f32>;
@group(0) @binding(2) var uAtlas: texture_2d<f32>;
@group(0) @binding(3) var uWake: texture_2d<f32>;
@group(0) @binding(4) var uSampler: sampler;

fn mod1(x: f32, y: f32) -> f32 {
  return x - y * floor(x / y);
}

fn hash11(p0: f32) -> f32 {
  var p = fract(p0 * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

fn hash21(p: vec2f) -> f32 {
  var q = fract(vec3f(p.x, p.y, p.x) * 0.1031);
  q += dot(q, q.yzx + vec3f(33.33));
  return fract((q.x + q.y) * q.z);
}

fn glyphMask(px: vec2f, cell: f32, seed: f32) -> f32 {
  let id = floor(px / cell);
  var f = fract(px / cell);
  f = f * 0.74 + vec2f(0.13);
  f = vec2f(1.0 - f.x, f.y);
  let tick = floor(params.time * params.mutate * 1.6 + hash21(id + vec2f(seed)) * 9.0);
  let idx = floor(
    hash21(id * 1.71 + vec2f(seed + tick * 7.31, tick * 0.613)) * params.glyphCount
  );
  let gx = mod1(idx, params.atlasGrid);
  let gy = floor(idx / params.atlasGrid);
  let auv = (vec2f(gx, gy) + f) / params.atlasGrid;
  let lod = max(log2(64.0 / max(cell, 1.0)), 0.0);
  return textureSampleLevel(uAtlas, uSampler, auv, lod).a;
}

fn colSpeed(col: f32, seed: f32) -> f32 {
  let variance = mix(0.35, 1.0, hash11(col * 0.37 + seed + 3.1));
  return params.speed * mix(1.0, variance, params.speedVar) * 0.5;
}

fn colOffset(col: f32, seed: f32) -> f32 {
  return hash11(col * 1.713 + seed) * 9.0;
}

fn wakeAt(xpx: f32) -> vec2f {
  let u = clamp(xpx / max(params.resolution.x, 1.0), 0.0, 1.0);
  let dims = textureDimensions(uWake);
  let ix = i32(clamp(floor(u * f32(dims.x)), 0.0, f32(dims.x - 1u)));
  return textureLoad(uWake, vec2i(ix, 0), 0).rg;
}

fn lum(c: vec3f) -> f32 {
  return dot(c, vec3f(0.299, 0.587, 0.114));
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let frag = uv * params.resolution + vec2f(0.0, params.scroll);
  let cuv = uv;
  let yn = 1.0 - frag.y / params.resolution.y;

  let scales = array<f32, 3>(1.0, 1.5, 2.2);
  let weights = array<f32, 3>(1.0, 0.45, 0.22);
  let seeds = array<f32, 3>(0.0, 19.7, 41.3);

  var g = 0.0;
  var headG = 0.0;
  for (var l = 0u; l < 3u; l++) {
    if (f32(l) >= params.layers) { break; }
    let cell = params.cell * scales[l];
    let col = floor(frag.x / cell);
    let sp = colSpeed(col, seeds[l]);
    let off = colOffset(col, seeds[l]);
    let wk = select(vec2f(0.0), wakeAt((col + 0.5) * cell), params.stir > 0.0);
    let exc = params.stir * wk.y;
    let T = params.time * sp + off + sp * wk.x;
    let phase = fract(yn + T);
    let cyc = floor(yn + T);
    let gate = step(hash21(vec2f(col, cyc) + vec2f(seeds[l])), params.density);
    let b = clamp(params.trail / (phase * 22.0), 0.0, 1.3) - 0.04;
    if (b <= 0.0 || gate < 0.5) { continue; }
    let flick = 1.0 + params.flicker * 0.6 *
      sin(params.time * 14.0 + hash21(vec2f(col, cyc)) * 40.0 + phase * 30.0);
    let m = glyphMask(frag, cell, seeds[l] + cyc * 0.173);
    let cellYn = cell / params.resolution.y;
    let head = 1.0 - smoothstep(0.0, cellYn * 1.2, phase);
    g += m * b * flick * weights[l] * (1.0 + head * params.glow * 1.4) *
      (1.0 + exc * 1.6);
    headG += m * head * weights[l] * params.glow * (1.0 + exc * 1.1);
  }
  g = max(g, 0.0);

  if (params.hasContent < 0.5) {
    let rainCol = mix(params.color.rgb, params.headColor.rgb, clamp(headG, 0.0, 1.0));
    let a = clamp(g, 0.0, 1.0);
    return vec4f(rainCol * a, a);
  }

  let e = vec2f(3.0, 0.0) / params.resolution;
  let content = textureSampleLevel(uContent, uSampler, cuv, 0.0);
  let lC = lum(content.rgb);
  let lX1 = lum(textureSampleLevel(uContent, uSampler, clamp(cuv - e.xy, vec2f(0.0), vec2f(1.0)), 0.0).rgb);
  let lX2 = lum(textureSampleLevel(uContent, uSampler, clamp(cuv + e.xy, vec2f(0.0), vec2f(1.0)), 0.0).rgb);
  let lY1 = lum(textureSampleLevel(uContent, uSampler, clamp(cuv - e.yx, vec2f(0.0), vec2f(1.0)), 0.0).rgb);
  let lY2 = lum(textureSampleLevel(uContent, uSampler, clamp(cuv + e.yx, vec2f(0.0), vec2f(1.0)), 0.0).rgb);
  let N = normalize(vec3f(
    -(lX2 - lX1) * params.relief * 4.0,
    -(lY2 - lY1) * params.relief * 4.0,
    1.0
  ));
  let reliefMix = clamp(params.relief, 0.0, 1.0);
  let e2 = vec2f(30.0, 0.0) / params.resolution;
  let bgL = (lC
    + lum(textureSampleLevel(uContent, uSampler, clamp(cuv - e2.xy, vec2f(0.0), vec2f(1.0)), 0.0).rgb)
    + lum(textureSampleLevel(uContent, uSampler, clamp(cuv + e2.xy, vec2f(0.0), vec2f(1.0)), 0.0).rgb)
    + lum(textureSampleLevel(uContent, uSampler, clamp(cuv - e2.yx, vec2f(0.0), vec2f(1.0)), 0.0).rgb)
    + lum(textureSampleLevel(uContent, uSampler, clamp(cuv + e2.yx, vec2f(0.0), vec2f(1.0)), 0.0).rgb)) * 0.2;
  let bright = smoothstep(0.55, 0.8, params.pageLum) * smoothstep(0.2, 0.45, bgL);

  var lightSum = 0.0;
  let sigma2 = params.lightRadius * params.lightRadius * 0.5;
  let reach = params.lightRadius * 1.6;
  let stride = max(1.0, ceil((params.lightRadius * 1.7) / (params.cell * 12.0)));
  let baseCol = floor(floor(frag.x / params.cell) / stride);
  for (var o = -12; o <= 12; o++) {
    let c = (baseCol + f32(o)) * stride;
    if (c < 0.0) { continue; }
    let dx = (c + 0.5) * params.cell - frag.x;
    let wx = 1.0 - smoothstep(reach * 0.7, reach, abs(dx));
    if (wx <= 0.0) { continue; }
    let sp = colSpeed(c, 0.0);
    let off = colOffset(c, 0.0);
    let wk = select(vec2f(0.0), wakeAt((c + 0.5) * params.cell), params.stir > 0.0);
    let lampBoost = 1.0 + params.stir * wk.y * 1.4;
    let T = params.time * sp + off + sp * wk.x;
    let s = 1.0 - frag.y / params.resolution.y + T;
    let k0 = floor(s);
    for (var h = 0; h < 2; h++) {
      let k = k0 + f32(h);
      let gate = step(hash21(vec2f(c, k)), params.density);
      if (gate < 0.5) { continue; }
      let lamp = 0.6 + 0.4 * hash11(c * 3.97 + k * 0.713);
      let headDocY = (1.0 - (k - T)) * params.resolution.y;
      let dv = vec3f(dx, headDocY - frag.y, params.lightHeight);
      let d2 = dot(dv, dv);
      let att = exp(-d2 / sigma2);
      let L = dv * inverseSqrt(max(d2, 1.0));
      let dif = mix(1.0, 0.25 + 0.75 * max(dot(N, L), 0.0), reliefMix);
      lightSum += att * dif * wx * lamp * lampBoost;
    }
  }
  let ls = lightSum * params.light * (0.6 + 0.4 * params.glow);
  let lit = 2.2 * ls / (ls + 1.1);

  let dimEff = params.dim * (1.0 - bright);
  let shade = mix(
    clamp(1.0 - dimEff, 0.0, 1.0),
    1.0,
    smoothstep(0.0, 1.0, lit)
  );
  var col = content.rgb * shade;
  col += params.color.rgb * lit * 0.14 * (1.0 - lC * 0.75) * (1.0 - bright);
  col += params.color.rgb * clamp(lit - 1.0, 0.0, 1.0) * 0.1 * (1.0 - bright);

  var glyphCol = mix(params.color.rgb, params.color.rgb * 0.24 + vec3f(0.02), lC * (1.0 - bright));
  glyphCol = mix(glyphCol, params.headColor.rgb, clamp(headG, 0.0, 1.0));
  glyphCol = mix(glyphCol, vec3f(1.0), bright * clamp(headG - 0.6, 0.0, 0.4));
  let gA = clamp(g, 0.0, 1.0);
  let knock = gA * mix(mix(0.3, 0.88, lC), 1.0, bright);
  let paint = min(g, 1.5) * mix(1.0, mix(0.92, 1.0, bright), lC);
  col = col * (1.0 - knock) + glyphCol * paint;

  let alpha = max(content.a, gA);
  col = clamp(col, vec3f(0.0), vec3f(alpha));
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

/** One WebGPU device per page, shared by every GlyphRain instance. */
function acquireGpu(): Promise<Gpu> {
  if (!sharedGpu) {
    sharedGpu = init().catch((error) => {
      sharedGpu = null;
      throw error;
    });
  }
  return sharedGpu;
}

function buildAtlas(charset: string): {
  canvas: HTMLCanvasElement;
  count: number;
  grid: number;
} {
  const glyphs = Array.from(new Set(Array.from(charset))).filter(
    (g) => g.trim().length > 0,
  );
  if (glyphs.length === 0) glyphs.push("0", "1");
  const count = glyphs.length;
  const grid = Math.max(Math.ceil(Math.sqrt(count)), 1);
  const cellPx = ATLAS_CELL_PX;
  const canvas = document.createElement("canvas");
  canvas.width = grid * cellPx;
  canvas.height = grid * cellPx;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `600 ${Math.round(cellPx * 0.72)}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  for (let i = 0; i < count; i++) {
    const x = ((i % grid) + 0.5) * cellPx;
    const y = (Math.floor(i / grid) + 0.5) * cellPx;
    ctx.fillText(glyphs[i], x, y);
  }
  return { canvas, count, grid };
}

export function createGlyphRain(
  elements: GlyphRainElements,
  options: GlyphRainOptions = {},
): GlyphRainInstance | null {
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
  let pageLum = 0;
  let wake = () => {};

  function readPageLum(): number {
    try {
      const probe = document.createElement("canvas");
      probe.width = probe.height = 1;
      const pctx = probe.getContext("2d", { willReadFrequently: true });
      if (!pctx) return 0;
      let el: Element | null = content;
      while (el instanceof Element) {
        const bgColor = getComputedStyle(el).backgroundColor;
        if (bgColor && bgColor !== "transparent") {
          pctx.clearRect(0, 0, 1, 1);
          pctx.fillStyle = bgColor;
          pctx.fillRect(0, 0, 1, 1);
          const d = pctx.getImageData(0, 0, 1, 1).data;
          if (d[3] > 128) {
            return (0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2]) / 255;
          }
        }
        el = el.parentElement;
      }
    } catch {}
    return 0;
  }

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
  let atlasTexture: Texture | null = null;
  let wakeTexture: Texture | null = null;
  let linearSampler: GPUSampler | null = null;
  let mipmapLayout: GPUBindGroupLayout | null = null;
  let mipmapPipeline: GPURenderPipeline | null = null;
  let fallback2d: CanvasRenderingContext2D | null = null;

  let atlasCount = 1;
  let atlasGrid = 1;
  let atlasCharset = "";
  let atlasCanvas: HTMLCanvasElement | null = null;

  function mipLevelCountFor(width: number, height: number): number {
    return Math.floor(Math.log2(Math.max(width, height))) + 1;
  }

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
        label: "glyph-rain.content",
      });
    }
    return contentTexture;
  }

  function ensureAtlasTexture(): Texture {
    const canvas = atlasCanvas ?? buildAtlas(config.charset).canvas;
    const mipLevelCount = mipLevelCountFor(canvas.width, canvas.height);
    if (!atlasTexture) {
      atlasTexture = gpu!.device.createTexture({
        size: [canvas.width, canvas.height],
        format: "rgba8unorm",
        usage: ["texture_binding", "copy_dst", "render_attachment"],
        mipLevelCount,
        label: "glyph-rain.atlas",
      });
    } else if (
      atlasTexture.size[0] !== canvas.width ||
      atlasTexture.size[1] !== canvas.height ||
      atlasTexture.mipLevelCount !== mipLevelCount
    ) {
      atlasTexture.destroy();
      atlasTexture = gpu!.device.createTexture({
        size: [canvas.width, canvas.height],
        format: "rgba8unorm",
        usage: ["texture_binding", "copy_dst", "render_attachment"],
        mipLevelCount,
        label: "glyph-rain.atlas",
      });
    }
    return atlasTexture;
  }

  function ensureWakeTexture(): Texture {
    if (!wakeTexture) {
      wakeTexture = gpu!.device.createTexture({
        size: [WAKE_RES, 1],
        format: "rg32float",
        usage: ["texture_binding", "copy_dst"],
        label: "glyph-rain.wake",
      });
    }
    return wakeTexture;
  }

  function ensureMipmapPipeline(): GPURenderPipeline | null {
    if (!gpu || !linearSampler) return null;
    if (!mipmapLayout) {
      mipmapLayout = gpu.gpu.createBindGroupLayout({
        label: "glyph-rain.mipmap.layout",
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
        label: "glyph-rain.mipmap",
        code: MIPMAP_SHADER,
      });
      mipmapPipeline = gpu.gpu.createRenderPipeline({
        label: "glyph-rain.mipmap",
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
    const encoder = gpu.gpu.createCommandEncoder({ label: "glyph-rain.mipmap" });
    for (let level = 1; level < texture.mipLevelCount; level++) {
      const bindGroup = gpu.gpu.createBindGroup({
        label: "glyph-rain.mipmap",
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
        label: "glyph-rain.mipmap",
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

  function syncAtlas() {
    if (config.charset === atlasCharset) return;
    atlasCharset = config.charset;
    const atlas = buildAtlas(config.charset);
    atlasCount = atlas.count;
    atlasGrid = atlas.grid;
    atlasCanvas = atlas.canvas;
    if (!gpu || !fx) return;
    const tex = ensureAtlasTexture();
    gpu.gpu.queue.copyExternalImageToTexture(
      { source: atlas.canvas },
      { texture: tex.gpu, mipLevel: 0 },
      [atlas.canvas.width, atlas.canvas.height],
    );
    generateMipmaps(tex);
    fx.set({ uAtlas: tex });
  }

  syncAtlas();

  let dpr = 1;

  function syncCanvasSize() {
    dpr = getCanvasPixelRatio(output);
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
      if (
        source.width !== sourceWidth ||
        source.height !== sourceHeight
      ) {
        source.width = sourceWidth;
        source.height = sourceHeight;
      }
      paintable.requestPaint!();
    }
  }

  syncCanvasSize();

  function uploadContent() {
    if (!htmlInCanvas || !contentDirty || !gpu || !fx) return;
    contentDirty = false;
    pageLum = readPageLum();
    const texture = ensureContentTexture();
    gpu.gpu.queue.copyExternalImageToTexture(
      { source },
      { texture: texture.gpu },
      [source.width, source.height],
    );
    fx.set({ uContent: texture });
    sourceCtx!.clearRect(0, 0, source.width, source.height);
  }

  let time = 7.3;

  const wakeCharge = new Float32Array(WAKE_RES);
  const wakeField = new Float32Array(WAKE_RES * 2);
  let wakeLive = false;
  let wakeTouched = false;
  let pointerX = 0;
  let tracking = false;

  function stirAmount(): number {
    return Math.min(Math.max(config.stir, 0), 1);
  }

  function wakeSpan(): number {
    const width = Math.max(output.clientWidth, 1);
    const px = Math.min(Math.max(config.stirRadius, 8), 2000);
    return Math.max(px / width, 1 / WAKE_RES);
  }

  function uploadWake() {
    if (!gpu || !fx) return;
    const tex = ensureWakeTexture();
    gpu.gpu.queue.writeTexture(
      { texture: tex.gpu },
      wakeField,
      { bytesPerRow: WAKE_RES * 2 * 4, rowsPerImage: 1 },
      [WAKE_RES, 1],
    );
    fx.set({ uWake: tex });
  }

  function stepWake(delta: number) {
    const stir = stirAmount();
    const settleT = Math.min(Math.max(config.settle, 0.05), 8);
    const decay = Math.exp(-delta / settleT);
    const span = wakeSpan();
    const drive = stir > 0.001 && !reducedMotion;
    const track = drive && tracking;
    let live = false;
    for (let i = 0; i < WAKE_RES; i++) {
      let charge = wakeCharge[i] * decay;
      if (track) {
        const d = Math.abs((i + 0.5) / WAKE_RES - pointerX) / span;
        if (d < 1) {
          const t = 1 - d;
          const target = t * t * (3 - 2 * t);
          if (target > charge) charge = target;
        }
      }
      if (charge < 1e-4) charge = 0;
      wakeCharge[i] = charge;
      if (charge > 0) {
        live = true;
        if (drive) {
          wakeField[i * 2] += delta * stir * 2.2 * charge;
          wakeTouched = true;
        }
      }
      wakeField[i * 2 + 1] = charge;
    }
    if (!live && !wakeLive) return;
    wakeLive = live;
    uploadWake();
  }

  function render() {
    if (!gpu || !fx || !screen) return;
    uploadContent();
    const [width, height] = screen.size;
    fx.set({
      params: {
        color: [config.color[0], config.color[1], config.color[2], 0],
        headColor: [config.headColor[0], config.headColor[1], config.headColor[2], 0],
        resolution: [width, height],
        time,
        cell: Math.min(Math.max(config.cell, 8), 64) * dpr,
        glyphCount: atlasCount,
        atlasGrid,
        speed: Math.min(Math.max(config.speed, 0.05), 3),
        speedVar: Math.min(Math.max(config.speedVariance, 0), 1),
        density: Math.min(Math.max(config.density, 0), 1),
        trail: Math.min(Math.max(config.trail, 0.2), 3),
        glow: Math.min(Math.max(config.glow, 0), 3),
        mutate: Math.min(Math.max(config.mutate, 0), 4),
        flicker: Math.min(Math.max(config.flicker, 0), 1),
        layers: Math.round(Math.min(Math.max(config.layers, 1), 3)),
        dim: Math.min(Math.max(config.dim, 0), 1),
        light: Math.min(Math.max(config.light, 0), 3),
        lightRadius: Math.min(Math.max(config.lightRadius, 20), 600) * dpr,
        lightHeight: Math.max(config.lightHeight, 4) * dpr,
        relief: Math.min(Math.max(config.relief, 0), 2),
        stir: wakeTouched ? stirAmount() : 0,
        scroll: content.scrollTop * dpr,
        pageLum,
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
    sourceCtx!.clearRect(0, 0, source.width, source.height);
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
    if (!reducedMotion) time += delta;
    stepWake(delta);
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
        label: "glyph-rain",
      });
      linearSampler = sampler(gpu, {
        minFilter: "linear",
        magFilter: "linear",
        mipmapFilter: "linear",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
      });
      fx = effect(gpu, SHADER, {
        label: "glyph-rain",
        set: {
          uSampler: linearSampler,
          uContent: ensureContentTexture(),
          uAtlas: ensureAtlasTexture(),
          uWake: ensureWakeTexture(),
        },
      });
      syncCanvasSize();
      const charset = atlasCharset;
      atlasCharset = "";
      config.charset = charset;
      syncAtlas();
      uploadWake();
      start();
    })
    .catch((error) => {
      if (destroyed) return;
      console.warn("GlyphRain: WebGPU unavailable, showing content without the effect.", error);
      fallback2d = output.getContext("2d");
      contentDirty = true;
      start();
    });

  function onMotionChange() {
    reducedMotion = motionQuery.matches;
    if (reducedMotion) {
      tracking = false;
      wakeCharge.fill(0);
      for (let i = 0; i < WAKE_RES; i++) wakeField[i * 2 + 1] = 0;
      wakeLive = true;
    }
    start();
  }
  motionQuery.addEventListener("change", onMotionChange);
  content.addEventListener("scroll", start, { passive: true });

  const pointerHost = output.parentElement ?? output;

  function pointerNorm(event: PointerEvent): number {
    const box = output.getBoundingClientRect();
    if (box.width < 1) return -1;
    return (event.clientX - box.left) / box.width;
  }

  function onPointerMove(event: PointerEvent) {
    if (reducedMotion) return;
    const x = pointerNorm(event);
    if (x < 0) return;
    pointerX = x;
    tracking = true;
    start();
  }

  function onPointerLeave() {
    tracking = false;
  }

  function onPointerDown(event: PointerEvent) {
    if (reducedMotion || stirAmount() <= 0.001) return;
    const x = pointerNorm(event);
    if (x < 0) return;
    pointerX = x;
    tracking = true;
    const span = wakeSpan() * 1.8;
    for (let i = 0; i < WAKE_RES; i++) {
      const d = Math.abs((i + 0.5) / WAKE_RES - x) / span;
      if (d >= 1) continue;
      const t = 1 - d;
      const burst = t * t * (3 - 2 * t);
      if (burst > wakeCharge[i]) wakeCharge[i] = burst;
    }
    start();
  }

  pointerHost.addEventListener("pointermove", onPointerMove, { passive: true });
  pointerHost.addEventListener("pointerleave", onPointerLeave, { passive: true });
  pointerHost.addEventListener("pointercancel", onPointerLeave, { passive: true });
  pointerHost.addEventListener("pointerdown", onPointerDown, { passive: true });

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
      let changed = false;
      for (const [key, value] of Object.entries(next)) {
        const prev = config[key as keyof typeof config];
        if (Array.isArray(value) && Array.isArray(prev)) {
          if (
            value.length !== prev.length ||
            value.some((item, i) => item !== prev[i])
          ) {
            changed = true;
            break;
          }
        } else if (prev !== value) {
          changed = true;
          break;
        }
      }
      Object.assign(config, next);
      if (!changed) return;
      syncAtlas();
      syncCanvasSize();
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
      content.removeEventListener("scroll", start);
      pointerHost.removeEventListener("pointermove", onPointerMove);
      pointerHost.removeEventListener("pointerleave", onPointerLeave);
      pointerHost.removeEventListener("pointercancel", onPointerLeave);
      pointerHost.removeEventListener("pointerdown", onPointerDown);
      contentTexture?.destroy();
      atlasTexture?.destroy();
      wakeTexture?.destroy();
      screen?.dispose();
      if (htmlInCanvas) paintable.onpaint = null;
    },
  };
}
