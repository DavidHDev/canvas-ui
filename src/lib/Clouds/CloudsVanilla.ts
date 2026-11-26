import { getCanvasPixelRatio, createCanvasResizeObserver } from "../canvas-viewport";
import { isHtmlInCanvasBlocked, prepareHtmlInCanvas, drawHtmlInCanvas } from "../html-in-canvas";
import { createRectCache } from "../rect-cache";
import { resolveOptions } from "../options";

export type CloudsLayer = "page" | "background" | "foreground";
export type CloudsColor = [number, number, number] | "auto";

export interface CloudsOptions {
  /** "page" draws the live content into the effect so the mist can fog, blur and bend it while text stays legible (html-in-canvas; elsewhere it falls back to "foreground"). "background" sits behind the content, "foreground" over it. */
  layer?: CloudsLayer;
  scale?: number;
  speed?: number;
  /** Direction the clouds travel in degrees. 0 points right, 90 up. */
  direction?: number;
  cover?: number;
  density?: number;
  /** Edge feather (0 to 1). 1 is soft mist, lower values give clouds a defined outline. */
  softness?: number;
  /** Rounded, cauliflower-like lumps carved into the cloud shapes (0 to 1). */
  billow?: number;
  shading?: number;
  color?: CloudsColor;
  /** Color of the slopes facing the light. */
  lightColor?: CloudsColor;
  /** Color of the slopes facing away from the light. */
  shadeColor?: CloudsColor;
  opacity?: number;
  /** How much text and fine detail cut through the clouds with layer "page" (0 to 1). */
  legibility?: number;
  shadow?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  shadowSoftness?: number;
  wind?: number;
  windRadius?: number;
  /** Seconds for half of a cleared trail to close again. */
  linger?: number;
  refraction?: number;
  fogBlur?: number;
  quality?: number;
}

export interface CloudsElements {
  output: HTMLCanvasElement;
  source?: HTMLCanvasElement | null;
  content?: HTMLElement | null;
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

type Rgb = [number, number, number];

const DEFAULTS: Required<CloudsOptions> = {
  layer: "page",
  scale: 1,
  speed: 0.6,
  direction: 225,
  cover: 0.4,
  density: 2.5,
  softness: 1,
  billow: 0,
  shading: 0.5,
  color: "auto",
  lightColor: "auto",
  shadeColor: "auto",
  opacity: 0.64,
  legibility: 0.85,
  shadow: 0.06,
  shadowOffsetX: 200,
  shadowOffsetY: -10,
  shadowSoftness: 1,
  wind: 0.6,
  windRadius: 350,
  linger: 0.7,
  refraction: 0,
  fogBlur: 0,
  quality: 1,
};

const REST = 128 / 255;
const MARGIN = 80;

const VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
void main () {
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FIELD_FRAG = `#version 300 es
precision highp float;
out vec4 outColor;
uniform vec2 uResolution;
uniform vec2 uOffset;
uniform vec2 uSpan;
uniform vec2 uPad;
uniform float uAspect;
uniform vec2 uDrift;
uniform float uScale;
uniform float uCover;
uniform float uDensity;
uniform float uBillow;

const mat2 m = mat2(1.6, 1.2, -1.2, 1.6);

vec2 hash (vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
}

float noise (vec2 p) {
  const float K1 = 0.366025404;
  const float K2 = 0.211324865;
  vec2 i = floor(p + (p.x + p.y) * K1);
  vec2 a = p - i + (i.x + i.y) * K2;
  vec2 o = (a.x > a.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec2 b = a - o + K2;
  vec2 c = a - 1.0 + 2.0 * K2;
  vec3 h = max(0.5 - vec3(dot(a, a), dot(b, b), dot(c, c)), 0.0);
  vec3 n = h * h * h * h
    * vec3(dot(a, hash(i)), dot(b, hash(i + o)), dot(c, hash(i + 1.0)));
  return dot(n, vec3(70.0));
}

float fbm (vec2 n) {
  float total = 0.0;
  float amplitude = 0.1;
  for (int i = 0; i < 7; i++) {
    total += noise(n) * amplitude;
    n = m * n;
    amplitude *= 0.4;
  }
  return total;
}

float cells (vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float blend = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 r = g + 0.5 + 0.5 * hash(i + g) - f;
      blend += exp(-10.0 * dot(r, r));
    }
  }
  return sqrt(max(-log(blend / 1.6) / 10.0, 0.0));
}

void main () {
  vec2 p = gl_FragCoord.xy / uResolution * uSpan - uPad + uOffset;
  vec2 asp = vec2(uAspect, 1.0);
  float q = fbm(p * asp * uScale * 0.5);
  float rough = 0.6 - 0.22 * uBillow;

  float r = 0.0;
  vec2 uv = p * asp * uScale;
  uv -= q - uDrift;
  float weight = 0.8;
  for (int i = 0; i < 8; i++) {
    r += abs(weight * noise(uv));
    uv = m * uv + uDrift;
    weight *= rough + 0.1;
  }

  float f = 0.0;
  uv = p * asp * uScale;
  uv -= q - uDrift;
  weight = 0.7;
  for (int i = 0; i < 8; i++) {
    f += weight * noise(uv);
    uv = m * uv + uDrift;
    weight *= rough;
  }
  f *= r + f;

  float c = 0.0;
  vec2 t2 = uDrift * 2.0;
  uv = p * asp * uScale * 2.0;
  uv -= q - t2;
  weight = 0.4;
  for (int i = 0; i < 7; i++) {
    c += weight * noise(uv);
    uv = m * uv + t2;
    weight *= rough;
  }

  float c1 = 0.0;
  vec2 t3 = uDrift * 3.0;
  uv = p * asp * uScale * 3.0;
  uv -= q - t3;
  weight = 0.4;
  for (int i = 0; i < 7; i++) {
    c1 += abs(weight * noise(uv));
    uv = m * uv + t3;
    weight *= rough;
  }
  c += c1;

  float raw = uCover + uDensity * f * r + c;
  float lumps = 0.5;
  if (uBillow > 0.0) {
    vec2 bp = (p * asp * uScale - q * 1.5 + uDrift) * 2.6;
    lumps = 1.0 - (cells(bp) * 0.6 + cells(bp * 2.1 + 7.3) * 0.28 + cells(bp * 4.3 + 3.1) * 0.12);
    raw += uBillow * (lumps - 0.56) * 1.5;
  }
  outColor = vec4(clamp(raw, 0.0, 1.0), clamp(c, 0.0, 1.0), max(raw, 0.0) / (1.0 + max(raw, 0.0)), lumps);
}`;

const WIND_FRAG = `#version 300 es
precision highp float;
out vec4 outColor;
uniform sampler2D uPrev;
uniform vec2 uResolution;
uniform float uDecay;
uniform float uRelax;
uniform float uFloor;
uniform float uAdvect;
uniform vec2 uA;
uniform vec2 uB;
uniform float uRadius;
uniform float uStrength;
uniform vec2 uPush;
uniform float uPart;

const float REST = ${REST};

void main () {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 asp = vec2(uResolution.x / uResolution.y, 1.0);
  vec2 carried = (texture(uPrev, uv).gb - REST) * 2.0;
  vec4 prev = texture(uPrev, uv - carried * uAdvect / asp);
  float clearing = prev.r * uDecay;
  vec2 shove = (prev.gb - REST) * 2.0 * uRelax;

  vec2 p = uv * asp;
  vec2 a = uA * asp;
  vec2 b = uB * asp;
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  vec2 away = pa - ba * h;
  float span = length(away);
  float d = span / max(uRadius, 1e-4);
  float stamp = exp(-d * d * 3.0);
  clearing += stamp * uStrength;
  shove += uPush * stamp + (away / max(span, 1e-5)) * d * exp(-d * d * 2.0) * uPart;

  clearing = max(clearing - uFloor, 0.0);
  shove -= sign(shove) * min(abs(shove), vec2(uFloor * 2.0));
  outColor = vec4(
    clamp(clearing, 0.0, 1.0),
    clamp(shove * 0.5 + REST, 0.0, 1.0),
    1.0
  );
}`;

const INK_FRAG = `#version 300 es
precision highp float;
out vec4 outColor;
uniform sampler2D uContent;
uniform vec2 uResolution;
uniform vec2 uTexel;
uniform float uFine;

float tone (vec2 p) {
  return dot(textureLod(uContent, p, uFine).rgb, vec3(0.299, 0.587, 0.114));
}

void main () {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec2 across = vec2(uTexel.x, 0.0);
  vec2 down = vec2(0.0, uTexel.y);
  float sx = 0.0;
  float sy = 0.0;
  for (int y = 0; y < 6; y++) {
    for (int x = 0; x < 6; x++) {
      vec2 p = uv + (vec2(float(x), float(y)) - 2.5) * 1.3333 * uTexel;
      float gx = tone(p + across) - tone(p - across);
      float gy = tone(p + down) - tone(p - down);
      sx += gx * gx * gx * gx;
      sy += gy * gy * gy * gy;
    }
  }
  outColor = vec4(vec3(pow(min(sx, sy) / 36.0, 0.25)), 1.0);
}`;

const COMPOSITE_FRAG = `#version 300 es
precision highp float;
out vec4 outColor;
uniform sampler2D uField;
uniform sampler2D uContent;
uniform sampler2D uWind;
uniform sampler2D uInk;
uniform vec2 uResolution;
uniform vec2 uContentScale;
uniform vec3 uBase;
uniform vec3 uLight;
uniform vec3 uShade;
uniform float uShading;
uniform float uOpacity;
uniform float uShadow;
uniform vec2 uShadowShift;
uniform float uShadowLod;
uniform float uWindAmt;
uniform vec2 uDisp;
uniform float uRefraction;
uniform float uFogBlur;
uniform float uHasContent;
uniform vec2 uEdge;
uniform vec2 uLightStep;
uniform float uLodBias;
uniform float uLegibility;
uniform float uPixelRatio;
uniform float uBillow;
uniform vec2 uSpan;
uniform vec2 uPad;

const float REST = ${REST};

vec4 cloud (vec2 uv, float lod) {
  return textureLod(uField, (uv + uPad) / uSpan, lod);
}

float height (vec2 uv, vec2 shift, float lod) {
  float packed = min(cloud(uv - shift, max(lod + uLodBias, 0.0)).b, 0.96);
  return packed / (1.0 - packed) - texture(uWind, uv).r * uWindAmt * 2.0;
}

float form (vec2 uv, vec2 shift, float lod) {
  return cloud(uv - shift, max(lod + uLodBias, 0.0)).a;
}

vec3 cubic (vec2 uv, float level) {
  vec2 size = max(floor(vec2(textureSize(uContent, 0)) / exp2(level)), vec2(1.0));
  vec2 st = uv * size - 0.5;
  vec2 f = fract(st);
  vec2 corner = st - f + 0.5;
  vec2 w0 = (1.0 - f) * (1.0 - f) * (1.0 - f) / 6.0;
  vec2 w1 = (3.0 * f * f * f - 6.0 * f * f + 4.0) / 6.0;
  vec2 w3 = f * f * f / 6.0;
  vec2 g0 = w0 + w1;
  vec2 g1 = 1.0 - g0;
  vec2 p0 = (corner + w1 / g0 - 1.0) / size;
  vec2 p1 = (corner + w3 / g1 + 1.0) / size;
  return g0.y * (g0.x * textureLod(uContent, vec2(p0.x, p0.y), level).rgb
      + g1.x * textureLod(uContent, vec2(p1.x, p0.y), level).rgb)
    + g1.y * (g0.x * textureLod(uContent, vec2(p0.x, p1.y), level).rgb
      + g1.x * textureLod(uContent, vec2(p1.x, p1.y), level).rgb);
}

vec3 page (vec2 uv, float lod) {
  vec3 color = textureLod(uContent, uv, lod).rgb;
  if (lod > 0.01) {
    float lower = floor(lod);
    vec3 soft = mix(cubic(uv, lower), cubic(uv, lower + 1.0), lod - lower);
    color = mix(color, soft, min(lod, 1.0));
  }
  return color;
}

void main () {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec4 gust = texture(uWind, uv);
  vec2 rim = min(uv, 1.0 - uv);
  vec2 shift = (gust.gb - REST) * 2.0 * uDisp
    * smoothstep(0.0, 0.1, rim.x) * smoothstep(0.0, 0.1, rim.y);
  vec3 field = cloud(uv - shift, 0.0).rgb;
  float cov = field.r - gust.r * uWindAmt * (0.7 + 0.6 * field.g);
  float mist = smoothstep(uEdge.x, uEdge.y, cov);
  float cloudA = mist * uOpacity;

  float fine = height(uv, shift, 1.5);
  float broad = height(uv, shift, 4.5);
  float relief = (fine - height(uv + uLightStep * 8.0, shift, 1.5)) * 0.7
    + (height(uv, shift, 3.0) - height(uv + uLightStep * 24.0, shift, 3.0)) * 1.0
    + (broad - height(uv + uLightStep * 72.0, shift, 4.5)) * 1.3
    + (fine - broad) * 0.35;
  float lit = relief * uShading * 2.2;
  lit /= 1.0 + abs(lit);
  vec3 cloudRGB = mix(uBase, uShade, max(-lit, 0.0));
  cloudRGB = mix(cloudRGB, uLight, max(lit, 0.0));
  if (uBillow > 0.0) {
    float puff = form(uv, shift, 1.2);
    float crease = ((puff - form(uv + uLightStep * 7.0, shift, 1.2)) * 5.0
      + (puff - form(uv, shift, 3.0)) * 2.4) * uBillow * uShading * 2.2;
    crease /= 1.0 + abs(crease);
    cloudRGB = mix(cloudRGB, uShade, max(-crease, 0.0) * 0.7);
    cloudRGB = mix(cloudRGB, uLight, max(crease, 0.0) * 0.7);
  }

  vec2 sUv = uv + uShadowShift;
  float s = cloud(sUv - shift, uShadowLod).r
    - texture(uWind, sUv).r * uWindAmt;
  float shadowA = smoothstep(0.35, 1.0, s) * uShadow * (1.0 - mist);

  float a;
  vec3 rgb;
  if (uHasContent > 0.5) {
    vec2 cUv = vec2(uv.x, 1.0 - uv.y) * uContentScale;
    vec2 reach = 10.0 * uContentScale / (uResolution / uPixelRatio);
    float ink = 0.0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        float trace = texture(uInk, cUv + vec2(float(x), float(y)) * reach).r;
        ink += smoothstep(0.09, 0.17, trace)
          * (2.0 - abs(float(x))) * (2.0 - abs(float(y)));
      }
    }
    float keep = smoothstep(0.0, 0.75, ink / 16.0) * uLegibility;
    float veil = cloudA * (1.0 - keep);

    vec2 e = vec2(8.0) / uResolution;
    float gx = cloud(uv - shift + vec2(e.x, 0.0), 0.0).r
      - cloud(uv - shift - vec2(e.x, 0.0), 0.0).r;
    float gy = cloud(uv - shift + vec2(0.0, e.y), 0.0).r
      - cloud(uv - shift - vec2(0.0, e.y), 0.0).r;
    vec2 rUv = uv + vec2(gx, gy) * uRefraction * mist * (1.0 - keep);
    vec3 fogged = page(
      vec2(rUv.x, 1.0 - rUv.y) * uContentScale,
      mist * uFogBlur * 5.0 * (1.0 - keep)
    );
    vec3 layer = mix(fogged, cloudRGB, veil) * (1.0 - shadowA);
    float aF = smoothstep(0.02, 0.2, mist);
    a = aF + shadowA * (1.0 - aF);
    rgb = layer * aF;
  } else {
    a = cloudA + shadowA * (1.0 - cloudA);
    rgb = cloudRGB * cloudA;
  }
  outColor = vec4(rgb, a);
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

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function sameValue(a: unknown, b: unknown) {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, i) => item === b[i]);
  }
  return a === b;
}

export function createClouds(
  elements: CloudsElements,
  options: CloudsOptions = {},
): CloudsInstance | null {
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

  function compile(type: number, text: string): WebGLShader {
    const shader = gl!.createShader(type)!;
    gl!.shaderSource(shader, text);
    gl!.compileShader(shader);
    if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) {
      console.error("Clouds shader error:", gl!.getShaderInfoLog(shader));
    }
    return shader;
  }

  function link(fragSource: string) {
    const vs = compile(gl!.VERTEX_SHADER, VERT);
    const fs = compile(gl!.FRAGMENT_SHADER, fragSource);
    const program = gl!.createProgram()!;
    gl!.attachShader(program, vs);
    gl!.attachShader(program, fs);
    gl!.linkProgram(program);
    const uniforms: Record<string, WebGLUniformLocation> = {};
    const count = gl!.getProgramParameter(program, gl!.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const info = gl!.getActiveUniform(program, i)!;
      uniforms[info.name] = gl!.getUniformLocation(program, info.name)!;
    }
    return { program, vs, fs, uniforms };
  }

  const field = link(FIELD_FRAG);
  const windPass = link(WIND_FRAG);
  const inkPass = link(INK_FRAG);
  const composite = link(COMPOSITE_FRAG);

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  const fieldTexture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, fieldTexture);
  gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_MIN_FILTER,
    gl.LINEAR_MIPMAP_LINEAR,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);

  const contentTexture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, contentTexture);
  gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_MIN_FILTER,
    gl.LINEAR_MIPMAP_LINEAR,
  );
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
    new Uint8Array([0, 0, 0, 255]),
  );
  gl.generateMipmap(gl.TEXTURE_2D);

  const inkTexture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, inkTexture);
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
    new Uint8Array([0, 0, 0, 255]),
  );
  let inkW = 1;
  let inkH = 1;

  function makeWindTexture() {
    const texture = gl!.createTexture()!;
    gl!.bindTexture(gl!.TEXTURE_2D, texture);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
    return texture;
  }
  const windTextures = [makeWindTexture(), makeWindTexture()];
  let windIndex = 0;

  const fbo = gl.createFramebuffer();

  let fieldW = 0;
  let fieldH = 0;
  let windW = 0;
  let windH = 0;
  let contentScaleX = 1;
  let contentScaleY = 1;
  let dpr = 1;

  let baseColor: Rgb = [1, 1, 1];
  let lightColor: Rgb = [1, 1, 1];
  let shadeColor: Rgb = [1, 1, 1];
  const probe = document.createElement("canvas");
  probe.width = probe.height = 1;
  const probeCtx = probe.getContext("2d", { willReadFrequently: true });

  function readBackdrop(): Rgb {
    if (!probeCtx) return [1, 1, 1];
    let el: Element | null = content ?? output.parentElement ?? output;
    while (el) {
      const bg = getComputedStyle(el).backgroundColor;
      if (bg && bg !== "transparent") {
        probeCtx.clearRect(0, 0, 1, 1);
        probeCtx.fillStyle = bg;
        probeCtx.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = probeCtx.getImageData(0, 0, 1, 1).data;
        if (a > 0) return [r / 255, g / 255, b / 255];
      }
      el = el.parentElement;
    }
    return [1, 1, 1];
  }

  function syncBaseColor() {
    baseColor = config.color === "auto" ? readBackdrop() : config.color;
    const [r, g, b] = baseColor;
    const bright = 0.299 * r + 0.587 * g + 0.114 * b > 0.5;
    lightColor =
      config.lightColor !== "auto"
        ? config.lightColor
        : bright
          ? [r + (1 - r) * 0.85, g + (1 - g) * 0.85, b + (1 - b) * 0.85]
          : [r + (0.72 - r) * 0.5, g + (0.79 - g) * 0.5, b + (0.93 - b) * 0.5];
    shadeColor =
      config.shadeColor !== "auto"
        ? config.shadeColor
        : bright
          ? [r * 0.6, g * 0.68, b * 0.82]
          : [r * 0.45, g * 0.47, b * 0.55];
  }

  function fillWind() {
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, fbo);
    gl!.clearColor(0, REST, REST, 1);
    for (const texture of windTextures) {
      gl!.framebufferTexture2D(
        gl!.FRAMEBUFFER,
        gl!.COLOR_ATTACHMENT0,
        gl!.TEXTURE_2D,
        texture,
        0,
      );
      gl!.clear(gl!.COLOR_BUFFER_BIT);
    }
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
    gl!.clearColor(0, 0, 0, 0);
  }

  function syncCanvasSize() {
    const cw = content ? content.clientWidth : output.clientWidth;
    const ch = content ? content.clientHeight : output.clientHeight;
    if (content && cw > 0 && ch > 0) {
      const wpx = `${cw}px`;
      const hpx = `${ch}px`;
      if (output.style.width !== wpx) output.style.width = wpx;
      if (output.style.height !== hpx) output.style.height = hpx;
    }
    dpr = getCanvasPixelRatio(output, gl!);
    const width = Math.max(1, Math.round(output.clientWidth * dpr));
    const height = Math.max(1, Math.round(output.clientHeight * dpr));
    if (output.width !== width || output.height !== height) {
      output.width = width;
      output.height = height;
    }
    contentScaleX = htmlInCanvas
      ? Math.min(1, cw / Math.max(source!.clientWidth, 1))
      : 1;
    contentScaleY = htmlInCanvas
      ? Math.min(1, ch / Math.max(source!.clientHeight, 1))
      : 1;
    const quality = clamp(config.quality, 0.2, 1);
    const cap = 1440 / Math.max(output.clientWidth, 1);
    const q = Math.min(quality, cap);
    const nextW = Math.max(16, Math.round(output.clientWidth * q));
    const nextH = Math.max(16, Math.round(output.clientHeight * q));
    if (nextW !== windW || nextH !== windH) {
      windW = nextW;
      windH = nextH;
      fieldW = Math.max(16, Math.round((output.clientWidth + MARGIN * 2) * q));
      fieldH = Math.max(16, Math.round((output.clientHeight + MARGIN * 2) * q));
      gl!.bindTexture(gl!.TEXTURE_2D, fieldTexture);
      gl!.texImage2D(
        gl!.TEXTURE_2D,
        0,
        gl!.RGBA,
        fieldW,
        fieldH,
        0,
        gl!.RGBA,
        gl!.UNSIGNED_BYTE,
        null,
      );
      gl!.generateMipmap(gl!.TEXTURE_2D);
      for (const texture of windTextures) {
        gl!.bindTexture(gl!.TEXTURE_2D, texture);
        gl!.texImage2D(
          gl!.TEXTURE_2D,
          0,
          floatTargets ? gl!.RGBA16F : gl!.RGBA,
          windW,
          windH,
          0,
          gl!.RGBA,
          floatTargets ? gl!.HALF_FLOAT : gl!.UNSIGNED_BYTE,
          null,
        );
      }
      fillWind();
    }
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
  syncBaseColor();

  function uploadContent() {
    if (!htmlInCanvas || !contentDirty) return;
    contentDirty = false;
    gl!.bindTexture(gl!.TEXTURE_2D, contentTexture);
    gl!.texImage2D(
      gl!.TEXTURE_2D,
      0,
      gl!.RGBA,
      gl!.RGBA,
      gl!.UNSIGNED_BYTE,
      source!,
    );
    gl!.generateMipmap(gl!.TEXTURE_2D);

    const cssW = Math.max(source!.clientWidth, 1);
    const cssH = Math.max(source!.clientHeight, 1);
    const nextW = Math.max(1, Math.ceil(cssW / 8));
    const nextH = Math.max(1, Math.ceil(cssH / 8));
    gl!.bindTexture(gl!.TEXTURE_2D, inkTexture);
    if (nextW !== inkW || nextH !== inkH) {
      inkW = nextW;
      inkH = nextH;
      gl!.texImage2D(
        gl!.TEXTURE_2D,
        0,
        gl!.RGBA,
        inkW,
        inkH,
        0,
        gl!.RGBA,
        gl!.UNSIGNED_BYTE,
        null,
      );
    }
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, fbo);
    gl!.framebufferTexture2D(
      gl!.FRAMEBUFFER,
      gl!.COLOR_ATTACHMENT0,
      gl!.TEXTURE_2D,
      inkTexture,
      0,
    );
    gl!.viewport(0, 0, inkW, inkH);
    gl!.useProgram(inkPass.program);
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, contentTexture);
    gl!.uniform1i(inkPass.uniforms.uContent, 0);
    gl!.uniform2f(inkPass.uniforms.uResolution, inkW, inkH);
    gl!.uniform2f(inkPass.uniforms.uTexel, 1 / cssW, 1 / cssH);
    gl!.uniform1f(inkPass.uniforms.uFine, Math.log2(Math.max(dpr, 1)));
    gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
  }

  let pointerX = 0.5;
  let pointerY = 0.5;
  let prevPointerX = 0.5;
  let prevPointerY = 0.5;
  let hasPointer = false;
  let lastPointerMove = -1e9;
  let burst = false;

  let time = Math.random() * 64;

  function render(delta: number) {
    uploadContent();
    const cssW = Math.max(output.clientWidth, 1);
    const cssH = Math.max(output.clientHeight, 1);
    const aspect = cssW / cssH;

    gl!.bindFramebuffer(gl!.FRAMEBUFFER, fbo);
    gl!.framebufferTexture2D(
      gl!.FRAMEBUFFER,
      gl!.COLOR_ATTACHMENT0,
      gl!.TEXTURE_2D,
      fieldTexture,
      0,
    );
    gl!.viewport(0, 0, fieldW, fieldH);
    const padX = MARGIN / cssW;
    const padY = MARGIN / cssH;
    gl!.useProgram(field.program);
    gl!.uniform2f(field.uniforms.uResolution, fieldW, fieldH);
    gl!.uniform2f(field.uniforms.uSpan, 1 + padX * 2, 1 + padY * 2);
    gl!.uniform2f(field.uniforms.uPad, padX, padY);
    gl!.uniform1f(field.uniforms.uAspect, aspect);
    gl!.uniform2f(
      field.uniforms.uOffset,
      content ? content.scrollLeft / Math.max(content.clientWidth, 1) : 0,
      content ? -content.scrollTop / Math.max(content.clientHeight, 1) : 0,
    );
    const heading = (config.direction * Math.PI) / 180;
    gl!.uniform2f(
      field.uniforms.uDrift,
      -Math.cos(heading) * Math.SQRT2 * time,
      -Math.sin(heading) * Math.SQRT2 * time,
    );
    gl!.uniform1f(field.uniforms.uScale, Math.max(config.scale, 0.05));
    gl!.uniform1f(field.uniforms.uCover, Math.max(config.cover, 0));
    gl!.uniform1f(field.uniforms.uDensity, Math.max(config.density, 0));
    gl!.uniform1f(field.uniforms.uBillow, clamp(config.billow, 0, 1));
    gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);

    const prevWind = windTextures[windIndex];
    const nextWind = windTextures[1 - windIndex];
    windIndex = 1 - windIndex;
    gl!.framebufferTexture2D(
      gl!.FRAMEBUFFER,
      gl!.COLOR_ATTACHMENT0,
      gl!.TEXTURE_2D,
      nextWind,
      0,
    );
    gl!.useProgram(windPass.program);
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, prevWind);
    gl!.uniform1i(windPass.uniforms.uPrev, 0);
    gl!.viewport(0, 0, windW, windH);
    gl!.uniform2f(windPass.uniforms.uResolution, windW, windH);
    const linger = Math.max(config.linger, 0.05);
    const radius = Math.max(config.windRadius, 1) / cssH;
    const reach = clamp(config.wind, 0, 1) * radius * 0.12;
    gl!.uniform1f(windPass.uniforms.uDecay, Math.pow(0.5, delta / linger));
    gl!.uniform1f(
      windPass.uniforms.uRelax,
      Math.pow(0.5, delta / (linger * 1.6)),
    );
    gl!.uniform1f(windPass.uniforms.uFloor, floatTargets ? 0.0002 : 0.003);
    gl!.uniform1f(windPass.uniforms.uAdvect, delta * 1.5 * reach);
    const dx = pointerX - prevPointerX;
    const dy = pointerY - prevPointerY;
    const moved = Math.hypot(dx, dy);
    const stamping = hasPointer && (moved > 0 || burst);
    gl!.uniform2f(windPass.uniforms.uA, prevPointerX, prevPointerY);
    gl!.uniform2f(windPass.uniforms.uB, pointerX, pointerY);
    gl!.uniform1f(windPass.uniforms.uRadius, burst ? radius * 1.35 : radius);
    const strength = stamping ? Math.min(0.2 + moved * 12, 1) * 0.5 : 0;
    gl!.uniform1f(
      windPass.uniforms.uStrength,
      burst ? Math.max(strength, 0.75) : strength,
    );
    let pushX = stamping ? ((dx * aspect) / radius) * 0.55 : 0;
    let pushY = stamping ? (dy / radius) * 0.55 : 0;
    const pushLength = Math.hypot(pushX, pushY);
    if (pushLength > 0.3) {
      pushX *= 0.3 / pushLength;
      pushY *= 0.3 / pushLength;
    }
    gl!.uniform2f(windPass.uniforms.uPush, pushX, pushY);
    gl!.uniform1f(
      windPass.uniforms.uPart,
      burst ? 1.6 : stamping ? Math.min(moved * 14, 0.5) : 0,
    );
    gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
    prevPointerX = pointerX;
    prevPointerY = pointerY;
    burst = false;

    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
    gl!.bindTexture(gl!.TEXTURE_2D, fieldTexture);
    gl!.generateMipmap(gl!.TEXTURE_2D);

    gl!.viewport(0, 0, output.width, output.height);
    gl!.useProgram(composite.program);
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, fieldTexture);
    gl!.uniform1i(composite.uniforms.uField, 0);
    gl!.activeTexture(gl!.TEXTURE1);
    gl!.bindTexture(gl!.TEXTURE_2D, contentTexture);
    gl!.uniform1i(composite.uniforms.uContent, 1);
    gl!.activeTexture(gl!.TEXTURE2);
    gl!.bindTexture(gl!.TEXTURE_2D, nextWind);
    gl!.uniform1i(composite.uniforms.uWind, 2);
    gl!.activeTexture(gl!.TEXTURE3);
    gl!.bindTexture(gl!.TEXTURE_2D, inkTexture);
    gl!.uniform1i(composite.uniforms.uInk, 3);
    gl!.uniform2f(composite.uniforms.uResolution, output.width, output.height);
    gl!.uniform2f(
      composite.uniforms.uContentScale,
      contentScaleX,
      contentScaleY,
    );
    gl!.uniform3f(composite.uniforms.uBase, ...baseColor);
    gl!.uniform3f(composite.uniforms.uLight, ...lightColor);
    gl!.uniform3f(composite.uniforms.uShade, ...shadeColor);
    gl!.uniform1f(composite.uniforms.uOpacity, clamp(config.opacity, 0, 1));
    gl!.uniform1f(composite.uniforms.uShading, Math.max(config.shading, 0));
    gl!.uniform1f(composite.uniforms.uShadow, clamp(config.shadow, 0, 1));
    const shadowX = -config.shadowOffsetX / cssW;
    const shadowY = config.shadowOffsetY / cssH;
    gl!.uniform2f(composite.uniforms.uShadowShift, shadowX, shadowY);
    gl!.uniform1f(
      composite.uniforms.uShadowLod,
      clamp(config.shadowSoftness, 0, 1) * 4,
    );
    let lightX = -config.shadowOffsetX;
    let lightY = config.shadowOffsetY;
    const lightLength = Math.hypot(lightX, lightY);
    if (lightLength < 1) {
      lightX = -0.6;
      lightY = 0.8;
    } else {
      lightX /= lightLength;
      lightY /= lightLength;
    }
    gl!.uniform2f(composite.uniforms.uLightStep, lightX / cssW, lightY / cssH);
    gl!.uniform1f(composite.uniforms.uLodBias, Math.log2(windW / cssW));
    gl!.uniform2f(composite.uniforms.uSpan, 1 + padX * 2, 1 + padY * 2);
    gl!.uniform2f(composite.uniforms.uPad, padX, padY);
    gl!.uniform1f(composite.uniforms.uWindAmt, clamp(config.wind, 0, 1));
    gl!.uniform2f(composite.uniforms.uDisp, reach / aspect, reach);
    gl!.uniform1f(
      composite.uniforms.uRefraction,
      Math.max(config.refraction, 0) / cssW,
    );
    gl!.uniform1f(composite.uniforms.uFogBlur, clamp(config.fogBlur, 0, 1));
    const soft = clamp(config.softness, 0, 1);
    gl!.uniform2f(
      composite.uniforms.uEdge,
      0.04 + (1 - soft) * 0.4,
      0.9 - (1 - soft) * 0.36,
    );
    gl!.uniform1f(
      composite.uniforms.uLegibility,
      clamp(config.legibility, 0, 1),
    );
    gl!.uniform1f(composite.uniforms.uBillow, clamp(config.billow, 0, 1));
    gl!.uniform1f(composite.uniforms.uPixelRatio, output.width / cssW);
    gl!.uniform1f(
      composite.uniforms.uHasContent,
      htmlInCanvas && config.layer === "page" ? 1 : 0,
    );
    gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
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
    const delta = Math.min((now - lastTime) / 1000, 1 / 30);
    lastTime = now;
    if (!reducedMotion) time += delta * config.speed * 0.03;
    render(delta);
    const windActive =
      now - lastPointerMove < 3000 + Math.max(config.linger, 0) * 6000;
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

  start();

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

  const rectCache = createRectCache(output);

  function locate(event: PointerEvent) {
    const rect = rectCache.current;
    const x = (event.clientX - rect.left) / Math.max(rect.width, 1);
    const y = 1 - (event.clientY - rect.top) / Math.max(rect.height, 1);
    const inside = x >= 0 && x <= 1 && y >= 0 && y <= 1;
    if (!inside) {
      hasPointer = false;
      return false;
    }
    if (!hasPointer) {
      prevPointerX = x;
      prevPointerY = y;
      hasPointer = true;
    }
    pointerX = x;
    pointerY = y;
    lastPointerMove = performance.now();
    return true;
  }

  function onPointerMove(event: PointerEvent) {
    if (locate(event)) start();
  }

  function onPointerDown(event: PointerEvent) {
    if (!locate(event) || reducedMotion) return;
    burst = true;
    start();
  }

  function onPointerLeave() {
    hasPointer = false;
  }

  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerdown", onPointerDown, { passive: true });
  document.documentElement.addEventListener("pointerleave", onPointerLeave, {
    passive: true,
  });
  content?.addEventListener("scroll", start, { passive: true });

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
      next = resolveOptions(DEFAULTS, next);
      if (
        !Object.entries(next).some(
          ([key, value]) =>
            !sameValue(config[key as keyof CloudsOptions], value),
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
      document.removeEventListener("visibilitychange", syncVisibility);
      themeObserver.disconnect();
      schemeQuery.removeEventListener("change", onThemeShift);
      window.clearTimeout(themeTimer);
      motionQuery.removeEventListener("change", onMotionChange);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      document.documentElement.removeEventListener(
        "pointerleave",
        onPointerLeave,
      );
      content?.removeEventListener("scroll", start);
      if (htmlInCanvas) paintable!.onpaint = null;
      gl!.deleteTexture(fieldTexture);
      gl!.deleteTexture(contentTexture);
      gl!.deleteTexture(inkTexture);
      gl!.deleteTexture(windTextures[0]);
      gl!.deleteTexture(windTextures[1]);
      gl!.deleteFramebuffer(fbo);
      gl!.deleteProgram(field.program);
      gl!.deleteProgram(windPass.program);
      gl!.deleteProgram(inkPass.program);
      gl!.deleteProgram(composite.program);
      gl!.deleteShader(field.vs);
      gl!.deleteShader(field.fs);
      gl!.deleteShader(windPass.vs);
      gl!.deleteShader(windPass.fs);
      gl!.deleteShader(inkPass.vs);
      gl!.deleteShader(inkPass.fs);
      gl!.deleteShader(composite.vs);
      gl!.deleteShader(composite.fs);
      gl!.deleteBuffer(quad);
    },
  };
}
