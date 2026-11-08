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

export interface DecryptRevealOptions {
  /** Decrypt radius around the cursor in CSS pixels. */
  radius?: number;
  /** Feather of the decrypt edge as a fraction of the radius (0 to 1). */
  softness?: number;
  /** Glyph cell height in CSS pixels (4 to 40). */
  cell?: number;
  /** Width of a glyph cell relative to its height (0.35 to 1.25). */
  aspect?: number;
  /** Characters the cipher is written in. Order does not matter, shapes are matched automatically. */
  charset?: string;
  /** How much glyphs keep the color of the UI beneath them, 0 is monochrome (0 to 1). */
  colored?: number;
  /** Cipher color as any CSS color. Used for monochrome glyphs and the decrypt edge tint. */
  color?: string;
  /** Brightness of the cipher glyphs (0.2 to 3). */
  brightness?: number;
  /** Minimum contrast the cipher keeps against the background, so subtle UI stays readable while encrypted (0 to 1). */
  legibility?: number;
  /** Contrast of the glyph shape matching. Higher picks bolder characters (0.3 to 3). */
  contrast?: number;
  /** Exposure applied to the UI before it is matched to glyphs (0.2 to 3). */
  exposure?: number;
  /** Fraction of idle cipher cells that keep mutating (0 to 1). */
  scramble?: number;
  /** Cipher mutations per second (0 to 30). */
  scrambleSpeed?: number;
  /** Width of the decrypting flicker band as a fraction of the radius (0 to 1). */
  edgeWidth?: number;
  /** How violently characters flicker while they decrypt (0 to 1). */
  edgeFlicker?: number;
  /** Brightness surge of glyphs on the decrypt wavefront (0 to 3). */
  edgeGlow?: number;
  /** How strongly the wavefront tints toward the cipher color (0 to 1). */
  edgeTint?: number;
  /** Chromatic aberration of the revealed UI at the decrypt edge in CSS pixels. */
  aberration?: number;
  /** How much of the real UI shows through the cipher (0 to 1). 0 keeps the page fully encrypted. */
  passthrough?: number;
  /** Contrast against the background above which a cell counts as UI and earns a glyph. */
  threshold?: number;
  /** Color of the backdrop behind the content, as any CSS color. Used to tell UI pixels apart from empty space. */
  background?: string;
  /** Seconds the decrypt circle takes to catch up with the cursor. Higher feels more damped. */
  smoothing?: number;
}

export interface DecryptRevealElements {
  /** Canvas with layoutsubtree that hosts the HTML content. */
  source: HTMLCanvasElement;
  /** The element inside the source canvas that gets captured. */
  content: HTMLElement;
  /** Canvas the WebGPU effect renders to. */
  output: HTMLCanvasElement;
}

export interface DecryptRevealInstance {
  /** Update effect options live. */
  setOptions: (options: DecryptRevealOptions) => void;
  /** Re-read canvas size. Call when the element is resized. */
  resize: () => void;
  /** Stop the loop and release all GPU resources. */
  destroy: () => void;
}

const PRINTABLE_ASCII = Array.from({ length: 95 }, (_, i) =>
  String.fromCharCode(32 + i),
).join("");

const DEFAULTS: Required<DecryptRevealOptions> = {
  radius: 400,
  softness: 0.5,
  cell: 10,
  aspect: 0.75,
  charset: PRINTABLE_ASCII,
  colored: 1,
  color: "#4ade80",
  brightness: 1,
  legibility: 1,
  contrast: 1,
  exposure: 1,
  scramble: 0.1,
  scrambleSpeed: 6,
  edgeWidth: 0.2,
  edgeFlicker: 1,
  edgeGlow: 2,
  edgeTint: 0.75,
  aberration: 10,
  passthrough: 0.15,
  threshold: 0.025,
  background: "#000000",
  smoothing: 0.2,
};

const ATLAS_CELL = 64;
const ATLAS_PAD = 8;
const MAX_GLYPHS = 255;

const INNER_CIRCLES: Array<[number, number]> = [
  [0.28, 0.26],
  [0.72, 0.14],
  [0.28, 0.56],
  [0.72, 0.44],
  [0.28, 0.86],
  [0.72, 0.74],
];

type PaintableCanvas = HTMLCanvasElement & {
  onpaint?: (() => void) | null;
  requestPaint?: () => void;
};

type ElementImageContext = CanvasRenderingContext2D & {
  drawElementImage?: (element: Element, x: number, y: number) => void;
};

const CELL_SHADER = /* wgsl */ `
struct Params {
  contentRes: vec2f,
  cellPx: vec2f,
  bg: vec3f,
  glyphCount: u32,
  contrast: f32,
  exposure: f32,
  threshold: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var uContent: texture_2d<f32>;
@group(0) @binding(2) var uShapes: texture_2d<f32>;
@group(0) @binding(3) var uSampler: sampler;

const INNER: array<vec2f, 6> = array<vec2f, 6>(
  vec2f(0.28, 0.26), vec2f(0.72, 0.14),
  vec2f(0.28, 0.56), vec2f(0.72, 0.44),
  vec2f(0.28, 0.86), vec2f(0.72, 0.74)
);
const OUTER: array<vec2f, 10> = array<vec2f, 10>(
  vec2f(0.28, -0.2), vec2f(0.72, -0.2),
  vec2f(-0.22, 0.25), vec2f(1.22, 0.25),
  vec2f(-0.22, 0.5), vec2f(1.22, 0.5),
  vec2f(-0.22, 0.75), vec2f(1.22, 0.75),
  vec2f(0.28, 1.2), vec2f(0.72, 1.2)
);
const RING: array<vec2f, 6> = array<vec2f, 6>(
  vec2f(1.0, 0.0), vec2f(0.5, 0.8660254), vec2f(-0.5, 0.8660254),
  vec2f(-1.0, 0.0), vec2f(-0.5, -0.8660254), vec2f(0.5, -0.8660254)
);

fn fetchTap(p: vec2f) -> vec4f {
  let uv = p / params.contentRes;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { return vec4f(0.0); }
  return textureSampleLevel(uContent, uSampler, uv, 0.0);
}

fn tapLevel(t: vec4f) -> f32 {
  let straight = t.rgb / max(t.a, 1e-4);
  return dot(abs(straight - params.bg), vec3f(0.299, 0.587, 0.114)) * t.a;
}

fn circleSig(acc: vec4f) -> f32 {
  return clamp(tapLevel(acc) * params.exposure, 0.0, 1.0);
}

fn dirContrast(value: f32, ext: f32) -> f32 {
  let peak = max(value, ext);
  if (peak < 1e-4) { return value; }
  return pow(value / peak, params.contrast) * peak;
}

fn sampleCircle(c: vec2f, cellBase: vec2f) -> vec4f {
  let middle = cellBase + c * params.cellPx;
  let r = params.cellPx.y * 0.161;
  var acc = fetchTap(middle);
  for (var k = 0; k < 6; k++) {
    acc += fetchTap(middle + RING[k] * r);
  }
  return acc / 7.0;
}

@fragment fn fs_main(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let cellBase = floor(pos.xy) * params.cellPx;
  var v: array<f32, 6>;
  var colAcc = vec3f(0.0);
  var alphaAcc = 0.0;
  for (var i = 0; i < 6; i++) {
    let acc = sampleCircle(INNER[i], cellBase);
    v[i] = circleSig(acc);
    colAcc += acc.rgb;
    alphaAcc += acc.a;
  }
  var e: array<f32, 10>;
  for (var i = 0; i < 10; i++) {
    e[i] = circleSig(sampleCircle(OUTER[i], cellBase));
  }
  v[0] = dirContrast(v[0], max(max(e[0], e[1]), max(e[2], e[4])));
  v[1] = dirContrast(v[1], max(max(e[0], e[1]), max(e[3], e[5])));
  v[2] = dirContrast(v[2], max(e[2], max(e[4], e[6])));
  v[3] = dirContrast(v[3], max(e[3], max(e[5], e[7])));
  v[4] = dirContrast(v[4], max(max(e[4], e[6]), max(e[8], e[9])));
  v[5] = dirContrast(v[5], max(max(e[5], e[7]), max(e[8], e[9])));

  var gm: array<f32, 6>;
  var levSum = 0.0;
  var inkLev = 0.0;
  var inkCol = vec3f(0.0);
  let nx = i32(clamp(params.cellPx.x, 6.0, 20.0));
  let ny = i32(clamp(params.cellPx.y, 8.0, 32.0));
  let fx = f32(nx - 1);
  let fy = f32(ny - 1);
  for (var gy = 0; gy < ny; gy++) {
    for (var gx = 0; gx < nx; gx++) {
      let p = vec2f(f32(gx) / fx, f32(gy) / fy);
      let t = fetchTap(cellBase + p * params.cellPx);
      let lev = tapLevel(t);
      var idx = 0;
      if (p.y < 0.41) {
        idx = 0;
      } else if (p.y < 0.71) {
        idx = 2;
      } else {
        idx = 4;
      }
      if (p.x >= 0.5) { idx += 1; }
      gm[idx] = max(gm[idx], lev);
      levSum += lev;
      if (lev > inkLev) {
        inkLev = lev;
        inkCol = t.rgb / max(t.a, 1e-4);
      }
    }
  }
  inkLev *= params.exposure;
  for (var i = 0; i < 6; i++) {
    v[i] = max(v[i], clamp(gm[i] * params.exposure, 0.0, 1.0));
  }
  let peak = max(max(max(v[0], v[1]), max(v[2], v[3])), max(v[4], v[5]));
  let avgCol = colAcc / max(alphaAcc, 1e-4);
  if (peak < params.threshold) {
    return vec4f(avgCol, 0.0);
  }
  let mean = levSum * params.exposure / f32(nx * ny);
  let sharp = inkLev / max(mean, 1e-4);
  let solid = smoothstep(params.threshold, params.threshold * 1.6, inkLev);
  let lift = smoothstep(1.5, 3.0, sharp) * solid;
  let lifted = mix(peak, 1.0, lift);
  for (var i = 0; i < 6; i++) {
    v[i] = pow(min(v[i] / max(peak, 1e-4), 1.0), params.contrast) * lifted;
  }
  let cellCol = mix(avgCol, inkCol, lift);
  var best = 0;
  var bestD = 1e9;
  for (var g = 0; g < i32(params.glyphCount); g++) {
    var d = 0.0;
    for (var i = 0; i < 6; i++) {
      let diff = v[i] - textureLoad(uShapes, vec2i(i, g), 0).r;
      d += diff * diff;
    }
    if (d < bestD) {
      bestD = d;
      best = g;
    }
  }
  return vec4f(cellCol, f32(best) / 255.0);
}`;

const MAIN_SHADER = /* wgsl */ `
struct Params {
  res: vec2f,
  cellPx: vec2f,
  grid: vec2f,
  atlasGrid: vec2f,
  atlasPad: vec2f,
  atlasInner: vec2f,
  pointer: vec2f,
  color: vec3f,
  bg: vec3f,
  dpr: f32,
  glyphCount: u32,
  activeAmount: f32,
  radius: f32,
  softness: f32,
  colored: f32,
  brightness: f32,
  legibility: f32,
  scramble: f32,
  scrambleSpeed: f32,
  edgeWidth: f32,
  edgeFlicker: f32,
  edgeGlow: f32,
  edgeTint: f32,
  aberration: f32,
  passthrough: f32,
  time: f32,
  maxX: f32,
  crisp: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var uContent: texture_2d<f32>;
@group(0) @binding(2) var uCells: texture_2d<f32>;
@group(0) @binding(3) var uAtlas: texture_2d<f32>;
@group(0) @binding(4) var uSampler: sampler;

fn mod1(x: f32, y: f32) -> f32 { return x - y * floor(x / y); }

fn hash(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.x, p.y, p.x) * 0.1031);
  p3 += dot(p3, p3.yzx + vec3f(33.33));
  return fract((p3.x + p3.y) * p3.z);
}

fn samp(p: vec2f) -> vec4f {
  var uv = p / params.res;
  uv = clamp(uv, vec2f(0.001), vec2f(params.maxX - 0.001, 0.999));
  return textureSampleLevel(uContent, uSampler, uv, 0.0);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let pc = uv * params.res;
  let atlasStepForDerivatives = params.atlasInner / params.atlasGrid;
  let cellPosForDerivatives = pc * params.dpr / params.cellPx;
  let atlasDx = dpdx(cellPosForDerivatives) * atlasStepForDerivatives;
  let atlasDy = dpdy(cellPosForDerivatives) * atlasStepForDerivatives;
  if (pc.x > params.maxX * params.res.x) {
    return vec4f(0.0);
  }
  if (params.crisp > 0.5) {
    return samp(pc);
  }

  let dist = length(pc - params.pointer);
  let radius = max(params.radius, 1.0);
  let inner = radius * (1.0 - clamp(params.softness, 0.02, 1.0));
  let e = (1.0 - smoothstep(inner, radius, dist)) * params.activeAmount;

  let bandW = max(radius * clamp(params.edgeWidth, 0.0, 1.0) * 0.5, 6.0);
  let bandD = dist - mix(inner, radius, 0.5);
  let ring = exp(-bandD * bandD / (2.0 * bandW * bandW)) * params.activeAmount;

  let dir = (pc - params.pointer) / max(dist, 1e-3);
  let ca = params.aberration * ring;
  let rC = samp(pc);
  let real = vec3f(samp(pc + dir * ca).r, rC.g, samp(pc - dir * ca).b);

  let cellPos = pc * params.dpr / params.cellPx;
  let cell = clamp(floor(cellPos), vec2f(0.0), params.grid - vec2f(1.0));
  let info = textureLoad(uCells, vec2i(cell), 0);
  var glyph = floor(info.a * 255.0 + 0.5);

  let rerollP = clamp(params.scramble * 0.35 + ring * params.edgeFlicker, 0.0, 1.0);
  let speed = max(params.scrambleSpeed, 0.001) * (1.0 + ring * 2.5);
  let ft = floor(params.time * speed);
  let swap = step(1.0 - rerollP, hash(cell * 3.3 + vec2f(ft * 0.717, ft * 0.523)))
    * step(0.5, glyph);
  let pick = hash(cell + vec2f(ft * 0.613, ft * 0.831));
  glyph = mix(glyph, floor(pick * f32(params.glyphCount - 1u)) + 1.0, swap);

  let local = clamp(cellPos - cell, vec2f(0.0), vec2f(1.0));
  let gx = mod1(glyph, params.atlasGrid.x);
  let gy = floor(glyph / params.atlasGrid.x);
  let atlasUv = vec2f(
    (gx + params.atlasPad.x + local.x * params.atlasInner.x) / params.atlasGrid.x,
    (gy + params.atlasPad.y + local.y * params.atlasInner.y) / params.atlasGrid.y
  );
  let mask = textureSampleGrad(
    uAtlas,
    uSampler,
    atlasUv,
    atlasDx,
    atlasDy
  ).a * step(0.5, glyph);

  let cellCol = info.rgb;
  let lw = vec3f(0.299, 0.587, 0.114);
  let dev = cellCol - params.bg;
  let mag = dot(abs(dev), lw);
  let contrastTarget = clamp(params.legibility, 0.0, 1.0) * 0.75;
  let boost = clamp(contrastTarget / max(mag, 0.01), 1.0, 32.0);
  var vivid = clamp(params.bg + dev * boost, vec3f(0.0), vec3f(1.0));
  let vividMag = dot(abs(vivid - params.bg), lw);
  let ink = mix(vec3f(1.0), vec3f(0.06), step(0.5, dot(params.bg, lw)));
  vivid = mix(vivid, ink, clamp((contrastTarget - vividMag) / max(contrastTarget, 1e-3), 0.0, 1.0));
  let cellSig = clamp(mag * 1.6, 0.0, 1.0);
  let mono = params.color * mix(0.35, 1.2, cellSig);
  var glyphColor = mix(mono, vivid, clamp(params.colored, 0.0, 1.0));
  glyphColor = clamp(params.bg + (glyphColor - params.bg) * params.brightness, vec3f(0.0), vec3f(1.0));
  let cellLum = dot(vivid, lw);
  glyphColor = mix(
    glyphColor,
    params.color * max(params.brightness, 1.0) * (0.6 + cellLum),
    ring * clamp(params.edgeTint, 0.0, 1.0)
  );
  glyphColor = clamp(
    params.bg + (glyphColor - params.bg) * (1.0 + ring * params.edgeGlow * 1.6),
    vec3f(0.0),
    vec3f(1.0)
  );

  let base = mix(params.bg, real, clamp(params.passthrough, 0.0, 1.0));
  let encrypted = mix(base, glyphColor, mask);
  let col = mix(encrypted, real, e);
  let alpha = mix(max(rC.a, mask), rC.a, e);
  return vec4f(col, alpha);
}`;

const MIPMAP_SHADER = /* wgsl */ `
struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
}

@group(0) @binding(0) var uSampler: sampler;
@group(0) @binding(1) var uTexture: texture_2d<f32>;

@vertex fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VSOut {
  let pos = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f(3.0, -1.0),
    vec2f(-1.0, 3.0)
  );
  let p = pos[vertexIndex];
  var out: VSOut;
  out.pos = vec4f(p, 0.0, 1.0);
  out.uv = vec2f(p.x * 0.5 + 0.5, 1.0 - (p.y * 0.5 + 0.5));
  return out;
}

@fragment fn fs_main(input: VSOut) -> @location(0) vec4f {
  return textureSampleLevel(uTexture, uSampler, input.uv, 0.0);
}`;

let colorProbe: CanvasRenderingContext2D | null = null;

function parseColor(input: string): [number, number, number] {
  if (typeof document === "undefined") return [0, 0, 0];
  if (!colorProbe) {
    const probe = document.createElement("canvas");
    probe.width = 1;
    probe.height = 1;
    colorProbe = probe.getContext("2d", { willReadFrequently: true });
  }
  if (!colorProbe) return [0, 0, 0];
  colorProbe.fillStyle = "#000000";
  colorProbe.fillStyle = input;
  colorProbe.clearRect(0, 0, 1, 1);
  colorProbe.fillRect(0, 0, 1, 1);
  const data = colorProbe.getImageData(0, 0, 1, 1).data;
  return [data[0] / 255, data[1] / 255, data[2] / 255];
}

function buildGlyphList(charset: string) {
  const seen = new Set<string>([" "]);
  const glyphs = [" "];
  for (const ch of charset) {
    if (glyphs.length >= MAX_GLYPHS) break;
    if (ch === "\n" || ch === "\r" || ch === "\t" || seen.has(ch)) continue;
    seen.add(ch);
    glyphs.push(ch);
  }
  return glyphs;
}

function glyphShapes(
  image: ImageData,
  cols: number,
  cellW: number,
  cellH: number,
  count: number,
) {
  const vectors = new Float32Array(count * 6);
  const radius = cellH * 0.26;
  const padW = cellW + ATLAS_PAD * 2;
  const padH = cellH + ATLAS_PAD * 2;
  for (let g = 0; g < count; g++) {
    const originX = (g % cols) * padW + ATLAS_PAD;
    const originY = Math.floor(g / cols) * padH + ATLAS_PAD;
    for (let c = 0; c < 6; c++) {
      const cx = INNER_CIRCLES[c][0] * cellW;
      const cy = INNER_CIRCLES[c][1] * cellH;
      let sum = 0;
      let total = 0;
      for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
        for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
          const dx = x + 0.5 - cx;
          const dy = y + 0.5 - cy;
          if (dx * dx + dy * dy > radius * radius) continue;
          total += 1;
          if (
            x < -ATLAS_PAD ||
            y < -ATLAS_PAD ||
            x >= cellW + ATLAS_PAD ||
            y >= cellH + ATLAS_PAD
          )
            continue;
          sum += image.data[((originY + y) * image.width + originX + x) * 4 + 3];
        }
      }
      vectors[g * 6 + c] = total ? sum / (total * 255) : 0;
    }
  }
  for (let c = 0; c < 6; c++) {
    let peak = 0;
    for (let g = 0; g < count; g++) {
      peak = Math.max(peak, vectors[g * 6 + c]);
    }
    if (peak > 0) {
      for (let g = 0; g < count; g++) vectors[g * 6 + c] /= peak;
    }
  }
  return vectors;
}

function clampAspect(aspect: number) {
  return Math.min(Math.max(aspect || DEFAULTS.aspect, 0.35), 1.25);
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

/** One WebGPU device per page, shared by every DecryptReveal instance. */
function acquireGpu(): Promise<Gpu> {
  if (!sharedGpu) {
    sharedGpu = init().catch((error) => {
      sharedGpu = null;
      throw error;
    });
  }
  return sharedGpu;
}

function destroyTarget(t: VgpuTarget) {
  (t as unknown as { destroy(): void }).destroy();
}

function mipLevelCount(width: number, height: number) {
  return Math.floor(Math.log2(Math.max(width, height))) + 1;
}

export function createDecryptReveal(
  elements: DecryptRevealElements,
  options: DecryptRevealOptions = {},
): DecryptRevealInstance | null {
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
  let cellsDirty = true;
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
  let cellPass: Effect | null = null;
  let mainPass: Effect | null = null;
  let contentTexture: Texture | null = null;
  let shapeTexture: Texture | null = null;
  let atlasTexture: Texture | null = null;
  let cellTarget: VgpuTarget | null = null;
  let fallback2d: CanvasRenderingContext2D | null = null;
  let mipmapPipeline: GPURenderPipeline | null = null;
  let mipmapSampler: GPUSampler | null = null;

  let cellCols = 0;
  let cellRows = 0;
  let glyphCount = 0;
  let atlasCols = 1;
  let atlasRows = 1;
  let atlasPad: [number, number] = [0, 0];
  let atlasInner: [number, number] = [1, 1];
  let builtCharset = "";
  let builtAspect = 0;
  let contentMaxX = 1;

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
        label: "decrypt-reveal.content",
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

  function ensureShapeTexture(count: number): Texture {
    const h = Math.max(1, count);
    if (!shapeTexture || shapeTexture.size[1] !== h) {
      // A new wrapper invalidates vgpu's cached bindings to the old texture.
      shapeTexture?.destroy();
      shapeTexture = gpu!.device.createTexture({
        size: [6, h],
        format: "r32float",
        usage: ["texture_binding", "copy_dst"],
        label: "decrypt-reveal.shapes",
      });
    }
    return shapeTexture;
  }

  function ensureAtlasTexture(width: number, height: number): Texture {
    const mipLevelCountNow = mipLevelCount(width, height);
    if (!atlasTexture) {
      atlasTexture = gpu!.device.createTexture({
        size: [width, height],
        format: "rgba8unorm",
        usage: ["texture_binding", "copy_dst", "render_attachment"],
        mipLevelCount: mipLevelCountNow,
        label: "decrypt-reveal.atlas",
      });
    } else if (
      atlasTexture.size[0] !== width ||
      atlasTexture.size[1] !== height ||
      atlasTexture.mipLevelCount !== mipLevelCountNow
    ) {
      atlasTexture.destroy();
      atlasTexture = gpu!.device.createTexture({
        size: [width, height],
        format: "rgba8unorm",
        usage: ["texture_binding", "copy_dst", "render_attachment"],
        mipLevelCount: mipLevelCountNow,
        label: "decrypt-reveal.atlas",
      });
    }
    return atlasTexture;
  }

  function generateAtlasMipmaps(texture: Texture) {
    if (texture.mipLevelCount <= 1) return;
    const device = gpu!.gpu;
    if (!mipmapSampler) {
      mipmapSampler = device.createSampler({
        minFilter: "linear",
        magFilter: "linear",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
      });
    }
    if (!mipmapPipeline) {
      const shaderModule = device.createShaderModule({
        label: "decrypt-reveal.mipmap",
        code: MIPMAP_SHADER,
      });
      mipmapPipeline = device.createRenderPipeline({
        label: "decrypt-reveal.mipmap",
        layout: "auto",
        vertex: { module: shaderModule, entryPoint: "vs_main" },
        fragment: {
          module: shaderModule,
          entryPoint: "fs_main",
          targets: [{ format: "rgba8unorm" }],
        },
      });
    }
    const encoder = device.createCommandEncoder();
    for (let level = 1; level < texture.mipLevelCount; level++) {
      const sourceView = texture.gpu.createView({
        baseMipLevel: level - 1,
        mipLevelCount: 1,
      });
      const targetView = texture.gpu.createView({
        baseMipLevel: level,
        mipLevelCount: 1,
      });
      const bindGroup = device.createBindGroup({
        layout: mipmapPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: mipmapSampler },
          { binding: 1, resource: sourceView },
        ],
      });
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: targetView,
            loadOp: "clear",
            storeOp: "store",
            clearValue: [0, 0, 0, 0],
          },
        ],
      });
      pass.setPipeline(mipmapPipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3);
      pass.end();
    }
    device.queue.submit([encoder.finish()]);
  }

  function uploadShapeVectors(vectors: Float32Array, count: number) {
    const bytesPerRow = 256;
    const floatsPerRow = bytesPerRow / 4;
    const padded = new Float32Array(floatsPerRow * Math.max(1, count));
    for (let g = 0; g < count; g++) {
      for (let c = 0; c < 6; c++) {
        padded[g * floatsPerRow + c] = vectors[g * 6 + c];
      }
    }
    gpu!.gpu.queue.writeTexture(
      { texture: ensureShapeTexture(count).gpu },
      padded,
      { bytesPerRow, rowsPerImage: Math.max(1, count) },
      [6, Math.max(1, count)],
    );
  }

  function rebuildAtlas() {
    if (!gpu) return;
    const aspect = clampAspect(config.aspect);
    if (builtCharset === config.charset && builtAspect === aspect) return;
    const glyphs = buildGlyphList(config.charset);
    const cellH = ATLAS_CELL;
    const cellW = Math.max(Math.round(cellH * aspect), 8);
    const padW = cellW + ATLAS_PAD * 2;
    const padH = cellH + ATLAS_PAD * 2;
    const cols = Math.ceil(Math.sqrt(glyphs.length));
    const rows = Math.ceil(glyphs.length / cols);
    const atlasCanvas = document.createElement("canvas");
    atlasCanvas.width = cols * padW;
    atlasCanvas.height = rows * padH;
    const ctx = atlasCanvas.getContext("2d");
    if (!ctx) return;
    builtCharset = config.charset;
    builtAspect = aspect;
    ctx.clearRect(0, 0, atlasCanvas.width, atlasCanvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const fontPx = Math.floor(Math.min(cellH * 0.92, cellW / 0.58));
    ctx.font = `600 ${fontPx}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    for (let g = 0; g < glyphs.length; g++) {
      ctx.fillText(
        glyphs[g],
        (g % cols) * padW + padW / 2,
        Math.floor(g / cols) * padH + padH / 2,
      );
    }
    const image = ctx.getImageData(0, 0, atlasCanvas.width, atlasCanvas.height);
    const vectors = glyphShapes(image, cols, cellW, cellH, glyphs.length);

    const atlas = ensureAtlasTexture(atlasCanvas.width, atlasCanvas.height);
    gpu.gpu.queue.copyExternalImageToTexture(
      { source: atlasCanvas },
      { texture: atlas.gpu },
      [atlasCanvas.width, atlasCanvas.height],
    );
    generateAtlasMipmaps(atlas);
    uploadShapeVectors(vectors, glyphs.length);

    glyphCount = glyphs.length;
    atlasCols = cols;
    atlasRows = rows;
    atlasPad = [ATLAS_PAD / padW, ATLAS_PAD / padH];
    atlasInner = [cellW / padW, cellH / padH];
    cellsDirty = true;
  }

  function cellSizePx(dpr: number): [number, number] {
    const h = Math.min(Math.max(config.cell, 4), 40) * dpr;
    return [h * clampAspect(config.aspect), h];
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
    cellsDirty = true;
  }

  syncCanvasSize();

  function syncCellGrid() {
    if (!gpu) return;
    const dpr = output.width / Math.max(output.clientWidth, 1);
    const [cw, ch] = cellSizePx(dpr);
    const cols = Math.max(Math.ceil(output.width / cw), 1);
    const rows = Math.max(Math.ceil(output.height / ch), 1);
    if (cols === cellCols && rows === cellRows && cellTarget) return;
    cellCols = cols;
    cellRows = rows;
    const previous = cellTarget;
    cellTarget = target(gpu, {
      size: [cols, rows],
      format: "rgba8unorm",
      clearColor: [0, 0, 0, 0],
      label: "decrypt-reveal.cells",
    });
    if (previous) destroyTarget(previous);
    cellsDirty = true;
  }

  const pointer = {
    x: -1e5,
    y: -1e5,
    tx: -1e5,
    ty: -1e5,
    active: 0,
    target: 0,
  };
  let time = 0;
  let bgKey = "";
  let bg: [number, number, number] = [0, 0, 0];
  let colorKey = "";
  let fg: [number, number, number] = [0.29, 0.87, 0.5];

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reducedMotion = motionQuery.matches;

  function uploadContent() {
    if (!htmlInCanvas || !contentDirty || !gpu) return;
    contentDirty = false;
    cellsDirty = true;
    const texture = ensureContentTexture();
    gpu.gpu.queue.copyExternalImageToTexture(
      { source },
      { texture: texture.gpu },
      [source.width, source.height],
    );
    cellPass?.set({ uContent: texture });
    mainPass?.set({ uContent: texture });
  }

  function renderCells() {
    if (!cellsDirty || !gpu || !cellPass || !cellTarget || !shapeTexture) return;
    cellsDirty = false;
    const dpr = output.width / Math.max(output.clientWidth, 1);
    const [cw, ch] = cellSizePx(dpr);
    cellPass.set({
      uContent: ensureContentTexture(),
      uShapes: shapeTexture,
      params: {
        contentRes: [output.width, output.height],
        cellPx: [cw, ch],
        glyphCount,
        contrast: Math.min(Math.max(config.contrast, 0.3), 3),
        exposure: Math.min(Math.max(config.exposure, 0.2), 3),
        threshold: Math.max(config.threshold, 0.005),
        bg,
      },
    });
    cellPass.draw(cellTarget);
  }

  function render() {
    if (!gpu || !screen || !cellPass || !mainPass) return;
    uploadContent();
    if (config.background !== bgKey) {
      bgKey = config.background;
      bg = parseColor(config.background);
      cellsDirty = true;
    }
    if (config.color !== colorKey) {
      colorKey = config.color;
      fg = parseColor(config.color);
    }
    rebuildAtlas();
    syncCellGrid();
    renderCells();
    if (!cellTarget || !atlasTexture) return;

    const w = Math.max(output.clientWidth, 1);
    const h = Math.max(output.clientHeight, 1);
    const dpr = output.width / w;
    const [cw, ch] = cellSizePx(dpr);
    mainPass.set({
      uContent: ensureContentTexture(),
      uCells: cellTarget,
      uAtlas: atlasTexture,
      params: {
        res: [w, h],
        dpr,
        cellPx: [cw, ch],
        grid: [cellCols, cellRows],
        atlasGrid: [atlasCols, atlasRows],
        atlasPad,
        atlasInner,
        glyphCount,
        pointer: [pointer.x, pointer.y],
        activeAmount: pointer.active,
        radius: Math.max(config.radius, 1),
        softness: config.softness,
        colored: config.colored,
        color: fg,
        brightness: Math.min(Math.max(config.brightness, 0.2), 3),
        legibility: Math.min(Math.max(config.legibility, 0), 1),
        scramble: Math.min(Math.max(config.scramble, 0), 1),
        scrambleSpeed: Math.min(Math.max(config.scrambleSpeed, 0), 30),
        edgeWidth: config.edgeWidth,
        edgeFlicker: Math.min(Math.max(config.edgeFlicker, 0), 1),
        edgeGlow: Math.min(Math.max(config.edgeGlow, 0), 3),
        edgeTint: config.edgeTint,
        aberration: Math.max(config.aberration, 0),
        passthrough: config.passthrough,
        bg,
        time,
        maxX: contentMaxX,
        crisp: reducedMotion || !htmlInCanvas ? 1 : 0,
      },
    });
    gpuFrame(gpu, (f) => f.pass(screen!, mainPass!));
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
    time += delta;
    const tau = Math.max(config.smoothing, 1e-4);
    const k = reducedMotion ? 1 : 1 - Math.exp(-delta / tau);
    pointer.x += (pointer.tx - pointer.x) * k;
    pointer.y += (pointer.ty - pointer.y) * k;
    pointer.active += (pointer.target - pointer.active) * k;
    render();
    const settled =
      Math.abs(pointer.tx - pointer.x) < 0.1 &&
      Math.abs(pointer.ty - pointer.y) < 0.1 &&
      Math.abs(pointer.target - pointer.active) < 1e-3;
    const churning =
      (config.scramble > 0 && config.scrambleSpeed > 0) ||
      (pointer.active > 1e-3 && config.edgeFlicker > 0);
    if (settled && !contentDirty && (reducedMotion || !htmlInCanvas || !churning)) {
      pointer.x = pointer.tx;
      pointer.y = pointer.ty;
      pointer.active = pointer.target;
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
        label: "decrypt-reveal",
      });
      const linear = sampler(gpu, {
        minFilter: "linear",
        magFilter: "linear",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
      });
      cellPass = effect(gpu, CELL_SHADER, {
        label: "decrypt-reveal.cells",
        set: { uSampler: linear, uContent: ensureContentTexture() },
      });
      mainPass = effect(gpu, MAIN_SHADER, {
        label: "decrypt-reveal.main",
        set: { uSampler: linear, uContent: ensureContentTexture() },
      });
      rebuildAtlas();
      syncCanvasSize();
      start();
    })
    .catch((error) => {
      if (destroyed) return;
      console.warn(
        "DecryptReveal: WebGPU unavailable, showing content without the effect.",
        error,
      );
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
    const rect = rectCache.current;
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (pointer.target === 0 && pointer.active < 1e-3) {
      pointer.x = x;
      pointer.y = y;
    }
    pointer.tx = x;
    pointer.ty = y;
    pointer.target = 1;
    start();
  }

  function onPointerLeave() {
    pointer.target = 0;
    start();
  }

  listenTarget.addEventListener("pointermove", onPointerMove, { passive: true });
  listenTarget.addEventListener("pointerleave", onPointerLeave, { passive: true });

  return {
    setOptions(next) {
      let changed = false;
      for (const [key, value] of Object.entries(next)) {
        if (typeof value === "function") continue;
        if (config[key as keyof typeof config] !== value) {
          changed = true;
          break;
        }
      }
      if (!changed) {
        Object.assign(config, next);
        return;
      }
      const prev = {
        cell: config.cell,
        aspect: config.aspect,
        contrast: config.contrast,
        exposure: config.exposure,
        threshold: config.threshold,
      };
      Object.assign(config, next);
      if (
        config.cell !== prev.cell ||
        config.aspect !== prev.aspect ||
        config.contrast !== prev.contrast ||
        config.exposure !== prev.exposure ||
        config.threshold !== prev.threshold
      ) {
        cellsDirty = true;
      }
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
      contentTexture?.destroy();
      shapeTexture?.destroy();
      atlasTexture?.destroy();
      if (cellTarget) destroyTarget(cellTarget);
      screen?.dispose();
      if (htmlInCanvas) paintable.onpaint = null;
    },
  };
}
