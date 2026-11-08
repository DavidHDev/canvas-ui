import { getCanvasPixelRatio, createCanvasResizeObserver } from "../canvas-viewport";
import { isHtmlInCanvasBlocked, prepareHtmlInCanvas, drawHtmlInCanvas } from "../html-in-canvas";
export interface LaserOptions {
  /** Animation speed of the beam wave, flicker, and sparkle. 1 is normal. */
  speed?: number;
  /** Distance of the beam from the bottom edge in CSS pixels. */
  offset?: number;
  /** Laser glow color as RGB in the 0 to 1 range. */
  color?: [number, number, number];
  /** Thickness of the white-hot beam core in CSS pixels. */
  thickness?: number;
  /** Intensity of the white beam core (0 to 2). 0 removes it. */
  core?: number;
  /** Reach of the colored glow around the beam in CSS pixels. */
  radius?: number;
  /** Brightness of the colored glow (0 to 3). 0 removes it. */
  glow?: number;
  /** Amplitude of the slow beam waviness in CSS pixels. */
  wave?: number;
  /** Beam length as a fraction of the content width (0 to 1). */
  width?: number;
  /** Random intensity flicker of the beam (0 to 1). */
  flicker?: number;
  /** Height of the hot reveal band above the beam in CSS pixels. */
  reveal?: number;
  /** How strongly freshly revealed content glows (0 to 1.5). */
  heat?: number;
  /** Heat shimmer displacement of freshly revealed content in CSS pixels. */
  shimmer?: number;
  /** Animated sparkle texture inside the reveal band (0 to 2). */
  sparkle?: number;
  /** How much scrolling boosts the beam and the reveal glow (0 to 3). */
  reactivity?: number;
}

export interface LaserElements {
  /** Canvas with layoutsubtree that hosts the HTML content. */
  source: HTMLCanvasElement;
  /** The element inside the source canvas that gets captured. */
  content: HTMLElement;
  /** Canvas the WebGL effect renders to. */
  output: HTMLCanvasElement;
}

export interface LaserInstance {
  /** Update effect options live. */
  setOptions: (options: LaserOptions) => void;
  /** Re-read canvas size. Call when the element is resized. */
  resize: () => void;
  /** Stop the loop and release all GPU resources. */
  destroy: () => void;
}

const DEFAULTS: Required<LaserOptions> = {
  speed: 0.3,
  offset: 140,
  color: [0.05, 0.35, 1],
  thickness: 6,
  core: 1,
  radius: 20,
  glow: 2,
  wave: 10,
  width: 0.55,
  flicker: 0.2,
  reveal: 400,
  heat: 1.5,
  shimmer: 12,
  sparkle: 0.25,
  reactivity: 1,
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
uniform float uBeamY;
uniform float uWaveAmp;
uniform float uBeamCX;
uniform float uBeamHalfW;
uniform float uHalfCore;
uniform float uCore;
uniform float uRadius;
uniform float uGlow;
uniform vec3 uColor;
uniform float uBright;
uniform float uRevealH;
uniform float uHeat;
uniform float uShimmer;
uniform float uSparkle;
uniform vec3 uBezel;
uniform float uMaxX;
uniform float uHasContent;

float hash (vec2 v) {
  return fract(sin(dot(v, vec2(89.44, 19.36))) * 22189.22);
}

float iHash (vec2 v, vec2 r) {
  float h00 = hash(floor(v * r + vec2(0.0, 0.0)) / r);
  float h10 = hash(floor(v * r + vec2(1.0, 0.0)) / r);
  float h01 = hash(floor(v * r + vec2(0.0, 1.0)) / r);
  float h11 = hash(floor(v * r + vec2(1.0, 1.0)) / r);
  vec2 ip = smoothstep(vec2(0.0), vec2(1.0), mod(v * r, 1.0));
  return (h00 * (1.0 - ip.x) + h10 * ip.x) * (1.0 - ip.y)
    + (h01 * (1.0 - ip.x) + h11 * ip.x) * ip.y;
}

float noise (vec2 v) {
  float sum = 0.0;
  float s = 2.0;
  for (int i = 1; i < 7; i++) {
    sum += iHash(v + vec2(i), vec2(2.0 * s)) / s;
    s *= 2.0;
  }
  return sum;
}

vec3 permute (vec3 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }

float snoise (vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439,
    -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m * m;
  m = m * m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  vec3 g;
  g.x = a0.x * x0.x + h.x * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float fbm (vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 3; i++) {
    v += a * snoise(p);
    p = mat2(1.6, 1.2, -1.2, 1.6) * p + 11.7;
    a *= 0.5;
  }
  return v * 0.5 + 0.5;
}

float smokeField (vec2 p, float t) {
  vec2 rise = vec2(t * 0.04, -t * 0.35);
  vec2 q = vec2(
    fbm(p + rise),
    fbm(p + rise * 0.85 + vec2(5.2, 1.3)));
  return fbm(p + 0.55 * q + rise);
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
  float t = uTime;

  float nx = (uv.x - uBeamCX) / max(uBeamHalfW, 1e-4);

  float env = pow(max(1.0 - nx * nx, 0.0), 1.5);

  float bend = 0.0;
  if (uWaveAmp > 0.0) {
    bend = (noise(vec2(uv.x * 2.5 + t * 0.6, t * 0.4)) - 0.5) * 2.0 * uWaveAmp;
  }
  float yb = uBeamY + bend;
  float dy = uv.y - yb;
  float pxd = abs(dy) * uResolution.y;

  vec3 col;
  float alpha;
  if (dy < 0.0 && uHasContent > 0.5) {
    col = uBezel;
    alpha = 1.0;
  } else {
    col = vec3(0.0);
    alpha = 0.0;
  }

  if (dy >= 0.0 && dy < uRevealH && uRevealH > 0.0) {
    float k = dy / uRevealH;
    float w = exp(-3.0 * k) * (1.0 - smoothstep(0.55, 1.0, k));

    vec2 sp = uv * uResolution / uResolution.y;
    if (uShimmer > 0.0 && env > 0.0 && uHasContent > 0.5) {
      float dx = snoise(vec2(sp.x * 5.0, sp.y * 12.0 - t * 1.3))
        * uShimmer * w * env;
      float sa = w * env;
      col = page(vec2(uv.x + dx, uv.y)).rgb * sa;
      alpha = sa;
    }
    if (uHeat > 0.0 && env > 0.0) {
      float s = smoothstep(0.3, 1.05, smokeField(sp * vec2(2.4, 3.4), t));
      float heat = w * uHeat * env * (0.4 + 0.9 * s);
      if (uSparkle > 0.0) {
        float f = fbm(sp * vec2(9.0, 13.0) + vec2(0.0, -t * 1.4));
        heat *= 1.0 + uSparkle * (f - 0.5) * 1.3;
      }
      heat = max(heat, 0.0);
      vec3 emission = uColor * heat * uBright + vec3(heat * heat * 0.35);

      vec3 toned = (1.0 - exp(-emission)) * env;
      float ea = max(max(toned.r, toned.g), toned.b);

      col = toned + col * (1.0 - ea);
      alpha = ea + alpha * (1.0 - ea);
    }
  }

  vec3 beam = vec3(0.0);
  if (env > 0.0) {
    float pd = pxd / max(env, 0.18);
    if (uCore > 0.0) {
      beam += 10.0 * uCore * smoothstep(uHalfCore, uHalfCore * 0.3, pd) * vec3(1.0);
    }
    if (uGlow > 0.0) {
      float g = pow(uRadius / max(pd, 0.75), 0.9) * exp(-0.55 * pd / uRadius);
      beam += uGlow * g * uColor;
    }
    beam *= uBright;
  }

  vec3 beamToned = (1.0 - exp(-beam)) * env;
  float ba = max(max(beamToned.r, beamToned.g), beamToned.b);
  if (ba > 0.003) {
    col = beamToned + col * (1.0 - ba);
    alpha = ba + alpha * (1.0 - ba);
  }

  outColor = vec4(col, clamp(alpha, 0.0, 1.0));
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

export function createLaser(
  elements: LaserElements,
  options: LaserOptions = {},
): LaserInstance | null {
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
  let wake = () => {};

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
      console.error("Laser shader error:", gl!.getShaderInfoLog(shader));
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
  let beamCX = 0.5;
  let beamSpan = 1;

  let bezel: [number, number, number] = [0, 0, 0];
  const bezelProbe = document.createElement("canvas");
  bezelProbe.width = bezelProbe.height = 1;
  const bezelCtx = bezelProbe.getContext("2d", { willReadFrequently: true });

  function syncBezelColor() {
    if (!bezelCtx) return;
    let el: Element | null = content;
    while (el) {
      const bg = getComputedStyle(el).backgroundColor;
      if (bg && bg !== "transparent") {
        bezelCtx.clearRect(0, 0, 1, 1);
        bezelCtx.fillStyle = bg;
        bezelCtx.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = bezelCtx.getImageData(0, 0, 1, 1).data;
        if (a > 0) {
          bezel = [r / 255, g / 255, b / 255];
          return;
        }
      }
      el = el.parentElement;
    }
    bezel = [0, 0, 0];
  }

  function syncCanvasSize() {
    const dpr = getCanvasPixelRatio(output, gl!);
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
    const viewW = Math.max(output.clientWidth, 1);
    beamCX = contentMaxX * 0.5;
    beamSpan = contentMaxX;
    const child = content.firstElementChild;
    if (child instanceof HTMLElement) {
      const childRect = child.getBoundingClientRect();
      const outputRect = output.getBoundingClientRect();
      const style = getComputedStyle(child);
      const left =
        childRect.left - outputRect.left + (parseFloat(style.paddingLeft) || 0);
      const right =
        childRect.right -
        outputRect.left -
        (parseFloat(style.paddingRight) || 0);
      if (right - left > 48) {
        beamCX = ((left + right) * 0.5) / viewW;
        beamSpan = (right - left) / viewW;
      }
    }
    if (htmlInCanvas) {
      const sourceWidth = Math.max(1, Math.round(source.clientWidth * dpr));
      const sourceHeight = Math.max(1, Math.round(source.clientHeight * dpr));
      if (source.width !== sourceWidth || source.height !== sourceHeight) {
        source.width = sourceWidth;
        source.height = sourceHeight;
      }
      paintable.requestPaint!();
    }
  }

  syncCanvasSize();
  syncBezelColor();

  function uploadContent() {
    if (!htmlInCanvas || !contentDirty) return;
    contentDirty = false;
    syncBezelColor();
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
  let activity = 0;

  const fract = (x: number) => x - Math.floor(x);
  const hash2 = (x: number, y: number) =>
    fract(Math.sin(x * 89.44 + y * 19.36) * 22189.22);
  const smooth01 = (x: number) => x * x * (3 - 2 * x);
  function iHashCpu(vx: number, vy: number, r: number) {
    const fx = Math.floor(vx * r);
    const fy = Math.floor(vy * r);
    const h00 = hash2(fx / r, fy / r);
    const h10 = hash2((fx + 1) / r, fy / r);
    const h01 = hash2(fx / r, (fy + 1) / r);
    const h11 = hash2((fx + 1) / r, (fy + 1) / r);
    const ix = smooth01(fract(vx * r));
    const iy = smooth01(fract(vy * r));
    return (
      (h00 * (1 - ix) + h10 * ix) * (1 - iy) + (h01 * (1 - ix) + h11 * ix) * iy
    );
  }
  function noiseCpu(vx: number, vy: number) {
    let sum = 0;
    let s = 2;
    for (let i = 1; i < 7; i++) {
      sum += iHashCpu(vx + i, vy + i, 2 * s) / s;
      s *= 2;
    }
    return sum;
  }

  function render() {
    uploadContent();
    gl!.useProgram(program);
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, contentTexture);
    gl!.uniform1i(uniforms.uContent, 0);
    gl!.uniform2f(uniforms.uResolution, output.width, output.height);
    gl!.uniform1f(uniforms.uTime, time);
    const dpr = output.width / Math.max(output.clientWidth, 1);
    const clientH = Math.max(output.clientHeight, 1);
    gl!.uniform1f(
      uniforms.uBeamY,
      Math.min(Math.max(config.offset, 0) / clientH, 0.95),
    );
    gl!.uniform1f(uniforms.uWaveAmp, Math.max(config.wave, 0) / clientH);
    gl!.uniform1f(uniforms.uBeamCX, beamCX);
    gl!.uniform1f(
      uniforms.uBeamHalfW,
      Math.min(Math.max(config.width, 0.05), 1) * beamSpan * 0.5,
    );
    gl!.uniform1f(
      uniforms.uHalfCore,
      Math.max(config.thickness, 0.5) * dpr * 0.5,
    );
    gl!.uniform1f(uniforms.uCore, Math.max(config.core, 0));
    gl!.uniform1f(uniforms.uRadius, Math.max(config.radius, 0.5) * dpr);
    gl!.uniform1f(uniforms.uGlow, Math.max(config.glow, 0));
    gl!.uniform3f(
      uniforms.uColor,
      config.color[0],
      config.color[1],
      config.color[2],
    );
    const flick =
      1 - Math.min(Math.max(config.flicker, 0), 1) * noiseCpu(time * 1.8, 3.7);
    const boost = 1 + Math.max(config.reactivity, 0) * activity * 1.6;
    gl!.uniform1f(uniforms.uBright, flick * boost);
    gl!.uniform1f(uniforms.uRevealH, Math.max(config.reveal, 0) / clientH);
    gl!.uniform1f(
      uniforms.uHeat,
      Math.max(config.heat, 0) * (0.3 + 0.7 * activity),
    );
    gl!.uniform1f(
      uniforms.uShimmer,
      (Math.max(config.shimmer, 0) / Math.max(output.clientWidth, 1)) *
        (0.25 + 0.75 * activity),
    );
    gl!.uniform1f(uniforms.uSparkle, Math.max(config.sparkle, 0));
    gl!.uniform3f(uniforms.uBezel, bezel[0], bezel[1], bezel[2]);
    gl!.uniform1f(uniforms.uMaxX, contentMaxX);
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
    if (!reducedMotion) {
      time += delta * config.speed;
      activity *= Math.exp(-delta * 2.4);
    }
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

  let lastScrollTop = content.scrollTop;
  function onScroll() {
    const top = content.scrollTop;
    if (!reducedMotion) {
      activity = Math.min(1, activity + Math.abs(top - lastScrollTop) / 600);
    }
    lastScrollTop = top;
    start();
  }
  content.addEventListener("scroll", onScroll, { passive: true });

  function onMotionChange() {
    reducedMotion = motionQuery.matches;
    if (reducedMotion) activity = 0;
    start();
  }
  motionQuery.addEventListener("change", onMotionChange);

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
      if (
        !Object.entries(next).some(
          ([key, value]) => config[key as keyof LaserOptions] !== value,
        )
      )
        return;
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
      content.removeEventListener("scroll", onScroll);
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
