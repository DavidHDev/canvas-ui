import { getCanvasPixelRatio, createCanvasResizeObserver } from "../canvas-viewport";
import { isHtmlInCanvasBlocked, prepareHtmlInCanvas, drawHtmlInCanvas } from "../html-in-canvas";
import {
  draw,
  effect,
  frame as gpuFrame,
  geometry,
  init,
  sampler,
  surface,
  type Draw,
  type Effect,
  type Geometry,
  type Gpu,
  type Surface,
} from "vgpu";
import type { Texture } from "vgpu";

export interface ParticleScrollOptions {
  /** Viewport fraction of the formation line. Content assembles as it scrolls up past this line and dissolves back below it. */
  point?: number;
  /** Height in CSS pixels of the transition band where particles progressively reassemble. */
  band?: number;
  /** Grain spacing in CSS pixels. Smaller values mean finer, denser sand. */
  density?: number;
  /** Size of fully scattered dust grains in CSS pixels. Grains grow to cover their cell as they land. */
  size?: number;
  /** Maximum distance in CSS pixels particles scatter from their home position. */
  spread?: number;
  /** Downward bias of the scattered cloud (-1 to 1), like sand settling. Negative values lift it. */
  gravity?: number;
  /** Idle float speed of scattered particles (0 to 1). 0 freezes the cloud. */
  drift?: number;
  /** Sideways arc in CSS pixels particles take while flying home. */
  swirl?: number;
  /** Per-particle randomness of reassembly timing (0 to 1). */
  stagger?: number;
  /** Opacity of fully scattered particles (0 to 1). */
  fade?: number;
  /** Seconds a row of dust takes to condense into the page once the reveal reaches it. */
  settle?: number;
  /** Seconds the damped scroll takes to catch up with the real scroll. Higher feels more fluid. */
  smoothing?: number;
}

export interface ParticleScrollElements {
  /** Canvas with layoutsubtree that hosts the HTML content. */
  source: HTMLCanvasElement;
  /** The scrollable element inside the source canvas that gets captured. */
  content: HTMLElement;
  /** Canvas the WebGPU effect renders to. */
  output: HTMLCanvasElement;
}

export interface ParticleScrollInstance {
  /** Update effect options live. */
  setOptions: (options: ParticleScrollOptions) => void;
  /** Re-read canvas size. Call when the element is resized. */
  resize: () => void;
  /** Stop the loop and release all GPU resources. */
  destroy: () => void;
}

const DEFAULTS: Required<ParticleScrollOptions> = {
  point: 0.68,
  band: 420,
  density: 2,
  size: 1.25,
  spread: 220,
  gravity: 0.35,
  drift: 0.7,
  swirl: 60,
  stagger: 0.7,
  fade: 0.85,
  settle: 1.2,
  smoothing: 0.6,
};

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

const BASE_SHADER = /* wgsl */ `
struct Params {
  bg: vec4f,
  res: vec2f,
  density: f32,
  rowCount: f32,
  stagger: f32,
  maxX: f32,
  cover: f32,
  scroll: f32,
  winStart: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var uContent: texture_2d<f32>;
@group(0) @binding(2) var uRowTex: texture_2d<f32>;
@group(0) @binding(3) var uSampler: sampler;

fn hash(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453123);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let px = uv * params.res;
  let cell = floor(vec2f(px.x, px.y + params.scroll) / params.density);
  let h1 = hash(cell);
  let d = h1 * params.stagger;
  let row = i32(clamp(cell.y - params.winStart, 0.0, params.rowCount - 1.0));
  let p = textureLoad(uRowTex, vec2i(row, 0), 0).r;
  let t = clamp((p - d) / max(1.0 - d, 1e-3), 0.0, 1.0);
  let vis = step(0.9995, t) * step(px.x, params.maxX * params.res.x);
  let tex = textureSampleLevel(uContent, uSampler, uv, 0.0);
  let color = mix(params.bg.rgb, tex.rgb, vis * tex.a);
  return vec4f(color * params.cover, params.cover);
}`;

const PARTICLE_SHADER = /* wgsl */ `
struct Params {
  res: vec2f,
  grid: vec2f,
  density: f32,
  stagger: f32,
  spread: f32,
  gravity: f32,
  drift: f32,
  swirl: f32,
  time: f32,
  fade: f32,
  size: f32,
  dpr: f32,
  maxX: f32,
  lag: f32,
  scroll: f32,
  winStart: f32,
}

struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) pointCoord: vec2f,
  @location(1) center: vec2f,
  @location(2) size: f32,
  @location(3) alpha: f32,
  @location(4) lod: f32,
  @location(5) merge: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var uRowTex: texture_2d<f32>;
@group(0) @binding(2) var uContent: texture_2d<f32>;
@group(0) @binding(3) var uSampler: sampler;

fn hash(p: vec2f) -> f32 {
  return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453123);
}

@vertex fn vs_main(
  @location(0) corner: vec2f,
  @builtin(instance_index) instance: u32,
) -> VSOut {
  var out: VSOut;
  let fid = f32(instance);
  let local = vec2f(
    fid - params.grid.x * floor(fid / params.grid.x),
    floor(fid / params.grid.x),
  );
  let cell = vec2f(local.x, local.y + params.winStart);
  let h1 = hash(cell);
  let h2 = hash(cell + vec2f(1.7, 9.1));
  let h3 = hash(cell + vec2f(5.5, 2.9));
  let h4 = hash(cell + vec2f(8.4, 4.2));
  let d = h1 * params.stagger;
  let home = vec2f(
    (cell.x + 0.5) * params.density,
    (cell.y + 0.5) * params.density - params.scroll,
  );
  let row = i32(clamp(local.y, 0.0, params.grid.y - 1.0));
  let p = textureLoad(uRowTex, vec2i(row, 0), 0).r;
  let t = clamp((p - d) / max(1.0 - d, 1e-3), 0.0, 1.0);
  let e = 1.0 - pow(1.0 - t, 3.0);
  let vis = (1.0 - step(0.9995, t))
    * step(home.x, params.maxX * params.res.x)
    * step(home.y, params.res.y)
    * step(-params.density, home.y);
  if (vis < 0.5) {
    out.pos = vec4f(2.0, 2.0, 2.0, 1.0);
    out.pointCoord = vec2f(0.0);
    out.center = vec2f(0.0);
    out.size = 0.0;
    out.alpha = 0.0;
    out.lod = 0.0;
    out.merge = 0.0;
    return out;
  }

  let dir = normalize(vec2f(h2 - 0.5, h3 - 0.5) + vec2f(1e-4, 0.0));
  let reach = 0.08 + 0.92 * pow(h4, 2.4);
  var off = dir * params.spread * reach;
  off.y += params.gravity * params.spread * (0.25 + 0.75 * h4);
  let scat = home + off;
  var pos = mix(scat, home, e);
  let perp = vec2f(-dir.y, dir.x);
  pos += perp * (h2 - 0.5) * 2.0 * params.swirl * sin(e * 3.14159);
  let tt = params.time * params.drift;
  let amp = (1.0 - e) * (params.spread * 0.05 + 2.5);
  pos += vec2f(
    sin(tt * (4.0 + 5.0 * h2) + h3 * 40.0),
    cos(tt * (3.5 + 5.5 * h3) + h2 * 40.0),
  ) * amp;
  pos.y += params.lag * (1.0 - e) * (0.5 + 0.5 * h4);
  pos += vec2f(h4 - 0.5, h1 - 0.5) * params.density * 3.0
    * (1.0 - smoothstep(0.5, 0.85, t));
  let grow = smoothstep(0.55, 1.0, e);
  let sizeCss = mix(params.size, params.density * 1.3, grow);
  let pointCss = max(sizeCss, 1.0 / max(params.dpr, 1e-3));
  let quadPos = pos + corner * pointCss;

  out.center = home;
  out.size = sizeCss;
  out.alpha = mix(params.fade, 1.0, e);
  out.lod = (1.0 - e) * 1.5;
  out.merge = smoothstep(0.75, 0.97, t);
  out.pointCoord = corner + vec2f(0.5);
  out.pos = vec4f(
    quadPos.x / params.res.x * 2.0 - 1.0,
    1.0 - quadPos.y / params.res.y * 2.0,
    0.0,
    1.0,
  );
  return out;
}

@fragment fn fs_main(in: VSOut) -> @location(0) vec4f {
  let o = in.pointCoord - vec2f(0.5);
  let uv = clamp((in.center + o * in.size) / params.res, vec2f(0.0), vec2f(1.0));
  let tex = textureSampleLevel(uContent, uSampler, uv, in.lod);
  let circle = 1.0 - smoothstep(0.25, 0.5, length(o));
  let mask = mix(circle, 1.0, in.merge);
  let a = in.alpha * mask * tex.a;
  if (a < 0.01) { discard; }
  return vec4f(tex.rgb, a);
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

/** One WebGPU device per page, shared by every ParticleScroll instance. */
function acquireGpu(): Promise<Gpu> {
  if (!sharedGpu) {
    sharedGpu = init().catch((error) => {
      sharedGpu = null;
      throw error;
    });
  }
  return sharedGpu;
}

export function createParticleScroll(
  elements: ParticleScrollElements,
  options: ParticleScrollOptions = {},
): ParticleScrollInstance | null {
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

  // No particle renderer is available without a DOM capture. Leave the plain
  // HTML fallback to the browser without creating a GPU overlay.
  if (!htmlInCanvas) return null;

  prepareHtmlInCanvas(source, content);

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
  let baseFx: Effect | null = null;
  let particleDraw: Draw | null = null;
  let particleGeometry: Geometry | null = null;
  let contentTexture: Texture | null = null;
  let rowTexture: Texture | null = null;
  let linearSampler: GPUSampler | null = null;
  let mipmapLayout: GPUBindGroupLayout | null = null;
  let mipmapPipeline: GPURenderPipeline | null = null;
  let fallback2d: CanvasRenderingContext2D | null = null;

  let contentMaxX = 1;
  let dprNow = 1;
  let rowProgress = new Float32Array(0);
  let rowWindow = new Float32Array(0);
  let rowsAnimating = false;
  let rowsAssembled = false;

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

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reducedMotion = motionQuery.matches;

  let time = 0;
  let introDone = false;
  let introWait = 0;
  let introReady = false;
  let scrollSmooth = content.scrollTop;
  syncCanvasSize();
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
        label: "particle-scroll.content",
      });
    }
    return contentTexture;
  }

  function ensureRowTexture(winLen: number): Texture {
    const w = Math.max(1, winLen);
    if (!rowTexture || rowTexture.size[0] !== w) {
      // A new wrapper invalidates vgpu's cached bindings to the old texture.
      rowTexture?.destroy();
      rowTexture = gpu!.device.createTexture({
        size: [w, 1],
        format: "r32float",
        usage: ["texture_binding", "copy_dst"],
        label: "particle-scroll.rows",
      });
    }
    return rowTexture;
  }

  function ensureMipmapPipeline(): GPURenderPipeline | null {
    if (!gpu || !linearSampler) return null;
    if (!mipmapLayout) {
      mipmapLayout = gpu.gpu.createBindGroupLayout({
        label: "particle-scroll.mipmap.layout",
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
        label: "particle-scroll.mipmap",
        code: MIPMAP_SHADER,
      });
      mipmapPipeline = gpu.gpu.createRenderPipeline({
        label: "particle-scroll.mipmap",
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
    const encoder = gpu.gpu.createCommandEncoder({ label: "particle-scroll.mipmap" });
    for (let level = 1; level < texture.mipLevelCount; level++) {
      const bindGroup = gpu.gpu.createBindGroup({
        label: "particle-scroll.mipmap",
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
        label: "particle-scroll.mipmap",
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
    introReady = true;
    syncBgColor();
    const texture = ensureContentTexture();
    gpu.gpu.queue.copyExternalImageToTexture(
      { source },
      { texture: texture.gpu },
      [source.width, source.height],
    );
    generateMipmaps(texture);
    baseFx!.set({ uContent: texture });
    particleDraw!.set({ uContent: texture });
  }

  function rowTargetFor(docRowY: number) {
    if (reducedMotion || !introDone) return 1;
    const h = Math.max(output.clientHeight, 1);
    const band = Math.max(config.band, 1);
    const max = content.scrollHeight - content.clientHeight;
    let line = Math.min(Math.max(config.point, 0), 1) * h;
    if (max <= 1) {
      line = h + band;
    } else {
      const endP = Math.min(
        Math.max((scrollSmooth - (max - h * 0.5)) / (h * 0.5), 0),
        1,
      );
      line += (h + band - line) * endP * endP;
    }
    const vy = docRowY - scrollSmooth;
    return Math.min(Math.max((line + band - vy) / band, 0), 1);
  }

  function updateRows(
    dt: number,
    density: number,
    winStart: number,
    winLen: number,
  ) {
    const docRows = Math.max(1, Math.ceil(content.scrollHeight / density));
    if (rowProgress.length !== docRows) {
      const next = new Float32Array(docRows);
      for (let i = 0; i < docRows; i++) {
        next[i] = rowTargetFor((i + 0.5) * density);
      }
      rowProgress = next;
    }
    if (rowWindow.length !== winLen) rowWindow = new Float32Array(winLen);
    rowsAnimating = false;
    let minP = 1;
    const settle = Math.max(config.settle, 0.05);
    for (let i = 0; i < docRows; i++) {
      const target = rowTargetFor((i + 0.5) * density);
      let p = rowProgress[i];
      const inWin = i >= winStart - 4 && i < winStart + winLen + 4;
      if (p !== target) {
        if (reducedMotion || !inWin) {
          p = target;
        } else {
          if (p < target) p = Math.min(p + dt / settle, target);
          else p = Math.max(p - dt / (settle * 0.6), target);
          if (p !== target) rowsAnimating = true;
        }
        rowProgress[i] = p;
      }
      if (inWin && p < minP) minP = p;
    }
    rowsAssembled = minP >= 0.9995;
    rowWindow.fill(1);
    const from = Math.min(Math.max(winStart, 0), docRows);
    const to = Math.min(winStart + winLen, docRows);
    if (to > from)
      rowWindow.set(rowProgress.subarray(from, to), from - winStart);
    const texture = ensureRowTexture(winLen);
    gpu!.gpu.queue.writeTexture(
      { texture: texture.gpu },
      rowWindow,
      {},
      [winLen, 1],
    );
    baseFx!.set({ uRowTex: texture });
    particleDraw!.set({ uRowTex: texture });
  }

  function render(dt: number) {
    if (!gpu || !screen || !baseFx || !particleDraw) return;
    uploadContent();
    const w = Math.max(output.clientWidth, 1);
    const h = Math.max(output.clientHeight, 1);
    const density = Math.max(
      Math.max(config.density, 1),
      Math.sqrt((w * h) / 800000),
    );
    const scrollTop = content.scrollTop;
    const gridX = Math.ceil(w / density);
    const winStart = Math.floor(scrollTop / density);
    const winLen = Math.ceil(h / density) + 2;
    const stagger = Math.min(Math.max(config.stagger, 0), 0.95);
    updateRows(dt, density, winStart, winLen);

    baseFx.set({
      params: {
        bg: [bg[0], bg[1], bg[2], 0],
        res: [w, h],
        density,
        rowCount: winLen,
        stagger,
        maxX: contentMaxX,
        cover: htmlInCanvas ? 1 : 0,
        scroll: scrollTop,
        winStart,
      },
    });
    if (!htmlInCanvas || rowsAssembled) {
      gpuFrame(gpu, (f) => f.pass(screen!, baseFx!));
      return;
    }
    particleDraw.set({
      params: {
        res: [w, h],
        grid: [gridX, winLen],
        density,
        stagger,
        spread: Math.max(config.spread, 0),
        gravity: Math.min(Math.max(config.gravity, -1), 1),
        drift: Math.max(config.drift, 0),
        swirl: Math.max(config.swirl, 0),
        time,
        fade: Math.min(Math.max(config.fade, 0), 1),
        size: Math.max(config.size, 0.5),
        dpr: dprNow,
        maxX: contentMaxX,
        lag,
        scroll: scrollTop,
        winStart,
      },
    });
    const target = screen;
    gpuFrame(gpu, (fr) => {
      fr.pass(target, baseFx!);
      fr.pass({ target, clear: false }, (pass) => {
        pass.draw(particleDraw!, { instances: gridX * winLen });
      });
    });
  }

  /** Without a GPU device the page still has to show: blit the capture as-is. */
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
  let lag = 0;
  let lastScrollTop = content.scrollTop;

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
    const scrollTop = content.scrollTop;
    lag += scrollTop - lastScrollTop;
    lastScrollTop = scrollTop;
    lag *= Math.exp(-delta / 0.22);
    lag = Math.min(Math.max(lag, -400), 400);
    if (reducedMotion || Math.abs(lag) < 0.1) lag = 0;
    if (!introDone) {
      if (reducedMotion || !htmlInCanvas) introDone = true;
      else if (introReady) {
        introWait += delta;
        if (introWait >= 1) introDone = true;
      }
    }
    const tau = config.smoothing;
    const k =
      reducedMotion || tau <= 0
        ? 1
        : 1 - Math.exp(-delta / Math.max(tau, 1e-4));
    scrollSmooth += (scrollTop - scrollSmooth) * k;
    if (Math.abs(scrollTop - scrollSmooth) < 0.5) scrollSmooth = scrollTop;
    render(delta);
    if (
      !contentDirty &&
      scrollSmooth === scrollTop &&
      !rowsAnimating &&
      rowsAssembled &&
      introDone &&
      lag === 0
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
        label: "particle-scroll",
      });
      const linear = sampler(gpu, {
        minFilter: "linear",
        magFilter: "linear",
        mipmapFilter: "linear",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
      });
      linearSampler = linear;
      contentTexture = ensureContentTexture();
      rowTexture = ensureRowTexture(1);
      baseFx = effect(gpu, BASE_SHADER, {
        label: "particle-scroll.base",
        set: {
          uSampler: linear,
          uContent: contentTexture,
          uRowTex: rowTexture,
        },
      });
      particleGeometry = geometry(gpu, {
        buffers: [
          {
            data: new Float32Array([-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5]),
            attributes: { corner: "float32x2" },
          },
        ],
        vertexCount: 4,
        topology: "triangle-strip",
        label: "particle-scroll.quads",
      });
      particleDraw = draw(gpu, {
        shader: PARTICLE_SHADER,
        geometry: particleGeometry,
        blend: {
          color: { src: "src-alpha", dst: "one-minus-src-alpha" },
          alpha: { src: "zero", dst: "one" },
        },
        label: "particle-scroll.particles",
        set: {
          uSampler: linear,
          uContent: contentTexture,
          uRowTex: rowTexture,
        },
      });
      syncCanvasSize();
      start();
    })
    .catch((error) => {
      if (destroyed) return;
      console.warn(
        "ParticleScroll: WebGPU unavailable, showing content without the effect.",
        error,
      );
      fallback2d = output.getContext("2d");
      contentDirty = true;
      start();
    });

  function onScroll() {
    if (htmlInCanvas) paintable.requestPaint!();
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
          ([key, value]) =>
            config[key as keyof ParticleScrollOptions] !== value,
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
      contentTexture?.destroy();
      rowTexture?.destroy();
      particleGeometry?.destroy();
      screen?.dispose();
      if (htmlInCanvas) paintable.onpaint = null;
    },
  };
}
