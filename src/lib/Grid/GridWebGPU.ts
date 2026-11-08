import { getCanvasPixelRatio, createCanvasResizeObserver } from "../canvas-viewport";
import { isHtmlInCanvasBlocked, prepareHtmlInCanvas, drawHtmlInCanvas } from "../html-in-canvas";
import {
  effect,
  frame as gpuFrame,
  init,
  sampler,
  surface,
  target,
  type Effect,
  type Gpu,
  type Surface,
  type Target,
} from "vgpu";
import type { Texture } from "vgpu";

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
  /** Canvas the WebGPU effect renders to. */
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

function createRectCache(element: Element) {
  let current = element.getBoundingClientRect();
  const refresh = () => {
    current = element.getBoundingClientRect();
  };
  const observer = new ResizeObserver(refresh);
  observer.observe(element);
  window.addEventListener("resize", refresh, { passive: true });
  window.addEventListener("scroll", refresh, { capture: true, passive: true });
  return {
    get current() {
      return current;
    },
    destroy() {
      observer.disconnect();
      window.removeEventListener("resize", refresh);
      window.removeEventListener("scroll", refresh, true);
    },
  };
}

const TILE_FIELD_SHADER = /* wgsl */ `
struct Params {
  trail: array<vec4f, 64>,
  gridTiles: vec2f,
  trailCount: u32,
  worldPerTile: f32,
  waveSpeed: f32,
  frequency: f32,
  waveWidth: f32,
  fadeTime: f32,
  amplitude: f32,
  jitter: f32,
  maxLift: f32,
}

@group(0) @binding(0) var<uniform> params: Params;

fn hash2(pIn: vec2f) -> vec2f {
  var p = vec2f(dot(pIn, vec2f(127.1, 311.7)), dot(pIn, vec2f(269.5, 183.3)));
  return fract(sin(p) * 43758.5453123) - 0.5;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let tile = floor(vec2f(uv.x, 1.0 - uv.y) * params.gridTiles);
  let world = (tile + 0.5) * params.worldPerTile + hash2(tile) * params.jitter * 0.12;

  var waveHeight = 0.0;
  var totalWeight = 0.0;
  for (var i = 0u; i < 64u; i++) {
    if (i >= params.trailCount) { break; }
    let td = params.trail[i];
    let delta = world - td.xy;
    let dist = length(delta);
    let relDist = dist - params.waveSpeed * td.z;
    let window = exp(-(relDist * relDist) / (params.waveWidth * params.waveWidth));
    let fade = exp(-td.z / params.fadeTime);
    let atten = 1.0 / (1.0 + dist * 3.0);
    let weight = fade * window * atten * td.w;
    waveHeight += weight * cos(params.frequency * relDist);
    totalWeight += weight;
  }

  let lift = clamp(
    waveHeight / max(totalWeight, 1.0) * params.amplitude,
    -params.maxLift,
    params.maxLift);
  return vec4f(lift * 0.5 + 0.5, 0.0, 0.0, 1.0);
}`;

const MAIN_SHADER = /* wgsl */ `
struct Params {
  tint: vec4f,
  resolution: vec2f,
  gridTiles: vec2f,
  vanish: vec2f,
  tilePx: f32,
  gapPx: f32,
  cornerPx: f32,
  liftPx: f32,
  persp: f32,
  shading: f32,
  tintStrength: f32,
  maxX: f32,
  hasContent: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var uContent: texture_2d<f32>;
@group(0) @binding(2) var uTiles: texture_2d<f32>;
@group(0) @binding(3) var uSampler: sampler;

fn tileLift(idxIn: vec2i) -> f32 {
  let maxIdx = vec2i(params.gridTiles) - vec2i(1);
  let idx = clamp(idxIn, vec2i(0), maxIdx);
  let loadY = i32(params.gridTiles.y) - 1 - idx.y;
  return textureLoad(uTiles, vec2i(idx.x, loadY), 0).r * 2.0 - 1.0;
}

fn roundedBox(p: vec2f, b: vec2f, r: f32) -> f32 {
  let q = abs(p) - b + r;
  return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - r;
}

fn tileSd(w: vec2f, idx: vec2i, halfSize: f32) -> f32 {
  let center = (vec2f(idx) + 0.5) * params.tilePx;
  return roundedBox(w - center, vec2f(halfSize), min(params.cornerPx, halfSize));
}

fn unproject(p: vec2f, z: f32) -> vec2f {
  return params.vanish + (p - params.vanish) * (params.persp - z) / params.persp;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let vUv = vec2f(uv.x, 1.0 - uv.y);
  if (vUv.x > params.maxX) {
    return vec4f(0.0);
  }

  let pos = vUv * params.resolution;
  let halfSize = params.tilePx * 0.5 - params.gapPx * 0.5;
  var bestZ = -1000000.0;
  var edgeSd = 1.0;
  var bestIdx = vec2i(-1);
  var bestW = pos;
  var bestLift = 0.0;
  var bestIsWall = false;
  var wallN = vec2f(0.0);
  var lastIdx = vec2i(-9999);

  for (var k = 0; k < 8; k++) {
    let probeZ = (f32(k) / 3.5 - 1.0) * params.liftPx;
    let idx = clamp(
      vec2i(floor(unproject(pos, probeZ) / params.tilePx)),
      vec2i(0),
      vec2i(params.gridTiles) - vec2i(1));
    if (all(idx == lastIdx)) { continue; }
    lastIdx = idx;

    let lift = tileLift(idx);
    let h = lift * params.liftPx;
    if (h <= bestZ) { continue; }

    let wh = unproject(pos, h);
    let sdTop = tileSd(wh, idx, halfSize);

    if (sdTop < 0.75) {
      bestZ = h;
      edgeSd = sdTop;
      bestIdx = idx;
      bestW = wh;
      bestLift = lift;
      bestIsWall = false;
    } else if (h > 0.0) {
      let sd0 = tileSd(pos, idx, halfSize);
      if (sd0 < 0.75) {
        var za = 0.0;
        var zb = h;
        for (var r = 0; r < 3; r++) {
          let zm = (za + zb) * 0.5;
          let sm = tileSd(unproject(pos, zm), idx, halfSize);
          if (sm < 0.0) {
            za = zm;
          } else {
            zb = zm;
          }
        }
        let zStar = (za + zb) * 0.5;
        if (zStar > bestZ) {
          let wz = unproject(pos, zStar);
          let e = vec2f(0.75, 0.0);
          wallN = normalize(vec2f(
            tileSd(wz + e.xy, idx, halfSize) - tileSd(wz - e.xy, idx, halfSize),
            tileSd(wz + e.yx, idx, halfSize) - tileSd(wz - e.yx, idx, halfSize)
          ) + vec2f(0.00001));
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
    return vec4f(0.0);
  }

  let mask = 1.0 - smoothstep(-0.75, 0.75, edgeSd);
  if (mask <= 0.0) {
    return vec4f(0.0);
  }

  let tileOrigin = vec2f(bestIdx) * params.tilePx;
  let samplePos = clamp(
    bestW,
    tileOrigin + vec2f(0.5),
    tileOrigin + vec2f(params.tilePx - 0.5));
  var sampleUv = samplePos / params.resolution;
  sampleUv.x = min(sampleUv.x, params.maxX - 0.002);

  var content: vec4f;
  if (params.hasContent > 0.5) {
    content = textureSampleLevel(uContent, uSampler, vec2f(sampleUv.x, 1.0 - sampleUv.y), 0.0);
  } else {
    let liftAmt = clamp(abs(bestLift), 0.0, 1.0);
    content = vec4f(
      mix(vec3f(0.62), params.tint.rgb, clamp(params.tintStrength, 0.0, 1.0)),
      liftAmt * 0.55);
  }

  let t = clamp(bestLift, 0.0, 1.0) * params.tintStrength;
  var col: vec3f;
  var alpha: f32;
  if (bestIsWall) {
    let lightDir = normalize(vec2f(-0.55, 0.8));
    let facing = dot(wallN, lightDir);
    let shade = 1.0 - (0.5 - 0.32 * facing) * params.shading;
    col = content.rgb * shade;
    alpha = select(min(content.a * 1.5, 0.85), max(content.a, 0.85), params.hasContent > 0.5);
  } else {
    let gx = tileLift(bestIdx + vec2i(1, 0)) - tileLift(bestIdx - vec2i(1, 0));
    let gy = tileLift(bestIdx + vec2i(0, 1)) - tileLift(bestIdx - vec2i(0, 1));
    var shade = (gy - gx) * 0.25 * params.shading;
    shade += clamp(bestLift, -1.0, 1.0) * 0.1 * params.shading;
    col = content.rgb * (1.0 + shade * 0.85) + shade * 0.12;
    alpha = clamp(content.a + t + abs(shade) * 0.5, 0.0, 1.0);
  }

  col = mix(col, params.tint.rgb, t);
  let aOut = alpha * mask;
  return vec4f(col * aOut, aOut);
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

/** True when the browser exposes WebGPU. The device itself is requested lazily. */
export function supportsWebGPU(): boolean {
  return typeof navigator !== "undefined" && Boolean(navigator.gpu);
}

let sharedGpu: Promise<Gpu> | null = null;

function acquireGpu(): Promise<Gpu> {
  if (!sharedGpu) {
    sharedGpu = init().catch((error) => {
      sharedGpu = null;
      throw error;
    });
  }
  return sharedGpu;
}

function destroyTarget(value: Target | null) {
  (value as unknown as { destroy(): void } | null)?.destroy();
}

export function createGrid(
  elements: GridElements,
  options: GridOptions = {},
): GridInstance | null {
  if (!supportsWebGPU()) return null;
  const config = { ...DEFAULTS, ...options };
  const { source, content, output } = elements;

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

  function dpr() {
    return getCanvasPixelRatio(output);
  }

  let gpu: Gpu | null = null;
  let screen: Surface | null = null;
  let tileFieldFx: Effect | null = null;
  let mainFx: Effect | null = null;
  let contentTexture: Texture | null = null;
  let tileTarget: Target | null = null;
  let fallback2d: CanvasRenderingContext2D | null = null;
  let tilesX = 0;
  let tilesY = 0;
  let contentMaxX = 1;

  function syncCanvasSize() {
    const scale = dpr();
    const width = Math.max(1, Math.round(output.clientWidth * scale));
    const height = Math.max(1, Math.round(output.clientHeight * scale));
    if (screen) {
      const [w, h] = screen.size;
      if (w !== width || h !== height) screen.resize([width, height]);
    } else if (output.width !== width || output.height !== height) {
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

  function ensureContentTexture(): Texture {
    const w = Math.max(1, source.width);
    const h = Math.max(1, source.height);
    if (
      !contentTexture ||
      contentTexture.size[0] !== w ||
      contentTexture.size[1] !== h
    ) {
      // A new wrapper invalidates vgpu's cached bindings to the old texture.
      contentTexture?.destroy();
      contentTexture = gpu!.device.createTexture({
        size: [w, h],
        format: "rgba8unorm",
        usage: ["texture_binding", "copy_dst", "render_attachment"],
        label: "grid.content",
      });
    }
    return contentTexture;
  }

  function ensureTileTargets() {
    if (!gpu || !screen) return;
    const scale = output.width / Math.max(output.clientWidth, 1);
    const tilePx = Math.max(config.tileSize, 8) * scale;
    const nx = Math.max(1, Math.ceil(output.width / tilePx));
    const ny = Math.max(1, Math.ceil(output.height / tilePx));
    if (!tileTarget) {
      tilesX = nx;
      tilesY = ny;
      tileTarget = target(gpu, {
        size: [tilesX, tilesY],
        format: "rgba8unorm",
        clearColor: [0.5, 0, 0, 1],
        label: "grid.tiles",
      });
    } else if (nx !== tilesX || ny !== tilesY) {
      tilesX = nx;
      tilesY = ny;
      tileTarget.resize([tilesX, tilesY]);
    }
  }

  function uploadContent() {
    if (!htmlInCanvas || !contentDirty || !gpu || !mainFx) return;
    contentDirty = false;
    const texture = ensureContentTexture();
    gpu.gpu.queue.copyExternalImageToTexture(
      { source },
      { texture: texture.gpu },
      [source.width, source.height],
    );
    mainFx.set({ uContent: texture });
  }

  function renderFallback() {
    if (!fallback2d || !htmlInCanvas || !contentDirty) return;
    contentDirty = false;
    fallback2d.clearRect(0, 0, output.width, output.height);
    fallback2d.drawImage(source, 0, 0, output.width, output.height);
  }

  type TrailPoint = { x: number; y: number; age: number; strength: number };
  const trail: TrailPoint[] = [];
  const trailUniform: [number, number, number, number][] = Array.from(
    { length: MAX_TRAIL },
    () => [0, 0, 0, 0],
  );
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

    for (let i = 0; i < MAX_TRAIL; i++) {
      trailUniform[i][0] = 0;
      trailUniform[i][1] = 0;
      trailUniform[i][2] = 0;
      trailUniform[i][3] = 0;
    }
    const count = Math.min(trail.length, MAX_TRAIL);
    for (let i = 0; i < count; i++) {
      trailUniform[i][0] = trail[i].x;
      trailUniform[i][1] = trail[i].y;
      trailUniform[i][2] = trail[i].age;
      trailUniform[i][3] = trail[i].strength;
    }
    return count;
  }

  let vanishX = 0.5;
  let vanishY = 0.5;
  let vanishTargetX = 0.5;
  let vanishTargetY = 0.5;

  function render(trailCount: number, delta: number) {
    if (!gpu || !screen || !tileFieldFx || !mainFx) return;
    uploadContent();
    ensureTileTargets();
    if (!tileTarget) return;
    const scale = output.width / Math.max(output.clientWidth, 1);
    const tilePx = Math.max(config.tileSize, 8) * scale;
    const ease = 1 - Math.exp(-delta * 4);
    vanishX += (vanishTargetX - vanishX) * ease;
    vanishY += (vanishTargetY - vanishY) * ease;

    tileFieldFx.set({
      params: {
        trail: trailUniform,
        gridTiles: [tilesX, tilesY],
        trailCount,
        worldPerTile: tilePx / output.height,
        waveSpeed: Math.max(config.waveSpeed, 0.01),
        frequency: config.frequency,
        waveWidth: Math.max(config.waveWidth, 0.01),
        fadeTime: Math.max(config.fadeTime, 0.1),
        amplitude: config.amplitude,
        jitter: config.jitter,
        maxLift: Math.max(config.maxLift, 0.01),
      },
    });
    tileFieldFx.draw(tileTarget);

    mainFx.set({
      uContent: ensureContentTexture(),
      uTiles: tileTarget,
      params: {
        tint: [...config.tint, 0],
        resolution: screen.size,
        gridTiles: [tilesX, tilesY],
        vanish: [
          (0.5 + (vanishX - 0.5) * config.tilt) * output.width,
          (0.5 + (0.5 - vanishY) * config.tilt) * output.height,
        ],
        tilePx,
        gapPx: Math.max(config.gap, 0) * scale,
        cornerPx: Math.max(config.cornerRadius, 0) * scale,
        liftPx: Math.max(config.liftHeight, 0) * scale,
        persp: Math.max(config.perspective, 100) * scale,
        shading: config.shading,
        tintStrength: config.tintStrength,
        maxX: contentMaxX,
        hasContent: htmlInCanvas ? 1 : 0,
      },
    });
    gpuFrame(gpu, (f) => f.pass(screen!, mainFx!));
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
    if (fallback2d) {
      renderFallback();
      running = false;
      return;
    }
    if (!gpu) {
      running = false;
      return;
    }
    const delta = Math.min((now - lastTime) / 1000, 1 / 30);
    lastTime = now;
    const trailCount = reducedMotion ? 0 : updateTrail(delta);
    render(trailCount, delta);
    const settling =
      Math.abs(vanishX - vanishTargetX) + Math.abs(vanishY - vanishTargetY) > 0.001;
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

  acquireGpu()
    .then((device) => {
      if (destroyed) return;
      gpu = device;
      screen = surface(gpu, output, {
        autoResize: false,
        alphaMode: "premultiplied",
        label: "grid",
      });
      const linear = sampler(gpu, {
        minFilter: "linear",
        magFilter: "linear",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
      });
      tileFieldFx = effect(gpu, TILE_FIELD_SHADER, { label: "grid.tile-field" });
      mainFx = effect(gpu, MAIN_SHADER, {
        label: "grid.main",
        set: { uSampler: linear, uContent: ensureContentTexture() },
      });
      syncCanvasSize();
      ensureTileTargets();
      start();
    })
    .catch((error) => {
      if (destroyed) return;
      console.warn("Grid: WebGPU unavailable, showing content without the effect.", error);
      fallback2d = output.getContext("2d");
      contentDirty = true;
      start();
    });

  function onMotionChange() {
    reducedMotion = motionQuery.matches;
    if (reducedMotion) trail.length = 0;
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
      contentTexture?.destroy();
      destroyTarget(tileTarget);
      screen?.dispose();
      if (htmlInCanvas) paintable.onpaint = null;
    },
  };
}
