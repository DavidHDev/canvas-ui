import { getCanvasPixelRatio, createCanvasResizeObserver } from "../canvas-viewport";
import { isHtmlInCanvasBlocked, prepareHtmlInCanvas, drawHtmlInCanvas } from "../html-in-canvas";
import { createRectCache } from "../rect-cache";
import {
  draw,
  effect as gpuEffect,
  frame as gpuFrame,
  geometry,
  init,
  sampler,
  surface,
  target as gpuTarget,
  type Draw,
  type Effect,
  type Geometry,
  type Gpu,
  type Surface,
  type Target,
  type Texture,
} from "vgpu";
import { resolveOptions } from "../options";

export type ClothPin = "top" | "corners" | "left" | "right" | "bottom" | "none";

export interface ClothOptions {
  /** Where the cloth hangs from: a whole edge, its two top corners, or nothing at all (it floats and eases back flat). */
  pin?: ClothPin;
  /** Wind blowing through the fabric (0 to 1). */
  wind?: number;
  /** How stiff the fabric is, from silk (0) to canvas (1). */
  stiffness?: number;
  /** How firmly the cloth pulls itself back flat after you let go (0 to 1). */
  settle?: number;
  /** Grab the cloth and drag it around. Text selection, links, buttons and inputs still work as usual. */
  drag?: boolean;
  /** The cloth stays wherever you drag and fold it instead of falling back. Wind is ignored while floating. */
  float?: boolean;
  /** How much the fabric follows the cursor as it brushes past (0 to 1). */
  brush?: number;
  /** Strength of the light and shade across the folds (0 to 1). */
  light?: number;
  /** Soft sheen on the fabric where it turns toward the light (0 to 1). */
  sheen?: number;
  /** Visibility of the woven thread texture (0 to 1). */
  weave?: number;
  /** Opacity of the shadow the cloth casts on the wall behind it (0 to 1). */
  shadow?: number;
  /** Corner radius of the fabric in CSS pixels. */
  cornerRadius?: number;
  /** Fabric color behind transparent content and on the back side, as RGB in the 0 to 1 range, or "auto" to sample the page background. */
  backing?: [number, number, number] | "auto";
  /** Perspective focal length in CSS pixels. Lower exaggerates the depth. */
  perspective?: number;
  /** Simulation speed multiplier. */
  speed?: number;
}

export interface ClothElements {
  source: HTMLCanvasElement;
  content: HTMLElement;
  output: HTMLCanvasElement;
}

export interface ClothInstance {
  setOptions: (options: ClothOptions) => void;
  resize: () => void;
  destroy: () => void;
}

const DEFAULTS: Required<ClothOptions> = {
  pin: "top",
  wind: 0.25,
  stiffness: 0.5,
  settle: 0.3,
  drag: true,
  float: false,
  brush: 0.4,
  light: 0.6,
  sheen: 0.35,
  weave: 0.3,
  shadow: 0.4,
  cornerRadius: 16,
  backing: "auto",
  perspective: 1400,
  speed: 1,
};

/* Simulation. The cloth is a grid of particles joined by springs that hold
   their length (along the grid, across its diagonals and two apart for
   bending), integrated with Verlet and relaxed several times per step.
   Tethers to the pinned edge keep it from sagging, so the page on it never
   stretches. Folding is never written down: grab one point and the rest
   follows because the springs will not give. */
const CELL = 26;
const MAX_NODES = 1500;
const STEP = 1 / 120;
const ITERATIONS = 10;
const GRAVITY = 1400;
const CREASE = 0.5;
const SUBDIVIDE = 4;
const BASE_BLEED = 72;
const MAX_BLEED = 960;
const COLLIDE = 0.7;
const SHADOW_SCALE = 1 / 3;
const WEAVE_PX = 3.2;

const NEIGHBOURS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
] as const;

const INTERACTIVE =
  "a, button, input, textarea, select, label, summary, video, audio, [contenteditable=''], [contenteditable='true'], [role='button'], [role='link'], [role='slider'], [role='tab'], [role='checkbox'], [role='switch']";

type PaintableCanvas = HTMLCanvasElement & {
  onpaint?: (() => void) | null;
  requestPaint?: () => void;
};

type ElementImageContext = CanvasRenderingContext2D & {
  drawElementImage?: (element: Element, x: number, y: number) => void;
};

/* The WebGL engine's programs in WGSL. The simulation lives on the CPU and
   reaches the GPU as three cols x rows float textures (position, normal plus
   cavity, broad normal), read with textureLoad like the GLSL's texelFetch,
   and the vertex stage rebuilds a smooth Catmull-Rom surface from them. */
const SURFACE = `
fn weights(t: f32) -> vec4f {
  let t2 = t * t;
  let t3 = t2 * t;
  return 0.5 * vec4f(-t3 + 2.0 * t2 - t, 3.0 * t3 - 5.0 * t2 + 2.0, -3.0 * t3 + 4.0 * t2 + t, t3 - t2);
}

fn node(tex: texture_2d<f32>, c: vec2i, grid: vec2i) -> vec4f {
  let last = grid - 1;
  let inside = clamp(c, vec2i(0), last);
  var value = textureLoad(tex, inside, 0);
  let over = c - inside;
  if (over.x != 0 || over.y != 0) {
    value = 2.0 * value - textureLoad(tex, clamp(inside - over, vec2i(0), last), 0);
  }
  return value;
}

fn rowAt(tex: texture_2d<f32>, o: vec2i, dy: i32, wx: vec4f, grid: vec2i) -> vec4f {
  return wx.x * node(tex, o + vec2i(-1, dy), grid)
    + wx.y * node(tex, o + vec2i(0, dy), grid)
    + wx.z * node(tex, o + vec2i(1, dy), grid)
    + wx.w * node(tex, o + vec2i(2, dy), grid);
}

fn surface(tex: texture_2d<f32>, g: vec2f, grid: vec2i) -> vec4f {
  let base = floor(g);
  let f = g - base;
  let o = vec2i(base);
  let wx = weights(f.x);
  let wy = weights(f.y);
  return wy.x * rowAt(tex, o, -1, wx, grid)
    + wy.y * rowAt(tex, o, 0, wx, grid)
    + wy.z * rowAt(tex, o, 1, wx, grid)
    + wy.w * rowAt(tex, o, 2, wx, grid);
}
`;

const SDF = `
fn fabricDist(p: vec2f, size: vec2f, radius: f32) -> f32 {
  let halfSize = size * 0.5;
  let r = min(radius, min(halfSize.x, halfSize.y));
  let q = abs(p - halfSize) - (halfSize - vec2f(r));
  return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - r;
}
`;

const CLOTH_SHADER = `
struct ClothParams {
  backing: vec4f,
  grid: vec2f,
  cell: vec2f,
  center: vec2f,
  view: vec2f,
  size: vec2f,
  focal: f32,
  bleed: f32,
  maxX: f32,
  radius: f32,
  light: f32,
  sheen: f32,
  weave: f32,
  dark: f32,
}

struct ClothOut {
  @builtin(position) position: vec4f,
  @location(0) rest: vec2f,
  @location(1) world: vec3f,
  @location(2) normal: vec3f,
  @location(3) broad: vec3f,
  @location(4) cavity: f32,
}

@group(0) @binding(0) var<uniform> params: ClothParams;
@group(0) @binding(1) var uPos: texture_2d<f32>;
@group(0) @binding(2) var uNrm: texture_2d<f32>;
@group(0) @binding(3) var uBroad: texture_2d<f32>;
@group(0) @binding(4) var uContent: texture_2d<f32>;
@group(0) @binding(5) var uSampler: sampler;
${SURFACE}
${SDF}
fn diffuseOf(n: vec3f, l: vec3f) -> f32 {
  return max((dot(n, l) + 0.3) / 1.3, 0.04);
}

@vertex fn vs_main(@location(0) aGrid: vec2f) -> ClothOut {
  let grid = vec2i(params.grid);
  let p = surface(uPos, aGrid, grid).xyz;
  let n = surface(uNrm, aGrid, grid);
  var out: ClothOut;
  out.broad = surface(uBroad, aGrid, grid).xyz;
  let k = params.focal / max(params.focal - p.z, 1.0);
  let screen = params.center + (p.xy - params.center) * k + vec2f(params.bleed);
  let ndc = screen / params.view * 2.0 - 1.0;
  out.rest = aGrid * params.cell;
  out.world = p;
  out.normal = n.xyz;
  out.cavity = n.w;
  // GL clip depth spans -1..1, WebGPU's 0..1: same ordering, remapped.
  let depth = clamp(-p.z / (params.focal * 1.5), -0.999, 0.999);
  out.position = vec4f(ndc.x, -ndc.y, depth * 0.5 + 0.5, 1.0);
  return out;
}

@fragment fn fs_main(in: ClothOut) -> @location(0) vec4f {
  let d = fabricDist(in.rest, params.size, params.radius);
  let thread = in.rest * (6.2831853 / ${WEAVE_PX.toFixed(2)});
  // Derivatives are taken before the discard, while control flow is uniform.
  let threadWidth = max(fwidth(thread.x), fwidth(thread.y));
  let alpha = clamp(0.5 - d / max(fwidth(d), 0.001), 0.0, 1.0);
  if (alpha <= 0.002) {
    discard;
  }

  let uv = clamp(in.rest / params.size, vec2f(0.0005), vec2f(params.maxX - 0.0005, 0.9995));
  let page = textureSampleLevel(uContent, uSampler, uv, 0.0);
  var face = mix(params.backing.rgb, page.rgb, page.a);

  var n = normalize(in.normal);
  var broad = normalize(in.broad);
  let view = normalize(vec3f(params.center - in.world.xy, params.focal - in.world.z));
  let back = dot(n, view) < 0.0;
  if (back) {
    n = -n;
    broad = -broad;
    face = mix(params.backing.rgb * 0.94, face, 0.1);
  }

  let detail = clamp(1.6 - threadWidth * 0.9, 0.0, 1.0) * params.weave;
  let over = step(0.0, sin(thread.x * 0.5) * sin(thread.y * 0.5));
  let bump = vec2f(cos(thread.x) * mix(0.35, 1.0, over), cos(thread.y) * mix(1.0, 0.35, over)) * 0.2 * detail;
  let woven = normalize(n + vec3f(bump, 0.0));
  let wovenBroad = normalize(broad + vec3f(bump, 0.0));
  face *= 1.0 + detail * 0.04 * cos(thread.x) * cos(thread.y);

  /* Light the folds, not the page: shading is measured against the cloth's
     broad orientation, so a sheet tipped by the wind keeps its colors and
     only creases, curls and the back side change. */
  let lightDir = normalize(vec3f(-0.42, -0.55, 0.72));
  let fold = diffuseOf(woven, lightDir) / diffuseOf(wovenBroad, lightDir);
  let tilt = diffuseOf(broad, lightDir) / diffuseOf(vec3f(0.0, 0.0, 1.0), lightDir);
  var shade = fold * mix(1.0, tilt, 0.35);
  shade *= clamp(1.0 - in.cavity * 0.7, 0.6, 1.0);
  if (shade > 1.0) {
    shade = 1.0 + (shade - 1.0) * 0.25;
  }
  shade = mix(1.0, shade, params.light);
  if (back) {
    shade *= mix(1.0, 0.92, params.light);
  }

  var color = face * shade;

  let halfway = normalize(lightDir + view);
  let spec = max(pow(max(dot(woven, halfway), 0.0), 40.0) - pow(max(dot(broad, halfway), 0.0), 40.0), 0.0);
  let rim = max(pow(1.0 - max(dot(n, view), 0.0), 3.0) - pow(1.0 - max(dot(broad, view), 0.0), 3.0), 0.0);
  color += params.sheen * (spec * 0.35 + rim * 0.35 * (0.4 + 0.6 * max(dot(n, lightDir), 0.0)))
    * mix(vec3f(1.0), face, 0.3) * mix(1.0, 0.8, params.dark);

  let hem = smoothstep(0.0, 4.0, -d);
  color *= mix(1.0, mix(0.92, 1.0, hem), params.light * (1.0 - 0.6 * params.dark));

  return vec4f(clamp(color, vec3f(0.0), vec3f(1.0)) * alpha, alpha);
}`;

const SHADOW_SHADER = `
struct ShadowParams {
  grid: vec2f,
  cell: vec2f,
  view: vec2f,
  shift: vec2f,
  size: vec2f,
  bleed: f32,
  radius: f32,
}

struct ShadowOut {
  @builtin(position) position: vec4f,
  @location(0) rest: vec2f,
  @location(1) lift: f32,
}

@group(0) @binding(0) var<uniform> params: ShadowParams;
@group(0) @binding(1) var uPos: texture_2d<f32>;
${SURFACE}
${SDF}
@vertex fn vs_main(@location(0) aGrid: vec2f) -> ShadowOut {
  let p = surface(uPos, aGrid, vec2i(params.grid)).xyz;
  let lift = max(p.z, 0.0);
  let screen = p.xy + params.shift * (lift + 6.0) + vec2f(params.bleed);
  let ndc = screen / params.view * 2.0 - 1.0;
  var out: ShadowOut;
  out.rest = aGrid * params.cell;
  out.lift = lift;
  out.position = vec4f(ndc.x, -ndc.y, 0.0, 1.0);
  return out;
}

@fragment fn fs_main(in: ShadowOut) -> @location(0) vec4f {
  let d = fabricDist(in.rest, params.size, params.radius);
  let a = clamp(0.5 - d, 0.0, 1.0) * mix(1.0, 0.45, clamp(in.lift / 260.0, 0.0, 1.0));
  return vec4f(a);
}`;

const BLUR_SHADER = `
struct BlurParams {
  dir: vec2f,
}

@group(0) @binding(0) var<uniform> params: BlurParams;
@group(0) @binding(1) var uTex: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

fn tap(uv: vec2f) -> f32 {
  return textureSampleLevel(uTex, uSampler, uv, 0.0).a;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  var total = tap(uv) * 0.2270;
  total += (tap(uv + params.dir * 1.3846) + tap(uv - params.dir * 1.3846)) * 0.3162;
  total += (tap(uv + params.dir * 3.2308) + tap(uv - params.dir * 3.2308)) * 0.0703;
  return vec4f(total);
}`;

/* The WebGL engine draws the blurred shadow onto the cleared canvas and then
   blends the cloth over it. Here the cloth goes to its own multisampled,
   depth-tested target first and is laid over the shadow in this pass, which
   gives the same picture: "over" is associative. */
const COMPOSITE_SHADER = `
struct CompositeParams {
  shadow: f32,
}

@group(0) @binding(0) var<uniform> params: CompositeParams;
@group(0) @binding(1) var uScene: texture_2d<f32>;
@group(0) @binding(2) var uShadow: texture_2d<f32>;
@group(0) @binding(3) var uSampler: sampler;

@fragment fn fs_main(@builtin(position) position: vec4f, @location(0) uv: vec2f) -> @location(0) vec4f {
  let cloth = textureLoad(uScene, vec2i(position.xy), 0);
  let shade = textureSampleLevel(uShadow, uSampler, uv, 0.0).a * params.shadow;
  return vec4f(cloth.rgb, cloth.a + shade * (1.0 - cloth.a));
}`;

const HOVER_ATTR = "data-canvasui-hover";
const CONTENT_ATTR = "data-canvasui-content";
const CURSOR_ATTR = "data-canvasui-cursor";
const NATIVE_ATTR = "data-canvasui-cursor-native";
const HOVER_REWRITE = `:is([${HOVER_ATTR}], :hover:where(:not([${CONTENT_ATTR}], [${CONTENT_ATTR}] *)))`;
const CURSOR_KEYWORDS = new Set(
  "auto default none context-menu help pointer progress wait cell crosshair text vertical-text alias copy move no-drop not-allowed grab grabbing all-scroll col-resize row-resize n-resize e-resize s-resize w-resize ne-resize nw-resize se-resize sw-resize ew-resize ns-resize nesw-resize nwse-resize zoom-in zoom-out".split(" "),
);

/* Hover follows the drawn page, not the flat layout: every :hover rule is
   rewritten so that inside the cloth it matches an attribute the engine
   sets on the element under the pointer, while hover elsewhere is
   untouched. The same rewrite Bend uses, so they share one pass. */
function patchHoverRules() {
  if (typeof document === "undefined") return;
  if (document.documentElement.dataset.canvasuiHoverRules !== "") {
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
  /* The cursor is forced on the one element under the real pointer. Its
     children are pinned to the cursor they had before, so the change stops
     there instead of restyling everything below it (a whole page under the
     cloth took ~10ms per change). The rules sit in the first, lowest layer so
     any page rule still wins, and skip the elements the browser gives their
     own cursor. */
  if (!document.documentElement.hasAttribute("data-canvasui-cursor-rules")) {
    document.documentElement.setAttribute("data-canvasui-cursor-rules", "");
    const style = document.createElement("style");
    const own = ":any-link, button, input, textarea, select, option, label";
    style.textContent = `@layer canvasui-cursor {\n${Array.from(
      CURSOR_KEYWORDS,
      (cursor) => `:where([${NATIVE_ATTR}="${cursor}"]) > :where(:not(${own})) { cursor: ${cursor}; }`,
    ).join("\n")}\n}`;
    document.head.prepend(style);
  }
}

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

export function supportsWebGPU(): boolean {
  return typeof navigator !== "undefined" && Boolean(navigator.gpu);
}

/* One device per page, shared by every instance and never disposed. */
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
  (value as unknown as { destroy?: () => void } | null)?.destroy?.();
}

/** Smooth value noise for the wind's gusts. */
function windNoise(x: number, y: number) {
  return (
    Math.sin(x * 1.7 + Math.sin(y * 1.3) * 1.1) * 0.5 +
    Math.sin(y * 2.3 - x * 0.9 + 1.7) * 0.3 +
    Math.sin((x + y) * 3.1 + 0.4) * 0.2
  );
}

export function createCloth(
  elements: ClothElements,
  options: ClothOptions = {},
): ClothInstance | null {
  if (!supportsWebGPU()) return null;
  try {
    return initializeCloth(elements, options);
  } catch (error) {
    console.error("Cloth initialization failed:", error);
    return null;
  }
}

type Size = [number, number];

function initializeCloth(
  elements: ClothElements,
  options: ClothOptions,
): ClothInstance | null {
  const config = { ...DEFAULTS, ...resolveOptions(DEFAULTS, options) };
  const { source, content, output } = elements;
  const wrapper = (output.parentElement ?? output) as HTMLElement;
  let bleed = 0;
  function styleBleed(next: number) {
    bleed = next;
    output.style.top = `${-bleed}px`;
    output.style.left = `${-bleed}px`;
    output.style.right = `${-bleed}px`;
    output.style.bottom = `${-bleed}px`;
    output.style.width = `calc(100% + ${bleed * 2}px)`;
    output.style.height = `calc(100% + ${bleed * 2}px)`;
  }
  styleBleed(BASE_BLEED);

  const sourceCtx = source.getContext("2d") as ElementImageContext | null;
  const paintable = source as PaintableCanvas;
  const htmlInCanvas = Boolean(
    !isHtmlInCanvasBlocked() &&
    source.contains(content) &&
    sourceCtx &&
    typeof sourceCtx.drawElementImage === "function" &&
    typeof paintable.requestPaint === "function",
  );
  if (!htmlInCanvas) return null;

  prepareHtmlInCanvas(source, content);

  let wake = () => {};
  let capture = () => {};
  paintable.onpaint = () => capture();

  /* GPU resources arrive asynchronously (init() is async, createCloth is
     not); until they do, frames skip and the capture stays on the source
     canvas so the page is visible flat. */
  let gpu: Gpu | null = null;
  let screen: Surface | null = null;
  let failed = false;
  let contentTexture: Texture | null = null;
  let posTexture: Texture | null = null;
  let nrmTexture: Texture | null = null;
  let broadTexture: Texture | null = null;
  let mesh: Geometry | null = null;
  let meshCols = 0;
  let meshRows = 0;
  let meshVerts = new Float32Array(0);
  let meshIndices = new Uint32Array(0);
  let clothDraw: Draw | null = null;
  let shadowDraw: Draw | null = null;
  let blurAcross: Effect | null = null;
  let blurDown: Effect | null = null;
  let compositeFx: Effect | null = null;
  let sceneTarget: Target | null = null;
  let shadowTargets: Target[] = [];
  let outputSize: Size = [1, 1];
  let shadowSize: Size = [1, 1];
  let contentDirty = false;
  let uploadWarned = false;

  function linearSampler() {
    return sampler(gpu!, {
      minFilter: "linear",
      magFilter: "linear",
      addressModeU: "clamp-to-edge",
      addressModeV: "clamp-to-edge",
    });
  }

  function sizeTarget(value: Target | null, [w, h]: Size) {
    if (value && (value.size[0] !== w || value.size[1] !== h)) value.resize([w, h]);
  }

  function sizeTargets() {
    sizeTarget(sceneTarget, outputSize);
    for (const t of shadowTargets) sizeTarget(t, shadowSize);
  }

  let contentMaxX = 1;

  function uploadContent() {
    if (!gpu) return;
    contentDirty = false;
    const w = Math.max(1, source.width);
    const h = Math.max(1, source.height);
    try {
      if (!contentTexture || contentTexture.size[0] !== w || contentTexture.size[1] !== h) {
        contentTexture?.destroy();
        contentTexture = gpu.device.createTexture({
          size: [w, h],
          format: "rgba8unorm",
          usage: ["texture_binding", "copy_dst", "render_attachment"],
          label: "cloth.content",
        });
        clothDraw?.set({ uContent: contentTexture });
      }
      gpu.gpu.queue.copyExternalImageToTexture({ source }, { texture: contentTexture.gpu }, [w, h]);
      uploadWarned = false;
    } catch (error) {
      if (!uploadWarned) {
        uploadWarned = true;
        console.warn("Cloth could not upload its content texture:", error);
      }
    }
  }

  capture = () => {
    try {
      sourceCtx!.reset();
      drawHtmlInCanvas(source, sourceCtx!, content);
      /* Without a device the capture is left on the source canvas, so the
         page shows flat: under layoutsubtree the DOM paints nothing. */
      if (gpu) {
        uploadContent();
        sourceCtx!.reset();
      } else {
        contentDirty = true;
      }
      wake();
    } catch {}
  };

  /* ── the cloth ── */
  let cols = 0;
  let rows = 0;
  let count = 0;
  let width = 0;
  let height = 0;
  let cellX = 1;
  let cellY = 1;
  let pos = new Float32Array(0);
  let prev = new Float32Array(0);
  let rest = new Float32Array(0);
  let invMass = new Float32Array(0);
  let normals = new Float32Array(0);
  let rough = new Float32Array(0);
  let broad = new Float32Array(0);
  let baseLength = new Float32Array(0);
  let packed = new Float32Array(0);
  let linkA = new Int32Array(0);
  let linkB = new Int32Array(0);
  let linkLength = new Float32Array(0);
  let linkKind = new Uint8Array(0);
  let tether = new Int32Array(0);
  let tetherLength = new Float32Array(0);
  let gravityX = 0;
  let gravityY = 0;

  function buildCloth() {
    width = Math.max(wrapper.clientWidth, 1);
    height = Math.max(wrapper.clientHeight, 1);
    cols = Math.max(8, Math.round(width / CELL) + 1);
    rows = Math.max(8, Math.round(height / CELL) + 1);
    const over = (cols * rows) / MAX_NODES;
    if (over > 1) {
      const shrink = Math.sqrt(over);
      cols = Math.max(8, Math.floor(cols / shrink));
      rows = Math.max(8, Math.floor(rows / shrink));
    }
    count = cols * rows;
    cellX = width / (cols - 1);
    cellY = height / (rows - 1);
    pos = new Float32Array(count * 3);
    rest = new Float32Array(count * 3);
    invMass = new Float32Array(count).fill(1);
    normals = new Float32Array(count * 4);
    rough = new Float32Array(count * 4);
    broad = new Float32Array(count * 4);
    packed = new Float32Array(count * 4);
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const n = (j * cols + i) * 3;
        rest[n] = i * cellX;
        rest[n + 1] = j * cellY;
        rest[n + 2] = 0;
      }
    }
    pos.set(rest);
    prev = new Float32Array(rest);

    const a: number[] = [];
    const b: number[] = [];
    const kind: number[] = [];
    const id = (i: number, j: number) => j * cols + i;
    const add = (p: number, q: number, k: number) => {
      a.push(p);
      b.push(q);
      kind.push(k);
    };
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        if (i < cols - 1) add(id(i, j), id(i + 1, j), 0);
        if (j < rows - 1) add(id(i, j), id(i, j + 1), 0);
        if (i < cols - 1 && j < rows - 1) {
          add(id(i, j), id(i + 1, j + 1), 0);
          add(id(i + 1, j), id(i, j + 1), 0);
        }
        if (i < cols - 2) add(id(i, j), id(i + 2, j), 1);
        if (j < rows - 2) add(id(i, j), id(i, j + 2), 1);
      }
    }
    linkA = Int32Array.from(a);
    linkB = Int32Array.from(b);
    linkKind = Uint8Array.from(kind);
    linkLength = new Float32Array(a.length);
    for (let c = 0; c < a.length; c++) {
      const p = a[c] * 3;
      const q = b[c] * 3;
      linkLength[c] = Math.hypot(rest[q] - rest[p], rest[q + 1] - rest[p + 1]);
    }
    baseLength = new Float32Array(linkLength);
    hashMask = (1 << Math.ceil(Math.log2(count * 2))) - 1;
    hashHead = new Int32Array(hashMask + 1);
    hashNext = new Int32Array(count);
    const quads = (cols - 1) * (rows - 1);
    quadHead = new Int32Array(hashMask + 1);
    quadNext = new Int32Array(quads * 8);
    quadOf = new Int32Array(quads * 8);
    quadSeen = new Int32Array(quads);
    quadStamp = 0;

    const verts: number[] = [];
    const sx = (cols - 1) * SUBDIVIDE + 1;
    const sy = (rows - 1) * SUBDIVIDE + 1;
    for (let j = 0; j < sy; j++) {
      for (let i = 0; i < sx; i++) verts.push(i / SUBDIVIDE, j / SUBDIVIDE);
    }
    const indices = new Uint32Array((sx - 1) * (sy - 1) * 6);
    let o = 0;
    for (let j = 0; j < sy - 1; j++) {
      for (let i = 0; i < sx - 1; i++) {
        const p = j * sx + i;
        indices[o++] = p;
        indices[o++] = p + sx;
        indices[o++] = p + 1;
        indices[o++] = p + 1;
        indices[o++] = p + sx;
        indices[o++] = p + sx + 1;
      }
    }
    /* the mesh and the cols x rows textures go to the GPU on the next
       render (syncMesh), once the device exists */
    meshVerts = new Float32Array(verts);
    meshIndices = indices;

    held = -1;
    applyPins();
    computeNormals();
  }

  function applyPins() {
    invMass.fill(1);
    tether = new Int32Array(count).fill(-1);
    tetherLength = new Float32Array(count);
    const pin = config.pin;
    const pinned: number[] = [];
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const edge =
          (pin === "top" && j === 0) ||
          (pin === "bottom" && j === rows - 1) ||
          (pin === "left" && i === 0) ||
          (pin === "right" && i === cols - 1) ||
          (pin === "corners" && j === 0 && (i === 0 || i === cols - 1));
        if (edge) pinned.push(j * cols + i);
      }
    }
    for (const n of pinned) {
      invMass[n] = 0;
      const k = n * 3;
      pos[k] = prev[k] = rest[k];
      pos[k + 1] = prev[k + 1] = rest[k + 1];
      pos[k + 2] = prev[k + 2] = 0;
    }
    if (pinned.length) {
      for (let n = 0; n < count; n++) {
        if (invMass[n] === 0) continue;
        let best = -1;
        let bestDistance = Infinity;
        for (const p of pinned) {
          const d = Math.hypot(rest[n * 3] - rest[p * 3], rest[n * 3 + 1] - rest[p * 3 + 1]);
          if (d < bestDistance) {
            bestDistance = d;
            best = p;
          }
        }
        tether[n] = best;
        tetherLength[n] = bestDistance;
      }
    }
    gravityX = pin === "left" ? 1 : pin === "right" ? -1 : 0;
    gravityY =
      pin === "top" || pin === "corners" ? 1 : pin === "bottom" ? -1 : 0;
  }

  function computeNormals() {
    let shortest = Math.min(cellX, cellY);
    if (!(shortest > 0)) shortest = 1;
    for (let j = 0; j < rows; j++) {
      const up = Math.max(j - 1, 0);
      const down = Math.min(j + 1, rows - 1);
      for (let i = 0; i < cols; i++) {
        const left = Math.max(i - 1, 0);
        const right = Math.min(i + 1, cols - 1);
        const n = j * cols + i;
        const k = n * 3;
        const r = (j * cols + right) * 3;
        const l = (j * cols + left) * 3;
        const u = (up * cols + i) * 3;
        const d = (down * cols + i) * 3;
        const ax = pos[r] - pos[l];
        const ay = pos[r + 1] - pos[l + 1];
        const az = pos[r + 2] - pos[l + 2];
        const bx = pos[d] - pos[u];
        const by = pos[d + 1] - pos[u + 1];
        const bz = pos[d + 2] - pos[u + 2];
        let nx = ay * bz - az * by;
        let ny = az * bx - ax * bz;
        let nz = ax * by - ay * bx;
        const length = Math.hypot(nx, ny, nz) || 1;
        nx /= length;
        ny /= length;
        nz /= length;
        let cx = 0;
        let cy = 0;
        let cz = 0;
        let neighbours = 0;
        for (const m of [r, l, u, d]) {
          if (m === k) continue;
          cx += pos[m];
          cy += pos[m + 1];
          cz += pos[m + 2];
          neighbours++;
        }
        let cavity = 0;
        if (neighbours) {
          cavity =
            ((cx / neighbours - pos[k]) * nx +
              (cy / neighbours - pos[k + 1]) * ny +
              (cz / neighbours - pos[k + 2]) * nz) /
            shortest;
        }
        const o = n * 4;
        rough[o] = nx;
        rough[o + 1] = ny;
        rough[o + 2] = nz;
        rough[o + 3] = Math.max(-1, Math.min(1, cavity * 2.2));
      }
    }
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < cols; i++) {
        const o = (j * cols + i) * 4;
        let sx = rough[o] * 2;
        let sy = rough[o + 1] * 2;
        let sz = rough[o + 2] * 2;
        let sc = rough[o + 3] * 2;
        let weight = 2;
        for (const [di, dj] of NEIGHBOURS) {
          const a = i + di;
          const b = j + dj;
          if (a < 0 || b < 0 || a >= cols || b >= rows) continue;
          const m = (b * cols + a) * 4;
          sx += rough[m];
          sy += rough[m + 1];
          sz += rough[m + 2];
          sc += rough[m + 3];
          weight++;
        }
        const length = Math.hypot(sx, sy, sz) || 1;
        normals[o] = sx / length;
        normals[o + 1] = sy / length;
        normals[o + 2] = sz / length;
        normals[o + 3] = sc / weight;
      }
    }
    const span = 3;
    for (let j = 0; j < rows; j++) {
      const up = (Math.max(j - span, 0) * cols) * 3;
      const down = (Math.min(j + span, rows - 1) * cols) * 3;
      for (let i = 0; i < cols; i++) {
        const left = (j * cols + Math.max(i - span, 0)) * 3;
        const right = (j * cols + Math.min(i + span, cols - 1)) * 3;
        const u = up + i * 3;
        const d = down + i * 3;
        const ax = pos[right] - pos[left];
        const ay = pos[right + 1] - pos[left + 1];
        const az = pos[right + 2] - pos[left + 2];
        const bx = pos[d] - pos[u];
        const by = pos[d + 1] - pos[u + 1];
        const bz = pos[d + 2] - pos[u + 2];
        const nx = ay * bz - az * by;
        const ny = az * bx - ax * bz;
        const nz = ax * by - ay * bx;
        const length = Math.hypot(nx, ny, nz) || 1;
        const o = (j * cols + i) * 4;
        broad[o] = nx / length;
        broad[o + 1] = ny / length;
        broad[o + 2] = nz / length;
        broad[o + 3] = 0;
      }
    }
  }

  /* ── the hand ── */
  let held = -1;
  let heldMass = 1;
  let holdZ = 0;
  let lift = 0;
  let recover = 0;
  const target = { x: 0, y: 0, z: 0 };
  const follow = { x: 0, y: 0, z: 0 };
  let patch: { node: number; weight: number; dx: number; dy: number; dz: number }[] = [];
  const pointer = { x: -1e5, y: -1e5, vx: 0, vy: 0, inside: false, time: 0, energy: 0 };
  let pending: { id: number; x: number; y: number } | null = null;
  let dragged = false;

  function focal() {
    return Math.max(config.perspective, 300);
  }

  function project(n: number) {
    const k = n * 3;
    const f = focal();
    const scale = f / Math.max(f - pos[k + 2], 1);
    return {
      x: width / 2 + (pos[k] - width / 2) * scale,
      y: height / 2 + (pos[k + 1] - height / 2) * scale,
    };
  }

  function pick(x: number, y: number) {
    let best = -1;
    let bestDistance = Infinity;
    let bestZ = -Infinity;
    const reach = Math.max(cellX, cellY) * 1.2;
    for (let n = 0; n < count; n++) {
      const p = project(n);
      const d = Math.hypot(p.x - x, p.y - y);
      if (d > reach) continue;
      const z = pos[n * 3 + 2];
      if (z > bestZ + 4 || (Math.abs(z - bestZ) <= 4 && d < bestDistance)) {
        best = n;
        bestDistance = d;
        bestZ = z;
      }
    }
    return best;
  }

  /* Where the hand wants the held point: the pointer, unprojected onto a
     plane facing the camera at the held point's depth. Past a reach from
     where that point sits on the flat cloth the pull turns to rubber. */
  function aim(x: number, y: number) {
    if (held < 0) return;
    const f = focal();
    const depth = holdZ + lift;
    const scale = (f - depth) / f;
    let tx = width / 2 + (x - width / 2) * scale;
    let ty = height / 2 + (y - height / 2) * scale;
    let tz = depth;
    const k = held * 3;
    const dx = tx - rest[k];
    const dy = ty - rest[k + 1];
    const dz = tz - rest[k + 2];
    const d = Math.hypot(dx, dy, dz);
    const reach = Math.max(140, Math.min(width, height) * 0.45);
    if (d > reach) {
      const f2 = (reach + (d - reach) * 0.25) / d;
      tx = rest[k] + dx * f2;
      ty = rest[k + 1] + dy * f2;
      tz = rest[k + 2] + dz * f2;
    }
    target.x = tx;
    target.y = ty;
    target.z = tz;
  }

  function grab(x: number, y: number) {
    const node = pick(x, y);
    if (node < 0) return false;
    held = node;
    heldMass = invMass[node];
    const k = node * 3;
    holdZ = Math.max(pos[k + 2], 0);
    lift = 0;
    follow.x = pos[k];
    follow.y = pos[k + 1];
    follow.z = pos[k + 2];
    const radius = Math.max(cellX, cellY) * 2.4;
    patch = [];
    for (let n = 0; n < count; n++) {
      if (invMass[n] === 0 || n === node) continue;
      const m = n * 3;
      const d = Math.hypot(rest[m] - rest[k], rest[m + 1] - rest[k + 1]);
      if (d > radius) continue;
      patch.push({
        node: n,
        weight: Math.exp(-((d / radius) ** 2) * 3) * 0.5,
        dx: pos[m] - pos[k],
        dy: pos[m + 1] - pos[k + 1],
        dz: pos[m + 2] - pos[k + 2],
      });
    }
    /* heavy but not fixed: the hand leads, yet the cloth can still hold
       the point back, so a hard pull never draws it out into a spike */
    if (heldMass > 0) invMass[node] = 0.12;
    aim(x, y);
    return true;
  }

  function release() {
    if (held < 0) return;
    invMass[held] = heldMass;
    held = -1;
    patch = [];
    if (!config.float) recover = 1;
  }

  /* ── self-collision ──
     Points that are not neighbours on the grid keep a cloth's thickness
     apart, found through a spatial hash, so a fold lies on top of the
     cloth instead of passing through it and knotting. */
  let hashMask = 0;
  let hashHead = new Int32Array(0);
  let hashNext = new Int32Array(0);

  function cellKey(x: number, y: number, z: number) {
    return ((x * 73856093) ^ (y * 19349663) ^ (z * 83492791)) & hashMask;
  }

  function collide(radius: number) {
    const inv = 1 / radius;
    const r2 = radius * radius;
    hashHead.fill(-1);
    for (let n = 0; n < count; n++) {
      const k = n * 3;
      const key = cellKey(
        Math.floor(pos[k] * inv),
        Math.floor(pos[k + 1] * inv),
        Math.floor(pos[k + 2] * inv),
      );
      hashNext[n] = hashHead[key];
      hashHead[key] = n;
    }
    for (let n = 0; n < count; n++) {
      const k = n * 3;
      const cx = Math.floor(pos[k] * inv);
      const cy = Math.floor(pos[k + 1] * inv);
      const cz = Math.floor(pos[k + 2] * inv);
      const ni = n % cols;
      const nj = (n - ni) / cols;
      for (let dz = -1; dz <= 1; dz++) {
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            for (let m = hashHead[cellKey(cx + dx, cy + dy, cz + dz)]; m >= 0; m = hashNext[m]) {
              if (m <= n) continue;
              const mi = m % cols;
              const mj = (m - mi) / cols;
              if (Math.abs(mi - ni) <= 2 && Math.abs(mj - nj) <= 2) continue;
              const q = m * 3;
              const ex = pos[q] - pos[k];
              const ey = pos[q + 1] - pos[k + 1];
              const ez = pos[q + 2] - pos[k + 2];
              const d2 = ex * ex + ey * ey + ez * ez;
              if (d2 >= r2 || d2 === 0) continue;
              const wn = invMass[n];
              const wm = invMass[m];
              const total = wn + wm;
              if (total === 0) continue;
              const d = Math.sqrt(d2);
              const push = (radius - d) / (d * total);
              pos[k] -= ex * push * wn;
              pos[k + 1] -= ey * push * wn;
              pos[k + 2] -= ez * push * wn;
              pos[q] += ex * push * wm;
              pos[q + 1] += ey * push * wm;
              pos[q + 2] += ez * push * wm;
            }
          }
        }
      }
    }
  }

  /* ── layering ──
     Points alone leave a hole in every cell that another layer can slip
     through, and a gust or a pull would push it through. So each point
     also keeps a thickness clear of the other layers' triangles, on the
     side it was on before the step. The push runs along the wall's normal,
     so folds stack instead of sliding apart, and a layer lying on the wall
     lifts the one on top rather than giving way. */
  let quadHead = new Int32Array(0);
  let quadNext = new Int32Array(0);
  let quadOf = new Int32Array(0);
  let quadSeen = new Int32Array(0);
  let quadStamp = 0;

  function displaced(n: number) {
    const k = n * 3;
    return Math.hypot(pos[k] - rest[k], pos[k + 1] - rest[k + 1]);
  }

  /* Keeps point n on its side of triangle abc; false if n is not over it. */
  function press(n: number, a: number, b: number, c: number, thickness: number) {
    const k = n * 3;
    const ka = a * 3;
    const kb = b * 3;
    const kc = c * 3;
    const ax = pos[ka];
    const ay = pos[ka + 1];
    const e0x = pos[kb] - ax;
    const e0y = pos[kb + 1] - ay;
    const e1x = pos[kc] - ax;
    const e1y = pos[kc + 1] - ay;
    const den = e0x * e1y - e1x * e0y;
    if (Math.abs(den) < 1e-6) return false;
    const px = pos[k] - ax;
    const py = pos[k + 1] - ay;
    const u = (px * e1y - e1x * py) / den;
    const v = (e0x * py - px * e0y) / den;
    const w = 1 - u - v;
    if (u < 0 || v < 0 || w < 0) return false;
    /* a triangle turned edge-on to the wall is left to the point contact */
    const e0z = pos[kb + 2] - pos[ka + 2];
    const e1z = pos[kc + 2] - pos[ka + 2];
    const cx = e0y * e1z - e0z * e1y;
    const cy = e0z * e1x - e0x * e1z;
    if (den * den < 0.09 * (cx * cx + cy * cy + den * den)) return true;
    const gap = pos[k + 2] - (w * pos[ka + 2] + u * pos[kb + 2] + v * pos[kc + 2]);
    const before = prev[k + 2] - (w * prev[ka + 2] + u * prev[kb + 2] + v * prev[kc + 2]);
    /* layers that meet level: the one that travelled further lies on top */
    const side =
      before > 0.5
        ? 1
        : before < -0.5
          ? -1
          : displaced(n) >= w * displaced(a) + u * displaced(b) + v * displaced(c)
            ? 1
            : -1;
    const depth = thickness - side * gap;
    if (depth <= 0) return true;
    const up = side > 0;
    /* nothing is pushed into the wall */
    const wp = up || pos[k + 2] > 0 ? invMass[n] : 0;
    const wa = !up || pos[ka + 2] > 0 ? invMass[a] : 0;
    const wb = !up || pos[kb + 2] > 0 ? invMass[b] : 0;
    const wc = !up || pos[kc + 2] > 0 ? invMass[c] : 0;
    const total = wp + w * w * wa + u * u * wb + v * v * wc;
    if (total < 1e-6) return true;
    const s = (Math.min(depth, thickness * 2) / total) * side;
    pos[k + 2] += s * wp;
    pos[ka + 2] -= s * w * wa;
    pos[kb + 2] -= s * u * wb;
    pos[kc + 2] -= s * v * wc;
    if (up) {
      let short = 0;
      for (const [m, weight] of [[ka, w], [kb, u], [kc, v]]) {
        if (pos[m + 2] < 0) {
          short -= pos[m + 2] * weight;
          pos[m + 2] = 0;
        }
      }
      if (wp > 0) pos[k + 2] += short;
    } else if (pos[k + 2] < 0) {
      const short = -pos[k + 2];
      pos[k + 2] = 0;
      if (wa + wb + wc > 0) {
        pos[ka + 2] += wa > 0 ? short : 0;
        pos[kb + 2] += wb > 0 ? short : 0;
        pos[kc + 2] += wc > 0 ? short : 0;
      }
    }
    return true;
  }

  function layer(thickness: number) {
    const inv = 1 / Math.max(cellX, cellY);
    const across = cols - 1;
    const quads = across * (rows - 1);
    const capacity = quadNext.length;
    quadHead.fill(-1);
    let used = 0;
    for (let q = 0; q < quads && used < capacity; q++) {
      const qi = q % across;
      const a = ((q - qi) / across) * cols + qi;
      const corners = [a, a + 1, a + cols, a + cols + 1];
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const m of corners) {
        const x = pos[m * 3];
        const y = pos[m * 3 + 1];
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
      const x0 = Math.floor(minX * inv);
      const x1 = Math.floor(maxX * inv);
      const y0 = Math.floor(minY * inv);
      const y1 = Math.floor(maxY * inv);
      if ((x1 - x0 + 1) * (y1 - y0 + 1) > 16) continue;
      for (let gy = y0; gy <= y1; gy++) {
        for (let gx = x0; gx <= x1 && used < capacity; gx++) {
          const key = ((gx * 73856093) ^ (gy * 19349663)) & hashMask;
          quadOf[used] = q;
          quadNext[used] = quadHead[key];
          quadHead[key] = used++;
        }
      }
    }
    if (quadStamp > 1e9) {
      quadStamp = 0;
      quadSeen.fill(0);
    }
    for (let n = 0; n < count; n++) {
      const k = n * 3;
      const ni = n % cols;
      const nj = (n - ni) / cols;
      const key =
        ((Math.floor(pos[k] * inv) * 73856093) ^ (Math.floor(pos[k + 1] * inv) * 19349663)) & hashMask;
      const stamp = ++quadStamp;
      for (let e = quadHead[key]; e >= 0; e = quadNext[e]) {
        const q = quadOf[e];
        if (quadSeen[q] === stamp) continue;
        quadSeen[q] = stamp;
        const qi = q % across;
        const qj = (q - qi) / across;
        /* its own neighbourhood bends freely */
        if (qi >= ni - 3 && qi <= ni + 2 && qj >= nj - 3 && qj <= nj + 2) continue;
        const a = qj * cols + qi;
        if (!press(n, a, a + 1, a + cols, thickness)) {
          press(n, a + 1, a + cols + 1, a + cols, thickness);
        }
      }
    }
  }

  /* ── the loop ── */
  let windTime = Math.random() * 100;
  let settledFrames = 0;

  function step(h: number) {
    const floating = config.float;
    const wind = reducedMotion || floating ? 0 : Math.max(config.wind, 0);
    const bend = 0.04 + Math.min(Math.max(config.stiffness, 0), 1) * 0.6;
    const settle = Math.min(Math.max(config.settle, 0), 1);
    const home = floating
      ? 0
      : (config.pin === "none" ? 6 + settle * 30 : settle * 8) *
        (held >= 0 ? 0.05 : 1 + recover * 3);
    const gravity = floating ? 0 : GRAVITY;
    const drag = floating && held < 0 ? 0.9 : 0.985;
    const brush = Math.min(Math.max(config.brush, 0), 1) * pointer.energy;
    const thickness = COLLIDE * Math.min(cellX, cellY);
    const maxMove = thickness * 0.45;
    const h2 = h * h;
    windTime += h;
    recover *= Math.exp(-h * 1.2);
    const t = windTime;
    const gust =
      0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 0.37)) * (0.6 + 0.4 * Math.sin(t * 0.91 + 1.3));
    const windStrength = wind * 900 * gust;
    const f = focal();
    const brushRadius = 110;

    for (let n = 0; n < count; n++) {
      if (invMass[n] === 0) continue;
      const k = n * 3;
      const x = pos[k];
      const y = pos[k + 1];
      const z = pos[k + 2];
      let ax = gravityX * gravity;
      let ay = gravityY * gravity;
      let az = 0;
      if (windStrength > 0) {
        const wx = windStrength * 0.22 * Math.sin(t * 0.27 + y * 0.004);
        const wz =
          windStrength * (0.7 + 0.45 * windNoise(rest[k] * 0.0035 + t * 0.55, rest[k + 1] * 0.0035 - t * 0.21));
        const o = n * 4;
        const nx = normals[o];
        const ny = normals[o + 1];
        const nz = normals[o + 2];
        const along = nx * wx + nz * wz;
        ax += along * nx + wx * 0.08;
        ay += along * ny;
        az += along * nz + wz * 0.08;
      }
      if (brush > 0.001) {
        const scale = f / Math.max(f - z, 1);
        const sx = width / 2 + (x - width / 2) * scale;
        const sy = height / 2 + (y - height / 2) * scale;
        const dx = sx - pointer.x;
        const dy = sy - pointer.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < brushRadius * brushRadius * 4) {
          const g = Math.exp(-d2 / (brushRadius * brushRadius)) * brush;
          ax += pointer.vx * 9 * g;
          ay += pointer.vy * 9 * g;
          az += Math.hypot(pointer.vx, pointer.vy) * 4 * g;
        }
      }
      ax += (rest[k] - x) * home;
      ay += (rest[k + 1] - y) * home;
      az += (rest[k + 2] - z) * home;
      let vx = (x - prev[k]) * drag + ax * h2;
      let vy = (y - prev[k + 1]) * drag + ay * h2;
      let vz = (z - prev[k + 2]) * drag + az * h2;
      const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
      if (speed > maxMove) {
        const s = maxMove / speed;
        vx *= s;
        vy *= s;
        vz *= s;
      }
      prev[k] = x;
      prev[k + 1] = y;
      prev[k + 2] = z;
      pos[k] = x + vx;
      pos[k + 1] = y + vy;
      pos[k + 2] = z + vz;
    }

    if (held >= 0) {
      lift += (60 - lift) * Math.min(h * 10, 1);
      const ex = target.x - follow.x;
      const ey = target.y - follow.y;
      const ez = target.z - follow.z;
      const gap = Math.sqrt(ex * ex + ey * ey + ez * ez);
      const reach = gap > maxMove ? maxMove / gap : 1;
      follow.x += ex * reach;
      follow.y += ey * reach;
      follow.z += ez * reach;
      const k = held * 3;
      pos[k] += (follow.x - pos[k]) * 0.7;
      pos[k + 1] += (follow.y - pos[k + 1]) * 0.7;
      pos[k + 2] += (follow.z - pos[k + 2]) * 0.7;
      for (const p of patch) {
        const m = p.node * 3;
        pos[m] += (pos[k] + p.dx - pos[m]) * p.weight;
        pos[m + 1] += (pos[k + 1] + p.dy - pos[m + 1]) * p.weight;
        pos[m + 2] += (pos[k + 2] + p.dz - pos[m + 2]) * p.weight;
      }
    }

    const links = linkA.length;
    for (let it = 0; it < ITERATIONS; it++) {
      for (let c = 0; c < links; c++) {
        const p = linkA[c];
        const q = linkB[c];
        const wp = invMass[p];
        const wq = invMass[q];
        const total = wp + wq;
        if (total === 0) continue;
        const a = p * 3;
        const b = q * 3;
        const dx = pos[b] - pos[a];
        const dy = pos[b + 1] - pos[a + 1];
        const dz = pos[b + 2] - pos[a + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        let length = linkLength[c];
        let stiff = 1;
        if (linkKind[c] === 1) {
          const floor = baseLength[c] * CREASE;
          if (d < floor) length = floor;
          else stiff = bend;
        }
        const s = (stiff * (d - length)) / (d * total);
        pos[a] += dx * s * wp;
        pos[a + 1] += dy * s * wp;
        pos[a + 2] += dz * s * wp;
        pos[b] -= dx * s * wq;
        pos[b + 1] -= dy * s * wq;
        pos[b + 2] -= dz * s * wq;
      }
      if (it === (ITERATIONS >> 1)) {
        collide(thickness);
        layer(thickness);
      }
    }

    for (let n = 0; n < count; n++) {
      const k = n * 3;
      const anchor = tether[n];
      if (anchor >= 0 && invMass[n] > 0) {
        const a = anchor * 3;
        const dx = pos[k] - pos[a];
        const dy = pos[k + 1] - pos[a + 1];
        const dz = pos[k + 2] - pos[a + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const limit = tetherLength[n];
        if (d > limit && d > 0) {
          const s = limit / d;
          pos[k] = pos[a] + dx * s;
          pos[k + 1] = pos[a + 1] + dy * s;
          pos[k + 2] = pos[a + 2] + dz * s;
        }
      }
      if (pos[k + 2] < 0) {
        pos[k + 2] = 0;
        prev[k + 2] = Math.min(prev[k + 2], 0) * 0.5;
      }
    }

    /* contact last, so neither the tethers nor the wall undo it */
    collide(thickness);
    layer(thickness);
    for (let n = 0; n < count; n++) {
      if (pos[n * 3 + 2] < 0) pos[n * 3 + 2] = 0;
    }

    /* floating: bends set where they are left, so the cloth keeps its
       shape instead of springing flat */
    if (floating) {
      for (let c = 0; c < links; c++) {
        if (linkKind[c] !== 1) continue;
        const a = linkA[c] * 3;
        const b = linkB[c] * 3;
        const d = Math.hypot(pos[b] - pos[a], pos[b + 1] - pos[a + 1], pos[b + 2] - pos[a + 2]);
        linkLength[c] += (Math.max(d, baseLength[c] * CREASE) - linkLength[c]) * 0.05;
      }
    }
  }

  /* The canvas reaches past the cloth by a margin that grows while the
     cloth is dragged out of its box and shrinks back once it settles, so
     a fold pulled past the edge is never cut off. */
  let roomyFrames = 0;
  function fitBleed(final = false) {
    const f = focal();
    let over = 0;
    for (let n = 0; n < count; n++) {
      const k = n * 3;
      const z = pos[k + 2];
      const scale = f / Math.max(f - z, 1);
      const sx = width / 2 + (pos[k] - width / 2) * scale;
      const sy = height / 2 + (pos[k + 1] - height / 2) * scale;
      const lift = Math.max(z, 0) + 6;
      const hx = pos[k] + 0.32 * lift;
      const hy = pos[k + 1] + 0.46 * lift;
      over = Math.max(
        over,
        -sx,
        sx - width,
        -sy,
        sy - height,
        hx - width + 30,
        hy - height + 30,
        30 - hx,
        30 - hy,
      );
    }
    const need = over + 48;
    if (need > bleed) {
      roomyFrames = 0;
      resizeBleed(Math.min(MAX_BLEED, Math.ceil(need / 128) * 128));
    } else if (bleed > BASE_BLEED && need < bleed - (final ? 0 : 160)) {
      roomyFrames++;
      if (final || roomyFrames > 45) {
        roomyFrames = 0;
        resizeBleed(Math.max(BASE_BLEED, Math.ceil(need / 128) * 128));
      }
    } else {
      roomyFrames = 0;
    }
  }

  function resizeBleed(next: number) {
    if (next === bleed) return;
    styleBleed(next);
    sizeOutput();
  }

  let backingRgb: [number, number, number] = [1, 1, 1];
  const probe = document.createElement("canvas");
  probe.width = probe.height = 1;
  const probeCtx = probe.getContext("2d", { willReadFrequently: true });

  function syncBacking() {
    if (config.backing !== "auto") {
      backingRgb = config.backing;
      return;
    }
    backingRgb = [1, 1, 1];
    if (!probeCtx) return;
    let el: Element | null = content;
    while (el) {
      const bg = getComputedStyle(el).backgroundColor;
      if (bg && bg !== "transparent") {
        probeCtx.clearRect(0, 0, 1, 1);
        probeCtx.fillStyle = bg;
        probeCtx.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = probeCtx.getImageData(0, 0, 1, 1).data;
        if (a > 0) {
          backingRgb = [r / 255, g / 255, b / 255];
          break;
        }
      }
      el = el.parentElement;
    }
  }

  function sizeOutput() {
    const dpr = getCanvasPixelRatio(output);
    const w = Math.max(1, Math.round(output.clientWidth * dpr));
    const h = Math.max(1, Math.round(output.clientHeight * dpr));
    if (screen) {
      const [sw, sh] = screen.size;
      if (sw !== w || sh !== h) screen.resize([w, h]);
    } else if (output.width !== w || output.height !== h) {
      output.width = w;
      output.height = h;
    }
    outputSize = [w, h];
    shadowSize = [
      Math.max(1, Math.ceil(output.clientWidth * SHADOW_SCALE)),
      Math.max(1, Math.ceil(output.clientHeight * SHADOW_SCALE)),
    ];
    sizeTargets();
    return dpr;
  }

  function syncCanvasSize() {
    const dpr = sizeOutput();
    contentMaxX = Math.min(
      1,
      Math.max(0.05, content.clientWidth / Math.max(wrapper.clientWidth, 1)),
    );
    const sourceWidth = Math.max(1, Math.round(source.clientWidth * dpr));
    const sourceHeight = Math.max(1, Math.round(source.clientHeight * dpr));
    if (source.width !== sourceWidth || source.height !== sourceHeight) {
      source.width = sourceWidth;
      source.height = sourceHeight;
    }
    paintable.requestPaint!();
    if (
      Math.abs(wrapper.clientWidth - width) > 1 ||
      Math.abs(wrapper.clientHeight - height) > 1
    ) {
      buildCloth();
    }
  }

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reducedMotion = motionQuery.matches;

  syncBacking();
  syncCanvasSize();

  function floatTexture(previous: Texture | null, label: string) {
    previous?.destroy();
    return gpu!.device.createTexture({
      size: [cols, rows],
      format: "rgba32float",
      usage: ["texture_binding", "copy_dst"],
      label,
    });
  }

  /* The mesh, its draws and the cols x rows textures depend only on the
     grid's dimensions, so a resize that keeps them reuses everything. */
  function syncMesh() {
    if (!gpu || (meshCols === cols && meshRows === rows && mesh)) return;
    meshCols = cols;
    meshRows = rows;
    mesh?.destroy();
    mesh = geometry(gpu, {
      label: "cloth.mesh",
      topology: "triangle-list",
      buffers: [{ data: meshVerts, attributes: { aGrid: "float32x2" } }],
      indices: meshIndices,
    });
    posTexture = floatTexture(posTexture, "cloth.pos");
    nrmTexture = floatTexture(nrmTexture, "cloth.nrm");
    broadTexture = floatTexture(broadTexture, "cloth.broad");
    clothDraw = draw(gpu, {
      label: "cloth",
      shader: CLOTH_SHADER,
      geometry: mesh,
      blend: {
        color: { src: "one", dst: "one-minus-src-alpha" },
        alpha: { src: "one", dst: "one-minus-src-alpha" },
      },
      depth: { write: true, compare: "less-equal" },
      set: {
        uPos: posTexture,
        uNrm: nrmTexture,
        uBroad: broadTexture,
        uContent: contentTexture,
        uSampler: linearSampler(),
      },
    });
    shadowDraw = draw(gpu, {
      label: "cloth.shadow",
      shader: SHADOW_SHADER,
      geometry: mesh,
      blend: {
        color: { src: "one", dst: "one", op: "max" },
        alpha: { src: "one", dst: "one", op: "max" },
      },
      set: { uPos: posTexture },
    });
  }

  function upload() {
    for (let n = 0; n < count; n++) {
      packed[n * 4] = pos[n * 3];
      packed[n * 4 + 1] = pos[n * 3 + 1];
      packed[n * 4 + 2] = pos[n * 3 + 2];
      packed[n * 4 + 3] = 0;
    }
    const queue = gpu!.gpu.queue;
    const layout = { bytesPerRow: cols * 16, rowsPerImage: rows };
    queue.writeTexture({ texture: posTexture!.gpu }, packed, layout, [cols, rows]);
    queue.writeTexture({ texture: nrmTexture!.gpu }, normals, layout, [cols, rows]);
    queue.writeTexture({ texture: broadTexture!.gpu }, broad, layout, [cols, rows]);
  }

  function render() {
    if (!gpu || !screen || !sceneTarget || !blurAcross || !blurDown || !compositeFx) return;
    syncMesh();
    if (!clothDraw || !shadowDraw) return;
    upload();
    const radius = Math.max(config.cornerRadius, 0);
    const light = Math.min(Math.max(config.light, 0), 1);
    const shadow = Math.min(Math.max(config.shadow, 0), 1);
    const lum = 0.299 * backingRgb[0] + 0.587 * backingRgb[1] + 0.114 * backingRgb[2];
    const dark = Math.min(Math.max((0.5 - lum) / 0.35, 0), 1);
    const grid = [cols, rows];
    const cell = [cellX, cellY];
    const view = [Math.max(output.clientWidth, 1), Math.max(output.clientHeight, 1)];

    const [a, b] = shadowTargets;
    const shadowed = shadow > 0.001;
    if (shadowed) {
      shadowDraw.set({
        params: { grid, cell, view, shift: [0.32, 0.46], size: [width, height], bleed, radius },
      });
      blurAcross.set({ uTex: a, params: { dir: [2.2 / a.size[0], 0] } });
      blurDown.set({ uTex: b, params: { dir: [0, 2.2 / a.size[1]] } });
    }

    clothDraw.set({
      params: {
        backing: [backingRgb[0], backingRgb[1], backingRgb[2], 0],
        grid,
        cell,
        center: [width / 2, height / 2],
        view,
        size: [width, height],
        focal: focal(),
        bleed,
        maxX: contentMaxX,
        radius,
        light,
        sheen: Math.min(Math.max(config.sheen, 0), 1),
        weave: Math.min(Math.max(config.weave, 0), 1),
        dark,
      },
    });
    compositeFx.set({
      uScene: sceneTarget,
      uShadow: a,
      params: { shadow: shadowed ? shadow * mix(0.32, 0.6, dark) : 0 },
    });

    const scene = sceneTarget;
    const cloth = clothDraw;
    const cast = shadowDraw;
    const across = blurAcross;
    const down = blurDown;
    const composite = compositeFx;
    const canvasTarget = screen;
    gpuFrame(gpu, (f) => {
      if (shadowed) {
        f.pass({ target: a, clear: [0, 0, 0, 0] }, cast);
        for (let pass = 0; pass < 2; pass++) {
          f.pass(b, across);
          f.pass(a, down);
        }
      }
      f.pass({ target: scene, clear: [0, 0, 0, 0], clearDepth: 1 }, cloth);
      f.pass({ target: canvasTarget, clear: [0, 0, 0, 0] }, composite);
    });
  }

  let raf = 0;
  let lastTime = performance.now();
  let debt = 0;
  let destroyed = false;
  let running = false;
  let visible = true;

  function frame(now: number) {
    if (destroyed) return;
    if (!visible) {
      running = false;
      return;
    }
    /* nothing to draw with yet (or ever, after a failed adapter request):
       the device's arrival restarts the loop */
    if (!gpu) {
      running = false;
      return;
    }
    const delta = Math.min((now - lastTime) / 1000, 1 / 20);
    lastTime = now;
    pointer.energy *= Math.exp(-delta * 5);
    pointer.vx *= Math.exp(-delta * 8);
    pointer.vy *= Math.exp(-delta * 8);

    let moved = 0;
    debt = Math.min(debt + delta * Math.max(config.speed, 0), STEP * 4);
    while (debt >= STEP) {
      step(STEP);
      debt -= STEP;
    }
    for (let k = 0; k < pos.length; k++) {
      const d = Math.abs(pos[k] - prev[k]);
      if (d > moved) moved = d;
    }
    computeNormals();
    fitBleed();
    render();
    if (hoverAt.on && held < 0) updateHover();

    const windy = !reducedMotion && !config.float && config.wind > 0.001;
    settledFrames = held < 0 && !windy && moved < 0.01 && pointer.energy < 0.01 ? settledFrames + 1 : 0;
    if (settledFrames > 30) {
      fitBleed(true);
      render();
      running = false;
      return;
    }
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (destroyed || running || !visible) return;
    running = true;
    settledFrames = 0;
    lastTime = performance.now();
    raf = requestAnimationFrame(frame);
  }

  wake = start;

  acquireGpu()
    .then((device) => {
      if (destroyed) return;
      gpu = device;
      screen = surface(device, output, {
        size: [output.width, output.height],
        autoResize: false,
        alphaMode: "premultiplied",
        label: "cloth",
      });
      contentTexture = device.device.createTexture({
        size: [1, 1],
        format: "rgba8unorm",
        usage: ["texture_binding", "copy_dst", "render_attachment"],
        label: "cloth.content",
      });
      /* the canvas the WebGL engine draws into: depth-tested, 4x MSAA */
      sceneTarget = gpuTarget(device, {
        size: outputSize,
        format: "rgba8unorm",
        depth: true,
        msaa: 4,
        clearColor: [0, 0, 0, 0],
        label: "cloth.scene",
      });
      shadowTargets = ["cloth.shadow.a", "cloth.shadow.b"].map((label) =>
        gpuTarget(device, {
          size: shadowSize,
          format: "rgba8unorm",
          clearColor: [0, 0, 0, 0],
          label,
        }),
      );
      /* one effect per blur direction: uniforms set mid-frame would all
         land before the frame is submitted */
      blurAcross = gpuEffect(device, BLUR_SHADER, {
        label: "cloth.blur.across",
        set: { uSampler: linearSampler() },
      });
      blurDown = gpuEffect(device, BLUR_SHADER, {
        label: "cloth.blur.down",
        set: { uSampler: linearSampler() },
      });
      compositeFx = gpuEffect(device, COMPOSITE_SHADER, {
        label: "cloth",
        set: { uSampler: linearSampler() },
      });
      sizeOutput();
      if (contentDirty) {
        uploadContent();
        sourceCtx!.reset();
      }
      start();
    })
    .catch((error) => {
      if (destroyed) return;
      console.warn("Cloth: WebGPU unavailable, showing content without the effect.", error);
      failed = true;
      gpu = null;
      screen?.dispose();
      screen = null;
      /* a fresh capture stays on the source canvas */
      paintable.requestPaint!();
    });

  start();

  function onMotionChange() {
    reducedMotion = motionQuery.matches;
    start();
  }
  motionQuery.addEventListener("change", onMotionChange);

  let themeTimer = 0;
  function onThemeShift() {
    syncBacking();
    start();
    window.clearTimeout(themeTimer);
    themeTimer = window.setTimeout(() => {
      syncBacking();
      start();
    }, 300);
  }
  const themeObserver = new MutationObserver(onThemeShift);
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "style", "data-theme"],
  });
  const schemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
  schemeQuery.addEventListener("change", onThemeShift);

  const observer = createCanvasResizeObserver(() => {
    syncCanvasSize();
    start();
  });
  observer.observe(output);
  observer.observe(content);

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

  const rectCache = createRectCache(wrapper);

  function local(event: PointerEvent) {
    const rect = rectCache.current;
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  /* ── the page under the fabric ──
     The page is laid out flat under the canvas, so once the cloth moves the
     browser would hit-test a press against where the content sits on the
     flat sheet, not where it is drawn. Every press, click and selection is
     traced through the folded mesh instead: the frontmost triangle under the
     pointer gives the point on the flat page it shows, and the event is
     carried out there. */
  type Hit = { x: number; y: number; front: boolean };
  let projected = new Float32Array(0);

  function hitCloth(clientX: number, clientY: number): Hit | null {
    const rect = rectCache.current;
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const f = focal();
    if (projected.length !== count * 3) projected = new Float32Array(count * 3);
    for (let n = 0; n < count; n++) {
      const k = n * 3;
      const z = pos[k + 2];
      const scale = f / Math.max(f - z, 1);
      projected[k] = width / 2 + (pos[k] - width / 2) * scale;
      projected[k + 1] = height / 2 + (pos[k + 1] - height / 2) * scale;
      projected[k + 2] = z;
    }
    let best: Hit | null = null;
    let bestZ = -Infinity;
    const test = (a: number, b: number, c: number) => {
      const ax = projected[a * 3];
      const ay = projected[a * 3 + 1];
      const bx = projected[b * 3];
      const by = projected[b * 3 + 1];
      const cx = projected[c * 3];
      const cy = projected[c * 3 + 1];
      if (
        px < Math.min(ax, bx, cx) ||
        px > Math.max(ax, bx, cx) ||
        py < Math.min(ay, by, cy) ||
        py > Math.max(ay, by, cy)
      ) {
        return;
      }
      const area = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
      if (Math.abs(area) < 1e-6) return;
      const u = ((bx - px) * (cy - py) - (by - py) * (cx - px)) / area;
      const v = ((cx - px) * (ay - py) - (cy - py) * (ax - px)) / area;
      const w = 1 - u - v;
      if (u < -0.001 || v < -0.001 || w < -0.001) return;
      const z = u * projected[a * 3 + 2] + v * projected[b * 3 + 2] + w * projected[c * 3 + 2];
      if (z <= bestZ) return;
      bestZ = z;
      best = {
        x: u * rest[a * 3] + v * rest[b * 3] + w * rest[c * 3],
        y: u * rest[a * 3 + 1] + v * rest[b * 3 + 1] + w * rest[c * 3 + 1],
        front: area > 0,
      };
    };
    for (let j = 0; j < rows - 1; j++) {
      for (let i = 0; i < cols - 1; i++) {
        const a = j * cols + i;
        test(a, a + 1, a + cols);
        test(a + 1, a + cols + 1, a + cols);
      }
    }
    return best;
  }

  function pageClient(hit: Hit) {
    const rect = rectCache.current;
    return { x: rect.left + hit.x, y: rect.top + hit.y };
  }

  function caretAt(clientX: number, clientY: number) {
    const doc = document as Document & {
      caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
    };
    const position = doc.caretPositionFromPoint?.(clientX, clientY);
    if (position) return { node: position.offsetNode, offset: position.offset };
    const range = doc.caretRangeFromPoint?.(clientX, clientY);
    return range ? { node: range.startContainer, offset: range.startOffset } : null;
  }

  /* Text keeps its selection: a press that lands on a glyph of selectable
     text selects, and only fabric around it grabs. */
  function overText(clientX: number, clientY: number) {
    const caret = caretAt(clientX, clientY);
    if (!caret || caret.node.nodeType !== Node.TEXT_NODE || !content.contains(caret.node)) {
      return false;
    }
    const parent = caret.node.parentElement;
    if (parent && getComputedStyle(parent).userSelect === "none") return false;
    const text = caret.node as Text;
    const range = document.createRange();
    for (const at of [caret.offset - 1, caret.offset]) {
      if (at < 0 || at >= text.length) continue;
      range.setStart(text, at);
      range.setEnd(text, at + 1);
      for (const rect of range.getClientRects()) {
        if (
          clientX >= rect.left - 2 &&
          clientX <= rect.right + 2 &&
          clientY >= rect.top - 2 &&
          clientY <= rect.bottom + 2
        ) {
          return true;
        }
      }
    }
    return false;
  }

  let selecting = false;
  let lastPress = { time: 0, x: 0, y: 0, count: 0 };
  let swallowNext = false;
  let forwarding = false;

  function startSelection(clientX: number, clientY: number, event: PointerEvent) {
    const caret = caretAt(clientX, clientY);
    const selection = window.getSelection();
    if (!caret || !selection || !content.contains(caret.node)) return;
    const now = performance.now();
    const again =
      now - lastPress.time < 450 &&
      Math.hypot(event.clientX - lastPress.x, event.clientY - lastPress.y) < 6;
    lastPress = { time: now, x: event.clientX, y: event.clientY, count: again ? lastPress.count + 1 : 1 };
    selection.removeAllRanges();
    selection.collapse(caret.node, caret.offset);
    const modify = (selection as Selection & {
      modify?: (alter: string, direction: string, granularity: string) => void;
    }).modify?.bind(selection);
    if (lastPress.count === 2 && modify) {
      modify("move", "backward", "word");
      modify("extend", "forward", "word");
      return;
    }
    if (lastPress.count >= 3 && modify) {
      modify("move", "backward", "paragraphboundary");
      modify("extend", "forward", "paragraphboundary");
      return;
    }
    selecting = true;
  }

  /* Only events aimed at the cloth or at the page behind it are traced;
     anything drawn above it (a popup, a toolbar) keeps its own events. */
  function ours(target: EventTarget | null) {
    return target instanceof Node && (wrapper.contains(target) || target.contains(wrapper));
  }

  patchHoverRules();
  content.setAttribute(CONTENT_ATTR, "");
  let hoverChain: Element[] = [];
  let hoverTarget: Element | null = null;
  const hoverAt = { x: 0, y: 0, target: null as EventTarget | null, on: false };

  /* This runs every frame while the pointer rests on moving fabric, so it
     only touches the DOM when the answer changes. */
  function setHover(target: Element | null) {
    if (target === hoverTarget) return;
    hoverTarget = target;
    const next = new Set<Element>();
    for (let el: Element | null = target; el; el = el.parentElement) {
      next.add(el);
      if (el === content) break;
    }
    for (const el of hoverChain) if (!next.has(el)) el.removeAttribute(HOVER_ATTR);
    for (const el of next) el.setAttribute(HOVER_ATTR, "");
    hoverChain = Array.from(next);
  }

  type Styled = Element & ElementCSSInlineStyle;
  let forced: { el: Styled; value: string; priority: string; native: string; cursor: string } | null = null;

  function unforce() {
    if (!forced) return;
    const { el, value, priority } = forced;
    if (value) el.style.setProperty("cursor", value, priority);
    else el.style.removeProperty("cursor");
    el.removeAttribute(NATIVE_ATTR);
    forced = null;
  }

  /* The browser shows the cursor of the element under the real pointer,
     which lies flat under the canvas, so the drawn element's cursor is
     forced onto that one element. */
  function force(at: Element | null, cursor: string) {
    if (forced && (!cursor || forced.el !== at)) unforce();
    if (!cursor || !at || !("style" in at)) return;
    const el = at as Styled;
    if (!forced) {
      const native = getComputedStyle(el).cursor;
      forced = {
        el,
        value: el.style.getPropertyValue("cursor"),
        priority: el.style.getPropertyPriority("cursor"),
        native,
        cursor: "",
      };
      if (CURSOR_KEYWORDS.has(native)) el.setAttribute(NATIVE_ATTR, native);
    }
    if (forced.cursor !== cursor) {
      forced.cursor = cursor;
      el.style.setProperty("cursor", cursor, "important");
    }
  }

  /* The forced element reports the cursor it had before; everything else
     still computes its own, since the forced value stops at its children. */
  function cursorOf(el: Element) {
    return forced && forced.el === el ? forced.native : getComputedStyle(el).cursor;
  }

  function updateHover() {
    if (!hoverAt.on || held >= 0 || !ours(hoverAt.target)) {
      setHover(null);
      force(null, "");
      return;
    }
    const behind = !wrapper.contains(hoverAt.target as Node);
    const under = document.elementFromPoint(hoverAt.x, hoverAt.y);
    const at = under && ours(under) ? under : null;
    const hit = hitCloth(hoverAt.x, hoverAt.y);
    if (!hit) {
      setHover(null);
      force(at, behind ? "" : "default");
      return;
    }
    const fabric = config.drag && !failed ? "grab" : "default";
    if (!hit.front) {
      setHover(null);
      force(at, fabric);
      return;
    }
    const point = pageClient(hit);
    const drawn = document.elementFromPoint(point.x, point.y);
    const target = drawn && content.contains(drawn) ? drawn : null;
    setHover(target);
    let cursor = target ? cursorOf(target) : fabric;
    if (cursor === "auto") cursor = overText(point.x, point.y) ? "text" : fabric;
    force(at, cursor);
  }

  function onHoverScroll() {
    if (hoverAt.on) updateHover();
  }
  content.addEventListener("scroll", onHoverScroll, { capture: true, passive: true });

  function onPointerDown(event: PointerEvent) {
    /* without a device the page lies flat on the source canvas, where the
       browser already hit-tests it correctly */
    if (event.button !== 0 || forwarding || failed) return;
    if (!ours(event.target)) return;
    const target = event.target as Node | null;
    const onPage = Boolean(target && (target === wrapper || wrapper.contains(target)));
    const hit = hitCloth(event.clientX, event.clientY);
    if (!hit) {
      if (onPage) event.preventDefault();
      return;
    }
    let shifted = true;
    if (hit.front) {
      const point = pageClient(hit);
      shifted = !onPage || Math.hypot(point.x - event.clientX, point.y - event.clientY) > 3;
      const under = shifted ? document.elementFromPoint(point.x, point.y) : (target as Element);
      if (under && content.contains(under)) {
        if (under.closest?.(INTERACTIVE)) {
          if (shifted) event.preventDefault();
          return;
        }
        if (overText(point.x, point.y)) {
          if (shifted) {
            event.preventDefault();
            startSelection(point.x, point.y, event);
          }
          return;
        }
      }
    }
    if (!config.drag) {
      if (shifted) event.preventDefault();
      return;
    }
    event.preventDefault();
    const p = local(event);
    pending = { id: event.pointerId, x: p.x, y: p.y };
    dragged = false;
  }

  function onClick(event: MouseEvent) {
    if (forwarding) return;
    if (swallowNext) {
      swallowNext = false;
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (!ours(event.target)) return;
    const target = event.target as Node | null;
    const onPage = Boolean(target && (target === wrapper || wrapper.contains(target)));
    const hit = hitCloth(event.clientX, event.clientY);
    if (!hit) {
      if (onPage) {
        event.preventDefault();
        event.stopPropagation();
      }
      return;
    }
    if (!hit.front) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const point = pageClient(hit);
    if (onPage && Math.hypot(point.x - event.clientX, point.y - event.clientY) <= 3) return;
    event.preventDefault();
    event.stopPropagation();
    const under = document.elementFromPoint(point.x, point.y);
    if (!under || !content.contains(under)) return;
    forwarding = true;
    try {
      under.dispatchEvent(
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
      const field = (under as Element).closest?.("input, textarea, select, [contenteditable]");
      if (field instanceof HTMLElement) field.focus();
    } finally {
      forwarding = false;
    }
  }

  function onPointerMove(event: PointerEvent) {
    const p = local(event);
    const now = performance.now() / 1000;
    if (event.isPrimary) {
      hoverAt.x = event.clientX;
      hoverAt.y = event.clientY;
      hoverAt.target = event.target;
      hoverAt.on = true;
      updateHover();
    }
    if (selecting) {
      if (!(event.buttons & 1)) {
        selecting = false;
      } else {
        const hit = hitCloth(event.clientX, event.clientY);
        const caret = hit && hit.front ? caretAt(pageClient(hit).x, pageClient(hit).y) : null;
        const selection = window.getSelection();
        if (caret && selection?.anchorNode && content.contains(caret.node)) {
          selection.extend(caret.node, caret.offset);
        }
      }
    }
    const near =
      p.x >= -40 && p.y >= -40 && p.x <= width + 40 && p.y <= height + 40;
    if (!near && held < 0 && !pending) {
      pointer.inside = false;
      return;
    }
    if (pointer.inside) {
      const dt = Math.max(now - pointer.time, 1 / 240);
      const vx = Math.max(-2400, Math.min(2400, (p.x - pointer.x) / dt));
      const vy = Math.max(-2400, Math.min(2400, (p.y - pointer.y) / dt));
      pointer.vx += (vx - pointer.vx) * 0.4;
      pointer.vy += (vy - pointer.vy) * 0.4;
      pointer.energy = Math.min(1, pointer.energy + Math.hypot(vx, vy) / 3000);
    }
    pointer.x = p.x;
    pointer.y = p.y;
    pointer.time = now;
    pointer.inside = true;

    if (pending && pending.id === event.pointerId && held < 0) {
      if (Math.hypot(p.x - pending.x, p.y - pending.y) > 5) {
        if (grab(pending.x, pending.y)) {
          dragged = true;
          window.getSelection()?.removeAllRanges();
          wrapper.style.userSelect = "none";
          wrapper.style.cursor = "grabbing";
          try {
            wrapper.setPointerCapture(event.pointerId);
          } catch {}
        }
        pending = null;
      }
    }
    if (held >= 0) {
      window.getSelection()?.removeAllRanges();
      aim(p.x, p.y);
    }
    start();
  }

  function onPointerUp(event: PointerEvent) {
    pending = null;
    selecting = false;
    if (held < 0) return;
    release();
    wrapper.style.userSelect = "";
    wrapper.style.cursor = "";
    try {
      wrapper.releasePointerCapture(event.pointerId);
    } catch {}
    if (dragged) {
      swallowNext = true;
      window.setTimeout(() => {
        swallowNext = false;
      }, 0);
    }
    dragged = false;
    start();
  }

  function onDocumentLeave() {
    hoverAt.on = false;
    updateHover();
  }
  document.documentElement.addEventListener("pointerleave", onDocumentLeave);

  window.addEventListener("pointerdown", onPointerDown, true);
  window.addEventListener("click", onClick, true);
  window.addEventListener("pointermove", onPointerMove, { passive: true });
  window.addEventListener("pointerup", onPointerUp);
  window.addEventListener("pointercancel", onPointerUp);

  return {
    setOptions(next) {
      next = resolveOptions(DEFAULTS, next);
      let changed = false;
      for (const [key, value] of Object.entries(next)) {
        const prevValue = config[key as keyof typeof config];
        if (Array.isArray(value) && Array.isArray(prevValue)) {
          if (value.some((item, i) => item !== prevValue[i])) changed = true;
        } else if (prevValue !== value) {
          changed = true;
        }
        if (changed) break;
      }
      if (!changed) return;
      const pinChanged = next.pin !== undefined && next.pin !== config.pin;
      const floatChanged = next.float !== undefined && next.float !== config.float;
      Object.assign(config, next);
      if (pinChanged) {
        release();
        applyPins();
      }
      if (floatChanged && !config.float) {
        linkLength.set(baseLength);
        recover = 1;
      }
      syncBacking();
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
      document.removeEventListener("visibilitychange", syncVisibility);
      themeObserver.disconnect();
      schemeQuery.removeEventListener("change", onThemeShift);
      window.clearTimeout(themeTimer);
      motionQuery.removeEventListener("change", onMotionChange);
      window.removeEventListener("pointerdown", onPointerDown, true);
      document.documentElement.removeEventListener("pointerleave", onDocumentLeave);
      content.removeEventListener("scroll", onHoverScroll, true);
      hoverAt.on = false;
      setHover(null);
      force(null, "");
      content.removeAttribute(CONTENT_ATTR);
      window.removeEventListener("click", onClick, true);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      wrapper.style.userSelect = "";
      wrapper.style.cursor = "";
      for (const texture of [contentTexture, posTexture, nrmTexture, broadTexture]) {
        texture?.destroy();
      }
      contentTexture = posTexture = nrmTexture = broadTexture = null;
      for (const t of [sceneTarget, ...shadowTargets]) destroyTarget(t);
      sceneTarget = null;
      shadowTargets = [];
      mesh?.destroy();
      mesh = null;
      clothDraw = shadowDraw = null;
      screen?.dispose();
      screen = null;
      paintable.onpaint = null;
    },
  };
}

function mix(a: number, b: number, t: number) {
  return a + (b - a) * t;
}
