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
  type Texture,
} from "vgpu";

export interface BendOptions {
  /** Height of the folded region at each edge in CSS pixels. */
  zone?: number;
  /** Maximum fold angle in degrees, reached away from the scroll ends. 90 is a cube edge. */
  angle?: number;
  /** Radius in CSS pixels of the circular arc that rounds each fold crease. 0 keeps a sharp cube edge. Clamped to the zone height. */
  rounding?: number;
  /** Perspective focal length in CSS pixels. Smaller values pinch the folded edges harder. */
  perspective?: number;
  /** "out" folds the edges away from the viewer like the outside of a cube, "in" tilts them toward the viewer. */
  direction?: "out" | "in";
  /** Scroll distance in CSS pixels over which an edge flattens near its scroll end. */
  ease?: number;
  /** Seconds the bend takes to settle after a scroll. 0 snaps instantly. */
  smoothing?: number;
  /** Bend the top edge. */
  top?: boolean;
  /** Bend the bottom edge. */
  bottom?: boolean;
  /** Overscroll tip strength (0 to 1). Rubber-banding past a scroll end tips the whole face over that edge. 0 disables. */
  tumble?: number;
  /** Pointer tilt strength (0 to 1). The face leans subtly toward the cursor. 0 disables. */
  tilt?: number;
  /** CSS rotation applied to the Bend host, used to keep pointer mapping aligned. */
  interactionRotation?: 0 | 90 | -90;
}

export interface BendElements {
  /** Canvas with layoutsubtree that hosts the HTML content. */
  source: HTMLCanvasElement;
  /** The scrollable element inside the source canvas that gets captured. */
  content: HTMLElement;
  /** Canvas the WebGPU effect renders to. */
  output: HTMLCanvasElement;
}

export interface BendInstance {
  /** Update effect options live. */
  setOptions: (options: BendOptions) => void;
  /** Re-read canvas size. Call when the element is resized. */
  resize: () => void;
  /** Stop the loop and release all GPU resources. */
  destroy: () => void;
}

const DEFAULTS: Required<BendOptions> = {
  zone: 240,
  angle: 80,
  rounding: 150,
  perspective: 700,
  direction: "in",
  ease: 240,
  smoothing: 0.1,
  top: true,
  bottom: true,
  tumble: 0.5,
  tilt: 0.5,
  interactionRotation: 0,
};

interface RectCache {
  readonly current: DOMRect;
  destroy: () => void;
}

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

type PaintableCanvas = HTMLCanvasElement & {
  onpaint?: (() => void) | null;
  requestPaint?: () => void;
};

type ElementImageContext = CanvasRenderingContext2D & {
  drawElementImage?: (element: Element, x: number, y: number) => void;
};

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
  contentSize: vec2f,
  bg: vec3f,
  zone: f32,
  angle: f32,
  persp: f32,
  dir: f32,
  topAmt: f32,
  botAmt: f32,
  maxX: f32,
  pxY: f32,
  pxX: f32,
  cover: f32,
  tiltX: f32,
  tiltY: f32,
  phi: f32,
  round: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var uContent: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

fn foldEdge(sy: f32, amt: f32) -> vec3f {
  let yf = 1.0 - params.zone;
  if (amt < 1e-4) { return vec3f(sy, 0.0, 1.0); }
  let theta = params.angle * amt;
  if (params.round < 1e-4) {
    let s = sin(theta) * params.dir;
    let c = cos(theta);
    let denom = max(c * params.persp + s * (0.5 - sy), 1e-5);
    let tRaw = params.persp * (sy - yf) / denom;
    let t = clamp(tRaw, 0.0, params.zone);
    let z = max(t * s, -0.85 * params.persp);
    let alpha = 1.0 - smoothstep(params.zone, params.zone + 2.0 * params.pxY, tRaw);
    return vec3f(yf + t, z, alpha);
  }
  if (sy <= yf) { return vec3f(sy, 0.0, 1.0); }
  let R = min(params.round, params.zone);
  let r = R / theta;
  let ca = cos(theta);
  let sa = sin(theta);
  let yA = r * sa;
  let zA = r * (1.0 - ca);
  var prevSy = yf;
  var prevZ = 0.0;
  var prevU = 0.0;
  var bestU = -1.0;
  var bestZ = 0.0;
  var maxSy = yf;
  let du = params.zone / 40.0;
  for (var i = 1; i <= 40; i++) {
    let u = du * f32(i);
    var Y: f32;
    var Zm: f32;
    if (u <= R) {
      let a = u / r;
      Y = r * sin(a);
      Zm = r * (1.0 - cos(a));
    } else {
      Y = yA + (u - R) * ca;
      Zm = zA + (u - R) * sa;
    }
    Y += yf;
    let Z = max(Zm * params.dir, -0.85 * params.persp);
    let scr = 0.5 + (Y - 0.5) * params.persp / (params.persp + Z);
    if ((prevSy - sy) * (scr - sy) <= 0.0 && abs(scr - prevSy) > 1e-7) {
      let f = clamp((sy - prevSy) / (scr - prevSy), 0.0, 1.0);
      bestU = mix(prevU, u, f);
      bestZ = mix(prevZ, Z, f);
      if (params.dir > 0.0) { break; }
    }
    maxSy = max(maxSy, scr);
    prevSy = scr;
    prevZ = Z;
    prevU = u;
  }
  if (bestU < 0.0) {
    let alpha = 1.0 - smoothstep(maxSy - params.pxY, maxSy + params.pxY, sy);
    return vec3f(1.0, prevZ, alpha);
  }
  return vec3f(yf + bestU, bestZ, 1.0);
}

fn tipPlane(sy: f32, phi: f32) -> vec2f {
  let s = sin(phi);
  let c = cos(phi);
  let denom = max(c * params.persp + s * (sy - 0.5), 1e-4);
  let t = params.persp * (1.0 - sy) / denom;
  return vec2f(1.0 - t, t * s);
}

@fragment fn fs_main(@location(0) inUv: vec2f) -> @location(0) vec4f {
  var uv = vec2f(inUv.x, 1.0 - inUv.y);
  let cx = params.maxX * 0.5;
  var zSum = 0.0;

  if (abs(params.phi) > 1e-4) {
    if (params.phi > 0.0) {
      let r = tipPlane(uv.y, params.phi);
      uv.y = r.x;
      zSum += r.y;
    } else {
      let r = tipPlane(1.0 - uv.y, -params.phi);
      uv.y = 1.0 - r.x;
      zSum += r.y;
    }
  }

  let zG = params.tiltX * (uv.x - cx) + params.tiltY * (uv.y - 0.5);
  zSum += zG;
  uv.y = 0.5 + (uv.y - 0.5) * (params.persp + zG) / params.persp;

  let inTop = step(1.0 - params.zone, uv.y);
  let inBot = step(uv.y, params.zone);

  let top = foldEdge(uv.y, params.topAmt);
  let bot = foldEdge(1.0 - uv.y, params.botAmt);

  var srcY = uv.y;
  srcY = mix(srcY, top.x, inTop);
  srcY = mix(srcY, 1.0 - bot.x, inBot);

  zSum += inTop * top.y + inBot * bot.y;
  var alpha = mix(1.0, top.z, inTop) * mix(1.0, bot.z, inBot);

  let srcX = cx + (uv.x - cx) * (params.persp + zSum) / params.persp;

  alpha *= smoothstep(-2.0 * params.pxX, 0.0, srcX);
  alpha *= 1.0 - smoothstep(params.maxX, params.maxX + 2.0 * params.pxX, srcX);
  alpha *= smoothstep(-2.0 * params.pxY, 0.0, srcY);
  alpha *= 1.0 - smoothstep(1.0, 1.0 + 2.0 * params.pxY, srcY);

  let p = vec2f(
    clamp(srcX, 0.0005, params.maxX - 0.0005),
    clamp(srcY, 0.0005, 0.9995)
  );
  let sampleUv = vec2f(p.x, 1.0 - p.y);
  let dx = dpdx(sampleUv) * params.contentSize;
  let dy = dpdy(sampleUv) * params.contentSize;
  let lod = max(0.0, log2(max(length(dx), length(dy))));
  let base = textureSampleLevel(uContent, uSampler, sampleUv, lod);
  let rgb = mix(params.bg, base.rgb, alpha * base.a) * params.cover;

  return vec4f(rgb, params.cover);
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

/** One WebGPU device per page, shared by every Bend instance. */
function acquireGpu(): Promise<Gpu> {
  if (!sharedGpu) {
    sharedGpu = init().catch((error) => {
      sharedGpu = null;
      throw error;
    });
  }
  return sharedGpu;
}

const HOVER_ATTR = "data-canvasui-hover";
const CONTENT_ATTR = "data-canvasui-content";
const CURSOR_ATTR = "data-canvasui-cursor";
const HOVER_REWRITE = `:is([${HOVER_ATTR}], :hover:where(:not([${CONTENT_ATTR}], [${CONTENT_ATTR}] *)))`;

function patchHoverRules() {
  if (typeof document === "undefined") return;
  if (document.documentElement.dataset.canvasuiHoverRules === "") return;
  document.documentElement.dataset.canvasuiHoverRules = "";
  const walk = (rules: CSSRuleList) => {
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSStyleRule) {
        if (rule.selectorText.includes(":hover")) {
          try {
            rule.selectorText = rule.selectorText.replace(/:hover\b/g, HOVER_REWRITE);
          } catch {}
        }
        if (rule.cssRules.length) walk(rule.cssRules);
      } else if ("cssRules" in rule) {
        try {
          walk((rule as CSSGroupingRule).cssRules);
        } catch {}
      }
    }
  };
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      walk(sheet.cssRules);
    } catch {}
  }
  const style = document.createElement("style");
  style.textContent = `[${CONTENT_ATTR}][${CURSOR_ATTR}], [${CONTENT_ATTR}][${CURSOR_ATTR}] * { cursor: var(--canvasui-cursor) !important; }`;
  document.head.appendChild(style);
}

export function createBend(
  elements: BendElements,
  options: BendOptions = {},
): BendInstance | null {
  if (!supportsWebGPU()) return null;
  const config = { ...DEFAULTS, ...options };
  const { source, content, output } = elements;

  // Bending needs captured pixels. Its fallback is ordinary scrollable HTML;
  // do not allocate a GPU context or run a transparent shader over that HTML.
  if (!source.contains(content) || !supportsHtmlInCanvas()) return null;

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

  let gpu: Gpu | null = null;
  let screen: Surface | null = null;
  let fx: Effect | null = null;
  let contentTexture: Texture | null = null;
  let linearSampler: GPUSampler | null = null;
  let mipmapLayout: GPUBindGroupLayout | null = null;
  let mipmapPipeline: GPURenderPipeline | null = null;
  let fallback2d: CanvasRenderingContext2D | null = null;
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

  let contentMaxX = 1;
  let bg: [number, number, number] = [0, 0, 0];
  const bgProbe = document.createElement("canvas");
  bgProbe.width = bgProbe.height = 1;
  const bgCtx = bgProbe.getContext("2d", { willReadFrequently: true });

  function syncBgColor() {
    if (!bgCtx) return;
    let el: Element | null = content;
    while (el) {
      const css = getComputedStyle(el).backgroundColor;
      if (css && css !== "transparent") {
        bgCtx.clearRect(0, 0, 1, 1);
        bgCtx.fillStyle = css;
        bgCtx.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = bgCtx.getImageData(0, 0, 1, 1).data;
        if (a > 0) {
          bg = [r / 255, g / 255, b / 255];
          return;
        }
      }
      el = el.parentElement;
    }
    bg = [0, 0, 0];
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

  let topTarget = 0;
  let bottomTarget = 0;
  let topCurrent = 0;
  let bottomCurrent = 0;
  let over = 0;
  let phiCurrent = 0;
  let tiltXTarget = 0;
  let tiltYTarget = 0;
  let tiltXCurrent = 0;
  let tiltYCurrent = 0;

  function syncScroll() {
    const max = content.scrollHeight - content.clientHeight;
    const t = content.scrollTop;
    const e = Math.max(config.ease, 1);
    const ramp = (v: number) => {
      const x = Math.min(Math.max(v / e, 0), 1);
      return x * x * (3 - 2 * x);
    };
    topTarget = max > 1 && config.top ? ramp(t) : 0;
    bottomTarget = max > 1 && config.bottom ? ramp(max - t) : 0;
  }

  syncCanvasSize();
  syncScroll();
  syncBgColor();

  function mipLevelCountFor(width: number, height: number): number {
    return Math.floor(Math.log2(Math.max(width, height))) + 1;
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
        label: "bend.content",
      });
    }
    return contentTexture;
  }

  function ensureMipmapPipeline(): GPURenderPipeline | null {
    if (!gpu || !linearSampler) return null;
    if (!mipmapLayout) {
      mipmapLayout = gpu.gpu.createBindGroupLayout({
        label: "bend.mipmap.layout",
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
        label: "bend.mipmap",
        code: MIPMAP_SHADER,
      });
      mipmapPipeline = gpu.gpu.createRenderPipeline({
        label: "bend.mipmap",
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
    const encoder = gpu.gpu.createCommandEncoder({ label: "bend.mipmap" });
    for (let level = 1; level < texture.mipLevelCount; level++) {
      const bindGroup = gpu.gpu.createBindGroup({
        label: "bend.mipmap",
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
        label: "bend.mipmap",
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

  function uploadContent() {
    if (!htmlInCanvas || !contentDirty || !gpu) return;
    contentDirty = false;
    syncBgColor();
    const texture = ensureContentTexture();
    gpu.gpu.queue.copyExternalImageToTexture(
      { source },
      { texture: texture.gpu },
      [source.width, source.height],
    );
    generateMipmaps(texture);
    fx?.set({ uContent: texture });
  }

  function renderFallback() {
    if (!fallback2d || !htmlInCanvas || !contentDirty) return;
    contentDirty = false;
    fallback2d.clearRect(0, 0, output.width, output.height);
    fallback2d.drawImage(source, 0, 0, output.width, output.height);
  }

  function render() {
    if (!gpu || !fx || !screen) return;
    uploadContent();
    const h = Math.max(output.clientHeight, 1);
    const w = Math.max(output.clientWidth, 1);
    const zoneFrac = Math.min(Math.max(config.zone, 8) / h, 0.49);
    fx.set({
      params: {
        contentSize: [
          contentTexture?.size[0] ?? Math.max(1, source.width),
          contentTexture?.size[1] ?? Math.max(1, source.height),
        ],
        zone: zoneFrac,
        angle: Math.min(Math.max(config.angle, 1), 160) * (Math.PI / 180),
        persp: Math.max(config.perspective, 50) / h,
        dir: config.direction === "in" ? -1 : 1,
        topAmt: topCurrent,
        botAmt: bottomCurrent,
        maxX: contentMaxX,
        pxY: 1.5 / h,
        pxX: 1.5 / w,
        cover: htmlInCanvas ? 1 : 0,
        bg,
        tiltX: tiltXCurrent,
        tiltY: tiltYCurrent,
        phi: phiCurrent,
        round: Math.min(Math.max(config.rounding, 0) / h, zoneFrac),
      },
    });
    gpuFrame(gpu, (f) => f.pass(screen!, fx!));
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
    const tau = config.smoothing;
    const k =
      reducedMotion || tau <= 0
        ? 1
        : 1 - Math.exp(-delta / Math.max(tau, 1e-4));
    topCurrent += (topTarget - topCurrent) * k;
    bottomCurrent += (bottomTarget - bottomCurrent) * k;
    if (Math.abs(topTarget - topCurrent) < 0.001) topCurrent = topTarget;
    if (Math.abs(bottomTarget - bottomCurrent) < 0.001)
      bottomCurrent = bottomTarget;

    over *= Math.exp(-delta / 0.22);
    if (Math.abs(over) < 0.5) over = 0;
    const phiTarget =
      reducedMotion || config.tumble <= 0
        ? 0
        : Math.tanh(over / 500) * 0.4 * Math.min(config.tumble, 1);
    phiCurrent += (phiTarget - phiCurrent) * Math.min(delta / 0.09, 1);
    if (phiTarget === 0 && Math.abs(phiCurrent) < 1e-4) phiCurrent = 0;

    if (reducedMotion || config.tilt <= 0) {
      tiltXTarget = 0;
      tiltYTarget = 0;
    }
    const kT = Math.min(delta / 0.15, 1);
    tiltXCurrent += (tiltXTarget - tiltXCurrent) * kT;
    tiltYCurrent += (tiltYTarget - tiltYCurrent) * kT;
    if (Math.abs(tiltXTarget - tiltXCurrent) < 1e-4) tiltXCurrent = tiltXTarget;
    if (Math.abs(tiltYTarget - tiltYCurrent) < 1e-4) tiltYCurrent = tiltYTarget;

    render();
    if (
      !contentDirty &&
      topCurrent === topTarget &&
      bottomCurrent === bottomTarget &&
      over === 0 &&
      phiCurrent === 0 &&
      tiltXCurrent === tiltXTarget &&
      tiltYCurrent === tiltYTarget
    ) {
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
        label: "bend",
      });
      linearSampler = sampler(gpu, {
        minFilter: "linear",
        magFilter: "linear",
        mipmapFilter: "linear",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
      });
      fx = effect(gpu, SHADER, {
        label: "bend",
        set: { uSampler: linearSampler, uContent: ensureContentTexture() },
      });
      syncCanvasSize();
      start();
    })
    .catch((error) => {
      if (destroyed) return;
      console.warn("Bend: WebGPU unavailable, showing content without the effect.", error);
      fallback2d = output.getContext("2d");
      contentDirty = true;
      start();
    });

  function onScroll() {
    syncScroll();
    if (htmlInCanvas) paintable.requestPaint!();
    if (hoverOn) updateHover(hoverClientX, hoverClientY);
    start();
  }
  content.addEventListener("scroll", onScroll, { passive: true });

  function onWheel(event: WheelEvent) {
    if (config.tumble <= 0 || reducedMotion) return;
    const max = content.scrollHeight - content.clientHeight;
    if (max <= 1) return;
    const st = content.scrollTop;
    if (event.deltaY > 0 && st >= max - 1) {
      over = Math.min(over + event.deltaY, 900);
    } else if (event.deltaY < 0 && st <= 1) {
      over = Math.max(over + event.deltaY, -900);
    } else {
      return;
    }
    start();
  }
  content.addEventListener("wheel", onWheel, { passive: true });

  const rectCache = createRectCache(output);

  function onPointerMove(event: PointerEvent) {
    if (!event.isPrimary) return;
    hoverClientX = event.clientX;
    hoverClientY = event.clientY;
    hoverOn = true;
    updateHover(event.clientX, event.clientY);
    if (config.tilt > 0 && !reducedMotion) {
      const rect = rectCache.current;
      if (rect.width > 0 && rect.height > 0) {
        const nx = (event.clientX - rect.left) / rect.width - 0.5;
        const ny = 0.5 - (event.clientY - rect.top) / rect.height;
        const amp = Math.min(config.tilt, 1) * 0.14;
        tiltXTarget = -nx * amp;
        tiltYTarget = -ny * amp;
        start();
      }
    }
  }
  content.addEventListener("pointermove", onPointerMove, { passive: true });

  function onPointerLeave() {
    hoverOn = false;
    setHoverTarget(null);
    tiltXTarget = 0;
    tiltYTarget = 0;
    start();
  }
  content.addEventListener("pointerleave", onPointerLeave);

  function mapPoint(px: number, py: number) {
    const w = Math.max(output.clientWidth, 1);
    const h = Math.max(output.clientHeight, 1);
    const persp = Math.max(config.perspective, 50) / h;
    const zone = Math.min(Math.max(config.zone, 8) / h, 0.49);
    const round = Math.min(Math.max(config.rounding, 0) / h, zone);
    const angle = Math.min(Math.max(config.angle, 1), 160) * (Math.PI / 180);
    const dirSign = config.direction === "in" ? -1 : 1;
    const cx = contentMaxX * 0.5;
    const x = px / w;
    let y = 1 - py / h;
    let zSum = 0;

    if (Math.abs(phiCurrent) > 1e-4) {
      const tip = (sy: number, phi: number): [number, number] => {
        const s = Math.sin(phi);
        const c = Math.cos(phi);
        const denom = Math.max(c * persp + s * (sy - 0.5), 1e-4);
        const t = (persp * (1 - sy)) / denom;
        return [1 - t, t * s];
      };
      if (phiCurrent > 0) {
        const tipped = tip(y, phiCurrent);
        y = tipped[0];
        zSum += tipped[1];
      } else {
        const tipped = tip(1 - y, -phiCurrent);
        y = 1 - tipped[0];
        zSum += tipped[1];
      }
    }

    const zG = tiltXCurrent * (x - cx) + tiltYCurrent * (y - 0.5);
    zSum += zG;
    y = 0.5 + (y - 0.5) * ((persp + zG) / persp);

    const fold = (sy: number, amt: number): [number, number, number] => {
      const yf = 1 - zone;
      if (amt < 1e-4) return [sy, 0, 1];
      const theta = angle * amt;
      if (round < 1e-4) {
        const s = Math.sin(theta) * dirSign;
        const c = Math.cos(theta);
        const denom = Math.max(c * persp + s * (0.5 - sy), 1e-5);
        const tRaw = (persp * (sy - yf)) / denom;
        const t = Math.min(Math.max(tRaw, 0), zone);
        const z = Math.max(t * s, -0.85 * persp);
        return [yf + t, z, tRaw > zone ? 0 : 1];
      }
      if (sy <= yf) return [sy, 0, 1];
      const R = Math.min(round, zone);
      const r = R / theta;
      const ca = Math.cos(theta);
      const sa = Math.sin(theta);
      const yA = r * sa;
      const zA = r * (1 - ca);
      let prevSy = yf;
      let prevZ = 0;
      let prevU = 0;
      let bestU = -1;
      let bestZ = 0;
      const du = zone / 40;
      for (let i = 1; i <= 40; i++) {
        const u = du * i;
        let py2: number;
        let zm: number;
        if (u <= R) {
          const a = u / r;
          py2 = r * Math.sin(a);
          zm = r * (1 - Math.cos(a));
        } else {
          py2 = yA + (u - R) * ca;
          zm = zA + (u - R) * sa;
        }
        const worldY = yf + py2;
        const worldZ = Math.max(zm * dirSign, -0.85 * persp);
        const scr = 0.5 + ((worldY - 0.5) * persp) / (persp + worldZ);
        if ((prevSy - sy) * (scr - sy) <= 0 && Math.abs(scr - prevSy) > 1e-7) {
          const f = Math.min(Math.max((sy - prevSy) / (scr - prevSy), 0), 1);
          bestU = prevU + (u - prevU) * f;
          bestZ = prevZ + (worldZ - prevZ) * f;
          if (dirSign > 0) break;
        }
        prevSy = scr;
        prevZ = worldZ;
        prevU = u;
      }
      if (bestU < 0) return [1, prevZ, 0];
      return [yf + bestU, bestZ, 1];
    };

    let srcY = y;
    let alpha = 1;
    if (y >= 1 - zone) {
      const folded = fold(y, topCurrent);
      srcY = folded[0];
      zSum += folded[1];
      alpha *= folded[2];
    } else if (y <= zone) {
      const folded = fold(1 - y, bottomCurrent);
      srcY = 1 - folded[0];
      zSum += folded[1];
      alpha *= folded[2];
    }
    const srcX = cx + (x - cx) * ((persp + zSum) / persp);
    if (srcX < 0 || srcX > contentMaxX || srcY < 0 || srcY > 1) alpha = 0;
    return { x: srcX * w, y: (1 - srcY) * h, alpha };
  }

  let forwarding = false;

  let hoverChain: Element[] = [];
  let hoverTarget: Element | null = null;
  let hoverClientX = 0;
  let hoverClientY = 0;
  let hoverOn = false;

  if (htmlInCanvas) {
    patchHoverRules();
    content.setAttribute(CONTENT_ATTR, "");
  }

  function setHoverTarget(target: Element | null) {
    if (target === hoverTarget) return;
    hoverTarget = target;
    const next = new Set<Element>();
    for (let el: Element | null = target; el; el = el.parentElement) {
      next.add(el);
      if (el === content) break;
    }
    for (const el of hoverChain) {
      if (!next.has(el)) el.removeAttribute(HOVER_ATTR);
    }
    for (const el of next) el.setAttribute(HOVER_ATTR, "");
    hoverChain = Array.from(next);
    content.removeAttribute(CURSOR_ATTR);
    content.style.removeProperty("--canvasui-cursor");
    if (target) {
      content.style.setProperty(
        "--canvasui-cursor",
        getComputedStyle(target).cursor,
      );
      content.setAttribute(CURSOR_ATTR, "");
    }
  }

  function clientToLocal(clientX: number, clientY: number) {
    const rect = output.getBoundingClientRect();
    const width = Math.max(output.clientWidth, 1);
    const height = Math.max(output.clientHeight, 1);
    const dx = clientX - rect.left;
    const dy = clientY - rect.top;

    if (config.interactionRotation === -90) {
      return {
        rect,
        x: width - dy / (rect.height / width),
        y: dx / (rect.width / height),
      };
    }
    if (config.interactionRotation === 90) {
      return {
        rect,
        x: dy / (rect.height / width),
        y: height - dx / (rect.width / height),
      };
    }
    return {
      rect,
      x: dx / (rect.width / width),
      y: dy / (rect.height / height),
    };
  }

  function localToClient(x: number, y: number, rect: DOMRect) {
    const width = Math.max(output.clientWidth, 1);
    const height = Math.max(output.clientHeight, 1);

    if (config.interactionRotation === -90) {
      return {
        x: rect.left + y * (rect.width / height),
        y: rect.top + (width - x) * (rect.height / width),
      };
    }
    if (config.interactionRotation === 90) {
      return {
        x: rect.left + (height - y) * (rect.width / height),
        y: rect.top + x * (rect.height / width),
      };
    }
    return {
      x: rect.left + x * (rect.width / width),
      y: rect.top + y * (rect.height / height),
    };
  }

  function updateHover(clientX: number, clientY: number) {
    if (!htmlInCanvas) return;
    const local = clientToLocal(clientX, clientY);
    const { rect } = local;
    if (rect.width === 0 || rect.height === 0) return;
    const mapped = mapPoint(local.x, local.y);
    if (mapped.alpha < 0.5) {
      setHoverTarget(null);
      return;
    }
    const point = localToClient(mapped.x, mapped.y, rect);
    const target = document.elementFromPoint(point.x, point.y);
    setHoverTarget(target && content.contains(target) ? target : null);
  }

  function onClick(event: MouseEvent) {
    if (forwarding || !htmlInCanvas || event.button !== 0) return;
    const local = clientToLocal(event.clientX, event.clientY);
    const { rect } = local;
    if (rect.width === 0 || rect.height === 0) return;
    const mapped = mapPoint(local.x, local.y);
    if (mapped.alpha < 0.5) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const point = localToClient(mapped.x, mapped.y, rect);
    if (Math.hypot(point.x - event.clientX, point.y - event.clientY) < 1.5)
      return;
    event.preventDefault();
    event.stopPropagation();
    const target = document.elementFromPoint(point.x, point.y);
    if (!target) return;
    forwarding = true;
    try {
      target.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          composed: true,
          view: window,
          detail: event.detail,
          clientX: point.x,
          clientY: point.y,
          screenX: event.screenX,
          screenY: event.screenY,
          ctrlKey: event.ctrlKey,
          shiftKey: event.shiftKey,
          altKey: event.altKey,
          metaKey: event.metaKey,
          button: event.button,
        }),
      );
      if (
        target instanceof HTMLElement &&
        target.matches("input, textarea, select, [contenteditable]")
      ) {
        target.focus();
      }
    } finally {
      forwarding = false;
    }
  }
  content.addEventListener("click", onClick, true);

  function caretAt(
    x: number,
    y: number,
  ): { node: Node; offset: number } | null {
    const doc = document as Document & {
      caretPositionFromPoint?: (
        x: number,
        y: number,
      ) => { offsetNode: Node; offset: number } | null;
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
    };
    if (typeof doc.caretPositionFromPoint === "function") {
      const c = doc.caretPositionFromPoint(x, y);
      return c ? { node: c.offsetNode, offset: c.offset } : null;
    }
    const r = doc.caretRangeFromPoint?.(x, y);
    return r ? { node: r.startContainer, offset: r.startOffset } : null;
  }

  function remapped(event: MouseEvent): { x: number; y: number } | null {
    const local = clientToLocal(event.clientX, event.clientY);
    const { rect } = local;
    if (rect.width === 0 || rect.height === 0) return null;
    const mapped = mapPoint(local.x, local.y);
    if (mapped.alpha < 0.5) return null;
    const point = localToClient(mapped.x, mapped.y, rect);
    const tx = point.x;
    const ty = point.y;
    if (Math.hypot(tx - event.clientX, ty - event.clientY) < 1.5) return null;
    return { x: tx, y: ty };
  }

  let selecting = false;

  function onMouseDown(event: MouseEvent) {
    if (forwarding || !htmlInCanvas || event.button !== 0) return;
    const m = remapped(event);
    if (!m) return;
    event.preventDefault();
    const caret = caretAt(m.x, m.y);
    if (!caret || !content.contains(caret.node)) return;
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    sel.collapse(caret.node, caret.offset);
    selecting = true;
  }

  function onSelMove(event: MouseEvent) {
    if (!selecting) return;
    if (!(event.buttons & 1)) {
      selecting = false;
      return;
    }
    const m = remapped(event);
    const caret = m ? caretAt(m.x, m.y) : null;
    const sel = window.getSelection();
    if (caret && sel && sel.anchorNode && content.contains(caret.node)) {
      sel.extend(caret.node, caret.offset);
    }
  }

  function onSelEnd() {
    selecting = false;
  }

  content.addEventListener("mousedown", onMouseDown, true);
  window.addEventListener("mousemove", onSelMove, true);
  window.addEventListener("mouseup", onSelEnd, true);

  function onMotionChange() {
    reducedMotion = motionQuery.matches;
    start();
  }
  motionQuery.addEventListener("change", onMotionChange);

  const observer = createCanvasResizeObserver(() => {
    syncCanvasSize();
    syncScroll();
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
          ([key, value]) => config[key as keyof BendOptions] !== value,
        )
      )
        return;
      Object.assign(config, next);
      syncScroll();
      start();
    },
    resize() {
      syncCanvasSize();
      syncScroll();
      start();
    },
    destroy() {
      destroyed = true;
      rectCache.destroy();
      cancelAnimationFrame(raf);
      setHoverTarget(null);
      content.removeAttribute(CONTENT_ATTR);
      content.removeAttribute(CURSOR_ATTR);
      content.removeEventListener("scroll", onScroll);
      content.removeEventListener("wheel", onWheel);
      content.removeEventListener("pointermove", onPointerMove);
      content.removeEventListener("pointerleave", onPointerLeave);
      content.removeEventListener("click", onClick, true);
      content.removeEventListener("mousedown", onMouseDown, true);
      window.removeEventListener("mousemove", onSelMove, true);
      window.removeEventListener("mouseup", onSelEnd, true);
      observer.disconnect();
      intersection.disconnect();
      motionQuery.removeEventListener("change", onMotionChange);
      contentTexture?.destroy();
      screen?.dispose();
      if (htmlInCanvas) paintable.onpaint = null;
    },
  };
}
