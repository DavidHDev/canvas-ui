export interface HologramOptions {
  /** Overall intensity of the hologram effect (0 to 2). */
  intensity?: number;
  /** Speed of the scrolling phase shift / wave animation. */
  speed?: number;
  /** Density of vertical scanlines (1 = very few, 20 = very dense). */
  scanlines?: number;
  /** Chromatic RGB fringing offset in CSS pixels. */
  rgbShift?: number;
  /** Amount of random brightness flicker (0 to 1). */
  flicker?: number;
  /** Cyan/blue tint strength (0 to 1). */
  tint?: number;
  /** Overall opacity of the hologram overlay (0 to 1). */
  opacity?: number;
  /** Horizontal phase wave amplitude in CSS pixels. */
  wave?: number;
}

export interface HologramElements {
  /** Canvas with layoutsubtree that hosts the HTML content. */
  source: HTMLCanvasElement;
  /** The element inside the source canvas that gets captured. */
  content: HTMLElement;
  /** Canvas the WebGL effect renders to. */
  output: HTMLCanvasElement;
}

export interface HologramInstance {
  /** Update effect options live. */
  setOptions: (options: HologramOptions) => void;
  /** Re-read canvas size. Call when the element is resized. */
  resize: () => void;
  /** Stop the loop and release all GPU resources. */
  destroy: () => void;
}

const DEFAULTS: Required<HologramOptions> = {
  intensity: 1,
  speed: 0.5,
  scanlines: 12,
  rgbShift: 2,
  flicker: 0.15,
  tint: 0.6,
  opacity: 0.85,
  wave: 3,
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
uniform vec2 uResolution;
uniform float uTime;
uniform float uIntensity;
uniform float uSpeed;
uniform float uScanlines;
uniform float uRgbShift;
uniform float uFlicker;
uniform float uTint;
uniform float uOpacity;
uniform float uWave;
uniform float uMaxX;

float hash (vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec4 page (vec2 p) {
  p.x = clamp(p.x, 0.0005, uMaxX - 0.0005);
  p.y = clamp(p.y, 0.0005, 0.9995);
  return texture(uContent, vec2(p.x, 1.0 - p.y));
}

void main () {
  vec2 uv = vUv;
  if (uv.x > uMaxX) {
    outColor = vec4(0.0);
    return;
  }

  float intensity = uIntensity;
  if (intensity < 0.001) {
    outColor = page(uv);
    return;
  }

  vec2 suv = uv;

  float phase = sin(uv.y * uResolution.y * 0.01 + uTime * uSpeed * 2.0) * uWave * intensity / uResolution.x;
  float phase2 = cos(uv.y * uResolution.y * 0.008 + uTime * uSpeed * 1.3) * uWave * intensity * 0.6 / uResolution.x;
  suv.x += phase + phase2;

  float shift = uRgbShift * intensity / uResolution.x;
  vec4 c = page(suv);
  float r = page(suv + vec2(shift, 0.0)).r;
  float b = page(suv - vec2(shift, 0.0)).b;
  vec4 col = vec4(r, c.g, b, c.a);

  float scanline = sin(uv.y * uScanlines * 3.14159 * 2.0) * 0.5 + 0.5;
  float scanlineMod = 1.0 - 0.12 * intensity * (1.0 - scanline);

  vec3 holo = col.rgb * scanlineMod;

  vec3 cyan = vec3(0.2, 0.85, 0.95);
  vec3 blue = vec3(0.3, 0.5, 1.0);
  float tintMix = 0.5 + 0.5 * sin(uv.y * 20.0 + uTime * 0.5);
  vec3 tintColor = mix(cyan, blue, tintMix);
  holo = mix(holo, tintColor, uTint * intensity * 0.25);

  float flickerNoise = hash(vec2(floor(uTime * 60.0), 0.0));
  float flickerVal = 1.0 - uFlicker * intensity * flickerNoise * 0.15;
  holo *= flickerVal;

  float glow = 0.08 * intensity * (1.0 - abs(scanline - 0.5) * 2.0);
  holo += vec3(0.3, 0.7, 1.0) * glow;

  float alpha = uOpacity * (0.85 + 0.15 * scanlineMod) * col.a;

  outColor = vec4(clamp(holo, 0.0, 1.0) * alpha, alpha);
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

export function createHologram(
  elements: HologramElements,
  options: HologramOptions = {},
): HologramInstance | null {
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
  let wake = () => {};

  if (htmlInCanvas) {
    paintable.onpaint = () => {
      try {
        sourceCtx!.reset();
        sourceCtx!.drawElementImage!(content, 0, 0);
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
      console.error("Hologram shader error:", gl!.getShaderInfoLog(shader));
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
      if (source.width !== cssWidth * dpr || source.height !== cssHeight * dpr) {
        source.width = cssWidth * dpr;
        source.height = cssHeight * dpr;
      }
      paintable.requestPaint!();
    }
  }

  syncCanvasSize();

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

  let time = 0;

  function render() {
    uploadContent();
    const dpr = output.width / Math.max(output.clientWidth, 1);
    gl!.useProgram(program);
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, contentTexture);
    gl!.uniform1i(uniforms.uContent, 0);
    gl!.uniform2f(uniforms.uResolution, output.width, output.height);
    gl!.uniform1f(uniforms.uTime, time);
    gl!.uniform1f(uniforms.uIntensity, Math.max(config.intensity, 0));
    gl!.uniform1f(uniforms.uSpeed, Math.max(config.speed, 0));
    gl!.uniform1f(uniforms.uScanlines, Math.max(config.scanlines, 1));
    gl!.uniform1f(uniforms.uRgbShift, Math.max(config.rgbShift, 0) * dpr);
    gl!.uniform1f(uniforms.uFlicker, Math.min(Math.max(config.flicker, 0), 1));
    gl!.uniform1f(uniforms.uTint, Math.min(Math.max(config.tint, 0), 1));
    gl!.uniform1f(uniforms.uOpacity, Math.min(Math.max(config.opacity, 0), 1));
    gl!.uniform1f(uniforms.uWave, Math.max(config.wave, 0) * dpr);
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
    const delta = Math.min(Math.max((now - lastTime) / 1000, 0), 1 / 30);
    lastTime = now;
    if (!reducedMotion) {
      time += delta;
    }
    if (contentDirty || !reducedMotion) render();
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
    start();
  }
  motionQuery.addEventListener("change", onMotionChange);

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

  return {
    setOptions(next) {
      Object.assign(config, next);
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
      gl!.deleteTexture(contentTexture);
      gl!.deleteProgram(program);
      gl!.deleteShader(vertexShader);
      gl!.deleteShader(fragmentShader);
      gl!.deleteBuffer(quad);
      if (htmlInCanvas) paintable.onpaint = null;
    },
  };
}
