import { getCanvasPixelRatio, createCanvasResizeObserver } from "../canvas-viewport";
import { isHtmlInCanvasBlocked, prepareHtmlInCanvas, drawHtmlInCanvas } from "../html-in-canvas";
import { resolveOptions } from "../options";

export type BlazeLayer = "page" | "background" | "foreground";

export interface BlazeOptions {
  /** "page" draws the live content into the effect so the heat haze can bend it (html-in-canvas; elsewhere it falls back to "foreground"). "background" sits behind the content, "foreground" over it. */
  layer?: BlazeLayer;
  /** How far up the heat reaches, as a fraction of the element (0 to 1). */
  height?: number;
  /** Overall brightness (0 to 1). */
  intensity?: number;
  /** Colors from cool to hot, as CSS colors. Leave empty for natural fire. */
  colors?: string[];
  /** Warm light rising from a fire just below the frame (0 to 1). */
  glow?: number;
  /** Smoke lit from below, billowing up through the glow (0 to 1). */
  smoke?: number;
  /** How many embers drift up (0 to 1). */
  sparks?: number;
  /** Size of the embers. */
  sparkSize?: number;
  /** Out-of-focus embers drifting near and far from the camera (0 to 1). */
  depth?: number;
  /** How much the hot air swirls (0 to 1). */
  turbulence?: number;
  /** Heat haze bending the page, with layer "page" (0 to 1). */
  haze?: number;
  /** Size of the smoke billows and haze ripples. */
  scale?: number;
  /** Animation speed multiplier. */
  speed?: number;
  /** Moving the cursor through the heat swirls the embers and kicks up new ones (0 to 1). */
  stir?: number;
}

export interface BlazeElements {
  output: HTMLCanvasElement;
  source?: HTMLCanvasElement | null;
  content?: HTMLElement | null;
}

export interface BlazeInstance {
  setOptions: (options: BlazeOptions) => void;
  resize: () => void;
  destroy: () => void;
}

const DEFAULTS: Required<BlazeOptions> = {
  layer: "page",
  height: 0.8,
  intensity: 0.8,
  colors: [],
  glow: 0.6,
  smoke: 0.5,
  sparks: 0.6,
  sparkSize: 1,
  depth: 0.5,
  turbulence: 0.5,
  haze: 0.5,
  scale: 1,
  speed: 1,
  stir: 0.5,
};

const FIRE_RAMP = ["#1a0400", "#7a1404", "#d9480f", "#ff8a2a", "#ffd27a", "#fff6e0"];
const MAX_PARTICLES = 1400;
const STRIDE = 8;
const GLOW_SCALE = 0.4;
const FIELD_CELL = 8;
const STIR_RADIUS = 95;
const WARMUP_SECONDS = 5;

type PaintableCanvas = HTMLCanvasElement & {
  onpaint?: (() => void) | null;
  requestPaint?: () => void;
};

type ElementImageContext = CanvasRenderingContext2D & {
  drawElementImage?: (element: Element, x: number, y: number) => void;
};

const QUAD_VERT = `#version 300 es
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

vec2 hash22 (vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.xx + q.yz) * q.zy);
}

float gnoise (vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(hash22(i) * 2.0 - 1.0, f);
  float b = dot(hash22(i + vec2(1.0, 0.0)) * 2.0 - 1.0, f - vec2(1.0, 0.0));
  float c = dot(hash22(i + vec2(0.0, 1.0)) * 2.0 - 1.0, f - vec2(0.0, 1.0));
  float d = dot(hash22(i + vec2(1.0, 1.0)) * 2.0 - 1.0, f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm (vec2 p) {
  float total = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 5; i++) {
    total += gnoise(p) * amplitude;
    p = mat2(1.6, 1.2, -1.2, 1.6) * p + vec2(17.3, 9.1);
    amplitude *= 0.5;
  }
  return 0.5 + total;
}

float fbm3 (vec2 p) {
  float total = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 3; i++) {
    total += gnoise(p) * amplitude;
    p = mat2(1.6, 1.2, -1.2, 1.6) * p + vec2(17.3, 9.1);
    amplitude *= 0.5;
  }
  return 0.5 + total * 1.15;
}

float hotspot (float x, float t, float scale, float seed) {
  float u = x / (320.0 * scale);
  float v = 0.5
    + 0.25 * sin(u * 1.7 + t * 0.21 + seed * 6.283)
    + 0.15 * sin(u * 3.1 - t * 0.17 + seed * 12.1)
    + 0.10 * sin(u * 5.3 + t * 0.33 + seed * 3.7);
  return smoothstep(0.2, 0.8, v);
}
`;

const GLOW_FRAG = `#version 300 es
precision highp float;
out vec4 outColor;
uniform sampler2D uRamp;
uniform vec2 uSize;
uniform vec2 uView;
uniform float uZone;
uniform float uTime;
uniform float uRise;
uniform float uScale;
uniform float uGlow;
uniform float uSmoke;
uniform float uTurbulence;
uniform float uSeed;
uniform float uGain;
uniform sampler2D uField;
uniform float uFieldOn;
${COMMON}
vec3 hue (float t) {
  vec3 c = texture(uRamp, vec2(clamp(t, 0.0, 1.0), 0.5)).rgb;
  return c / max(max(c.r, max(c.g, c.b)), 0.02);
}

void main () {
  vec2 css = gl_FragCoord.xy / uSize * uView;
  float y = max(css.y, 0.0);
  float h = y / uZone;
  if (h > 1.2) {
    outColor = vec4(0.0);
    return;
  }

  vec2 pos = css;
  if (uFieldOn > 0.5) pos += texture(uField, gl_FragCoord.xy / uSize).ba;

  vec2 seed = vec2(uSeed * 31.0, uSeed * 17.0);
  float hot = hotspot(pos.x, uTime, uScale, uSeed);
  float flicker = 0.9 + 0.1 * gnoise(vec2(pos.x / (150.0 * uScale), uTime * 2.2) + seed);
  float base = exp(-y / (uZone * 0.26)) * mix(0.3, 1.0, hot) * flicker;
  float spill = exp(-y / (uZone * 0.7)) * mix(0.55, 1.0, hot) * 0.1;

  float smoke = 0.0;
  if (uSmoke > 0.001) {
    float cell = 340.0 * uScale;
    vec2 p = pos / cell * vec2(1.0, 0.7);
    float climb = uTime * uRise / cell * 0.4;
    float warp = 0.5 + 0.9 * uTurbulence;
    vec2 q = vec2(
      fbm3(p + vec2(0.0, -climb * 0.8) + seed + uTime * 0.015),
      fbm3(p + vec2(5.2, 1.3 - climb * 0.7)));
    float f = fbm3(p + (q - 0.5) * 2.0 * warp + vec2(0.0, -climb));
    float billow = smoothstep(0.42, 0.95, f);
    float lit = exp(-y / (uZone * 0.62));
    smoke = billow * lit * mix(0.55, 1.0, hot) * uSmoke * 1.25;
  }

  float heat = (base * 0.8 + spill) * uGlow + smoke;
  heat *= 1.0 - smoothstep(0.8, 1.2, h);
  vec3 tone = hue(0.27 + 0.36 * clamp(heat * 1.1, 0.0, 1.0));
  outColor = vec4(tone * heat * 0.75 * uGain, 1.0);
}`;

// Cursor flow: rg holds the stirred air's velocity, ba how far it has carried
// the smoke (both in CSS px). Each frame the field is carried along by itself
// and the rising heat, the cursor adds a vortex pair (the divergence-free flow
// a finger leaves in liquid), and both relax back to rest.
const STIR_FRAG = `#version 300 es
precision highp float;
out vec4 outColor;
uniform sampler2D uField;
uniform vec2 uGrid;
uniform vec2 uView;
uniform float uDt;
uniform float uDrift;
uniform vec4 uSegment;
uniform vec4 uSplat;
void main () {
  vec2 uv = gl_FragCoord.xy / uGrid;
  vec2 css = uv * uView;
  vec2 here = texture(uField, uv).rg;
  vec2 back = (css - (here + vec2(0.0, uDrift)) * uDt) / uView;
  vec4 prev = texture(uField, back);
  vec2 velocity = prev.rg * exp(-uDt * 1.1);
  vec2 offset = (prev.ba - here * uDt) * exp(-uDt * 0.65);
  if (uSplat.w > 0.0) {
    vec2 a = uSegment.xy;
    vec2 ab = uSegment.zw - a;
    float t = clamp(dot(css - a, ab) / max(dot(ab, ab), 0.0001), 0.0, 1.0);
    vec2 r = css - (a + ab * t);
    float r2 = uSplat.z * uSplat.z;
    float g = exp(-dot(r, r) / r2);
    vec2 push = uSplat.xy;
    float swirl = push.x * r.y - push.y * r.x;
    velocity += (push * g + swirl * g * vec2(-2.0 * r.y, 2.0 * r.x) / r2) * uSplat.w;
  }
  velocity = clamp(velocity, vec2(-2400.0), vec2(2400.0));
  offset = clamp(offset, vec2(-180.0), vec2(180.0));
  outColor = vec4(velocity, offset);
}`;

const SPARK_VERT = `#version 300 es
layout(location = 0) in vec2 aCorner;
layout(location = 1) in vec4 aMotion;
layout(location = 2) in vec4 aLook;
uniform vec2 uView;
uniform float uShutter;
out vec2 vLocal;
out float vHalf;
out float vRadius;
out float vBlur;
out float vHeat;
out float vAlpha;
out float vReach;
void main () {
  vec2 velocity = aMotion.zw;
  float speed = length(velocity);
  vec2 dir = speed > 0.001 ? velocity / speed : vec2(0.0, 1.0);
  vec2 across = vec2(-dir.y, dir.x);
  float radius = aLook.x;
  float blur = aLook.y;
  float halfLength = min(0.5 * speed * uShutter, 28.0) * (1.0 - 0.8 * blur);
  float reach = radius * mix(5.0, 1.2, blur);
  vec2 local = aCorner * vec2(halfLength + reach, reach);
  vec2 center = aMotion.xy - dir * halfLength;
  vec2 position = center + dir * local.x + across * local.y;
  vLocal = local;
  vHalf = halfLength;
  vRadius = radius;
  vBlur = blur;
  vHeat = aLook.z;
  vAlpha = aLook.w;
  vReach = reach;
  gl_Position = vec4(position / uView * 2.0 - 1.0, 0.0, 1.0);
}`;

const SPARK_FRAG = `#version 300 es
precision highp float;
in vec2 vLocal;
in float vHalf;
in float vRadius;
in float vBlur;
in float vHeat;
in float vAlpha;
in float vReach;
out vec4 outColor;
uniform sampler2D uRamp;
uniform float uGain;
void main () {
  float along = max(abs(vLocal.x) - vHalf, 0.0);
  float d = length(vec2(along, vLocal.y));
  float r = vRadius;
  float core = exp(-d * d / (r * r * 0.6));
  float halo = exp(-d * d / (r * r * 10.0)) * 0.2 * (1.0 - vBlur);
  float disc = (1.0 - smoothstep(r * 0.72, r, d)) * (0.55 + 0.45 * smoothstep(0.0, r, d));
  float shape = mix(core + halo, disc * 0.42, vBlur) * (1.0 - smoothstep(vReach * 0.7, vReach, d));
  float head = vHalf > 0.01 ? clamp((vLocal.x + vHalf) / (2.0 * vHalf), 0.0, 1.0) : 1.0;
  float trail = mix(0.3, 1.0, head * head);
  float spread = clamp(2.2 * r / (2.2 * r + 2.0 * vHalf), 0.4, 1.0);
  vec3 tint = texture(uRamp, vec2(0.42 + 0.4 * vHeat, 0.5)).rgb;
  tint /= max(max(tint.r, max(tint.g, tint.b)), 0.02);
  outColor = vec4(tint * shape * trail * spread * vAlpha * 5.0 * uGain, 0.0);
}`;

const COMPOSITE_FRAG = `#version 300 es
precision highp float;
out vec4 outColor;
uniform sampler2D uGlowTex;
uniform sampler2D uSparkTex;
uniform sampler2D uContent;
uniform int uMode;
uniform vec2 uResolution;
uniform float uDpr;
uniform float uZone;
uniform float uMaxX;
uniform float uIntensity;
uniform float uLight;
uniform float uHaze;
uniform float uTime;
uniform float uRise;
uniform float uScale;
uniform float uFrame;
uniform float uGlowGain;
uniform float uSparkGain;
${COMMON}
void main () {
  vec2 px = gl_FragCoord.xy;
  vec2 uv = px / uResolution;
  vec2 css = px / uDpr;

  vec3 glow = texture(uGlowTex, uv).rgb * uGlowGain * (uLight > 0.5 ? 0.75 : 1.0);
  vec3 sparks = texture(uSparkTex, uv).rgb * uSparkGain;
  vec3 lit = 1.0 - exp(-glow * uIntensity * 1.15);
  vec3 embers = 1.0 - exp(-sparks * uIntensity * 1.15);
  if (uLight > 0.5) {
    float peak = max(embers.r, max(embers.g, embers.b));
    if (peak > 0.001) embers = pow(embers / peak, vec3(1.8)) * peak;
  }
  vec3 fire = 1.0 - (1.0 - lit) * (1.0 - embers);
  float dither = (hash12(px + uFrame * vec2(17.0, 59.0)) + hash12(px.yx + uFrame * vec2(41.0, 7.0)) - 1.0) / 255.0;
  fire = clamp(fire + dither, 0.0, 1.0);
  float alpha = max(fire.r, max(fire.g, fire.b));

  if (uMode == 1) {
    float y = max(css.y, 0.0);
    float amount = uHaze * exp(-y / (uZone * 0.45)) * (1.0 - smoothstep(0.85, 1.15, y / uZone));
    vec2 offset = vec2(0.0);
    if (amount > 0.002) {
      float cell = 64.0 * uScale;
      vec2 p = css / cell * vec2(1.0, 0.45) - vec2(0.0, uTime * uRise / cell * 0.4);
      vec2 p2 = p * 2.3 + vec2(3.1, -uTime * 0.6);
      offset.x = gnoise(p) + 0.45 * gnoise(p2);
      offset.y = gnoise(p + vec2(7.3, 1.9)) + 0.45 * gnoise(p2 + vec2(2.7, 5.1));
      offset *= vec2(1.0, 0.55) * amount * 9.0;
    }
    vec2 at = uv + offset * uDpr / uResolution;
    at.x = clamp(at.x, 0.0, uMaxX - 0.001);
    at.y = clamp(at.y, 0.0, 1.0);
    vec4 page = texture(uContent, vec2(at.x, 1.0 - at.y));
    float luma = dot(page.rgb, vec3(0.299, 0.587, 0.114));
    vec3 color = page.rgb * (1.0 - alpha * luma) + fire;
    outColor = vec4(color, clamp(page.a + alpha * (1.0 - page.a), 0.0, 1.0));
    return;
  }

  outColor = vec4(fire, alpha);
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

export function buildBlazeRamp(colors: string[], size = 256): Uint8Array {
  const stops = (colors.length ? colors : FIRE_RAMP).map((color) => {
    const parsed = readColor(color);
    return toOklab(parsed ? [parsed[0], parsed[1], parsed[2]] : [1, 1, 1]);
  });
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

/** Mirror of the shader's `hotspot`: where the fire below the frame burns hottest. */
export function blazeHotspot(x: number, t: number, scale: number, seed: number) {
  const u = x / (320 * scale);
  const v =
    0.5 +
    0.25 * Math.sin(u * 1.7 + t * 0.21 + seed * 6.283) +
    0.15 * Math.sin(u * 3.1 - t * 0.17 + seed * 12.1) +
    0.1 * Math.sin(u * 5.3 + t * 0.33 + seed * 3.7);
  return smoothstep(0.2, 0.8, v);
}

function createNoise(seed: number) {
  const perm = new Uint8Array(512);
  const table = new Uint8Array(256);
  for (let i = 0; i < 256; i++) table[i] = i;
  let state = Math.floor(seed * 2147483646) + 1;
  for (let i = 255; i > 0; i--) {
    state = (state * 16807) % 2147483647;
    const j = state % (i + 1);
    const swap = table[i];
    table[i] = table[j];
    table[j] = swap;
  }
  for (let i = 0; i < 512; i++) perm[i] = table[i & 255];
  const gx = [1, -1, 1, -1, 1.41, -1.41, 0, 0];
  const gy = [1, 1, -1, -1, 0, 0, 1.41, -1.41];
  return (x: number, y: number) => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const X = xi & 255;
    const Y = yi & 255;
    const u = xf * xf * xf * (xf * (xf * 6 - 15) + 10);
    const v = yf * yf * yf * (yf * (yf * 6 - 15) + 10);
    const aa = perm[perm[X] + Y] & 7;
    const ba = perm[perm[X + 1] + Y] & 7;
    const ab = perm[perm[X] + Y + 1] & 7;
    const bb = perm[perm[X + 1] + Y + 1] & 7;
    const n00 = gx[aa] * xf + gy[aa] * yf;
    const n10 = gx[ba] * (xf - 1) + gy[ba] * yf;
    const n01 = gx[ab] * xf + gy[ab] * (yf - 1);
    const n11 = gx[bb] * (xf - 1) + gy[bb] * (yf - 1);
    const top = n00 + (n10 - n00) * u;
    const bottom = n01 + (n11 - n01) * u;
    return top + (bottom - top) * v;
  };
}

export function createBlaze(
  elements: BlazeElements,
  options: BlazeOptions = {},
): BlazeInstance | null {
  try {
    return initializeBlaze(elements, options);
  } catch (error) {
    console.error("Blaze initialization failed:", error);
    return null;
  }
}

type Target = {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
  width: number;
  height: number;
};

function initializeBlaze(
  elements: BlazeElements,
  options: BlazeOptions,
): BlazeInstance | null {
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

  let destroyed = false;
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

  const floatTargets = Boolean(
    gl.getExtension("EXT_color_buffer_float") ||
    gl.getExtension("EXT_color_buffer_half_float"),
  );
  const glowGain = floatTargets ? 1 : 0.5;
  const sparkGain = floatTargets ? 1 : 0.25;

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

  const shaders: WebGLShader[] = [];
  const programs: WebGLProgram[] = [];

  function link(vertex: string, fragment: string) {
    const vertexShader = compile(gl!.VERTEX_SHADER, vertex);
    const fragmentShader = compile(gl!.FRAGMENT_SHADER, fragment);
    shaders.push(vertexShader, fragmentShader);
    const program = gl!.createProgram()!;
    gl!.attachShader(program, vertexShader);
    gl!.attachShader(program, fragmentShader);
    gl!.linkProgram(program);
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
    programs.push(program);
    return { program, uniforms };
  }

  const glowPass = link(QUAD_VERT, GLOW_FRAG);
  const stirPass = link(QUAD_VERT, STIR_FRAG);
  const sparkPass = link(SPARK_VERT, SPARK_FRAG);
  const compositePass = link(QUAD_VERT, COMPOSITE_FRAG);

  const corners = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);

  const quadVao = gl.createVertexArray()!;
  gl.bindVertexArray(quadVao);
  const quadBuffer = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, corners, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const sparkVao = gl.createVertexArray()!;
  gl.bindVertexArray(sparkVao);
  gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const instanceBuffer = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, MAX_PARTICLES * STRIDE * 4, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 4, gl.FLOAT, false, STRIDE * 4, 0);
  gl.vertexAttribDivisor(1, 1);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 4, gl.FLOAT, false, STRIDE * 4, 16);
  gl.vertexAttribDivisor(2, 1);
  gl.bindVertexArray(null);

  function createTexture(): WebGLTexture {
    const texture = gl!.createTexture()!;
    gl!.bindTexture(gl!.TEXTURE_2D, texture);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
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
    return {
      texture: createTexture(),
      framebuffer: gl!.createFramebuffer()!,
      width: 0,
      height: 0,
    };
  }

  function sizeTarget(target: Target, width: number, height: number) {
    if (target.width === width && target.height === height) return;
    target.width = width;
    target.height = height;
    gl!.bindTexture(gl!.TEXTURE_2D, target.texture);
    if (floatTargets) {
      gl!.texImage2D(
        gl!.TEXTURE_2D,
        0,
        gl!.RGBA16F,
        width,
        height,
        0,
        gl!.RGBA,
        gl!.HALF_FLOAT,
        null,
      );
    } else {
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
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, target.framebuffer);
    gl!.framebufferTexture2D(
      gl!.FRAMEBUFFER,
      gl!.COLOR_ATTACHMENT0,
      gl!.TEXTURE_2D,
      target.texture,
      0,
    );
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
  }

  const glowTarget = createTarget();
  const fieldTargets = [createTarget(), createTarget()];
  let fieldIndex = 0;
  const sparkTarget = createTarget();
  const contentTexture = createTexture();
  const rampTexture = createTexture();

  let rampKey: string | null = null;
  function syncRamp() {
    const key = config.colors.join(",");
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
      buildBlazeRamp(config.colors),
    );
  }

  let light = false;
  function syncBacking() {
    let el: Element | null = content ?? output.parentElement ?? output;
    let rgb: Rgb = [0, 0, 0];
    while (el) {
      const color = readColor(getComputedStyle(el).backgroundColor);
      if (color && color[3] > 0.5) {
        rgb = [color[0], color[1], color[2]];
        break;
      }
      el = el.parentElement;
    }
    light = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2] > 0.5;
  }

  let dpr = 1;
  let contentMaxX = 1;

  function cssWidth() {
    return Math.max(output.clientWidth, 1);
  }

  function zoneCss() {
    return Math.max(output.clientHeight * clamp(config.height, 0.05, 1), 60);
  }

  function riseSpeed() {
    return 110;
  }

  function syncCanvasSize() {
    dpr = getCanvasPixelRatio(output, gl!);
    const width = Math.max(1, Math.round(output.clientWidth * dpr));
    const height = Math.max(1, Math.round(output.clientHeight * dpr));
    if (output.width !== width || output.height !== height) {
      output.width = width;
      output.height = height;
    }
    if (htmlInCanvas) {
      const sourceWidth = Math.max(1, Math.round(source!.clientWidth * dpr));
      const sourceHeight = Math.max(1, Math.round(source!.clientHeight * dpr));
      if (source!.width !== sourceWidth || source!.height !== sourceHeight) {
        source!.width = sourceWidth;
        source!.height = sourceHeight;
      }
      paintable!.requestPaint!();
      contentMaxX = Math.min(
        1,
        Math.max(0.05, content!.clientWidth / Math.max(output.clientWidth, 1)),
      );
    }
    sizeTarget(
      glowTarget,
      Math.min(1024, Math.max(1, Math.ceil(output.clientWidth * GLOW_SCALE))),
      Math.min(1024, Math.max(1, Math.ceil(output.clientHeight * GLOW_SCALE))),
    );
    if (floatTargets) {
      for (const target of fieldTargets) {
        sizeTarget(
          target,
          Math.min(256, Math.max(1, Math.ceil(output.clientWidth / FIELD_CELL))),
          Math.min(256, Math.max(1, Math.ceil(output.clientHeight / FIELD_CELL))),
        );
      }
    }
    const sparkScale = Math.min(1, 2 / dpr);
    sizeTarget(
      sparkTarget,
      Math.min(4096, Math.max(1, Math.round(width * sparkScale))),
      Math.min(4096, Math.max(1, Math.round(height * sparkScale))),
    );
  }

  syncRamp();
  syncBacking();
  syncCanvasSize();

  const seed = Math.random();
  const noise = createNoise(seed);
  let elapsed = 0;
  let frameIndex = 0;
  const stir = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    presence: 0,
    target: 0,
    lastX: 0,
    lastY: 0,
    lastTime: 0,
    debt: 0,
    frameX: 0,
    frameY: 0,
  };

  const splat = { fromX: 0, fromY: 0, toX: 0, toY: 0, vx: 0, vy: 0, amount: 0 };
  let fieldDt = 0;

  function prepareSplat(delta: number) {
    const strength = stir.presence * clamp(config.stir, 0, 1);
    const jump = Math.hypot(stir.x - stir.frameX, stir.y - stir.frameY) > 240;
    splat.fromX = jump ? stir.x : stir.frameX;
    splat.fromY = jump ? stir.y : stir.frameY;
    splat.toX = stir.x;
    splat.toY = stir.y;
    splat.vx = stir.vx;
    splat.vy = stir.vy;
    splat.amount = strength > 0.005 ? strength * delta * 6 : 0;
    stir.frameX = stir.x;
    stir.frameY = stir.y;
  }

  const px = new Float32Array(MAX_PARTICLES);
  const py = new Float32Array(MAX_PARTICLES);
  const pvx = new Float32Array(MAX_PARTICLES);
  const pvy = new Float32Array(MAX_PARTICLES);
  const page = new Float32Array(MAX_PARTICLES);
  const plife = new Float32Array(MAX_PARTICLES);
  const psize = new Float32Array(MAX_PARTICLES);
  const pdepth = new Float32Array(MAX_PARTICLES);
  const pphase = new Float32Array(MAX_PARTICLES);
  const fields = [px, py, pvx, pvy, page, plife, psize, pdepth, pphase];
  const instances = new Float32Array(MAX_PARTICLES * STRIDE);
  let count = 0;
  let instanceCount = 0;
  let spawnDebt = 0;

  function spawn(x0?: number, y0?: number, vx0 = 0, vy0 = 0) {
    if (count >= MAX_PARTICLES) return;
    const width = cssWidth();
    const zone = zoneCss();
    const rise = riseSpeed();
    let x = x0 ?? 0;
    if (x0 === undefined) {
      for (let tries = 0; tries < 6; tries++) {
        x = Math.random() * width;
        if (Math.random() < 0.15 + 0.85 * blazeHotspot(x, elapsed, scale(), seed)) {
          break;
        }
      }
    }
    const y =
      y0 ?? (Math.random() < 0.6 ? -Math.random() * 12 : Math.random() * zone * 0.3);
    const depth = clamp(config.depth, 0, 1);
    const near = depth * 0.08;
    const far = 0.1 + depth * 0.3;
    const roll = Math.random();
    const z =
      roll < near
        ? 0.86 + Math.random() * 0.14
        : roll < near + far
          ? Math.random() * 0.3
          : 0.32 + Math.random() * 0.46;
    const i = count++;
    px[i] = x;
    py[i] = y;
    pvx[i] = vx0 + (Math.random() - 0.5) * 24;
    pvy[i] = vy0 + rise * (0.45 + Math.random() * 0.5);
    page[i] = 0;
    plife[i] = clamp((zone / rise) * (0.3 + Math.random() * 0.75), 0.6, 8);
    psize[i] = 0.6 + Math.random() * 0.9;
    pdepth[i] = z;
    pphase[i] = Math.random();
  }

  function kill(i: number) {
    const last = --count;
    if (i === last) return;
    for (const field of fields) field[i] = field[last];
  }

  function scale() {
    return Math.max(config.scale, 0.2);
  }

  function potential(x: number, y: number, t: number) {
    return (
      noise(x, y) + 0.5 * noise(x * 2.03 + 5.3 + t * 0.11, y * 2.03 - 1.7)
    );
  }

  const flow = { x: 0, y: 0 };
  function sampleFlow(x: number, y: number, t: number) {
    const s = 1 / (240 * scale());
    const X = x * s;
    const Y = y * s - t * 0.16;
    const e = 0.02;
    flow.x = (potential(X, Y + e, t) - potential(X, Y - e, t)) / (2 * e);
    flow.y = -(potential(X + e, Y, t) - potential(X - e, Y, t)) / (2 * e);
  }

  function simulate(dt: number) {
    const width = cssWidth();
    const zone = zoneCss();
    const rise = riseSpeed();
    const amount = clamp(config.sparks, 0, 1);
    const target = amount ** 1.5 * (width / 1440) * 180;
    const meanLife = clamp((zone / rise) * 0.68, 0.6, 8);
    spawnDebt += (target / meanLife) * dt;
    while (spawnDebt >= 1) {
      spawn();
      spawnDebt -= 1;
    }

    const stirAmount = clamp(config.stir, 0, 1) * stir.presence;
    const cursorSpeed = Math.hypot(stir.vx, stir.vy);
    if (splat.amount > 0 && cursorSpeed > 60 && stir.y < zone * 0.75) {
      stir.debt += stirAmount * Math.min(cursorSpeed / 700, 1.5) * 36 * dt;
      while (stir.debt >= 1) {
        spawn(
          stir.x + (Math.random() - 0.5) * 36,
          Math.max(stir.y + (Math.random() - 0.5) * 24, 0),
          stir.vx * 0.3,
          stir.vy * 0.3,
        );
        stir.debt -= 1;
      }
    }

    const swirl = clamp(config.turbulence, 0, 1) * 95;
    const ease = 1 - Math.exp(-dt * 1.6);
    const stirRadius = STIR_RADIUS * scale() ** 0.5;
    const r2 = stirRadius * stirRadius;
    const segX = splat.toX - splat.fromX;
    const segY = splat.toY - splat.fromY;
    const segLength = Math.max(segX * segX + segY * segY, 0.0001);
    for (let i = count - 1; i >= 0; i--) {
      page[i] += dt;
      const x = px[i];
      const y = py[i];
      if (
        page[i] >= plife[i] ||
        y > zone * 1.2 ||
        y < -60 ||
        x < -60 ||
        x > width + 60
      ) {
        kill(i);
        continue;
      }
      const heat = 1 - page[i] / plife[i];
      const parallax = 0.55 + 0.8 * pdepth[i];
      sampleFlow(x, y, elapsed);
      const flutter =
        Math.sin(elapsed * (1.3 + 1.7 * pphase[i]) + pphase[i] * 31) * 42 * (0.4 + heat);
      const tx = (flow.x * swirl + flutter) * parallax;
      const ty = (rise * (0.35 + 0.75 * heat) + flow.y * swirl) * parallax;
      pvx[i] += (tx - pvx[i]) * ease;
      pvy[i] += (ty - pvy[i]) * ease;
      if (splat.amount > 0) {
        const t = clamp(
          ((x - splat.fromX) * segX + (y - splat.fromY) * segY) / segLength,
          0,
          1,
        );
        const rx = x - (splat.fromX + segX * t);
        const ry = y - (splat.fromY + segY * t);
        const d2 = rx * rx + ry * ry;
        if (d2 < r2 * 9) {
          const g = Math.exp(-d2 / r2) * splat.amount * (0.6 + 0.6 * pdepth[i]);
          const twist = splat.vx * ry - splat.vy * rx;
          pvx[i] += (splat.vx - (twist * 2 * ry) / r2) * g;
          pvy[i] += (splat.vy + (twist * 2 * rx) / r2) * g;
        }
      }
      px[i] = x + pvx[i] * dt;
      py[i] = y + pvy[i] * dt;
    }
  }

  function pack() {
    const zone = zoneCss();
    const size = Math.max(config.sparkSize, 0.2);
    let n = 0;
    for (let i = 0; i < count; i++) {
      const heat = clamp(1 - page[i] / plife[i], 0, 1);
      const z = pdepth[i];
      const blur = z > 0.84 ? (z - 0.84) / 0.16 : 0;
      const flicker =
        0.72 + 0.28 * Math.sin(elapsed * (7 + 9 * pphase[i]) + pphase[i] * 40);
      const alpha =
        Math.min(page[i] / 0.25, 1) *
        (1 - smoothstep(zone * 0.85, zone * 1.15, py[i])) *
        heat ** 1.2 *
        flicker *
        (0.45 + 0.55 * z) *
        (1 - 0.7 * blur);
      if (alpha < 0.004) continue;
      const o = n * STRIDE;
      instances[o] = px[i];
      instances[o + 1] = py[i];
      instances[o + 2] = pvx[i];
      instances[o + 3] = pvy[i];
      instances[o + 4] =
        1.6 * size * psize[i] * (0.55 + 0.6 * z) * (1 + blur * 4) * (0.65 + 0.35 * heat);
      instances[o + 5] = blur;
      instances[o + 6] = heat;
      instances[o + 7] = alpha;
      n++;
    }
    instanceCount = n;
  }

  function pageMode() {
    return htmlInCanvas && config.layer === "page";
  }

  function uploadContent() {
    if (!pageMode() || !contentDirty) return;
    contentDirty = false;
    gl!.bindTexture(gl!.TEXTURE_2D, contentTexture);
    gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, gl!.RGBA, gl!.UNSIGNED_BYTE, source!);
  }

  function render() {
    uploadContent();
    const viewWidth = cssWidth();
    const viewHeight = Math.max(output.clientHeight, 1);
    const zone = zoneCss();

    gl!.bindVertexArray(quadVao);
    let u = stirPass.uniforms;
    if (floatTargets && fieldDt > 0) {
      const from = fieldTargets[fieldIndex];
      const to = fieldTargets[1 - fieldIndex];
      gl!.useProgram(stirPass.program);
      gl!.activeTexture(gl!.TEXTURE0);
      gl!.bindTexture(gl!.TEXTURE_2D, from.texture);
      gl!.uniform1i(u.uField, 0);
      gl!.uniform2f(u.uGrid, to.width, to.height);
      gl!.uniform2f(u.uView, viewWidth, viewHeight);
      gl!.uniform1f(u.uDt, fieldDt);
      gl!.uniform1f(u.uDrift, riseSpeed() * 0.55);
      gl!.uniform4f(u.uSegment, splat.fromX, splat.fromY, splat.toX, splat.toY);
      gl!.uniform4f(u.uSplat, splat.vx, splat.vy, STIR_RADIUS * scale() ** 0.5, splat.amount);
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, to.framebuffer);
      gl!.viewport(0, 0, to.width, to.height);
      gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
      fieldIndex = 1 - fieldIndex;
    }

    gl!.useProgram(glowPass.program);
    u = glowPass.uniforms;
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, rampTexture);
    gl!.uniform1i(u.uRamp, 0);
    gl!.uniform2f(u.uSize, glowTarget.width, glowTarget.height);
    gl!.uniform2f(u.uView, viewWidth, viewHeight);
    gl!.uniform1f(u.uZone, zone);
    gl!.uniform1f(u.uTime, elapsed);
    gl!.uniform1f(u.uRise, riseSpeed());
    gl!.uniform1f(u.uScale, scale());
    gl!.uniform1f(u.uGlow, clamp(config.glow, 0, 1));
    gl!.uniform1f(u.uSmoke, clamp(config.smoke, 0, 1));
    gl!.uniform1f(u.uTurbulence, clamp(config.turbulence, 0, 1));
    gl!.uniform1f(u.uSeed, seed);
    gl!.uniform1f(u.uGain, glowGain);
    gl!.activeTexture(gl!.TEXTURE1);
    gl!.bindTexture(gl!.TEXTURE_2D, fieldTargets[fieldIndex].texture);
    gl!.uniform1i(u.uField, 1);
    gl!.uniform1f(u.uFieldOn, floatTargets ? 1 : 0);
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, glowTarget.framebuffer);
    gl!.viewport(0, 0, glowTarget.width, glowTarget.height);
    gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);

    gl!.bindFramebuffer(gl!.FRAMEBUFFER, sparkTarget.framebuffer);
    gl!.viewport(0, 0, sparkTarget.width, sparkTarget.height);
    gl!.clearColor(0, 0, 0, 0);
    gl!.clear(gl!.COLOR_BUFFER_BIT);
    if (instanceCount > 0) {
      gl!.bindVertexArray(sparkVao);
      gl!.bindBuffer(gl!.ARRAY_BUFFER, instanceBuffer);
      gl!.bufferSubData(gl!.ARRAY_BUFFER, 0, instances, 0, instanceCount * STRIDE);
      gl!.useProgram(sparkPass.program);
      u = sparkPass.uniforms;
      gl!.activeTexture(gl!.TEXTURE0);
      gl!.bindTexture(gl!.TEXTURE_2D, rampTexture);
      gl!.uniform1i(u.uRamp, 0);
      gl!.uniform2f(u.uView, viewWidth, viewHeight);
      gl!.uniform1f(u.uShutter, 0.045);
      gl!.uniform1f(u.uGain, sparkGain);
      gl!.enable(gl!.BLEND);
      gl!.blendFunc(gl!.ONE, gl!.ONE);
      gl!.drawArraysInstanced(gl!.TRIANGLE_STRIP, 0, 4, instanceCount);
      gl!.disable(gl!.BLEND);
      gl!.bindVertexArray(quadVao);
    }

    gl!.useProgram(compositePass.program);
    u = compositePass.uniforms;
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, glowTarget.texture);
    gl!.uniform1i(u.uGlowTex, 0);
    gl!.activeTexture(gl!.TEXTURE1);
    gl!.bindTexture(gl!.TEXTURE_2D, sparkTarget.texture);
    gl!.uniform1i(u.uSparkTex, 1);
    gl!.activeTexture(gl!.TEXTURE2);
    gl!.bindTexture(gl!.TEXTURE_2D, contentTexture);
    gl!.uniform1i(u.uContent, 2);
    gl!.uniform1i(u.uMode, pageMode() ? 1 : 0);
    gl!.uniform2f(u.uResolution, output.width, output.height);
    gl!.uniform1f(u.uDpr, dpr);
    gl!.uniform1f(u.uZone, zone);
    gl!.uniform1f(u.uMaxX, contentMaxX);
    gl!.uniform1f(u.uIntensity, clamp(config.intensity, 0, 1));
    gl!.uniform1f(u.uLight, light ? 1 : 0);
    gl!.uniform1f(u.uHaze, clamp(config.haze, 0, 1));
    gl!.uniform1f(u.uTime, elapsed);
    gl!.uniform1f(u.uRise, riseSpeed());
    gl!.uniform1f(u.uScale, scale());
    gl!.uniform1f(u.uFrame, frameIndex % 1024);
    gl!.uniform1f(u.uGlowGain, 1 / glowGain);
    gl!.uniform1f(u.uSparkGain, 1 / sparkGain);
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
    gl!.viewport(0, 0, output.width, output.height);
    gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
    gl!.bindVertexArray(null);
  }

  let raf = 0;
  let lastTime = performance.now();
  let running = false;
  let visible = true;
  let warm = true;

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reducedMotion = motionQuery.matches;

  function warmUp() {
    const step = 1 / 30;
    for (let t = 0; t < WARMUP_SECONDS; t += step) {
      elapsed += step;
      simulate(step);
    }
    warm = false;
  }

  function frame(now: number) {
    if (destroyed) return;
    if (!visible) {
      running = false;
      return;
    }
    const delta = Math.min((now - lastTime) / 1000, 1 / 30);
    lastTime = now;
    if (warm) warmUp();
    const fade = 1 - Math.exp(-delta * 3);
    stir.presence += (stir.target - stir.presence) * fade;
    const damping = Math.exp(-delta * 4);
    stir.vx *= damping;
    stir.vy *= damping;
    if (reducedMotion) {
      pack();
      render();
      running = false;
      return;
    }
    const dt = delta * Math.max(config.speed, 0);
    elapsed += dt;
    frameIndex += 1;
    prepareSplat(delta);
    fieldDt = Math.max(dt, 0.001);
    simulate(dt);
    pack();
    render();
    raf = requestAnimationFrame(frame);
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
    window.clearTimeout(themeTimer);
    themeTimer = window.setTimeout(() => {
      syncBacking();
      start();
    }, 300);
    start();
  }
  const themeObserver = new MutationObserver(onThemeShift);
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "style", "data-theme"],
  });
  const schemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
  schemeQuery.addEventListener("change", onThemeShift);

  let outputRect = output.getBoundingClientRect();
  const refreshOutputRect = () => {
    outputRect = output.getBoundingClientRect();
  };

  const observer = createCanvasResizeObserver(() => {
    refreshOutputRect();
    syncCanvasSize();
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

  function onPointerMove(event: PointerEvent) {
    const x = event.clientX - outputRect.left;
    const y = outputRect.height - (event.clientY - outputRect.top);
    const inside =
      x >= 0 && x <= outputRect.width && y >= -40 && y <= zoneCss() * 1.2;
    const now = performance.now() / 1000;
    if (inside && stir.target > 0) {
      const dt = Math.max(now - stir.lastTime, 1 / 240);
      const vx = (x - stir.lastX) / dt;
      const vy = (y - stir.lastY) / dt;
      stir.vx += (clamp(vx, -1600, 1600) - stir.vx) * 0.35;
      stir.vy += (clamp(vy, -1600, 1600) - stir.vy) * 0.35;
    }
    stir.x = x;
    stir.y = y;
    stir.lastX = x;
    stir.lastY = y;
    stir.lastTime = now;
    stir.target = inside ? 1 : 0;
  }

  function onPointerLeave() {
    stir.target = 0;
  }

  window.addEventListener("pointermove", onPointerMove, { passive: true });
  document.documentElement.addEventListener("pointerleave", onPointerLeave, {
    passive: true,
  });

  return {
    setOptions(next) {
      next = resolveOptions(DEFAULTS, next);
      let changed = false;
      for (const [key, value] of Object.entries(next)) {
        const prev = config[key as keyof typeof config];
        if (Array.isArray(value) && Array.isArray(prev)) {
          if (value.length !== prev.length || value.some((item, i) => item !== prev[i])) {
            changed = true;
            break;
          }
        } else if (prev !== value) {
          changed = true;
          break;
        }
      }
      if (!changed) return;
      Object.assign(config, next);
      syncRamp();
      syncBacking();
      start();
    },
    resize() {
      refreshOutputRect();
      syncCanvasSize();
      start();
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(themeTimer);
      observer.disconnect();
      window.removeEventListener("resize", refreshOutputRect);
      window.removeEventListener("scroll", refreshOutputRect, true);
      intersection.disconnect();
      document.removeEventListener("visibilitychange", syncVisibility);
      themeObserver.disconnect();
      schemeQuery.removeEventListener("change", onThemeShift);
      motionQuery.removeEventListener("change", onMotionChange);
      window.removeEventListener("pointermove", onPointerMove);
      document.documentElement.removeEventListener("pointerleave", onPointerLeave);
      for (const target of [glowTarget, sparkTarget, ...fieldTargets]) {
        gl!.deleteTexture(target.texture);
        gl!.deleteFramebuffer(target.framebuffer);
      }
      gl!.deleteTexture(contentTexture);
      gl!.deleteTexture(rampTexture);
      for (const program of programs) gl!.deleteProgram(program);
      for (const shader of shaders) gl!.deleteShader(shader);
      gl!.deleteBuffer(quadBuffer);
      gl!.deleteBuffer(instanceBuffer);
      gl!.deleteVertexArray(quadVao);
      gl!.deleteVertexArray(sparkVao);
      if (htmlInCanvas) paintable!.onpaint = null;
    },
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}
