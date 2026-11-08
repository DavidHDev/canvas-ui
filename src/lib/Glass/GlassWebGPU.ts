import { getCanvasPixelRatio, createCanvasResizeObserver } from "../canvas-viewport";
import { isHtmlInCanvasBlocked, prepareHtmlInCanvas, drawHtmlInCanvas } from "../html-in-canvas";
import {
  effect,
  frame as gpuFrame,
  init,
  sampler,
  surface,
  type Effect,
  type Gpu,
  type Surface,
} from "vgpu";
import type { Texture } from "vgpu";

export interface GlassOptions {
  /** Lens shape. */
  shape?: "circle" | "square" | "rectangle";
  /** Lens size (radius, or half height for rectangles) in CSS pixels. */
  size?: number;
  /** Width to height ratio of the rectangle shape (1 to 3). */
  aspect?: number;
  /** Corner radius for square and rectangle shapes in CSS pixels. */
  corner?: number;
  /** Index of refraction of the glass (1 to 2). Higher bends light more. */
  ior?: number;
  /** Fraction of the lens that stays optically flat before the rim (0 to 1). */
  edge?: number;
  /** How sharply the rim curves away (1 to 10). */
  bevel?: number;
  /** Optical depth in CSS pixels: how far the glass floats above the page. */
  depth?: number;
  /** Chromatic aberration strength at the rim (0 to 3). 0 disables it. */
  aberration?: number;
  /** Frosted blur of the glass face (0 = optically clear, up to 4). */
  blur?: number;
  /** Strength of the fresnel reflection on the rim (0 to 2). 0 disables it. */
  reflection?: number;
  /**
   * Specular rim highlight (0 to 2). Keeps the lens visible even over plain
   * backgrounds where clear glass would otherwise be invisible. 0 disables it.
   */
  shine?: number;
  /** Magnification while hovering a target element (1 to 3). */
  zoom?: number;
  /** CSS selector for elements that trigger the crystal ball zoom. */
  targets?: string;
  /** How quickly the lens follows the cursor (0 to 1). 1 snaps to it. */
  follow?: number;
}

export interface GlassElements {
  /** Canvas with layoutsubtree that hosts the HTML content. */
  source: HTMLCanvasElement;
  /** The element inside the source canvas that gets captured. */
  content: HTMLElement;
  /** Canvas the WebGPU effect renders to. */
  output: HTMLCanvasElement;
}

export interface GlassInstance {
  /** Update effect options live. */
  setOptions: (options: GlassOptions) => void;
  /** Re-read canvas size. Call when the element is resized. */
  resize: () => void;
  /** Stop the loop and release all GPU resources. */
  destroy: () => void;
}

const DEFAULTS: Required<GlassOptions> = {
  shape: "circle",
  size: 120,
  aspect: 1.7,
  corner: 32,
  ior: 1.5,
  edge: 0.7,
  bevel: 4,
  depth: 250,
  aberration: 1,
  blur: 0,
  reflection: 1,
  shine: 0.01,
  zoom: 1.5,
  targets: "[data-glass-target]",
  follow: 0.2,
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
  maxX: f32,
  hasContent: f32,
  center: vec2f,
  halfSize: vec2f,
  corner: f32,
  edge: f32,
  bevel: f32,
  ior: f32,
  depth: f32,
  aberration: f32,
  blur: f32,
  reflectAmount: f32,
  shine: f32,
  zoom: f32,
  alpha: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var uContent: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

const PI = 3.14159265358979;
const AIR_IOR = 1.0003;
const INCIDENT = vec3f(0.0, 0.0, 1.0);

fn pow2(x: f32) -> f32 { return x * x; }
fn pow5(x: f32) -> f32 {
  let x2 = x * x;
  return x2 * x2 * x;
}
fn linearStep(e0: f32, e1: f32, x: f32) -> f32 {
  return clamp((x - e0) / (e1 - e0), 0.0, 1.0);
}

fn sdf(p: vec2f) -> f32 {
  let q = abs(p) - (params.halfSize - vec2f(params.corner));
  return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - params.corner;
}

fn ign(v: vec2f) -> f32 {
  return fract(52.9829189 * fract(0.06711056 * v.x + 0.00583715 * v.y));
}

fn pageBase(px: vec2f) -> vec3f {
  var uv = px / params.resolution;
  uv.x = clamp(uv.x, 0.0005, params.maxX - 0.0005);
  uv.y = clamp(uv.y, 0.0005, 0.9995);
  return pow(
    textureSampleLevel(uContent, uSampler, vec2f(uv.x, 1.0 - uv.y), 0.0).rgb,
    vec3f(2.2),
  );
}

fn page(px: vec2f, lod: f32) -> vec3f {
  let r = max(pow(2.0, lod) - 1.0, 0.0) * 0.5;
  if (r < 0.5) {
    return pageBase(px);
  }
  var acc = pageBase(px) * 0.22;
  acc += pageBase(px + vec2f( r,  0.0)) * 0.12;
  acc += pageBase(px + vec2f(-r,  0.0)) * 0.12;
  acc += pageBase(px + vec2f(0.0,  r)) * 0.12;
  acc += pageBase(px + vec2f(0.0, -r)) * 0.12;
  acc += pageBase(px + vec2f( r,  r)) * 0.075;
  acc += pageBase(px + vec2f(-r,  r)) * 0.075;
  acc += pageBase(px + vec2f( r, -r)) * 0.075;
  acc += pageBase(px + vec2f(-r, -r)) * 0.075;
  return acc;
}

fn iorForWavelength(wavelength: f32) -> f32 {
  let ab = params.aberration * 0.1;
  return mix(
    params.ior + ab,
    params.ior - ab,
    1.0 - pow(1.0 - linearStep(450.0, 650.0, wavelength), 4.0),
  );
}

fn pageAA(px: vec2f, minLod: f32) -> vec3f {
  let footprint = max(length(fwidth(px)), 1.0);
  return page(px, max(minLod, log2(footprint)));
}

fn sampleRefraction(basePx: vec2f, rim: f32, normal: vec3f, glassIor: f32) -> vec3f {
  var rv = refract(INCIDENT, normal, AIR_IOR / glassIor);
  rv /= abs(rv.z) / params.depth;

  return pageAA(basePx + rv.xy, params.blur * (1.0 + rim));
}

fn fresnelSchlick(cosTheta: f32, f0: f32) -> f32 {
  return f0 + (1.0 - f0) * pow5(1.0 - cosTheta);
}

fn smithSchlickDenom(cosTheta: f32, k: f32) -> f32 {
  return cosTheta * (1.0 - k) + k;
}

fn ggx(roughness: f32, NDotL: f32, NDotV: f32, NDotH: f32) -> f32 {
  if (NDotL <= 0.0) { return 0.0; }
  let a2 = pow2(roughness);
  let d = a2 / (PI * pow2(pow2(NDotH) * (a2 - 1.0) + 1.0));
  let k = roughness * 0.5;
  let v = 1.0 / (
    smithSchlickDenom(NDotL, k) *
    smithSchlickDenom(clamp(NDotV, 0.0, 1.0), k)
  );
  return NDotL * d * v;
}

@fragment fn fs_main(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let fragPx = vec2f(pos.x, params.resolution.y - pos.y);
  let p = fragPx - params.center;
  let sd = sdf(p);

  let aa = 1.5;
  let mask = 1.0 - smoothstep(-aa, 0.0, sd);
  let alpha = mask * params.alpha *
    (1.0 - step(params.maxX, fragPx.x / params.resolution.x));

  let minHalf = min(params.halfSize.x, params.halfSize.y);
  let edgeW = max(minHalf * (1.0 - clamp(params.edge, 0.0, 0.98)), 1.0);
  let rim = pow(linearStep(-edgeW, 0.0, sd), params.bevel);

  let scatter = min(params.blur, 1.0) * 0.02;
  let randAngle = ign(fragPx) * PI * 2.0;
  let flatNormal = normalize(vec3f(sin(randAngle) * scatter, cos(randAngle) * scatter, -1.0));
  let e = 1.0;
  let grad = vec2f(
    sdf(p + vec2f(e, 0.0)) - sdf(p - vec2f(e, 0.0)),
    sdf(p + vec2f(0.0, e)) - sdf(p - vec2f(0.0, e)),
  );
  let rimNormal = vec3f(normalize(grad + vec2f(1e-5)), 0.0);
  let normal = normalize(mix(flatNormal, rimNormal, vec3f(rim)));

  if (params.hasContent < 0.5) {
    let ldot = dot(rimNormal.xy, normalize(vec2f(-0.6, 0.8)));
    let band = pow(rim, 1.8);
    let arcs = pow(abs(ldot), 3.0) * select(0.28, 0.5, ldot > 0.0);
    let shine = band * (0.04 + arcs) * max(params.shine, 0.5);
    let a = alpha * clamp(0.06 + 0.12 * rim, 0.0, 1.0);
    return vec4f(vec3f(shine * 1.6) * alpha, a);
  }

  let basePx = params.center + p / params.zoom;

  var refracted: vec3f;
  if (params.aberration > 0.001) {
    refracted = sampleRefraction(basePx, rim, normal, iorForWavelength(611.4))
      * vec3f(1.0, 0.0, 0.0);
    refracted += sampleRefraction(basePx, rim, normal, iorForWavelength(570.5))
      * vec3f(1.0, 1.0, 0.0);
    refracted += sampleRefraction(basePx, rim, normal, iorForWavelength(549.1))
      * vec3f(0.0, 1.0, 0.0);
    refracted += sampleRefraction(basePx, rim, normal, iorForWavelength(491.4))
      * vec3f(0.0, 1.0, 1.0);
    refracted += sampleRefraction(basePx, rim, normal, iorForWavelength(464.2))
      * vec3f(0.0, 0.0, 1.0);
    refracted += sampleRefraction(basePx, rim, normal, iorForWavelength(374.0))
      * vec3f(1.0, 0.0, 1.0);
    refracted /= 3.0;
  } else {
    refracted = sampleRefraction(basePx, rim, normal, params.ior);
  }

  var glass = refracted;
  if (params.reflectAmount > 0.001) {
    let V = vec3f(0.0, 0.0, -1.0);
    let NDotV = clamp(dot(V, normal), 0.0, 1.0);
    let f0 = pow2((params.ior - AIR_IOR) / (params.ior + AIR_IOR));
    let fresnelV = fresnelSchlick(NDotV, f0) * params.reflectAmount;

    var reflectVector = reflect(INCIDENT, normal);
    let L = reflectVector;
    let H = normalize(L + V);
    reflectVector /= abs(reflectVector.z) / params.depth;
    var reflected = page(basePx + reflectVector.xy, 2.5 + params.blur);
    reflected *= ggx(0.5, dot(normal, L), NDotV, dot(normal, H));
    glass = mix(refracted, reflected, vec3f(clamp(fresnelV, 0.0, 1.0)));
  }

  if (params.shine > 0.001) {
    let ldot = dot(rimNormal.xy, normalize(vec2f(-0.6, 0.8)));
    let band = pow(rim, 1.8);
    let arcs = pow(abs(ldot), 3.0) * select(0.28, 0.5, ldot > 0.0);
    glass += vec3f(band * (0.04 + arcs) * params.shine);
  }

  return vec4f(pow(glass, vec3f(1.0 / 2.2)) * alpha, alpha);
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

/** One WebGPU device per page, shared by every Glass instance. */
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

export function createGlass(
  elements: GlassElements,
  options: GlassOptions = {},
): GlassInstance | null {
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
  let fallback2d: CanvasRenderingContext2D | null = null;

  let contentMaxX = 1;

  function clearScreen() {
    if (!gpu || !screen) return;
    gpuFrame(gpu, (f) => f.pass({ target: screen!, clear: [0, 0, 0, 0] }, () => {}));
  }

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
        label: "glass.content",
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
    fx!.set({ uContent: texture });
  }

  let posX = output.clientWidth / 2;
  let posY = output.clientHeight / 2;
  let presence = 0;
  let presenceTarget = 0;
  let targetX = posX;
  let targetY = posY;
  let zoom = 1;
  let zoomTarget = 1;
  let hasPointer = false;

  function halfExtents(): [number, number] {
    const size = Math.max(config.size, 8);
    if (config.shape === "rectangle") {
      return [size * Math.min(Math.max(config.aspect, 1), 4), size];
    }
    return [size, size];
  }

  function render() {
    if (!gpu || !fx || !screen) return;
    uploadContent();
    if (presence <= 0.004) {
      clearScreen();
      return;
    }

    const [baseHalfW, baseHalfH] = halfExtents();
    const halfW = baseHalfW * presence;
    const halfH = baseHalfH * presence;
    const alpha = Math.min(presence * 5, 1);
    const [width, height] = screen.size;
    const dpr = width / Math.max(output.clientWidth, 1);
    const cx = posX * dpr;
    const cy = height - posY * dpr;
    const corner =
      config.shape === "circle"
        ? Math.min(halfW, halfH)
        : Math.min(Math.max(config.corner, 0), Math.min(halfW, halfH));

    fx.set({
      params: {
        resolution: [width, height],
        maxX: contentMaxX,
        hasContent: htmlInCanvas ? 1 : 0,
        center: [cx, cy],
        halfSize: [halfW * dpr, halfH * dpr],
        corner: corner * dpr,
        edge: Math.min(Math.max(config.edge, 0), 0.98),
        bevel: Math.max(config.bevel, 0.5),
        ior: Math.min(Math.max(config.ior, 1.01), 2.5),
        depth: Math.max(config.depth, 0) * dpr,
        aberration: Math.max(config.aberration, 0),
        blur: Math.max(config.blur, 0),
        reflectAmount: Math.max(config.reflection, 0),
        shine: Math.max(config.shine, 0),
        zoom: Math.max(zoom, 1),
        alpha,
      },
    });
    gpuFrame(gpu, (f) => f.pass(screen!, fx!));
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

    const follow = Math.min(Math.max(config.follow, 0.02), 1);
    const kPos =
      reducedMotion || follow >= 1
        ? 1
        : 1 - Math.exp(-delta * (4 + follow * 26));
    const kZoom = reducedMotion ? 1 : 1 - Math.exp(-delta * 7);
    const kScale = reducedMotion ? 1 : 1 - Math.exp(-delta * 11);
    posX += (targetX - posX) * kPos;
    posY += (targetY - posY) * kPos;
    zoom += (zoomTarget - zoom) * kZoom;
    presence += (presenceTarget - presence) * kScale;

    render();

    const settled =
      Math.abs(targetX - posX) < 0.1 &&
      Math.abs(targetY - posY) < 0.1 &&
      Math.abs(zoomTarget - zoom) < 0.002 &&
      Math.abs(presenceTarget - presence) < 0.002;
    if (settled && !contentDirty) {
      posX = targetX;
      posY = targetY;
      zoom = zoomTarget;
      presence = presenceTarget;
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
        label: "glass",
      });
      const linear = sampler(gpu, {
        minFilter: "linear",
        magFilter: "linear",
        mipmapFilter: "linear",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
      });
      fx = effect(gpu, SHADER, {
        label: "glass",
        set: { uSampler: linear, uContent: ensureContentTexture() },
      });
      syncCanvasSize();
      start();
    })
    .catch((error) => {
      if (destroyed) return;
      console.warn("Glass: WebGPU unavailable, showing content without the effect.", error);
      fallback2d = output.getContext("2d");
      contentDirty = true;
      start();
    });

  const rectCache = createRectCache(output);

  function onPointerMove(event: PointerEvent) {
    const rect = rectCache.current;
    targetX = event.clientX - rect.left;
    targetY = event.clientY - rect.top;
    if (!hasPointer) {
      posX = targetX;
      posY = targetY;
      hasPointer = true;
    }
    presenceTarget = 1;
    const target = event.target as Element | null;
    zoomTarget =
      config.zoom > 1 && target?.closest?.(config.targets)
        ? Math.min(Math.max(config.zoom, 1), 4)
        : 1;
    start();
  }

  function onPointerLeave() {
    presenceTarget = 0;
    zoomTarget = 1;
    hasPointer = false;
    start();
  }

  content.addEventListener("pointermove", onPointerMove, { passive: true });
  content.addEventListener("pointerleave", onPointerLeave, { passive: true });

  function onScroll() {
    start();
  }
  content.addEventListener("scroll", onScroll, { passive: true });

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

  return {
    setOptions(next) {
      if (
        !Object.entries(next).some(
          ([key, value]) => config[key as keyof GlassOptions] !== value,
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
      content.removeEventListener("pointermove", onPointerMove);
      content.removeEventListener("pointerleave", onPointerLeave);
      content.removeEventListener("scroll", onScroll);
      observer.disconnect();
      intersection.disconnect();
      motionQuery.removeEventListener("change", onMotionChange);
      contentTexture?.destroy();
      screen?.dispose();
      if (htmlInCanvas) paintable.onpaint = null;
    },
  };
}
