import { getCanvasPixelRatio, createCanvasResizeObserver } from "../canvas-viewport";
import { isHtmlInCanvasBlocked, prepareHtmlInCanvas, drawHtmlInCanvas } from "../html-in-canvas";
import {
  effect as gpuEffect,
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
import { resolveOptions } from "../options";

export type AsciifySource = "gradient" | "page";
export type AsciifyClick = "wave" | "burst" | "none";

export interface AsciifyOptions {
  /** What the glyphs show: a color gradient that works in every browser, or the page beneath them (html-in-canvas only, falls back to the gradient). */
  source?: AsciifySource;
  /** Gradient colors from the trail's faint edge to its core, as CSS colors. Leave empty for a blue ramp that suits the background. */
  colors?: string[];
  /** Characters from sparse to dense. The first one is usually a space. */
  characters?: string;
  /** Font family the glyphs are drawn in. */
  fontFamily?: string;
  /** Glyph cell height in CSS pixels. */
  cellSize?: number;
  /** Radius of the cursor trail in CSS pixels. */
  radius?: number;
  /** Seconds the trail takes to fade once the cursor has passed. */
  trail?: number;
  /** How much the trail drifts and billows like smoke (0 to 1). */
  flow?: number;
  /** Share of cells that draw a glyph (0 to 1). */
  density?: number;
  /** Glyph opacity (0 to 1). */
  opacity?: number;
  /** Contrast applied before a glyph is picked. Higher values reach the dense glyphs sooner. */
  contrast?: number;
  /** Soft glow around the glyphs (0 to 1). */
  glow?: number;
  /** Share of glyphs drawn out of focus (0 to 1). */
  depth?: number;
  /** How often visible glyphs re-roll (0 to 1). */
  flicker?: number;
  /** Film grain over the effect (0 to 1). */
  grain?: number;
  /** How strongly the background color covers what's behind the glyphs (0 to 1). */
  veil?: number;
  /** Background color as any CSS color, or "auto" to match the page. Also decides whether glyphs glow (dark) or print (light). */
  background?: string;
  /** What a click does: a ring of glyphs, a burst at the cursor, or nothing. */
  click?: AsciifyClick;
  /** Drifting glyphs across the whole surface, even when the cursor is away (0 to 1). */
  ambient?: number;
  /** With source "page", leave text crisp and readable inside the trail. */
  keepText?: boolean;
}

export interface AsciifyElements {
  output: HTMLCanvasElement;
  source?: HTMLCanvasElement | null;
  content?: HTMLElement | null;
}

export interface AsciifyInstance {
  setOptions: (options: AsciifyOptions) => void;
  resize: () => void;
  destroy: () => void;
}

const DEFAULTS: Required<AsciifyOptions> = {
  source: "gradient",
  colors: [],
  characters: " .-=+xX0S8#@",
  fontFamily:
    '"Geist Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
  cellSize: 12,
  radius: 140,
  trail: 0.9,
  flow: 0.5,
  density: 0.75,
  opacity: 1,
  contrast: 1,
  glow: 0.6,
  depth: 0.3,
  flicker: 0.5,
  grain: 0.15,
  veil: 0.35,
  background: "auto",
  click: "wave",
  ambient: 0,
  keepText: true,
};

const DARK_RAMP = ["#1e3fd8", "#38bdf8", "#a5d8ff", "#f6f8ff"];
const LIGHT_RAMP = ["#a5d8ff", "#38bdf8", "#1e3fd8", "#0b1d6e"];

const MAX_TRAIL = 48;
const MAX_CLICKS = 4;
const HALO_SCALE = 4;
const WAVE_LIFE = 1.6;
const BURST_LIFE = 1.1;

type PaintableCanvas = HTMLCanvasElement & {
  onpaint?: (() => void) | null;
  requestPaint?: () => void;
};

type ElementImageContext = CanvasRenderingContext2D & {
  drawElementImage?: (element: Element, x: number, y: number) => void;
};

const COMMON = `
fn hash12(p: vec2f) -> f32 {
  var q = fract(vec3f(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

fn luma(c: vec3f) -> f32 {
  return dot(c, vec3f(0.2126, 0.7152, 0.0722));
}
`;

const FIELD = `
struct FieldParams {
  trail: array<vec4f, ${MAX_TRAIL}>,
  clicks: array<vec4f, ${MAX_CLICKS}>,
  grid: vec2f,
  cell: vec2f,
  trailCount: i32,
  clickMode: i32,
  radius: f32,
  ambient: f32,
  flow: f32,
  time: f32,
  seed: f32,
}

@group(0) @binding(0) var<uniform> params: FieldParams;
${COMMON}
fn noise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (3.0 - 2.0 * f);
  let a = hash12(i);
  let b = hash12(i + vec2f(1.0, 0.0));
  let c = hash12(i + vec2f(0.0, 1.0));
  let d = hash12(i + vec2f(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

fn segment(p: vec2f, a: vec2f, b: vec2f) -> vec2f {
  let pa = p - a;
  let ba = b - a;
  let h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-4), 0.0, 1.0);
  return vec2f(length(pa - ba * h), h);
}

@fragment fn fs_main(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let cell = floor(pos.xy);
  let p = (cell + 0.5) * params.cell;
  let q = p / params.radius;
  var warp = vec2f(
    noise(q * 1.3 + vec2f(params.time * 0.4, 0.0) + params.seed * 5.0),
    noise(q * 1.3 + vec2f(7.1, -params.time * 0.35) + params.seed * 9.0)
  ) - 0.5;
  warp += (vec2f(
    noise(q * 3.1 - vec2f(0.0, params.time * 0.7) + 3.7),
    noise(q * 3.1 + vec2f(params.time * 0.6, 11.3))
  ) - 0.5) * 0.45;
  let pw = p + warp * params.radius * 0.9 * params.flow;
  var t = 0.0;
  for (var i = 0; i < ${MAX_TRAIL}; i++) {
    if (i >= params.trailCount) { break; }
    let a = params.trail[i];
    var b = a;
    if (i + 1 < params.trailCount) { b = params.trail[i + 1]; }
    if (b.w < 0.0) { b = a; }
    let s = segment(pw, a.xy, b.xy);
    let r = max(mix(abs(a.w), abs(b.w), s.y), 1.0);
    let k = s.x / r;
    t = max(t, mix(a.z, b.z, s.y) * exp(-k * k * 2.2));
  }
  var scramble = t * (1.0 - t) * 2.4;
  for (var i = 0; i < ${MAX_CLICKS}; i++) {
    let c = params.clicks[i];
    if (c.w <= 0.0) { continue; }
    let d = length(p - c.xy);
    let grow = 1.0 - exp(-c.z * 2.2);
    let wobble = 0.7 + 0.3 * noise((p - c.xy) / params.radius * 1.6 + c.z * 0.8 + params.seed * 7.0);
    var v = 0.0;
    if (params.clickMode == 1) {
      let ring = params.radius * (0.15 + 3.4 * grow);
      let width = params.radius * (0.4 + 0.5 * grow);
      let x = (d - ring) / width;
      let profile = select(exp(-x * x * 0.8), exp(-x * x * 1.8), x > 0.0);
      v = profile * wobble * 0.6 * c.w * smoothstep(0.0, 0.12, c.z);
    } else if (params.clickMode == 2) {
      let size = params.radius * (0.4 + 1.0 * (1.0 - exp(-c.z * 5.0)));
      let x = d / size;
      v = exp(-x * x * 2.2) * wobble * 0.75 * c.w * smoothstep(0.0, 0.08, c.z);
    }
    t = max(t, v);
    scramble = max(scramble, v * 0.5);
  }
  if (params.ambient > 0.0) {
    let aq = cell * 0.06 + params.seed * 13.0;
    var n = noise(aq + vec2f(params.time * 0.05, -params.time * 0.03));
    n = 0.65 * n + 0.35 * noise(aq * 2.1 - vec2f(params.time * 0.04, params.time * 0.06));
    t = max(t, smoothstep(0.42, 0.85, n) * params.ambient * 0.75);
  }
  return vec4f(clamp(t, 0.0, 1.0), clamp(scramble, 0.0, 1.0), 0.0, 1.0);
}`;

const CELLS = `
struct CellsParams {
  grid: vec2f,
  cell: vec2f,
  resolution: vec2f,
  bg: vec3f,
}

@group(0) @binding(0) var<uniform> params: CellsParams;
@group(0) @binding(1) var uContent: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
${COMMON}
@fragment fn fs_main(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let cell = floor(pos.xy);
  let origin = cell * params.cell;
  var sum = vec3f(0.0);
  for (var y = 0; y < 4; y++) {
    for (var x = 0; x < 4; x++) {
      let p = origin + (vec2f(f32(x), f32(y)) + 0.5) * 0.25 * params.cell;
      let c = textureSampleLevel(uContent, uSampler, min(p, params.resolution - 0.5) / params.resolution, 0.0);
      sum += mix(params.bg, c.rgb, c.a);
    }
  }
  let average = sum / 16.0;
  let contrast = abs(luma(average) - luma(params.bg)) * 1.6;
  let chroma = length(average - params.bg) * 0.7;
  return vec4f(average, clamp(max(contrast, chroma), 0.0, 1.0));
}`;

const GLYPHS = `
struct GlyphParams {
  bg: vec3f,
  count: f32,
  grid: vec2f,
  cell: vec2f,
  resolution: vec2f,
  density: f32,
  opacity: f32,
  contrast: f32,
  flicker: f32,
  depth: f32,
  time: f32,
  seed: f32,
  page: f32,
  light: f32,
  keepText: f32,
}

@group(0) @binding(0) var<uniform> glyphs: GlyphParams;
@group(0) @binding(1) var uField: texture_2d<f32>;
@group(0) @binding(2) var uCells: texture_2d<f32>;
@group(0) @binding(3) var uAtlas: texture_2d<f32>;
@group(0) @binding(4) var uRamp: texture_2d<f32>;
@group(0) @binding(5) var uTextMask: texture_2d<f32>;
@group(0) @binding(6) var uSampler: sampler;
${COMMON}
fn fieldAt(cell: vec2f) -> vec4f {
  return textureLoad(uField, vec2i(cell), 0);
}

fn cellsAt(cell: vec2f) -> vec4f {
  return textureLoad(uCells, vec2i(cell), 0);
}

fn fieldUv(px: vec2f) -> vec2f {
  return px / (glyphs.grid * glyphs.cell);
}

fn textAt(px: vec2f) -> f32 {
  if (glyphs.page < 0.5 || glyphs.keepText < 0.5) { return 0.0; }
  return smoothstep(0.25, 0.75, textureSampleLevel(uTextMask, uSampler, px / glyphs.resolution, 0.0).r);
}

fn atlasAt(index: f32, local: vec2f, soft: f32) -> f32 {
  let inset = clamp(local, vec2f(0.02), vec2f(0.98));
  let uv = vec2f((index + inset.x) / glyphs.count, (soft + inset.y) * 0.5);
  return textureSampleLevel(uAtlas, uSampler, uv, 0.0).a;
}

fn glyphAt(px: vec2f, halo: bool) -> vec4f {
  let coord = px / glyphs.cell;
  let cell = floor(coord);
  if (cell.x < 0.0 || cell.y < 0.0 || cell.x >= glyphs.grid.x || cell.y >= glyphs.grid.y) { return vec4f(0.0); }
  let field = fieldAt(cell);
  let t = field.r;
  if (t < 0.003) { return vec4f(0.0); }
  let local = coord - cell;
  let pick = hash12(cell + glyphs.seed * 7.31);
  let level = hash12(cell * 1.73 + 4.1 + glyphs.seed);
  var page = vec4f(0.0);
  var tone = t;
  if (glyphs.page > 0.5) {
    page = cellsAt(cell);
    tone = page.a;
  }
  tone = clamp((tone - 0.5) * glyphs.contrast + 0.5, 0.0, 1.0);
  let tick = floor(glyphs.time * 9.0 + level * 9.0);
  let wobble = (hash12(cell * 2.31 + tick * 17.7) - 0.5) * glyphs.flicker * 0.4 + (level - 0.5) * 0.12;
  let shade = clamp(pow(tone, 0.8) + wobble, 0.0, 1.0);
  var index = floor(shade * (glyphs.count - 1.0) + 0.5);
  let scramble = field.g * max(glyphs.flicker, 0.35);
  if (scramble > 0.02) {
    let beat = floor(glyphs.time * 20.0);
    if (hash12(cell * 3.7 + beat * 5.3) < scramble) {
      index = 1.0 + floor(hash12(cell + beat * 1.37) * (glyphs.count - 1.0));
    }
  }
  var present = step(pick, glyphs.density * mix(1.0, 0.3 + t * 1.1, 0.55));
  if (glyphs.page > 0.5) { present *= smoothstep(0.02, 0.08, page.a); }
  let focus = step(hash12(cell * 0.71 + 9.2 + glyphs.seed), glyphs.depth);
  var coverage = 0.35 * step(0.5, index);
  if (!halo) { coverage = atlasAt(index, local, focus); }
  let alpha = glyphs.opacity * present * coverage * smoothstep(0.0, 0.55, t)
    * mix(1.0, 0.35 + 0.65 * level, 0.55) * (1.0 - focus * 0.45);
  var color: vec3f;
  if (glyphs.page > 0.5) {
    color = clamp(glyphs.bg + (page.rgb - glyphs.bg) / max(abs(luma(page.rgb) - luma(glyphs.bg)), 0.2), vec3f(0.0), vec3f(1.0));
  } else {
    color = textureSampleLevel(uRamp, uSampler, vec2f(clamp(t * 0.85 + level * 0.15, 0.0, 1.0), 0.5), 0.0).rgb;
  }
  if (glyphs.light > 0.5) { return vec4f(color * alpha, alpha); }
  return vec4f(color * alpha, alpha * 0.75);
}
`;

const HALO = `
struct HaloParams {
  downscale: f32,
}
${GLYPHS}
@group(0) @binding(7) var<uniform> haloParams: HaloParams;

@fragment fn fs_main(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let px = pos.xy * haloParams.downscale;
  return glyphAt(px, true) * (1.0 - textAt(px));
}`;

const BLUR = `
struct BlurParams {
  dir: vec2f,
  size: vec2f,
}

@group(0) @binding(0) var<uniform> params: BlurParams;
@group(0) @binding(1) var uSource: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

@fragment fn fs_main(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let uv = pos.xy / params.size;
  var sum = textureSampleLevel(uSource, uSampler, uv, 0.0) * 0.2270270270;
  sum += textureSampleLevel(uSource, uSampler, uv + params.dir * 1.3846153846, 0.0) * 0.3162162162;
  sum += textureSampleLevel(uSource, uSampler, uv - params.dir * 1.3846153846, 0.0) * 0.3162162162;
  sum += textureSampleLevel(uSource, uSampler, uv + params.dir * 3.2307692308, 0.0) * 0.0702702703;
  sum += textureSampleLevel(uSource, uSampler, uv - params.dir * 3.2307692308, 0.0) * 0.0702702703;
  return sum;
}`;

const COMPOSITE = `
struct CompositeParams {
  glow: f32,
  grain: f32,
  veil: f32,
  frame: f32,
  haloSize: vec2f,
}
${GLYPHS}
@group(0) @binding(7) var<uniform> composite: CompositeParams;
@group(0) @binding(8) var uHalo: texture_2d<f32>;

@fragment fn fs_main(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let px = pos.xy;
  let fuv = fieldUv(px);
  let mask = smoothstep(0.0, 0.5, textureSampleLevel(uField, uSampler, fuv, 0.0).r);
  let text = textAt(px);
  var back: vec4f;
  if (glyphs.page > 0.5) {
    let soft = textureSampleLevel(uCells, uSampler, fuv, 0.0).rgb;
    back = vec4f(mix(soft, glyphs.bg, composite.veil), 1.0) * mask * (1.0 - text);
  } else {
    back = vec4f(glyphs.bg, 1.0) * mask * composite.veil;
  }
  let glyph = glyphAt(px, false) * (1.0 - text);
  let halo = textureSampleLevel(uHalo, uSampler, px / (composite.haloSize * ${HALO_SCALE.toFixed(1)}), 0.0) * composite.glow;
  var color = back * (1.0 - glyph.a) + glyph;
  if (glyphs.light > 0.5) {
    color += halo * 0.6 * (1.0 - color.a);
  } else {
    color += halo;
  }
  let body = clamp(color.a, 0.0, 1.0);
  let grain = (hash12(pos.xy + composite.frame * vec2f(17.0, 59.0))
    + hash12(pos.xy * 1.31 + composite.frame * 7.0) - 1.0) * composite.grain;
  let rgb = clamp(color.rgb + grain * body * 0.5, vec3f(0.0), vec3f(1.0));
  return vec4f(rgb, max(body, max(rgb.r, max(rgb.g, rgb.b))));
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

type Rgb = [number, number, number];

const colorProbe: { ctx: CanvasRenderingContext2D | null } = { ctx: null };

function readColor(value: string): [number, number, number, number] | null {
  if (typeof document === "undefined") return null;
  if (!colorProbe.ctx) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    colorProbe.ctx = canvas.getContext("2d", { willReadFrequently: true });
  }
  const ctx = colorProbe.ctx;
  if (!ctx) return null;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = "#000";
  ctx.fillStyle = value;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  return [r / 255, g / 255, b / 255, a / 255];
}

function parseColor(value: string, fallback: Rgb): Rgb {
  const color = readColor(value);
  if (!color || color[3] === 0) return fallback;
  return [color[0], color[1], color[2]];
}

function toLinear(value: number) {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function toSrgb(value: number) {
  const v = Math.min(Math.max(value, 0), 1);
  return v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055;
}

function toOklab([r, g, b]: Rgb): Rgb {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function fromOklab([L, A, B]: Rgb): Rgb {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

export function buildAsciifyRamp(colors: string[], size = 256): Uint8Array {
  const stops = (colors.length ? colors : DARK_RAMP).map((color) =>
    toOklab(parseColor(color, [1, 1, 1])),
  );
  if (stops.length === 1) stops.push(stops[0]);
  const data = new Uint8Array(size * 4);
  for (let i = 0; i < size; i++) {
    const x = (i / (size - 1)) * (stops.length - 1);
    const index = Math.min(Math.floor(x), stops.length - 2);
    const f = x - index;
    const a = stops[index];
    const b = stops[index + 1];
    const rgb = fromOklab([
      a[0] + (b[0] - a[0]) * f,
      a[1] + (b[1] - a[1]) * f,
      a[2] + (b[2] - a[2]) * f,
    ]);
    data[i * 4] = Math.round(rgb[0] * 255);
    data[i * 4 + 1] = Math.round(rgb[1] * 255);
    data[i * 4 + 2] = Math.round(rgb[2] * 255);
    data[i * 4 + 3] = 255;
  }
  return data;
}

export interface AsciifyAtlas {
  canvas: HTMLCanvasElement;
  count: number;
  cellWidth: number;
  cellHeight: number;
}

export function buildAsciifyAtlas(
  characters: string,
  fontFamily: string,
  cellHeight: number,
): AsciifyAtlas {
  const glyphs = Array.from(characters.length ? characters : DEFAULTS.characters);
  const height = Math.max(4, Math.round(cellHeight));
  const width = Math.max(3, Math.round(height * 0.62));
  const canvas = document.createElement("canvas");
  canvas.width = width * glyphs.length;
  canvas.height = height * 2;
  const ctx = canvas.getContext("2d");
  if (!ctx) return { canvas, count: glyphs.length, cellWidth: width, cellHeight: height };
  const fontSize = height * 0.8;
  ctx.font = `500 ${fontSize}px ${fontFamily}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff";
  const blur = Math.max(1, height * 0.14);
  const shift = canvas.width + height * 4;
  glyphs.forEach((glyph, index) => {
    const x = index * width + width / 2;
    const y = height / 2 + height * 0.04;
    ctx.save();
    ctx.beginPath();
    ctx.rect(index * width, 0, width, height);
    ctx.clip();
    ctx.fillText(glyph, x, y);
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.rect(index * width, height, width, height);
    ctx.clip();
    ctx.shadowColor = "#fff";
    ctx.shadowBlur = blur;
    ctx.shadowOffsetX = shift;
    ctx.fillText(glyph, x - shift, y + height);
    ctx.restore();
  });
  return { canvas, count: glyphs.length, cellWidth: width, cellHeight: height };
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

function destroyTarget(value: VgpuTarget | null) {
  (value as unknown as { destroy(): void } | null)?.destroy();
}

export function createAsciify(
  elements: AsciifyElements,
  options: AsciifyOptions = {},
): AsciifyInstance | null {
  if (!supportsWebGPU()) return null;
  try {
    return initializeAsciify(elements, options);
  } catch (error) {
    console.error("Asciify initialization failed:", error);
    return null;
  }
}

function initializeAsciify(
  elements: AsciifyElements,
  options: AsciifyOptions,
): AsciifyInstance | null {
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

  const pageMode = () => htmlInCanvas && config.source === "page";

  let destroyed = false;
  let contentDirty = false;
  let textureUploadErrorLogged = false;
  let wake = () => {};

  if (htmlInCanvas) {
    paintable!.onpaint = () => {
      try {
        sourceCtx!.reset();
        drawHtmlInCanvas(source!, sourceCtx!, content!, true);
        contentDirty = true;
        scheduleTextMask();
        wake();
      } catch {}
    };
  }

  let gpu: Gpu | null = null;
  let screen: Surface | null = null;
  let fieldFx: Effect | null = null;
  let cellsFx: Effect | null = null;
  let haloFx: Effect | null = null;
  let blurFx: Effect[] = [];
  let compositeFx: Effect | null = null;
  let field: VgpuTarget | null = null;
  let cells: VgpuTarget | null = null;
  let haloA: VgpuTarget | null = null;
  let haloB: VgpuTarget | null = null;
  let contentTexture: Texture | null = null;
  let atlasTexture: Texture | null = null;
  let rampTexture: Texture | null = null;
  let maskTexture: Texture | null = null;
  let fallback2d: CanvasRenderingContext2D | null = null;

  let dpr = 1;
  let cellWidth = 7;
  let cellHeight = 12;
  let glyphCount = 1;
  let gridWidth = 1;
  let gridHeight = 1;
  let haloWidth = 1;
  let haloHeight = 1;
  let atlasKey = "";
  let rampKey = "";
  let atlasCanvas: HTMLCanvasElement | null = null;
  let atlasDirty = false;
  let rampData: Uint8Array | null = null;
  let rampDirty = false;
  const seed = Math.random();

  function createTexture(
    width: number,
    height: number,
    label: string,
  ): Texture {
    return gpu!.device.createTexture({
      size: [Math.max(1, width), Math.max(1, height)],
      format: "rgba8unorm",
      usage: ["texture_binding", "copy_dst", "render_attachment"],
      label,
    });
  }

  function syncAtlas() {
    const height = Math.max(4, Math.round(Math.max(config.cellSize, 4) * dpr));
    const key = `${config.characters}|${config.fontFamily}|${height}`;
    if (key === atlasKey) return;
    atlasKey = key;
    const atlas = buildAsciifyAtlas(config.characters, config.fontFamily, height);
    cellWidth = atlas.cellWidth;
    cellHeight = atlas.cellHeight;
    glyphCount = atlas.count;
    atlasCanvas = atlas.canvas;
    atlasDirty = true;
    uploadAtlas();
  }

  function uploadAtlas() {
    if (!gpu || !atlasDirty || !atlasCanvas) return;
    atlasDirty = false;
    const width = Math.max(1, atlasCanvas.width);
    const height = Math.max(1, atlasCanvas.height);
    if (
      !atlasTexture ||
      atlasTexture.size[0] !== width ||
      atlasTexture.size[1] !== height
    ) {
      atlasTexture?.destroy();
      atlasTexture = createTexture(width, height, "asciify.atlas");
    }
    gpu.gpu.queue.copyExternalImageToTexture(
      { source: atlasCanvas },
      { texture: atlasTexture.gpu },
      [width, height],
    );
    haloFx?.set({ uAtlas: atlasTexture });
    compositeFx?.set({ uAtlas: atlasTexture });
  }

  let backingRgb: Rgb = [1, 1, 1];
  let light = true;

  function syncBacking() {
    let detected: Rgb = [1, 1, 1];
    let el: Element | null = content ?? output.parentElement ?? output;
    while (el) {
      const color = readColor(getComputedStyle(el).backgroundColor);
      if (color && color[3] > 0.5) {
        detected = [color[0], color[1], color[2]];
        break;
      }
      el = el.parentElement;
    }
    backingRgb =
      config.background === "auto"
        ? detected
        : parseColor(config.background, detected);
    light =
      0.2126 * backingRgb[0] + 0.7152 * backingRgb[1] + 0.0722 * backingRgb[2] >
      0.5;
  }

  function syncRamp() {
    const colors = config.colors.length
      ? config.colors
      : light
        ? LIGHT_RAMP
        : DARK_RAMP;
    const key = colors.join(",");
    if (key === rampKey) return;
    rampKey = key;
    rampData = buildAsciifyRamp(colors);
    rampDirty = true;
    uploadRamp();
  }

  function uploadRamp() {
    if (!gpu || !rampDirty || !rampData) return;
    rampDirty = false;
    if (!rampTexture) {
      rampTexture = gpu.device.createTexture({
        size: [256, 1],
        format: "rgba8unorm",
        usage: ["texture_binding", "copy_dst"],
        label: "asciify.ramp",
      });
    }
    gpu.gpu.queue.writeTexture(
      { texture: rampTexture.gpu },
      rampData as Uint8Array<ArrayBuffer>,
      { bytesPerRow: 256 * 4, rowsPerImage: 1 },
      [256, 1],
    );
    haloFx?.set({ uRamp: rampTexture });
    compositeFx?.set({ uRamp: rampTexture });
  }

  const MASK_SCALE = 0.25;
  const maskCanvas = document.createElement("canvas");
  const maskCtx = maskCanvas.getContext("2d");
  let maskDirty = false;
  let maskTimer = 0;
  let maskStamp = 0;

  function buildTextMask() {
    if (!maskCtx || !content) return;
    const bounds = output.getBoundingClientRect();
    const reach = 400;
    const width = Math.max(1, Math.round(bounds.width * MASK_SCALE));
    const height = Math.max(1, Math.round(bounds.height * MASK_SCALE));
    if (maskCanvas.width !== width || maskCanvas.height !== height) {
      maskCanvas.width = width;
      maskCanvas.height = height;
    }
    maskCtx.clearRect(0, 0, width, height);
    maskCtx.fillStyle = "#fff";
    const walker = document.createTreeWalker(
      content,
      NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
      {
        acceptNode(node) {
          if (node.nodeType === Node.TEXT_NODE) return NodeFilter.FILTER_ACCEPT;
          if (node === output || node === source) return NodeFilter.FILTER_REJECT;
          const r = (node as Element).getBoundingClientRect();
          if (r.width === 0 && r.height === 0) return NodeFilter.FILTER_SKIP;
          const outside =
            r.bottom < bounds.top - reach ||
            r.top > bounds.bottom + reach ||
            r.right < bounds.left - reach ||
            r.left > bounds.right + reach;
          return outside ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP;
        },
      },
    );
    const range = document.createRange();
    let node: Node | null;
    while ((node = walker.nextNode())) {
      if (!node.textContent?.trim()) continue;
      const parent = node.parentElement;
      if (!parent || (parent.checkVisibility && !parent.checkVisibility())) {
        continue;
      }
      range.selectNodeContents(node);
      const rects = range.getClientRects();
      for (let i = 0; i < rects.length; i++) {
        const r = rects[i];
        if (r.width < 1 || r.height < 1) continue;
        if (r.bottom < bounds.top || r.top > bounds.bottom) continue;
        if (r.right < bounds.left || r.left > bounds.right) continue;
        maskCtx.fillRect(
          (r.left - bounds.left - 2) * MASK_SCALE,
          (r.top - bounds.top - 2) * MASK_SCALE,
          (r.width + 4) * MASK_SCALE,
          (r.height + 4) * MASK_SCALE,
        );
      }
    }
    const fields = content.querySelectorAll("input, textarea, select");
    for (let i = 0; i < fields.length; i++) {
      const r = fields[i].getBoundingClientRect();
      if (r.width < 1 || r.height < 1) continue;
      if (r.bottom < bounds.top || r.top > bounds.bottom) continue;
      maskCtx.fillRect(
        (r.left - bounds.left) * MASK_SCALE,
        (r.top - bounds.top) * MASK_SCALE,
        r.width * MASK_SCALE,
        r.height * MASK_SCALE,
      );
    }
    maskDirty = true;
  }

  function scheduleTextMask() {
    if (!pageMode() || !config.keepText || maskTimer || destroyed) return;
    const wait = Math.max(0, 120 - (performance.now() - maskStamp));
    maskTimer = window.setTimeout(() => {
      maskTimer = 0;
      maskStamp = performance.now();
      buildTextMask();
      start();
    }, wait);
  }

  function sizeTarget(t: VgpuTarget | null, width: number, height: number) {
    if (t && (t.size[0] !== width || t.size[1] !== height)) {
      t.resize([width, height]);
    }
  }

  function syncCanvasSize(): boolean {
    let changed = false;
    dpr = getCanvasPixelRatio(output);
    const width = Math.max(1, Math.round(output.clientWidth * dpr));
    const height = Math.max(1, Math.round(output.clientHeight * dpr));
    if (output.width !== width || output.height !== height) {
      if (screen) screen.resize([width, height]);
      else {
        output.width = width;
        output.height = height;
      }
      changed = true;
    }
    if (htmlInCanvas) {
      const sourceWidth = Math.max(1, Math.round(source!.clientWidth * dpr));
      const sourceHeight = Math.max(1, Math.round(source!.clientHeight * dpr));
      if (source!.width !== sourceWidth || source!.height !== sourceHeight) {
        source!.width = sourceWidth;
        source!.height = sourceHeight;
        changed = true;
      }
      paintable!.requestPaint!();
    }
    syncAtlas();
    gridWidth = Math.max(1, Math.ceil(output.width / cellWidth));
    gridHeight = Math.max(1, Math.ceil(output.height / cellHeight));
    sizeTarget(field, gridWidth, gridHeight);
    sizeTarget(cells, gridWidth, gridHeight);
    haloWidth = Math.max(1, Math.ceil(output.width / HALO_SCALE));
    haloHeight = Math.max(1, Math.ceil(output.height / HALO_SCALE));
    sizeTarget(haloA, haloWidth, haloHeight);
    sizeTarget(haloB, haloWidth, haloHeight);
    return changed;
  }

  syncBacking();
  syncRamp();
  syncCanvasSize();

  type TrailPoint = {
    x: number;
    y: number;
    vx: number;
    vy: number;
    born: number;
    scale: number;
    linked: boolean;
  };
  type Click = { x: number; y: number; born: number };
  const trail: TrailPoint[] = [];
  const clicks: Click[] = [];
  const trailData = Array.from({ length: MAX_TRAIL }, () => [0, 0, 0, 0]);
  const clickData = Array.from({ length: MAX_CLICKS }, () => [0, 0, 0, 0]);
  const pointer = {
    x: 0,
    y: 0,
    tx: 0,
    ty: 0,
    sx: 0,
    sy: 0,
    has: false,
    fresh: true,
  };

  function uploadContent() {
    if (!gpu || !htmlInCanvas || !contentDirty) return;
    contentDirty = false;
    try {
      const width = Math.max(1, source!.width);
      const height = Math.max(1, source!.height);
      if (
        !contentTexture ||
        contentTexture.size[0] !== width ||
        contentTexture.size[1] !== height
      ) {
        contentTexture?.destroy();
        contentTexture = createTexture(width, height, "asciify.content");
        cellsFx?.set({ uContent: contentTexture });
      }
      gpu.gpu.queue.copyExternalImageToTexture(
        { source: source! },
        { texture: contentTexture.gpu },
        [width, height],
      );
      textureUploadErrorLogged = false;
    } catch (error) {
      if (!textureUploadErrorLogged) {
        textureUploadErrorLogged = true;
        console.warn("Asciify could not upload its content texture:", error);
      }
    }
  }

  function uploadMask() {
    if (!gpu || !maskDirty) return;
    maskDirty = false;
    const width = Math.max(1, maskCanvas.width);
    const height = Math.max(1, maskCanvas.height);
    if (
      !maskTexture ||
      maskTexture.size[0] !== width ||
      maskTexture.size[1] !== height
    ) {
      maskTexture?.destroy();
      maskTexture = createTexture(width, height, "asciify.text-mask");
      haloFx?.set({ uTextMask: maskTexture });
      compositeFx?.set({ uTextMask: maskTexture });
    }
    gpu.gpu.queue.copyExternalImageToTexture(
      { source: maskCanvas },
      { texture: maskTexture.gpu },
      [width, height],
    );
  }

  let elapsed = 0;
  let frameIndex = 0;

  function render() {
    if (
      !gpu ||
      !screen ||
      !fieldFx ||
      !cellsFx ||
      !haloFx ||
      !compositeFx ||
      blurFx.length < 4 ||
      !field ||
      !cells ||
      !haloA ||
      !haloB
    ) {
      return;
    }
    uploadContent();
    uploadMask();
    uploadAtlas();
    uploadRamp();

    const radius = Math.max(config.radius, 4) * dpr;
    const life = Math.max(config.trail, 0.05);
    const now = performance.now() / 1000;
    for (let i = 0; i < MAX_TRAIL; i++) {
      const slot = trailData[i];
      const point = trail[i];
      if (!point) {
        slot[0] = slot[1] = slot[2] = slot[3] = 0;
        continue;
      }
      const age = Math.min((now - point.born) / life, 1);
      const fade = 1 - age;
      const spread = 0.7 + 0.75 * age * clamp01(config.flow) + 0.3 * age;
      slot[0] = point.x * dpr;
      slot[1] = point.y * dpr;
      slot[2] = fade * fade;
      slot[3] = radius * point.scale * spread * (point.linked ? 1 : -1);
    }
    const clickLife = config.click === "burst" ? BURST_LIFE : WAVE_LIFE;
    for (let i = 0; i < MAX_CLICKS; i++) {
      const slot = clickData[i];
      const click = clicks[i];
      if (!click) {
        slot[0] = slot[1] = slot[2] = slot[3] = 0;
        continue;
      }
      const age = now - click.born;
      const fade = Math.max(0, 1 - age / clickLife);
      slot[0] = click.x * dpr;
      slot[1] = click.y * dpr;
      slot[2] = age;
      slot[3] = fade * fade * (3 - 2 * fade);
    }

    fieldFx.set({
      params: {
        trail: trailData,
        clicks: clickData,
        grid: [gridWidth, gridHeight],
        cell: [cellWidth, cellHeight],
        trailCount: trail.length,
        clickMode: config.click === "wave" ? 1 : config.click === "burst" ? 2 : 0,
        radius,
        ambient: clamp01(config.ambient),
        flow: clamp01(config.flow),
        time: elapsed,
        seed,
      },
    });

    const page = pageMode();
    if (page) {
      cellsFx.set({
        params: {
          grid: [gridWidth, gridHeight],
          cell: [cellWidth, cellHeight],
          resolution: [source!.width, source!.height],
          bg: backingRgb,
        },
      });
    }

    const glyphParams = {
      bg: backingRgb,
      count: glyphCount,
      grid: [gridWidth, gridHeight],
      cell: [cellWidth, cellHeight],
      resolution: [output.width, output.height],
      density: clamp01(config.density),
      opacity: clamp01(config.opacity),
      contrast: Math.max(config.contrast, 0),
      flicker: reducedMotion ? 0 : clamp01(config.flicker),
      depth: clamp01(config.depth),
      time: elapsed,
      seed,
      page: page ? 1 : 0,
      light: light ? 1 : 0,
      keepText: config.keepText ? 1 : 0,
    };

    const glow = clamp01(config.glow);
    if (glow > 0) {
      haloFx.set({
        glyphs: glyphParams,
        haloParams: { downscale: HALO_SCALE },
      });
      const spreads = [1.25, 2.75];
      for (let i = 0; i < 2; i++) {
        blurFx[i * 2].set({
          params: { dir: [spreads[i] / haloWidth, 0], size: [haloWidth, haloHeight] },
        });
        blurFx[i * 2 + 1].set({
          params: { dir: [0, spreads[i] / haloHeight], size: [haloWidth, haloHeight] },
        });
      }
    }

    compositeFx.set({
      glyphs: glyphParams,
      composite: {
        glow,
        grain: clamp01(config.grain) * 0.35,
        veil: clamp01(config.veil),
        frame: reducedMotion ? 0 : frameIndex % 1024,
        haloSize: [haloWidth, haloHeight],
      },
    });

    gpuFrame(gpu, (f) => {
      f.pass(field!, fieldFx!);
      if (page) f.pass(cells!, cellsFx!);
      if (glow > 0) {
        f.pass(haloA!, haloFx!);
        f.pass(haloB!, blurFx[0]);
        f.pass(haloA!, blurFx[1]);
        f.pass(haloB!, blurFx[2]);
        f.pass(haloA!, blurFx[3]);
      }
      f.pass(screen!, compositeFx!);
    });
  }

  function renderFallback() {
    if (!fallback2d || !htmlInCanvas || !contentDirty) return;
    contentDirty = false;
    fallback2d.clearRect(0, 0, output.width, output.height);
    fallback2d.drawImage(source!, 0, 0, output.width, output.height);
  }

  let raf = 0;
  let lastTime = performance.now();
  let running = false;
  let visible = true;

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reducedMotion = motionQuery.matches;

  function prune(now: number) {
    const life = Math.max(config.trail, 0.05);
    while (trail.length && now - trail[0].born > life) trail.shift();
    const clickLife = config.click === "burst" ? BURST_LIFE : WAVE_LIFE;
    while (clicks.length && now - clicks[0].born > clickLife) clicks.shift();
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
      running = false;
      return;
    }
    const delta = Math.min((now - lastTime) / 1000, 1 / 20);
    lastTime = now;
    if (!reducedMotion) {
      elapsed += delta;
      frameIndex += 1;
    }
    prune(now / 1000);
    const following = advanceTrail(delta, now / 1000);
    const ambient = clamp01(config.ambient) > 0 && !reducedMotion;
    const busy =
      trail.length > 0 || clicks.length > 0 || ambient || following;
    render();
    if (!busy && !contentDirty && !maskDirty) {
      running = false;
      return;
    }
    raf = requestAnimationFrame(frame);
  }

  function advanceTrail(delta: number, now: number): boolean {
    const flow = reducedMotion ? 0 : clamp01(config.flow);
    const damping = Math.exp(-delta * 2.6);
    for (const point of trail) {
      point.x += point.vx * delta;
      point.y += point.vy * delta;
      point.vx *= damping;
      point.vy *= damping;
    }
    if (!pointer.has) return false;
    const follow = reducedMotion ? 1 : 1 - Math.exp(-delta * 16);
    const fromX = pointer.x;
    const fromY = pointer.y;
    pointer.x += (pointer.tx - pointer.x) * follow;
    pointer.y += (pointer.ty - pointer.y) * follow;
    const spacing = Math.max(config.cellSize * 0.6, 4);
    const moved = Math.hypot(pointer.x - pointer.sx, pointer.y - pointer.sy);
    const following = Math.hypot(pointer.tx - pointer.x, pointer.ty - pointer.y) > 0.5;
    if (!pointer.fresh && moved < spacing) return following;
    const step = Math.max(delta, 1 / 240);
    const vx = (pointer.x - fromX) / step;
    const vy = (pointer.y - fromY) / step;
    const speed = Math.hypot(vx, vy);
    const angle = Math.random() * Math.PI * 2;
    const jitter = 45 * flow;
    trail.push({
      x: pointer.x,
      y: pointer.y,
      vx: vx * 0.12 * flow + Math.cos(angle) * jitter,
      vy: vy * 0.12 * flow + Math.sin(angle) * jitter,
      born: now,
      scale: 0.75 + 0.45 * Math.min(speed / 2000, 1),
      linked: !pointer.fresh && trail.length > 0,
    });
    if (trail.length > MAX_TRAIL) trail.shift();
    pointer.sx = pointer.x;
    pointer.sy = pointer.y;
    pointer.fresh = false;
    return following;
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
      screen = surface(device, output, {
        size: [output.width, output.height],
        autoResize: false,
        alphaMode: "premultiplied",
        label: "asciify",
      });
      const linear = sampler(device, {
        minFilter: "linear",
        magFilter: "linear",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
      });
      const createTarget = (width: number, height: number, label: string) =>
        target(device, {
          size: [width, height],
          format: "rgba8unorm",
          clearColor: [0, 0, 0, 0],
          label,
        });
      const fieldTarget = createTarget(gridWidth, gridHeight, "asciify.field");
      const cellsTarget = createTarget(gridWidth, gridHeight, "asciify.cells");
      const haloRead = createTarget(haloWidth, haloHeight, "asciify.halo-a");
      const haloWrite = createTarget(haloWidth, haloHeight, "asciify.halo-b");
      field = fieldTarget;
      cells = cellsTarget;
      haloA = haloRead;
      haloB = haloWrite;
      contentTexture = createTexture(1, 1, "asciify.content");
      maskTexture = createTexture(1, 1, "asciify.text-mask");
      atlasDirty = true;
      rampDirty = true;
      uploadAtlas();
      uploadRamp();
      fieldFx = gpuEffect(device, FIELD, { label: "asciify.field" });
      cellsFx = gpuEffect(device, CELLS, {
        label: "asciify.cells",
        set: { uContent: contentTexture, uSampler: linear },
      });
      const glyphBindings = {
        uField: fieldTarget,
        uCells: cellsTarget,
        uAtlas: atlasTexture!,
        uRamp: rampTexture!,
        uTextMask: maskTexture,
        uSampler: linear,
      };
      haloFx = gpuEffect(device, HALO, {
        label: "asciify.halo",
        set: glyphBindings,
      });
      const blurSources: [VgpuTarget, string][] = [
        [haloRead, "asciify.blur-h1"],
        [haloWrite, "asciify.blur-v1"],
        [haloRead, "asciify.blur-h2"],
        [haloWrite, "asciify.blur-v2"],
      ];
      blurFx = blurSources.map(([read, label]) =>
        gpuEffect(device, BLUR, {
          label,
          set: { uSource: read, uSampler: linear },
        }),
      );
      compositeFx = gpuEffect(device, COMPOSITE, {
        label: "asciify.composite",
        set: { ...glyphBindings, uHalo: haloRead },
      });
      syncCanvasSize();
      start();
    })
    .catch((error) => {
      if (destroyed) return;
      console.warn("Asciify: WebGPU unavailable, showing content without the effect.", error);
      if (!htmlInCanvas || screen) return;
      fallback2d = output.getContext("2d");
      contentDirty = true;
      start();
    });

  start();

  function onMotionChange() {
    reducedMotion = motionQuery.matches;
    start();
  }
  motionQuery.addEventListener("change", onMotionChange);

  let themeTimer = 0;
  function onThemeShift() {
    syncBacking();
    syncRamp();
    start();
    window.clearTimeout(themeTimer);
    themeTimer = window.setTimeout(() => {
      syncBacking();
      syncRamp();
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

  function onFontsLoaded() {
    atlasKey = "";
    syncCanvasSize();
    scheduleTextMask();
    start();
  }
  document.fonts?.addEventListener("loadingdone", onFontsLoaded);

  let outputRect = output.getBoundingClientRect();
  const refreshOutputRect = () => {
    outputRect = output.getBoundingClientRect();
  };

  const observer = createCanvasResizeObserver(() => {
    refreshOutputRect();
    syncCanvasSize();
    scheduleTextMask();
    start();
  });
  observer.observe(output);
  if (content) observer.observe(content);
  window.addEventListener("resize", refreshOutputRect, { passive: true });
  window.addEventListener("scroll", refreshOutputRect, {
    capture: true,
    passive: true,
  });

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

  function localPoint(event: PointerEvent) {
    const x = event.clientX - outputRect.left;
    const y = event.clientY - outputRect.top;
    const margin = Math.max(config.radius, 4);
    const inside =
      x > -margin &&
      y > -margin &&
      x < outputRect.width + margin &&
      y < outputRect.height + margin;
    return { x, y, inside };
  }

  function onPointerMove(event: PointerEvent) {
    const { x, y, inside } = localPoint(event);
    if (!inside) {
      pointer.has = false;
      return;
    }
    if (!pointer.has) {
      pointer.x = pointer.sx = x;
      pointer.y = pointer.sy = y;
      pointer.fresh = true;
    }
    pointer.tx = x;
    pointer.ty = y;
    pointer.has = true;
    start();
  }

  function onPointerDown(event: PointerEvent) {
    if (config.click === "none" || reducedMotion) return;
    const { x, y, inside } = localPoint(event);
    if (!inside) return;
    clicks.push({ x, y, born: performance.now() / 1000 });
    if (clicks.length > MAX_CLICKS) clicks.shift();
    start();
  }

  function onPointerLeave() {
    pointer.has = false;
  }

  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerdown", onPointerDown, { passive: true });
  document.documentElement.addEventListener("pointerleave", onPointerLeave, {
    passive: true,
  });
  window.addEventListener("scroll", scheduleTextMask, {
    capture: true,
    passive: true,
  });
  const maskObserver = new MutationObserver(scheduleTextMask);
  if (content) {
    maskObserver.observe(content, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }
  scheduleTextMask();

  return {
    setOptions(next) {
      next = resolveOptions(DEFAULTS, next);
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
      syncBacking();
      syncRamp();
      syncCanvasSize();
      scheduleTextMask();
      start();
    },
    resize() {
      refreshOutputRect();
      syncCanvasSize();
      syncBacking();
      syncRamp();
      scheduleTextMask();
      start();
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(themeTimer);
      window.clearTimeout(maskTimer);
      observer.disconnect();
      window.removeEventListener("resize", refreshOutputRect);
      window.removeEventListener("scroll", refreshOutputRect, true);
      intersection.disconnect();
      document.removeEventListener("visibilitychange", syncVisibility);
      themeObserver.disconnect();
      schemeQuery.removeEventListener("change", onThemeShift);
      motionQuery.removeEventListener("change", onMotionChange);
      document.fonts?.removeEventListener("loadingdone", onFontsLoaded);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      document.documentElement.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("scroll", scheduleTextMask, { capture: true });
      maskObserver.disconnect();
      for (const t of [field, cells, haloA, haloB]) destroyTarget(t);
      contentTexture?.destroy();
      atlasTexture?.destroy();
      rampTexture?.destroy();
      maskTexture?.destroy();
      screen?.dispose();
      if (htmlInCanvas) paintable!.onpaint = null;
    },
  };
}

function clamp01(value: number) {
  return Math.min(Math.max(value, 0), 1);
}
