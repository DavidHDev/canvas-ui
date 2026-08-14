import { createRectCache } from "../rect-cache";

export interface ShatterOptions {
  /** Radius of the shatter lens around the cursor, relative to the screen height. */
  radius?: number;
  /** Edge feather of the lens as a fraction of the radius (0 to 1). */
  softness?: number;
  /** Tile size in CSS pixels. */
  tileSize?: number;
  /** Shape irregularity. 0 keeps a perfect square grid, 1 breaks the page into uneven glass shards. */
  shards?: number;
  /** Corner rounding of fully lifted tiles in CSS pixels. */
  corner?: number;
  /** How high tiles lift off the page in CSS pixels. */
  lift?: number;
  /** How steeply tiles tip out of the page plane (0 to 3). */
  tilt?: number;
  /** How far tiles slide sideways while lifted, in CSS pixels. */
  scatter?: number;
  /** Perspective distance in CSS pixels. Lower is more dramatic. */
  perspective?: number;
  /** Color of the void behind lifted tiles as [r, g, b] in 0-1 range. */
  gapColor?: [number, number, number];
  /** Opacity of the drop shadows under lifted tiles (0 to 2). */
  shadow?: number;
  /** Strength of the per-tile lighting (0 to 2). */
  shading?: number;
  /** How strongly lifted shards refract the content beneath them, like glass (0 to 2). */
  refraction?: number;
  /** Chromatic fringing of the refraction (0 to 1). 0 keeps it color-true. */
  dispersion?: number;
  /** Speed of the floating tile motion. 0 freezes the tiles. */
  floatSpeed?: number;
  /** How fully tiles lift inside the lens (0 to 1). */
  strength?: number;
  /** Lift amount across the whole screen, outside the lens (0 to 1). */
  baseStrength?: number;
  /** How quickly the lens follows the cursor. Higher is snappier. */
  followSpeed?: number;
}

export interface ShatterElements {
  /** Canvas with layoutsubtree that hosts the HTML content. */
  source: HTMLCanvasElement;
  /** The element inside the source canvas that gets captured. */
  content: HTMLElement;
  /** Canvas the WebGL effect renders to. */
  output: HTMLCanvasElement;
}

export interface ShatterInstance {
  /** Update effect options live. */
  setOptions: (options: ShatterOptions) => void;
  /** Re-read canvas size. Call when the element is resized. */
  resize: () => void;
  /** Stop the loop and release all GPU resources. */
  destroy: () => void;
}

const DEFAULTS: Required<ShatterOptions> = {
  radius: 0.4,
  softness: 0.6,
  tileSize: 125,
  shards: 1,
  corner: 0,
  lift: 30,
  tilt: 2,
  scatter: 5,
  perspective: 1500,
  gapColor: [0, 0, 0],
  shadow: 0.5,
  shading: 0.5,
  refraction: 1.5,
  dispersion: 0.3,
  floatSpeed: 2,
  strength: 1,
  baseStrength: 0,
  followSpeed: 3,
};

const TIME_WRAP = Math.PI * 800;

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
uniform sampler2D uContent;
uniform vec2 uResolution;
uniform vec2 uPointer;
uniform float uActive;
uniform float uRadius;
uniform float uSoftness;
uniform float uStrength;
uniform float uBase;
uniform float uTile;
uniform float uShards;
uniform float uCorner;
uniform float uLift;
uniform float uTilt;
uniform float uScatter;
uniform float uPersp;
uniform vec3 uGap;
uniform float uShadow;
uniform float uShading;
uniform float uRefract;
uniform float uDispersion;
uniform float uTime;
uniform float uMaxX;
uniform vec2 uScroll;
out vec4 outColor;

const float TAU = 6.28318530718;
const vec2 LIGHT = vec2(-0.514495755, 0.857492926);

vec2 hash22 (vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.xx + q.yz) * q.zy);
}

float smin (float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float shardD (vec2 q, vec2 cell, float k) {
  float jit = uTile * 0.8 * clamp(uShards, 0.0, 1.0);
  vec2 s0 = (hash22(cell) - 0.5) * jit;
  float d = uTile;
  for (int i = 0; i < 9; i++) {
    if (i == 4) continue;
    vec2 g = vec2(float(i % 3 - 1), float(i / 3 - 1));
    vec2 sn = g * uTile + (hash22(cell + g) - 0.5) * jit;
    vec2 diff = sn - s0;
    float e = -dot(q - s0 - diff * 0.5, normalize(diff));
    d = smin(d, e, k);
  }
  return d;
}

vec3 pick (vec2 uv) {
  vec2 c = vec2(
    clamp(uv.x, 0.0005, uMaxX - 0.0005),
    clamp(uv.y, 0.0005, 0.9995));
  return texture(uContent, vec2(c.x, 1.0 - c.y)).rgb;
}

float cellAct (vec2 cell, out vec2 sxy) {
  sxy = hash22(cell + 13.13);
  vec2 center = (cell + 0.5) * uTile;
  float aspect = uResolution.x / uResolution.y;
  vec2 cuv = (center - vec2(uScroll.x, -uScroll.y)) / uResolution;
  vec2 dv = vec2((cuv.x - uPointer.x) * aspect, cuv.y - uPointer.y);
  float radius = max(uRadius * uActive, 1e-4);
  float inner = radius * (1.0 - clamp(uSoftness, 0.0, 1.0));
  float lens = (1.0 - smoothstep(inner, radius, length(dv))) * uActive;
  float mask = clamp(max(lens, clamp(uBase, 0.0, 1.0)), 0.0, 1.0)
    * clamp(uStrength, 0.0, 1.0);
  float th = sxy.x * 0.6;
  return smoothstep(th, th + 0.4, mask);
}

void cellDyn (
  vec2 cell,
  vec2 sxy,
  float act,
  out mat3 R,
  out float lift,
  out vec2 anchor,
  out float k
) {
  vec2 center = (cell + 0.5) * uTile;
  vec4 seed = vec4(sxy, hash22(cell + 27.7));

  float wob = sin(uTime + seed.z * TAU);
  float maxT = 0.2 * clamp(uTilt, 0.0, 3.0) * act;
  float rx = (seed.y - 0.5) * 2.0 * maxT
    * (0.75 + 0.25 * wob);
  float ry = (seed.z - 0.5) * 2.0 * maxT
    * (0.75 + 0.25 * cos(uTime * 0.7 + seed.w * TAU));
  float rz = (seed.w - 0.5) * 1.2 * maxT * (0.85 + 0.15 * wob);
  float cx = cos(rx); float sx = sin(rx);
  float cy = cos(ry); float sy = sin(ry);
  float cz = cos(rz); float sz = sin(rz);
  R = mat3(cz, sz, 0.0, -sz, cz, 0.0, 0.0, 0.0, 1.0)
    * mat3(cy, 0.0, -sy, 0.0, 1.0, 0.0, sy, 0.0, cy)
    * mat3(1.0, 0.0, 0.0, 0.0, cx, sx, 0.0, -sx, cx);

  lift = uLift * act * (0.72 + 0.36 * seed.y)
    * (0.86 + 0.14 * sin(uTime * 0.9 + seed.w * TAU));
  vec2 shift = (seed.zw - 0.5) * 2.0 * uScatter * act * (0.85 + 0.15 * wob);
  anchor = center + shift;
  k = max(min(uCorner * act, uTile * 0.45), 1e-2);
}

bool invMap (
  vec2 P,
  mat3 R,
  float lift,
  vec2 anchor,
  out vec2 q
) {
  vec2 w = P - anchor;
  float m11 = uPersp * R[0][0] + w.x * R[0][2];
  float m12 = uPersp * R[1][0] + w.x * R[1][2];
  float m21 = uPersp * R[0][1] + w.y * R[0][2];
  float m22 = uPersp * R[1][1] + w.y * R[1][2];
  float det = m11 * m22 - m12 * m21;
  if (abs(det) < 1e-4) return false;
  vec2 b = w * (uPersp - lift);
  q = vec2(m22 * b.x - m12 * b.y, m11 * b.y - m21 * b.x) / det;
  return true;
}

void main () {
  vec2 P = gl_FragCoord.xy;
  vec2 Pc = P + vec2(uScroll.x, -uScroll.y);
  vec2 uvR = P / uResolution;

  float aspect = uResolution.x / uResolution.y;
  float radius = max(uRadius * uActive, 1e-4);
  vec2 duv = vec2((uvR.x - uPointer.x) * aspect, uvR.y - uPointer.y);
  float slack = 3.0 * uTile / uResolution.y;
  float inner = radius * (1.0 - clamp(uSoftness, 0.0, 1.0));
  float lensB = (1.0
    - smoothstep(inner, radius, max(length(duv) - slack, 0.0))) * uActive;
  float maskB = max(lensB, clamp(uBase, 0.0, 1.0))
    * clamp(uStrength, 0.0, 1.0);
  if (maskB < 1e-4) {
    outColor = vec4(0.0);
    return;
  }

  vec2 cuvR = vec2(
    clamp(uvR.x, 0.0005, uMaxX - 0.0005),
    clamp(uvR.y, 0.0005, 0.9995));
  vec4 tex = texture(uContent, vec2(cuvR.x, 1.0 - cuvR.y));
  float guard = step(uvR.x, uMaxX) * tex.a;
  if (guard < 1e-4) {
    outColor = vec4(0.0);
    return;
  }

  vec2 baseCell = floor(Pc / uTile);
  float act; mat3 R; float lift; vec2 anchor; float k;
  vec2 sxy; vec2 q;

  float shadowGain = clamp(uShadow, 0.0, 2.0) * 0.5;
  float shadowA = 0.0;
  float shadowZ = 0.0;
  vec2 shadowCell = vec2(1e6);

  float sumA = 0.0;
  float maxAct = 0.0;
  float k1 = -1e9; float a1 = 0.0; vec3 c1 = vec3(0.0);
  vec2 cell1 = vec2(1e6);
  float k2 = -1e9; float a2 = 0.0; vec3 c2 = vec3(0.0);
  vec2 cell2 = vec2(1e6);

  float restReach = uTile * 0.95 + 3.0;
  float reach = uTile * 1.8 + uScatter + uLift * 0.4;
  float rr = max(reach, uTile + uScatter + uLift);

  for (int j = -2; j <= 2; j++) {
    for (int i = -2; i <= 2; i++) {
      vec2 cell = baseCell + vec2(float(i), float(j));
      vec2 center = (cell + 0.5) * uTile;
      vec2 cp = center - Pc;
      float cd = dot(cp, cp);
      if (cd > rr * rr) continue;
      act = cellAct(cell, sxy);
      maxAct = max(maxAct, act);

      if (act < 1e-3) {
        if (cd > restReach * restReach) continue;
        float d = shardD(Pc - center, cell, 1e-2);
        float a = 1.0 - smoothstep(-1.5, 1.5, -d);
        if (a < 0.003) continue;
        sumA += a;
        if (0.0 > k1) {
          k2 = k1; a2 = a1; c2 = c1; cell2 = cell1;
          k1 = 0.0; a1 = a; c1 = tex.rgb; cell1 = cell;
        } else if (0.0 > k2) {
          k2 = 0.0; a2 = a; c2 = tex.rgb; cell2 = cell;
        }
        continue;
      }

      cellDyn(cell, sxy, act, R, lift, anchor, k);

      if (shadowGain > 1e-3 && lift > 0.5) {
        vec2 qs = Pc + LIGHT * lift * 0.5 - anchor;
        float blur = max(lift * 0.4, 1.0);
        float srad = uTile * 0.95 + blur;
        if (dot(qs, qs) < srad * srad) {
          float sA = 1.0 - smoothstep(-blur, blur, -shardD(qs, cell, k));
          sA *= shadowGain * act * act;
          if (sA > shadowA) {
            shadowA = sA;
            shadowZ = lift;
            shadowCell = cell;
          }
        }
      }

      if (cd > reach * reach) continue;
      if (!invMap(Pc, R, lift, anchor, q)) continue;
      float d = shardD(q, cell, k);
      float a = 1.0 - smoothstep(-1.5, 1.5, -d);
      if (a < 0.003) continue;
      vec2 uvS = (center + q - vec2(uScroll.x, -uScroll.y)) / uResolution;
      vec3 n = R * vec3(0.0, 0.0, 1.0);
      float rA = uRefract * act * act;
      vec3 col;
      if (rA < 1e-3) {
        col = pick(uvS);
      } else {
        vec2 refr = -n.xy * (rA * uTile * 0.25) / uResolution;
        float spread = uDispersion * 0.6;
        if (spread < 1e-3) {
          col = pick(uvS + refr);
        } else {
          col = vec3(
            pick(uvS + refr * (1.0 + spread)).r,
            pick(uvS + refr).g,
            pick(uvS + refr * (1.0 - spread)).b);
        }
      }
      col *= clamp(
        1.0 + clamp(uShading, 0.0, 2.0) * act * dot(n.xy, LIGHT) * 0.6,
        0.0, 2.0);
      sumA += a;
      if (lift > k1) {
        k2 = k1; a2 = a1; c2 = c1; cell2 = cell1;
        k1 = lift; a1 = a; c1 = col; cell1 = cell;
      } else if (lift > k2) {
        k2 = lift; a2 = a; c2 = col; cell2 = cell;
      }
    }
  }

  if (maxAct < 1e-3 && shadowA < 1e-3) {
    outColor = vec4(0.0);
    return;
  }

  if (shadowA > 1e-3) {
    if (any(notEqual(cell1, shadowCell))) {
      c1 *= 1.0 - shadowA * clamp((shadowZ - k1) / (uTile * 0.2), 0.0, 1.0);
    }
    if (any(notEqual(cell2, shadowCell))) {
      c2 *= 1.0 - shadowA * clamp((shadowZ - k2) / (uTile * 0.2), 0.0, 1.0);
    }
  }

  float cover = clamp(sumA, 0.0, 1.0);
  float sep = max(uLift * 0.25, 2.0);
  float f = clamp((k1 - k2) / sep, 0.0, 1.0);
  float w1 = a1 * (0.5 + 0.5 * f);
  float w2 = a2 * (1.0 - w1);
  float layered = w1 + w2;
  vec3 shardCol = layered > 1e-6
    ? (c1 * w1 + c2 * w2) / layered
    : uGap;
  float bgRecv = shadowA * clamp(shadowZ / (uTile * 0.2), 0.0, 1.0);
  vec3 bg = uGap * (1.0 - bgRecv);
  outColor = vec4(mix(bg, shardCol, cover), guard);
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

export function createShatter(
  elements: ShatterElements,
  options: ShatterOptions = {},
): ShatterInstance | null {
  const config = { ...DEFAULTS, ...options };
  const { source, content, output } = elements;

  const gl = output.getContext("webgl2", {
    alpha: true,
    depth: false,
    stencil: false,
    antialias: true,
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
        wake();
      } catch {}
    };
  }

  function compile(type: number, text: string): WebGLShader {
    const shader = gl!.createShader(type)!;
    gl!.shaderSource(shader, text);
    gl!.compileShader(shader);
    if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) {
      console.error("Shatter shader error:", gl!.getShaderInfoLog(shader));
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
    console.error("Shatter link error:", gl.getProgramInfoLog(program));
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

  const pointer = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, active: 0, target: 0 };
  let time = 0;

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

  function render() {
    uploadContent();
    gl!.useProgram(program);
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, contentTexture);
    gl!.uniform1i(uniforms.uContent, 0);
    gl!.uniform2f(uniforms.uResolution, output.width, output.height);
    const dpr = output.width / Math.max(output.clientWidth, 1);
    const tilePx = Math.max(config.tileSize, 24) * dpr;
    gl!.uniform1f(uniforms.uTile, tilePx);
    gl!.uniform1f(uniforms.uCorner, Math.max(config.corner, 0) * dpr);
    gl!.uniform1f(uniforms.uLift, Math.max(config.lift, 0) * dpr);
    gl!.uniform1f(uniforms.uTilt, config.tilt);
    gl!.uniform1f(uniforms.uScatter, Math.max(config.scatter, 0) * dpr);
    gl!.uniform1f(uniforms.uPersp, Math.max(config.perspective, 200) * dpr);
    gl!.uniform3f(
      uniforms.uGap,
      config.gapColor[0],
      config.gapColor[1],
      config.gapColor[2],
    );
    gl!.uniform1f(uniforms.uShadow, config.shadow);
    gl!.uniform1f(uniforms.uShading, config.shading);
    gl!.uniform1f(uniforms.uShards, Math.min(Math.max(config.shards, 0), 1));
    gl!.uniform1f(uniforms.uRefract, Math.max(config.refraction, 0));
    gl!.uniform1f(
      uniforms.uDispersion,
      Math.min(Math.max(config.dispersion, 0), 1),
    );
    gl!.uniform1f(uniforms.uTime, time);
    gl!.uniform2f(uniforms.uPointer, pointer.x, pointer.y);
    gl!.uniform1f(uniforms.uActive, pointer.active);
    gl!.uniform1f(uniforms.uRadius, Math.max(config.radius, 0.01));
    gl!.uniform1f(uniforms.uSoftness, config.softness);
    gl!.uniform1f(uniforms.uStrength, config.strength);
    gl!.uniform1f(uniforms.uBase, config.baseStrength);
    gl!.uniform1f(uniforms.uMaxX, contentMaxX);
    gl!.uniform2f(
      uniforms.uScroll,
      content.scrollLeft * dpr,
      content.scrollTop * dpr,
    );
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
    gl!.viewport(0, 0, output.width, output.height);
    gl!.disable(gl!.BLEND);
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
    const floating =
      !reducedMotion &&
      config.floatSpeed > 0.001 &&
      Math.min(config.strength, 1) > 0.001 &&
      (pointer.active > 1e-3 || Math.min(config.baseStrength, 1) > 0.001);
    if (floating) {
      time += delta * config.floatSpeed;
      if (time >= TIME_WRAP) time -= TIME_WRAP;
    }
    const settled =
      !floating &&
      Math.abs(pointer.tx - pointer.x) < 5e-4 &&
      Math.abs(pointer.ty - pointer.y) < 5e-4 &&
      Math.abs(pointer.target - pointer.active) < 1e-3;
    if (settled) {
      pointer.x = pointer.tx;
      pointer.y = pointer.ty;
      pointer.active = pointer.target;
    }
    render();
    if (settled && !contentDirty) {
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

  listenTarget.addEventListener("pointermove", onPointerMove, { passive: true });
  listenTarget.addEventListener("pointerleave", onPointerLeave, { passive: true });
  content.addEventListener("scroll", start, { passive: true });

  return {
    setOptions(next) {
      if (
        !Object.entries(next).some(
          ([key, value]) => config[key as keyof ShatterOptions] !== value,
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
      observer.disconnect();
      intersection.disconnect();
      motionQuery.removeEventListener("change", onMotionChange);
      listenTarget.removeEventListener("pointermove", onPointerMove);
      listenTarget.removeEventListener("pointerleave", onPointerLeave);
      content.removeEventListener("scroll", start);
      gl!.deleteTexture(contentTexture);
      gl!.deleteProgram(program);
      gl!.deleteShader(vertexShader);
      gl!.deleteShader(fragmentShader);
      gl!.deleteBuffer(quad);
      if (htmlInCanvas) paintable.onpaint = null;
    },
  };
}
