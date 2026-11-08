import { getCanvasPixelRatio, createCanvasResizeObserver } from "../canvas-viewport";
import { isHtmlInCanvasBlocked, prepareHtmlInCanvas, drawHtmlInCanvas } from "../html-in-canvas";
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
  /** Canvas the WebGL effect renders to. */
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

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uContent;
uniform sampler2D uAtlas;
uniform sampler2D uWake;
uniform vec2 uResolution;
uniform float uTime;
uniform float uCell;
uniform float uGlyphCount;
uniform float uAtlasGrid;
uniform vec3 uColor;
uniform vec3 uHeadColor;
uniform float uSpeed;
uniform float uSpeedVar;
uniform float uDensity;
uniform float uTrail;
uniform float uGlow;
uniform float uMutate;
uniform float uFlicker;
uniform float uLayers;
uniform float uDim;
uniform float uLight;
uniform float uLightRadius;
uniform float uLightHeight;
uniform float uRelief;
uniform float uStir;
uniform float uScroll;
uniform float uPageLum;
uniform float uHasContent;

float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}

float hash21(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}

float glyphMask(vec2 px, float cell, float seed) {
  vec2 id = floor(px / cell);
  vec2 f = fract(px / cell);
  f = f * 0.74 + 0.13;
  f.x = 1.0 - f.x;
  float tick = floor(uTime * uMutate * 1.6 + hash21(id + seed) * 9.0);
  float idx = floor(
    hash21(id * 1.71 + vec2(seed + tick * 7.31, tick * 0.613)) * uGlyphCount
  );
  float gx = mod(idx, uAtlasGrid);
  float gy = floor(idx / uAtlasGrid);
  vec2 auv = (vec2(gx, gy) + f) / uAtlasGrid;
  return texture(uAtlas, auv).a;
}

float colSpeed(float col, float seed) {
  float variance = mix(0.35, 1.0, hash11(col * 0.37 + seed + 3.1));
  return uSpeed * mix(1.0, variance, uSpeedVar) * 0.5;
}

float colOffset(float col, float seed) {
  return hash11(col * 1.713 + seed) * 9.0;
}

vec2 wakeAt(float xpx) {
  float u = clamp(xpx / max(uResolution.x, 1.0), 0.0, 1.0);
  return texture(uWake, vec2(u, 0.5)).rg;
}

float lum(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

void main () {
  vec2 frag = vec2(gl_FragCoord.x, uResolution.y - gl_FragCoord.y + uScroll);
  vec2 cuv = vec2(vUv.x, 1.0 - vUv.y);
  float yn = 1.0 - frag.y / uResolution.y;

  const float scales[3] = float[3](1.0, 1.5, 2.2);
  const float weights[3] = float[3](1.0, 0.45, 0.22);
  const float seeds[3] = float[3](0.0, 19.7, 41.3);

  float g = 0.0;
  float headG = 0.0;
  for (int l = 0; l < 3; l++) {
    if (float(l) >= uLayers) break;
    float cell = uCell * scales[l];
    float col = floor(frag.x / cell);
    float sp = colSpeed(col, seeds[l]);
    float off = colOffset(col, seeds[l]);
    vec2 wk = uStir > 0.0 ? wakeAt((col + 0.5) * cell) : vec2(0.0);
    float exc = uStir * wk.y;
    float T = uTime * sp + off + sp * wk.x;
    float phase = fract(yn + T);
    float cyc = floor(yn + T);
    float gate = step(hash21(vec2(col, cyc) + seeds[l]), uDensity);
    float b = clamp(uTrail / (phase * 22.0), 0.0, 1.3) - 0.04;
    if (b <= 0.0 || gate < 0.5) continue;
    float flick = 1.0 + uFlicker * 0.6 *
      sin(uTime * 14.0 + hash21(vec2(col, cyc)) * 40.0 + phase * 30.0);
    float m = glyphMask(frag, cell, seeds[l] + cyc * 0.173);
    float cellYn = cell / uResolution.y;
    float head = 1.0 - smoothstep(0.0, cellYn * 1.2, phase);
    g += m * b * flick * weights[l] * (1.0 + head * uGlow * 1.4) *
      (1.0 + exc * 1.6);
    headG += m * head * weights[l] * uGlow * (1.0 + exc * 1.1);
  }
  g = max(g, 0.0);

  if (uHasContent < 0.5) {
    vec3 rainCol = mix(uColor, uHeadColor, clamp(headG, 0.0, 1.0));
    float a = clamp(g, 0.0, 1.0);
    outColor = vec4(rainCol * a, a);
    return;
  }

  vec2 e = vec2(3.0, 0.0) / uResolution;
  vec4 content = texture(uContent, cuv);
  float lC = lum(content.rgb);
  float lX1 = lum(texture(uContent, clamp(cuv - e.xy, 0.0, 1.0)).rgb);
  float lX2 = lum(texture(uContent, clamp(cuv + e.xy, 0.0, 1.0)).rgb);
  float lY1 = lum(texture(uContent, clamp(cuv - e.yx, 0.0, 1.0)).rgb);
  float lY2 = lum(texture(uContent, clamp(cuv + e.yx, 0.0, 1.0)).rgb);
  vec3 N = normalize(vec3(
    -(lX2 - lX1) * uRelief * 4.0,
    -(lY2 - lY1) * uRelief * 4.0,
    1.0
  ));
  float reliefMix = clamp(uRelief, 0.0, 1.0);
  vec2 e2 = vec2(30.0, 0.0) / uResolution;
  float bgL = (lC
    + lum(texture(uContent, clamp(cuv - e2.xy, 0.0, 1.0)).rgb)
    + lum(texture(uContent, clamp(cuv + e2.xy, 0.0, 1.0)).rgb)
    + lum(texture(uContent, clamp(cuv - e2.yx, 0.0, 1.0)).rgb)
    + lum(texture(uContent, clamp(cuv + e2.yx, 0.0, 1.0)).rgb)) * 0.2;
  float bright = smoothstep(0.55, 0.8, uPageLum) * smoothstep(0.2, 0.45, bgL);

  float lightSum = 0.0;
  float sigma2 = uLightRadius * uLightRadius * 0.5;
  float reach = uLightRadius * 1.6;
  float stride = max(1.0, ceil((uLightRadius * 1.7) / (uCell * 12.0)));
  float baseCol = floor(floor(frag.x / uCell) / stride);
  for (int o = -12; o <= 12; o++) {
    float c = (baseCol + float(o)) * stride;
    if (c < 0.0) continue;
    float dx = (c + 0.5) * uCell - frag.x;
    float wx = 1.0 - smoothstep(reach * 0.7, reach, abs(dx));
    if (wx <= 0.0) continue;
    float sp = colSpeed(c, 0.0);
    float off = colOffset(c, 0.0);
    vec2 wk = uStir > 0.0 ? wakeAt((c + 0.5) * uCell) : vec2(0.0);
    float lampBoost = 1.0 + uStir * wk.y * 1.4;
    float T = uTime * sp + off + sp * wk.x;
    float s = 1.0 - frag.y / uResolution.y + T;
    float k0 = floor(s);
    for (int h = 0; h < 2; h++) {
      float k = k0 + float(h);
      float gate = step(hash21(vec2(c, k)), uDensity);
      if (gate < 0.5) continue;
      float lamp = 0.6 + 0.4 * hash11(c * 3.97 + k * 0.713);
      float headDocY = (1.0 - (k - T)) * uResolution.y;
      vec3 dv = vec3(dx, headDocY - frag.y, uLightHeight);
      float d2 = dot(dv, dv);
      float att = exp(-d2 / sigma2);
      vec3 L = dv * inversesqrt(max(d2, 1.0));
      float dif = mix(1.0, 0.25 + 0.75 * max(dot(N, L), 0.0), reliefMix);
      lightSum += att * dif * wx * lamp * lampBoost;
    }
  }
  float ls = lightSum * uLight * (0.6 + 0.4 * uGlow);
  float lit = 2.2 * ls / (ls + 1.1);

  float dimEff = uDim * (1.0 - bright);
  float shade = mix(
    clamp(1.0 - dimEff, 0.0, 1.0),
    1.0,
    smoothstep(0.0, 1.0, lit)
  );
  vec3 col = content.rgb * shade;
  col += uColor * lit * 0.14 * (1.0 - lC * 0.75) * (1.0 - bright);
  col += uColor * clamp(lit - 1.0, 0.0, 1.0) * 0.1 * (1.0 - bright);

  vec3 glyphCol = mix(uColor, uColor * 0.24 + vec3(0.02), lC * (1.0 - bright));
  glyphCol = mix(glyphCol, uHeadColor, clamp(headG, 0.0, 1.0));
  glyphCol = mix(glyphCol, vec3(1.0), bright * clamp(headG - 0.6, 0.0, 0.4));
  float gA = clamp(g, 0.0, 1.0);
  float knock = gA * mix(mix(0.3, 0.88, lC), 1.0, bright);
  float paint = min(g, 1.5) * mix(1.0, mix(0.92, 1.0, bright), lC);
  col = col * (1.0 - knock) + glyphCol * paint;

  float alpha = max(content.a, gA);
  col = clamp(col, vec3(0.0), vec3(alpha));
  outColor = vec4(col, alpha);
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
  const cellPx = 64;
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

  function compile(type: number, text: string): WebGLShader {
    const shader = gl!.createShader(type)!;
    gl!.shaderSource(shader, text);
    gl!.compileShader(shader);
    if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) {
      console.error("GlyphRain shader error:", gl!.getShaderInfoLog(shader));
    }
    return shader;
  }

  const vertexShader = compile(gl.VERTEX_SHADER, VERT);
  const fragmentShader = compile(gl.FRAGMENT_SHADER, FRAG);
  const program = gl.createProgram()!;
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  const uniforms: Record<string, WebGLUniformLocation> = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i++) {
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

  const atlasTexture = gl.createTexture()!;
  let atlasCount = 1;
  let atlasGrid = 1;
  let atlasCharset = "";

  function syncAtlas() {
    if (config.charset === atlasCharset) return;
    atlasCharset = config.charset;
    const atlas = buildAtlas(config.charset);
    atlasCount = atlas.count;
    atlasGrid = atlas.grid;
    gl!.bindTexture(gl!.TEXTURE_2D, atlasTexture);
    gl!.texParameteri(
      gl!.TEXTURE_2D,
      gl!.TEXTURE_MIN_FILTER,
      gl!.LINEAR_MIPMAP_LINEAR,
    );
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
    gl!.texImage2D(
      gl!.TEXTURE_2D,
      0,
      gl!.RGBA,
      gl!.RGBA,
      gl!.UNSIGNED_BYTE,
      atlas.canvas,
    );
    gl!.generateMipmap(gl!.TEXTURE_2D);
  }

  syncAtlas();

  let dpr = 1;

  function syncCanvasSize() {
    dpr = getCanvasPixelRatio(output, gl!);
    const width = Math.max(1, Math.round(output.clientWidth * dpr));
    const height = Math.max(1, Math.round(output.clientHeight * dpr));
    if (output.width !== width || output.height !== height) {
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
    if (!htmlInCanvas || !contentDirty) return;
    contentDirty = false;
    pageLum = readPageLum();
    gl!.bindTexture(gl!.TEXTURE_2D, contentTexture);
    gl!.texImage2D(
      gl!.TEXTURE_2D,
      0,
      gl!.RGBA,
      gl!.RGBA,
      gl!.UNSIGNED_BYTE,
      source,
    );
    sourceCtx!.clearRect(0, 0, source.width, source.height);
  }

  let time = 7.3;

  const WAKE_RES = 256;
  const wakeCharge = new Float32Array(WAKE_RES);
  const wakeField = new Float32Array(WAKE_RES * 2);
  let wakeLive = false;
  let wakeTouched = false;
  let pointerX = 0;
  let tracking = false;

  const wakeTexture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, wakeTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RG32F,
    WAKE_RES,
    1,
    0,
    gl.RG,
    gl.FLOAT,
    wakeField,
  );

  function stirAmount(): number {
    return Math.min(Math.max(config.stir, 0), 1);
  }

  function wakeSpan(): number {
    const width = Math.max(output.clientWidth, 1);
    const px = Math.min(Math.max(config.stirRadius, 8), 2000);
    return Math.max(px / width, 1 / WAKE_RES);
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
    gl!.bindTexture(gl!.TEXTURE_2D, wakeTexture);
    gl!.texSubImage2D(
      gl!.TEXTURE_2D,
      0,
      0,
      0,
      WAKE_RES,
      1,
      gl!.RG,
      gl!.FLOAT,
      wakeField,
    );
  }

  function render() {
    uploadContent();
    gl!.useProgram(program);
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, contentTexture);
    gl!.uniform1i(uniforms.uContent, 0);
    gl!.activeTexture(gl!.TEXTURE1);
    gl!.bindTexture(gl!.TEXTURE_2D, atlasTexture);
    gl!.uniform1i(uniforms.uAtlas, 1);
    gl!.activeTexture(gl!.TEXTURE2);
    gl!.bindTexture(gl!.TEXTURE_2D, wakeTexture);
    gl!.uniform1i(uniforms.uWake, 2);
    gl!.uniform2f(uniforms.uResolution, output.width, output.height);
    gl!.uniform1f(uniforms.uTime, time);
    gl!.uniform1f(uniforms.uCell, Math.min(Math.max(config.cell, 8), 64) * dpr);
    gl!.uniform1f(uniforms.uGlyphCount, atlasCount);
    gl!.uniform1f(uniforms.uAtlasGrid, atlasGrid);
    gl!.uniform3f(
      uniforms.uColor,
      config.color[0],
      config.color[1],
      config.color[2],
    );
    gl!.uniform3f(
      uniforms.uHeadColor,
      config.headColor[0],
      config.headColor[1],
      config.headColor[2],
    );
    gl!.uniform1f(uniforms.uSpeed, Math.min(Math.max(config.speed, 0.05), 3));
    gl!.uniform1f(
      uniforms.uSpeedVar,
      Math.min(Math.max(config.speedVariance, 0), 1),
    );
    gl!.uniform1f(uniforms.uDensity, Math.min(Math.max(config.density, 0), 1));
    gl!.uniform1f(uniforms.uTrail, Math.min(Math.max(config.trail, 0.2), 3));
    gl!.uniform1f(uniforms.uGlow, Math.min(Math.max(config.glow, 0), 3));
    gl!.uniform1f(uniforms.uMutate, Math.min(Math.max(config.mutate, 0), 4));
    gl!.uniform1f(uniforms.uFlicker, Math.min(Math.max(config.flicker, 0), 1));
    gl!.uniform1f(
      uniforms.uLayers,
      Math.round(Math.min(Math.max(config.layers, 1), 3)),
    );
    gl!.uniform1f(uniforms.uDim, Math.min(Math.max(config.dim, 0), 1));
    gl!.uniform1f(uniforms.uLight, Math.min(Math.max(config.light, 0), 3));
    gl!.uniform1f(
      uniforms.uLightRadius,
      Math.min(Math.max(config.lightRadius, 20), 600) * dpr,
    );
    gl!.uniform1f(uniforms.uLightHeight, Math.max(config.lightHeight, 4) * dpr);
    gl!.uniform1f(uniforms.uRelief, Math.min(Math.max(config.relief, 0), 2));
    gl!.uniform1f(uniforms.uStir, wakeTouched ? stirAmount() : 0);
    gl!.uniform1f(uniforms.uScroll, content.scrollTop * dpr);
    gl!.uniform1f(uniforms.uPageLum, pageLum);
    gl!.uniform1f(uniforms.uHasContent, htmlInCanvas ? 1 : 0);
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
    gl!.viewport(0, 0, output.width, output.height);
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
  start();

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
      gl!.deleteTexture(contentTexture);
      gl!.deleteTexture(atlasTexture);
      gl!.deleteTexture(wakeTexture);
      gl!.deleteProgram(program);
      gl!.deleteShader(vertexShader);
      gl!.deleteShader(fragmentShader);
      gl!.deleteBuffer(quad);
      if (htmlInCanvas) paintable.onpaint = null;
    },
  };
}
