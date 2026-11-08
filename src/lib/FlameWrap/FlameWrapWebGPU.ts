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

export interface FlameWrapOptions {
  /** Flame color as [r, g, b] in 0-1 range. */
  color?: [number, number, number];
  /** Overall brightness of the fire (0 to 3). */
  intensity?: number;
  /** Reach of the flames above the top edge in CSS pixels. */
  height?: number;
  /** Reach of the glow on the sides and bottom in CSS pixels. */
  spread?: number;
  /** Corner radius of the burning outline in CSS pixels. Match your content. */
  radius?: number;
  /** Animation speed multiplier for the whole effect. */
  speed?: number;
  /** Flame detail from 0 (broad licks) to 1 (fine licks). */
  scale?: number;
  /** Amplitude of the turbulence waves shaping the flames (0 to 1). */
  turbulence?: number;
  /** Frequency multiplier of the turbulence waves (0.2 to 3). */
  turbulenceScale?: number;
  /** How far from the edges the heat warps the content, in CSS pixels. */
  turbulenceReach?: number;
  /** Brightness of the spark highlights (0 to 3). 0 disables them. */
  sparks?: number;
  /** Size multiplier for individual sparks (0.2 to 3). */
  sparkSize?: number;
  /** How many sparks fly at once (0.3 to 2.5). */
  sparkDensity?: number;
  /** How fast sparks rise and flicker (0.1 to 3). */
  sparkSpeed?: number;
  /** Strength of the molten glow hugging the edges (0 to 3). */
  rim?: number;
  /** How far the flames eat into the content silhouette in CSS pixels. */
  melt?: number;
  /** Heat shimmer displacement of the content near the edges in CSS pixels. */
  distortion?: number;
  /** Amount of smoke drifting off the flames (0 to 2). */
  smoke?: number;
  /** Brightness of the glowing ember line on the burnt edges (0 to 2). */
  ember?: number;
  /** Darkness of the charred band on the content edges (0 to 2). */
  scorch?: number;
}

export interface FlameWrapElements {
  /** Canvas with layoutsubtree that hosts the HTML content. */
  source: HTMLCanvasElement;
  /** The element inside the source canvas that gets captured. */
  content: HTMLElement;
  /** Canvas the WebGPU effect renders to. */
  output: HTMLCanvasElement;
}

export interface FlameWrapInstance {
  /** Update effect options live. */
  setOptions: (options: FlameWrapOptions) => void;
  /** Re-read canvas size. Call when the element is resized. */
  resize: () => void;
  /** Stop the loop and release all GPU resources. */
  destroy: () => void;
}

const DEFAULTS: Required<FlameWrapOptions> = {
  color: [0.31, 0.54, 1],
  intensity: 0.5,
  height: 170,
  spread: 8,
  radius: 40,
  speed: 0.25,
  scale: 0.75,
  turbulence: 0.5,
  turbulenceScale: 0.5,
  turbulenceReach: 25,
  sparks: 1.5,
  sparkSize: 0.35,
  sparkDensity: 1,
  sparkSpeed: 1,
  rim: 2.5,
  melt: 4.5,
  distortion: 10,
  smoke: 1.5,
  ember: 2,
  scorch: 0,
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
  color: vec4f,
  resolution: vec2f,
  rectCenter: vec2f,
  rectHalf: vec2f,
  time: f32,
  corner: f32,
  intensity: f32,
  height: f32,
  spread: f32,
  scale: f32,
  turbulence: f32,
  turbScale: f32,
  turbReach: f32,
  sparks: f32,
  sparkSize: f32,
  sparkDensity: f32,
  sparkSpeed: f32,
  rim: f32,
  melt: f32,
  distortion: f32,
  smoke: f32,
  ember: f32,
  scorch: f32,
  hasContent: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var uContent: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

fn mod2(x: vec2f, y: f32) -> vec2f {
  return x - vec2f(y) * floor(x / vec2f(y));
}

fn mod3(x: vec3f, y: f32) -> vec3f {
  return x - vec3f(y) * floor(x / vec3f(y));
}

fn permute(x: vec3f) -> vec3f {
  return mod3(((x * 34.0) + vec3f(1.0)) * x, 289.0);
}

fn snoise(v: vec2f) -> f32 {
  let C = vec4f(
    0.211324865405187, 0.366025403784439,
    -0.577350269189626, 0.024390243902439,
  );
  var i = floor(v + dot(v, C.yy));
  let x0 = v - i + dot(i, C.xx);
  let i1 = select(vec2f(0.0, 1.0), vec2f(1.0, 0.0), x0.x > x0.y);
  var x12 = vec4f(x0.x, x0.y, x0.x, x0.y) + C.xxzz;
  x12 = vec4f(x12.x - i1.x, x12.y - i1.y, x12.z, x12.w);
  i = mod2(i, 289.0);
  let p = permute(
    permute(i.y + vec3f(0.0, i1.y, 1.0)) + i.x + vec3f(0.0, i1.x, 1.0),
  );
  var m = max(
    vec3f(0.5) - vec3f(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)),
    vec3f(0.0),
  );
  m = m * m;
  m = m * m;
  let x = 2.0 * fract(p * C.www) - vec3f(1.0);
  let h = abs(x) - vec3f(0.5);
  let ox = floor(x + vec3f(0.5));
  let a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);
  let gyz = a0.yz * x12.xz + h.yz * x12.yw;
  let g = vec3f(a0.x * x0.x + h.x * x0.y, gyz.x, gyz.y);
  return 130.0 * dot(m, g);
}

fn fbm(pIn: vec2f) -> f32 {
  let m = mat2x2f(vec2f(0.8, -0.6), vec2f(0.6, 0.8));
  var p = pIn;
  var v = 0.5 * snoise(p);
  p = m * p * 2.03 + vec2f(11.3, 7.1);
  v += 0.27 * snoise(p);
  p = m * p * 1.97 + vec2f(3.7, 19.1);
  v += 0.15 * snoise(p);
  p = m * p * 2.01 + vec2f(8.3, 2.9);
  v += 0.08 * snoise(p);
  return v * 0.5 + 0.5;
}

fn fbm2(p: vec2f) -> f32 {
  let m = mat2x2f(vec2f(0.8, -0.6), vec2f(0.6, 0.8));
  var v = 0.62 * snoise(p);
  v += 0.31 * snoise(m * p * 2.13 + vec2f(5.2, 1.3));
  return v * 0.54 + 0.5;
}

fn turbulence(pIn: vec2f) -> vec2f {
  var p = pIn;
  var freq = 12.0 * clamp(params.scale, 0.05, 1.0) * clamp(params.turbScale, 0.2, 3.0);
  var rot = mat2x2f(vec2f(0.6, -0.8), vec2f(0.8, 0.6));
  let rotStep = mat2x2f(vec2f(0.6, -0.8), vec2f(0.8, 0.6));
  for (var i = 0; i < 7; i++) {
    let phase = freq * (p * rot).y + 6.0 * params.time + f32(i);
    p += params.turbulence * rot[0] * sin(phase) / freq;
    rot = rot * rotStep;
    freq *= 1.2;
  }
  return p;
}

fn hash3(p: vec2f) -> vec3f {
  let q = vec3f(
    dot(p, vec2f(127.1, 311.7)),
    dot(p, vec2f(269.5, 183.3)),
    dot(p, vec2f(419.2, 371.9)),
  );
  return fract(sin(q) * 43758.5453);
}

fn sdRoundRect(p: vec2f, b: vec2f, r: f32) -> f32 {
  let q = abs(p) - b + vec2f(r);
  return length(max(q, vec2f(0.0))) + min(max(q.x, q.y), 0.0) - r;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let frag = vec2f(uv.x, 1.0 - uv.y) * params.resolution;
  let rel = frag - params.rectCenter;
  let unit = max(params.height, 24.0);
  let corner = min(params.corner, min(params.rectHalf.x, params.rectHalf.y));
  let spreadPx = max(params.spread, 8.0);
  let t = params.time;
  let detail = clamp(params.scale, 0.05, 1.0);

  let d0 = sdRoundRect(rel, params.rectHalf, corner);
  let px = rel.x / unit;
  let py = rel.y / unit;

  let yA = max(rel.y - params.rectHalf.y, 0.0) / unit;
  let sway = snoise(vec2f(px * 1.1, t * 0.5)) * 0.55
    + snoise(vec2f(px * 2.4, t * 0.9 + 41.0)) * 0.25;
  let sx = px + yA * sway;
  let env = fbm2(vec2f(sx * 1.6 * detail + 3.7, t * 0.55 - yA * 0.4));
  let env2 = fbm2(vec2f(sx * 3.6 * detail, t * 0.85 + 17.0 - yA * 0.6));
  let tongue = clamp(
    0.75 * smoothstep(0.3, 0.9, env) + 0.5 * smoothstep(0.4, 0.95, env2),
    0.0,
    1.0,
  );

  let meltPx = max(params.melt, 1.0);
  let biteTop = (3.0 + meltPx * 1.4) * (0.35 + 0.65 * tongue)
    + 2.0 * snoise(vec2f(px * 5.0 * detail, t * 1.1 + 5.0));
  let yF = params.rectHalf.y - biteTop;
  let frontTop = rel.y - yF;

  let perim = fbm2(rel * (1.9 / unit) * detail + vec2f(0.0, t * 0.4) + vec2f(31.0));
  let biteSB = 3.0 + meltPx * (0.25 + 0.75 * perim);
  let frontSB = d0 + biteSB;

  let wTop = smoothstep(-0.62 * unit, -0.1 * unit, rel.y - params.rectHalf.y)
    * smoothstep(10.0, -30.0, abs(rel.x) - (params.rectHalf.x - corner));
  let front = mix(frontSB, frontTop, wTop);

  let reach = mix(
    spreadPx * 0.9,
    unit * (0.2 + 0.45 * tongue),
    wTop,
  );
  let q = front / reach;

  var np = vec2f(px * 2.3, py * 1.25 - t * 1.85) * detail;
  np = turbulence(np);
  let n = fbm(np);

  let win = smoothstep(-0.08, 0.02, q);
  let root = exp(-abs(q) * 5.0);
  let ridge = 1.0 - abs(2.0 * n - 1.0);
  let flameH = mix(1.0, 0.5 + 0.6 * tongue, wTop);
  var g = max(q, 0.0) / flameH;
  let shred = fbm2(np * 1.9 + vec2f(63.0));
  g *= 1.0 + 0.7 * (shred - 0.5) * smoothstep(0.2, 0.8, g);
  var dens = n * 0.95 + ridge * 0.45 - 0.18
    + (1.0 - min(g, 1.0)) * 0.3
    - g * (0.9 + 0.25 * n);
  dens = clamp(dens * 2.4, 0.0, 1.0) * win;
  dens *= mix(1.0 - smoothstep(0.32, 1.05, q), 1.0 - smoothstep(0.9, 1.2, g), wTop);
  let body = dens * dens * (3.0 - 2.0 * dens);
  let emis = clamp(params.intensity, 0.0, 2.0);
  var e = body * (0.55 + 0.75 * root) * (0.45 + 0.55 * n)
    + win * root * (0.1 + 0.4 * n);
  e *= mix(0.45, 1.0, wTop) * max(emis, 0.001);

  let hot = mix(params.color.rgb, vec3f(1.0), 0.35);
  let deep = mix(params.color.rgb, params.color.rgb * params.color.rgb, 0.5) * 0.9;
  let ramp = 1.0 - exp(-e * 2.4);
  var fireCol = mix(deep, params.color.rgb, smoothstep(0.0, 0.55, ramp));
  let core = ramp * (0.45 + 0.55 * exp(-g * 2.2)) * (0.5 + 0.5 * n);
  fireCol = mix(fireCol, hot, smoothstep(0.7, 1.05, core));
  fireCol *= 0.8 + 0.4 * ramp;
  var fireA = clamp(1.0 - exp(-e * 3.4), 0.0, 1.0);

  var halo = exp(-max(front, 0.0) / (spreadPx * 1.2)) * smoothstep(0.0, 3.0, front)
    * (0.5 + 0.5 * n) * 0.3 * clamp(params.rim, 0.0, 2.0) * mix(1.0, 0.45, wTop);
  var glow = params.color.rgb * halo * clamp(params.intensity, 0.0, 2.0);

  if (params.sparks > 0.001) {
    let sSpeed = max(params.sparkSpeed, 0.05);
    let sCells = 5.0 * clamp(params.sparkDensity, 0.3, 2.5);
    let sSize = clamp(params.sparkSize, 0.2, 3.0);
    let gate = smoothstep(-0.05, 0.1, q) * (1.0 - smoothstep(1.3, 2.2, q)) * wTop;
    var spark = 0.0;
    for (var li = 0; li < 2; li++) {
      let L = f32(li);
      let speed = 1.5 * sSpeed * (0.75 + 0.5 * L);
      var ps = vec2f(px, py - t * speed);
      ps.x += 0.08 * snoise(vec2f(py * 0.9 + L * 5.0, t * 0.5));
      let cells = sCells * (1.0 + 0.6 * L);
      let cl = floor(ps * cells) + vec2f(L * 19.0);
      let fr = fract(ps * cells);
      let rnd = hash3(cl);
      let rnd2 = hash3(cl + vec2f(7.3));
      let on = step(rnd2.x, 0.42);
      let life = fract(rnd.z + t * sSpeed * (0.3 + 0.5 * rnd2.x));
      var ppos = vec2f(0.5) + 0.56 * (rnd.xy - vec2f(0.5));
      ppos.x += 0.14 * sin(t * (0.7 + rnd.z * 2.8) + rnd.y * 6.2832)
        + 0.1 * snoise(vec2f(t * 0.6 + rnd.x * 9.0, cl.y * 0.7))
        + (life - 0.5) * 0.5 * (rnd2.y - 0.5);
      ppos.y += (life - 0.5) * 0.3 * rnd2.y;
      var tw = smoothstep(0.02, 0.2, life) * smoothstep(1.0, 0.55, life);
      tw *= 0.75 + 0.25 * sin(t * (6.0 + rnd2.z * 9.0) + rnd.x * 6.2832);
      var pd = (fr - ppos) / cells * unit;
      pd.y *= 0.55 + 0.3 * rnd2.z;
      let dp = length(pd);
      let r = (0.004 + 0.014 * rnd.y * rnd.y) * unit * sSize
        * mix(1.15, 0.55, life);
      let bmask = smoothstep(0.5, 0.32, max(abs(fr.x - 0.5), abs(fr.y - 0.5)));
      let sbody = exp(-dp * dp / (r * r));
      let sbloom = exp(-dp * dp / (r * r * 6.0)) * 0.3;
      spark += (sbody + sbloom) * tw * tw * on * bmask * (1.0 - 0.35 * L);
    }
    spark *= gate * params.sparks;
    fireCol += mix(params.color.rgb, vec3f(1.0), 0.55) * spark * 1.6;
    fireA = clamp(fireA + spark * 0.85, 0.0, 1.0);
  }

  let edgePx = min(frag, params.resolution - frag);
  let fadeW = max(24.0, spreadPx * 0.75);
  let fade = smoothstep(0.0, fadeW, edgePx.x) * smoothstep(0.0, fadeW, edgePx.y);
  fireA *= fade;
  glow *= fade;
  halo *= fade;

  let wisp = smoothstep(0.45, 0.9, fbm2(np * 0.55 + vec2f(0.0, 17.0)));
  let smoke = smoothstep(1.55, 1.05, g) * smoothstep(0.85, 1.15, g)
    * (1.0 - body) * wTop
    * wisp * 0.055 * clamp(params.smoke, 0.0, 2.0) * fade;
  let smokeCol = mix(vec3f(0.5), params.color.rgb, 0.5);

  if (params.hasContent < 0.5) {
    let sA = clamp(smoke, 0.0, 1.0);
    let a = clamp(fireA + sA * (1.0 - fireA), 0.0, 1.0);
    return vec4f(
      fireCol * fireA + glow + smokeCol * sA * (1.0 - fireA),
      clamp(a + halo * 0.6, 0.0, 1.0),
    );
  }

  let cUv = (rel + params.rectHalf) / (2.0 * params.rectHalf);
  let inRect = step(abs(cUv.x - 0.5), 0.5) * step(abs(cUv.y - 0.5), 0.5);

  let heatBand = exp(-abs(front) / max(params.turbReach, 4.0));
  let wob = vec2f(
    snoise(np * 1.7 + vec2f(9.0)),
    snoise(np * 1.7 + vec2f(27.0)),
  );
  let disp = wob * min(params.distortion, 32.0) * heatBand;
  let cUvD = clamp(cUv + disp / (2.0 * params.rectHalf), vec2f(0.002), vec2f(0.998));
  var content = textureSampleLevel(uContent, uSampler, vec2f(cUvD.x, 1.0 - cUvD.y), 0.0);

  let burn = clamp(params.intensity, 0.0, 1.0);
  let depth = max(-front, 0.0);
  let charPatch = 0.5 + 0.5 * fbm2(rel * (2.6 / unit) * detail + vec2f(57.0));
  let charW = mix(4.0, 6.0 + meltPx * 1.6, wTop) * charPatch;
  let charT = 1.0 - smoothstep(charW, charW * 2.4, depth);
  content = vec4f(
    mix(
      content.rgb,
      content.rgb * vec3f(0.22, 0.19, 0.17),
      clamp(charT * 0.85 * burn * clamp(params.scorch, 0.0, 2.0), 0.0, 1.0),
    ),
    content.a,
  );

  let emberW = mix(2.5, 5.5, wTop);
  let emberN = 0.3 + 0.7 * fbm2(np * 2.2 + vec2f(73.0));
  let emberK = clamp(params.ember, 0.0, 2.0);
  let ember = exp(-depth / emberW) * emberN * emberK;
  let whiteHot = exp(-depth / (emberW * 0.4)) * emberN * emberN * emberK;
  content = vec4f(
    mix(content.rgb, params.color.rgb * 1.2, clamp(ember, 0.0, 1.0) * burn),
    content.a,
  );
  content = vec4f(
    mix(
      content.rgb,
      mix(params.color.rgb, vec3f(1.0), 0.3) * 1.2,
      clamp(whiteHot, 0.0, 1.0) * burn,
    ),
    content.a,
  );

  let dn = fbm2(rel * (3.2 / unit) * detail + vec2f(0.0, t * 0.5) + vec2f(91.0));
  let dw = mix(2.0, 5.0, wTop);
  let dissolve = smoothstep(-dw, dw, front + (dn - 0.5) * dw * 2.5);
  let cA = content.a * (1.0 - dissolve) * inRect;
  let smk = smoke * (1.0 - cA);
  let baseA = min(cA + smk, 1.0);
  let base = content.rgb * cA + smokeCol * smk;
  let col = fireCol * fireA + base * (1.0 - fireA) + glow;
  let alpha = clamp(fireA + baseA * (1.0 - fireA) + halo * 0.5, 0.0, 1.0);
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

/** One WebGPU device per page, shared by every FlameWrap instance. */
function acquireGpu(): Promise<Gpu> {
  if (!sharedGpu) {
    sharedGpu = init().catch((error) => {
      sharedGpu = null;
      throw error;
    });
  }
  return sharedGpu;
}

export function createFlameWrap(
  elements: FlameWrapElements,
  options: FlameWrapOptions = {},
): FlameWrapInstance | null {
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

  const rect = { cx: 0, cy: 0, hx: 1, hy: 1 };
  let dpr = 1;

  function syncCanvasSize() {
    dpr = getCanvasPixelRatio(output);
    const width = Math.max(1, Math.round(output.clientWidth * dpr));
    const height = Math.max(1, Math.round(output.clientHeight * dpr));
    if (screen) {
      const [w, h] = screen.size;
      if (w !== width || h !== height) screen.resize([width, height]);
    } else if (output.width !== width || output.height !== height) {
      output.width = width;
      output.height = height;
    }
    const box = htmlInCanvas ? source : content;
    const outRect = output.getBoundingClientRect();
    const boxRect = box.getBoundingClientRect();
    if (outRect.width > 0 && boxRect.width > 0) {
      rect.cx = (boxRect.left + boxRect.right) / 2 - outRect.left;
      rect.cy = outRect.bottom - (boxRect.top + boxRect.bottom) / 2;
      rect.hx = boxRect.width / 2;
      rect.hy = boxRect.height / 2;
    }
    if (htmlInCanvas) {
      const sourceWidth = Math.max(1, Math.round(source.clientWidth * dpr));
      const sourceHeight = Math.max(1, Math.round(source.clientHeight * dpr));
      if (
        source.width !== sourceWidth ||
        source.height !== sourceHeight
      ) {
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
        label: "flame-wrap.content",
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
    sourceCtx!.clearRect(0, 0, source.width, source.height);
  }

  let time = 0;

  function render() {
    if (!gpu || !fx || !screen) return;
    uploadContent();
    const [width, height] = screen.size;
    fx.set({
      params: {
        color: [config.color[0], config.color[1], config.color[2], 0],
        resolution: [width, height],
        time,
        rectCenter: [rect.cx * dpr, rect.cy * dpr],
        rectHalf: [Math.max(rect.hx * dpr, 1), Math.max(rect.hy * dpr, 1)],
        corner: Math.max(config.radius, 0) * dpr,
        intensity: Math.max(config.intensity, 0),
        height: Math.max(config.height, 24) * dpr,
        spread: Math.max(config.spread, 8) * dpr,
        scale: Math.max(config.scale, 0.05),
        turbulence: Math.max(config.turbulence, 0),
        turbScale: Math.max(config.turbulenceScale, 0.2),
        turbReach: Math.max(config.turbulenceReach, 4) * dpr,
        sparks: Math.max(config.sparks, 0),
        sparkSize: Math.max(config.sparkSize, 0.2),
        sparkDensity: Math.max(config.sparkDensity, 0.3),
        sparkSpeed: Math.max(config.sparkSpeed, 0.05),
        rim: Math.max(config.rim, 0),
        melt: Math.max(config.melt, 0) * dpr,
        distortion: Math.max(config.distortion, 0) * dpr,
        smoke: Math.max(config.smoke, 0),
        ember: Math.max(config.ember, 0),
        scorch: Math.max(config.scorch, 0),
        hasContent: htmlInCanvas ? 1 : 0,
      },
    });
    gpuFrame(gpu, (f) => f.pass(screen!, fx!));
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
    if (!reducedMotion) time += delta * config.speed;
    render();
    if (reducedMotion && !contentDirty) {
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
        label: "flame-wrap",
      });
      const linear = sampler(gpu, {
        minFilter: "linear",
        magFilter: "linear",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
      });
      fx = effect(gpu, SHADER, {
        label: "flame-wrap",
        set: { uSampler: linear, uContent: ensureContentTexture() },
      });
      syncCanvasSize();
      start();
    })
    .catch((error) => {
      if (destroyed) return;
      console.warn(
        "FlameWrap: WebGPU unavailable, showing content without the effect.",
        error,
      );
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

  return {
    setOptions(next) {
      let changed = false;
      for (const [key, value] of Object.entries(next)) {
        const prev = config[key as keyof typeof config];
        if (Array.isArray(value) && Array.isArray(prev)) {
          if (
            value.length !== prev.length ||
            value.some((item, i) => item !== prev[i])
          ) {
            changed = true;
            break;
          }
        } else if (prev !== value) {
          changed = true;
          break;
        }
      }
      Object.assign(config, next);
      if (!changed) return;
      syncCanvasSize();
      start();
    },
    resize() {
      syncCanvasSize();
      start();
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      observer.disconnect();
      intersection.disconnect();
      motionQuery.removeEventListener("change", onMotionChange);
      contentTexture?.destroy();
      screen?.dispose();
      if (htmlInCanvas) paintable.onpaint = null;
    },
  };
}
