import { getCanvasPixelRatio, createCanvasResizeObserver } from "../canvas-viewport";
import { isHtmlInCanvasBlocked, prepareHtmlInCanvas, drawHtmlInCanvas } from "../html-in-canvas";
import {
  effect,
  frame as gpuFrame,
  init,
  sampler,
  storage,
  surface,
  type Effect,
  type Gpu,
  type StorageBuffer,
  type Surface,
} from "vgpu";
import type { Texture } from "vgpu";

export interface DisplacementOptions {
  /** Cells across the width of the wrapped area (4 to 100). */
  grid?: number;
  /** Width to height ratio of each cell (0.25 to 4). 1 is a perfect square. */
  cellAspect?: number;
  /** Radius of the cursor influence as a fraction of the grid (0.02 to 1). */
  radius?: number;
  /** How hard cursor movement pushes cells around (0 to 1). */
  strength?: number;
  /** Minimum cursor speed in CSS pixels per second before cells react. 0 reacts to any movement. */
  threshold?: number;
  /** How slowly cells return to rest, per frame (0.5 to 0.99). */
  relaxation?: number;
  /** Multiplier on how far displaced cells shift the content (0 to 4). */
  shift?: number;
  /** Chromatic aberration inside each displaced cell (0 to 3). */
  aberration?: number;
  /** Film grain over displaced cells (0 to 1). */
  grain?: number;
  /** Grain speck size multiplier (0.5 to 4). */
  grainSize?: number;
  /** Grain animation speed (0 to 4). */
  grainSpeed?: number;
  /** Random cell scramble on load that relaxes into place (0 to 3). */
  scramble?: number;
}

export interface DisplacementElements {
  /** Canvas with layoutsubtree that hosts the HTML content. */
  source: HTMLCanvasElement;
  /** The element inside the source canvas that gets captured. */
  content: HTMLElement;
  /** Canvas the WebGPU effect renders to. */
  output: HTMLCanvasElement;
}

export interface DisplacementInstance {
  /** Update effect options live. */
  setOptions: (options: DisplacementOptions) => void;
  /** Re-read canvas size. Call when the element is resized. */
  resize: () => void;
  /** Stop the loop and release all GPU resources. */
  destroy: () => void;
}

const DEFAULTS: Required<DisplacementOptions> = {
  grid: 50,
  cellAspect: 1,
  radius: 0.1,
  strength: 0.1,
  threshold: 1000,
  relaxation: 0.9,
  shift: 1,
  aberration: 1.5,
  grain: 0.1,
  grainSize: 1,
  grainSpeed: 1,
  scramble: 1,
};

type PaintableCanvas = HTMLCanvasElement & {
  onpaint?: (() => void) | null;
  requestPaint?: () => void;
};

type ElementImageContext = CanvasRenderingContext2D & {
  drawElementImage?: (element: Element, x: number, y: number) => void;
};

const SHADER = /* wgsl */ `
struct Params {
  resolution: vec2f,
  cols: u32,
  rows: u32,
  shift: f32,
  aberration: f32,
  grain: f32,
  grainPx: f32,
  grainTick: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var uContent: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
@group(0) @binding(3) var<storage, read> uField: array<vec2f>;

fn hash(p: vec2f) -> f32 {
  var q = fract(vec3f(p.x, p.y, p.x) * 0.1031);
  q += dot(q, q.yzx + vec3f(33.33));
  return fract((q.x + q.y) * q.z);
}

fn fieldAt(p: vec2f) -> vec2f {
  let q = clamp(p, vec2f(0.0), vec2f(0.999999));
  let x = min(u32(floor(q.x * f32(params.cols))), params.cols - 1u);
  let y = min(u32(floor(q.y * f32(params.rows))), params.rows - 1u);
  return uField[x + params.cols * y];
}

@fragment fn fs_main(
  @location(0) uv: vec2f,
  @builtin(position) pos: vec4f,
) -> @location(0) vec4f {
  let cuv = uv;
  let offset = fieldAt(cuv);
  let push = offset * 0.02 * params.shift;
  let ab = params.aberration * 0.08;
  let lo = vec2f(0.001);
  let hi = vec2f(0.999);
  let cr = textureSampleLevel(uContent, uSampler, clamp(cuv - push * (1.0 + ab), lo, hi), 0.0);
  let cg = textureSampleLevel(uContent, uSampler, clamp(cuv - push, lo, hi), 0.0);
  let cb = textureSampleLevel(uContent, uSampler, clamp(cuv - push * (1.0 - ab), lo, hi), 0.0);
  let alpha = (cr.a + cg.a + cb.a) / 3.0;
  var col = vec3f(cr.r * cr.a, cg.g * cg.a, cb.b * cb.a);
  col = min(col, vec3f(alpha));
  let pushPx = length(push * params.resolution);
  let gate = smoothstep(1.5, 18.0, pushPx);
  let fragCoord = vec2f(pos.x, params.resolution.y - pos.y);
  let cell = floor(fragCoord / max(params.grainPx, 1.0));
  let gn = hash(cell + vec2f(params.grainTick * 0.37, params.grainTick * 0.113));
  col += (gn - 0.5) * 0.3 * params.grain * gate * alpha;
  col = clamp(col, vec3f(0.0), vec3f(alpha));
  return vec4f(col, alpha);
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

/** One WebGPU device per page, shared by every Displacement instance. */
function acquireGpu(): Promise<Gpu> {
  if (!sharedGpu) {
    sharedGpu = init().catch((error) => {
      sharedGpu = null;
      throw error;
    });
  }
  return sharedGpu;
}

function createRectCache(element: Element) {
  let current = element.getBoundingClientRect();

  const refresh = () => {
    current = element.getBoundingClientRect();
  };

  const observer = new ResizeObserver(refresh);
  observer.observe(element);
  window.addEventListener("resize", refresh, { passive: true });
  window.addEventListener("scroll", refresh, {
    capture: true,
    passive: true,
  });

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

export function createDisplacement(
  elements: DisplacementElements,
  options: DisplacementOptions = {},
): DisplacementInstance | null {
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
  let fx: Effect | null = null;
  let contentTexture: Texture | null = null;
  let fieldStorage: StorageBuffer | null = null;
  let fallback2d: CanvasRenderingContext2D | null = null;

  function syncScreenSize() {
    const width = Math.max(1, Math.round(outW * dpr));
    const height = Math.max(1, Math.round(outH * dpr));
    if (screen) {
      const [w, h] = screen.size;
      if (w !== width || h !== height) screen.resize([width, height]);
    } else if (output.width !== width || output.height !== height) {
      output.width = width;
      output.height = height;
    }
  }

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
        label: "displacement.content",
      });
    }
    return contentTexture;
  }

  function uploadContent() {
    if (!htmlInCanvas || !contentDirty || !gpu) return;
    contentDirty = false;
    const texture = ensureContentTexture();
    gpu.gpu.queue.copyExternalImageToTexture(
      { source },
      { texture: texture.gpu },
      [source.width, source.height],
    );
    sourceCtx!.clearRect(0, 0, source.width, source.height);
    fx!.set({ uContent: texture });
  }

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reducedMotion = motionQuery.matches;

  let cols = 0;
  let rows = 0;
  let rowScale = 1;
  let outW = 1;
  let outH = 1;
  let scrambled = false;
  let field = new Float32Array(0);
  let fieldDirty = false;
  let dpr = 1;

  function destroyFieldStorage() {
    (fieldStorage as unknown as { destroy?: () => void } | null)?.destroy?.();
    fieldStorage = null;
  }

  function ensureFieldStorage(): StorageBuffer {
    const bytes = Math.max(8, field.byteLength);
    if (!fieldStorage || fieldStorage.size !== bytes) {
      destroyFieldStorage();
      fieldStorage = storage(gpu!, bytes, "read");
      fieldDirty = true;
      fx?.set({ uField: fieldStorage });
    }
    return fieldStorage;
  }

  function uploadField() {
    if (!fieldDirty || !gpu) return;
    fieldDirty = false;
    ensureFieldStorage().write(field);
  }

  function syncGrid() {
    const nextCols = Math.round(Math.min(Math.max(config.grid, 4), 100));
    const aspect = Math.min(Math.max(config.cellAspect, 0.25), 4);
    const nextRows = Math.max(
      2,
      Math.min(Math.round((nextCols * outH * aspect) / outW), 200),
    );
    if (nextCols === cols && nextRows === rows) {
      rowScale = (outH * cols) / (outW * rows);
      return;
    }
    cols = nextCols;
    rows = nextRows;
    rowScale = (outH * cols) / (outW * rows);
    field = new Float32Array(cols * rows * 2);
    if (!scrambled && !reducedMotion && config.scramble > 0) {
      const amp = 40 * Math.min(config.scramble, 3);
      for (let i = 0; i < field.length; i++) {
        field[i] = (Math.random() * 2 - 1) * amp;
      }
    }
    scrambled = true;
    destroyFieldStorage();
    fieldDirty = true;
    if (gpu && fx) {
      fx.set({ uField: ensureFieldStorage() });
      uploadField();
    }
  }

  function syncCanvasSize() {
    dpr = getCanvasPixelRatio(output);
    outW = Math.max(1, output.clientWidth);
    outH = Math.max(1, output.clientHeight);
    syncScreenSize();
    if (htmlInCanvas) {
      const sourceWidth = Math.max(1, Math.round(source.clientWidth * dpr));
      const sourceHeight = Math.max(1, Math.round(source.clientHeight * dpr));
      if (source.width !== sourceWidth || source.height !== sourceHeight) {
        source.width = sourceWidth;
        source.height = sourceHeight;
      }
      paintable.requestPaint!();
    }
    syncGrid();
  }

  syncCanvasSize();

  const mouse = {
    x: 0,
    y: 0,
    prevX: 0,
    prevY: 0,
    vX: 0,
    vY: 0,
    speed: 0,
    gate: 0,
    lastT: 0,
  };
  let tracking = false;

  function stepSimulation(delta: number): boolean {
    const relaxation = Math.min(Math.max(config.relaxation, 0.5), 0.995);
    const decay = Math.pow(relaxation, delta * 60);
    let maxAbs = 0;
    for (let i = 0; i < field.length; i++) {
      const value = field[i] * decay;
      field[i] = value;
      const abs = Math.abs(value);
      if (abs > maxAbs) maxAbs = abs;
    }
    const injecting = tracking && (mouse.vX !== 0 || mouse.vY !== 0);
    if (injecting) {
      const gridX = mouse.x * cols;
      const gridY = mouse.y * rows;
      const maxDist = cols * Math.min(Math.max(config.radius, 0.02), 1);
      const maxSq = maxDist * maxDist;
      const gain = Math.min(Math.max(config.strength, 0), 1) * 100 * mouse.gate;
      for (let j = 0; j < rows; j++) {
        const dy = (gridY - j) * rowScale;
        for (let i = 0; i < cols; i++) {
          const dx = gridX - i;
          const distSq = dx * dx + dy * dy;
          if (distSq < maxSq) {
            const power = Math.min(maxDist / Math.sqrt(distSq), 10);
            const idx = 2 * (i + cols * j);
            field[idx] += gain * mouse.vX * power;
            field[idx + 1] += gain * mouse.vY * power;
          }
        }
      }
    }
    const vDecay = Math.pow(0.9, delta * 60);
    mouse.vX *= vDecay;
    mouse.vY *= vDecay;
    if (Math.abs(mouse.vX) < 0.0001) mouse.vX = 0;
    if (Math.abs(mouse.vY) < 0.0001) mouse.vY = 0;
    fieldDirty = true;
    const alive =
      injecting || mouse.vX !== 0 || mouse.vY !== 0 || maxAbs > 0.03;
    if (!alive && maxAbs > 0) field.fill(0);
    return alive;
  }

  let time = 0;

  function render() {
    if (!gpu || !fx || !screen) return;
    uploadContent();
    uploadField();
    const [width, height] = screen.size;
    fx.set({
      params: {
        resolution: [width, height],
        cols,
        rows,
        shift: Math.min(Math.max(config.shift, 0), 4),
        aberration: Math.min(Math.max(config.aberration, 0), 3),
        grain: Math.min(Math.max(config.grain, 0), 1),
        grainPx: Math.max(
          1,
          Math.min(Math.max(config.grainSize, 0.5), 4) * dpr * 1.5,
        ),
        grainTick: Math.floor(
          time * Math.min(Math.max(config.grainSpeed, 0), 4) * 18,
        ),
      },
    });
    gpuFrame(gpu, (f) => f.pass(screen!, fx!));
  }

  function renderFallback() {
    if (!fallback2d || !htmlInCanvas || !contentDirty) return;
    contentDirty = false;
    fallback2d.clearRect(0, 0, output.width, output.height);
    fallback2d.drawImage(source, 0, 0, output.width, output.height);
    sourceCtx!.clearRect(0, 0, source.width, source.height);
  }

  let raf = 0;
  let lastTime = performance.now();
  let destroyed = false;
  let running = false;
  let visible = true;

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
    time += delta;
    let alive = false;
    if (!reducedMotion) alive = stepSimulation(delta);
    render();
    if (!alive && !contentDirty) {
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
        label: "displacement",
      });
      const linear = sampler(gpu, {
        minFilter: "linear",
        magFilter: "linear",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
      });
      fx = effect(gpu, SHADER, {
        label: "displacement",
        set: {
          uSampler: linear,
          uContent: ensureContentTexture(),
          uField: ensureFieldStorage(),
        },
      });
      syncCanvasSize();
      uploadField();
      start();
    })
    .catch((error) => {
      if (destroyed) return;
      console.warn(
        "Displacement: WebGPU unavailable, showing content without the effect.",
        error,
      );
      fallback2d = output.getContext("2d");
      contentDirty = true;
      start();
    });

  function onMotionChange() {
    reducedMotion = motionQuery.matches;
    if (reducedMotion) {
      field.fill(0);
      mouse.vX = 0;
      mouse.vY = 0;
      fieldDirty = true;
    }
    start();
  }
  motionQuery.addEventListener("change", onMotionChange);

  const pointerHost = output.parentElement ?? output;
  const rectCache = createRectCache(output);

  function onPointerMove(event: PointerEvent) {
    if (reducedMotion) return;
    const box = rectCache.current;
    if (box.width < 1 || box.height < 1) return;
    const x = (event.clientX - box.left) / box.width;
    const y = (event.clientY - box.top) / box.height;
    const now = performance.now();
    if (!tracking) {
      tracking = true;
      mouse.prevX = x;
      mouse.prevY = y;
      mouse.speed = 0;
      mouse.gate = 0;
      mouse.lastT = now;
    }
    mouse.vX = x - mouse.prevX;
    mouse.vY = y - mouse.prevY;
    const dt = Math.max((now - mouse.lastT) / 1000, 0.001);
    mouse.lastT = now;
    const distPx = Math.hypot(mouse.vX * box.width, mouse.vY * box.height);
    const instSpeed = distPx / dt;
    mouse.speed += (instSpeed - mouse.speed) * Math.min(dt * 25, 1);
    const threshold = Math.max(config.threshold, 0);
    if (threshold <= 0) {
      mouse.gate = 1;
    } else {
      const ramp = (mouse.speed - threshold) / threshold;
      const step = Math.min(Math.max(ramp, 0), 1);
      mouse.gate = step * step * (3 - 2 * step);
    }
    mouse.prevX = x;
    mouse.prevY = y;
    mouse.x = x;
    mouse.y = y;
    start();
  }

  function onPointerLeave() {
    tracking = false;
    mouse.vX = 0;
    mouse.vY = 0;
    mouse.speed = 0;
    mouse.gate = 0;
  }

  pointerHost.addEventListener("pointermove", onPointerMove, { passive: true });
  pointerHost.addEventListener("pointerleave", onPointerLeave, { passive: true });
  pointerHost.addEventListener("pointercancel", onPointerLeave, { passive: true });

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
      let changed = false;
      for (const [key, value] of Object.entries(next)) {
        const prev = config[key as keyof typeof config];
        if (prev !== value) {
          changed = true;
          break;
        }
      }
      Object.assign(config, next);
      if (!changed) return;
      syncGrid();
      syncCanvasSize();
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
      pointerHost.removeEventListener("pointermove", onPointerMove);
      pointerHost.removeEventListener("pointerleave", onPointerLeave);
      pointerHost.removeEventListener("pointercancel", onPointerLeave);
      contentTexture?.destroy();
      destroyFieldStorage();
      screen?.dispose();
      if (htmlInCanvas) paintable.onpaint = null;
    },
  };
}
