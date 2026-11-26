import { getCanvasPixelRatio, createCanvasResizeObserver } from "../canvas-viewport";
import { isHtmlInCanvasBlocked, prepareHtmlInCanvas, drawHtmlInCanvas } from "../html-in-canvas";
import { createRectCache } from "../rect-cache";
import { resolveOptions } from "../options";

export type BubbleClick = "pop" | "none";

export type BubbleOptions = {
  size?: number;
  trail?: number;
  follow?: number;
  blend?: number;
  speed?: number;
  refraction?: number;
  dispersion?: number;
  frost?: number;
  shine?: number;
  rim?: number;
  iridescence?: number;
  intensity?: number;
  tint?: [number, number, number];
  tintStrength?: number;
  colorA?: [number, number, number];
  colorB?: [number, number, number];
  fallbackOpacity?: number;
  click?: BubbleClick;
  wobble?: number;
  drift?: number;
};

export type BubbleElements = {
  output: HTMLCanvasElement;
  source?: HTMLCanvasElement | null;
  content?: HTMLElement | null;
};

export type BubbleInstance = {
  setOptions: (options: BubbleOptions) => void;
  resize: () => void;
  destroy: () => void;
};

const DEFAULTS: Required<BubbleOptions> = {
  size: 30,
  trail: 24,
  follow: 0.5,
  blend: 14,
  speed: 2,
  refraction: 80,
  dispersion: 1,
  frost: 0,
  shine: 0.5,
  rim: 1,
  iridescence: 1,
  intensity: 0.9,
  tint: [1, 1, 1],
  tintStrength: 0,
  colorA: [0.2902, 0.4549, 0.7216],
  colorB: [0.4118, 0.4118, 0.4157],
  fallbackOpacity: 1,
  click: "none",
  wobble: 0,
  drift: 0,
};

const MAX_TRAIL = 24;
const SPRAY = 10;
const MAX_BLOBS = MAX_TRAIL + SPRAY;
const HISTORY = 256;
const TRAIL_STEP = 1 / 60;

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
void main () {
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
out vec4 outColor;
uniform sampler2D uContent;
uniform vec2 uResolution;
uniform float uMaxX;
uniform float uDpr;
uniform float uTime;
uniform float uHasContent;
uniform int uCount;
uniform vec3 uBlobs[${MAX_BLOBS}];
uniform vec3 uDeform;
uniform float uBlend;
uniform float uRefraction;
uniform float uDispersion;
uniform float uFrost;
uniform float uShine;
uniform float uRim;
uniform float uIridescence;
uniform float uIntensity;
uniform vec3 uTint;
uniform float uTintStrength;
uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uFallbackAlpha;

const float EPS = 1e-4;
const int ITR = 16;

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
  return g0.y * (g0.x * textureLod(uContent, vec2(p0.x, p0.y), level).rgb +
      g1.x * textureLod(uContent, vec2(p1.x, p0.y), level).rgb) +
    g1.y * (g0.x * textureLod(uContent, vec2(p0.x, p1.y), level).rgb +
      g1.x * textureLod(uContent, vec2(p1.x, p1.y), level).rgb);
}

vec3 page (vec2 px, float lod) {
  vec2 uv = px / uResolution;
  uv.x = clamp(uv.x, 0.0005, uMaxX - 0.0005);
  uv.y = clamp(uv.y, 0.0005, 0.9995);
  uv.y = 1.0 - uv.y;
  vec3 color = textureLod(uContent, uv, lod).rgb;
  if (lod > 0.01) {
    float lower = floor(lod);
    vec3 soft = mix(cubic(uv, lower), cubic(uv, lower + 1.0), lod - lower);
    color = mix(color, soft, min(lod, 1.0));
  }
  return pow(color, vec3(2.2));
}

float rnd3D (vec3 p) {
  return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453123);
}

float noise3D (vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);

  float a000 = rnd3D(i);
  float a100 = rnd3D(i + vec3(1.0, 0.0, 0.0));
  float a010 = rnd3D(i + vec3(0.0, 1.0, 0.0));
  float a110 = rnd3D(i + vec3(1.0, 1.0, 0.0));
  float a001 = rnd3D(i + vec3(0.0, 0.0, 1.0));
  float a101 = rnd3D(i + vec3(1.0, 0.0, 1.0));
  float a011 = rnd3D(i + vec3(0.0, 1.0, 1.0));
  float a111 = rnd3D(i + vec3(1.0, 1.0, 1.0));

  vec3 u = f * f * (3.0 - 2.0 * f);

  float k0 = a000;
  float k1 = a100 - a000;
  float k2 = a010 - a000;
  float k3 = a001 - a000;
  float k4 = a000 - a100 - a010 + a110;
  float k5 = a000 - a010 - a001 + a011;
  float k6 = a000 - a100 - a001 + a101;
  float k7 = -a000 + a100 + a010 - a110 + a001 - a101 - a011 + a111;

  return k0 + k1 * u.x + k2 * u.y + k3 * u.z + k4 * u.x * u.y +
    k5 * u.y * u.z + k6 * u.z * u.x + k7 * u.x * u.y * u.z;
}

float smoothMin (float d1, float d2, float k) {
  float h = exp(-k * d1) + exp(-k * d2);
  return -log(max(h, 1e-12)) / k;
}

float map (vec3 p) {
  float d = 1e5;
  for (int i = 0; i < ${MAX_BLOBS}; i++) {
    if (i >= uCount) break;
    vec2 o = p.xy - uBlobs[i].xy;
    vec2 q = vec2(uDeform.x * o.x + uDeform.y * o.y, uDeform.y * o.x + uDeform.z * o.y);
    float sphere = length(vec3(q, p.z)) - uBlobs[i].z;
    d = smoothMin(d, sphere, uBlend);
  }
  return d;
}

vec3 generateNormal (vec3 p) {
  return normalize(vec3(
    map(p + vec3(EPS, 0.0, 0.0)) - map(p + vec3(-EPS, 0.0, 0.0)),
    map(p + vec3(0.0, EPS, 0.0)) - map(p + vec3(0.0, -EPS, 0.0)),
    map(p + vec3(0.0, 0.0, EPS)) - map(p + vec3(0.0, 0.0, -EPS))));
}

vec3 dropletColor (vec3 normal, vec3 rayDir) {
  vec3 reflectDir = reflect(rayDir, normal);
  float noisePosTime = noise3D(reflectDir * 2.0 + uTime);
  float noiseNegTime = noise3D(reflectDir * 2.0 - uTime);
  vec3 color0 = uColorA * noisePosTime;
  vec3 color1 = uColorB * noiseNegTime;
  return (color0 + color1) * uIntensity;
}

void main () {
  vec2 frag = gl_FragCoord.xy;
  float minRes = min(uResolution.x, uResolution.y);
  vec2 p = (frag * 2.0 - uResolution) / minRes;

  vec3 ray = vec3(p, 1.0);
  vec3 rayDir = vec3(0.0, 0.0, -1.0);
  float dist = 0.0;

  for (int i = 0; i < ITR; ++i) {
    dist = map(ray);
    ray += rayDir * dist;
    if (dist < EPS || dist > 8.0) break;
  }

  float cov = 1.0 - smoothstep(0.0, 3.0 / minRes, dist);
  if (!(cov > 0.001)) {
    outColor = vec4(0.0);
    return;
  }

  vec3 n = generateNormal(ray);
  vec3 glints = pow(max(dropletColor(n, rayDir), 0.0), vec3(7.0));
  vec3 L = normalize(vec3(-0.5, 0.7, 0.6));
  float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 60.0);

  vec3 color;
  float alpha = cov;
  if (uHasContent > 0.5) {
    float depth = uRefraction * uDpr;
    float ca = uDispersion * 0.03;
    vec3 rvR = refract(rayDir, n, 1.0 / (1.33 - ca));
    vec3 rvG = refract(rayDir, n, 1.0 / 1.33);
    vec3 rvB = refract(rayDir, n, 1.0 / (1.33 + ca));
    vec2 offR = rvR.xy * (depth / max(abs(rvR.z), 0.35));
    vec2 offG = rvG.xy * (depth / max(abs(rvG.z), 0.35));
    vec2 offB = rvB.xy * (depth / max(abs(rvB.z), 0.35));
    float lod = max(uFrost * 5.0, log2(1.0 + length(offG) * 0.05 / uDpr));
    vec3 refr = vec3(
      page(frag + offR, lod).r,
      page(frag + offG, lod).g,
      page(frag + offB, lod).b);
    refr *= mix(vec3(1.0), uTint, clamp(uTintStrength, 0.0, 1.0));
    float edge = pow(1.0 - clamp(n.z, 0.0, 1.0), 3.0);
    refr *= max(1.0 - 0.9 * uRim * edge, 0.0);
    color = pow(max(refr, 0.0), vec3(1.0 / 2.2));
    color += glints * uIridescence;
    color += vec3(spec * uShine * 0.9);
  } else {
    float edge = pow(1.0 - clamp(n.z, 0.0, 1.0), 1.5);
    vec3 filmTint = mix(vec3(0.9), uTint, clamp(uTintStrength, 0.0, 1.0));
    float fade = cov * clamp(uFallbackAlpha, 0.0, 1.0);
    vec3 light = glints * uIridescence * 0.65 + vec3(spec * uShine * 1.5) +
      filmTint * (0.55 * max(uRim, 0.4) * edge + 0.03);
    float a = fade * clamp(0.08 + 0.4 * edge, 0.0, 1.0);
    outColor = vec4(light * fade, a);
    return;
  }
  outColor = vec4(color * alpha, alpha);
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

export function createBubble(
  elements: BubbleElements,
  options: BubbleOptions = {},
): BubbleInstance | null {
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

  function compile(type: number, text: string): WebGLShader {
    const shader = gl!.createShader(type)!;
    gl!.shaderSource(shader, text);
    gl!.compileShader(shader);
    if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) {
      console.error("Bubble shader error:", gl!.getShaderInfoLog(shader));
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
    new Uint8Array([0, 0, 0, 0]),
  );
  gl.generateMipmap(gl.TEXTURE_2D);

  let contentMaxX = 1;

  function syncCanvasSize() {
    const dpr = getCanvasPixelRatio(output, gl!);
    const width = Math.max(1, Math.round(output.clientWidth * dpr));
    const height = Math.max(1, Math.round(output.clientHeight * dpr));
    if (output.width !== width || output.height !== height) {
      output.width = width;
      output.height = height;
    }
    contentMaxX = content
      ? Math.min(
          1,
          Math.max(0.05, content.clientWidth / Math.max(output.clientWidth, 1)),
        )
      : 1;
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
  }

  const historyX = new Float32Array(HISTORY);
  const historyY = new Float32Array(HISTORY);
  const historyTime = new Float64Array(HISTORY);
  let historyHead = 0;
  let historyLength = 0;
  let clock = 0;

  function pushHistory(x: number, y: number) {
    historyHead = (historyHead + 1) % HISTORY;
    historyX[historyHead] = x;
    historyY[historyHead] = y;
    historyTime[historyHead] = clock;
    historyLength = Math.min(historyLength + 1, HISTORY);
  }

  function resetHistory(x: number, y: number) {
    historyLength = 0;
    pushHistory(x, y);
  }

  const sampled = { x: 0, y: 0 };

  function sampleHistory(at: number) {
    let newer = historyHead;
    for (let step = 1; step < historyLength; step++) {
      const older = (historyHead - step + HISTORY) % HISTORY;
      if (historyTime[older] <= at) {
        const span = historyTime[newer] - historyTime[older];
        const k = span > 0 ? (at - historyTime[older]) / span : 0;
        sampled.x = historyX[older] + (historyX[newer] - historyX[older]) * k;
        sampled.y = historyY[older] + (historyY[newer] - historyY[older]) * k;
        return;
      }
      newer = older;
    }
    sampled.x = historyX[newer];
    sampled.y = historyY[newer];
  }

  let headX = output.clientWidth / 2;
  let headY = output.clientHeight / 2;
  let targetX = headX;
  let targetY = headY;
  resetHistory(headX, headY);
  let presence = 0;
  let presenceVelocity = 0;
  let pointerInside = false;
  let shown = false;
  let mass = 1;
  let massVelocity = 0;
  let time = 0;
  let driftTime = 0;
  let lastMove = 0;

  let stretchX = 0;
  let stretchY = 0;
  let stretchVelocityX = 0;
  let stretchVelocityY = 0;

  const sprayX = new Float32Array(SPRAY);
  const sprayY = new Float32Array(SPRAY);
  const sprayVelocityX = new Float32Array(SPRAY);
  const sprayVelocityY = new Float32Array(SPRAY);
  const sprayRadius = new Float32Array(SPRAY);
  const sprayAge = new Float32Array(SPRAY);
  const sprayTurn = new Float32Array(SPRAY);
  const sprayAlive = new Uint8Array(SPRAY);
  const sprayMerge = new Float32Array(SPRAY);
  const sprayKeep = new Float32Array(SPRAY);
  let spraying = false;

  function activeCount(): number {
    return Math.min(Math.max(Math.round(config.trail), 1), MAX_TRAIL);
  }

  function pooledRadius(): number {
    const beads = activeCount();
    const blend = Math.max(config.blend, 0.5);
    const unit = Math.min(output.clientWidth, output.clientHeight) / 2;
    const base = Math.max(config.size, 4) / (unit * beads);
    let swell = 0;
    for (let i = 0; i < beads; i++) swell += Math.exp(blend * base * (beads - i));
    return (Math.log(swell) / blend) * unit;
  }

  function driftAmount(): number {
    return reducedMotion ? 0 : Math.min(Math.max(config.drift, 0), 1);
  }

  const blobData = new Float32Array(MAX_BLOBS * 3);

  function render() {
    uploadContent();
    const dpr = output.width / Math.max(output.clientWidth, 1);
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
    gl!.viewport(0, 0, output.width, output.height);
    gl!.disable(gl!.SCISSOR_TEST);
    gl!.clearColor(0, 0, 0, 0);
    gl!.clear(gl!.COLOR_BUFFER_BIT);

    const minRes = Math.min(output.width, output.height);
    const blend = Math.max(config.blend, 0.5);
    let count = 0;
    let headRadius = 0;
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    const push = (x: number, y: number, radius: number) => {
      const dx = x * dpr;
      const dy = output.height - y * dpr;
      blobData[count * 3] = (dx * 2 - output.width) / minRes;
      blobData[count * 3 + 1] = (dy * 2 - output.height) / minRes;
      blobData[count * 3 + 2] = radius;
      count++;
      minX = Math.min(minX, dx);
      maxX = Math.max(maxX, dx);
      minY = Math.min(minY, dy);
      maxY = Math.max(maxY, dy);
    };

    if (presence > 0.004 && mass > 0.001) {
      const beads = activeCount();
      headRadius = Math.max(config.size, 4) * dpr * presence;
      const baseRadius = (headRadius * 2) / (minRes * beads);
      let shrink = 0;
      if (mass < 1) {
        let swell = 0;
        for (let i = 0; i < beads; i++) {
          swell += Math.exp(blend * baseRadius * (beads - i));
        }
        shrink = ((1 - mass) * Math.log(swell)) / blend;
      }
      for (let i = 0; i < beads; i++) {
        sampleHistory(clock - i * TRAIL_STEP);
        push(sampled.x, sampled.y, baseRadius * (beads - i) - shrink);
      }
    }
    if (spraying && presence > 0.004) {
      for (let i = 0; i < SPRAY; i++) {
        if (!sprayAlive[i]) continue;
        let overlap = 1;
        for (let j = 0; j < SPRAY; j++) {
          if (j === i || !sprayAlive[j]) continue;
          const gap = Math.hypot(sprayX[i] - sprayX[j], sprayY[i] - sprayY[j]);
          overlap += sprayKeep[j] * Math.exp((-blend * gap * dpr * 2) / minRes);
        }
        push(
          sprayX[i],
          sprayY[i],
          ((sprayRadius[i] * dpr * 2) / minRes) * presence * sprayKeep[i] +
            Math.log(Math.max(sprayKeep[i], 1e-4) / overlap) / blend,
        );
      }
    }
    if (count === 0) return;

    const pad =
      headRadius +
      ((Math.log(count + 1) / blend) * minRes) / 2 +
      Math.abs(config.refraction) * dpr * 0.5 +
      32 * dpr;
    const sx = Math.max(0, Math.floor(minX - pad));
    const sy = Math.max(0, Math.floor(minY - pad));
    gl!.enable(gl!.SCISSOR_TEST);
    gl!.scissor(
      sx,
      sy,
      Math.min(output.width - sx, Math.ceil(maxX - minX + pad * 2)),
      Math.min(output.height - sy, Math.ceil(maxY - minY + pad * 2)),
    );

    gl!.useProgram(program);
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, contentTexture);
    gl!.uniform1i(uniforms.uContent, 0);
    gl!.uniform2f(uniforms.uResolution, output.width, output.height);
    gl!.uniform1f(uniforms.uMaxX, contentMaxX);
    gl!.uniform1f(uniforms.uDpr, dpr);
    gl!.uniform1f(uniforms.uTime, time);
    gl!.uniform1f(uniforms.uHasContent, htmlInCanvas ? 1 : 0);
    gl!.uniform1i(uniforms.uCount, count);
    const amount = Math.min(Math.hypot(stretchX, stretchY), 0.35);
    const angle = Math.atan2(stretchY, stretchX) / 2;
    const stretch = Math.exp(amount);
    const axisX = Math.cos(angle);
    const axisY = Math.sin(angle);
    const deform00 = (axisX * axisX) / stretch + stretch * axisY * axisY;
    const deform01 = axisX * axisY * (1 / stretch - stretch);
    const deform11 = (axisY * axisY) / stretch + stretch * axisX * axisX;
    gl!.uniform3fv(uniforms["uBlobs[0]"], blobData);
    gl!.uniform3f(uniforms.uDeform, deform00, deform01, deform11);
    gl!.uniform1f(uniforms.uBlend, blend);
    gl!.uniform1f(uniforms.uRefraction, config.refraction);
    gl!.uniform1f(uniforms.uDispersion, Math.max(config.dispersion, 0));
    gl!.uniform1f(uniforms.uFrost, Math.min(Math.max(config.frost, 0), 1));
    gl!.uniform1f(uniforms.uShine, Math.max(config.shine, 0));
    gl!.uniform1f(uniforms.uRim, Math.min(Math.max(config.rim, 0), 2));
    gl!.uniform1f(uniforms.uIridescence, Math.max(config.iridescence, 0));
    gl!.uniform1f(uniforms.uIntensity, Math.max(config.intensity, 0));
    gl!.uniform3f(
      uniforms.uTint,
      config.tint[0],
      config.tint[1],
      config.tint[2],
    );
    gl!.uniform1f(
      uniforms.uTintStrength,
      Math.min(Math.max(config.tintStrength, 0), 1),
    );
    gl!.uniform3f(
      uniforms.uColorA,
      config.colorA[0],
      config.colorA[1],
      config.colorA[2],
    );
    gl!.uniform3f(
      uniforms.uColorB,
      config.colorB[0],
      config.colorB[1],
      config.colorB[2],
    );
    gl!.uniform1f(
      uniforms.uFallbackAlpha,
      Math.min(Math.max(config.fallbackOpacity, 0), 1),
    );
    gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
    gl!.disable(gl!.SCISSOR_TEST);
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
    clock += delta;
    if (!reducedMotion) time += delta * Math.max(config.speed, 0);

    const drifting = !pointerInside && driftAmount() > 0;
    if (drifting) {
      driftTime += delta * (0.25 + driftAmount() * 1.1);
      const width = output.clientWidth;
      const height = output.clientHeight;
      targetX =
        width *
        (0.5 + 0.3 * Math.sin(driftTime * 0.9 + 1.3) + 0.08 * Math.sin(driftTime * 2.3));
      targetY =
        height *
        (0.5 + 0.26 * Math.cos(driftTime * 0.7) + 0.08 * Math.sin(driftTime * 1.9 + 0.5));
      if (!shown) {
        headX = targetX;
        headY = targetY;
        resetHistory(headX, headY);
        shown = true;
      }
    }

    const follow = Math.min(Math.max(config.follow, 0.02), 1);
    const kHead =
      reducedMotion || follow >= 1
        ? 1
        : 1 - Math.exp(-delta * (drifting ? 2.5 : 3 + follow * 30));
    const previousX = headX;
    const previousY = headY;
    headX += (targetX - headX) * kHead;
    headY += (targetY - headY) * kHead;
    pushHistory(headX, headY);
    if (Math.abs(headX - previousX) + Math.abs(headY - previousY) > 0.05) {
      lastMove = clock;
    }

    const wobble = reducedMotion ? 0 : Math.min(Math.max(config.wobble, 0), 1);
    const presenceTarget = pointerInside || drifting ? 1 : 0;
    if (wobble > 0) {
      const stiffness = 13;
      const damping = 1 - 0.55 * wobble;
      presenceVelocity +=
        (stiffness * stiffness * (presenceTarget - presence) -
          2 * damping * stiffness * presenceVelocity) *
        delta;
      presence += presenceVelocity * delta;
      if (presence < 0 || (presenceTarget === 0 && presence < 0.003)) {
        presence = 0;
        presenceVelocity = Math.max(presenceVelocity, 0);
      }
    } else {
      const kScale = reducedMotion ? 1 : 1 - Math.exp(-delta * 10);
      presence += (presenceTarget - presence) * kScale;
      presenceVelocity = 0;
    }
    if (presence < 0.004 && presenceTarget === 0 && !pointerInside) shown = false;

    if (wobble > 0 && delta > 0) {
      const velocityX = (headX - previousX) / delta;
      const velocityY = (headY - previousY) / delta;
      const speed = Math.hypot(velocityX, velocityY);
      const pull = wobble * 0.3 * Math.tanh(speed / 1100);
      const doubled = 2 * Math.atan2(velocityY, velocityX);
      const goalX = speed > 1 ? pull * Math.cos(doubled) : 0;
      const goalY = speed > 1 ? pull * Math.sin(doubled) : 0;
      const stiffness = 20;
      const damping = 0.22;
      stretchVelocityX +=
        (stiffness * stiffness * (goalX - stretchX) -
          2 * damping * stiffness * stretchVelocityX) *
        delta;
      stretchVelocityY +=
        (stiffness * stiffness * (goalY - stretchY) -
          2 * damping * stiffness * stretchVelocityY) *
        delta;
      stretchX += stretchVelocityX * delta;
      stretchY += stretchVelocityY * delta;
    } else {
      stretchX = stretchY = stretchVelocityX = stretchVelocityY = 0;
    }

    if (spraying) {
      spraying = false;
      const drag = Math.exp(-delta * 3.4);
      const pooled = pooledRadius();
      const touch = Math.max(pooled * 0.5, mass * pooled * 0.9);
      const cover = Math.min(Math.max((mass - 0.45) / 0.55, 0), 1);
      const swallowed = cover * cover * (3 - 2 * cover);
      for (let i = 0; i < SPRAY; i++) {
        if (!sprayAlive[i]) continue;
        sprayAge[i] += delta;
        sprayVelocityX[i] *= drag;
        sprayVelocityY[i] *= drag;
        sprayX[i] += sprayVelocityX[i] * delta;
        sprayY[i] += sprayVelocityY[i] * delta;
        const homing = sprayAge[i] - sprayTurn[i];
        if (homing > 0) {
          const pull = Math.min(homing / 0.45, 1);
          const k = 1 - Math.exp(-delta * (1 + 15 * pull * pull));
          sprayX[i] += (headX - sprayX[i]) * k;
          sprayY[i] += (headY - sprayY[i]) * k;
          const gap = Math.hypot(headX - sprayX[i], headY - sprayY[i]);
          if (sprayMerge[i] > 0 || gap < touch || homing > 2) {
            sprayMerge[i] = Math.min(sprayMerge[i] + delta * 4, 1);
          }
          sprayKeep[i] = 1 - swallowed * sprayMerge[i];
          if (sprayKeep[i] < 0.002 || homing > 4) {
            sprayAlive[i] = 0;
            sprayMerge[i] = 1;
            continue;
          }
        }
        spraying = true;
      }
    }
    let merged = 0;
    for (let i = 0; i < SPRAY; i++) merged += sprayMerge[i];
    const massTarget = spraying ? Math.sqrt(merged / SPRAY) : 1;
    if (mass !== massTarget || massVelocity !== 0) {
      const stiffness = 10;
      const damping = 1 - 0.55 * wobble;
      massVelocity +=
        (stiffness * stiffness * (massTarget - mass) -
          2 * damping * stiffness * massVelocity) *
        delta;
      mass = Math.max(mass + massVelocity * delta, 0);
    }
    if (!spraying && Math.abs(1 - mass) < 0.002 && Math.abs(massVelocity) < 0.01) {
      mass = 1;
      massVelocity = 0;
    }

    render();

    const settled = reducedMotion
      ? clock - lastMove > activeCount() * TRAIL_STEP &&
        Math.abs(presenceTarget - presence) < 0.002 &&
        !contentDirty
      : presence < 0.004 && presenceTarget === 0 && !contentDirty;
    if (settled) {
      presence = presenceTarget;
      presenceVelocity = 0;
      mass = 1;
      massVelocity = 0;
      spraying = false;
      sprayAlive.fill(0);
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

  const rectCache = createRectCache(output);
  const root = output.parentElement;

  function locate(event: PointerEvent) {
    const rect = rectCache.current;
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    let inside = x >= 0 && y >= 0 && x <= rect.width && y <= rect.height;
    if (inside && content && root) {
      inside = event.target instanceof Node && root.contains(event.target);
    }
    return { x, y, inside };
  }

  function leave() {
    if (!pointerInside) return;
    pointerInside = false;
    start();
  }

  function onPointerMove(event: PointerEvent) {
    const { x, y, inside } = locate(event);
    if (!inside) {
      leave();
      return;
    }
    targetX = x;
    targetY = y;
    if (!pointerInside && !(shown && driftAmount() > 0)) {
      headX = x;
      headY = y;
      resetHistory(x, y);
    }
    shown = true;
    pointerInside = true;
    start();
  }

  function onPointerDown(event: PointerEvent) {
    onPointerMove(event);
    if (
      !pointerInside ||
      event.pointerType === "touch" ||
      config.click !== "pop" ||
      reducedMotion ||
      presence < 0.5 ||
      mass < 0.9
    )
      return;
    const pooled = pooledRadius();
    const spin = Math.random() * Math.PI * 2;
    for (let i = 0; i < SPRAY; i++) {
      const angle = spin + ((i + Math.random() * 0.7) / SPRAY) * Math.PI * 2;
      const speed = pooled * (4.5 + Math.random() * 5);
      sprayX[i] = headX + Math.cos(angle) * pooled * 0.55;
      sprayY[i] = headY + Math.sin(angle) * pooled * 0.55;
      sprayVelocityX[i] = Math.cos(angle) * speed;
      sprayVelocityY[i] = Math.sin(angle) * speed;
      sprayRadius[i] = pooled * (0.14 + Math.random() * 0.14);
      sprayAge[i] = 0;
      sprayTurn[i] = 0.2 + (i / SPRAY) * 0.3 + Math.random() * 0.08;
      sprayAlive[i] = 1;
      sprayMerge[i] = 0;
      sprayKeep[i] = 1;
    }
    spraying = true;
    mass = 0;
    massVelocity = 0;
    resetHistory(headX, headY);
    start();
  }

  function onPointerEnd(event: PointerEvent) {
    if (event.pointerType !== "mouse") leave();
  }

  function onPointerLeave(event: PointerEvent) {
    if (event.target === document.documentElement || !locate(event).inside) {
      leave();
    }
  }

  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerdown", onPointerDown, { passive: true });
  window.addEventListener("pointerup", onPointerEnd, { passive: true });
  window.addEventListener("pointercancel", onPointerEnd, { passive: true });
  window.addEventListener("pointerleave", onPointerLeave, {
    capture: true,
    passive: true,
  });

  function onScroll() {
    start();
  }
  content?.addEventListener("scroll", onScroll, { passive: true });

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

  return {
    setOptions(next) {
      next = resolveOptions(DEFAULTS, next);
      if (
        !Object.entries(next).some(
          ([key, value]) => config[key as keyof BubbleOptions] !== value,
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
      rectCache.destroy();
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerEnd);
      window.removeEventListener("pointercancel", onPointerEnd);
      window.removeEventListener("pointerleave", onPointerLeave, true);
      content?.removeEventListener("scroll", onScroll);
      observer.disconnect();
      intersection.disconnect();
      document.removeEventListener("visibilitychange", syncVisibility);
      motionQuery.removeEventListener("change", onMotionChange);
      gl!.deleteTexture(contentTexture);
      gl!.deleteProgram(program);
      gl!.deleteShader(vertexShader);
      gl!.deleteShader(fragmentShader);
      gl!.deleteBuffer(quad);
      if (htmlInCanvas) paintable!.onpaint = null;
    },
  };
}
