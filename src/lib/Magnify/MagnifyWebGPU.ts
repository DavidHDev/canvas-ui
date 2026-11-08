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

export type ZoomModifier = "shift" | "alt" | "ctrl" | "meta" | "none";

export interface MagnifyOptions {
  /** Lens radius in CSS pixels. */
  size?: number;
  /** Magnification inside the lens (1 to 4). */
  zoom?: number;
  /** Let the wheel or trackpad adjust the magnification while zoomModifier is held. */
  scrollZoom?: boolean;
  /** Key held to zoom instead of scroll. "none" captures every wheel event over the content. */
  zoomModifier?: ZoomModifier;
  /** HUD accent color as RGB in the 0 to 1 range. Tints the reticle, readout, and ripple outline. */
  color?: [number, number, number];
  /** How quickly the lens follows the cursor (0 to 1). 1 snaps to it. */
  follow?: number;
  /** Overall HUD intensity (0 to 1). 0 hides every reticle element. */
  hud?: number;
  /** Show the outer ring. */
  ring?: boolean;
  /** Show the crosshair lines through the center. */
  crosshair?: boolean;
  /** Show the tick marks around the ring. */
  ticks?: boolean;
  /** Show the corner brackets inside the lens. */
  brackets?: boolean;
  /** Show the center dot. */
  dot?: boolean;
  /** Show a faint measurement grid inside the lens. */
  grid?: boolean;
  /** Show the data readout beside the lens. */
  readout?: boolean;
  /** Chromatic aberration split inside the lens (0 to 3). 0 disables it. */
  aberration?: number;
  /** Dreamy insight haze inside the lens (0 to 1). Softens and lifts the magnified content. */
  haze?: number;
  /** Emit a ripple across the page on click. */
  ripples?: boolean;
  /** How fast the ripple wavefront travels, in CSS pixels per second. */
  rippleSpeed?: number;
  /** Thickness of the colored ripple outline in CSS pixels. */
  rippleWidth?: number;
  /** Width of the band the ripple bends, in CSS pixels. */
  rippleBendWidth?: number;
  /** How many CSS pixels the ripple bends the page. */
  rippleBend?: number;
  /** Strength of the colored ripple outline (0 to 2). 0 hides it. */
  rippleGlow?: number;
  /** Seconds a ripple lives before it fades out. */
  rippleLife?: number;
}

export interface MagnifyElements {
  /** Canvas with layoutsubtree that hosts the HTML content. */
  source: HTMLCanvasElement;
  /** The element inside the source canvas that gets captured. */
  content: HTMLElement;
  /** Canvas the WebGPU effect renders to. */
  output: HTMLCanvasElement;
}

export interface MagnifyInstance {
  /** Update effect options live. */
  setOptions: (options: MagnifyOptions) => void;
  /** Re-read canvas size. Call when the element is resized. */
  resize: () => void;
  /** Stop the loop and release all GPU resources. */
  destroy: () => void;
}

const DEFAULTS: Required<MagnifyOptions> = {
  size: 140,
  zoom: 1.5,
  scrollZoom: false,
  zoomModifier: "shift",
  color: [0.8, 0.8, 0.8],
  follow: 0.25,
  hud: 0.8,
  ring: true,
  crosshair: true,
  ticks: true,
  brackets: true,
  dot: true,
  grid: false,
  readout: true,
  aberration: 0.8,
  haze: 0.2,
  ripples: true,
  rippleSpeed: 900,
  rippleWidth: 2,
  rippleBendWidth: 100,
  rippleBend: 20,
  rippleGlow: 1,
  rippleLife: 1.4,
};

const MAX_RIPPLES = 6;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const WHEEL_LINE = 16;
const ZOOM_SENSITIVITY = 0.0022;

function clampZoom(value: number) {
  return Math.min(Math.max(value, MIN_ZOOM), MAX_ZOOM);
}

const MODIFIER_HELD: Record<ZoomModifier, (event: WheelEvent) => boolean> = {
  shift: (event) => event.shiftKey,
  alt: (event) => event.altKey,
  ctrl: (event) => event.ctrlKey,
  meta: (event) => event.metaKey,
  none: () => true,
};

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

const MIPMAP_SHADER = /* wgsl */ `
struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
}

@group(0) @binding(0) var uSrc: texture_2d<f32>;
@group(0) @binding(1) var uSampler: sampler;

@vertex fn vs_main(@builtin(vertex_index) vertexIndex: u32) -> VSOut {
  let pos = array<vec2f, 3>(
    vec2f(-1.0, -1.0),
    vec2f(3.0, -1.0),
    vec2f(-1.0, 3.0),
  );
  let p = pos[vertexIndex];
  var out: VSOut;
  out.pos = vec4f(p, 0.0, 1.0);
  out.uv = vec2f(p.x * 0.5 + 0.5, 0.5 - p.y * 0.5);
  return out;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  return textureSampleLevel(uSrc, uSampler, uv, 0.0);
}`;

const SHADER = /* wgsl */ `
struct Params {
  ripples: array<vec4f, 6>,
  color: vec4f,
  resolution: vec2f,
  center: vec2f,
  maxX: f32,
  hasContent: f32,
  dpr: f32,
  radius: f32,
  zoom: f32,
  alpha: f32,
  hud: f32,
  ring: f32,
  cross: f32,
  ticks: f32,
  brackets: f32,
  dot: f32,
  grid: f32,
  aberration: f32,
  haze: f32,
  rippleWidth: f32,
  rippleBendWidth: f32,
  rippleBend: f32,
  rippleGlow: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var uContent: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

const PI = 3.14159265358979;

fn pow2(x: f32) -> f32 { return x * x; }

fn mod1(x: f32, y: f32) -> f32 {
  return x - y * floor(x / y);
}

fn page(px: vec2f, lod: f32) -> vec3f {
  var uv = px / params.resolution;
  uv.x = clamp(uv.x, 0.0005, params.maxX - 0.0005);
  uv.y = clamp(uv.y, 0.0005, 0.9995);
  return pow(textureSampleLevel(uContent, uSampler, vec2f(uv.x, 1.0 - uv.y), lod).rgb, vec3f(2.2));
}

fn pageAA(px: vec2f, minLod: f32) -> vec3f {
  let footprint = max(length(fwidth(px)), 1.0);
  return page(px, max(minLod, log2(footprint)));
}

fn line(d: f32, halfWidth: f32) -> f32 {
  return 1.0 - smoothstep(halfWidth - 0.75, halfWidth + 0.75, abs(d));
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let fragPx = vec2f(uv.x * params.resolution.x, (1.0 - uv.y) * params.resolution.y);
  let p = fragPx - params.center;
  let d = length(p);
  let R = params.radius;
  let w = 1.1 * params.dpr;

  var rippleOffset = vec2f(0.0);
  var crest = 0.0;
  var bendVis = 0.0;
  for (var i = 0u; i < 6u; i++) {
    let rp = params.ripples[i];
    let rd = fragPx - rp.xy;
    let rl = max(length(rd), 1.0);
    let bendBand = exp(-pow2((rl - rp.z) / max(params.rippleBendWidth * params.dpr, 1.0)));
    let crestBand = exp(-pow2((rl - rp.z) / max(params.rippleWidth * params.dpr, 1.0)));
    rippleOffset += (rd / rl) * bendBand * rp.w * params.rippleBend * params.dpr;
    crest = max(crest, crestBand * rp.w);
    bendVis = max(bendVis, bendBand * rp.w);
  }

  let inContent = 1.0 - smoothstep(
    params.maxX * params.resolution.x - 2.0, params.maxX * params.resolution.x, fragPx.x);
  crest *= inContent;
  let rippleCover = smoothstep(0.001, 0.03, bendVis) * inContent;

  let lensMask = 1.0 - smoothstep(R - 1.5, R, d);
  let lensPx = params.center + p / max(params.zoom, 1.0) - rippleOffset;
  let rimT = pow2(clamp(d / max(R, 1.0), 0.0, 1.0));
  let dir = p / max(d, 0.5);
  let caPx = params.aberration * 5.0 * rimT * params.dpr;
  let hazeLod = params.haze * 3.0 * (0.3 + 0.7 * rimT);
  var inside: vec3f;
  inside.r = pageAA(lensPx + dir * caPx, hazeLod).r;
  inside.g = pageAA(lensPx, hazeLod).g;
  inside.b = pageAA(lensPx - dir * caPx, hazeLod).b;

  let soft = page(lensPx, 4.5);
  inside = mix(
    inside,
    soft * (1.0 + 0.4 * params.haze) + params.color.rgb * 0.06 * params.haze,
    clamp(params.haze, 0.0, 1.0) * 0.45);

  let bent = pageAA(fragPx - rippleOffset, 0.0);

  var hud = 0.0;
  hud += params.ring * line(d - R, 1.3 * params.dpr);

  let angle = atan2(p.y, p.x);
  let sector = PI / 4.0;
  let da = abs(angle - (floor(angle / sector + 0.5) * sector)) * max(d, 1.0);
  let tickBand = smoothstep(R + 4.0 * params.dpr, R + 6.0 * params.dpr, d)
    * (1.0 - smoothstep(R + 12.0 * params.dpr, R + 14.0 * params.dpr, d));
  hud += params.ticks * line(da, w) * tickBand;

  let reach = R * 1.14;
  let crossLine = max(
    line(p.x, w) * step(abs(p.y), reach),
    line(p.y, w) * step(abs(p.x), reach));
  hud += params.cross * crossLine * smoothstep(6.0 * params.dpr, 10.0 * params.dpr, d) * 0.75;

  let q = abs(p);
  let c = R * 0.64;
  let len = R * 0.2;
  let arm1 = line(q.x - c, w) * step(c - len, q.y) * step(q.y, c + w);
  let arm2 = line(q.y - c, w) * step(c - len, q.x) * step(q.x, c + w);
  hud += params.brackets * max(arm1, arm2);

  hud += params.dot * (1.0 - smoothstep(1.6 * params.dpr, 2.6 * params.dpr, d));
  hud += params.dot * line(d - 5.5 * params.dpr, 0.9 * params.dpr) * 0.6;

  let spacing = max(R * 0.25, 8.0);
  let gx = line(mod1(p.x + spacing * 0.5, spacing) - spacing * 0.5, 0.6 * params.dpr);
  let gy = line(mod1(p.y + spacing * 0.5, spacing) - spacing * 0.5, 0.6 * params.dpr);
  hud += params.grid * max(gx, gy) * lensMask * 0.16;

  hud = clamp(hud, 0.0, 1.0) * params.hud;

  if (params.hasContent < 0.5) {
    let hudCol = pow(max(params.color.rgb, vec3f(0.0)), vec3f(1.0 / 2.2));
    let hudA = hud * params.alpha;
    let glow = clamp(pow(crest, 1.5) * params.rippleGlow, 0.0, 1.0) * inContent;
    var a = max(hudA, lensMask * params.alpha * 0.08);
    a = max(a, glow * 0.7);
    return vec4f(hudCol * clamp(hudA + glow * 0.7, 0.0, 1.0), a);
  }

  var base = mix(bent, inside, lensMask * params.alpha);
  base += params.color.rgb * pow(crest, 1.5) * params.rippleGlow * 0.7;
  let hudA = hud * params.alpha;
  base = mix(base, params.color.rgb, hudA);

  var alpha = max(lensMask * params.alpha, rippleCover);
  alpha = max(alpha, clamp(pow(crest, 1.5) * params.rippleGlow, 0.0, 1.0));
  alpha = max(alpha, hudA);

  return vec4f(pow(max(base, vec3f(0.0)), vec3f(1.0 / 2.2)) * alpha, alpha);
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

function mipLevelCountFor(width: number, height: number): number {
  return Math.floor(Math.log2(Math.max(width, height))) + 1;
}

export function createMagnify(
  elements: MagnifyElements,
  options: MagnifyOptions = {},
): MagnifyInstance | null {
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
  let linearSampler: GPUSampler | null = null;
  let mipmapLayout: GPUBindGroupLayout | null = null;
  let mipmapPipeline: GPURenderPipeline | null = null;
  let contentTexture: Texture | null = null;
  let fallback2d: CanvasRenderingContext2D | null = null;
  let contentMaxX = 1;
  let dprNow = 1;

  const readout = document.createElement("div");
  readout.setAttribute("aria-hidden", "true");
  Object.assign(readout.style, {
    position: "absolute",
    left: "0",
    top: "0",
    pointerEvents: "none",
    whiteSpace: "pre",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    fontSize: "10px",
    lineHeight: "1.8",
    letterSpacing: "0.14em",
    opacity: "0",
    zIndex: "1",
    willChange: "transform, opacity",
  } satisfies Partial<CSSStyleDeclaration>);
  (output.parentElement ?? output.ownerDocument.body).appendChild(readout);

  function accentCss(): string {
    const [r, g, b] = config.color;
    return `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`;
  }

  function syncCanvasSize() {
    const dpr = getCanvasPixelRatio(output);
    dprNow = dpr;
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

  function ensureMipmapPipeline(): GPURenderPipeline | null {
    if (!gpu || !linearSampler) return null;
    if (!mipmapLayout) {
      mipmapLayout = gpu.gpu.createBindGroupLayout({
        label: "magnify.mipmap.layout",
        entries: [
          {
            binding: 0,
            visibility: GPUShaderStage.FRAGMENT,
            texture: { sampleType: "float", viewDimension: "2d" },
          },
          {
            binding: 1,
            visibility: GPUShaderStage.FRAGMENT,
            sampler: { type: "filtering" },
          },
        ],
      });
    }
    if (!mipmapPipeline) {
      const shaderModule = gpu.gpu.createShaderModule({
        label: "magnify.mipmap",
        code: MIPMAP_SHADER,
      });
      mipmapPipeline = gpu.gpu.createRenderPipeline({
        label: "magnify.mipmap",
        layout: gpu.gpu.createPipelineLayout({ bindGroupLayouts: [mipmapLayout] }),
        vertex: { module: shaderModule, entryPoint: "vs_main" },
        fragment: {
          module: shaderModule,
          entryPoint: "fs_main",
          targets: [{ format: "rgba8unorm" }],
        },
        primitive: { topology: "triangle-list" },
      });
    }
    return mipmapPipeline;
  }

  function generateMipmaps(texture: Texture) {
    if (!gpu || !linearSampler || texture.mipLevelCount <= 1) return;
    const pipeline = ensureMipmapPipeline();
    if (!pipeline || !mipmapLayout) return;
    const encoder = gpu.gpu.createCommandEncoder({ label: "magnify.mipmap" });
    for (let level = 1; level < texture.mipLevelCount; level++) {
      const bindGroup = gpu.gpu.createBindGroup({
        label: "magnify.mipmap",
        layout: mipmapLayout,
        entries: [
          {
            binding: 0,
            resource: texture.gpu.createView({
              baseMipLevel: level - 1,
              mipLevelCount: 1,
            }),
          },
          { binding: 1, resource: linearSampler },
        ],
      });
      const pass = encoder.beginRenderPass({
        label: "magnify.mipmap",
        colorAttachments: [
          {
            view: texture.gpu.createView({ baseMipLevel: level, mipLevelCount: 1 }),
            clearValue: { r: 0, g: 0, b: 0, a: 0 },
            loadOp: "clear",
            storeOp: "store",
          },
        ],
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3);
      pass.end();
    }
    gpu.gpu.queue.submit([encoder.finish()]);
  }

  function ensureContentTexture(): Texture {
    const w = Math.max(1, source.width);
    const h = Math.max(1, source.height);
    const mipLevelCount = mipLevelCountFor(w, h);
    if (
      !contentTexture ||
      contentTexture.size[0] !== w ||
      contentTexture.size[1] !== h ||
      contentTexture.mipLevelCount !== mipLevelCount
    ) {
      contentTexture?.destroy();
      contentTexture = gpu!.device.createTexture({
        size: [w, h],
        format: "rgba8unorm",
        usage: ["texture_binding", "copy_dst", "render_attachment"],
        mipLevelCount,
        label: "magnify.content",
      });
    }
    return contentTexture;
  }

  function uploadContent() {
    if (!htmlInCanvas || !contentDirty || !gpu || !fx) return;
    contentDirty = false;
    const texture = ensureContentTexture();
    gpu.gpu.queue.copyExternalImageToTexture(
      { source },
      { texture: texture.gpu, mipLevel: 0 },
      [source.width, source.height],
    );
    generateMipmaps(texture);
    fx.set({ uContent: texture });
  }

  let posX = output.clientWidth / 2;
  let posY = output.clientHeight / 2;
  let targetX = posX;
  let targetY = posY;
  let presence = 0;
  let presenceTarget = 0;
  let hasPointer = false;
  let zoomTarget = clampZoom(config.zoom);
  let zoomValue = zoomTarget;

  const ripples: { x: number; y: number; r0: number; age: number }[] = [];
  const rippleData: [number, number, number, number][] = Array.from(
    { length: MAX_RIPPLES },
    () => [0, 0, 0, 0],
  );

  function syncReadout(now: number) {
    const show = config.readout && config.hud > 0.01 && presence > 0.05;
    readout.style.opacity = show
      ? String(Math.min(presence, 1) * Math.min(config.hud, 1))
      : "0";
    if (!show) return;
    const R = Math.max(config.size, 8) * presence;
    const width = output.clientWidth;
    const boxW = 120;
    let rx = posX + R + 18;
    if (rx + boxW > width - 8) rx = posX - R - 18 - boxW;
    const ry = Math.min(
      Math.max(posY - 34, 8),
      Math.max(output.clientHeight - 90, 8),
    );
    readout.style.transform = `translate(${Math.round(rx)}px, ${Math.round(ry)}px)`;
    readout.style.color = accentCss();
    const blink = Math.floor(now / 600) % 2 === 0 ? "\u25CF" : "\u25CB";
    readout.textContent =
      `X ${String(Math.round(posX)).padStart(4, " ")}\n` +
      `Y ${String(Math.round(posY)).padStart(4, " ")}\n` +
      `${zoomValue.toFixed(1)}X MAG\n` +
      `R ${Math.round(config.size)}PX ${blink}`;
  }

  function clearScreen() {
    if (!gpu || !screen) return;
    gpuFrame(gpu, (f) => f.pass({ target: screen!, clear: [0, 0, 0, 0] }, () => {}));
  }

  function render() {
    if (!gpu || !fx || !screen) return;
    uploadContent();
    if (presence <= 0.004 && ripples.length === 0) {
      clearScreen();
      return;
    }
    const dpr = dprNow;
    const [width, height] = screen.size;
    const R = Math.max(config.size, 8) * presence;
    const alpha = Math.min(presence * 5, 1);
    const cx = posX * dpr;
    const cy = height - posY * dpr;

    for (let i = 0; i < MAX_RIPPLES; i++) {
      const ripple = ripples[i];
      if (!ripple) {
        rippleData[i][0] = 0;
        rippleData[i][1] = 0;
        rippleData[i][2] = 0;
        rippleData[i][3] = 0;
        continue;
      }
      const t = ripple.age / Math.max(config.rippleLife, 0.1);
      rippleData[i][0] = ripple.x * dpr;
      rippleData[i][1] = height - ripple.y * dpr;
      rippleData[i][2] = (ripple.r0 + Math.max(config.rippleSpeed, 1) * ripple.age) * dpr;
      rippleData[i][3] = Math.pow(Math.max(1 - t, 0), 2);
    }

    fx.set({
      params: {
        ripples: rippleData,
        color: [...config.color, 0],
        resolution: [width, height],
        center: [cx, cy],
        maxX: contentMaxX,
        hasContent: htmlInCanvas ? 1 : 0,
        dpr,
        radius: R * dpr,
        zoom: zoomValue,
        alpha,
        hud: Math.min(Math.max(config.hud, 0), 1),
        ring: config.ring ? 1 : 0,
        cross: config.crosshair ? 1 : 0,
        ticks: config.ticks ? 1 : 0,
        brackets: config.brackets ? 1 : 0,
        dot: config.dot ? 1 : 0,
        grid: config.grid ? 1 : 0,
        aberration: Math.max(config.aberration, 0),
        haze: Math.min(Math.max(config.haze, 0), 1),
        rippleWidth: Math.max(config.rippleWidth, 0.5),
        rippleBendWidth: Math.max(config.rippleBendWidth, 1),
        rippleBend: Math.max(config.rippleBend, 0),
        rippleGlow: Math.max(config.rippleGlow, 0),
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
      syncReadout(now);
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
      reducedMotion || follow >= 1 ? 1 : 1 - Math.exp(-delta * (4 + follow * 26));
    const kScale = reducedMotion ? 1 : 1 - Math.exp(-delta * 11);
    posX += (targetX - posX) * kPos;
    posY += (targetY - posY) * kPos;
    presence += (presenceTarget - presence) * kScale;
    zoomValue += (zoomTarget - zoomValue) * kScale;

    for (const ripple of ripples) ripple.age += delta;
    for (let i = ripples.length - 1; i >= 0; i--) {
      if (ripples[i].age > Math.max(config.rippleLife, 0.1)) ripples.splice(i, 1);
    }

    render();
    syncReadout(now);

    const settled =
      Math.abs(targetX - posX) < 0.1 &&
      Math.abs(targetY - posY) < 0.1 &&
      Math.abs(presenceTarget - presence) < 0.002 &&
      Math.abs(zoomTarget - zoomValue) < 0.002;
    if (settled && !contentDirty && ripples.length === 0) {
      posX = targetX;
      posY = targetY;
      presence = presenceTarget;
      zoomValue = zoomTarget;
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
        label: "magnify",
      });
      linearSampler = sampler(gpu, {
        minFilter: "linear",
        magFilter: "linear",
        mipmapFilter: "linear",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
      });
      fx = effect(gpu, SHADER, {
        label: "magnify",
        set: { uSampler: linearSampler, uContent: ensureContentTexture() },
      });
      syncCanvasSize();
      start();
    })
    .catch((error) => {
      if (destroyed) return;
      console.warn("Magnify: WebGPU unavailable, showing content without the effect.", error);
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
    start();
  }

  function onPointerLeave() {
    presenceTarget = 0;
    hasPointer = false;
    start();
  }

  function onPointerDown(event: PointerEvent) {
    if (!config.ripples || event.button > 0 || reducedMotion) return;
    if (ripples.length >= MAX_RIPPLES) ripples.shift();
    ripples.push({
      x: posX,
      y: posY,
      r0: Math.max(config.size, 8) * presence,
      age: 0,
    });
    start();
  }

  content.addEventListener("pointermove", onPointerMove, { passive: true });
  content.addEventListener("pointerleave", onPointerLeave, { passive: true });
  content.addEventListener("pointerdown", onPointerDown, { passive: true });

  function onWheel(event: WheelEvent) {
    const held = MODIFIER_HELD[config.zoomModifier] ?? MODIFIER_HELD.shift;
    if (!held(event)) return;
    const rect = output.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    ) {
      return;
    }
    event.preventDefault();
    const unit =
      event.deltaMode === 1 ? WHEEL_LINE : event.deltaMode === 2 ? output.clientHeight : 1;
    const delta =
      Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
    zoomTarget = clampZoom(zoomTarget * Math.exp(-delta * unit * ZOOM_SENSITIVITY));
    start();
  }

  const WHEEL_OPTIONS: AddEventListenerOptions = {
    passive: false,
    capture: true,
  };

  let wheelBound = false;
  function syncWheel() {
    if (config.scrollZoom === wheelBound) return;
    wheelBound = config.scrollZoom;
    if (wheelBound) window.addEventListener("wheel", onWheel, WHEEL_OPTIONS);
    else window.removeEventListener("wheel", onWheel, WHEEL_OPTIONS);
  }
  syncWheel();

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
          ([key, value]) => config[key as keyof MagnifyOptions] !== value,
        )
      )
        return;
      const previousZoom = config.zoom;
      Object.assign(config, next);
      if (!config.scrollZoom || config.zoom !== previousZoom) {
        zoomTarget = clampZoom(config.zoom);
      }
      syncWheel();
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
      content.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("wheel", onWheel, WHEEL_OPTIONS);
      content.removeEventListener("scroll", onScroll);
      observer.disconnect();
      intersection.disconnect();
      motionQuery.removeEventListener("change", onMotionChange);
      readout.remove();
      contentTexture?.destroy();
      screen?.dispose();
      if (htmlInCanvas) paintable.onpaint = null;
    },
  };
}
