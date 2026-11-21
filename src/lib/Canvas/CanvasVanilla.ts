// Powered by Paper Shaders: https://shaders.paper.design
// The paper surface is adapted from paper-texture in paper-design/shaders (Apache-2.0) and modified.

import { getCanvasPixelRatio, createCanvasResizeObserver } from "../canvas-viewport";
import { isHtmlInCanvasBlocked, prepareHtmlInCanvas, drawHtmlInCanvas } from "../html-in-canvas";
import { resolveOptions } from "../options";

export type CanvasPreset =
  | "canvas"
  | "raw"
  | "linen"
  | "burlap"
  | "paper"
  | "scroll";
export type CanvasLayer = "background" | "foreground" | "page";
export type CanvasFit = "cover" | "contain";

export interface CanvasOptions {
  /** Material to start from. Every option you pass overrides it. */
  preset?: CanvasPreset;
  /** Where the sheet sits: behind the content, laid over it, or with the content printed into it (html-in-canvas only, falls back to foreground). */
  layer?: CanvasLayer;
  /** Image to print onto the sheet. */
  src?: string;
  /** How the image fills the sheet. */
  fit?: CanvasFit;
  /** Sheet color, as any CSS color. */
  color?: string;
  /** Color of creases, grain and stains, as any CSS color. */
  shadow?: string;
  /** Backdrop around the sheet when it has an inset, or around a clipped image, as any CSS color. */
  back?: string;
  /** Margin left and right of the sheet in CSS pixels. The content is padded to sit on the sheet and the backdrop shows around it. */
  insetX?: number;
  /** Margin above and below the sheet in CSS pixels. */
  insetY?: number;
  /** Size of one sheet in CSS pixels. Folds, crumples and wrinkles scale with it. */
  size?: number;
  /** Seed for every pattern (0 to 1000). */
  seed?: number;
  /** Fine grain across the surface (0 to 1). */
  roughness?: number;
  /** Scale of the grain (0 to 1). */
  roughnessSize?: number;
  /** Lines the grain up into laid-paper rows (0 to 1). */
  roughnessRows?: number;
  /** Curly fibers through the paper (0 to 1). */
  fiber?: number;
  /** Scale of the fibers (0 to 1). */
  fiberSize?: number;
  /** Straight fold lines across the sheet (0 to 1). */
  folds?: number;
  /** Panels across the sheet between vertical folds. */
  foldColumns?: number;
  /** Panels down the sheet between horizontal folds. */
  foldRows?: number;
  /** Small crumpled facets repeating across the surface (0 to 1). */
  wrinkles?: number;
  /** Scale of the wrinkles (0 to 1). */
  wrinkleSize?: number;
  /** Large irregular creases, like a sheet crushed and flattened again (0 to 1). */
  crumples?: number;
  /** Number of facets in the crumple field (2 to 15). */
  crumpleCount?: number;
  /** Woven threads (0 to 1). */
  weave?: number;
  /** Width of one woven thread in CSS pixels. */
  weaveSize?: number;
  /** How far apart the threads sit, from a tight weave to an open one like burlap (0 to 1). */
  weaveOpen?: number;
  /** Uneven, lumpy threads, like linen (0 to 1). */
  slub?: number;
  /** Speckled stains across the sheet (0 to 1). */
  stains?: number;
  /** Radius of the rolled top and bottom edges in CSS pixels. 0 keeps the sheet flat. */
  curl?: number;
  /** Darkened, aged edges (0 to 1). */
  burn?: number;
  /** Direction the light comes from in degrees (0 to 360). */
  angle?: number;
  /** How much an image or the page bends with the surface (-1 to 1). */
  distortion?: number;
  /** How much of the paper shows through an image or the page (0 to 1). */
  blending?: number;
  /** Cut the sheet to the image frame. */
  clip?: boolean;
  /** Strength of the texture in the foreground layer (0 to 1). */
  strength?: number;
  /** How much the sheet color tints the content in the foreground layer (0 to 1). */
  tint?: number;
  /** A soft, low light follows the cursor and rakes across the texture. */
  interactive?: boolean;
  /** Radius of the cursor light in CSS pixels. */
  radius?: number;
  /** How strongly the cursor light picks out the texture (0 to 1). */
  glow?: number;
}

export interface CanvasElements {
  output: HTMLCanvasElement;
  source?: HTMLCanvasElement | null;
  content?: HTMLElement | null;
}

export interface CanvasInstance {
  setOptions: (options: CanvasOptions) => void;
  resize: () => void;
  destroy: () => void;
}

type Material = Omit<
  Required<CanvasOptions>,
  | "preset"
  | "layer"
  | "src"
  | "fit"
  | "back"
  | "insetX"
  | "insetY"
  | "clip"
  | "interactive"
  | "radius"
  | "glow"
  | "size"
>;

const BASE: Material = {
  color: "#f3efe6",
  shadow: "#968e80",
  seed: 4,
  roughness: 0.15,
  roughnessSize: 0.5,
  roughnessRows: 0,
  fiber: 0.15,
  fiberSize: 0.5,
  folds: 0,
  foldColumns: 3,
  foldRows: 2,
  wrinkles: 0,
  wrinkleSize: 0.4,
  crumples: 0,
  crumpleCount: 6,
  weave: 0.8,
  weaveSize: 3.5,
  weaveOpen: 0.2,
  slub: 0.3,
  stains: 0,
  curl: 0,
  burn: 0,
  angle: 300,
  distortion: 0.4,
  blending: 1,
  strength: 0.45,
  tint: 0,
};

export const CANVAS_PRESETS: Record<CanvasPreset, Material> = {
  canvas: BASE,
  raw: {
    ...BASE,
    color: "#ddd0b7",
    shadow: "#7a6d57",
    seed: 31,
    roughness: 0.2,
    fiber: 0.35,
    weave: 1,
    weaveSize: 4,
    weaveOpen: 0.3,
    slub: 0.6,
    tint: 0.15,
  },
  linen: {
    ...BASE,
    color: "#d6cebf",
    shadow: "#80786a",
    seed: 77,
    roughness: 0.15,
    fiber: 0.3,
    fiberSize: 0.7,
    weave: 0.9,
    weaveSize: 2.5,
    weaveOpen: 0.15,
    slub: 1,
    tint: 0.1,
  },
  burlap: {
    ...BASE,
    color: "#b3935f",
    shadow: "#4c3a20",
    seed: 140,
    roughness: 0.2,
    fiber: 0.6,
    fiberSize: 0.8,
    weave: 1,
    weaveSize: 7,
    weaveOpen: 0.6,
    slub: 0.8,
    strength: 0.35,
    tint: 0.2,
  },
  paper: {
    ...BASE,
    color: "#fbfaf6",
    shadow: "#b4afa4",
    roughness: 0.35,
    fiber: 0.35,
    wrinkles: 0.2,
    weave: 0,
  },
  scroll: {
    ...BASE,
    color: "#eedfba",
    shadow: "#7d5e36",
    seed: 211,
    roughness: 0.4,
    fiber: 0.5,
    fiberSize: 0.6,
    wrinkles: 0.2,
    weave: 0,
    stains: 0.25,
    curl: 36,
    burn: 0.35,
    angle: 30,
    tint: 0.25,
  },
};

const DEFAULTS: Required<CanvasOptions> = {
  ...BASE,
  preset: "canvas",
  layer: "background",
  src: "",
  fit: "cover",
  back: "transparent",
  insetX: 0,
  insetY: 0,
  size: 800,
  clip: false,
  interactive: true,
  radius: 550,
  glow: 0.15,
};

const MAX_CRUMPLES = 15;

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

const FRAG = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2 uResolution;
uniform vec2 uScroll;
uniform vec2 uInset;
uniform float uSize;
uniform int uMode;
uniform sampler2D uImage;
uniform vec2 uImageScale;
uniform sampler2D uNoise;
uniform vec4 uColorBack;
uniform vec4 uColorPaper;
uniform vec4 uColorShadow;
uniform float uBlending;
uniform float uDistortion;
uniform float uClip;
uniform float uAngle;
uniform float uSeed;
uniform float uRoughness;
uniform float uRoughnessSize;
uniform float uRoughnessRows;
uniform float uFiber;
uniform float uFiberSize;
uniform float uFolds;
uniform vec2 uFoldCount;
uniform float uWrinkles;
uniform float uWrinkleSize;
uniform float uCrumples;
uniform float uCrumpleCount;
uniform float uDrops;
uniform float uWeave;
uniform float uWeaveSize;
uniform float uWeaveOpen;
uniform float uSlub;
uniform float uCurl;
uniform float uBurn;
uniform vec4 uLamp;
uniform float uStrength;
uniform float uTint;

#define TWO_PI 6.28318530718
#define PI 3.14159265358979323846

float hash21 (vec2 p) {
  p = fract(p * vec2(0.3183099, 0.3678794)) + 0.1;
  p += dot(p, p + 19.19);
  return fract(p.x * p.y);
}

vec2 hash22 (vec2 p) {
  p = fract(p * vec2(0.3183099, 0.3678794)) + 0.1;
  p += dot(p, p.yx + 19.19);
  return fract(vec2(p.x * p.y, p.x + p.y));
}

float getUvFrame (vec2 uv) {
  vec2 invAA = .5 / clamp(fwidth(uv), 1e-5, .02);
  vec2 lo = clamp(uv * invAA + .5, 0., 1.);
  vec2 hi = clamp((1. - uv) * invAA + .5, 0., 1.);
  return lo.x * hi.x * lo.y * hi.y;
}

float lst (float edge0, float edge1, float x) {
  return clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0);
}

float getRoughness (vec2 p, vec2 lightDir, vec2 seedShift, float basePixel) {
  vec2 u = p / vec2(2, 4);
  float w = 100. * basePixel;
  float eps = 4. * w;
  float size = mix(3.2, .8, uRoughnessSize);
  float logLac = log2(2.1);
  float level = -log2(w + 1e-8) / logLac;
  float baseLevel = floor(level) - 2.;
  float fade = fract(level);
  vec2 px = (u.x + vec2(eps, -eps)) * .1;
  float py = u.y * .1;
  vec2 sum = vec2(0.);
  float norm = 0., amp = .5;
  float freq = exp2(baseLevel * logLac);
  for (int i = 0; i < 4; i++) {
    float absIdx = baseLevel + float(i);
    vec2 qx = size * px * freq;
    float qy = size * py * freq;
    float wi = 1.;
    if (i == 0) wi = 1. - fade;
    if (i == 3) wi = fade;
    vec2 fx = fract(qx);
    float fy = fract(qy);
    vec2 shift = .5 + absIdx * .3 + seedShift;
    float uvY = floor(qy) / 50. + shift.y;
    vec2 s0a = textureLod(uNoise, fract(vec2(floor(qx.x) / 50. + shift.x, uvY)), 0.).rg;
    vec2 s1a = textureLod(uNoise, fract(vec2(ceil(qx.x) / 50. + shift.x, uvY)), 0.).rg;
    vec2 s0b = textureLod(uNoise, fract(vec2(floor(qx.y) / 50. + shift.x, uvY)), 0.).rg;
    vec2 s1b = textureLod(uNoise, fract(vec2(ceil(qx.y) / 50. + shift.x, uvY)), 0.).rg;
    vec2 ny0 = mix(vec2(s0a.r, s0b.r), vec2(s0a.g, s0b.g), fy);
    vec2 ny1 = mix(vec2(s1a.r, s1b.r), vec2(s1a.g, s1b.g), fy);
    vec2 n = mix(ny0, ny1, fx);
    sum += amp * wi * n;
    norm += amp * wi;
    amp *= .8;
    freq *= 2.1;
  }
  vec2 r = sum / norm;
  float dx = .5 + r.x - r.y;
  float grain = 3. * dx * dx - .7;
  float rowBand = fract(dot(p, lightDir) * .05 * size);
  return grain + .6 * uRoughnessRows * (rowBand - .5);
}

float getFiber (vec2 p, vec2 seedShift, float basePixel) {
  float size = mix(4., 1., uFiberSize);
  float w = 50. * basePixel;
  float level = -log2(w + 1e-8);
  float baseLevel = floor(level) - 3.;
  float fade = fract(level);
  vec2 grad = vec2(0.);
  float scale = 1.;
  float amp = 1.;
  float freq = pow(1.7, baseLevel);
  for (int i = 0; i < 5; i++) {
    float absIdx = baseLevel + float(i);
    vec2 q = size * p * freq;
    float an = absIdx * .8;
    float rc = cos(an), rs = sin(an);
    q = vec2(rc * q.x - rs * q.y, rs * q.x + rc * q.y);
    float wi = 1.;
    if (i == 0) wi = 1. - fade;
    if (i == 4) wi = fade;
    vec2 iq = floor(q);
    vec2 fq = fract(q);
    float shift = absIdx * .3;
    vec4 uv = fract(vec4(iq, iq + 1.) / 50. + .5 + shift + seedShift.xyxy);
    float aF = textureLod(uNoise, uv.xy, 0.).b;
    float bF = textureLod(uNoise, uv.zy, 0.).b;
    float cF = textureLod(uNoise, uv.xw, 0.).b;
    float dF = textureLod(uNoise, uv.zw, 0.).b;
    vec2 u = fq * fq * (3. - 2. * fq);
    vec2 du = 8. * fq * (1. - fq);
    float dx = du.x * mix(bF - aF, dF - cF, u.y);
    float dy = du.y * mix(cF - aF, dF - bF, u.x);
    grad += wi * amp * scale * vec2(rc * dx + rs * dy, -rs * dx + rc * dy);
    scale *= 1.7;
    amp *= .5;
    freq *= 1.7;
  }
  return clamp(.333 * length(grad), 0., 1.);
}

vec2 smoothNoise (vec2 p) {
  vec2 t = p * 50. - .5;
  vec2 i = floor(t);
  vec2 f = fract(t);
  f = f * f * (3. - 2. * f);
  return textureLod(uNoise, fract((i + f + .5) / vec2(50.)), 0.).rg;
}

float getDrops (vec2 uv, vec2 seedShift) {
  vec2 iDropsUV = floor(uv);
  vec2 fDropsUV = fract(uv);
  float dropsMinDist = 1.;
  for (int y = -1; y < 2; y += 1) {
    for (int x = -1; x < 2; x += 1) {
      vec2 neighbor = vec2(float(y), float(x));
      vec2 offset = hash22(iDropsUV + neighbor + 50. * seedShift);
      vec2 pos = neighbor + offset - fDropsUV;
      dropsMinDist *= min(1., dot(pos, pos));
    }
  }
  return .5 * lst(.09, .08, sqrt(sqrt(dropsMinDist)));
}

vec2 getCellTilt (float idx, float radius) {
  vec2 rand = hash22(vec2(idx + 31., idx * uSeed + 17.));
  float an = rand.x * TWO_PI;
  return vec2(cos(an), sin(an)) * mix(.3, 1.7, rand.y * rand.y) * mix(.7, 1., radius);
}

vec2 getCrumpleDetail (vec2 uv, float freq, float shift, float basePixel, out float depth) {
  depth = 0.;
  vec2 v = uv * freq;
  float pixel = .9 * freq * basePixel;
  vec2 base = floor(v);
  float n1 = 9., n2 = 9.;
  vec2 s1 = vec2(0.), s2 = vec2(0.), q1 = vec2(0.), q2 = vec2(0.);
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 cell = base + vec2(float(x), float(y));
      vec2 q = hash22(vec2(cell.y * 1.9 + 3.1 + shift, cell.x * 1.3 + .11 * uSeed));
      if (q.y > .8) continue;
      vec2 r = hash22(vec2(cell.x + .37 * uSeed + shift + 11.1, cell.y - .21 * uSeed + 5.7));
      vec2 s = cell + .06 + .88 * r;
      vec2 d = v - s;
      float dsq = dot(d, d);
      if (dsq < n1) {
        n2 = n1;
        s2 = s1;
        q2 = q1;
        n1 = dsq;
        s1 = s;
        q1 = q;
      } else if (dsq < n2) {
        n2 = dsq;
        s2 = s;
        q2 = q;
      }
    }
  }
  if (n1 > 8.) return vec2(0.);
  float an1 = q1.x * TWO_PI, mag1 = q1.y / .8;
  vec2 t1 = vec2(cos(an1), sin(an1)) * mix(.3, 1.7, mag1 * mag1);
  float an2 = q2.x * TWO_PI, mag2 = q2.y / .8;
  vec2 t2 = vec2(cos(an2), sin(an2)) * mix(.3, 1.7, mag2 * mag2);
  vec2 span = s1 - s2;
  float spanLen = max(length(span), 1e-4);
  float toEdge = (n2 - n1) / (2. * spanLen);
  float pair = hash21(s1 + s2 + 1.7 * abs(s1 - s2));
  float pairSoft = .05 + .1 * step(pair, .4);
  float b = clamp(toEdge / max(1.5 * pixel, .5 * pairSoft), 0., 1.);
  b = b * b * (3. - 2. * b);
  float d1 = max(sqrt(n1), 1e-4);
  depth = .2 * d1;
  float shoulderAmt = max(0., 1. - toEdge / .42) * b;
  vec2 shoulder = vec2(0.);
  if (shoulderAmt > 0.) {
    float d2 = max(sqrt(n2), 1e-4);
    shoulder = shoulderAmt * ((v - s2) / d2 - (v - s1) / d1);
  }
  vec2 mid = .5 * (t1 + t2);
  return mid + (t1 - mid) * b + .9 * shoulder;
}

vec4 getCrumples (vec2 uv) {
  float crumpleN = max(2., floor(uCrumpleCount + .5));
  float near = 60000., nearB = 60000.;
  float idx = 0., rad = 0.;
  vec2 nearP = vec2(0.), nearPb = vec2(0.);
  vec4 seeds[${MAX_CRUMPLES}];
  for (int i = 0; i < ${MAX_CRUMPLES}; i++) {
    seeds[i] = vec4(0.);
    if (float(i) >= crumpleN) continue;
    vec2 rand = hash22(vec2(float(i), float(i) * uSeed));
    float an = rand.x * TWO_PI;
    vec2 p = vec2(cos(an), sin(an)) * rand.y;
    seeds[i] = vec4(p, rand);
    vec2 d = uv - p;
    float dsq = dot(d, d);
    if (dsq < near) {
      nearB = near;
      nearPb = nearP;
      near = dsq;
      idx = float(i);
      rad = rand.y;
      nearP = p;
    } else if (dsq < nearB) {
      nearB = dsq;
      nearPb = p;
    }
  }
  float l = sqrt(near), lb = sqrt(nearB);
  vec2 dir = (uv - nearP) / max(l, 1e-4);
  float edge = lst(0., .5, lb - l);
  float shoulderLimit = l + .5;
  vec2 tilt = getCellTilt(idx, rad);
  float tiltSum = 1.;
  vec2 wide = vec2(0.);
  float wideSum = 0.;
  float toEdge = 9., edgeSoft = 0.;
  for (int i = 0; i < ${MAX_CRUMPLES}; i++) {
    if (float(i) >= crumpleN) break;
    if (float(i) == idx) continue;
    vec4 seed = seeds[i];
    vec2 p = seed.xy;
    vec2 rand = seed.zw;
    vec2 d = uv - p;
    float dsq = dot(d, d);
    if (dsq < shoulderLimit * shoulderLimit) {
      float di = sqrt(dsq);
      float shoulder = lst(.5, 0., di - l);
      wide += shoulder * (d / max(di, 1e-4) - dir);
      wideSum += shoulder;
    }
    float pairSoft = .01 + .05 * step(.2, rand.x) + .3 * rand.y;
    float toBisector = (dsq - near) / (.2 * max(length(p - nearP), 1e-4));
    if (toBisector < toEdge) {
      toEdge = toBisector;
      edgeSoft = pairSoft;
    }
    float w = 1. - toBisector / pairSoft;
    if (w > 0.) {
      w *= w;
      tilt += w * getCellTilt(float(i), rand.y);
      tiltSum += w;
    }
  }
  float blend = clamp(toEdge / max(edgeSoft, 1e-4), 0., 1.);
  vec2 sharp = (1. - edge) * ((uv - nearPb) / max(lb, 1e-4) - dir);
  vec2 rounding = mix(sharp, wide / max(wideSum, 1.), min(2. * edgeSoft, 1.));
  float radial = l / max(l + toEdge, 1e-4);
  return vec4(tilt / tiltSum + rounding * blend * radial, .2 * l, edge);
}

void getFolds (vec2 coord, vec2 offset, vec2 count, vec2 noise, vec2 baseFwidth, out vec2 slope, out vec2 dark, out vec2 lift) {
  vec2 g = coord * count + .5 * offset + noise;
  vec2 dx = fract(g) - .5;
  vec2 adx = abs(dx);
  vec2 t = clamp(adx / .3, 0., 1.);
  dark = t * t * (3. - 2. * t);
  lift = 1. - t;
  lift *= lift;
  vec2 crease = clamp(dx / max(count * baseFwidth, 1e-5), -1., 1.);
  slope = crease * (1. - dark);
  vec2 lineWidth = .02 * count * mix(vec2(2.5), vec2(.8), dark.yx) + .1 * noise;
  slope -= 1. - smoothstep(vec2(0.), lineWidth, adx);
}

float weaveHeight (vec2 t) {
  vec2 cell = floor(t);
  vec2 f = fract(t) - .5;
  float over = mod(cell.x + cell.y, 2.);
  float jx = hash21(vec2(cell.x, 3.1 + uSeed)) - .5;
  float jy = hash21(vec2(7.7 + uSeed, cell.y)) - .5;
  float slubV = smoothNoise(vec2(cell.x * .37, t.y * .045) + .13).x - .5;
  float slubH = smoothNoise(vec2(t.x * .045, cell.y * .37) + .71).y - .5;
  float halfWidth = mix(.47, .24, uWeaveOpen);
  float wV = halfWidth * (1. + uSlub * (.7 * slubV + .2 * jx));
  float wH = halfWidth * (1. + uSlub * (.7 * slubH + .2 * jy));
  float vx = clamp(abs(f.x + .06 * uSlub * jx) / max(wV, .05), 0., 1.);
  float hy = clamp(abs(f.y + .06 * uSlub * jy) / max(wH, .05), 0., 1.);
  float twistV = .07 * sin((t.y * 2.4 + f.x * 1.3) * TWO_PI) * (1. - vx);
  float twistH = .07 * sin((t.x * 2.4 + f.y * 1.3) * TWO_PI) * (1. - hy);
  float vertical = (sqrt(1. - vx * vx) + twistV) * mix(.45 + .2 * cos(f.y * PI), .65 + .35 * cos(f.y * PI), over);
  float horizontal = (sqrt(1. - hy * hy) + twistH) * mix(.65 + .35 * cos(f.x * PI), .45 + .2 * cos(f.x * PI), over);
  return max(vertical, horizontal);
}

void main () {
  vec2 px = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y);
  vec2 sheetUv = px / uResolution;
  vec2 sheetSize = max(uResolution - 2. * uInset, vec2(1.));
  vec2 sheet01 = (px - uInset) / sheetSize;
  float basePixel = 1. / uSize;

  float lightRad = radians(uAngle);
  vec2 lightDir = vec2(sin(lightRad), -cos(lightRad));
  float lightPower = mix(.75, 1., clamp(.5 + dot(sheetUv - .5, lightDir), 0., 1.));
  float foldAngleInSector = mod(uAngle, 90.);
  float foldLightRad = radians(uAngle - foldAngleInSector + mix(12., 78., foldAngleInSector / 90.));
  vec2 foldLightDir = vec2(sin(foldLightRad), -cos(foldLightRad));

  float grazing = .7;
  vec2 relief = vec2(0.);
  vec2 foldSlope = vec2(0.);
  float reliefAmount = 0.;
  float foldInk = 1.;
  vec2 crumpleFlow = vec2(0.);
  float crumpleDepth = 0.;
  float wrinkleDepth = 0.;
  float foldDepth = 0.;

  vec2 warped = px + uScroll;
  vec2 patternUV = (warped - .5 * uResolution) / uSize;
  float lamp = 0.;
  vec2 lampDir = lightDir;
  if (uLamp.w > .001) {
    vec2 toLamp = px - uLamp.xy;
    float height = .55 * uLamp.z;
    lamp = uLamp.w * exp(-dot(toLamp, toLamp) / max(uLamp.z * uLamp.z, 1.));
    lampDir = (toLamp + lightDir * height * .7) / sqrt(dot(toLamp, toLamp) + height * height);
  }

  vec2 warpNoise = smoothNoise(patternUV * .1 + .2 + .6 * fract(.017 * uSeed)) - .5;
  vec2 crumplesUV = patternUV * .9 + .012 * warpNoise;

  if (uCrumples > 0.) {
    vec4 crumples = getCrumples(crumplesUV);
    vec2 crumpleTilt = .5 * uCrumples * crumples.xy;
    crumpleTilt -= .1 * max(dot(crumpleTilt, lightDir), 0.) * lightDir;
    relief += crumpleTilt;
    reliefAmount += .6 * uCrumples;
    crumpleFlow = crumples.w * crumpleTilt;
    crumpleDepth = clamp(5. * crumples.z, 0., 1.);
  }

  if (uWrinkles > 0.) {
    float detailFreq = mix(10., 1., uWrinkleSize);
    float detailAmp = .2;
    vec2 detailGrad = vec2(0.);
    float detailDepth = 0., depthSum = 0.;
    for (int i = 0; i < 3; i++) {
      float layerDepth;
      detailGrad += detailAmp * getCrumpleDetail(crumplesUV, detailFreq, 31. * float(i), basePixel, layerDepth);
      detailDepth += detailAmp * layerDepth;
      depthSum += detailAmp;
      detailAmp *= (.5 + .2 * detailGrad.x);
      detailFreq *= 2.1;
    }
    vec2 detailTilt = 1.5 * uWrinkles * detailGrad;
    detailTilt -= .65 * max(dot(detailTilt, lightDir), 0.) * lightDir;
    relief += detailTilt;
    reliefAmount += .6 * uWrinkles;
    wrinkleDepth = clamp(5. * detailDepth / max(depthSum, 1e-4), 0., 1.);
  }

  if (uFolds > 0.) {
    vec2 foldCount = max(uFoldCount, vec2(1.));
    vec2 foldNoise = .003 * warpNoise * foldCount;
    vec2 uv = sheet01 + .03 * crumpleFlow * uSize / sheetSize;
    vec2 slope, dark, lift;
    getFolds(uv, vec2(1.), foldCount, foldNoise, 1. / sheetSize, slope, dark, lift);
    foldSlope = uFolds * slope;
    reliefAmount += uFolds;
    vec2 ink = mix(vec2(.96), vec2(1.), dark);
    float flatness = dark.x * dark.y;
    foldInk *= mix(1., ink.x * ink.y * mix(.5, .3, flatness), uFolds);
    foldDepth = uFolds * (lift.y * foldLightDir.y - lift.x * foldLightDir.x);
  }

  float weaveDark = 0.;
  if (uWeave > 0.) {
    vec2 t = warped / max(uWeaveSize, 1.);
    float e = .12;
    float h = weaveHeight(t);
    vec2 grad = vec2(
      weaveHeight(t + vec2(e, 0.)) - weaveHeight(t - vec2(e, 0.)),
      weaveHeight(t + vec2(0., e)) - weaveHeight(t - vec2(0., e))
    ) / (2. * e);
    relief += .3 * uWeave * grad;
    reliefAmount += .5 * uWeave;
    vec2 cell = floor(t);
    float slub = hash21(vec2(cell.x * 1.7, 0.)) * hash21(vec2(0., cell.y * 1.3));
    weaveDark = uWeave * ((1. - smoothstep(0., .4, h)) * mix(.4, .6, uWeaveOpen) + .1 * (slub - .25));
  }

  vec2 contentUv = sheetUv;
  float curlShade = 0.;
  if (uCurl > .5) {
    float radius = uCurl;
    for (int s = 0; s < 2; s++) {
      float y = s == 0 ? px.y - uInset.y : uResolution.y - uInset.y - px.y;
      float side = s == 0 ? 1. : -1.;
      if (y < 2. * radius) {
        float q = (y - radius) / radius;
        relief += vec2(0., side * q * 1.2);
        reliefAmount += .4;
        float theta = asin(clamp(q, -1., 1.));
        float rolled = 2. * radius - radius * (PI * .5 - theta);
        contentUv.y = (s == 0 ? rolled + uInset.y : uResolution.y - uInset.y - rolled) / uResolution.y;
        curlShade += (1. - smoothstep(-1., -.25, q)) * .4 + smoothstep(.75, 1., q) * .3;
      } else {
        curlShade += (1. - smoothstep(2. * radius, 2.7 * radius, y)) * .22;
      }
    }
  }

  float unlit = cos(grazing);
  float lit = unlit;
  float pattern = 0.;
  float shade = 0.;
  float sheen = 0.;
  if (reliefAmount > 0.) {
    float slope = clamp(dot(relief, lightDir) + dot(foldSlope, foldLightDir), -1.2, 1.2);
    lit = max(cos(slope + grazing), 0.);
    shade = (lit - unlit) * foldInk * lightPower;
    if (lamp > .001) {
      float raking = clamp(dot(relief + foldSlope, lampDir) * 1.8, -1.4, 1.4);
      float lampShade = (max(cos(raking + 1.05), 0.) - cos(1.05)) * foldInk;
      shade = mix(shade, lampShade * 1.6, lamp);
      sheen = lamp * max(-lampShade, 0.);
    }
    pattern += .35 * clamp(reliefAmount, 0., 1.) * unlit * foldInk * lightPower + shade;
  }

  patternUV += .04 * crumpleFlow;
  vec2 seedShift = floor(fract(uSeed * vec2(.7548776662, .5698402909)) * 50.) / 50.;
  float roughness = 0.;
  float fiber = 0.;
  float drops = 0.;
  if (uRoughness > 0.) {
    roughness = uRoughness * getRoughness(1000. * patternUV, lightDir, seedShift, basePixel);
  }
  if (uFiber > 0.) {
    fiber = uFiber * getFiber(50. * patternUV, seedShift, basePixel);
  }
  if (uDrops > 0.) {
    drops = uDrops * getDrops(patternUV * 10., seedShift);
  }
  float grain = roughness + fiber + weaveDark + curlShade;
  pattern = clamp(pattern + grain, 0., 1.);

  float burn = 0.;
  if (uBurn > 0.) {
    vec2 edge = min(px - uInset, uResolution - uInset - px) / uSize;
    float e = min(edge.x, edge.y)
      + .07 * (smoothNoise(patternUV * .35 + .3).x - .5)
      + .03 * (smoothNoise(patternUV * 1.7 + .7).y - .5);
    burn = uBurn * (1. - smoothstep(0., .2, e));
  }

  if (uMode == 3) {
    float surface = 1.2 * shade + .7 * (grain - .14 * uFiber - .05 * uRoughness) + .5 * drops + .8 * burn;
    float dark = (surface - .3 * sheen) * uStrength;
    float aDark = clamp(dark, 0., 1.);
    float aLight = clamp(-dark, 0., 1.) * .8;
    vec3 rgb = uColorShadow.rgb * aDark + vec3(1.) * aLight;
    float alpha = aDark + aLight;
    rgb += uColorPaper.rgb * uTint * (1. - alpha);
    alpha += uTint * (1. - alpha);
    fragColor = vec4(rgb, alpha);
    return;
  }

  vec3 backColor = uColorBack.rgb * uColorBack.a;
  float backOpacity = uColorBack.a;
  vec3 baseColor = uColorPaper.rgb * uColorPaper.a;
  float baseOpacity = uColorPaper.a;
  vec3 shadowColor = uColorShadow.rgb * uColorShadow.a;
  float shadowOpacity = uColorShadow.a;

  vec3 color = shadowColor * pattern;
  float opacity = shadowOpacity * pattern;
  color += baseColor * (1. - opacity);
  opacity += baseOpacity * (1. - opacity);

  if (uMode == 1 || uMode == 2) {
    float notClipped = uClip > .5 ? .1 : 1.;
    vec2 imageCenteredUV = ((uMode == 1 ? sheet01 : contentUv) - .5) * uImageScale;
    float edgeDist = 2. * max(abs(sheetUv.x - .5), abs(sheetUv.y - .5));
    float wrinkleDistortion = mix(.38, .0175, smoothstep(0., 1., edgeDist));
    float scaleDistortion = .15 * uCrumples * (crumpleDepth - .5)
      + wrinkleDistortion * uWrinkles * (wrinkleDepth - .5)
      + .05 * foldDepth;
    vec2 linearDistortion = notClipped * .002 * lightDir * drops;
    float radialDistortion = notClipped * .02 * (roughness + fiber);
    vec2 centeredUV = imageCenteredUV * (1. - uDistortion * scaleDistortion);
    centeredUV -= uDistortion * linearDistortion;
    vec2 imageUV = .5 + centeredUV * (1. - abs(uDistortion) * radialDistortion * dot(centeredUV, centeredUV));

    float frame = getUvFrame(imageUV);
    vec4 image = texture(uImage, clamp(imageUV, 0., 1.));
    image.rgb /= max(image.a, .0001);
    frame *= image.a;

    float maxC = max(max(image.r, image.g), image.b);
    float minC = min(min(image.r, image.g), image.b);
    float sat = maxC > 0. ? (maxC - minC) / maxC : 0.;
    float midC = image.r + image.g + image.b - maxC - minC;
    float secondaryness = maxC > minC ? (midC - minC) / (maxC - minC) : 0.;
    float satDampen = sat * (1. - .5 * secondaryness);
    float darkDampen = 1. - dot(vec3(.2126, .7152, .0722), image.rgb);
    float dampen = mix(0., .7, uBlending) * max(satDampen, darkDampen);

    vec3 paper = vec3(1.) - opacity + color;
    vec3 pic = image.rgb * paper * uBlending + image.rgb * (1. - uBlending);
    pic = mix(pic, vec3(1.), (uMode == 2 ? .25 : .6) * pow(dampen, 2. + 3. * pattern));

    color = mix(color, pic, frame);
    opacity = frame + opacity * (1. - frame);

    if (uClip > .5) {
      color *= frame;
      opacity *= frame;
    }
  }

  color += sheen * .12 * opacity;
  color *= mix(vec3(1.), .5 * uColorShadow.rgb, drops * shadowOpacity);
  color = mix(color, uColorShadow.rgb * .28 * opacity, burn);

  float margin = max(uInset.x, uInset.y);
  if (margin > .5) {
    vec2 inner = min(px - uInset, uResolution - uInset - px);
    float inside = clamp(min(inner.x, inner.y) + .5, 0., 1.);
    vec2 shadowPx = px - vec2(0., .1 * margin);
    vec2 shadowInner = min(shadowPx - uInset, uResolution - uInset - shadowPx);
    float away = max(-min(shadowInner.x, shadowInner.y), 0.);
    float drop = (1. - inside) * .3 * exp(-away / max(.3 * margin, 1.));
    color *= inside;
    opacity *= inside;
    opacity += drop * (1. - opacity);
  }

  color += backColor * (1. - opacity);
  opacity += backOpacity * (1. - opacity);
  fragColor = vec4(color, opacity);
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

type Rgba = [number, number, number, number];

const colorProbe: { ctx: CanvasRenderingContext2D | null } = { ctx: null };

function parseColor(value: string, fallback: Rgba): Rgba {
  if (typeof document === "undefined") return fallback;
  if (!colorProbe.ctx) {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    colorProbe.ctx = canvas.getContext("2d", { willReadFrequently: true });
  }
  const ctx = colorProbe.ctx;
  if (!ctx) return fallback;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = "#000";
  ctx.fillStyle = value;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
  if (a === 0) return [0, 0, 0, 0];
  return [r / 255, g / 255, b / 255, a / 255];
}

export function buildCanvasNoise(size = 128): Uint8Array {
  const data = new Uint8Array(size * size * 4);
  let state = 0x9e3779b9;
  for (let i = 0; i < data.length; i++) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    data[i] = (state >>> 0) & 255;
  }
  return data;
}

export function resolveCanvasOptions(options: CanvasOptions): Required<CanvasOptions> {
  const preset = options.preset ?? DEFAULTS.preset;
  const base: Required<CanvasOptions> = {
    ...DEFAULTS,
    ...(CANVAS_PRESETS[preset] ?? CANVAS_PRESETS.paper),
    preset,
  };
  return { ...base, ...resolveOptions(base, options) };
}

export function createCanvas(
  elements: CanvasElements,
  options: CanvasOptions = {},
): CanvasInstance | null {
  try {
    return initializeCanvas(elements, options);
  } catch (error) {
    console.error("Canvas initialization failed:", error);
    return null;
  }
}

function initializeCanvas(
  elements: CanvasElements,
  options: CanvasOptions,
): CanvasInstance | null {
  let config = resolveCanvasOptions(options);
  let colors = resolveColors();

  function resolveColors() {
    return {
      back: parseColor(config.back, [0, 0, 0, 0]),
      paper: parseColor(config.color, [1, 1, 1, 1]),
      shadow: parseColor(config.shadow, [0.7, 0.7, 0.7, 1]),
    };
  }
  let raw: CanvasOptions = { ...options };
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
  let pageDirty = false;
  let textureUploadErrorLogged = false;
  let dirty = true;
  let wake = () => {};

  if (htmlInCanvas) {
    paintable!.onpaint = () => {
      try {
        sourceCtx!.reset();
        drawHtmlInCanvas(source!, sourceCtx!, content!, true);
        pageDirty = true;
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
  const fragmentShader = compile(gl.FRAGMENT_SHADER, FRAG);
  const program = gl.createProgram()!;
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || "Unknown program link error";
    gl.deleteProgram(program);
    throw new Error(message);
  }

  const uniforms: Record<string, WebGLUniformLocation> = {};
  const uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < uniformCount; i++) {
    const info = gl.getActiveUniform(program, i)!;
    uniforms[info.name] = gl.getUniformLocation(program, info.name)!;
  }

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const noiseTexture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, noiseTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    128,
    128,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    buildCanvasNoise(128),
  );

  const imageTexture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, imageTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([0, 0, 0, 0]),
  );

  let imageReady = false;
  let imageAspect = 1;
  let imageSrc = "";

  function loadImage() {
    const next = config.src;
    if (next === imageSrc) return;
    imageSrc = next;
    imageReady = false;
    dirty = true;
    if (!next) return;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.onload = () => {
      if (destroyed || imageSrc !== next) return;
      imageAspect = img.naturalWidth / Math.max(img.naturalHeight, 1);
      try {
        gl!.bindTexture(gl!.TEXTURE_2D, imageTexture);
        gl!.pixelStorei(gl!.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
        gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, gl!.RGBA, gl!.UNSIGNED_BYTE, img);
        gl!.pixelStorei(gl!.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        imageReady = true;
      } catch (error) {
        console.warn("Canvas could not use its image:", error);
      }
      dirty = true;
      wake();
    };
    img.onerror = () => {
      if (!destroyed) console.warn("Canvas could not load its image:", next);
    };
    img.src = next;
  }

  let dpr = 1;

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
    dirty = true;
    return changed;
  }

  syncCanvasSize();
  loadImage();

  function pageMode() {
    return htmlInCanvas && config.layer === "page";
  }

  function mode(): number {
    if (pageMode()) return 2;
    if (imageReady) return 1;
    if (config.layer !== "background") return 3;
    return 0;
  }

  function uploadPage() {
    if (!pageDirty) return;
    pageDirty = false;
    if (!pageMode()) return;
    try {
      gl!.bindTexture(gl!.TEXTURE_2D, imageTexture);
      gl!.pixelStorei(gl!.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl!.texImage2D(gl!.TEXTURE_2D, 0, gl!.RGBA, gl!.RGBA, gl!.UNSIGNED_BYTE, source!);
      gl!.pixelStorei(gl!.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      textureUploadErrorLogged = false;
    } catch (error) {
      if (!textureUploadErrorLogged) {
        textureUploadErrorLogged = true;
        console.warn("Canvas could not upload its content texture:", error);
      }
    }
  }

  const lamp = { x: 0, y: 0, tx: 0, ty: 0, presence: 0, over: false };

  const overlayFixed =
    !content &&
    output.parentElement !== null &&
    getComputedStyle(output.parentElement).position === "fixed";

  function scrollOffset(): [number, number] {
    if (mode() === 1 || mode() === 2) return [0, 0];
    if (content) return [content.scrollLeft, content.scrollTop];
    if (overlayFixed) return [window.scrollX, window.scrollY];
    return [0, 0];
  }

  function sheetInset(): [number, number] {
    if (mode() === 3) return [0, 0];
    return [
      Math.min(Math.max(config.insetX, 0) * dpr, output.width * 0.45),
      Math.min(Math.max(config.insetY, 0) * dpr, output.height * 0.45),
    ];
  }

  function imageScale(): [number, number] {
    if (mode() !== 1) return [1, 1];
    const [insetX, insetY] = sheetInset();
    const sheetAspect =
      Math.max(output.width - 2 * insetX, 1) / Math.max(output.height - 2 * insetY, 1);
    const ratio = imageAspect / sheetAspect;
    if (config.fit === "contain") {
      return ratio > 1 ? [1, ratio] : [1 / ratio, 1];
    }
    return ratio > 1 ? [1 / ratio, 1] : [1, ratio];
  }

  function render() {
    uploadPage();
    const u = uniforms;
    gl!.useProgram(program);
    gl!.disable(gl!.BLEND);
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, noiseTexture);
    gl!.uniform1i(u.uNoise, 0);
    gl!.activeTexture(gl!.TEXTURE1);
    gl!.bindTexture(gl!.TEXTURE_2D, imageTexture);
    gl!.uniform1i(u.uImage, 1);

    const size = Math.max(config.size, 50) * dpr;
    gl!.uniform2f(u.uResolution, output.width, output.height);
    const [scrollX, scrollY] = scrollOffset();
    gl!.uniform2f(u.uScroll, scrollX * dpr, scrollY * dpr);
    const [insetX, insetY] = sheetInset();
    gl!.uniform2f(u.uInset, insetX, insetY);
    gl!.uniform1f(u.uSize, size);
    gl!.uniform1i(u.uMode, mode());
    const [sx, sy] = imageScale();
    gl!.uniform2f(u.uImageScale, sx, sy);
    const { back, paper, shadow } = colors;
    gl!.uniform4f(u.uColorBack, back[0], back[1], back[2], back[3]);
    gl!.uniform4f(u.uColorPaper, paper[0], paper[1], paper[2], paper[3]);
    gl!.uniform4f(u.uColorShadow, shadow[0], shadow[1], shadow[2], shadow[3]);
    gl!.uniform1f(u.uBlending, clamp(config.blending, 0, 1));
    gl!.uniform1f(u.uDistortion, clamp(config.distortion, -1, 1));
    gl!.uniform1f(u.uClip, config.clip && mode() === 1 ? 1 : 0);
    gl!.uniform1f(u.uAngle, config.angle);
    gl!.uniform1f(u.uSeed, config.seed);
    gl!.uniform1f(u.uRoughness, clamp(config.roughness, 0, 1));
    gl!.uniform1f(u.uRoughnessSize, clamp(config.roughnessSize, 0, 1));
    gl!.uniform1f(u.uRoughnessRows, clamp(config.roughnessRows, 0, 1));
    gl!.uniform1f(u.uFiber, clamp(config.fiber, 0, 1));
    gl!.uniform1f(u.uFiberSize, clamp(config.fiberSize, 0, 1));
    gl!.uniform1f(u.uFolds, clamp(config.folds, 0, 1));
    gl!.uniform2f(
      u.uFoldCount,
      Math.max(config.foldColumns, 1),
      Math.max(config.foldRows, 1),
    );
    gl!.uniform1f(u.uWrinkles, clamp(config.wrinkles, 0, 1));
    gl!.uniform1f(u.uWrinkleSize, clamp(config.wrinkleSize, 0, 1));
    gl!.uniform1f(u.uCrumples, clamp(config.crumples, 0, 1));
    gl!.uniform1f(u.uCrumpleCount, clamp(config.crumpleCount, 2, MAX_CRUMPLES));
    gl!.uniform1f(u.uDrops, clamp(config.stains, 0, 1));
    gl!.uniform1f(u.uWeave, clamp(config.weave, 0, 1));
    gl!.uniform1f(u.uWeaveSize, Math.max(config.weaveSize, 1) * dpr);
    gl!.uniform1f(u.uWeaveOpen, clamp(config.weaveOpen, 0, 1));
    gl!.uniform1f(u.uSlub, clamp(config.slub, 0, 1));
    gl!.uniform1f(u.uCurl, Math.max(config.curl, 0) * dpr);
    gl!.uniform1f(u.uBurn, clamp(config.burn, 0, 1));
    gl!.uniform4f(
      u.uLamp,
      lamp.x * dpr,
      lamp.y * dpr,
      Math.max(config.radius, 20) * dpr,
      lamp.presence * clamp(config.glow, 0, 1),
    );
    gl!.uniform1f(u.uStrength, clamp(config.strength, 0, 1));
    gl!.uniform1f(u.uTint, clamp(config.tint, 0, 1));

    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
    gl!.viewport(0, 0, output.width, output.height);
    gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
    dirty = false;
  }

  let raf = 0;
  let lastTime = performance.now();
  let running = false;
  let visible = true;

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reducedMotion = motionQuery.matches;

  function step(delta: number): boolean {
    const follow = reducedMotion ? 1 : 1 - Math.exp(-delta * 9);
    const fade = reducedMotion ? 1 : 1 - Math.exp(-delta * 5);
    lamp.x += (lamp.tx - lamp.x) * follow;
    lamp.y += (lamp.ty - lamp.y) * follow;
    const target = config.interactive && lamp.over ? 1 : 0;
    lamp.presence += (target - lamp.presence) * fade;
    const moving =
      Math.abs(lamp.tx - lamp.x) > 0.3 ||
      Math.abs(lamp.ty - lamp.y) > 0.3 ||
      Math.abs(target - lamp.presence) > 0.002;
    if (!moving) {
      lamp.x = lamp.tx;
      lamp.y = lamp.ty;
      lamp.presence = target;
    }
    return moving;
  }

  function frame(time: number) {
    if (destroyed) return;
    if (!visible) {
      running = false;
      return;
    }
    const delta = Math.min((time - lastTime) / 1000, 1 / 20);
    lastTime = time;
    const busy = step(delta);
    if (busy || dirty || pageDirty) render();
    if (!busy && !dirty && !pageDirty) {
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
  start();

  function onMotionChange() {
    reducedMotion = motionQuery.matches;
    dirty = true;
    start();
  }
  motionQuery.addEventListener("change", onMotionChange);

  let outputRect = output.getBoundingClientRect();
  const refreshOutputRect = () => {
    outputRect = output.getBoundingClientRect();
  };
  const onScroll = () => {
    refreshOutputRect();
    dirty = true;
    start();
  };

  const observer = createCanvasResizeObserver(() => {
    refreshOutputRect();
    syncCanvasSize();
    start();
  });
  observer.observe(output);
  if (content) observer.observe(content);
  window.addEventListener("resize", refreshOutputRect, { passive: true });
  window.addEventListener("scroll", onScroll, {
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
    const inside =
      x >= 0 && y >= 0 && x <= outputRect.width && y <= outputRect.height;
    return { x, y, inside };
  }

  function onPointerMove(event: PointerEvent) {
    const { x, y, inside } = localPoint(event);
    if (inside) {
      if (lamp.presence < 0.01) {
        lamp.x = x;
        lamp.y = y;
      }
      lamp.tx = x;
      lamp.ty = y;
    }
    lamp.over = inside;
    start();
  }

  function onPointerLeave() {
    lamp.over = false;
    start();
  }

  window.addEventListener("pointermove", onPointerMove, { passive: true });
  document.documentElement.addEventListener("pointerleave", onPointerLeave, {
    passive: true,
  });

  return {
    setOptions(next) {
      const keys = new Set([...Object.keys(raw), ...Object.keys(next)]);
      let changed = false;
      for (const key of keys) {
        const a = raw[key as keyof CanvasOptions];
        const b = next[key as keyof CanvasOptions];
        if (a !== b) {
          changed = true;
          break;
        }
      }
      raw = next;
      if (!changed) return;
      config = resolveCanvasOptions(next);
      colors = resolveColors();
      loadImage();
      dirty = true;
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
      observer.disconnect();
      window.removeEventListener("resize", refreshOutputRect);
      window.removeEventListener("scroll", onScroll, true);
      intersection.disconnect();
      document.removeEventListener("visibilitychange", syncVisibility);
      motionQuery.removeEventListener("change", onMotionChange);
      window.removeEventListener("pointermove", onPointerMove);
      document.documentElement.removeEventListener("pointerleave", onPointerLeave);
      gl!.deleteTexture(noiseTexture);
      gl!.deleteTexture(imageTexture);
      gl!.deleteProgram(program);
      gl!.deleteShader(vertexShader);
      gl!.deleteShader(fragmentShader);
      gl!.deleteBuffer(quad);
      if (htmlInCanvas) paintable!.onpaint = null;
    },
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
