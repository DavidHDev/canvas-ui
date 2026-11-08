import { getCanvasPixelRatio, createCanvasResizeObserver } from "../canvas-viewport";
import { isHtmlInCanvasBlocked, prepareHtmlInCanvas, drawHtmlInCanvas } from "../html-in-canvas";
import {
  draw,
  frame as gpuFrame,
  geometry,
  init,
  sampler,
  surface,
  type Draw,
  type Geometry,
  type Gpu,
  type Surface,
} from "vgpu";
import type { Texture } from "vgpu";

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
  /** Canvas the WebGPU effect renders to. */
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

type RectCache = {
  readonly current: DOMRect;
  destroy: () => void;
};

function createRectCache(element: Element): RectCache {
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

const SHADER = /* wgsl */ `
struct Params {
  resolution: vec2f,
  pointer: vec2f,
  scroll: vec2f,
  gap: vec3f,
  activeAmount: f32,
  radius: f32,
  softness: f32,
  strength: f32,
  baseAmount: f32,
  tile: f32,
  shards: f32,
  corner: f32,
  liftAmount: f32,
  tilt: f32,
  scatter: f32,
  persp: f32,
  shadow: f32,
  shading: f32,
  refract: f32,
  dispersion: f32,
  time: f32,
  maxX: f32,
}

struct VSOut {
  @builtin(position) position: vec4f,
  @location(0) uv: vec2f,
}

struct CellActResult {
  act: f32,
  sxy: vec2f,
}

struct CellDynResult {
  R: mat3x3f,
  lift: f32,
  anchor: vec2f,
  k: f32,
}

struct InvMapResult {
  ok: bool,
  q: vec2f,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var uContent: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

const TAU = 6.28318530718;
const LIGHT = vec2f(-0.514495755, 0.857492926);

@vertex fn vs_main(@location(0) pos: vec2f) -> VSOut {
  var out: VSOut;
  out.position = vec4f(pos, 0.0, 1.0);
  out.uv = vec2f(pos.x * 0.5 + 0.5, 0.5 - pos.y * 0.5);
  return out;
}

fn hash22(p: vec2f) -> vec2f {
  var q = fract(vec3f(p.x, p.y, p.x) * vec3f(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + vec3f(33.33));
  return fract((q.xx + q.yz) * q.zy);
}

fn smin(a: f32, b: f32, k: f32) -> f32 {
  let h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

fn shardD(q: vec2f, cell: vec2f, k: f32) -> f32 {
  let jit = params.tile * 0.8 * clamp(params.shards, 0.0, 1.0);
  let s0 = (hash22(cell) - vec2f(0.5)) * jit;
  var d = params.tile;
  for (var i = 0; i < 9; i++) {
    if (i == 4) { continue; }
    let g = vec2f(f32(i % 3 - 1), f32(i / 3 - 1));
    let sn = g * params.tile + (hash22(cell + g) - vec2f(0.5)) * jit;
    let diff = sn - s0;
    let e = -dot(q - s0 - diff * 0.5, normalize(diff));
    d = smin(d, e, k);
  }
  return d;
}

fn pick(uv: vec2f) -> vec3f {
  let c = vec2f(
    clamp(uv.x, 0.0005, params.maxX - 0.0005),
    clamp(uv.y, 0.0005, 0.9995));
  return textureSampleLevel(uContent, uSampler, vec2f(c.x, 1.0 - c.y), 0.0).rgb;
}

fn cellAct(cell: vec2f) -> CellActResult {
  let sxy = hash22(cell + vec2f(13.13));
  let center = (cell + vec2f(0.5)) * params.tile;
  let aspect = params.resolution.x / params.resolution.y;
  let cuv = (center - vec2f(params.scroll.x, -params.scroll.y)) / params.resolution;
  let dv = vec2f((cuv.x - params.pointer.x) * aspect, cuv.y - params.pointer.y);
  let radius = max(params.radius * params.activeAmount, 1e-4);
  let inner = radius * (1.0 - clamp(params.softness, 0.0, 1.0));
  let lens = (1.0 - smoothstep(inner, radius, length(dv))) * params.activeAmount;
  let mask = clamp(max(lens, clamp(params.baseAmount, 0.0, 1.0)), 0.0, 1.0)
    * clamp(params.strength, 0.0, 1.0);
  let th = sxy.x * 0.6;
  return CellActResult(smoothstep(th, th + 0.4, mask), sxy);
}

fn cellDyn(cell: vec2f, sxy: vec2f, act: f32) -> CellDynResult {
  let center = (cell + vec2f(0.5)) * params.tile;
  let seed = vec4f(sxy, hash22(cell + vec2f(27.7)));

  let wob = sin(params.time + seed.z * TAU);
  let maxT = 0.2 * clamp(params.tilt, 0.0, 3.0) * act;
  let rx = (seed.y - 0.5) * 2.0 * maxT
    * (0.75 + 0.25 * wob);
  let ry = (seed.z - 0.5) * 2.0 * maxT
    * (0.75 + 0.25 * cos(params.time * 0.7 + seed.w * TAU));
  let rz = (seed.w - 0.5) * 1.2 * maxT * (0.85 + 0.15 * wob);
  let cx = cos(rx); let sx = sin(rx);
  let cy = cos(ry); let sy = sin(ry);
  let cz = cos(rz); let sz = sin(rz);
  let R = mat3x3f(cz, sz, 0.0, -sz, cz, 0.0, 0.0, 0.0, 1.0)
    * mat3x3f(cy, 0.0, -sy, 0.0, 1.0, 0.0, sy, 0.0, cy)
    * mat3x3f(1.0, 0.0, 0.0, 0.0, cx, sx, 0.0, -sx, cx);

  let lift = params.liftAmount * act * (0.72 + 0.36 * seed.y)
    * (0.86 + 0.14 * sin(params.time * 0.9 + seed.w * TAU));
  let shift = (seed.zw - vec2f(0.5)) * 2.0 * params.scatter * act * (0.85 + 0.15 * wob);
  let anchor = center + shift;
  let k = max(min(params.corner * act, params.tile * 0.45), 1e-2);
  return CellDynResult(R, lift, anchor, k);
}

fn invMap(P: vec2f, R: mat3x3f, lift: f32, anchor: vec2f) -> InvMapResult {
  let w = P - anchor;
  let m11 = params.persp * R[0][0] + w.x * R[0][2];
  let m12 = params.persp * R[1][0] + w.x * R[1][2];
  let m21 = params.persp * R[0][1] + w.y * R[0][2];
  let m22 = params.persp * R[1][1] + w.y * R[1][2];
  let det = m11 * m22 - m12 * m21;
  if (abs(det) < 1e-4) { return InvMapResult(false, vec2f(0.0)); }
  let b = w * (params.persp - lift);
  let q = vec2f(m22 * b.x - m12 * b.y, m11 * b.y - m21 * b.x) / det;
  return InvMapResult(true, q);
}

@fragment fn fs_main(@builtin(position) position: vec4f, @location(0) topUv: vec2f) -> @location(0) vec4f {
  _ = topUv;
  let P = vec2f(position.x, params.resolution.y - position.y);
  let Pc = P + vec2f(params.scroll.x, -params.scroll.y);
  let uvR = P / params.resolution;

  let aspect = params.resolution.x / params.resolution.y;
  let radius = max(params.radius * params.activeAmount, 1e-4);
  let duv = vec2f((uvR.x - params.pointer.x) * aspect, uvR.y - params.pointer.y);
  let slack = 3.0 * params.tile / params.resolution.y;
  let inner = radius * (1.0 - clamp(params.softness, 0.0, 1.0));
  let lensB = (1.0
    - smoothstep(inner, radius, max(length(duv) - slack, 0.0))) * params.activeAmount;
  let maskB = max(lensB, clamp(params.baseAmount, 0.0, 1.0))
    * clamp(params.strength, 0.0, 1.0);
  if (maskB < 1e-4) {
    return vec4f(0.0);
  }

  let cuvR = vec2f(
    clamp(uvR.x, 0.0005, params.maxX - 0.0005),
    clamp(uvR.y, 0.0005, 0.9995));
  let tex = textureSampleLevel(uContent, uSampler, vec2f(cuvR.x, 1.0 - cuvR.y), 0.0);
  let guard = step(uvR.x, params.maxX) * tex.a;
  if (guard < 1e-4) {
    return vec4f(0.0);
  }

  let baseCell = floor(Pc / params.tile);

  let shadowGain = clamp(params.shadow, 0.0, 2.0) * 0.5;
  var shadowA = 0.0;
  var shadowZ = 0.0;
  var shadowCell = vec2f(1e6);

  var sumA = 0.0;
  var maxAct = 0.0;
  var k1 = -1e9; var a1 = 0.0; var c1 = vec3f(0.0);
  var cell1 = vec2f(1e6);
  var k2 = -1e9; var a2 = 0.0; var c2 = vec3f(0.0);
  var cell2 = vec2f(1e6);

  let restReach = params.tile * 0.95 + 3.0;
  let reach = params.tile * 1.8 + params.scatter + params.liftAmount * 0.4;
  let rr = max(reach, params.tile + params.scatter + params.liftAmount);

  for (var j = -2; j <= 2; j++) {
    for (var i = -2; i <= 2; i++) {
      let cell = baseCell + vec2f(f32(i), f32(j));
      let center = (cell + vec2f(0.5)) * params.tile;
      let cp = center - Pc;
      let cd = dot(cp, cp);
      if (cd > rr * rr) { continue; }
      let ca = cellAct(cell);
      let act = ca.act;
      let sxy = ca.sxy;
      maxAct = max(maxAct, act);

      if (act < 1e-3) {
        if (cd > restReach * restReach) { continue; }
        let d = shardD(Pc - center, cell, 1e-2);
        let a = 1.0 - smoothstep(-1.5, 1.5, -d);
        if (a < 0.003) { continue; }
        sumA += a;
        if (0.0 > k1) {
          k2 = k1; a2 = a1; c2 = c1; cell2 = cell1;
          k1 = 0.0; a1 = a; c1 = tex.rgb; cell1 = cell;
        } else if (0.0 > k2) {
          k2 = 0.0; a2 = a; c2 = tex.rgb; cell2 = cell;
        }
        continue;
      }

      let dyn = cellDyn(cell, sxy, act);

      if (shadowGain > 1e-3 && dyn.lift > 0.5) {
        let qs = Pc + LIGHT * dyn.lift * 0.5 - dyn.anchor;
        let blur = max(dyn.lift * 0.4, 1.0);
        let srad = params.tile * 0.95 + blur;
        if (dot(qs, qs) < srad * srad) {
          var sA = 1.0 - smoothstep(-blur, blur, -shardD(qs, cell, dyn.k));
          sA *= shadowGain * act * act;
          if (sA > shadowA) {
            shadowA = sA;
            shadowZ = dyn.lift;
            shadowCell = cell;
          }
        }
      }

      if (cd > reach * reach) { continue; }
      let inv = invMap(Pc, dyn.R, dyn.lift, dyn.anchor);
      if (!inv.ok) { continue; }
      let q = inv.q;
      let d = shardD(q, cell, dyn.k);
      let a = 1.0 - smoothstep(-1.5, 1.5, -d);
      if (a < 0.003) { continue; }
      let uvS = (center + q - vec2f(params.scroll.x, -params.scroll.y)) / params.resolution;
      let n = dyn.R * vec3f(0.0, 0.0, 1.0);
      let rA = params.refract * act * act;
      var col: vec3f;
      if (rA < 1e-3) {
        col = pick(uvS);
      } else {
        let refr = -n.xy * (rA * params.tile * 0.25) / params.resolution;
        let spread = params.dispersion * 0.6;
        if (spread < 1e-3) {
          col = pick(uvS + refr);
        } else {
          col = vec3f(
            pick(uvS + refr * (1.0 + spread)).r,
            pick(uvS + refr).g,
            pick(uvS + refr * (1.0 - spread)).b);
        }
      }
      col *= clamp(
        1.0 + clamp(params.shading, 0.0, 2.0) * act * dot(n.xy, LIGHT) * 0.6,
        0.0, 2.0);
      sumA += a;
      if (dyn.lift > k1) {
        k2 = k1; a2 = a1; c2 = c1; cell2 = cell1;
        k1 = dyn.lift; a1 = a; c1 = col; cell1 = cell;
      } else if (dyn.lift > k2) {
        k2 = dyn.lift; a2 = a; c2 = col; cell2 = cell;
      }
    }
  }

  if (maxAct < 1e-3 && shadowA < 1e-3) {
    return vec4f(0.0);
  }

  if (shadowA > 1e-3) {
    if (any(cell1 != shadowCell)) {
      c1 *= 1.0 - shadowA * clamp((shadowZ - k1) / (params.tile * 0.2), 0.0, 1.0);
    }
    if (any(cell2 != shadowCell)) {
      c2 *= 1.0 - shadowA * clamp((shadowZ - k2) / (params.tile * 0.2), 0.0, 1.0);
    }
  }

  let cover = clamp(sumA, 0.0, 1.0);
  let sep = max(params.liftAmount * 0.25, 2.0);
  let f = clamp((k1 - k2) / sep, 0.0, 1.0);
  let w1 = a1 * (0.5 + 0.5 * f);
  let w2 = a2 * (1.0 - w1);
  let layered = w1 + w2;
  let shardCol = select(params.gap, (c1 * w1 + c2 * w2) / max(layered, 1e-6), layered > 1e-6);
  let bgRecv = shadowA * clamp(shadowZ / (params.tile * 0.2), 0.0, 1.0);
  let bg = params.gap * (1.0 - bgRecv);
  return vec4f(mix(bg, shardCol, cover), guard);
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

/** One WebGPU device per page, shared by every Shatter instance. */
function acquireGpu(): Promise<Gpu> {
  if (!sharedGpu) {
    sharedGpu = init().catch((error) => {
      sharedGpu = null;
      throw error;
    });
  }
  return sharedGpu;
}

export function createShatter(
  elements: ShatterElements,
  options: ShatterOptions = {},
): ShatterInstance | null {
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

  let gpu: Gpu | null = null;
  let screen: Surface | null = null;
  let program: Draw | null = null;
  let quad: Geometry | null = null;
  let contentTexture: Texture | null = null;
  let fallback2d: CanvasRenderingContext2D | null = null;

  let contentMaxX = 1;

  function syncCanvasSize() {
    const dpr = getCanvasPixelRatio(output);
    const width = Math.max(1, Math.round(output.clientWidth * dpr));
    const height = Math.max(1, Math.round(output.clientHeight * dpr));
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

  function ensureContentTexture(): Texture {
    const width = Math.max(1, source.width);
    const height = Math.max(1, source.height);
    if (
      !contentTexture ||
      contentTexture.size[0] !== width ||
      contentTexture.size[1] !== height
    ) {
      // A new wrapper invalidates vgpu's cached bindings to the old texture.
      contentTexture?.destroy();
      contentTexture = gpu!.device.createTexture({
        size: [width, height],
        format: "rgba8unorm",
        usage: ["texture_binding", "copy_dst", "render_attachment"],
        label: "shatter.content",
      });
    }
    return contentTexture;
  }

  const pointer = { x: 0.5, y: 0.5, tx: 0.5, ty: 0.5, active: 0, target: 0 };
  let time = 0;

  function uploadContent() {
    if (!htmlInCanvas || !contentDirty || !gpu) return;
    contentDirty = false;
    const texture = ensureContentTexture();
    gpu.gpu.queue.copyExternalImageToTexture(
      { source },
      { texture: texture.gpu },
      [source.width, source.height],
    );
    program!.set({ uContent: texture });
  }

  function render() {
    if (!gpu || !program || !screen) return;
    uploadContent();
    const dpr = output.width / Math.max(output.clientWidth, 1);
    program.set({
      params: {
        resolution: [output.width, output.height],
        pointer: [pointer.x, pointer.y],
        activeAmount: pointer.active,
        radius: Math.max(config.radius, 0.01),
        softness: config.softness,
        strength: config.strength,
        baseAmount: config.baseStrength,
        tile: Math.max(config.tileSize, 24) * dpr,
        shards: Math.min(Math.max(config.shards, 0), 1),
        corner: Math.max(config.corner, 0) * dpr,
        liftAmount: Math.max(config.lift, 0) * dpr,
        tilt: config.tilt,
        scatter: Math.max(config.scatter, 0) * dpr,
        persp: Math.max(config.perspective, 200) * dpr,
        gap: config.gapColor,
        shadow: config.shadow,
        shading: config.shading,
        refract: Math.max(config.refraction, 0),
        dispersion: Math.min(Math.max(config.dispersion, 0), 1),
        time,
        maxX: contentMaxX,
        scroll: [content.scrollLeft * dpr, content.scrollTop * dpr],
      },
    });
    gpuFrame(gpu, (f) => f.pass(screen!, program!));
  }

  function renderFallback() {
    if (!fallback2d || !htmlInCanvas || !contentDirty) return;
    contentDirty = false;
    fallback2d.clearRect(0, 0, output.width, output.height);
    fallback2d.drawImage(source, 0, 0, output.width, output.height);
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

  acquireGpu()
    .then((device) => {
      if (destroyed) return;
      gpu = device;
      screen = surface(gpu, output, {
        autoResize: false,
        alphaMode: "premultiplied",
        label: "shatter",
      });
      const linear = sampler(gpu, {
        minFilter: "linear",
        magFilter: "linear",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
      });
      quad = geometry(gpu, {
        buffers: [
          {
            data: new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
            attributes: { pos: "float32x2" },
          },
        ],
        topology: "triangle-strip",
        label: "shatter.quad",
      });
      program = draw(gpu, {
        shader: SHADER,
        geometry: quad,
        depth: false,
        label: "shatter",
        set: { uSampler: linear, uContent: ensureContentTexture() },
      });
      syncCanvasSize();
      start();
    })
    .catch((error) => {
      if (destroyed) return;
      console.warn("Shatter: WebGPU unavailable, showing content without the effect.", error);
      fallback2d = output.getContext("2d");
      contentDirty = true;
      start();
    });

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
      contentTexture?.destroy();
      quad?.destroy();
      screen?.dispose();
      if (htmlInCanvas) paintable.onpaint = null;
    },
  };
}
