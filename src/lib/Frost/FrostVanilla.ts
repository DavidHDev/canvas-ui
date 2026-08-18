import { createRectCache } from "../rect-cache";

export interface FrostOptions {
  /** Base frozen coverage added on top of the frost pattern (0-1). */
  frost?: number;
  /** Multiplier on the frost noise pattern. Higher freezes more of the pane. */
  strength?: number;
  /** Contrast of the frost noise pattern. */
  contrast?: number;
  /** Contrast of the final frost mask. Higher gives crisper frost edges. */
  crispness?: number;
  /** How much sparkling highlight grain mixes into the frost (0-1). */
  highlight?: number;
  /** How strongly highlights tint toward white (0-1). */
  highlightStrength?: number;
  /** Base blur haze mixed over the content, even outside thick frost (0-1). */
  haze?: number;
  /** Frost color where the layer is thin, as [r, g, b] in 0-1 range. */
  tintThin?: [number, number, number];
  /** Frost color where the layer is thick, as [r, g, b] in 0-1 range. */
  tintThick?: [number, number, number];
  /** How much the frost tint colors the frozen areas (0-1). */
  tintStrength?: number;
  /** Saturation multiplier applied to the frosted content. */
  saturation?: number;
  /** Brightness multiplier applied to the frosted content. */
  brightness?: number;
  /** How far the icy surface bends light. 0 disables refraction. */
  refraction?: number;
  /** Index of refraction of the ice. Water ice is about 1.31. */
  ior?: number;
  /** Strength of the fine surface detail in the refraction. */
  detail?: number;
  /** Scale of the icy relief pattern. Higher is larger features. */
  textureScale?: number;
  /** Fresnel boost at grazing angles (0-2). */
  fresnel?: number;
  /** Radius of the melt spot under the cursor (0-1, fraction of height). */
  meltRadius?: number;
  /** Irregularity of the melt edge. 0 is a clean circle. */
  meltNoise?: number;
  /** How quickly hovering melts the frost (0-1). */
  meltStrength?: number;
  /** How fast melted areas freeze back over. 0 never refreezes. */
  refreeze?: number;
  /** Keeps the edges of the pane frozen. 0 lets everything melt. */
  edgeFade?: number;
  /** Lets the frozen borders of the pane melt too. */
  meltEdges?: boolean;
  /** Seconds for the frost to grow in from the edges on load. 0 disables. */
  introDuration?: number;
  /** Overall opacity of the frost layer (0-1). Lower shows more content. */
  opacity?: number;
  /** Animated twinkle of the highlight grain (0-1). 0 is static. */
  shimmer?: number;
  /** Resolution multiplier for the blur passes (0.25-1). */
  quality?: number;
}

export interface FrostElements {
  /** Canvas with layoutsubtree that hosts the HTML content. */
  source: HTMLCanvasElement;
  /** The element inside the source canvas that gets captured. */
  content: HTMLElement;
  /** Canvas the WebGL effect renders to. */
  output: HTMLCanvasElement;
}

export interface FrostInstance {
  /** Melt a spot at (x, y) in [0,1] space, top-left origin. */
  melt: (x: number, y: number) => void;
  /** Update options live. */
  setOptions: (options: FrostOptions) => void;
  /** Re-read canvas size. Call when the element is resized. */
  resize: () => void;
  /** Stop the loop and release all GPU resources. */
  destroy: () => void;
}

const DEFAULTS: Required<FrostOptions> = {
  frost: 0.05,
  strength: 0.7,
  contrast: 3,
  crispness: 1,
  highlight: 0.3,
  highlightStrength: 0.8,
  haze: 0.5,
  tintThin: [0.82, 0.86, 1.05],
  tintThick: [0.92, 0.96, 1.1],
  tintStrength: 0.3,
  saturation: 1.2,
  brightness: 0.85,
  refraction: 1,
  ior: 1.31,
  detail: 2,
  textureScale: 2,
  fresnel: 0.8,
  meltRadius: 0.25,
  meltNoise: 0.25,
  meltStrength: 0.75,
  refreeze: 2,
  edgeFade: 0.1,
  meltEdges: true,
  introDuration: 2.5,
  opacity: 0.6,
  shimmer: 0,
  quality: 1,
};

const BLUR_KERNEL = 10;
const HEIGHT_RES = 512;
const NOISE_RES = 1024;

type PaintableCanvas = HTMLCanvasElement & {
  onpaint?: (() => void) | null;
  requestPaint?: () => void;
};

type ElementImageContext = CanvasRenderingContext2D & {
  drawElementImage?: (element: Element, x: number, y: number) => void;
};

const VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main () {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG_NOISE = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
float prnd (vec2 n, float period) {
  n = mod(n, period);
  float dt = dot(n, vec2(0.129898, 0.78233));
  return fract(sin(mod(dt, 3.14159265)) * 437.585453);
}
float pnoise (vec2 p, float period) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = prnd(i, period);
  float b = prnd(i + vec2(1.0, 0.0), period);
  float c = prnd(i + vec2(0.0, 1.0), period);
  float d = prnd(i + vec2(1.0, 1.0), period);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float pfbm (vec2 p, float period, int octaves) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 4; i++) {
    if (i >= octaves) break;
    v += a * pnoise(p, period);
    p = p * 2.0 + vec2(17.0, 31.0);
    period *= 2.0;
    a *= 0.5;
  }
  return v;
}
float pwarp (vec2 p, float period, float g) {
  float val = 0.0;
  for (int i = 0; i < 2; i++) {
    val = pfbm(
      p + g * vec2(cos(6.28318 * val), sin(6.28318 * val)), period, 4);
  }
  return val;
}
void main () {
  float pattern = pwarp(vUv * 20.0, 20.0, 4.0);
  float mottle = pfbm(vUv * 26.0, 26.0, 3);
  float sparkle =
    smoothstep(0.8, 0.95, pnoise(vUv * 200.0, 200.0)) *
    (0.35 + 0.65 * pnoise(vUv * 50.0, 50.0));
  float meltEdge = pfbm(vUv * 9.0, 9.0, 3);
  outColor = vec4(pattern, mottle, sparkle, meltEdge);
}`;

const FRAG_HEIGHT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
float prnd (vec2 n, float period) {
  n = mod(n, period);
  float dt = dot(n, vec2(0.129898, 0.78233));
  return fract(sin(mod(dt, 3.14159265)) * 437.585453);
}
float pnoise (vec2 p, float period) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = prnd(i, period);
  float b = prnd(i + vec2(1.0, 0.0), period);
  float c = prnd(i + vec2(0.0, 1.0), period);
  float d = prnd(i + vec2(1.0, 1.0), period);
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}
float pfbm (vec2 p, float period, int octaves) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    if (i >= octaves) break;
    v += a * pnoise(p, period);
    p *= 2.0;
    period *= 2.0;
    a *= 0.5;
  }
  return v;
}
void main () {
  float broad = pfbm(vUv * 6.0, 6.0, 4);
  broad = broad * broad * 1.4;
  float fine = pfbm(vUv * 28.0, 28.0, 3);
  outColor = vec4(broad, fine, 0.0, 1.0);
}`;

const FRAG_BLUR = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uScene;
uniform vec2 uTexelSize;
uniform vec2 uStep;
uniform float uFlipY;
WEIGHTS_PLACEHOLDER
vec2 srcUv (vec2 uv) {
  return uFlipY > 0.5 ? vec2(uv.x, 1.0 - uv.y) : uv;
}
void main () {
  vec4 sum = texture(uScene, srcUv(vUv)) * WEIGHT_CENTER;
  for (int i = 1; i < KERNEL_SIZE; i++) {
    vec2 delta = float(i) * uTexelSize * uStep;
    sum += texture(uScene, srcUv(clamp(vUv + delta, 0.0, 1.0))) * WEIGHTS[i - 1];
    sum += texture(uScene, srcUv(clamp(vUv - delta, 0.0, 1.0))) * WEIGHTS[i - 1];
  }
  outColor = sum;
}`;

const FRAG_POINTER = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uBack;
uniform sampler2D uNoise;
uniform vec2 uPoint;
uniform vec2 uPrevPoint;
uniform vec2 uBackShift;
uniform vec2 uScroll;
uniform float uAspect;
uniform float uTextureScale;
uniform float uDecay;
uniform float uMeltNoise;
uniform float uMeltStrength;
uniform float uRadius;
uniform float uEdgeFade;
uniform float uTouching;
float sdSegment (vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}
void main () {
  vec2 backUv = vUv + uBackShift;
  vec4 back = texture(uBack, backUv);
  float inside =
    step(0.0, backUv.x) * step(backUv.x, 1.0) *
    step(0.0, backUv.y) * step(backUv.y, 1.0);
  float melt = clamp(back.r * inside - uDecay, 0.0, 1.0);

  vec2 nUv = (vUv + uScroll) * vec2(uAspect, 1.0)
    / max(uTextureScale, 0.05);
  float n = texture(uNoise, nUv).a - 0.5;

  vec2 p = vUv * vec2(uAspect, 1.0);
  vec2 a = uPrevPoint * vec2(uAspect, 1.0);
  vec2 b = uPoint * vec2(uAspect, 1.0);
  float d = sdSegment(p, a, b) + n * uMeltNoise;

  float m =
    (1.0 - smoothstep(uRadius * 0.35, uRadius, d)) * uMeltStrength;
  vec2 dSide = min(vUv, 1.0 - vUv);
  float side = smoothstep(0.0, max(uEdgeFade, 1e-4), min(dSide.x, dSide.y));
  m *= mix(1.0, side, step(1e-3, uEdgeFade));
  m *= uTouching;

  melt = clamp(melt + m, 0.0, 1.0);
  outColor = vec4(vec3(melt), 1.0);
}`;

const FRAG_FROST = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uContent;
uniform sampler2D uBlur;
uniform sampler2D uNoise;
uniform sampler2D uPointer;
uniform vec2 uScroll;
uniform float uAspect;
uniform float uTextureScale;
uniform float uMeltEdges;
uniform float uIntro;
uniform float uHighlight;
uniform float uStrength;
uniform float uFrost;
uniform float uContrast;
uniform float uCrispness;
uniform float uHaze;
uniform vec3 uTintThin;
uniform vec3 uTintThick;
uniform float uTintStrength;
uniform float uHighlightStrength;
uniform float uSaturation;
uniform float uBrightness;
uniform float uShimmer;
uniform float uTime;
uniform float uOpacity;
uniform float uHasContent;
float contrastFn (float x, float strength) {
  return clamp((x - 0.5) * strength + 0.5, 0.0, 1.0);
}
float rand2 (vec2 uv) {
  uv = floor(uv * 5000.0) / 5000.0;
  float a = dot(uv, vec2(92.0, 80.0));
  float b = dot(uv, vec2(41.0, 62.0));
  return fract(sin(a) + cos(b) * 51.0);
}
vec3 hsv2rgb (vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}
vec3 rgb2hsv (vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}
void main () {
  vec2 nUv = (vUv + uScroll) * vec2(uAspect, 1.0)
    / max(uTextureScale, 0.05);
  vec4 noise = texture(uNoise, nUv);
  float warpN = noise.r;

  float meltRaw = texture(uPointer, vUv).r;

  vec2 edgeDist = min(vUv, 1.0 - vUv);
  float edgeBoost =
    (1.0 - smoothstep(0.0, 0.4, min(edgeDist.x, edgeDist.y)))
    * (1.0 - uMeltEdges * smoothstep(0.0, 0.5, meltRaw));
  float strength = uStrength * (0.62 + 0.65 * edgeBoost);

  float ed = min(edgeDist.x, edgeDist.y)
    + (0.5 - warpN) * 0.34 + (0.5 - noise.g) * 0.16;
  float local = clamp((uIntro * 3.0 - ed * 2.0 - 0.3) / 1.1, 0.0, 1.0);
  strength *= local;

  float body = contrastFn(warpN * strength + uFrost * local, uContrast);

  vec2 gUv = vUv + uScroll;
  float h = rand2(gUv + warpN * 0.05);
  float grain = h * warpN;
  float glint = smoothstep(0.85, 1.0, h);
  glint *= mix(
    1.0,
    0.5 + 0.5 * sin(uTime * 2.4 + h * 6.28),
    clamp(uShimmer, 0.0, 1.0)
  );
  float micro = mix(grain, glint, uHighlight);

  float m = clamp(meltRaw * (1.1 + (noise.a - 0.5) * 0.9), 0.0, 1.0);

  float d = body - m * (0.9 + 0.35 * body);
  float frozen = smoothstep(0.0, 0.22, d);
  float wet = (1.0 - frozen) * (1.0 - smoothstep(0.0, 0.55, -d));
  wet *= smoothstep(0.01, 0.1, m);

  float cover = smoothstep(0.03, 0.35, body);
  float ice = clamp(
    contrastFn(micro * cover * frozen + body, uCrispness), 0.0, 1.0);
  float frostMask = ice * frozen;

  vec2 wobble = vec2(noise.a - 0.5, noise.g - 0.5) * wet * 0.018;

  vec3 icy = mix(uTintThin, uTintThick, body);
  vec4 base;
  vec4 blur;
  if (uHasContent > 0.5) {
    vec2 cUv = clamp(vUv + wobble, 0.0, 1.0);
    base = texture(uContent, vec2(cUv.x, 1.0 - cUv.y));
    blur = texture(uBlur, cUv);
  } else {
    base = vec4(icy, 1.0);
    blur = base;
  }
  float blurMix = clamp(
    frostMask + uHaze * max(frozen, wet * 0.5), 0.0, 1.0);
  vec4 color = mix(base, blur, blurMix);

  vec3 hsv = rgb2hsv(color.rgb);
  hsv.y = clamp(hsv.y * uSaturation, 0.0, 1.0);
  hsv.z = clamp(hsv.z * uBrightness, 0.0, 1.0);
  vec3 adjusted = hsv2rgb(hsv);
  color.rgb = mix(color.rgb, adjusted, frostMask);

  vec3 frostTint = mix(uTintThin, uTintThick, body);
  vec3 frostColor = mix(color.rgb, frostTint, uTintStrength);
  frostColor = mix(
    frostColor,
    vec3(1.0),
    glint * uHighlightStrength * step(0.001, uHighlight));

  color.rgb = mix(color.rgb, frostColor, frostMask);
  color.rgb += wet * glint * 0.25;

  float op = clamp(uOpacity, 0.0, 1.0);
  color.rgb = mix(base.rgb, color.rgb, op);
  outColor = vec4(clamp(color.rgb, 0.0, 1.0), frostMask * op);
}`;

const FRAG_OUTPUT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uFrost;
uniform sampler2D uHeights;
uniform float uIor;
uniform float uRefraction;
uniform float uDetail;
uniform float uTextureScale;
uniform float uFresnel;
uniform vec2 uScrollPx;
uniform float uHasContent;
uniform float uFallbackAlpha;

const float TEXEL = 1.0 / ${HEIGHT_RES}.0;

vec3 heightNormal (float channel, vec2 mapUv, float bump) {
  vec2 hx = vec2(TEXEL, 0.0);
  vec2 hy = vec2(0.0, TEXEL);
  vec2 c = texture(uHeights, mapUv).rg;
  vec2 x = texture(uHeights, mapUv + hx).rg;
  vec2 y = texture(uHeights, mapUv + hy).rg;
  float dx = channel < 0.5 ? x.r - c.r : x.g - c.g;
  float dy = channel < 0.5 ? y.r - c.r : y.g - c.g;
  return normalize(vec3(-dx * bump, -dy * bump, 1.0));
}

void main () {
  vec2 baseUv = vUv;
  float frostMask = texture(uFrost, baseUv).a;

  vec3 V = vec3(0.0, 0.0, 1.0);

  float mainScale = max(uTextureScale, 0.05) * 900.0;
  float subScale = max(uTextureScale, 0.05) * 260.0;
  vec2 mapCoord = gl_FragCoord.xy + uScrollPx;
  vec2 mainUv = mapCoord / mainScale;
  vec2 subUv = mapCoord / subScale;

  vec3 nMain = heightNormal(0.0, mainUv, 14.0);
  vec3 nSub = heightNormal(1.0, subUv, 8.0);

  float heightW = smoothstep(0.1, 0.95, texture(uHeights, mainUv).r);

  vec3 R1 = refract(-V, nMain, 1.0 / uIor);
  vec3 R2 = refract(-V, nSub, 1.0 / uIor);
  vec2 offset = (R1.xy * 0.3 + R2.xy * uDetail * heightW * 0.5)
    * uRefraction * 0.2;

  vec2 refractedUv = clamp(baseUv + offset, 0.0, 1.0);

  vec4 baseColor = texture(uFrost, vUv);
  vec4 refractedColor = texture(uFrost, refractedUv);

  float cosTheta = clamp(dot(-V, nMain), 0.0, 1.0);
  float F0 = pow((uIor - 1.0) / (uIor + 1.0), 2.0);
  float fresnel = F0 + (1.0 - F0) * pow(1.0 - cosTheta, 5.0);

  float refractionMix = frostMask;
  refractionMix = clamp(refractionMix * (1.0 + fresnel * uFresnel), 0.0, 1.0);

  vec4 mixed = mix(baseColor, refractedColor, refractionMix);
  if (uHasContent > 0.5) {
    outColor = vec4(mixed.rgb, 1.0);
  } else {
    float alpha = clamp(mixed.a * uFallbackAlpha, 0.0, 1.0);
    outColor = vec4(mixed.rgb * alpha, alpha);
  }
}`;

interface Target {
  fbo: WebGLFramebuffer;
  texture: WebGLTexture;
  width: number;
  height: number;
}

interface DoubleTarget {
  read: Target;
  write: Target;
  swap: () => void;
}

export function supportsHtmlInCanvas(): boolean {
  if (typeof document === "undefined") return false;
  const probe = document.createElement("canvas") as PaintableCanvas;
  const ctx = probe.getContext("2d") as ElementImageContext | null;
  return Boolean(
    ctx &&
    typeof ctx.drawElementImage === "function" &&
    typeof probe.requestPaint === "function",
  );
}

function buildBlurWeights(kernel: number): string {
  const weights: number[] = [];
  let total = 0;
  for (let i = 0; i < kernel; i++) {
    const w = Math.exp((-0.5 * (i * i)) / (kernel * kernel * 0.25));
    weights.push(w);
    total += i === 0 ? w : w * 2;
  }
  const normalized = weights.map((w) => (w / total).toFixed(6));
  return [
    `#define KERNEL_SIZE ${kernel}`,
    `#define WEIGHT_CENTER ${normalized[0]}`,
    `const float WEIGHTS[KERNEL_SIZE - 1] = float[KERNEL_SIZE - 1](${normalized
      .slice(1)
      .join(", ")});`,
  ].join("\n");
}

export function createFrost(
  elements: FrostElements,
  options: FrostOptions = {},
): FrostInstance | null {
  const config = { ...DEFAULTS, ...options };
  const { source, content, output } = elements;

  const gl = output.getContext("webgl2", {
    alpha: true,
    depth: false,
    stencil: false,
    antialias: false,
    premultipliedAlpha: true,
  });
  if (!gl || gl.isContextLost()) return null;

  const sourceCtx = source.getContext("2d") as ElementImageContext | null;
  const paintable = source as PaintableCanvas;
  const htmlInCanvas = Boolean(
    sourceCtx &&
    typeof sourceCtx.drawElementImage === "function" &&
    typeof paintable.requestPaint === "function",
  );

  let contentDirty = false;
  let contentReady = !htmlInCanvas;
  let wake = () => {};

  function captureContent() {
    try {
      sourceCtx!.reset();
      sourceCtx!.drawElementImage!(content, 0, 0);
      contentDirty = true;
      wake();
    } catch {}
  }

  if (htmlInCanvas) {
    paintable.onpaint = captureContent;
  }

  const halfFloat = Boolean(gl.getExtension("EXT_color_buffer_float"));

  const shaders: WebGLShader[] = [];
  const programs: WebGLProgram[] = [];

  function compile(type: number, text: string): WebGLShader {
    const shader = gl!.createShader(type)!;
    gl!.shaderSource(shader, text);
    gl!.compileShader(shader);
    if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) {
      console.error("Frost shader error:", gl!.getShaderInfoLog(shader));
    }
    shaders.push(shader);
    return shader;
  }

  const vertexShader = compile(gl.VERTEX_SHADER, VERT);

  interface Program {
    program: WebGLProgram;
    uniforms: Record<string, WebGLUniformLocation>;
  }

  function createProgram(fragSource: string): Program {
    const program = gl!.createProgram()!;
    gl!.attachShader(program, vertexShader);
    gl!.attachShader(program, compile(gl!.FRAGMENT_SHADER, fragSource));
    gl!.linkProgram(program);
    programs.push(program);
    const uniforms: Record<string, WebGLUniformLocation> = {};
    const count = gl!.getProgramParameter(program, gl!.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const info = gl!.getActiveUniform(program, i)!;
      uniforms[info.name] = gl!.getUniformLocation(program, info.name)!;
    }
    return { program, uniforms };
  }

  const noiseProgram = createProgram(FRAG_NOISE);
  const heightProgram = createProgram(FRAG_HEIGHT);
  const blurProgram = createProgram(
    FRAG_BLUR.replace("WEIGHTS_PLACEHOLDER", buildBlurWeights(BLUR_KERNEL)),
  );
  const pointerProgram = createProgram(FRAG_POINTER);
  const frostProgram = createProgram(FRAG_FROST);
  const outputProgram = createProgram(FRAG_OUTPUT);

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  function createTarget(
    width: number,
    height: number,
    useHalfFloat: boolean,
    wrap: number,
  ): Target {
    const texture = gl!.createTexture()!;
    gl!.bindTexture(gl!.TEXTURE_2D, texture);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, wrap);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, wrap);
    gl!.texImage2D(
      gl!.TEXTURE_2D,
      0,
      useHalfFloat ? gl!.RGBA16F : gl!.RGBA8,
      width,
      height,
      0,
      gl!.RGBA,
      useHalfFloat ? gl!.HALF_FLOAT : gl!.UNSIGNED_BYTE,
      null,
    );
    const fbo = gl!.createFramebuffer()!;
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, fbo);
    gl!.framebufferTexture2D(
      gl!.FRAMEBUFFER,
      gl!.COLOR_ATTACHMENT0,
      gl!.TEXTURE_2D,
      texture,
      0,
    );
    gl!.viewport(0, 0, width, height);
    gl!.clearColor(0, 0, 0, 0);
    gl!.clear(gl!.COLOR_BUFFER_BIT);
    return { fbo, texture, width, height };
  }

  function releaseTarget(target: Target | null) {
    if (!target) return;
    gl!.deleteFramebuffer(target.fbo);
    gl!.deleteTexture(target.texture);
  }

  function createDoubleTarget(
    width: number,
    height: number,
    useHalfFloat: boolean,
  ): DoubleTarget {
    let read = createTarget(width, height, useHalfFloat, gl!.CLAMP_TO_EDGE);
    let write = createTarget(width, height, useHalfFloat, gl!.CLAMP_TO_EDGE);
    return {
      get read() {
        return read;
      },
      get write() {
        return write;
      },
      swap() {
        const t = read;
        read = write;
        write = t;
      },
    };
  }

  let frostTarget: Target | null = null;
  let blurA: Target | null = null;
  let blurB: Target | null = null;
  let pointer: DoubleTarget | null = null;

  const heightTarget = createTarget(HEIGHT_RES, HEIGHT_RES, false, gl.REPEAT);
  const noiseTarget = createTarget(NOISE_RES, NOISE_RES, false, gl.REPEAT);

  function blit(target: Target | null) {
    if (target) {
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, target.fbo);
      gl!.viewport(0, 0, target.width, target.height);
    } else {
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
      gl!.viewport(0, 0, output.width, output.height);
    }
    gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
  }

  function bindTexture(texture: WebGLTexture, unit: number): number {
    gl!.activeTexture(gl!.TEXTURE0 + unit);
    gl!.bindTexture(gl!.TEXTURE_2D, texture);
    return unit;
  }

  gl.useProgram(heightProgram.program);
  blit(heightTarget);
  gl.useProgram(noiseProgram.program);
  blit(noiseTarget);

  const contentTexture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, contentTexture);
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

  let blurDirty = true;
  let targetsReady = false;

  function rebuildTargets() {
    const width = Math.max(output.width, 1);
    const height = Math.max(output.height, 1);
    const blurScale = 0.35 * Math.min(Math.max(config.quality, 0.25), 1);
    const bw = Math.max(1, Math.round(width * blurScale));
    const bh = Math.max(1, Math.round(height * blurScale));
    releaseTarget(frostTarget);
    releaseTarget(blurA);
    releaseTarget(blurB);
    if (pointer) {
      releaseTarget(pointer.read);
      releaseTarget(pointer.write);
    }
    frostTarget = createTarget(width, height, false, gl!.CLAMP_TO_EDGE);
    blurA = createTarget(bw, bh, false, gl!.CLAMP_TO_EDGE);
    blurB = createTarget(bw, bh, false, gl!.CLAMP_TO_EDGE);
    pointer = createDoubleTarget(
      Math.max(1, Math.round(width * 0.5)),
      Math.max(1, Math.round(height * 0.5)),
      halfFloat,
    );
    targetsReady = true;
    blurDirty = true;
  }

  function syncCanvasSize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(output.clientWidth * dpr));
    const height = Math.max(1, Math.round(output.clientHeight * dpr));
    if (output.width !== width || output.height !== height) {
      output.width = width;
      output.height = height;
      rebuildTargets();
    } else if (!targetsReady) {
      rebuildTargets();
    }
    if (htmlInCanvas) {
      const cssWidth = Math.max(1, Math.round(source.clientWidth));
      const cssHeight = Math.max(1, Math.round(source.clientHeight));
      if (source.width !== cssWidth * dpr || source.height !== cssHeight * dpr) {
        source.width = cssWidth * dpr;
        source.height = cssHeight * dpr;
      }
      paintable.requestPaint!();
    }
  }

  syncCanvasSize();

  if (htmlInCanvas) captureContent();

  function uploadContent() {
    if (!htmlInCanvas || !contentDirty) return;
    contentDirty = false;
    blurDirty = true;
    gl!.bindTexture(gl!.TEXTURE_2D, contentTexture);
    gl!.texImage2D(
      gl!.TEXTURE_2D,
      0,
      gl!.RGBA,
      gl!.RGBA,
      gl!.UNSIGNED_BYTE,
      source,
    );
    if (!contentReady) {
      contentReady = true;
      introStart = performance.now();
    }
  }

  function renderBlur() {
    if (!blurDirty || !htmlInCanvas || !blurA || !blurB) return;
    blurDirty = false;
    gl!.useProgram(blurProgram.program);
    gl!.uniform2f(
      blurProgram.uniforms.uTexelSize,
      1 / blurA.width,
      1 / blurA.height,
    );
    gl!.uniform1i(blurProgram.uniforms.uScene, bindTexture(contentTexture, 0));
    gl!.uniform2f(blurProgram.uniforms.uStep, 0, 1);
    gl!.uniform1f(blurProgram.uniforms.uFlipY, 1);
    blit(blurA);
    gl!.uniform1i(blurProgram.uniforms.uScene, bindTexture(blurA.texture, 0));
    gl!.uniform2f(blurProgram.uniforms.uStep, 1, 0);
    gl!.uniform1f(blurProgram.uniforms.uFlipY, 0);
    blit(blurB);
  }

  let pointerOn = false;
  let pointerX = 0.5;
  let pointerY = 0.5;
  let prevPointerX = 0.5;
  let prevPointerY = 0.5;
  let lastScrollX = 0;
  let lastScrollY = 0;
  let queuedMelts: Array<[number, number]> = [];

  function renderPointer() {
    if (!pointer) return;
    const cssW = Math.max(output.clientWidth, 1);
    const cssH = Math.max(output.clientHeight, 1);
    const sx = content.scrollLeft;
    const sy = content.scrollTop;
    gl!.useProgram(pointerProgram.program);
    gl!.uniform1i(
      pointerProgram.uniforms.uBack,
      bindTexture(pointer.read.texture, 0),
    );
    gl!.uniform1i(
      pointerProgram.uniforms.uNoise,
      bindTexture(noiseTarget.texture, 1),
    );
    gl!.uniform1f(
      pointerProgram.uniforms.uAspect,
      output.width / Math.max(output.height, 1),
    );
    gl!.uniform2f(
      pointerProgram.uniforms.uBackShift,
      (sx - lastScrollX) / cssW,
      -(sy - lastScrollY) / cssH,
    );
    gl!.uniform2f(pointerProgram.uniforms.uScroll, sx / cssW, -sy / cssH);
    gl!.uniform1f(pointerProgram.uniforms.uTextureScale, config.textureScale);
    gl!.uniform1f(pointerProgram.uniforms.uDecay, config.refreeze * 0.001);
    gl!.uniform1f(pointerProgram.uniforms.uMeltNoise, config.meltNoise);
    gl!.uniform1f(
      pointerProgram.uniforms.uMeltStrength,
      config.meltStrength * 0.2,
    );
    gl!.uniform1f(pointerProgram.uniforms.uRadius, config.meltRadius);
    gl!.uniform1f(
      pointerProgram.uniforms.uEdgeFade,
      config.meltEdges ? 0 : config.edgeFade,
    );
    if (queuedMelts.length > 0) {
      for (const [mx, my] of queuedMelts) {
        gl!.uniform2f(pointerProgram.uniforms.uPoint, mx, 1 - my);
        gl!.uniform2f(pointerProgram.uniforms.uPrevPoint, mx, 1 - my);
        gl!.uniform1f(pointerProgram.uniforms.uTouching, 1);
        blit(pointer.write);
        pointer.swap();
        gl!.uniform1i(
          pointerProgram.uniforms.uBack,
          bindTexture(pointer.read.texture, 0),
        );
        gl!.uniform2f(pointerProgram.uniforms.uBackShift, 0, 0);
      }
      queuedMelts = [];
    } else {
      gl!.uniform2f(pointerProgram.uniforms.uPoint, pointerX, 1 - pointerY);
      gl!.uniform2f(
        pointerProgram.uniforms.uPrevPoint,
        prevPointerX,
        1 - prevPointerY,
      );
      gl!.uniform1f(pointerProgram.uniforms.uTouching, pointerOn ? 1 : 0);
      blit(pointer.write);
      pointer.swap();
    }
    lastScrollX = sx;
    lastScrollY = sy;
    prevPointerX = pointerX;
    prevPointerY = pointerY;
  }

  function renderFrost(now: number) {
    if (!frostTarget || !pointer || !blurB) return;
    const cssW = Math.max(output.clientWidth, 1);
    const cssH = Math.max(output.clientHeight, 1);
    gl!.useProgram(frostProgram.program);
    gl!.uniform1i(
      frostProgram.uniforms.uContent,
      bindTexture(contentTexture, 0),
    );
    gl!.uniform1i(frostProgram.uniforms.uBlur, bindTexture(blurB.texture, 1));
    gl!.uniform1i(
      frostProgram.uniforms.uNoise,
      bindTexture(noiseTarget.texture, 2),
    );
    gl!.uniform1i(
      frostProgram.uniforms.uPointer,
      bindTexture(pointer.read.texture, 3),
    );
    gl!.uniform2f(
      frostProgram.uniforms.uScroll,
      content.scrollLeft / cssW,
      -content.scrollTop / cssH,
    );
    gl!.uniform1f(
      frostProgram.uniforms.uAspect,
      output.width / Math.max(output.height, 1),
    );
    gl!.uniform1f(frostProgram.uniforms.uTextureScale, config.textureScale);
    gl!.uniform1f(frostProgram.uniforms.uMeltEdges, config.meltEdges ? 1 : 0);
    gl!.uniform1f(frostProgram.uniforms.uIntro, introProgress(now));
    gl!.uniform1f(frostProgram.uniforms.uHighlight, config.highlight);
    gl!.uniform1f(frostProgram.uniforms.uStrength, config.strength);
    gl!.uniform1f(frostProgram.uniforms.uFrost, config.frost);
    gl!.uniform1f(frostProgram.uniforms.uContrast, config.contrast);
    gl!.uniform1f(frostProgram.uniforms.uCrispness, config.crispness);
    gl!.uniform1f(frostProgram.uniforms.uHaze, config.haze);
    gl!.uniform3f(
      frostProgram.uniforms.uTintThin,
      config.tintThin[0],
      config.tintThin[1],
      config.tintThin[2],
    );
    gl!.uniform3f(
      frostProgram.uniforms.uTintThick,
      config.tintThick[0],
      config.tintThick[1],
      config.tintThick[2],
    );
    gl!.uniform1f(frostProgram.uniforms.uTintStrength, config.tintStrength);
    gl!.uniform1f(
      frostProgram.uniforms.uHighlightStrength,
      config.highlightStrength,
    );
    gl!.uniform1f(frostProgram.uniforms.uSaturation, config.saturation);
    gl!.uniform1f(frostProgram.uniforms.uBrightness, config.brightness);
    gl!.uniform1f(frostProgram.uniforms.uShimmer, config.shimmer);
    gl!.uniform1f(frostProgram.uniforms.uTime, now / 1000);
    gl!.uniform1f(
      frostProgram.uniforms.uOpacity,
      Math.min(Math.max(config.opacity, 0), 1),
    );
    gl!.uniform1f(frostProgram.uniforms.uHasContent, htmlInCanvas ? 1 : 0);
    blit(frostTarget);
  }

  function renderOutput() {
    if (!frostTarget) return;
    const dpr = output.width / Math.max(output.clientWidth, 1);
    gl!.useProgram(outputProgram.program);
    gl!.uniform1i(
      outputProgram.uniforms.uFrost,
      bindTexture(frostTarget.texture, 0),
    );
    gl!.uniform1i(
      outputProgram.uniforms.uHeights,
      bindTexture(heightTarget.texture, 2),
    );
    gl!.uniform1f(outputProgram.uniforms.uIor, Math.max(config.ior, 1.01));
    gl!.uniform1f(outputProgram.uniforms.uRefraction, config.refraction);
    gl!.uniform1f(outputProgram.uniforms.uDetail, config.detail);
    gl!.uniform1f(outputProgram.uniforms.uTextureScale, config.textureScale);
    gl!.uniform1f(outputProgram.uniforms.uFresnel, config.fresnel);
    gl!.uniform2f(
      outputProgram.uniforms.uScrollPx,
      content.scrollLeft * dpr,
      -content.scrollTop * dpr,
    );
    gl!.uniform1f(outputProgram.uniforms.uHasContent, htmlInCanvas ? 1 : 0);
    gl!.uniform1f(outputProgram.uniforms.uFallbackAlpha, 0.85);
    blit(null);
  }

  let raf = 0;
  let destroyed = false;
  let running = false;
  let visible = true;
  let activeUntil = 0;
  let introStart = performance.now();

  function introProgress(now: number) {
    const introMs = Math.max(config.introDuration, 0) * 1000;
    if (introMs <= 0 || reducedMotion) return 1;
    const t = Math.min(Math.max((now - introStart) / introMs, 0), 1);
    return t * t * (3 - 2 * t);
  }

  function refreezeDelayMs() {
    const decay = Math.max(config.refreeze * 0.001, 1e-5);
    return (1 / decay / 60) * 1000 + 500;
  }

  function frame(now: number) {
    if (destroyed) return;
    if (!visible) {
      running = false;
      return;
    }
    gl!.disable(gl!.BLEND);
    uploadContent();
    if (!contentReady) {
      running = false;
      return;
    }
    renderBlur();
    renderPointer();
    renderFrost(now);
    renderOutput();

    const animating =
      pointerOn ||
      now < activeUntil ||
      now < introStart + Math.max(config.introDuration, 0) * 1000 + 120 ||
      contentDirty ||
      config.shimmer > 0.001;
    if (!animating) {
      running = false;
      return;
    }
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (destroyed || running || !visible) return;
    running = true;
    raf = requestAnimationFrame(frame);
  }

  wake = start;
  start();

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reducedMotion = motionQuery.matches;

  function onMotionChange() {
    reducedMotion = motionQuery.matches;
    if (!reducedMotion) start();
  }
  motionQuery.addEventListener("change", onMotionChange);

  const rectCache = createRectCache(output);

  function onPointerMove(event: PointerEvent) {
    if (reducedMotion) return;
    const rect = rectCache.current;
    pointerX = (event.clientX - rect.left) / Math.max(rect.width, 1);
    pointerY = (event.clientY - rect.top) / Math.max(rect.height, 1);
    pointerOn = true;
    activeUntil = performance.now() + refreezeDelayMs();
    start();
  }

  function onPointerLeave() {
    pointerOn = false;
    activeUntil = performance.now() + refreezeDelayMs();
    start();
  }

  const listenTarget = output.parentElement ?? output;
  listenTarget.addEventListener("pointermove", onPointerMove as EventListener, { passive: true });
  listenTarget.addEventListener("pointerdown", onPointerMove as EventListener, { passive: true });
  listenTarget.addEventListener(
    "pointerleave",
    onPointerLeave as EventListener,
  );
  listenTarget.addEventListener(
    "pointercancel",
    onPointerLeave as EventListener,
  );

  function onScroll() {
    activeUntil = Math.max(activeUntil, performance.now() + 400);
    if (htmlInCanvas) paintable.requestPaint?.();
    start();
  }
  content.addEventListener("scroll", onScroll, { passive: true });

  const observer = new ResizeObserver(() => {
    syncCanvasSize();
    start();
  });
  observer.observe(output);

  const intersection = new IntersectionObserver((entries) => {
    visible = entries[entries.length - 1]?.isIntersecting ?? true;
    if (visible) start();
  });
  intersection.observe(output);

  return {
    melt(x, y) {
      if (reducedMotion) return;
      queuedMelts.push([x, y]);
      activeUntil = performance.now() + refreezeDelayMs();
      start();
    },
    setOptions(next) {
      if (
        !Object.entries(next).some(
          ([key, value]) => config[key as keyof FrostOptions] !== value,
        )
      )
        return;
      const { quality, ...rest } = next;
      const qualityChanged =
        quality !== undefined && quality !== config.quality;
      Object.assign(config, rest);
      if (qualityChanged) {
        config.quality = quality!;
        rebuildTargets();
      }
      activeUntil = Math.max(activeUntil, performance.now() + 100);
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
      releaseTarget(noiseTarget);
      releaseTarget(frostTarget);
      releaseTarget(blurA);
      releaseTarget(blurB);
      if (pointer) {
        releaseTarget(pointer.read);
        releaseTarget(pointer.write);
      }
      releaseTarget(heightTarget);
      gl!.deleteTexture(contentTexture);
      programs.forEach((program) => gl!.deleteProgram(program));
      shaders.forEach((shader) => gl!.deleteShader(shader));
      gl!.deleteBuffer(quad);
      if (htmlInCanvas) paintable.onpaint = null;
      content.removeEventListener("scroll", onScroll);
      listenTarget.removeEventListener(
        "pointermove",
        onPointerMove as EventListener,
      );
      listenTarget.removeEventListener(
        "pointerdown",
        onPointerMove as EventListener,
      );
      listenTarget.removeEventListener(
        "pointerleave",
        onPointerLeave as EventListener,
      );
      listenTarget.removeEventListener(
        "pointercancel",
        onPointerLeave as EventListener,
      );
    },
  };
}
