import { createRectCache } from "../rect-cache";

export interface CanvasOptions {
  /** Height of one woven thread in CSS pixels. */
  threadSize?: number;
  /** Width of the dark seams between threads (0 to 1). */
  threadWidth?: number;
  /** How strongly the woven texture shades the paint (0 to 1). */
  texture?: number;
  /** Canvas paper color as [r, g, b] in 0-1 range. */
  tint?: [number, number, number];
  /** How much the paper color warms the painting (0 to 1). */
  tintStrength?: number;
  /** Amount of photographic grain worked into the paint (0 to 1). */
  grain?: number;
  /** Amount of dotted halftone screen applied to the painting (0 to 1). */
  halftone?: number;
  /** Size of the halftone screen dots in CSS pixels. */
  dotSize?: number;
  /** Overall mix between the raw page (0) and the painting (1). */
  strength?: number;
  /** How far wet paint stands off the weave, lit in 3D (0 to 1). */
  relief?: number;
  /** Sheen on fresh paint. Wet strokes catch the light, dry ones go matte (0 to 1). */
  gloss?: number;
  /** Definition of the bristle grooves combed through each stroke (0 to 1). */
  bristle?: number;
  /** Seconds a stroke takes to level back into the canvas. */
  dry?: number;
  /** Radius of the brush, relative to the screen height. */
  radius?: number;
  /** Duration of the intro fade-in of the painting effect in seconds. 0 skips it. */
  intro?: number;
  /** How quickly the brush follows the cursor. Higher is snappier. */
  followSpeed?: number;
}

export interface CanvasElements {
  /** Canvas with layoutsubtree that hosts the HTML content. */
  source: HTMLCanvasElement;
  /** The element inside the source canvas that gets captured. */
  content: HTMLElement;
  /** Canvas the WebGL effect renders to. */
  output: HTMLCanvasElement;
}

export interface CanvasInstance {
  /** Update effect options live. */
  setOptions: (options: CanvasOptions) => void;
  /** Re-read canvas size. Call when the element is resized. */
  resize: () => void;
  /** Stop the loop and release all GPU resources. */
  destroy: () => void;
}

const DEFAULTS: Required<CanvasOptions> = {
  threadSize: 2,
  threadWidth: 0.2,
  texture: 1,
  tint: [0.84, 0.81, 0.75],
  tintStrength: 0,
  grain: 0.5,
  halftone: 0.1,
  dotSize: 6,
  strength: 1,
  relief: 0.45,
  gloss: 0.35,
  bristle: 0.4,
  dry: 2.5,
  radius: 0.08,
  intro: 1.6,
  followSpeed: 3,
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

const FRAG_PAINT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uState;
uniform vec2 uTexel;
uniform vec2 uShift;
uniform vec2 uPoint;
uniform vec2 uPrevPoint;
uniform float uAspect;
uniform float uRadius;
uniform float uDeposit;
uniform float uBristle;
uniform float uLevel;
uniform float uDecay;
uniform float uDryRate;

float sdSegment (vec2 p, vec2 a, vec2 b) {
  vec2 pa = p - a;
  vec2 ba = b - a;
  float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-6), 0.0, 1.0);
  return length(pa - ba * h);
}

void main () {
  vec2 src = vUv + uShift;
  float inside =
    step(0.0, src.x) * step(src.x, 1.0) *
    step(0.0, src.y) * step(src.y, 1.0);
  vec4 prev = texture(uState, src);
  float h = prev.r * inside;
  float wet = prev.g * inside;

  float around =
    texture(uState, src + vec2(uTexel.x, 0.0)).r +
    texture(uState, src - vec2(uTexel.x, 0.0)).r +
    texture(uState, src + vec2(0.0, uTexel.y)).r +
    texture(uState, src - vec2(0.0, uTexel.y)).r;
  around *= 0.25 * inside;

  h = mix(h, around, uLevel * (0.15 + 0.85 * wet));
  h *= uDecay;
  wet *= uDryRate;

  vec2 p = vUv * vec2(uAspect, 1.0);
  vec2 a = uPrevPoint * vec2(uAspect, 1.0);
  vec2 b = uPoint * vec2(uAspect, 1.0);
  float r = max(uRadius, 1e-4);
  float d = sdSegment(p, a, b);

  float dome = 1.0 - smoothstep(r * 0.2, r, d);
  dome *= dome;
  float lip = (1.0 - smoothstep(r * 0.55, r, d)) * smoothstep(r * 0.1, r * 0.6, d);

  vec2 travel = b - a;
  float len = length(travel);
  vec2 axis = len > 1e-5 ? travel / len : vec2(1.0, 0.0);
  vec2 perp = vec2(-axis.y, axis.x);
  float across = dot(p - a, perp) / r;
  float comb = 0.5 + 0.5 * cos(across * 18.0);
  float bristle = mix(1.0, 0.3 + 0.7 * comb, clamp(uBristle, 0.0, 1.0));

  float add = (dome + lip * 0.55) * bristle * uDeposit;
  h = clamp(h + add, 0.0, 1.0);
  wet = clamp(max(wet, add * 5.0), 0.0, 1.0);

  outColor = vec4(h, wet, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uContent;
uniform sampler2D uTextMask;
uniform vec2 uResolution;
uniform float uThreadSize;
uniform float uThreadWidth;
uniform float uTexture;
uniform vec3 uTint;
uniform float uTintStrength;
uniform float uGrain;
uniform float uHalftone;
uniform float uDotSize;
uniform float uStrength;
uniform sampler2D uPaint;
uniform vec2 uPaintTexel;
uniform float uRelief;
uniform float uGloss;
uniform float uIntro;
uniform float uMaxX;
uniform vec2 uScroll;

#define S(a, b, t) smoothstep(a, b, t)

float hash (vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float threadedEdges (vec2 st, float width) {
  return 1.0 - S(0.0, width, st.x) + S(1.0 - width, 1.0, st.x);
}

float ovalGradient (vec2 st, float radius) {
  return S(radius - 0.1, radius + 0.9, 1.0 - length(st - 0.5));
}

vec2 weave (vec2 frag) {
  vec2 st = frag / max(uThreadSize, 1.0);
  st.x *= 0.5;
  if (mod(floor(st.y), 2.0) == 1.0) {
    st.x -= 0.5;
  }
  vec2 f = fract(st);
  float edges = threadedEdges(f, max(uThreadWidth, 0.001));
  float bump = ovalGradient(f, 0.5);
  float shade = clamp(1.0 - edges * 0.4 + bump * 0.22, 0.45, 1.3);
  return vec2(shade, bump);
}

void main () {
  vec2 uv = vUv;

  if (uv.x > uMaxX) {
    outColor = vec4(0.0);
    return;
  }

  float textness = texture(uTextMask, vec2(uv.x, 1.0 - uv.y)).r;

  vec2 paintState = texture(uPaint, uv).rg;
  float thickness = paintState.r;
  float wetness = paintState.g;
  float hL = texture(uPaint, uv - vec2(uPaintTexel.x, 0.0)).r;
  float hR = texture(uPaint, uv + vec2(uPaintTexel.x, 0.0)).r;
  float hD = texture(uPaint, uv - vec2(0.0, uPaintTexel.y)).r;
  float hU = texture(uPaint, uv + vec2(0.0, uPaintTexel.y)).r;
  vec2 slope = vec2(hR - hL, hU - hD) * 0.5;

  float relief = clamp(uRelief, 0.0, 1.0);
  vec2 parallax = -slope * relief * 0.08 * (1.0 - textness);
  vec2 contentUv = vec2(uv.x + parallax.x, 1.0 - uv.y - parallax.y);
  contentUv.x = clamp(contentUv.x, 0.0, uMaxX);
  contentUv.y = clamp(contentUv.y, 0.0, 1.0);

  vec4 content = texture(uContent, contentUv);
  vec2 frag = uv * uResolution;
  vec2 cloth = frag + uScroll;

  vec2 fiber = weave(cloth);
  float grainN = hash(floor(cloth));

  float dotPx = max(uDotSize, 2.0);
  mat2 rot = mat2(0.7071, -0.7071, 0.7071, 0.7071);
  mat2 inv = mat2(0.7071, 0.7071, -0.7071, 0.7071);
  vec2 hFrag = rot * cloth;
  vec2 hCenter = (floor(hFrag / dotPx) + 0.5) * dotPx;
  vec2 hLocal = (hFrag - hCenter) / dotPx;
  vec2 hUv = (inv * hCenter - uScroll) / uResolution;
  hUv = clamp(hUv, vec2(0.001), vec2(uMaxX - 0.002, 0.999));
  vec4 cellPix = texture(uContent, vec2(hUv.x, 1.0 - hUv.y));
  float cellLum = dot(cellPix.rgb, vec3(0.299, 0.587, 0.114));

  float crisp = 0.0;
  if (textness > 0.4) {
    float fineLum = dot(content.rgb, vec3(0.299, 0.587, 0.114));
    if (abs(fineLum - cellLum) > 0.08) {
      crisp = 1.0;
    }
  }

  float dotR = (1.0 - cellLum) * 0.55 + (grainN - 0.5) * uGrain * 0.12;
  float dotMask = 1.0 - S(dotR - 0.12, dotR + 0.12, length(hLocal));
  vec3 ink = cellPix.rgb * 0.35;
  vec3 between = mix(cellPix.rgb, vec3(1.0), 0.55);
  vec3 screened = mix(between, ink, dotMask);

  vec3 paint = content.rgb;
  float halftoneAmt = clamp(uHalftone, 0.0, 1.0) * (1.0 - 0.85 * crisp);
  paint = mix(paint, screened, halftoneAmt);

  float texAmt = clamp(uTexture, 0.0, 1.0) * (1.0 - 0.6 * crisp);
  texAmt *= 1.0 - 0.55 * thickness * relief;
  paint *= mix(1.0, fiber.x, texAmt);

  float tintMax = max(uTint.r, max(uTint.g, uTint.b));
  vec3 tintMul = uTint / max(tintMax, 0.001);
  float tintAmt = clamp(uTintStrength, 0.0, 1.0) * (1.0 - 0.5 * crisp);
  paint *= mix(vec3(1.0), tintMul, tintAmt);

  paint *= 1.0 + (grainN - 0.5) * uGrain * (0.35 - 0.25 * crisp);

  vec3 nrm = normalize(vec3(-slope * relief * 18.0, 1.0));
  vec3 lightDir = normalize(vec3(-0.55, 0.62, 0.56));
  float presence = S(0.0, 0.12, thickness);
  float diffuse = clamp(dot(nrm, lightDir), 0.0, 1.0);
  float shade = (diffuse - lightDir.z) * 1.15 * (1.0 - 0.45 * crisp);
  paint *= clamp(1.0 + shade, 0.55, 1.7);

  vec3 halfVec = normalize(lightDir + vec3(0.0, 0.0, 1.0));
  float spec = pow(clamp(dot(nrm, halfVec), 0.0, 1.0), 48.0);
  spec = max(spec - pow(clamp(halfVec.z, 0.0, 1.0), 48.0), 0.0);
  float sheen = clamp(uGloss, 0.0, 1.0) * (0.3 + 0.7 * wetness) * presence;
  paint += spec * sheen * 1.6 * (1.0 - 0.5 * crisp);

  float amt = clamp(uStrength, 0.0, 1.0) * clamp(uIntro, 0.0, 1.0);
  vec3 col = mix(content.rgb, paint, amt);
  float alpha = mix(content.a, 1.0, amt);
  outColor = vec4(col, alpha);
}`;

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

export function createCanvas(
  elements: CanvasElements,
  options: CanvasOptions = {},
): CanvasInstance | null {
  const config = { ...DEFAULTS, ...options };
  const { source, content, output } = elements;

  const gl = output.getContext("webgl2", {
    alpha: true,
    depth: false,
    stencil: false,
    antialias: false,
    premultipliedAlpha: false,
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
  let wake = () => {};

  if (htmlInCanvas) {
    paintable.onpaint = () => {
      try {
        sourceCtx!.reset();
        sourceCtx!.drawElementImage!(content, 0, 0);
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
      console.error("Canvas shader error:", gl!.getShaderInfoLog(shader));
    }
    return shader;
  }

  const vertexShader = compile(gl.VERTEX_SHADER, VERT);
  const fragmentShader = compile(gl.FRAGMENT_SHADER, FRAG);
  const paintShader = compile(gl.FRAGMENT_SHADER, FRAG_PAINT);
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

  const paintProgram = gl.createProgram()!;
  gl.attachShader(paintProgram, vertexShader);
  gl.attachShader(paintProgram, paintShader);
  gl.linkProgram(paintProgram);

  const paintUniforms: Record<string, WebGLUniformLocation> = {};
  const paintCount = gl.getProgramParameter(paintProgram, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < paintCount; i++) {
    const info = gl.getActiveUniform(paintProgram, i)!;
    paintUniforms[info.name] = gl.getUniformLocation(paintProgram, info.name)!;
  }

  const halfFloat = Boolean(gl.getExtension("EXT_color_buffer_float"));

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

  const textMaskTexture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, textMaskTexture);
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

  const MASK_SCALE = 0.25;
  const PAINT_SCALE = 0.5;
  const PAINT_MAX = 1024;

  interface Target {
    fbo: WebGLFramebuffer;
    texture: WebGLTexture;
  }

  function createTarget(width: number, height: number): Target {
    const texture = gl!.createTexture()!;
    gl!.bindTexture(gl!.TEXTURE_2D, texture);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
    gl!.texImage2D(
      gl!.TEXTURE_2D,
      0,
      halfFloat ? gl!.RGBA16F : gl!.RGBA8,
      width,
      height,
      0,
      gl!.RGBA,
      halfFloat ? gl!.HALF_FLOAT : gl!.UNSIGNED_BYTE,
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
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
    return { fbo, texture };
  }

  function releaseTarget(target: Target | null) {
    if (!target) return;
    gl!.deleteFramebuffer(target.fbo);
    gl!.deleteTexture(target.texture);
  }

  let paintRead: Target | null = null;
  let paintWrite: Target | null = null;
  let paintWidth = 0;
  let paintHeight = 0;

  function syncPaintTargets() {
    const scale = Math.min(
      1,
      PAINT_MAX / Math.max(output.clientWidth, output.clientHeight, 1),
    );
    const width = Math.max(
      1,
      Math.round(output.clientWidth * PAINT_SCALE * scale),
    );
    const height = Math.max(
      1,
      Math.round(output.clientHeight * PAINT_SCALE * scale),
    );
    if (width === paintWidth && height === paintHeight) return;
    releaseTarget(paintRead);
    releaseTarget(paintWrite);
    paintWidth = width;
    paintHeight = height;
    paintRead = createTarget(width, height);
    paintWrite = createTarget(width, height);
  }

  const maskCanvas = document.createElement("canvas");
  const maskCtx = maskCanvas.getContext("2d");
  let maskDirty = false;
  let maskTimer = 0;
  let maskStamp = 0;

  function buildTextMask() {
    if (!maskCtx) return;
    const bounds = output.getBoundingClientRect();
    const width = Math.max(1, Math.round(bounds.width * MASK_SCALE));
    const height = Math.max(1, Math.round(bounds.height * MASK_SCALE));
    if (maskCanvas.width !== width || maskCanvas.height !== height) {
      maskCanvas.width = width;
      maskCanvas.height = height;
    }
    maskCtx.clearRect(0, 0, width, height);
    maskCtx.fillStyle = "#fff";
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT);
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
        maskCtx.fillRect(
          (r.left - bounds.left - 1) * MASK_SCALE,
          (r.top - bounds.top - 1) * MASK_SCALE,
          (r.width + 2) * MASK_SCALE,
          (r.height + 2) * MASK_SCALE,
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
    if (maskTimer) return;
    const wait = Math.max(0, 120 - (performance.now() - maskStamp));
    maskTimer = window.setTimeout(() => {
      maskTimer = 0;
      maskStamp = performance.now();
      buildTextMask();
      start();
    }, wait);
  }

  let contentMaxX = 1;

  function syncCanvasSize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(output.clientWidth * dpr));
    const height = Math.max(1, Math.round(output.clientHeight * dpr));
    if (output.width !== width || output.height !== height) {
      output.width = width;
      output.height = height;
    }
    contentMaxX = Math.min(
      1,
      Math.max(0.05, content.clientWidth / Math.max(output.clientWidth, 1)),
    );
    if (htmlInCanvas) {
      const cssWidth = Math.max(1, Math.round(source.clientWidth));
      const cssHeight = Math.max(1, Math.round(source.clientHeight));
      if (
        source.width !== cssWidth * dpr ||
        source.height !== cssHeight * dpr
      ) {
        source.width = cssWidth * dpr;
        source.height = cssHeight * dpr;
      }
      paintable.requestPaint!();
    }
    syncPaintTargets();
  }

  syncCanvasSize();

  const pointer = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, active: 0, target: 0 };
  let prevPaintX = 0.5;
  let prevPaintY = 0.5;
  let lastPaintScrollX = 0;
  let lastPaintScrollY = 0;
  let paintSeeded = false;
  let activeUntil = 0;

  let introStart = -1;
  let contentReady = false;
  let introDone = false;

  function introProgress(now: number): number {
    if (!contentReady) {
      introDone = !htmlInCanvas;
      return 0;
    }
    if (config.intro <= 0 || reducedMotion) {
      introDone = true;
      return 1;
    }
    const p = Math.min((now - introStart) / (config.intro * 1000), 1);
    if (p >= 1) introDone = true;
    return p * p * (3 - 2 * p);
  }

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
      source,
    );
    if (!contentReady) {
      contentReady = true;
      introStart = performance.now();
    }
  }

  function uploadMask() {
    if (!maskDirty) return;
    maskDirty = false;
    gl!.bindTexture(gl!.TEXTURE_2D, textMaskTexture);
    gl!.texImage2D(
      gl!.TEXTURE_2D,
      0,
      gl!.RGBA,
      gl!.RGBA,
      gl!.UNSIGNED_BYTE,
      maskCanvas,
    );
  }

  function stepPaint(delta: number, now: number) {
    if (!paintRead || !paintWrite) return;
    const cssW = Math.max(output.clientWidth, 1);
    const cssH = Math.max(output.clientHeight, 1);
    const scrollX = content.scrollLeft;
    const scrollY = content.scrollTop;
    if (!paintSeeded) {
      lastPaintScrollX = scrollX;
      lastPaintScrollY = scrollY;
      prevPaintX = pointer.x;
      prevPaintY = pointer.y;
      paintSeeded = true;
    }

    const dry = Math.max(config.dry, 0.05);
    const travel = Math.hypot(pointer.x - prevPaintX, pointer.y - prevPaintY);
    const stroke = Math.min(travel / Math.max(config.radius * 0.6, 1e-4), 1.5);
    const painting =
      pointer.active > 0.02 && config.relief > 0.001 && !reducedMotion;
    const deposit = painting ? Math.min(stroke * 0.32, 0.45) : 0;
    if (deposit > 1e-4) activeUntil = now + dry * 1000 + 400;

    gl!.useProgram(paintProgram);
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, paintRead.texture);
    gl!.uniform1i(paintUniforms.uState, 0);
    gl!.uniform2f(paintUniforms.uTexel, 1 / paintWidth, 1 / paintHeight);
    gl!.uniform2f(
      paintUniforms.uShift,
      (scrollX - lastPaintScrollX) / cssW,
      -(scrollY - lastPaintScrollY) / cssH,
    );
    gl!.uniform2f(paintUniforms.uPoint, pointer.x, pointer.y);
    gl!.uniform2f(paintUniforms.uPrevPoint, prevPaintX, prevPaintY);
    gl!.uniform1f(paintUniforms.uAspect, cssW / cssH);
    gl!.uniform1f(paintUniforms.uRadius, Math.max(config.radius, 0.005));
    gl!.uniform1f(paintUniforms.uDeposit, deposit);
    gl!.uniform1f(paintUniforms.uBristle, config.bristle);
    gl!.uniform1f(paintUniforms.uLevel, 1 - Math.exp(-delta * 2));
    gl!.uniform1f(paintUniforms.uDecay, Math.exp((-delta / dry) * 3));
    gl!.uniform1f(paintUniforms.uDryRate, Math.exp((-delta / (dry * 0.6)) * 3));

    gl!.bindFramebuffer(gl!.FRAMEBUFFER, paintWrite.fbo);
    gl!.viewport(0, 0, paintWidth, paintHeight);
    gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);

    const swap = paintRead;
    paintRead = paintWrite;
    paintWrite = swap;
    lastPaintScrollX = scrollX;
    lastPaintScrollY = scrollY;
    prevPaintX = pointer.x;
    prevPaintY = pointer.y;
  }

  function render(now: number) {
    uploadContent();
    uploadMask();
    gl!.useProgram(program);
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, contentTexture);
    gl!.uniform1i(uniforms.uContent, 0);
    gl!.activeTexture(gl!.TEXTURE1);
    gl!.bindTexture(gl!.TEXTURE_2D, textMaskTexture);
    gl!.uniform1i(uniforms.uTextMask, 1);
    gl!.uniform2f(uniforms.uResolution, output.width, output.height);
    const dpr = output.width / Math.max(output.clientWidth, 1);
    gl!.uniform1f(uniforms.uThreadSize, Math.max(config.threadSize, 1) * dpr);
    gl!.uniform1f(uniforms.uThreadWidth, config.threadWidth);
    gl!.uniform1f(uniforms.uTexture, config.texture);
    gl!.uniform3f(
      uniforms.uTint,
      config.tint[0],
      config.tint[1],
      config.tint[2],
    );
    gl!.uniform1f(uniforms.uTintStrength, config.tintStrength);
    gl!.uniform1f(uniforms.uGrain, config.grain);
    gl!.uniform1f(uniforms.uHalftone, config.halftone);
    gl!.uniform1f(uniforms.uDotSize, Math.max(config.dotSize, 1.5) * dpr);
    gl!.uniform1f(uniforms.uStrength, config.strength);
    gl!.activeTexture(gl!.TEXTURE2);
    gl!.bindTexture(gl!.TEXTURE_2D, paintRead ? paintRead.texture : null);
    gl!.uniform1i(uniforms.uPaint, 2);
    gl!.uniform2f(
      uniforms.uPaintTexel,
      1 / Math.max(paintWidth, 1),
      1 / Math.max(paintHeight, 1),
    );
    gl!.uniform1f(uniforms.uRelief, config.relief);
    gl!.uniform1f(uniforms.uGloss, config.gloss);
    gl!.uniform1f(uniforms.uIntro, introProgress(now));
    gl!.uniform1f(uniforms.uMaxX, contentMaxX);
    gl!.uniform2f(
      uniforms.uScroll,
      content.scrollLeft * dpr,
      -content.scrollTop * dpr,
    );
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
    const ease = reducedMotion
      ? 1
      : 1 - Math.exp(-delta * Math.max(config.followSpeed, 0.5));
    pointer.x += (pointer.tx - pointer.x) * ease;
    pointer.y += (pointer.ty - pointer.y) * ease;
    pointer.active += (pointer.target - pointer.active) * ease;
    stepPaint(delta, now);
    render(now);
    const drying = now < activeUntil;
    const settled =
      Math.abs(pointer.tx - pointer.x) < 5e-4 &&
      Math.abs(pointer.ty - pointer.y) < 5e-4 &&
      Math.abs(pointer.target - pointer.active) < 1e-3 &&
      introDone &&
      !drying;
    if (settled && !contentDirty) {
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
  start();

  function onMotionChange() {
    reducedMotion = motionQuery.matches;
    start();
  }
  motionQuery.addEventListener("change", onMotionChange);

  const observer = new ResizeObserver(() => {
    syncCanvasSize();
    scheduleTextMask();
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
    pointer.tx = (event.clientX - rect.left) / Math.max(rect.width, 1);
    pointer.ty = 1 - (event.clientY - rect.top) / Math.max(rect.height, 1);
    pointer.target = 1;
    start();
  }

  function onPointerLeave() {
    pointer.target = 0;
    start();
  }

  function onScroll() {
    scheduleTextMask();
    start();
  }

  listenTarget.addEventListener("pointermove", onPointerMove, { passive: true });
  listenTarget.addEventListener("pointerleave", onPointerLeave, { passive: true });
  content.addEventListener("scroll", onScroll, {
    capture: true,
    passive: true,
  });
  scheduleTextMask();

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
      scheduleTextMask();
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
      window.clearTimeout(maskTimer);
      observer.disconnect();
      intersection.disconnect();
      motionQuery.removeEventListener("change", onMotionChange);
      listenTarget.removeEventListener("pointermove", onPointerMove);
      listenTarget.removeEventListener("pointerleave", onPointerLeave);
      content.removeEventListener("scroll", onScroll, {
        capture: true,
      });
      gl!.deleteTexture(contentTexture);
      gl!.deleteTexture(textMaskTexture);
      releaseTarget(paintRead);
      releaseTarget(paintWrite);
      paintRead = null;
      paintWrite = null;
      gl!.deleteProgram(program);
      gl!.deleteProgram(paintProgram);
      gl!.deleteShader(vertexShader);
      gl!.deleteShader(fragmentShader);
      gl!.deleteShader(paintShader);
      gl!.deleteBuffer(quad);
      if (htmlInCanvas) paintable.onpaint = null;
    },
  };
}
