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
  type Texture,
} from "vgpu";

export type ForceFieldShape = "hexagon" | "triangle" | "square";

export type ForceFieldGridReveal = "always" | "hover" | "click" | "both";

export interface ForceFieldOptions {
  /** Cell shape of the energy lattice. */
  shape?: ForceFieldShape;
  /** Field color as [r, g, b] in 0-1 range. */
  color?: [number, number, number];
  /** Color of the dissolve edge glow as [r, g, b] in 0-1 range. */
  edgeColor?: [number, number, number];
  /** Overall field opacity (0 to 1). */
  opacity?: number;
  /** Cells across the shorter screen axis (4 to 80). */
  cellScale?: number;
  /** Thickness of the lattice lines (0.005 to 0.2). */
  lineWidth?: number;
  /** Brightness of the lattice grid (0 to 1). */
  gridOpacity?: number;
  /** How the lattice is revealed: always visible, near the cursor, by click ripples, or both. */
  gridReveal?: ForceFieldGridReveal;
  /** Brightness of the revealed lattice in hover/click/both modes (0 to 3). */
  gridRevealStrength?: number;
  /** Radius of the hover reveal in CSS pixels (60 to 800). */
  gridRevealRadius?: number;
  /** Fade smoothness of the reveal edge (0.02 to 1). */
  gridFade?: number;
  /** Random per-cell flash speed (0 to 4). */
  flashSpeed?: number;
  /** Random per-cell flash brightness (0 to 1). */
  flashIntensity?: number;
  /** Scale of the drifting energy noise (0.5 to 12). */
  flowScale?: number;
  /** Drift speed of the energy noise (0 to 4). */
  flowSpeed?: number;
  /** Brightness of the energy noise (0 to 4). */
  flowIntensity?: number;
  /** Glow creeping in from the screen edges, the fresnel analog (0 to 4). */
  edgeGlow?: number;
  /** How far the edge glow reaches into the screen (0.02 to 0.6). */
  edgeFalloff?: number;
  /** Reveal progress. 1 is fully materialized, 0 is gone (noise dissolve). */
  reveal?: number;
  /** Scale of the dissolve noise (0.5 to 12). */
  dissolveScale?: number;
  /** Width of the burning dissolve edge (0.005 to 0.2). */
  dissolveWidth?: number;
  /** Brightness of the dissolve edge (0 to 12). */
  dissolveGlow?: number;
  /** Expansion speed of click ripples in screens per second (0.1 to 4). */
  rippleSpeed?: number;
  /** Ring thickness of click ripples (0.01 to 0.4). */
  rippleWidth?: number;
  /** How softly ripple rings feather into the page, 0 is tight, 1 is airy (0 to 1). */
  rippleBlend?: number;
  /** Lifetime of one ripple in seconds (0.3 to 5). */
  rippleDuration?: number;
  /** Brightness of ripples and impact flashes (0 to 8). */
  rippleIntensity?: number;
  /** Max radius a ripple can reach, in screens (0.1 to 2). */
  rippleMaxRadius?: number;
  /** Radius of the cell flash burst around an impact (0 to 0.5). */
  impactRadius?: number;
  /** How much ripples push the page outward and warp the lattice (0 to 60). */
  refraction?: number;
  /** Chromatic aberration inside refracted rings (0 to 8). */
  aberration?: number;
  /** Living heat-haze shimmer that warps the page beneath the field (0 to 2). */
  haze?: number;
  /** Lattice reacts to the page: cells over bright content glow brighter (0 to 1). */
  pageReact?: number;
  /** Tints the page toward the field color, like looking through the shield (0 to 1). */
  tint?: number;
  /** Glow following the cursor (0 to 3). */
  hoverGlow?: number;
  /** Radius of the cursor glow in CSS pixels (40 to 600). */
  hoverRadius?: number;
  /** Cells light up when the cursor crosses them (0 to 2). */
  hoverCharge?: number;
  /** Fade the field out around the cursor instead of intensifying it. */
  hideOnHover?: boolean;
  /** How much the page dims beneath the field (0 to 1). */
  dim?: number;
  /** Bloom amount applied to bright field energy (0 to 3). */
  bloom?: number;
  /** Bloom brightness cutoff (0 to 1). */
  bloomThreshold?: number;
  /** Animated film grain over the field (0 to 1). */
  grain?: number;
  /** Spawn ripples on click (default true). */
  clickRipples?: boolean;
  /** Called with the impact position in CSS pixels after each click. */
  onHit?: (x: number, y: number) => void;
}

export interface ForceFieldElements {
  /** Canvas with layoutsubtree that hosts the HTML content. */
  source: HTMLCanvasElement;
  /** The element inside the source canvas that gets captured. */
  content: HTMLElement;
  /** Canvas the WebGPU effect renders to. */
  output: HTMLCanvasElement;
}

export interface ForceFieldInstance {
  /** Update effect options live. */
  setOptions: (options: ForceFieldOptions) => void;
  /** Spawn a ripple at CSS pixel coordinates relative to the output canvas. */
  impact: (x: number, y: number) => void;
  /** Re-read canvas size. Call when the element is resized. */
  resize: () => void;
  /** Stop the loop and release all GPU resources. */
  destroy: () => void;
}

const MAX_HITS = 10;
const MIPS = 4;

const DEFAULTS: Required<Omit<ForceFieldOptions, "onHit">> & {
  onHit: ((x: number, y: number) => void) | null;
} = {
  shape: "hexagon",
  color: [0.15, 0.68, 1],
  edgeColor: [0.5, 0.8, 1],
  opacity: 0.9,
  cellScale: 16,
  lineWidth: 0.03,
  gridOpacity: 0.15,
  gridReveal: "click",
  gridRevealStrength: 1.5,
  gridRevealRadius: 250,
  gridFade: 0.35,
  flashSpeed: 0.6,
  flashIntensity: 0.1,
  flowScale: 3,
  flowSpeed: 0.5,
  flowIntensity: 0,
  edgeGlow: 0.2,
  edgeFalloff: 0.18,
  reveal: 1,
  dissolveScale: 3.5,
  dissolveWidth: 0.05,
  dissolveGlow: 6,
  rippleSpeed: 0.5,
  rippleWidth: 0.045,
  rippleBlend: 1,
  rippleDuration: 1.6,
  rippleIntensity: 0.1,
  rippleMaxRadius: 0.85,
  impactRadius: 0.16,
  refraction: 30,
  aberration: 2.5,
  haze: 0.5,
  pageReact: 0,
  tint: 0.1,
  hoverGlow: 0.25,
  hoverRadius: 350,
  hoverCharge: 1.6,
  hideOnHover: false,
  dim: 0,
  bloom: 1,
  bloomThreshold: 0.3,
  grain: 0.2,
  clickRipples: true,
  onHit: null,
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

const FIELD_SHADER = /* wgsl */ `
struct FieldParams {
  hits: array<vec4f, 10>,
  resolution: vec2f,
  color: vec3f,
  edgeColor: vec3f,
  mouse: vec2f,
  time: f32,
  shape: f32,
  opacity: f32,
  cellScale: f32,
  lineWidth: f32,
  gridOpacity: f32,
  gridRevealMode: f32,
  gridRevealStrength: f32,
  gridRevealRadius: f32,
  gridFade: f32,
  flashSpeed: f32,
  flashIntensity: f32,
  flowScale: f32,
  flowSpeed: f32,
  flowIntensity: f32,
  edgeGlow: f32,
  edgeFalloff: f32,
  reveal: f32,
  dissolveScale: f32,
  dissolveWidth: f32,
  dissolveGlow: f32,
  rippleSpeed: f32,
  rippleWidth: f32,
  rippleDuration: f32,
  rippleIntensity: f32,
  rippleMaxRadius: f32,
  impactRadius: f32,
  rippleBlend: f32,
  refraction: f32,
  aberration: f32,
  hoverGlow: f32,
  hoverRadius: f32,
  hoverCharge: f32,
  hideOnHover: f32,
  scroll: f32,
  haze: f32,
  pageReact: f32,
  tint: f32,
  dim: f32,
  hasContent: f32,
  pageLum: f32,
}

struct FieldOut {
  @location(0) color: vec4f,
  @location(1) emission: vec4f,
}

@group(0) @binding(0) var<uniform> params: FieldParams;
@group(0) @binding(1) var uContent: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

fn mod289v3(x: vec3f) -> vec3f { return x - floor(x * (1.0 / 289.0)) * 289.0; }
fn mod289v4(x: vec4f) -> vec4f { return x - floor(x * (1.0 / 289.0)) * 289.0; }
fn permute(x: vec4f) -> vec4f { return mod289v4(((x * 34.0) + 1.0) * x); }
fn taylorInvSqrt(r: vec4f) -> vec4f { return 1.79284291400159 - 0.85373472095314 * r; }

fn snoise(v: vec3f) -> f32 {
  let C = vec2f(1.0 / 6.0, 1.0 / 3.0);
  let D = vec4f(0.0, 0.5, 1.0, 2.0);
  var i = floor(v + dot(v, C.yyy));
  let x0 = v - i + dot(i, C.xxx);
  let g = step(x0.yzx, x0.xyz);
  let l = 1.0 - g;
  let i1 = min(g.xyz, l.zxy);
  let i2 = max(g.xyz, l.zxy);
  let x1 = x0 - i1 + C.xxx;
  let x2 = x0 - i2 + C.yyy;
  let x3 = x0 - D.yyy;
  i = mod289v3(i);
  let p = permute(permute(permute(
    i.z + vec4f(0.0, i1.z, i2.z, 1.0))
    + i.y + vec4f(0.0, i1.y, i2.y, 1.0))
    + i.x + vec4f(0.0, i1.x, i2.x, 1.0));
  let n_ = 0.142857142857;
  let ns = n_ * D.wyz - D.xzx;
  let j = p - 49.0 * floor(p * ns.z * ns.z);
  let x_ = floor(j * ns.z);
  let y_ = floor(j - 7.0 * x_);
  let x = x_ * ns.x + ns.yyyy;
  let y = y_ * ns.x + ns.yyyy;
  let h = 1.0 - abs(x) - abs(y);
  let b0 = vec4f(x.xy, y.xy);
  let b1 = vec4f(x.zw, y.zw);
  let s0 = floor(b0) * 2.0 + 1.0;
  let s1 = floor(b1) * 2.0 + 1.0;
  let sh = -step(h, vec4f(0.0));
  let a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  let a1 = b1.xzyw + s1.xzyw * sh.zzww;
  var p0 = vec3f(a0.xy, h.x);
  var p1 = vec3f(a0.zw, h.y);
  var p2 = vec3f(a1.xy, h.z);
  var p3 = vec3f(a1.zw, h.w);
  let norm = taylorInvSqrt(vec4f(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;
  var m = max(0.6 - vec4f(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), vec4f(0.0));
  m = m * m;
  return 42.0 * dot(m * m, vec4f(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

fn hash21(pIn: vec2f) -> f32 {
  var p = fract(pIn * vec2f(234.34, 435.345));
  p += dot(p, p + 34.23);
  return fract(p.x * p.y);
}

fn hexCell(p: vec2f) -> vec4f {
  let s = vec2f(1.0, 1.7320508);
  let hC = floor(vec4f(p, p - vec2f(0.5, 1.0)) / s.xyxy) + 0.5;
  let h = vec4f(p - hC.xy * s, p - (hC.zw + 0.5) * s);
  let first = dot(h.xy, h.xy) < dot(h.zw, h.zw);
  let local = select(h.zw, h.xy, first);
  let id = select(hC.zw + 0.5, hC.xy, first);
  let cell = abs(local);
  let d = max(dot(cell, s * 0.5), cell.x);
  return vec4f(d, 0.5, id);
}

fn triCell(p: vec2f) -> vec4f {
  let l = vec2f(p.x - p.y * 0.57735027, p.y * 1.15470054);
  let id = floor(l);
  let f = l - id;
  let upper = step(1.0, f.x + f.y);
  var w = vec2f(f.x + f.y * 0.5, f.y * 0.8660254);
  w = mix(w, vec2f(1.5, 0.8660254) - w, upper);
  let d = min(
    w.y,
    min(
      dot(w, vec2f(0.8660254, -0.5)),
      dot(w - vec2f(1.0, 0.0), vec2f(-0.8660254, -0.5))
    )
  );
  return vec4f(0.2886751 - d, 0.2886751, id * 2.0 + vec2f(upper, 0.0));
}

fn squareCell(p: vec2f) -> vec4f {
  let id = floor(p);
  let f = fract(p) - 0.5;
  let a = abs(f);
  let d = max(a.x, a.y);
  return vec4f(d, 0.5, id);
}

fn cellInfo(p: vec2f) -> vec4f {
  if (params.shape < 0.5) { return hexCell(p); }
  if (params.shape < 1.5) { return triCell(p); }
  return squareCell(p);
}

fn cellFlash(id: vec2f) -> f32 {
  let rnd = hash21(id);
  let phase = rnd * 6.2831;
  let speed = 0.5 + rnd * 1.5;
  return smoothstep(0.6, 1.0, sin(params.time * params.flashSpeed * speed + phase)) * params.flashIntensity;
}

@fragment fn fs_main(@location(0) inUv: vec2f) -> FieldOut {
  let screenUv = vec2f(inUv.x, 1.0 - inUv.y);
  let frag = screenUv * params.resolution;
  let minAxis = min(params.resolution.x, params.resolution.y);
  let pageFrag = vec2f(frag.x, frag.y - params.scroll);
  let st = pageFrag / minAxis;

  var revealMask = 1.0;
  var dissolveEdge = 0.0;
  if (params.reveal < 0.999) {
    let dissolve = snoise(vec3f(st * params.dissolveScale, 3.7)) * 0.5 + 0.5;
    let revealGate = params.reveal * (1.0 + params.dissolveWidth * 2.0) - params.dissolveWidth;
    revealMask = smoothstep(revealGate - params.dissolveWidth, revealGate, 1.0 - dissolve);
    revealMask = 1.0 - revealMask;
    let edgeLow = smoothstep(revealGate - params.dissolveWidth, revealGate - params.dissolveWidth * 0.2, 1.0 - dissolve);
    let edgeHigh = smoothstep(revealGate - params.dissolveWidth * 0.15, revealGate, 1.0 - dissolve);
    dissolveEdge = edgeLow * (1.0 - edgeHigh) * step(0.001, params.reveal);
  }

  var ringContrib = 0.0;
  var impactBoost = 0.0;
  var pushVec = vec2f(0.0);
  let sigma = params.rippleWidth * mix(0.6, 2.6, params.rippleBlend);
  for (var i = 0u; i < 10u; i++) {
    let hit = params.hits[i];
    let elapsed = params.time - hit.z;
    let isActive = step(0.0, hit.z) * step(0.0, elapsed) * step(elapsed, params.rippleDuration);
    if (isActive < 0.5) { continue; }
    let toHit = (pageFrag - hit.xy) / minAxis;
    let dist = length(toHit);
    let ringR = min(elapsed * params.rippleSpeed, params.rippleMaxRadius);
    let noiseD = snoise(vec3f(st * 5.0, elapsed * 2.0 + f32(i))) * 0.03 * (1.0 - params.rippleBlend * 0.7);
    let band = dist + noiseD - ringR;
    let g = exp(-band * band / (2.0 * sigma * sigma));
    var fade = 1.0 - smoothstep(params.rippleDuration * 0.4, params.rippleDuration, elapsed);
    fade *= fade;
    let radialFade = 1.0 - smoothstep(params.rippleMaxRadius * 0.75, params.rippleMaxRadius, ringR);
    let contrib = g * fade * radialFade;
    ringContrib += contrib;
    let zone = smoothstep(params.impactRadius, 0.0, dist);
    let zoneFade = 1.0 - smoothstep(0.0, params.rippleDuration * 0.35, elapsed);
    impactBoost += zone * zoneFade;
    let dir = select(vec2f(0.0), toHit / dist, dist > 0.0001);
    let core = smoothstep(0.0, sigma * 2.5, dist) * smoothstep(0.0, sigma * 1.5, ringR);
    pushVec += dir * g * fade * radialFade * core;
  }
  ringContrib = min(ringContrib, 1.5);
  impactBoost = min(impactBoost, 1.0);

  let fieldSt = st - pushVec * (params.refraction * 1.4 / minAxis);
  let info = cellInfo(fieldSt * params.cellScale);
  let lineDist = info.x;
  let halfSize = info.y;
  let cellId = info.zw;
  let line = smoothstep(halfSize - params.lineWidth, halfSize, lineDist);
  let flash = cellFlash(cellId);

  var flowNoise = 0.0;
  var hazeVec = vec2f(0.0);
  if (params.flowIntensity > 0.001 || params.haze > 0.001) {
    let t = params.time * params.flowSpeed;
    let fn1 = snoise(vec3f(st * params.flowScale, t * 0.5));
    let fn2 = snoise(vec3f(st * params.flowScale * 2.1 + 7.3, -t * 0.35));
    flowNoise = (fn1 * 0.6 + fn2 * 0.4) * 0.5 + 0.5;
    hazeVec = vec2f(fn1, fn2) * params.haze;
  }

  let bp = min(frag, params.resolution - frag) / minAxis;
  let rr = max(params.edgeFalloff, 0.02);
  let hmix = clamp(0.5 + 0.5 * (bp.y - bp.x) / rr, 0.0, 1.0);
  let edgeDist = mix(bp.y, bp.x, hmix) - rr * hmix * (1.0 - hmix);
  let fresnel = pow(1.0 - smoothstep(0.0, params.edgeFalloff, edgeDist), 1.6) * params.edgeGlow;

  let pageMouse = vec2f(params.mouse.x, params.mouse.y - params.scroll);
  let mouseSt = pageMouse / minAxis;
  let mouseD = distance(pageFrag, pageMouse);
  var hover = exp(-mouseD * mouseD / (params.hoverRadius * params.hoverRadius * 0.5)) * params.hoverGlow;
  let hoverCell = cellInfo(mouseSt * params.cellScale).zw;
  let sameCell = 1.0 - step(0.5, distance(hoverCell, cellId));
  var charge = sameCell * params.hoverCharge;
  hover *= 1.0 - params.hideOnHover;
  charge *= 1.0 - params.hideOnHover;

  let revealHover = select(0.0, 1.0, params.gridRevealMode == 1.0 || params.gridRevealMode == 3.0);
  let revealClick = select(0.0, 1.0, params.gridRevealMode == 2.0 || params.gridRevealMode == 3.0);
  let allowHover = max(revealHover, select(0.0, 1.0, params.gridRevealMode == 0.0));
  charge *= allowHover;
  var hoverMask = 1.0 - smoothstep(params.gridRevealRadius * (1.0 - params.gridFade), params.gridRevealRadius, mouseD);
  hoverMask *= 1.0 - params.hideOnHover;
  let gridBoost = (revealHover * hoverMask + revealClick * impactBoost) * params.gridRevealStrength;

  let gridEnergy = line * (params.gridOpacity + gridBoost + charge + flash + ringContrib * params.rippleIntensity * 5.0);
  var energy = gridEnergy * (0.35 + fresnel * 0.4)
    + fresnel * 0.5
    + flash * 0.5
    + flowNoise * params.flowIntensity * (0.12 + fresnel * 0.25 + line * 0.15)
    + hover * (0.25 + line * 0.75 * allowHover)
    + ringContrib * params.rippleIntensity;

  let hide = 1.0 - params.hideOnHover * (1.0 - smoothstep(params.hoverRadius * 0.35, params.hoverRadius * 1.4, mouseD));

  let warp = (-pushVec * params.refraction * 0.7 + hazeVec * 6.0) * revealMask * hide;
  let refr = warp;
  let texel = 1.0 / params.resolution;
  let baseUv = clamp(inUv + refr * texel * vec2f(1.0, -1.0), vec2f(0.0), vec2f(1.0));
  var content: vec4f;
  if (params.hasContent > 0.5) {
    content = textureSampleLevel(uContent, uSampler, baseUv, 0.0);
    let ab = params.aberration * min(length(warp), 24.0) / 24.0;
    if (ab > 0.01) {
      let abOff = normalize(warp + vec2f(1e-5)) * ab * texel * 3.0;
      content.r = textureSampleLevel(uContent, uSampler, clamp(baseUv + abOff, vec2f(0.0), vec2f(1.0)), 0.0).r;
      content.b = textureSampleLevel(uContent, uSampler, clamp(baseUv - abOff, vec2f(0.0), vec2f(1.0)), 0.0).b;
    }
    if (params.pageReact > 0.001) {
      let pageL = dot(content.rgb, vec3f(0.2126, 0.7152, 0.0722));
      energy *= mix(1.0, 0.3 + pageL * 1.6, params.pageReact * revealMask);
    }
  } else {
    content = vec4f(0.0);
  }

  energy *= revealMask * hide;

  let dimEff = params.dim * revealMask * (1.0 - hover * 0.5);
  var col = content.rgb * (1.0 - dimEff);
  if (params.tint > 0.001) {
    let membrane = params.color / max(max(params.color.r, max(params.color.g, params.color.b)), 0.001);
    col *= mix(vec3f(1.0), membrane * 0.92 + 0.08, params.tint * revealMask);
  }

  let fieldGlow = params.color * energy * params.opacity;
  let dissolveGlow = params.edgeColor * dissolveEdge * params.dissolveGlow * hide;

  let dark = 1.0 - params.pageLum;
  let darkMix = clamp(dark * 1.4 - 0.2, 0.0, 1.0);
  let rawAdd = fieldGlow + dissolveGlow;
  let additive = rawAdd / (1.0 + 0.45 * max(max(rawAdd.r, rawAdd.g), rawAdd.b));
  let aMax = max(max(additive.r, additive.g), additive.b);
  let inked = col * exp(-(vec3f(aMax) - additive) * 1.7) * (1.0 - 0.18 * min(aMax, 1.0));
  col = mix(inked, col + additive, darkMix);

  let alpha = max(content.a, clamp(energy * params.opacity + dissolveEdge, 0.0, 1.0));
  col = clamp(col, vec3f(0.0), vec3f(max(alpha, 0.001)));
  var out: FieldOut;
  out.color = vec4f(col, alpha);
  out.emission = vec4f(rawAdd, 1.0);
  return out;
}`;

const BRIGHT_SHADER = /* wgsl */ `
struct BrightParams {
  threshold: f32,
}

@group(0) @binding(0) var<uniform> params: BrightParams;
@group(0) @binding(1) var uScene: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(uScene, uSampler, uv, 0.0);
  let lum = dot(c.rgb, vec3f(0.2126, 0.7152, 0.0722));
  let gate = smoothstep(params.threshold, params.threshold + 0.25, lum);
  return vec4f(c.rgb * gate, 1.0);
}`;

const KAWASE_DOWN_SHADER = /* wgsl */ `
struct BlurParams {
  texel: vec2f,
}

@group(0) @binding(0) var<uniform> params: BlurParams;
@group(0) @binding(1) var uScene: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let o = params.texel;
  var sum = textureSampleLevel(uScene, uSampler, uv, 0.0) * 4.0;
  sum += textureSampleLevel(uScene, uSampler, uv - o, 0.0);
  sum += textureSampleLevel(uScene, uSampler, uv + o, 0.0);
  sum += textureSampleLevel(uScene, uSampler, uv + vec2f(o.x, -o.y), 0.0);
  sum += textureSampleLevel(uScene, uSampler, uv - vec2f(o.x, -o.y), 0.0);
  return sum * 0.125;
}`;

const KAWASE_UP_SHADER = /* wgsl */ `
struct BlurParams {
  texel: vec2f,
}

@group(0) @binding(0) var<uniform> params: BlurParams;
@group(0) @binding(1) var uScene: texture_2d<f32>;
@group(0) @binding(2) var uBase: texture_2d<f32>;
@group(0) @binding(3) var uSampler: sampler;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let o = params.texel;
  var sum = textureSampleLevel(uScene, uSampler, uv + vec2f(-o.x * 2.0, 0.0), 0.0);
  sum += textureSampleLevel(uScene, uSampler, uv + vec2f(-o.x, o.y), 0.0) * 2.0;
  sum += textureSampleLevel(uScene, uSampler, uv + vec2f(0.0, o.y * 2.0), 0.0);
  sum += textureSampleLevel(uScene, uSampler, uv + vec2f(o.x, o.y), 0.0) * 2.0;
  sum += textureSampleLevel(uScene, uSampler, uv + vec2f(o.x * 2.0, 0.0), 0.0);
  sum += textureSampleLevel(uScene, uSampler, uv + vec2f(o.x, -o.y), 0.0) * 2.0;
  sum += textureSampleLevel(uScene, uSampler, uv + vec2f(0.0, -o.y * 2.0), 0.0);
  sum += textureSampleLevel(uScene, uSampler, uv + vec2f(-o.x, -o.y), 0.0) * 2.0;
  let base = textureSampleLevel(uBase, uSampler, uv, 0.0);
  return mix(base, sum / 12.0, 0.62);
}`;

const COMPOSITE_SHADER = /* wgsl */ `
struct CompositeParams {
  resolution: vec2f,
  bloomStrength: f32,
  grain: f32,
  time: f32,
  pageLum: f32,
}

@group(0) @binding(0) var<uniform> params: CompositeParams;
@group(0) @binding(1) var uScene: texture_2d<f32>;
@group(0) @binding(2) var uBloom: texture_2d<f32>;
@group(0) @binding(3) var uSampler: sampler;

fn grainNoise(p: vec2f, t: f32) -> f32 {
  var v = fract(vec3f(p.xyx) * vec3f(443.897, 441.423, 437.195) + t);
  v += dot(v, v.yzx + 19.19);
  return fract((v.x + v.y) * v.z) - 0.5;
}

@fragment fn fs_main(@location(0) uv: vec2f, @builtin(position) pos: vec4f) -> @location(0) vec4f {
  let scene = textureSampleLevel(uScene, uSampler, uv, 0.0);
  let bloom = textureSampleLevel(uBloom, uSampler, uv, 0.0).rgb * params.bloomStrength;
  let darkMix = clamp((1.0 - params.pageLum) * 1.4 - 0.2, 0.0, 1.0);
  let bMax = max(max(bloom.r, bloom.g), bloom.b);
  let inked = scene.rgb * exp(-(vec3f(bMax) - bloom) * 1.1) * (1.0 - 0.1 * min(bMax, 1.0));
  var col = mix(inked, scene.rgb + bloom, darkMix);
  let bloomLum = dot(bloom, vec3f(0.2126, 0.7152, 0.0722));
  let alpha = clamp(scene.a + bloomLum, 0.0, 1.0);
  let g = grainNoise(vec2f(pos.x, params.resolution.y - pos.y), fract(params.time) + 0.1);
  col += g * params.grain * (0.15 + alpha * 0.25);
  col = clamp(col, vec3f(0.0), vec3f(max(alpha, 0.001)));
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

/** One WebGPU device per page, shared by every ForceField instance. */
function acquireGpu(): Promise<Gpu> {
  if (!sharedGpu) {
    sharedGpu = init().catch((error) => {
      sharedGpu = null;
      throw error;
    });
  }
  return sharedGpu;
}

const SHAPE_INDEX: Record<ForceFieldShape, number> = {
  hexagon: 0,
  triangle: 1,
  square: 2,
};

const REVEAL_INDEX: Record<ForceFieldGridReveal, number> = {
  always: 0,
  hover: 1,
  click: 2,
  both: 3,
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

function destroyTarget(t: Target | null) {
  (t as unknown as { destroy?: () => void } | null)?.destroy?.();
}

export function createForceField(
  elements: ForceFieldElements,
  options: ForceFieldOptions = {},
): ForceFieldInstance | null {
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

  let gpu: Gpu | null = null;
  let screen: Surface | null = null;
  let fieldFx: Effect | null = null;
  let brightFx: Effect | null = null;
  let downFx: Effect | null = null;
  let upFx: Effect | null = null;
  let compositeFx: Effect | null = null;
  let sceneTarget: Target | null = null;
  let brightTarget: Target | null = null;
  const downTargets: Target[] = [];
  const upTargets: Target[] = [];
  let contentTexture: Texture | null = null;
  let fallback2d: CanvasRenderingContext2D | null = null;
  let contentDirty = false;
  let pageLum = 0;
  let wake = () => {};

  function readPageLum(): number {
    try {
      const probe = document.createElement("canvas");
      probe.width = probe.height = 1;
      const pctx = probe.getContext("2d", { willReadFrequently: true });
      if (!pctx) return 0;
      let el: Element | null = content;
      while (el instanceof Element) {
        const bgColor = getComputedStyle(el).backgroundColor;
        if (bgColor && bgColor !== "transparent") {
          pctx.clearRect(0, 0, 1, 1);
          pctx.fillStyle = bgColor;
          pctx.fillRect(0, 0, 1, 1);
          const d = pctx.getImageData(0, 0, 1, 1).data;
          if (d[3] > 128) {
            return (0.2126 * d[0] + 0.7152 * d[1] + 0.0722 * d[2]) / 255;
          }
        }
        el = el.parentElement;
      }
    } catch {}
    return 0;
  }

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

  const hitData: [number, number, number, number][] = Array.from(
    { length: MAX_HITS },
    () => [0, 0, -999, 0],
  );
  let hitIndex = 0;
  let mouseX = -9999;
  let mouseY = -9999;
  let dpr = 1;

  function resizeGpuTargets(width: number, height: number) {
    if (!sceneTarget || !brightTarget) return;
    if (sceneTarget.size[0] !== width || sceneTarget.size[1] !== height) {
      sceneTarget.resize([width, height]);
    }
    let bw = Math.max(1, width >> 1);
    let bh = Math.max(1, height >> 1);
    if (brightTarget.size[0] !== bw || brightTarget.size[1] !== bh) {
      brightTarget.resize([bw, bh]);
    }
    for (let i = 0; i < MIPS; i++) {
      bw = Math.max(1, bw >> 1);
      bh = Math.max(1, bh >> 1);
      const down = downTargets[i];
      if (down.size[0] !== bw || down.size[1] !== bh) down.resize([bw, bh]);
    }
    for (let i = MIPS - 1; i >= 0; i--) {
      const up = i === 0 ? brightTarget : downTargets[i - 1];
      const targetUp = upTargets[i];
      if (targetUp.size[0] !== up.size[0] || targetUp.size[1] !== up.size[1]) {
        targetUp.resize([up.size[0], up.size[1]]);
      }
    }
  }

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
    resizeGpuTargets(width, height);
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
        label: "force-field.content",
      });
    }
    return contentTexture;
  }

  function uploadContent() {
    if (!htmlInCanvas || !contentDirty || !gpu) return;
    contentDirty = false;
    pageLum = readPageLum();
    const texture = ensureContentTexture();
    gpu.gpu.queue.copyExternalImageToTexture(
      { source },
      { texture: texture.gpu },
      [source.width, source.height],
    );
    fieldFx?.set({ uContent: texture });
    sourceCtx!.clearRect(0, 0, source.width, source.height);
  }

  function renderFallback() {
    if (!fallback2d || !htmlInCanvas || !contentDirty) return;
    contentDirty = false;
    fallback2d.clearRect(0, 0, output.width, output.height);
    fallback2d.drawImage(source, 0, 0, output.width, output.height);
    sourceCtx!.clearRect(0, 0, source.width, source.height);
  }

  let time = 3.7;

  function render() {
    if (
      !gpu ||
      !screen ||
      !fieldFx ||
      !brightFx ||
      !downFx ||
      !upFx ||
      !compositeFx ||
      !sceneTarget ||
      !brightTarget
    )
      return;
    uploadContent();
    const width = output.width;
    const height = output.height;

    fieldFx.set({
      params: {
        hits: hitData,
        resolution: [width, height],
        time,
        shape: SHAPE_INDEX[config.shape] ?? 0,
        color: config.color,
        edgeColor: config.edgeColor,
        opacity: clamp(config.opacity, 0, 1),
        cellScale: clamp(config.cellScale, 4, 80),
        lineWidth: clamp(config.lineWidth, 0.005, 0.2),
        gridOpacity: clamp(config.gridOpacity, 0, 1),
        gridRevealMode: REVEAL_INDEX[config.gridReveal] ?? 2,
        gridRevealStrength: clamp(config.gridRevealStrength, 0, 3),
        gridRevealRadius: clamp(config.gridRevealRadius, 60, 800) * dpr,
        gridFade: clamp(config.gridFade, 0.02, 1),
        flashSpeed: clamp(config.flashSpeed, 0, 4),
        flashIntensity: clamp(config.flashIntensity, 0, 1),
        flowScale: clamp(config.flowScale, 0.5, 12),
        flowSpeed: clamp(config.flowSpeed, 0, 4),
        flowIntensity: clamp(config.flowIntensity, 0, 4),
        edgeGlow: clamp(config.edgeGlow, 0, 4),
        edgeFalloff: clamp(config.edgeFalloff, 0.02, 0.6),
        reveal: clamp(config.reveal, 0, 1),
        dissolveScale: clamp(config.dissolveScale, 0.5, 12),
        dissolveWidth: clamp(config.dissolveWidth, 0.005, 0.2),
        dissolveGlow: clamp(config.dissolveGlow, 0, 12),
        rippleSpeed: clamp(config.rippleSpeed, 0.1, 4),
        rippleWidth: clamp(config.rippleWidth, 0.01, 0.4),
        rippleBlend: clamp(config.rippleBlend, 0, 1),
        rippleDuration: clamp(config.rippleDuration, 0.3, 5),
        rippleIntensity: clamp(config.rippleIntensity, 0, 8),
        rippleMaxRadius: clamp(config.rippleMaxRadius, 0.1, 2),
        impactRadius: clamp(config.impactRadius, 0, 0.5),
        refraction: clamp(config.refraction, 0, 60),
        aberration: clamp(config.aberration, 0, 8),
        haze: clamp(config.haze, 0, 2),
        pageReact: clamp(config.pageReact, 0, 1),
        tint: clamp(config.tint, 0, 1),
        mouse: [mouseX * dpr, height - mouseY * dpr],
        hoverGlow: clamp(config.hoverGlow, 0, 3),
        hoverRadius: clamp(config.hoverRadius, 40, 600) * dpr,
        hoverCharge: clamp(config.hoverCharge, 0, 2),
        hideOnHover: config.hideOnHover ? 1 : 0,
        scroll: content.scrollTop * dpr,
        dim: clamp(config.dim, 0, 1),
        hasContent: htmlInCanvas ? 1 : 0,
        pageLum,
      },
    });
    const bloomOn = config.bloom > 0.001;
    gpuFrame(gpu, (f) => {
      f.pass(sceneTarget!, fieldFx!);

      if (bloomOn) {
        brightFx!.set({
          uScene: sceneTarget!.colors[1],
          params: { threshold: clamp(config.bloomThreshold, 0, 1) },
        });
        f.pass(brightTarget!, brightFx!);

        let src: Target = brightTarget!;
        for (let i = 0; i < MIPS; i++) {
          const dst = downTargets[i];
          downFx!.set({
            uScene: src,
            params: { texel: [0.5 / src.size[0], 0.5 / src.size[1]] },
          });
          f.pass(dst, downFx!);
          src = dst;
        }
        for (let i = MIPS - 1; i >= 0; i--) {
          const base = i === 0 ? brightTarget! : downTargets[i - 1];
          const dst = upTargets[i];
          upFx!.set({
            uScene: src,
            uBase: base,
            params: { texel: [1 / src.size[0], 1 / src.size[1]] },
          });
          f.pass(dst, upFx!);
          src = dst;
        }
      }

      compositeFx!.set({
        uScene: sceneTarget!,
        uBloom: bloomOn ? upTargets[0] : sceneTarget!,
        params: {
          resolution: [width, height],
          bloomStrength: bloomOn ? clamp(config.bloom, 0, 3) : 0,
          grain: clamp(config.grain, 0, 1),
          time,
          pageLum,
        },
      });
      f.pass(screen!, compositeFx!);
    });
  }

  let raf = 0;
  let lastTime = performance.now();
  let lastDraw = 0;
  let lastInput = 0;
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
    if (!reducedMotion) time += delta;
    let ripplesLive = false;
    for (let i = 0; i < MAX_HITS; i++) {
      if (
        hitData[i][2] > -900 &&
        time - hitData[i][2] < config.rippleDuration + 0.3
      ) {
        ripplesLive = true;
        break;
      }
    }
    const active =
      ripplesLive || now - lastInput < 500 || reducedMotion || contentDirty;
    if (active || now - lastDraw >= 31) {
      render();
      lastDraw = now;
    }
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
        label: "force-field",
      });
      sceneTarget = target(gpu, {
        size: [Math.max(1, output.width), Math.max(1, output.height)],
        colors: [{ format: "rgba8unorm" }, { format: "rgba16float" }],
        label: "force-field.scene",
      });
      brightTarget = target(gpu, {
        size: [2, 2],
        format: "rgba16float",
        label: "force-field.bright",
      });
      for (let i = 0; i < MIPS; i++) {
        downTargets.push(
          target(gpu, {
            size: [2, 2],
            format: "rgba16float",
            label: `force-field.down-${i}`,
          }),
        );
        upTargets.push(
          target(gpu, {
            size: [2, 2],
            format: "rgba16float",
            label: `force-field.up-${i}`,
          }),
        );
      }
      const linear = sampler(gpu, {
        minFilter: "linear",
        magFilter: "linear",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
      });
      fieldFx = effect(gpu, FIELD_SHADER, {
        label: "force-field.field",
        set: { uSampler: linear, uContent: ensureContentTexture() },
      });
      brightFx = effect(gpu, BRIGHT_SHADER, {
        label: "force-field.bright",
        set: { uSampler: linear },
      });
      downFx = effect(gpu, KAWASE_DOWN_SHADER, {
        label: "force-field.down",
        set: { uSampler: linear },
      });
      upFx = effect(gpu, KAWASE_UP_SHADER, {
        label: "force-field.up",
        set: { uSampler: linear },
      });
      compositeFx = effect(gpu, COMPOSITE_SHADER, {
        label: "force-field.composite",
        set: { uSampler: linear },
      });
      syncCanvasSize();
      start();
    })
    .catch((error) => {
      if (destroyed) return;
      console.warn(
        "ForceField: WebGPU unavailable, showing content without the effect.",
        error,
      );
      fallback2d = output.getContext("2d");
      contentDirty = true;
      start();
    });

  function spawnHit(x: number, y: number) {
    const idx = hitIndex % MAX_HITS;
    hitIndex++;
    hitData[idx][0] = x * dpr;
    hitData[idx][1] = output.height - y * dpr - content.scrollTop * dpr;
    hitData[idx][2] = time;
    lastInput = performance.now();
    start();
  }

  function onPointerDown(event: PointerEvent) {
    if (!config.clickRipples) return;
    const rect = output.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    spawnHit(x, y);
    config.onHit?.(x, y);
  }

  const rectCache = createRectCache(output);

  function onPointerMove(event: PointerEvent) {
    const rect = rectCache.current;
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
    lastInput = performance.now();
    start();
  }

  function onPointerLeave() {
    mouseX = -9999;
    mouseY = -9999;
  }

  content.addEventListener("pointerdown", onPointerDown);
  content.addEventListener("pointermove", onPointerMove, { passive: true });
  content.addEventListener("pointerleave", onPointerLeave);

  function onMotionChange() {
    reducedMotion = motionQuery.matches;
    start();
  }
  motionQuery.addEventListener("change", onMotionChange);

  function onScroll() {
    lastInput = performance.now();
    start();
  }
  content.addEventListener("scroll", onScroll, { passive: true });

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
        if (typeof value === "function") continue;
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
    impact(x, y) {
      spawnHit(x, y);
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
      content.removeEventListener("scroll", onScroll);
      content.removeEventListener("pointerdown", onPointerDown);
      content.removeEventListener("pointermove", onPointerMove);
      content.removeEventListener("pointerleave", onPointerLeave);
      contentTexture?.destroy();
      destroyTarget(sceneTarget);
      destroyTarget(brightTarget);
      for (const target of [...downTargets, ...upTargets]) destroyTarget(target);
      screen?.dispose();
      if (htmlInCanvas) paintable.onpaint = null;
    },
  };
}
