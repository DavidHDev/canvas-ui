import { createRectCache } from "../rect-cache";

export interface GridOptions {
  /** Size of each grid tile in CSS pixels. */
  tileSize?: number;
  /** Gap between tiles in CSS pixels. */
  gap?: number;
  /** Corner radius of each tile in CSS pixels. */
  cornerRadius?: number;
  /** Overall strength of the wave displacement. */
  amplitude?: number;
  /** How fast the wavefront expands, in screen heights per second. */
  waveSpeed?: number;
  /** Spatial oscillation of the wave. Higher means more ripples per wave. */
  frequency?: number;
  /** Width of the wave ring as a fraction of the screen height. */
  waveWidth?: number;
  /** Seconds for a wave to fade to roughly a third of its strength. */
  fadeTime?: number;
  /** Maximum lift a tile can reach (0 to 1). */
  maxLift?: number;
  /** Per-tile randomness in how tiles respond to the wave (0 to 1). */
  jitter?: number;
  /** How high a fully lifted cube rises, in CSS pixels. */
  liftHeight?: number;
  /** Camera distance in CSS pixels, like CSS perspective. Lower is more dramatic. */
  perspective?: number;
  /** How much the camera vanishing point leans toward the cursor (0 to 1). */
  tilt?: number;
  /** Strength of the lighting on cube tops and side walls. */
  shading?: number;
  /** Color lifted tiles blend toward as [r, g, b] in 0-1 range. */
  tint?: [number, number, number];
  /** How strongly lifted tiles take on the tint color (0 to 1). */
  tintStrength?: number;
  /** Seconds between ambient ripples when the cursor is idle. 0 disables. */
  idleRipples?: number;
}

export interface GridElements {
  /** Canvas with layoutsubtree that hosts the HTML content. */
  source: HTMLCanvasElement;
  /** The element inside the source canvas that gets captured. */
  content: HTMLElement;
  /** Canvas the WebGL effect renders to. */
  output: HTMLCanvasElement;
}

export interface GridInstance {
  /** Update effect options live. */
  setOptions: (options: GridOptions) => void;
  /** Re-read canvas size. Call when the element is resized. */
  resize: () => void;
  /** Stop the loop and release all GPU resources. */
  destroy: () => void;
}

const DEFAULTS: Required<GridOptions> = {
  tileSize: 150,
  gap: 0,
  cornerRadius: 0,
  amplitude: 2.5,
  waveSpeed: 0.5,
  frequency: 12,
  waveWidth: 0.05,
  fadeTime: 0.2,
  maxLift: 1,
  jitter: 0,
  liftHeight: 60,
  perspective: 1200,
  tilt: 1,
  shading: 0.05,
  tint: [0, 0.33, 1],
  tintStrength: 0.1,
  idleRipples: 0,
};

const MAX_TRAIL = 64;
const TRAIL_SPACING = 0.03;
const IDLE_DELAY = 3;

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

const TILE_FRAG = `#version 300 es
precision highp float;
out vec4 outColor;
uniform sampler2D uTrail;
uniform int uTrailCount;
uniform float uWorldPerTile;
uniform float uWaveSpeed;
uniform float uFrequency;
uniform float uWaveWidth;
uniform float uFadeTime;
uniform float uAmplitude;
uniform float uJitter;
uniform float uMaxLift;

vec2 hash2 (vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453123) - 0.5;
}

void main () {
  vec2 tile = floor(gl_FragCoord.xy);
  vec2 world = (tile + 0.5) * uWorldPerTile + hash2(tile) * uJitter * 0.12;

  float waveHeight = 0.0;
  float totalWeight = 0.0;

  for (int i = 0; i < 64; i++) {
    if (i >= uTrailCount) break;

    vec4 td = texelFetch(uTrail, ivec2(i, 0), 0);
    vec2 delta = world - td.xy;
    float dist = length(delta);
    float relDist = dist - uWaveSpeed * td.z;

    float window = exp(-(relDist * relDist) / (uWaveWidth * uWaveWidth));

    float fade = exp(-td.z / uFadeTime);
    float atten = 1.0 / (1.0 + dist * 3.0);
    float weight = fade * window * atten * td.w;
    waveHeight += weight * cos(uFrequency * relDist);
    totalWeight += weight;
  }

  float lift = clamp(
    waveHeight / max(totalWeight, 1.0) * uAmplitude, -uMaxLift, uMaxLift
  );

  outColor = vec4(lift * 0.5 + 0.5, 0.0, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uContent;
uniform sampler2D uTiles;
uniform vec2 uResolution;
uniform ivec2 uGridTiles;
uniform float uTilePx;
uniform float uGapPx;
uniform float uCornerPx;
uniform float uLiftPx;
uniform float uPersp;
uniform vec2 uVanish;
uniform float uShading;
uniform vec3 uTint;
uniform float uTintStrength;
uniform float uMaxX;
uniform float uHasContent;

float tileLift (ivec2 idx) {
  idx = clamp(idx, ivec2(0), uGridTiles - 1);
  return texelFetch(uTiles, idx, 0).r * 2.0 - 1.0;
}

float roundedBox (vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

float tileSd (vec2 w, ivec2 idx, float halfSize) {
  vec2 center = (vec2(idx) + 0.5) * uTilePx;
  return roundedBox(w - center, vec2(halfSize), min(uCornerPx, halfSize));
}

vec2 unproject (vec2 p, float z) {
  return uVanish + (p - uVanish) * (uPersp - z) / uPersp;
}

void main () {
  if (vUv.x > uMaxX) {
    outColor = vec4(0.0);
    return;
  }

  vec2 pos = vUv * uResolution;
  float halfSize = uTilePx * 0.5 - uGapPx * 0.5;

  float bestZ = -1e6;
  float edgeSd = 1.0;
  ivec2 bestIdx = ivec2(-1);
  vec2 bestW = pos;
  float bestLift = 0.0;
  bool bestIsWall = false;
  vec2 wallN = vec2(0.0);
  ivec2 lastIdx = ivec2(-9999);

  for (int k = 0; k < 8; k++) {
    float probeZ = (float(k) / 3.5 - 1.0) * uLiftPx;
    ivec2 idx = clamp(
      ivec2(floor(unproject(pos, probeZ) / uTilePx)),
      ivec2(0), uGridTiles - 1
    );
    if (all(equal(idx, lastIdx))) continue;
    lastIdx = idx;

    float lift = tileLift(idx);
    float h = lift * uLiftPx;

    if (h <= bestZ) continue;

    vec2 wh = unproject(pos, h);
    float sdTop = tileSd(wh, idx, halfSize);

    if (sdTop < 0.75) {
      bestZ = h;
      edgeSd = sdTop;
      bestIdx = idx;
      bestW = wh;
      bestLift = lift;
      bestIsWall = false;
    } else if (h > 0.0) {
      float sd0 = tileSd(pos, idx, halfSize);
      if (sd0 < 0.75) {
        float za = 0.0;
        float zb = h;
        for (int r = 0; r < 3; r++) {
          float zm = (za + zb) * 0.5;
          float sm = tileSd(unproject(pos, zm), idx, halfSize);
          if (sm < 0.0) { za = zm; } else { zb = zm; }
        }
        float zStar = (za + zb) * 0.5;
        if (zStar > bestZ) {
          vec2 wz = unproject(pos, zStar);
          vec2 e = vec2(0.75, 0.0);
          wallN = normalize(vec2(
            tileSd(wz + e.xy, idx, halfSize) - tileSd(wz - e.xy, idx, halfSize),
            tileSd(wz + e.yx, idx, halfSize) - tileSd(wz - e.yx, idx, halfSize)
          ) + 1e-5);
          bestZ = zStar;
          edgeSd = sd0;
          bestIdx = idx;
          bestW = wz;
          bestLift = lift;
          bestIsWall = true;
        }
      }
    }
  }

  if (bestIdx.x < 0) {
    outColor = vec4(0.0);
    return;
  }
  float mask = 1.0 - smoothstep(-0.75, 0.75, edgeSd);
  if (mask <= 0.0) {
    outColor = vec4(0.0);
    return;
  }

  vec2 tileOrigin = vec2(bestIdx) * uTilePx;
  vec2 samplePos = clamp(bestW, tileOrigin + 0.5, tileOrigin + uTilePx - 0.5);
  vec2 sampleUv = samplePos / uResolution;
  sampleUv.x = min(sampleUv.x, uMaxX - 0.002);
  vec4 content;
  if (uHasContent > 0.5) {
    content = texture(uContent, vec2(sampleUv.x, 1.0 - sampleUv.y));
  } else {
    float liftAmt = clamp(abs(bestLift), 0.0, 1.0);
    content = vec4(
      mix(vec3(0.62), uTint, clamp(uTintStrength, 0.0, 1.0)),
      liftAmt * 0.55);
  }

  float t = clamp(bestLift, 0.0, 1.0) * uTintStrength;
  vec3 col;
  float alpha;

  if (bestIsWall) {
    vec2 lightDir = normalize(vec2(-0.55, 0.8));
    float facing = dot(wallN, lightDir);
    float shade = 1.0 - (0.5 - 0.32 * facing) * uShading;
    col = content.rgb * shade;

    alpha = uHasContent > 0.5 ? max(content.a, 0.85) : min(content.a * 1.5, 0.85);
  } else {
    float gx = tileLift(bestIdx + ivec2(1, 0)) - tileLift(bestIdx - ivec2(1, 0));
    float gy = tileLift(bestIdx + ivec2(0, 1)) - tileLift(bestIdx - ivec2(0, 1));
    float shade = (gy - gx) * 0.25 * uShading;
    shade += clamp(bestLift, -1.0, 1.0) * 0.1 * uShading;
    col = content.rgb * (1.0 + shade * 0.85) + shade * 0.12;
    alpha = clamp(content.a + t + abs(shade) * 0.5, 0.0, 1.0);
  }

  col = mix(col, uTint, t);
  float aOut = alpha * mask;
  outColor = vec4(col * aOut, aOut);
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

export function createGrid(
  elements: GridElements,
  options: GridOptions = {},
): GridInstance | null {
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
      console.error("Grid shader error:", gl!.getShaderInfoLog(shader));
    }
    return shader;
  }

  function link(fragText: string) {
    const vertexShader = compile(gl!.VERTEX_SHADER, VERT);
    const fragmentShader = compile(gl!.FRAGMENT_SHADER, fragText);
    const program = gl!.createProgram()!;
    gl!.attachShader(program, vertexShader);
    gl!.attachShader(program, fragmentShader);
    gl!.linkProgram(program);
    const uniforms: Record<string, WebGLUniformLocation> = {};
    const count = gl!.getProgramParameter(program, gl!.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const info = gl!.getActiveUniform(program, i)!;
      uniforms[info.name] = gl!.getUniformLocation(program, info.name)!;
    }
    return { program, uniforms, vertexShader, fragmentShader };
  }

  const mainPass = link(FRAG);
  const tilePass = link(TILE_FRAG);

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

  const trailData = new Float32Array(MAX_TRAIL * 4);
  const trailTexture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, trailTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA32F,
    MAX_TRAIL,
    1,
    0,
    gl.RGBA,
    gl.FLOAT,
    trailData,
  );

  function dpr() {
    return Math.min(window.devicePixelRatio || 1, 2);
  }

  let tileTexture: WebGLTexture | null = null;
  let tileFbo: WebGLFramebuffer | null = null;
  let tilesX = 0;
  let tilesY = 0;

  function ensureTileTarget() {
    const tilePx = Math.max(config.tileSize, 8) * dpr();
    const nx = Math.max(1, Math.ceil(output.width / tilePx));
    const ny = Math.max(1, Math.ceil(output.height / tilePx));
    if (tileTexture && nx === tilesX && ny === tilesY) return;
    tilesX = nx;
    tilesY = ny;
    if (tileTexture) gl!.deleteTexture(tileTexture);
    if (tileFbo) gl!.deleteFramebuffer(tileFbo);
    tileTexture = gl!.createTexture()!;
    gl!.bindTexture(gl!.TEXTURE_2D, tileTexture);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, gl!.NEAREST);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.NEAREST);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
    gl!.texImage2D(
      gl!.TEXTURE_2D,
      0,
      gl!.RGBA,
      tilesX,
      tilesY,
      0,
      gl!.RGBA,
      gl!.UNSIGNED_BYTE,
      null,
    );
    tileFbo = gl!.createFramebuffer()!;
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, tileFbo);
    gl!.framebufferTexture2D(
      gl!.FRAMEBUFFER,
      gl!.COLOR_ATTACHMENT0,
      gl!.TEXTURE_2D,
      tileTexture,
      0,
    );
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
  }

  let contentMaxX = 1;

  function syncCanvasSize() {
    const scale = dpr();
    const width = Math.max(1, Math.round(output.clientWidth * scale));
    const height = Math.max(1, Math.round(output.clientHeight * scale));
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
      if (source.width !== cssWidth * scale || source.height !== cssHeight * scale) {
        source.width = cssWidth * scale;
        source.height = cssHeight * scale;
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

  type TrailPoint = { x: number; y: number; age: number; strength: number };
  const trail: TrailPoint[] = [];
  let lastPoint: { x: number; y: number } | null = null;
  let timeSinceMove = IDLE_DELAY;
  let idleTimer = 0;

  function addTrailPoint(point: TrailPoint) {
    if (trail.length >= MAX_TRAIL) trail.shift();
    trail.push(point);
  }

  function updateTrail(delta: number) {
    const expiry = Math.max(config.fadeTime, 0.1) * 4;
    for (let i = trail.length - 1; i >= 0; i--) {
      trail[i].age += delta;
      if (trail[i].age > expiry) trail.splice(i, 1);
    }

    timeSinceMove += delta;
    if (config.idleRipples > 0 && timeSinceMove >= IDLE_DELAY) {
      idleTimer += delta;
      if (idleTimer >= config.idleRipples) {
        idleTimer = 0;
        const aspect =
          Math.max(output.clientWidth, 1) / Math.max(output.clientHeight, 1);
        addTrailPoint({
          x: (0.2 + Math.random() * 0.6) * aspect,
          y: 0.2 + Math.random() * 0.6,
          age: 0,
          strength: 0.8 + Math.random() * 0.3,
        });
      }
    }

    const count = Math.min(trail.length, MAX_TRAIL);
    for (let i = 0; i < count; i++) {
      const ti = i * 4;
      trailData[ti] = trail[i].x;
      trailData[ti + 1] = trail[i].y;
      trailData[ti + 2] = trail[i].age;
      trailData[ti + 3] = trail[i].strength;
    }
    gl!.bindTexture(gl!.TEXTURE_2D, trailTexture);
    gl!.texSubImage2D(
      gl!.TEXTURE_2D,
      0,
      0,
      0,
      MAX_TRAIL,
      1,
      gl!.RGBA,
      gl!.FLOAT,
      trailData,
    );
    return count;
  }

  let vanishX = 0.5;
  let vanishY = 0.5;
  let vanishTargetX = 0.5;
  let vanishTargetY = 0.5;

  function render(trailCount: number, delta: number) {
    uploadContent();
    ensureTileTarget();
    const scale = output.width / Math.max(output.clientWidth, 1);
    const tilePx = Math.max(config.tileSize, 8) * scale;

    const ease = 1 - Math.exp(-delta * 4);
    vanishX += (vanishTargetX - vanishX) * ease;
    vanishY += (vanishTargetY - vanishY) * ease;

    gl!.useProgram(tilePass.program);
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, trailTexture);
    gl!.uniform1i(tilePass.uniforms.uTrail, 0);
    gl!.uniform1i(tilePass.uniforms.uTrailCount, trailCount);
    gl!.uniform1f(tilePass.uniforms.uWorldPerTile, tilePx / output.height);
    gl!.uniform1f(
      tilePass.uniforms.uWaveSpeed,
      Math.max(config.waveSpeed, 0.01),
    );
    gl!.uniform1f(tilePass.uniforms.uFrequency, config.frequency);
    gl!.uniform1f(
      tilePass.uniforms.uWaveWidth,
      Math.max(config.waveWidth, 0.01),
    );
    gl!.uniform1f(tilePass.uniforms.uFadeTime, Math.max(config.fadeTime, 0.1));
    gl!.uniform1f(tilePass.uniforms.uAmplitude, config.amplitude);
    gl!.uniform1f(tilePass.uniforms.uJitter, config.jitter);
    gl!.uniform1f(tilePass.uniforms.uMaxLift, Math.max(config.maxLift, 0.01));
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, tileFbo);
    gl!.viewport(0, 0, tilesX, tilesY);
    gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);

    gl!.useProgram(mainPass.program);
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, contentTexture);
    gl!.uniform1i(mainPass.uniforms.uContent, 0);
    gl!.uniform1f(mainPass.uniforms.uHasContent, htmlInCanvas ? 1 : 0);
    gl!.activeTexture(gl!.TEXTURE1);
    gl!.bindTexture(gl!.TEXTURE_2D, tileTexture);
    gl!.uniform1i(mainPass.uniforms.uTiles, 1);
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.uniform2f(mainPass.uniforms.uResolution, output.width, output.height);
    gl!.uniform2i(mainPass.uniforms.uGridTiles, tilesX, tilesY);
    gl!.uniform1f(mainPass.uniforms.uTilePx, tilePx);
    gl!.uniform1f(mainPass.uniforms.uGapPx, Math.max(config.gap, 0) * scale);
    gl!.uniform1f(
      mainPass.uniforms.uCornerPx,
      Math.max(config.cornerRadius, 0) * scale,
    );
    gl!.uniform1f(
      mainPass.uniforms.uLiftPx,
      Math.max(config.liftHeight, 0) * scale,
    );
    gl!.uniform1f(
      mainPass.uniforms.uPersp,
      Math.max(config.perspective, 100) * scale,
    );
    gl!.uniform2f(
      mainPass.uniforms.uVanish,
      (0.5 + (vanishX - 0.5) * config.tilt) * output.width,
      (0.5 + (0.5 - vanishY) * config.tilt) * output.height,
    );
    gl!.uniform1f(mainPass.uniforms.uShading, config.shading);
    gl!.uniform3f(
      mainPass.uniforms.uTint,
      config.tint[0],
      config.tint[1],
      config.tint[2],
    );
    gl!.uniform1f(mainPass.uniforms.uTintStrength, config.tintStrength);
    gl!.uniform1f(mainPass.uniforms.uMaxX, contentMaxX);
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
    const trailCount = reducedMotion ? 0 : updateTrail(delta);
    render(trailCount, delta);
    const settling =
      Math.abs(vanishX - vanishTargetX) + Math.abs(vanishY - vanishTargetY) >
      0.001;
    const animating =
      !reducedMotion && (trailCount > 0 || config.idleRipples > 0 || settling);
    if (!animating && !contentDirty) {
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
    if (reducedMotion) trail.length = 0;
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
    if (reducedMotion) return;
    const rect = rectCache.current;
    const aspect = Math.max(rect.width, 1) / Math.max(rect.height, 1);
    const fx = (event.clientX - rect.left) / Math.max(rect.width, 1);
    const fy = (event.clientY - rect.top) / Math.max(rect.height, 1);
    vanishTargetX = fx;
    vanishTargetY = fy;
    const x = fx * aspect;
    const y = 1 - fy;

    let distDelta = 0.2;
    if (lastPoint) {
      const dx = x - lastPoint.x;
      const dy = y - lastPoint.y;
      distDelta = Math.hypot(dx, dy);
      if (distDelta < TRAIL_SPACING) {
        start();
        return;
      }
    }

    addTrailPoint({
      x,
      y,
      age: 0,
      strength: Math.min(Math.max(distDelta * 6, 0.25), 1.2),
    });
    lastPoint = { x, y };
    timeSinceMove = 0;
    idleTimer = 0;
    start();
  }

  function onPointerLeave() {
    vanishTargetX = 0.5;
    vanishTargetY = 0.5;
    start();
  }

  listenTarget.addEventListener("pointermove", onPointerMove, { passive: true });
  listenTarget.addEventListener("pointerleave", onPointerLeave, { passive: true });

  return {
    setOptions(next) {
      if (
        !Object.entries(next).some(
          ([key, value]) => config[key as keyof GridOptions] !== value,
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
      gl!.deleteTexture(contentTexture);
      gl!.deleteTexture(trailTexture);
      if (tileTexture) gl!.deleteTexture(tileTexture);
      if (tileFbo) gl!.deleteFramebuffer(tileFbo);
      for (const pass of [mainPass, tilePass]) {
        gl!.deleteProgram(pass.program);
        gl!.deleteShader(pass.vertexShader);
        gl!.deleteShader(pass.fragmentShader);
      }
      gl!.deleteBuffer(quad);
      if (htmlInCanvas) paintable.onpaint = null;
    },
  };
}
