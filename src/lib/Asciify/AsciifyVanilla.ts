import { getCanvasPixelRatio, createCanvasResizeObserver } from "../canvas-viewport";
import { isHtmlInCanvasBlocked, prepareHtmlInCanvas, drawHtmlInCanvas } from "../html-in-canvas";
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

const VERT = `#version 300 es
layout(location = 0) in vec2 aPos;
void main () {
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const COMMON = `
float hash12 (vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

float luma (vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}
`;

const FIELD = `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 uGrid;
uniform vec2 uCell;
uniform vec4 uTrail[${MAX_TRAIL}];
uniform int uTrailCount;
uniform vec4 uClicks[${MAX_CLICKS}];
uniform int uClickMode;
uniform float uRadius;
uniform float uAmbient;
uniform float uFlow;
uniform float uTime;
uniform float uSeed;
${COMMON}
float noise (vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float segment (vec2 p, vec2 a, vec2 b, out float h) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-4), 0.0, 1.0);
  return length(pa - ba * h);
}

void main () {
  vec2 cell = vec2(floor(gl_FragCoord.x), uGrid.y - 1.0 - floor(gl_FragCoord.y));
  vec2 p = (cell + 0.5) * uCell;
  vec2 q = p / uRadius;
  vec2 warp = vec2(
    noise(q * 1.3 + vec2(uTime * 0.4, 0.0) + uSeed * 5.0),
    noise(q * 1.3 + vec2(7.1, -uTime * 0.35) + uSeed * 9.0)
  ) - 0.5;
  warp += (vec2(
    noise(q * 3.1 - vec2(0.0, uTime * 0.7) + 3.7),
    noise(q * 3.1 + vec2(uTime * 0.6, 11.3))
  ) - 0.5) * 0.45;
  vec2 pw = p + warp * uRadius * 0.9 * uFlow;
  float t = 0.0;
  for (int i = 0; i < ${MAX_TRAIL}; i++) {
    if (i >= uTrailCount) break;
    vec4 a = uTrail[i];
    vec4 b = i + 1 < uTrailCount ? uTrail[i + 1] : a;
    if (b.w < 0.0) b = a;
    float h;
    float d = segment(pw, a.xy, b.xy, h);
    float r = max(mix(abs(a.w), abs(b.w), h), 1.0);
    float k = d / r;
    t = max(t, mix(a.z, b.z, h) * exp(-k * k * 2.2));
  }
  float scramble = t * (1.0 - t) * 2.4;
  for (int i = 0; i < ${MAX_CLICKS}; i++) {
    vec4 c = uClicks[i];
    if (c.w <= 0.0) continue;
    float d = length(p - c.xy);
    float grow = 1.0 - exp(-c.z * 2.2);
    float wobble = 0.7 + 0.3 * noise((p - c.xy) / uRadius * 1.6 + c.z * 0.8 + uSeed * 7.0);
    float v = 0.0;
    if (uClickMode == 1) {
      float ring = uRadius * (0.15 + 3.4 * grow);
      float width = uRadius * (0.4 + 0.5 * grow);
      float x = (d - ring) / width;
      float profile = x > 0.0 ? exp(-x * x * 1.8) : exp(-x * x * 0.8);
      v = profile * wobble * 0.6 * c.w * smoothstep(0.0, 0.12, c.z);
    } else if (uClickMode == 2) {
      float size = uRadius * (0.4 + 1.0 * (1.0 - exp(-c.z * 5.0)));
      float x = d / size;
      v = exp(-x * x * 2.2) * wobble * 0.75 * c.w * smoothstep(0.0, 0.08, c.z);
    }
    t = max(t, v);
    scramble = max(scramble, v * 0.5);
  }
  if (uAmbient > 0.0) {
    vec2 q = cell * 0.06 + uSeed * 13.0;
    float n = noise(q + vec2(uTime * 0.05, -uTime * 0.03));
    n = 0.65 * n + 0.35 * noise(q * 2.1 - vec2(uTime * 0.04, uTime * 0.06));
    t = max(t, smoothstep(0.42, 0.85, n) * uAmbient * 0.75);
  }
  outColor = vec4(clamp(t, 0.0, 1.0), clamp(scramble, 0.0, 1.0), 0.0, 1.0);
}`;

const CELLS = `#version 300 es
precision highp float;
out vec4 outColor;
uniform sampler2D uContent;
uniform vec2 uGrid;
uniform vec2 uCell;
uniform vec2 uResolution;
uniform vec3 uBg;
${COMMON}
void main () {
  vec2 cell = vec2(floor(gl_FragCoord.x), uGrid.y - 1.0 - floor(gl_FragCoord.y));
  vec2 origin = cell * uCell;
  vec3 sum = vec3(0.0);
  for (int y = 0; y < 4; y++) {
    for (int x = 0; x < 4; x++) {
      vec2 p = origin + (vec2(float(x), float(y)) + 0.5) * 0.25 * uCell;
      vec4 c = texture(uContent, min(p, uResolution - 0.5) / uResolution);
      sum += mix(uBg, c.rgb, c.a);
    }
  }
  vec3 average = sum / 16.0;
  float contrast = abs(luma(average) - luma(uBg)) * 1.6;
  float chroma = length(average - uBg) * 0.7;
  outColor = vec4(average, clamp(max(contrast, chroma), 0.0, 1.0));
}`;

const GLYPHS = `
uniform sampler2D uField;
uniform sampler2D uCells;
uniform sampler2D uAtlas;
uniform sampler2D uRamp;
uniform sampler2D uTextMask;
uniform vec2 uGrid;
uniform vec2 uCell;
uniform vec2 uResolution;
uniform float uCount;
uniform float uDensity;
uniform float uOpacity;
uniform float uContrast;
uniform float uFlicker;
uniform float uDepth;
uniform float uTime;
uniform float uSeed;
uniform float uPage;
uniform float uLight;
uniform float uKeepText;
uniform vec3 uBg;
${COMMON}
vec4 fieldAt (vec2 cell) {
  return texelFetch(uField, ivec2(int(cell.x), int(uGrid.y - 1.0 - cell.y)), 0);
}

vec4 cellsAt (vec2 cell) {
  return texelFetch(uCells, ivec2(int(cell.x), int(uGrid.y - 1.0 - cell.y)), 0);
}

vec2 fieldUv (vec2 px) {
  return vec2(px.x / (uGrid.x * uCell.x), 1.0 - px.y / (uGrid.y * uCell.y));
}

float textAt (vec2 px) {
  if (uPage < 0.5 || uKeepText < 0.5) return 0.0;
  return smoothstep(0.25, 0.75, texture(uTextMask, px / uResolution).r);
}

float atlasAt (float index, vec2 local, float soft) {
  vec2 inset = clamp(local, vec2(0.02), vec2(0.98));
  vec2 uv = vec2((index + inset.x) / uCount, (soft + inset.y) * 0.5);
  return textureLod(uAtlas, uv, 0.0).a;
}

vec4 glyphAt (vec2 px, bool halo) {
  vec2 coord = px / uCell;
  vec2 cell = floor(coord);
  if (cell.x < 0.0 || cell.y < 0.0 || cell.x >= uGrid.x || cell.y >= uGrid.y) return vec4(0.0);
  vec4 field = fieldAt(cell);
  float t = field.r;
  if (t < 0.003) return vec4(0.0);
  vec2 local = coord - cell;
  float pick = hash12(cell + uSeed * 7.31);
  float level = hash12(cell * 1.73 + 4.1 + uSeed);
  vec4 page = uPage > 0.5 ? cellsAt(cell) : vec4(0.0);
  float tone = uPage > 0.5 ? page.a : t;
  tone = clamp((tone - 0.5) * uContrast + 0.5, 0.0, 1.0);
  float tick = floor(uTime * 9.0 + level * 9.0);
  float wobble = (hash12(cell * 2.31 + tick * 17.7) - 0.5) * uFlicker * 0.4 + (level - 0.5) * 0.12;
  float shade = clamp(pow(tone, 0.8) + wobble, 0.0, 1.0);
  float index = floor(shade * (uCount - 1.0) + 0.5);
  float scramble = field.g * max(uFlicker, 0.35);
  if (scramble > 0.02) {
    float frame = floor(uTime * 20.0);
    if (hash12(cell * 3.7 + frame * 5.3) < scramble) {
      index = 1.0 + floor(hash12(cell + frame * 1.37) * (uCount - 1.0));
    }
  }
  float present = step(pick, uDensity * mix(1.0, 0.3 + t * 1.1, 0.55));
  if (uPage > 0.5) present *= smoothstep(0.02, 0.08, page.a);
  float focus = step(hash12(cell * 0.71 + 9.2 + uSeed), uDepth);
  float coverage = halo ? 0.35 * step(0.5, index) : atlasAt(index, local, focus);
  float alpha = uOpacity * present * coverage * smoothstep(0.0, 0.55, t)
    * mix(1.0, 0.35 + 0.65 * level, 0.55) * (1.0 - focus * 0.45);
  vec3 color;
  if (uPage > 0.5) {
    color = clamp(uBg + (page.rgb - uBg) / max(abs(luma(page.rgb) - luma(uBg)), 0.2), 0.0, 1.0);
  } else {
    color = texture(uRamp, vec2(clamp(t * 0.85 + level * 0.15, 0.0, 1.0), 0.5)).rgb;
  }
  return uLight > 0.5 ? vec4(color * alpha, alpha) : vec4(color * alpha, alpha * 0.75);
}
`;

const HALO = `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 uHaloResolution;
uniform float uDownscale;
${GLYPHS}
void main () {
  vec2 px = vec2(gl_FragCoord.x, uHaloResolution.y - gl_FragCoord.y) * uDownscale;
  outColor = glyphAt(px, true) * (1.0 - textAt(px));
}`;

const BLUR = `#version 300 es
precision highp float;
out vec4 outColor;
uniform sampler2D uSource;
uniform vec2 uStep;
uniform vec2 uSize;
void main () {
  vec2 uv = gl_FragCoord.xy / uSize;
  vec4 sum = texture(uSource, uv) * 0.2270270270;
  sum += texture(uSource, uv + uStep * 1.3846153846) * 0.3162162162;
  sum += texture(uSource, uv - uStep * 1.3846153846) * 0.3162162162;
  sum += texture(uSource, uv + uStep * 3.2307692308) * 0.0702702703;
  sum += texture(uSource, uv - uStep * 3.2307692308) * 0.0702702703;
  outColor = sum;
}`;

const COMPOSITE = `#version 300 es
precision highp float;
out vec4 outColor;
uniform sampler2D uHalo;
uniform vec2 uHaloResolution;
uniform float uGlow;
uniform float uGrain;
uniform float uVeil;
uniform float uFrame;
${GLYPHS}
void main () {
  vec2 px = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);
  vec2 fuv = fieldUv(px);
  float mask = smoothstep(0.0, 0.5, texture(uField, fuv).r);
  float text = textAt(px);
  vec4 back;
  if (uPage > 0.5) {
    vec3 soft = texture(uCells, fuv).rgb;
    back = vec4(mix(soft, uBg, uVeil), 1.0) * mask * (1.0 - text);
  } else {
    back = vec4(uBg, 1.0) * mask * uVeil;
  }
  vec4 glyph = glyphAt(px, false) * (1.0 - text);
  vec2 huv = px / (uHaloResolution * ${HALO_SCALE.toFixed(1)});
  vec4 halo = texture(uHalo, vec2(huv.x, 1.0 - huv.y)) * uGlow;
  vec4 color = back * (1.0 - glyph.a) + glyph;
  if (uLight > 0.5) {
    color += halo * 0.6 * (1.0 - color.a);
  } else {
    color += halo;
  }
  float body = clamp(color.a, 0.0, 1.0);
  float grain = (hash12(gl_FragCoord.xy + uFrame * vec2(17.0, 59.0))
    + hash12(gl_FragCoord.xy * 1.31 + uFrame * 7.0) - 1.0) * uGrain;
  vec3 rgb = clamp(color.rgb + grain * body * 0.5, 0.0, 1.0);
  outColor = vec4(rgb, max(body, max(rgb.r, max(rgb.g, rgb.b))));
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

export function createAsciify(
  elements: AsciifyElements,
  options: AsciifyOptions = {},
): AsciifyInstance | null {
  try {
    return initializeAsciify(elements, options);
  } catch (error) {
    console.error("Asciify initialization failed:", error);
    return null;
  }
}

type Program = {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation>;
};

type Target = {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  width: number;
  height: number;
};

function initializeAsciify(
  elements: AsciifyElements,
  options: AsciifyOptions,
): AsciifyInstance | null {
  const config = { ...DEFAULTS, ...resolveOptions(DEFAULTS, options) };
  const { output } = elements;
  const source = elements.source ?? null;
  const content = elements.content ?? null;

  const gl = output.getContext("webgl2", {
    alpha: true,
    depth: false,
    stencil: false,
    antialias: false,
    premultipliedAlpha: true,
  });
  if (!gl || gl.isContextLost()) return null;

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

  function compile(type: number, text: string): WebGLShader {
    const shader = gl!.createShader(type)!;
    gl!.shaderSource(shader, text);
    gl!.compileShader(shader);
    if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) {
      const message = gl!.getShaderInfoLog(shader) || "Unknown shader error";
      gl!.deleteShader(shader);
      throw new Error(message);
    }
    return shader;
  }

  const vertexShader = compile(gl.VERTEX_SHADER, VERT);
  const programs: Program[] = [];

  function link(fragment: string): Program {
    const fragmentShader = compile(gl!.FRAGMENT_SHADER, fragment);
    const program = gl!.createProgram()!;
    gl!.attachShader(program, vertexShader);
    gl!.attachShader(program, fragmentShader);
    gl!.linkProgram(program);
    gl!.deleteShader(fragmentShader);
    if (!gl!.getProgramParameter(program, gl!.LINK_STATUS)) {
      const message = gl!.getProgramInfoLog(program) || "Unknown program link error";
      gl!.deleteProgram(program);
      throw new Error(message);
    }
    const uniforms: Record<string, WebGLUniformLocation> = {};
    const count = gl!.getProgramParameter(program, gl!.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const info = gl!.getActiveUniform(program, i)!;
      uniforms[info.name] = gl!.getUniformLocation(program, info.name)!;
    }
    const entry = { program, uniforms };
    programs.push(entry);
    return entry;
  }

  const fieldProgram = link(FIELD);
  const cellsProgram = link(CELLS);
  const haloProgram = link(HALO);
  const blurProgram = link(BLUR);
  const compositeProgram = link(COMPOSITE);

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  function createTexture(filter: number): WebGLTexture {
    const texture = gl!.createTexture()!;
    gl!.bindTexture(gl!.TEXTURE_2D, texture);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, filter);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, filter);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
    gl!.texImage2D(
      gl!.TEXTURE_2D,
      0,
      gl!.RGBA,
      1,
      1,
      0,
      gl!.RGBA,
      gl!.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0]),
    );
    return texture;
  }

  function createTarget(): Target {
    const texture = createTexture(gl!.LINEAR);
    const framebuffer = gl!.createFramebuffer()!;
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, framebuffer);
    gl!.framebufferTexture2D(
      gl!.FRAMEBUFFER,
      gl!.COLOR_ATTACHMENT0,
      gl!.TEXTURE_2D,
      texture,
      0,
    );
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
    return { texture, framebuffer, width: 1, height: 1 };
  }

  function sizeTarget(target: Target, width: number, height: number) {
    if (target.width === width && target.height === height) return;
    target.width = width;
    target.height = height;
    gl!.bindTexture(gl!.TEXTURE_2D, target.texture);
    gl!.texImage2D(
      gl!.TEXTURE_2D,
      0,
      gl!.RGBA,
      width,
      height,
      0,
      gl!.RGBA,
      gl!.UNSIGNED_BYTE,
      null,
    );
  }

  const field = createTarget();
  const cells = createTarget();
  const haloA = createTarget();
  const haloB = createTarget();
  const contentTexture = createTexture(gl.LINEAR);
  const atlasTexture = createTexture(gl.LINEAR);
  const rampTexture = createTexture(gl.LINEAR);
  const maskTexture = createTexture(gl.LINEAR);

  let dpr = 1;
  let cellWidth = 7;
  let cellHeight = 12;
  let glyphCount = 1;
  let gridWidth = 1;
  let gridHeight = 1;
  let atlasKey = "";
  let rampKey = "";
  const seed = Math.random();

  function syncAtlas() {
    const height = Math.max(4, Math.round(Math.max(config.cellSize, 4) * dpr));
    const key = `${config.characters}|${config.fontFamily}|${height}`;
    if (key === atlasKey) return;
    atlasKey = key;
    const atlas = buildAsciifyAtlas(config.characters, config.fontFamily, height);
    cellWidth = atlas.cellWidth;
    cellHeight = atlas.cellHeight;
    glyphCount = atlas.count;
    gl!.bindTexture(gl!.TEXTURE_2D, atlasTexture);
    gl!.texImage2D(
      gl!.TEXTURE_2D,
      0,
      gl!.RGBA,
      gl!.RGBA,
      gl!.UNSIGNED_BYTE,
      atlas.canvas,
    );
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
    gl!.bindTexture(gl!.TEXTURE_2D, rampTexture);
    gl!.texImage2D(
      gl!.TEXTURE_2D,
      0,
      gl!.RGBA,
      256,
      1,
      0,
      gl!.RGBA,
      gl!.UNSIGNED_BYTE,
      buildAsciifyRamp(colors),
    );
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

  function syncCanvasSize(): boolean {
    let changed = false;
    dpr = getCanvasPixelRatio(output, gl!);
    const width = Math.max(1, Math.round(output.clientWidth * dpr));
    const height = Math.max(1, Math.round(output.clientHeight * dpr));
    if (output.width !== width || output.height !== height) {
      output.width = width;
      output.height = height;
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
    const haloWidth = Math.max(1, Math.ceil(output.width / HALO_SCALE));
    const haloHeight = Math.max(1, Math.ceil(output.height / HALO_SCALE));
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
  const trailData = new Float32Array(MAX_TRAIL * 4);
  const clickData = new Float32Array(MAX_CLICKS * 4);
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
    if (!htmlInCanvas || !contentDirty) return;
    contentDirty = false;
    try {
      gl!.bindTexture(gl!.TEXTURE_2D, contentTexture);
      gl!.texImage2D(
        gl!.TEXTURE_2D,
        0,
        gl!.RGBA,
        gl!.RGBA,
        gl!.UNSIGNED_BYTE,
        source!,
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
    if (!maskDirty) return;
    maskDirty = false;
    gl!.bindTexture(gl!.TEXTURE_2D, maskTexture);
    gl!.texImage2D(
      gl!.TEXTURE_2D,
      0,
      gl!.RGBA,
      gl!.RGBA,
      gl!.UNSIGNED_BYTE,
      maskCanvas,
    );
  }

  let elapsed = 0;
  let frameIndex = 0;

  function bindTexture(unit: number, texture: WebGLTexture, location?: WebGLUniformLocation) {
    gl!.activeTexture(gl!.TEXTURE0 + unit);
    gl!.bindTexture(gl!.TEXTURE_2D, texture);
    if (location) gl!.uniform1i(location, unit);
  }

  function drawTo(target: Target | null) {
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, target ? target.framebuffer : null);
    gl!.viewport(
      0,
      0,
      target ? target.width : output.width,
      target ? target.height : output.height,
    );
    gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
  }

  function setGlyphUniforms(u: Record<string, WebGLUniformLocation>) {
    bindTexture(0, field.texture, u.uField);
    bindTexture(1, cells.texture, u.uCells);
    bindTexture(2, atlasTexture, u.uAtlas);
    bindTexture(3, rampTexture, u.uRamp);
    bindTexture(4, maskTexture, u.uTextMask);
    gl!.uniform2f(u.uGrid, gridWidth, gridHeight);
    gl!.uniform2f(u.uCell, cellWidth, cellHeight);
    gl!.uniform2f(u.uResolution, output.width, output.height);
    gl!.uniform1f(u.uCount, glyphCount);
    gl!.uniform1f(u.uDensity, clamp01(config.density));
    gl!.uniform1f(u.uOpacity, clamp01(config.opacity));
    gl!.uniform1f(u.uContrast, Math.max(config.contrast, 0));
    gl!.uniform1f(u.uFlicker, reducedMotion ? 0 : clamp01(config.flicker));
    gl!.uniform1f(u.uDepth, clamp01(config.depth));
    gl!.uniform1f(u.uTime, elapsed);
    gl!.uniform1f(u.uSeed, seed);
    gl!.uniform1f(u.uPage, pageMode() ? 1 : 0);
    gl!.uniform1f(u.uLight, light ? 1 : 0);
    gl!.uniform1f(u.uKeepText, config.keepText ? 1 : 0);
    gl!.uniform3f(u.uBg, backingRgb[0], backingRgb[1], backingRgb[2]);
  }

  function render() {
    uploadContent();
    uploadMask();
    gl!.disable(gl!.BLEND);

    const radius = Math.max(config.radius, 4) * dpr;
    const life = Math.max(config.trail, 0.05);
    const now = performance.now() / 1000;
    trailData.fill(0);
    for (let i = 0; i < trail.length; i++) {
      const point = trail[i];
      const age = Math.min((now - point.born) / life, 1);
      const fade = 1 - age;
      const spread = 0.7 + 0.75 * age * clamp01(config.flow) + 0.3 * age;
      trailData[i * 4] = point.x * dpr;
      trailData[i * 4 + 1] = point.y * dpr;
      trailData[i * 4 + 2] = fade * fade;
      trailData[i * 4 + 3] =
        radius * point.scale * spread * (point.linked ? 1 : -1);
    }
    clickData.fill(0);
    const clickLife = config.click === "burst" ? BURST_LIFE : WAVE_LIFE;
    for (let i = 0; i < clicks.length; i++) {
      const click = clicks[i];
      const age = now - click.born;
      const fade = Math.max(0, 1 - age / clickLife);
      clickData[i * 4] = click.x * dpr;
      clickData[i * 4 + 1] = click.y * dpr;
      clickData[i * 4 + 2] = age;
      clickData[i * 4 + 3] = fade * fade * (3 - 2 * fade);
    }

    let u = fieldProgram.uniforms;
    gl!.useProgram(fieldProgram.program);
    gl!.uniform2f(u.uGrid, gridWidth, gridHeight);
    gl!.uniform2f(u.uCell, cellWidth, cellHeight);
    gl!.uniform4fv(u["uTrail[0]"], trailData);
    gl!.uniform1i(u.uTrailCount, trail.length);
    gl!.uniform4fv(u["uClicks[0]"], clickData);
    gl!.uniform1i(
      u.uClickMode,
      config.click === "wave" ? 1 : config.click === "burst" ? 2 : 0,
    );
    gl!.uniform1f(u.uRadius, radius);
    gl!.uniform1f(u.uAmbient, clamp01(config.ambient));
    gl!.uniform1f(u.uFlow, clamp01(config.flow));
    gl!.uniform1f(u.uTime, elapsed);
    gl!.uniform1f(u.uSeed, seed);
    drawTo(field);

    if (pageMode()) {
      u = cellsProgram.uniforms;
      gl!.useProgram(cellsProgram.program);
      bindTexture(0, contentTexture, u.uContent);
      gl!.uniform2f(u.uGrid, gridWidth, gridHeight);
      gl!.uniform2f(u.uCell, cellWidth, cellHeight);
      gl!.uniform2f(u.uResolution, source!.width, source!.height);
      gl!.uniform3f(u.uBg, backingRgb[0], backingRgb[1], backingRgb[2]);
      drawTo(cells);
    }

    const glow = clamp01(config.glow);
    if (glow > 0) {
      u = haloProgram.uniforms;
      gl!.useProgram(haloProgram.program);
      setGlyphUniforms(u);
      gl!.uniform2f(u.uHaloResolution, haloA.width, haloA.height);
      gl!.uniform1f(u.uDownscale, HALO_SCALE);
      drawTo(haloA);
      u = blurProgram.uniforms;
      gl!.useProgram(blurProgram.program);
      gl!.uniform2f(u.uSize, haloA.width, haloA.height);
      for (const spread of [1.25, 2.75]) {
        bindTexture(0, haloA.texture, u.uSource);
        gl!.uniform2f(u.uStep, spread / haloA.width, 0);
        drawTo(haloB);
        bindTexture(0, haloB.texture, u.uSource);
        gl!.uniform2f(u.uStep, 0, spread / haloA.height);
        drawTo(haloA);
      }
    }

    u = compositeProgram.uniforms;
    gl!.useProgram(compositeProgram.program);
    setGlyphUniforms(u);
    bindTexture(5, haloA.texture, u.uHalo);
    gl!.uniform2f(u.uHaloResolution, haloA.width, haloA.height);
    gl!.uniform1f(u.uGlow, glow);
    gl!.uniform1f(u.uGrain, clamp01(config.grain) * 0.35);
    gl!.uniform1f(u.uVeil, clamp01(config.veil));
    gl!.uniform1f(u.uFrame, reducedMotion ? 0 : frameIndex % 1024);
    drawTo(null);
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
      for (const target of [field, cells, haloA, haloB]) {
        gl!.deleteTexture(target.texture);
        gl!.deleteFramebuffer(target.framebuffer);
      }
      gl!.deleteTexture(contentTexture);
      gl!.deleteTexture(atlasTexture);
      gl!.deleteTexture(rampTexture);
      gl!.deleteTexture(maskTexture);
      for (const entry of programs) gl!.deleteProgram(entry.program);
      gl!.deleteShader(vertexShader);
      gl!.deleteBuffer(quad);
      if (htmlInCanvas) paintable!.onpaint = null;
    },
  };
}

function clamp01(value: number) {
  return Math.min(Math.max(value, 0), 1);
}
