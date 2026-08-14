import { createRectCache } from "../rect-cache";

export interface RetroDitherOptions {
  /** Radius of the dither lens around the cursor, relative to the screen height. */
  radius?: number;
  /** Edge feather of the lens as a fraction of the radius (0 to 1). */
  softness?: number;
  /** Size of the retro pixels in CSS pixels. */
  pixelSize?: number;
  /** Number of brightness levels the dither quantizes to. */
  levels?: number;
  /** Dark end of the palette as [r, g, b] in 0-1 range. */
  darkColor?: [number, number, number];
  /** Light end of the palette as [r, g, b] in 0-1 range. */
  lightColor?: [number, number, number];
  /** Blend from the content's own colors (0) to the palette (1). */
  colorize?: number;
  /** Contrast applied to brightness before dithering. */
  contrast?: number;
  /** Brightness offset applied before dithering (-1 to 1). */
  brightness?: number;
  /** Coverage of the dithered pixels inside the lens (0 to 1). */
  strength?: number;
  /** Dither coverage across the whole screen, outside the lens (0 to 1). */
  baseStrength?: number;
  /** Invert brightness inside the effect (0 to 1). */
  invert?: number;
  /** Intensity of the retro scanline overlay (0 to 1). */
  scanlines?: number;
  /** Dither pattern used for intermediate levels. */
  pattern?: "bayer" | "halftone" | "hatch" | "dash";
  /** Phosphor burn-in: the lens leaves a fading ghost along the cursor path (0 to 1). */
  trail?: number;
  /** Strength of the degauss ripple triggered on click (0 to 1). */
  degauss?: number;
  /** How quickly the lens follows the cursor. Higher is snappier. */
  followSpeed?: number;
}

export interface RetroDitherElements {
  /** Canvas with layoutsubtree that hosts the HTML content. */
  source: HTMLCanvasElement;
  /** The element inside the source canvas that gets captured. */
  content: HTMLElement;
  /** Canvas the WebGL effect renders to. */
  output: HTMLCanvasElement;
}

export interface RetroDitherInstance {
  /** Update effect options live. */
  setOptions: (options: RetroDitherOptions) => void;
  /** Re-read canvas size. Call when the element is resized. */
  resize: () => void;
  /** Stop the loop and release all GPU resources. */
  destroy: () => void;
}

const DEFAULTS: Required<RetroDitherOptions> = {
  radius: 0.5,
  softness: 1,
  pixelSize: 2,
  levels: 4,
  darkColor: [0, 0, 0],
  lightColor: [1, 1, 1],
  colorize: 0.1,
  contrast: 0.6,
  brightness: 0,
  strength: 0.75,
  baseStrength: 0,
  invert: 0,
  scanlines: 0,
  pattern: "bayer",
  trail: 0.4,
  degauss: 0.8,
  followSpeed: 3,
};

const PATTERNS = { bayer: 0, halftone: 1, hatch: 2, dash: 3 } as const;

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

const TRAIL_N = 24;
const RIPPLE_N = 3;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uContent;
uniform vec2 uResolution;
uniform float uPixelSize;
uniform float uLevels;
uniform float uRadius;
uniform float uSoftness;
uniform vec2 uPointer;
uniform float uActive;
uniform vec3 uDark;
uniform vec3 uLight;
uniform float uColorize;
uniform float uContrast;
uniform float uBrightness;
uniform float uStrength;
uniform float uBase;
uniform float uInvert;
uniform float uScanlines;
uniform float uMaxX;
uniform sampler2D uTextMask;
uniform int uPattern;
uniform vec3 uTrail[${TRAIL_N}];
uniform vec4 uRipples[${RIPPLE_N}];

#define S(a, b, t) smoothstep(a, b, t)

float bayer (ivec2 p) {
  int b[16] = int[16](0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5);
  return (float(b[(p.y % 4) * 4 + (p.x % 4)]) + 0.5) / 16.0;
}

float patternThreshold (ivec2 cell) {
  if (uPattern == 1) {
    vec2 p = vec2(cell % 4) - 1.5;
    return clamp(length(p) / 2.6, 0.03, 0.97);
  }
  if (uPattern == 2) {
    return fract(float(cell.x + cell.y) * 0.25 + 0.125);
  }
  if (uPattern == 3) {
    return fract(float(cell.x) * 0.25 + float(cell.y % 2) * 0.5 + 0.125);
  }
  return bayer(cell);
}

float ditherQuant (float v, ivec2 cell) {
  float x = v * uLevels;
  return floor(x + step(patternThreshold(cell), fract(x))) / uLevels;
}

void main () {
  vec2 uv = vUv;

  if (uv.x > uMaxX) {
    outColor = vec4(0.0);
    return;
  }

  float aspect = uResolution.x / uResolution.y;

  float rippleReveal = 0.0;
  vec2 rippleWarp = vec2(0.0);
  for (int i = 0; i < ${RIPPLE_N}; i++) {
    float amp = uRipples[i].w;
    if (amp <= 0.001) continue;
    vec2 toUv = (uv - uRipples[i].xy) * vec2(aspect, 1.0);
    float d = length(toUv);
    float band = exp(-pow((d - uRipples[i].z) / 0.07, 2.0)) * amp;
    rippleReveal = max(rippleReveal, band);
    rippleWarp += normalize(toUv + 1e-5) * band * 0.012 / vec2(aspect, 1.0);
  }
  uv = clamp(uv + rippleWarp, vec2(0.0), vec2(uMaxX, 1.0));

  vec4 content = texture(uContent, vec2(uv.x, 1.0 - uv.y));

  vec2 frag = uv * uResolution;
  vec2 cell = floor(frag / uPixelSize);
  vec2 cellUv = (cell + 0.5) * uPixelSize / uResolution;
  cellUv = clamp(cellUv, vec2(0.001), vec2(uMaxX - 0.002, 0.999));
  vec4 pixel = texture(uContent, vec2(cellUv.x, 1.0 - cellUv.y));
  float rawLum = dot(pixel.rgb, vec3(0.299, 0.587, 0.114));

  float textness = texture(uTextMask, vec2(uv.x, 1.0 - uv.y)).r;
  float crisp = 0.0;
  if (textness > 0.4) {
    float px = max(uPixelSize * 0.25, 1.0);
    vec2 fineUv = (floor(frag / px) + 0.5) * px / uResolution;
    fineUv = clamp(fineUv, vec2(0.001), vec2(uMaxX - 0.002, 0.999));
    vec4 fine = texture(uContent, vec2(fineUv.x, 1.0 - fineUv.y));
    float fineLum = dot(fine.rgb, vec3(0.299, 0.587, 0.114));
    if (abs(fineLum - rawLum) > 0.1) {
      crisp = 1.0;
      pixel = fine;
      rawLum = fineLum;
    }
  }

  float contrastAmt = mix(uContrast, max(uContrast, 0.5), crisp);
  float brightAmt = uBrightness * mix(1.0, 0.3, crisp);
  float lum = clamp((rawLum - 0.5) * contrastAmt + 0.5 + brightAmt, 0.0, 1.0);
  lum = mix(lum, 1.0 - lum, clamp(uInvert, 0.0, 1.0));
  float q = crisp > 0.5
    ? clamp(floor(lum * uLevels + 0.5) / uLevels, 0.0, 1.0)
    : ditherQuant(lum, ivec2(cell));

  vec3 palette = mix(uDark, uLight, q);
  vec3 keepHue = pixel.rgb * (q / max(lum, 0.001));
  vec3 dithered = mix(keepHue, palette, clamp(uColorize, 0.0, 1.0));
  float scanAmp = mix(0.45, 0.15, crisp);
  dithered *= 1.0 - uScanlines * scanAmp * mod(cell.y, 2.0);
  dithered *= 1.0 + rippleReveal * vec3(0.22, -0.06, 0.3);

  float dist = length((uv - uPointer) * vec2(aspect, 1.0));
  float radius = max(uRadius * uActive, 1e-4);
  float inner = radius * (1.0 - clamp(uSoftness, 0.0, 1.0));
  float lens = (1.0 - S(inner, radius, dist)) * uActive;

  float ghost = 0.0;
  for (int i = 0; i < ${TRAIL_N}; i++) {
    float amp = uTrail[i].z;
    if (amp <= 0.001) continue;
    float td = length((uv - uTrail[i].xy) * vec2(aspect, 1.0));
    float tr = max(uRadius * 0.8, 1e-4);
    ghost = max(ghost, (1.0 - S(tr * 0.2, tr, td)) * amp);
  }

  float mask = clamp(max(max(lens, ghost), clamp(uBase, 0.0, 1.0)), 0.0, 1.0)
    * clamp(uStrength, 0.0, 1.0);
  mask = clamp(max(mask, rippleReveal), 0.0, 1.0);

  float apply = step(bayer(ivec2(cell)), mask);

  vec3 col = mix(content.rgb, dithered, apply);
  float alpha = mix(content.a, pixel.a, apply);
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

export function createRetroDither(
  elements: RetroDitherElements,
  options: RetroDitherOptions = {},
): RetroDitherInstance | null {
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
      console.error("RetroDither shader error:", gl!.getShaderInfoLog(shader));
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
  }

  syncCanvasSize();

  const pointer = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, active: 0, target: 0 };

  const trailData = new Float32Array(TRAIL_N * 3);
  const trailPts: { x: number; y: number; t: number }[] = [];
  const rippleData = new Float32Array(RIPPLE_N * 4);
  const ripples: { x: number; y: number; t: number }[] = [];
  let fxAlive = false;

  function updateEffects(nowS: number) {
    fxAlive = false;
    if (config.trail > 0.001 && pointer.active > 0.1 && !reducedMotion) {
      const last = trailPts[trailPts.length - 1];
      if (!last || nowS - last.t >= 0.04) {
        trailPts.push({ x: pointer.x, y: pointer.y, t: nowS });
        if (trailPts.length > TRAIL_N) trailPts.shift();
      }
    }
    trailData.fill(0);
    for (let i = trailPts.length - 1; i >= 0; i--) {
      const p = trailPts[i];
      const age = nowS - p.t;
      const fade = Math.min(Math.max((0.95 - age) / 0.25, 0), 1);
      const s = config.trail * Math.exp(-age * 2.2) * fade;
      if (s < 0.005) {
        trailPts.splice(0, i + 1);
        break;
      }
      trailData[i * 3] = p.x;
      trailData[i * 3 + 1] = p.y;
      trailData[i * 3 + 2] = s;
      fxAlive = true;
    }
    rippleData.fill(0);
    for (let i = ripples.length - 1; i >= 0; i--) {
      if (nowS - ripples[i].t > 0.9) ripples.splice(i, 1);
    }
    for (let i = 0; i < ripples.length && i < RIPPLE_N; i++) {
      const age = nowS - ripples[i].t;
      rippleData[i * 4] = ripples[i].x;
      rippleData[i * 4 + 1] = ripples[i].y;
      rippleData[i * 4 + 2] = age * 1.2;
      rippleData[i * 4 + 3] = config.degauss * (1 - age / 0.9);
      fxAlive = true;
    }
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

  function render() {
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
    gl!.uniform1f(uniforms.uPixelSize, Math.max(config.pixelSize, 1) * dpr);
    gl!.uniform1f(uniforms.uLevels, Math.max(config.levels, 1));
    gl!.uniform1f(uniforms.uRadius, Math.max(config.radius, 0.01));
    gl!.uniform1f(uniforms.uSoftness, config.softness);
    gl!.uniform2f(uniforms.uPointer, pointer.x, pointer.y);
    gl!.uniform1f(uniforms.uActive, pointer.active);
    gl!.uniform3f(
      uniforms.uDark,
      config.darkColor[0],
      config.darkColor[1],
      config.darkColor[2],
    );
    gl!.uniform3f(
      uniforms.uLight,
      config.lightColor[0],
      config.lightColor[1],
      config.lightColor[2],
    );
    gl!.uniform1f(uniforms.uColorize, config.colorize);
    gl!.uniform1f(uniforms.uContrast, Math.max(config.contrast, 0));
    gl!.uniform1f(uniforms.uBrightness, config.brightness);
    gl!.uniform1f(uniforms.uStrength, config.strength);
    gl!.uniform1f(uniforms.uBase, config.baseStrength);
    gl!.uniform1f(uniforms.uInvert, config.invert);
    gl!.uniform1f(uniforms.uScanlines, config.scanlines);
    gl!.uniform1i(uniforms.uPattern, PATTERNS[config.pattern] ?? 0);
    gl!.uniform3fv(uniforms["uTrail[0]"], trailData);
    gl!.uniform4fv(uniforms["uRipples[0]"], rippleData);
    gl!.uniform1f(uniforms.uMaxX, contentMaxX);
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
    updateEffects(now / 1000);
    render();
    const settled =
      Math.abs(pointer.tx - pointer.x) < 5e-4 &&
      Math.abs(pointer.ty - pointer.y) < 5e-4 &&
      Math.abs(pointer.target - pointer.active) < 1e-3 &&
      !fxAlive;
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

  function onPointerDown(event: PointerEvent) {
    if (reducedMotion || config.degauss <= 0.001) return;
    const rect = rectCache.current;
    ripples.push({
      x: (event.clientX - rect.left) / Math.max(rect.width, 1),
      y: 1 - (event.clientY - rect.top) / Math.max(rect.height, 1),
      t: performance.now() / 1000,
    });
    if (ripples.length > RIPPLE_N) ripples.shift();
    start();
  }

  listenTarget.addEventListener("pointermove", onPointerMove, { passive: true });
  listenTarget.addEventListener("pointerleave", onPointerLeave, { passive: true });
  listenTarget.addEventListener("pointerdown", onPointerDown, { passive: true });
  content.addEventListener("scroll", scheduleTextMask, {
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
      listenTarget.removeEventListener("pointerdown", onPointerDown);
      content.removeEventListener("scroll", scheduleTextMask, {
        capture: true,
      });
      gl!.deleteTexture(contentTexture);
      gl!.deleteTexture(textMaskTexture);
      gl!.deleteProgram(program);
      gl!.deleteShader(vertexShader);
      gl!.deleteShader(fragmentShader);
      gl!.deleteBuffer(quad);
      if (htmlInCanvas) paintable.onpaint = null;
    },
  };
}
