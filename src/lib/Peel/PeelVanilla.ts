import { createRectCache } from "../rect-cache";

export type PeelSide = "left" | "right" | "top" | "bottom";

export type PeelMode = "cursor" | "hover";

export interface PeelOptions {
  /** Edge the content peels from. */
  side?: PeelSide;
  /** How the peel is driven. "cursor" peels progressively as the pointer nears the edge, "hover" peels fully when the pointer enters the zone. */
  mode?: PeelMode;
  /** How many CSS pixels of the under layer are exposed at full peel. */
  reveal?: number;
  /** Width of the strip along the chosen edge that drives the peel, in CSS pixels. */
  zone?: number;
  /** Radius of the curl in CSS pixels. Smaller values fold sharper. */
  curl?: number;
  /** Extra lift at the middle of the peeling edge in CSS pixels. Negative values bow the sheet inwards. */
  bow?: number;
  /** Strength of the curl shading on the lifted sheet (0 to 1). */
  shade?: number;
  /** Strength of the shine along the peeling edge that follows the cursor (0 to 1). */
  shine?: number;
  /** Distance from the edge at which the shine starts to appear, in CSS pixels. 0 uses the full container span. */
  shineDistance?: number;
  /** Shine color as RGB in the 0 to 1 range, or "auto" to follow the page theme: light shine on dark backgrounds, dark shine on light ones. Re-resolves on theme changes. */
  shineColor?: [number, number, number] | "auto";
  /** How many CSS pixels the peeled edge bulges toward the cursor. */
  bulge?: number;
  /** Perspective focal length in CSS pixels. Lower values exaggerate the 3D depth. */
  perspective?: number;
  /** Seconds the peel takes to settle. Higher feels more damped. */
  smoothing?: number;
}

export interface PeelElements {
  /** Canvas with layoutsubtree that hosts the HTML content. */
  source: HTMLCanvasElement;
  /** The element inside the source canvas that gets captured. */
  content: HTMLElement;
  /** Canvas the WebGL effect renders to. */
  output: HTMLCanvasElement;
  /** Element revealed underneath the peel. Kept hidden until the first capture is ready. */
  under?: HTMLElement;
}

export interface PeelInstance {
  /** Update effect options live. */
  setOptions: (options: PeelOptions) => void;
  /** Re-read canvas size. Call when the element is resized. */
  resize: () => void;
  /** Stop the loop and release all GPU resources. */
  destroy: () => void;
}

const DEFAULTS: Required<PeelOptions> = {
  side: "left",
  mode: "cursor",
  reveal: 250,
  zone: 200,
  curl: 300,
  bow: 75,
  shade: 0.25,
  shine: 1,
  shineDistance: 1200,
  shineColor: "auto",
  bulge: 50,
  perspective: 2000,
  smoothing: 0.3,
};

const SIDE_INDEX: Record<PeelSide, number> = {
  left: 0,
  right: 1,
  top: 2,
  bottom: 3,
};

type PaintableCanvas = HTMLCanvasElement & {
  onpaint?: (() => void) | null;
  requestPaint?: () => void;
};

type ElementImageContext = CanvasRenderingContext2D & {
  drawElementImage?: (element: Element, x: number, y: number) => void;
};

const SHEET_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aGrid;
uniform vec2 uRes;
uniform float uSide;
uniform float uPeel;
uniform float uReveal;
uniform float uCurl;
uniform float uBow;
uniform float uFocal;
uniform float uZone;
uniform float uBulge;
uniform vec2 uPointer;
out vec2 vUv;
out float vShade;
out vec2 vSide;

const float PI = 3.1415926;

void main () {
  vUv = aGrid;
  vec2 p = aGrid * uRes;
  float crossLen = (uSide < 1.5) ? uRes.y : uRes.x;
  float u; float v;
  if (uSide < 0.5) { u = p.x; v = p.y; }
  else if (uSide < 1.5) { u = uRes.x - p.x; v = p.y; }
  else if (uSide < 2.5) { u = p.y; v = p.x; }
  else { u = uRes.y - p.y; v = p.x; }

  float A = clamp(uPeel, 0.0, 1.0);
  float f = A * uReveal;
  float R = max(uCurl * A, 0.001);
  float c0 = f + R;

  float dvB = (uPointer.y - v) / max(crossLen * 0.28, 1.0);
  float prox = clamp(1.0 - uPointer.x / max(c0 + uZone, 1.0), 0.0, 1.0);
  float c = c0 + uBulge * A * prox * prox * exp(-dvB * dvB);

  float x = u;
  float z = 0.0;
  float sh = 0.0;
  if (A > 0.001 && u < c) {
    float theta = (c - u) / R;
    if (theta <= PI) {
      x = c - R * sin(theta);
      z = R * (1.0 - cos(theta));
    } else {
      x = c + (theta - PI) * R;
      z = 2.0 * R;
    }
    sh = sin(clamp(theta, 0.0, PI));
  }
  z += uBow * A * sin(PI * v / max(crossLen, 1.0)) * clamp(z / max(R, 1.0), 0.0, 1.5);
  z = clamp(z, -uFocal * 0.2, uFocal * 0.45);
  vShade = sh * smoothstep(0.0, 0.08, A);
  vSide = vec2(u, v);

  vec2 q;
  if (uSide < 0.5) q = vec2(x, v);
  else if (uSide < 1.5) q = vec2(uRes.x - x, v);
  else if (uSide < 2.5) q = vec2(v, x);
  else q = vec2(v, uRes.y - x);

  vec2 ndc = (q / uRes) * 2.0 - 1.0;
  ndc.y = -ndc.y;
  float w = (uFocal - z) / uFocal;
  gl_Position = vec4(ndc, -z / uFocal, w);
}`;

const SHEET_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
in float vShade;
in vec2 vSide;
out vec4 outColor;
uniform sampler2D uContent;
uniform float uShade;
uniform float uMaxX;
uniform float uShine;
uniform vec3 uShineColor;
uniform float uCross;
uniform float uSpan;
uniform vec2 uPointer;

void main () {
  vec2 uv = clamp(vUv, vec2(0.001), vec2(uMaxX - 0.001, 0.999));
  vec4 tex = texture(uContent, uv);
  float sh = 1.0 - clamp(uShade, 0.0, 1.0) * 0.7 * pow(max(vShade, 0.0), 1.3);
  float du = max(vSide.x, 0.0);
  float line = exp(-du / 2.5) + exp(-du / 18.0) * 0.25;
  float dv = (vSide.y - uPointer.y) / max(uCross * 0.45, 1.0);
  float prox = clamp(1.0 - uPointer.x / max(uSpan, 1.0), 0.0, 1.0);
  float shine = uShine * line * exp(-dv * dv) * prox * prox;
  vec3 rgb = mix(tex.rgb * sh, uShineColor, clamp(shine, 0.0, 1.0));
  outColor = vec4(rgb * tex.a, tex.a);
}`;

const SEG = 96;

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

export function createPeel(
  elements: PeelElements,
  options: PeelOptions = {},
): PeelInstance | null {
  const config = { ...DEFAULTS, ...options };
  const { source, content, output, under } = elements;

  const gl = output.getContext("webgl2", {
    alpha: true,
    depth: true,
    stencil: false,
    antialias: true,
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

  let wake = () => {};
  let capture = () => {};

  if (htmlInCanvas) {
    paintable.onpaint = () => capture();
  }

  function compile(type: number, text: string): WebGLShader {
    const shader = gl!.createShader(type)!;
    gl!.shaderSource(shader, text);
    gl!.compileShader(shader);
    if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) {
      console.error("Peel shader error:", gl!.getShaderInfoLog(shader));
    }
    return shader;
  }

  function link(vertText: string, fragText: string) {
    const vert = compile(gl!.VERTEX_SHADER, vertText);
    const frag = compile(gl!.FRAGMENT_SHADER, fragText);
    const program = gl!.createProgram()!;
    gl!.attachShader(program, vert);
    gl!.attachShader(program, frag);
    gl!.linkProgram(program);
    const uniforms: Record<string, WebGLUniformLocation> = {};
    const count = gl!.getProgramParameter(program, gl!.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const info = gl!.getActiveUniform(program, i)!;
      uniforms[info.name] = gl!.getUniformLocation(program, info.name)!;
    }
    return { program, vert, frag, uniforms };
  }

  const sheet = link(SHEET_VERT, SHEET_FRAG);

  const gridVerts = new Float32Array((SEG + 1) * (SEG + 1) * 2);
  for (let y = 0; y <= SEG; y++) {
    for (let x = 0; x <= SEG; x++) {
      const i = (y * (SEG + 1) + x) * 2;
      gridVerts[i] = x / SEG;
      gridVerts[i + 1] = y / SEG;
    }
  }
  const gridIndices = new Uint32Array(SEG * SEG * 6);
  let offset = 0;
  for (let y = 0; y < SEG; y++) {
    for (let x = 0; x < SEG; x++) {
      const a = y * (SEG + 1) + x;
      const b = a + 1;
      const c = a + SEG + 1;
      const d = c + 1;
      gridIndices[offset++] = a;
      gridIndices[offset++] = c;
      gridIndices[offset++] = b;
      gridIndices[offset++] = b;
      gridIndices[offset++] = c;
      gridIndices[offset++] = d;
    }
  }

  const sheetVao = gl.createVertexArray();
  gl.bindVertexArray(sheetVao);
  const gridBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, gridBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, gridVerts, gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const indexBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, gridIndices, gl.STATIC_DRAW);
  gl.bindVertexArray(null);

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

  let contentMaxX = 1;
  let hasTexture = false;

  if (under && htmlInCanvas) under.style.visibility = "hidden";

  capture = () => {
    if (!htmlInCanvas) return;
    try {
      sourceCtx!.reset();
      sourceCtx!.drawElementImage!(content, 0, 0);
      gl!.bindTexture(gl!.TEXTURE_2D, contentTexture);
      gl!.texImage2D(
        gl!.TEXTURE_2D,
        0,
        gl!.RGBA,
        gl!.RGBA,
        gl!.UNSIGNED_BYTE,
        source,
      );
      sourceCtx!.reset();
      hasTexture = true;
      wake();
    } catch {}
  };

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
      if (source.width !== cssWidth * dpr || source.height !== cssHeight * dpr) {
        source.width = cssWidth * dpr;
        source.height = cssHeight * dpr;
      }
      paintable.requestPaint!();
    }
  }

  const peel = { a: 0, target: 0 };
  const FAR = 1e4;
  const pointer = { u: FAR, v: 0, su: FAR, sv: 0 };

  let shineRgb: [number, number, number] = [1, 1, 1];
  const probe = document.createElement("canvas");
  probe.width = probe.height = 1;
  const probeCtx = probe.getContext("2d", { willReadFrequently: true });

  function syncShineColor() {
    if (config.shineColor !== "auto") {
      shineRgb = config.shineColor;
      return;
    }
    let luminance = 1;
    if (probeCtx) {
      let el: Element | null = content;
      while (el) {
        const bg = getComputedStyle(el).backgroundColor;
        if (bg && bg !== "transparent") {
          probeCtx.clearRect(0, 0, 1, 1);
          probeCtx.fillStyle = bg;
          probeCtx.fillRect(0, 0, 1, 1);
          const [r, g, b, a] = probeCtx.getImageData(0, 0, 1, 1).data;
          if (a > 0) {
            luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
            break;
          }
        }
        el = el.parentElement;
      }
    }
    shineRgb = luminance > 0.5 ? [0, 0, 0] : [1, 1, 1];
  }

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reducedMotion = motionQuery.matches;

  syncCanvasSize();
  syncShineColor();

  function render() {
    if (under && hasTexture && under.style.visibility === "hidden") {
      under.style.visibility = "";
    }
    const w = Math.max(output.clientWidth, 1);
    const h = Math.max(output.clientHeight, 1);
    const side = SIDE_INDEX[config.side] ?? 0;

    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
    gl!.viewport(0, 0, output.width, output.height);
    gl!.clearColor(0, 0, 0, 0);
    gl!.clearDepth(1);
    gl!.clear(gl!.COLOR_BUFFER_BIT | gl!.DEPTH_BUFFER_BIT);
    gl!.enable(gl!.BLEND);
    gl!.blendFunc(gl!.ONE, gl!.ONE_MINUS_SRC_ALPHA);

    gl!.enable(gl!.DEPTH_TEST);
    gl!.depthFunc(gl!.LEQUAL);
    gl!.useProgram(sheet.program);
    gl!.bindVertexArray(sheetVao);
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, contentTexture);
    gl!.uniform1i(sheet.uniforms.uContent, 0);
    gl!.uniform2f(sheet.uniforms.uRes, w, h);
    gl!.uniform1f(sheet.uniforms.uSide, side);
    gl!.uniform1f(sheet.uniforms.uPeel, peel.a);
    gl!.uniform1f(sheet.uniforms.uReveal, Math.max(config.reveal, 0));
    gl!.uniform1f(sheet.uniforms.uCurl, Math.max(config.curl, 1));
    gl!.uniform1f(sheet.uniforms.uBow, config.bow);
    gl!.uniform1f(sheet.uniforms.uFocal, Math.max(config.perspective, 200));
    gl!.uniform1f(sheet.uniforms.uShade, config.shade);
    gl!.uniform1f(sheet.uniforms.uZone, Math.max(config.zone, 1));
    gl!.uniform1f(sheet.uniforms.uBulge, Math.max(config.bulge, 0));
    gl!.uniform1f(sheet.uniforms.uShine, Math.max(config.shine, 0));
    gl!.uniform3f(
      sheet.uniforms.uShineColor,
      shineRgb[0],
      shineRgb[1],
      shineRgb[2],
    );
    gl!.uniform1f(sheet.uniforms.uCross, side < 1.5 ? h : w);
    gl!.uniform1f(
      sheet.uniforms.uSpan,
      config.shineDistance > 0 ? config.shineDistance : side < 1.5 ? w : h,
    );
    gl!.uniform2f(sheet.uniforms.uPointer, pointer.su, pointer.sv);
    gl!.uniform1f(sheet.uniforms.uMaxX, contentMaxX);
    gl!.drawElements(gl!.TRIANGLES, gridIndices.length, gl!.UNSIGNED_INT, 0);
    gl!.bindVertexArray(null);
    gl!.disable(gl!.DEPTH_TEST);
  }

  function syncContentEvents() {
    const A = peel.a;
    const R = Math.max(config.curl * A, 0.001);
    const c = A * config.reveal + R + Math.max(config.bulge, 0) * A;
    const tailEnd = Math.max(c, 2 * c - Math.PI * R);
    const blocked = A > 0.02 && pointer.u < tailEnd;
    const next = blocked ? "none" : "auto";
    if (content.style.pointerEvents !== next) {
      content.style.pointerEvents = next;
    }
  }

  let raf = 0;
  let lastTime = performance.now();
  let destroyed = false;
  let running = false;
  let visible = true;

  function updateTarget() {
    if (config.mode === "hover") {
      const open = peel.target > 0.5;
      const limit = open ? peel.a * config.reveal + config.zone : config.zone;
      peel.target = pointer.u < limit ? 1 : 0;
      return;
    }
    const span = Math.max(config.zone + peel.a * config.reveal, 1);
    peel.target = Math.min(1, Math.max(0, 1 - pointer.u / span));
  }

  function frame(now: number) {
    if (destroyed) return;
    if (!visible) {
      running = false;
      return;
    }
    const delta = Math.min((now - lastTime) / 1000, 1 / 30);
    lastTime = now;
    const tau = Math.max(config.smoothing, 1e-4);
    const k = reducedMotion ? 1 : 1 - Math.exp(-delta / tau);
    const kp = reducedMotion ? 1 : 1 - Math.exp(-delta / (tau * 0.45));
    pointer.su += (pointer.u - pointer.su) * kp;
    pointer.sv += (pointer.v - pointer.sv) * kp;
    updateTarget();
    peel.a += (peel.target - peel.a) * k;
    syncContentEvents();
    render();
    const settle = 0.5 / Math.max(config.reveal + config.curl, 1);
    if (
      Math.abs(peel.target - peel.a) < settle &&
      Math.abs(pointer.u - pointer.su) < 0.5 &&
      Math.abs(pointer.v - pointer.sv) < 0.5
    ) {
      peel.a = peel.target;
      pointer.su = pointer.u;
      pointer.sv = pointer.v;
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

  let themeTimer = 0;
  function onThemeShift() {
    syncShineColor();
    start();
    window.clearTimeout(themeTimer);
    themeTimer = window.setTimeout(() => {
      syncShineColor();
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

  const observer = new ResizeObserver(() => {
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

  function sideDistance(x: number, y: number, rect: DOMRect): number {
    if (config.side === "right") return rect.width - x;
    if (config.side === "top") return y;
    if (config.side === "bottom") return rect.height - y;
    return x;
  }

  const rectCache = createRectCache(output);

  function onPointerMove(event: PointerEvent) {
    if (!htmlInCanvas) return;
    const rect = rectCache.current;
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    pointer.u = sideDistance(x, y, rect);
    pointer.v = config.side === "top" || config.side === "bottom" ? x : y;
    updateTarget();
    start();
  }

  function onPointerLeave() {
    pointer.u = FAR;
    peel.target = 0;
    start();
  }

  listenTarget.addEventListener("pointermove", onPointerMove, { passive: true });
  listenTarget.addEventListener("pointerleave", onPointerLeave, { passive: true });

  return {
    setOptions(next) {
      if (
        !Object.entries(next).some(
          ([key, value]) => config[key as keyof PeelOptions] !== value,
        )
      )
        return;
      Object.assign(config, next);
      syncShineColor();
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
      themeObserver.disconnect();
      schemeQuery.removeEventListener("change", onThemeShift);
      window.clearTimeout(themeTimer);
      motionQuery.removeEventListener("change", onMotionChange);
      listenTarget.removeEventListener("pointermove", onPointerMove);
      listenTarget.removeEventListener("pointerleave", onPointerLeave);
      content.style.pointerEvents = "";
      if (under) under.style.visibility = "";
      gl!.deleteTexture(contentTexture);
      gl!.deleteProgram(sheet.program);
      gl!.deleteShader(sheet.vert);
      gl!.deleteShader(sheet.frag);
      gl!.deleteBuffer(gridBuffer);
      gl!.deleteBuffer(indexBuffer);
      gl!.deleteVertexArray(sheetVao);
      if (htmlInCanvas) paintable.onpaint = null;
    },
  };
}
