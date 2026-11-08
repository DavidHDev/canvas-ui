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
  type Target as GpuTarget,
} from "vgpu";
import type { Texture } from "vgpu";

export interface HexFloatOptions {
  /** Width of each hex tile in CSS pixels. */
  size?: number;
  /** Seam between tiles in CSS pixels. */
  gap?: number;
  /** Width of the shiny beveled rim in CSS pixels. */
  bevel?: number;
  /** Backward lean of the page in degrees (-30 to 30). Positive tilts the top away. */
  tilt?: number;
  /** Camera closeness (0 to 1). Higher exaggerates the perspective of the tilt. */
  perspective?: number;
  /** How far tiles bob up and down as they float (0 to 1). 0 keeps them still. */
  float?: number;
  /** Speed of the floating motion. 1 is normal speed. */
  speed?: number;
  /** Intensity of the specular glints on rims and tile faces (0 to 2). */
  shine?: number;
  /** How strongly tiles rise along the edges of the fluid reading window (0 to 1). */
  lift?: number;
  /** Size of the fluid splats the cursor injects, in CSS pixels. Sets the reading window's scale. */
  radius?: number;
  /** How strongly cursor movement pushes the fluid around (0 to 3). */
  flow?: number;
  /** Vorticity of the fluid (0 to 15). Higher makes the window's trail curl into eddies. */
  swirl?: number;
  /** How long the fluid trail lingers before healing (0 to 1). */
  trail?: number;
  /** Strength of the iridescent hue shift on highlights (0 to 2). 0 keeps highlights neutral. */
  iridescence?: number;
  /** Bloom glow around bright highlights (0 to 1). 0 skips the pass entirely. */
  bloom?: number;
  /** Animated film grain over the final image (0 to 1). 0 skips the pass entirely. */
  grain?: number;
  /** Seam color as [r, g, b] in 0-1 range, or "auto" to derive a dark seam from the page background. */
  gapColor?: [number, number, number] | "auto";
}

export interface HexFloatElements {
  /** Canvas with layoutsubtree that hosts the HTML content. */
  source: HTMLCanvasElement;
  /** The element inside the source canvas that gets captured. */
  content: HTMLElement;
  /** Canvas the WebGPU effect renders to. */
  output: HTMLCanvasElement;
}

export interface HexFloatInstance {
  /** Update effect options live. */
  setOptions: (options: HexFloatOptions) => void;
  /** Re-read canvas size. Call when the element is resized. */
  resize: () => void;
  /** Stop the loop and release all GPU resources. */
  destroy: () => void;
}

const DEFAULTS: Required<HexFloatOptions> = {
  size: 160,
  gap: 0,
  bevel: 1.5,
  tilt: 24,
  perspective: 0.5,
  float: 0,
  speed: 1,
  shine: 0.5,
  lift: 0.1,
  radius: 1200,
  flow: 0,
  swirl: 0,
  trail: 0,
  iridescence: 1,
  bloom: 0,
  grain: 0.8,
  gapColor: "auto",
};

type PaintableCanvas = HTMLCanvasElement & {
  onpaint?: (() => void) | null;
  requestPaint?: () => void;
};

type ElementImageContext = CanvasRenderingContext2D & {
  drawElementImage?: (element: Element, x: number, y: number) => void;
};

const MAIN_SHADER = /* wgsl */ `
struct Params {
  res: vec2f,
  size: f32,
  gap: f32,
  bevel: f32,
  tilt: f32,
  dist: f32,
  floatAmount: f32,
  shine: f32,
  lift: f32,
  irid: f32,
  scroll: vec2f,
  time: f32,
  hasContent: f32,
  maxX: f32,
  bg: vec3f,
  gapColor: vec3f,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var uContent: texture_2d<f32>;
@group(0) @binding(2) var uContentSampler: sampler;
@group(0) @binding(3) var uFlow: texture_2d<f32>;
@group(0) @binding(4) var uFlowSampler: sampler;

const TAU = 6.2831853;
const SQ3 = 1.7320508;

struct HexTile {
  p: vec2f,
  n: vec2f,
}

fn mod2(x: vec2f, y: vec2f) -> vec2f {
  return x - y * floor(x / y);
}

fn hash12(p: vec2f) -> f32 {
  var p3 = fract(vec3f(p.x, p.y, p.x) * 0.1031);
  p3 += dot(p3, p3.yzx + vec3f(33.33));
  return fract((p3.x + p3.y) * p3.z);
}

fn hextile(pIn: vec2f) -> HexTile {
  let sz = vec2f(1.0, SQ3);
  let hsz = 0.5 * sz;
  let p1 = mod2(pIn, sz) - hsz;
  let p2 = mod2(pIn - hsz, sz) - hsz;
  let p3 = select(p2, p1, dot(p1, p1) < dot(p2, p2));
  var n = (p3 - pIn + hsz) / sz;
  n -= vec2f(0.5);
  return HexTile(p3, round(n * 2.0) * 0.5);
}

fn hexDist(pIn: vec2f) -> f32 {
  let p = abs(pIn);
  return max(dot(p, vec2f(0.5, 0.8660254)), p.x);
}

fn flowAt(xy: vec2f) -> f32 {
  let uv = (xy * params.size - params.scroll) / params.res;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { return 0.0; }
  return clamp(textureSampleLevel(uFlow, uFlowSampler, uv, 0.0).r, 0.0, 4.0);
}

fn tileZ(center: vec2f, f: f32) -> f32 {
  let id = center * vec2f(1.0, 1.0 / SQ3);
  let h = hash12(id * 7.31 + vec2f(3.7));
  let focus = smoothstep(0.18, 0.85, f);
  let ring = smoothstep(0.02, 0.14, f) * (1.0 - smoothstep(0.14, 0.6, f));
  let bob = params.floatAmount * 0.4 * sin(params.time * 1.4 + h * TAU) * (1.0 - focus);
  let lift = params.lift * ring;
  return -(bob + lift * 1.2);
}

fn page(px: vec2f) -> vec4f {
  let p = px / params.res;
  if (p.x < 0.0 || p.x > params.maxX || p.y < 0.0 || p.y > 1.0) { return vec4f(0.0); }
  return textureSampleLevel(uContent, uContentSampler, p, 0.0);
}

fn hexNormal(k: i32) -> vec2f {
  if (k == 0) { return vec2f(1.0, 0.0); }
  if (k == 1) { return vec2f(0.5, 0.8660254); }
  return vec2f(-0.5, 0.8660254);
}

fn shade(sUv: vec2f) -> vec4f {
  let cell = max(params.size, 8.0);
  let hw = max(0.5 - (params.gap / cell) * 0.5, 0.15);
  let bevW = clamp(params.bevel / cell, 0.0, hw - 0.1);
  let th = 0.09;

  let aspect = params.res.x / params.res.y;
  let ndc = vec2f((sUv.x * 2.0 - 1.0) * aspect, sUv.y * 2.0 - 1.0);

  let sa = sin(params.tilt);
  let ca = cos(params.tilt);
  let fwd = vec3f(0.0, -sa, ca);
  let upv = vec3f(0.0, ca, sa);
  let H = params.res.y / cell;
  let D = H * params.dist;
  let focal = (D + sqrt(D * D + H * H * sa * sa)) / (H * ca);
  let dy = 0.5 * H - sa * D
    - ca * D * (ca - focal * sa) / (sa + focal * ca);
  let la = vec3f(params.scroll.x / cell + 0.5 * params.res.x / cell,
                 params.scroll.y / cell + 0.5 * H + dy, 0.0);
  let ro = la - fwd * D;
  let rd = normalize(vec3f(ndc.x, 0.0, 0.0) + ndc.y * upv + focal * fwd);

  let seam = params.gapColor;

  if (rd.z < 0.02) {
    if (params.hasContent > 0.5) { return vec4f(params.bg, 1.0); }
    return vec4f(0.0);
  }

  let maxUp = params.floatAmount * 0.4 + params.lift * 1.2 + th;
  let floorZ = th + 0.06;
  let tFloor = (floorZ - ro.z) / rd.z;
  let t0 = max((-maxUp - ro.z) / rd.z, 0.0);

  let oxy = ro.xy;
  let rxy = rd.xy;
  let sp = oxy + rxy * t0;
  let firstHex = hextile(sp);
  var local = firstHex.p;
  var center = sp - local;

  var hit = false;
  var onTop = false;
  var tHit = 0.0;
  var n = vec3f(0.0, 0.0, -1.0);
  var zc = 0.0;
  var hwc = hw;
  var fCell = 0.0;

  for (var i = 0; i < 64; i++) {
    fCell = flowAt(center);
    zc = tileZ(center, fCell);
    hwc = mix(hw, 0.502, smoothstep(0.18, 0.85, fCell));
    let zTop = zc - th;
    let tZin = (zTop - ro.z) / rd.z;
    let tZout = (zc + th - ro.z) / rd.z;

    var tIn = -1.0e9;
    var tOut = 1.0e9;
    var inN = vec2f(0.0);
    var empty = false;
    for (var k = 0; k < 3; k++) {
      let Nk = hexNormal(k);
      let d = dot(rxy, Nk);
      let o = dot(oxy - center, Nk);
      if (abs(d) < 1.0e-6) {
        if (abs(o) > hwc) {
          empty = true;
          break;
        }
      } else {
        let ta = (-hwc - o) / d;
        let tb = (hwc - o) / d;
        let lo = min(ta, tb);
        let hi = max(ta, tb);
        if (lo > tIn) {
          tIn = lo;
          inN = -sign(d) * Nk;
        }
        tOut = min(tOut, hi);
      }
    }

    if (!empty) {
      let lo = max(tIn, tZin);
      let hi = min(tOut, tZout);
      if (lo <= hi && hi > 0.0) {
        tHit = max(lo, 0.0);
        onTop = tZin >= tIn;
        if (onTop) {
          n = vec3f(0.0, 0.0, -1.0);
        } else {
          n = vec3f(inN, 0.0);
        }
        hit = true;
        break;
      }
    }

    var tExit = 1.0e9;
    var step2 = vec2f(0.0);
    for (var k = 0; k < 3; k++) {
      let Nk = hexNormal(k);
      let d = dot(rxy, Nk);
      if (abs(d) < 1.0e-6) { continue; }
      let o = dot(oxy - center, Nk);
      let te = (0.5 * sign(d) - o) / d;
      if (te < tExit) {
        tExit = te;
        step2 = sign(d) * Nk;
      }
    }
    if (tExit >= tFloor || all(step2 == vec2f(0.0))) { break; }
    center += step2;
  }

  let Ld = normalize(vec3f(-0.35, -0.5, -0.78));

  if (!hit) {
    let fl = oxy + rxy * tFloor;
    let floorHex = hextile(fl);
    let open = smoothstep(hw, hw + 0.22, hexDist(floorHex.p));
    if (params.hasContent < 0.5) {
      return vec4f(0.0, 0.0, 0.0, 0.4 - 0.25 * open);
    }
    return vec4f(seam * mix(0.6, 1.0, open), 1.0);
  }

  let p = ro + rd * tHit;
  let fc = smoothstep(0.18, 0.85, fCell);

  if (onTop) {
    let lp = p.xy - center;
    let e = hwc - hexDist(lp);
    if (e < bevW) {
      let ax = abs(lp.x);
      let a1 = abs(dot(lp, hexNormal(1)));
      let a2 = abs(dot(lp, hexNormal(2)));
      var dir = hexNormal(2);
      if (ax > a1 && ax > a2) {
        dir = hexNormal(0);
      } else if (a1 > a2) {
        dir = hexNormal(1);
      }
      dir *= sign(dot(lp, dir));
      let k = (1.0 - smoothstep(0.0, max(bevW, 1.0e-4), e)) * (1.0 - fc);
      n = normalize(mix(vec3f(0.0, 0.0, -1.0), vec3f(dir * 0.85, -0.6), vec3f(k)));
    }
  }

  let diff = max(dot(n, Ld), 0.0);
  let refl = reflect(rd, n);
  let Ld2 = normalize(vec3f(0.55, -0.25, -0.8));
  let glintL = pow(max(dot(refl, Ld), 0.0), 120.0);
  let sheenL = pow(max(dot(refl, Ld2), 0.0), 8.0) * 0.35;
  let spec = (glintL + sheenL) * params.shine * (1.0 - fc);
  let fres = pow(1.0 - max(dot(n, -rd), 0.0), 3.0) * (1.0 - fc);
  let iridPh = dot(n, -rd) * 2.2 + (p.x + p.y) * 0.22;
  let iridTint = 1.0 + params.irid * 0.3 * cos(vec3f(0.0, 2.094, 4.188) + vec3f(iridPh * 3.5));
  let specCol = spec * iridTint;
  let raised = clamp(-zc, -0.6, 1.4);

  if (params.hasContent < 0.5) {
    let glint = spec * (0.4 + 0.6 * select(1.0, 0.4, onTop)) + fres * 0.2 * params.shine;
    let shadeSide = select(0.3, 0.0, onTop);
    let a = clamp(glint * 0.85 + shadeSide, 0.0, 0.85) * (1.0 - fc);
    return vec4f(vec3f(min(glint, a)), a);
  }

  if (onTop) {
    let c = page(p.xy * cell - params.scroll);
    let face = mix(params.bg, c.rgb, vec3f(c.a));
    let lit = face * (0.86 + 0.14 * diff + raised * 0.06)
      + specCol * 0.9 + fres * iridTint * 0.12 * params.shine;
    return vec4f(mix(lit, face, vec3f(fc)), 1.0);
  }

  let wallAo = 1.0 - smoothstep(zc - th, floorZ, p.z) * 0.4;
  let wallCol = seam * mix(0.55, 1.0, diff) * wallAo
    + specCol * 1.3 + fres * iridTint * 0.28 * params.shine;
  return vec4f(wallCol, 1.0);
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let sUv = uv;
  let px = 1.0 / params.res;
  let a = shade(sUv + vec2f( 0.125,  0.375) * px);
  let b = shade(sUv + vec2f(-0.125, -0.375) * px);
  var c = a + b;
  if (dot(abs(a - b), vec4f(1.0)) > 0.02) {
    c += shade(sUv + vec2f(-0.375,  0.125) * px)
       + shade(sUv + vec2f( 0.375, -0.125) * px);
    return c * 0.25;
  }
  return c * 0.5;
}`;

const SPLAT_SHADER = /* wgsl */ `
struct Params {
  aspect: f32,
  radius: f32,
  point: vec2f,
  color: vec3f,
}
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var uTarget: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  var p = uv - params.point;
  p.x *= params.aspect;
  let splat = exp(-dot(p, p) / params.radius) * params.color;
  let base = textureSampleLevel(uTarget, uSampler, uv, 0.0).xyz;
  return vec4f(base + splat, 1.0);
}`;

const ADVECT_SHADER = /* wgsl */ `
struct Params {
  texelSize: vec2f,
  dt: f32,
  dissipation: f32,
}
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var uVelocity: texture_2d<f32>;
@group(0) @binding(2) var uSource: texture_2d<f32>;
@group(0) @binding(3) var uSampler: sampler;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let coord = uv - params.dt * textureSampleLevel(uVelocity, uSampler, uv, 0.0).xy * params.texelSize;
  var outColor = params.dissipation * textureSampleLevel(uSource, uSampler, coord, 0.0);
  outColor.a = 1.0;
  return outColor;
}`;

const CLEAR_SHADER = /* wgsl */ `
struct Params {
  value: f32,
}
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var uTexture: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  return params.value * textureSampleLevel(uTexture, uSampler, uv, 0.0);
}`;

const DIVERGENCE_SHADER = /* wgsl */ `
struct Params {
  texelSize: vec2f,
}
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var uVelocity: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let vL = uv - vec2f(params.texelSize.x, 0.0);
  let vR = uv + vec2f(params.texelSize.x, 0.0);
  let vT = uv + vec2f(0.0, params.texelSize.y);
  let vB = uv - vec2f(0.0, params.texelSize.y);
  var L = textureSampleLevel(uVelocity, uSampler, vL, 0.0).x;
  var R = textureSampleLevel(uVelocity, uSampler, vR, 0.0).x;
  var T = textureSampleLevel(uVelocity, uSampler, vT, 0.0).y;
  var B = textureSampleLevel(uVelocity, uSampler, vB, 0.0).y;
  let C = textureSampleLevel(uVelocity, uSampler, uv, 0.0).xy;
  if (vL.x < 0.0) { L = -C.x; }
  if (vR.x > 1.0) { R = -C.x; }
  if (vT.y > 1.0) { T = -C.y; }
  if (vB.y < 0.0) { B = -C.y; }
  let div = 0.5 * (R - L + T - B);
  return vec4f(div, 0.0, 0.0, 1.0);
}`;

const CURL_SHADER = /* wgsl */ `
struct Params {
  texelSize: vec2f,
}
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var uVelocity: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let vL = uv - vec2f(params.texelSize.x, 0.0);
  let vR = uv + vec2f(params.texelSize.x, 0.0);
  let vT = uv + vec2f(0.0, params.texelSize.y);
  let vB = uv - vec2f(0.0, params.texelSize.y);
  let L = textureSampleLevel(uVelocity, uSampler, vL, 0.0).y;
  let R = textureSampleLevel(uVelocity, uSampler, vR, 0.0).y;
  let T = textureSampleLevel(uVelocity, uSampler, vT, 0.0).x;
  let B = textureSampleLevel(uVelocity, uSampler, vB, 0.0).x;
  let vorticity = R - L - T + B;
  return vec4f(vorticity, 0.0, 0.0, 1.0);
}`;

const VORTICITY_SHADER = /* wgsl */ `
struct Params {
  texelSize: vec2f,
  curlStrength: f32,
  dt: f32,
}
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var uVelocity: texture_2d<f32>;
@group(0) @binding(2) var uCurl: texture_2d<f32>;
@group(0) @binding(3) var uSampler: sampler;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let vL = uv - vec2f(params.texelSize.x, 0.0);
  let vR = uv + vec2f(params.texelSize.x, 0.0);
  let vT = uv + vec2f(0.0, params.texelSize.y);
  let vB = uv - vec2f(0.0, params.texelSize.y);
  let L = textureSampleLevel(uCurl, uSampler, vL, 0.0).x;
  let R = textureSampleLevel(uCurl, uSampler, vR, 0.0).x;
  let T = textureSampleLevel(uCurl, uSampler, vT, 0.0).x;
  let B = textureSampleLevel(uCurl, uSampler, vB, 0.0).x;
  let C = textureSampleLevel(uCurl, uSampler, uv, 0.0).x;
  var force = vec2f(abs(T) - abs(B), abs(R) - abs(L)) * 0.5;
  force /= length(force) + 1.0;
  force *= params.curlStrength * C;
  force.y *= -1.0;
  let velocity = textureSampleLevel(uVelocity, uSampler, uv, 0.0).xy;
  return vec4f(velocity + force * params.dt, 0.0, 1.0);
}`;

const PRESSURE_SHADER = /* wgsl */ `
struct Params {
  texelSize: vec2f,
}
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var uPressure: texture_2d<f32>;
@group(0) @binding(2) var uDivergence: texture_2d<f32>;
@group(0) @binding(3) var uSampler: sampler;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let vL = uv - vec2f(params.texelSize.x, 0.0);
  let vR = uv + vec2f(params.texelSize.x, 0.0);
  let vT = uv + vec2f(0.0, params.texelSize.y);
  let vB = uv - vec2f(0.0, params.texelSize.y);
  let L = textureSampleLevel(uPressure, uSampler, vL, 0.0).x;
  let R = textureSampleLevel(uPressure, uSampler, vR, 0.0).x;
  let T = textureSampleLevel(uPressure, uSampler, vT, 0.0).x;
  let B = textureSampleLevel(uPressure, uSampler, vB, 0.0).x;
  let divergence = textureSampleLevel(uDivergence, uSampler, uv, 0.0).x;
  let pressure = (L + R + B + T - divergence) * 0.25;
  return vec4f(pressure, 0.0, 0.0, 1.0);
}`;

const GRADIENT_SHADER = /* wgsl */ `
struct Params {
  texelSize: vec2f,
}
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var uPressure: texture_2d<f32>;
@group(0) @binding(2) var uVelocity: texture_2d<f32>;
@group(0) @binding(3) var uSampler: sampler;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let vL = uv - vec2f(params.texelSize.x, 0.0);
  let vR = uv + vec2f(params.texelSize.x, 0.0);
  let vT = uv + vec2f(0.0, params.texelSize.y);
  let vB = uv - vec2f(0.0, params.texelSize.y);
  let L = textureSampleLevel(uPressure, uSampler, vL, 0.0).x;
  let R = textureSampleLevel(uPressure, uSampler, vR, 0.0).x;
  let T = textureSampleLevel(uPressure, uSampler, vT, 0.0).x;
  let B = textureSampleLevel(uPressure, uSampler, vB, 0.0).x;
  var velocity = textureSampleLevel(uVelocity, uSampler, uv, 0.0).xy;
  velocity -= vec2f(R - L, T - B);
  return vec4f(velocity, 0.0, 1.0);
}`;

const BRIGHT_SHADER = /* wgsl */ `
@group(0) @binding(0) var uScene: texture_2d<f32>;
@group(0) @binding(1) var uSampler: sampler;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let c = textureSampleLevel(uScene, uSampler, uv, 0.0).rgb;
  let l = dot(c, vec3f(0.299, 0.587, 0.114));
  return vec4f(c * smoothstep(0.55, 0.95, l), 1.0);
}`;

const BLUR_SHADER = /* wgsl */ `
struct Params {
  dir: vec2f,
}
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var uScene: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  var c = textureSampleLevel(uScene, uSampler, uv, 0.0).rgb * 0.227027;
  c += textureSampleLevel(uScene, uSampler, uv + params.dir * 1.3846154, 0.0).rgb * 0.3162162;
  c += textureSampleLevel(uScene, uSampler, uv - params.dir * 1.3846154, 0.0).rgb * 0.3162162;
  c += textureSampleLevel(uScene, uSampler, uv + params.dir * 3.2307692, 0.0).rgb * 0.0702703;
  c += textureSampleLevel(uScene, uSampler, uv - params.dir * 3.2307692, 0.0).rgb * 0.0702703;
  return vec4f(c, 1.0);
}`;

const COMPOSITE_SHADER = /* wgsl */ `
struct Params {
  resolution: vec2f,
  bloomAmt: f32,
  grainAmt: f32,
  time: f32,
}
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var uScene: texture_2d<f32>;
@group(0) @binding(2) var uBloomTex: texture_2d<f32>;
@group(0) @binding(3) var uSampler: sampler;

@fragment fn fs_main(
  @location(0) uv: vec2f,
  @builtin(position) pos: vec4f,
) -> @location(0) vec4f {
  let scene = textureSampleLevel(uScene, uSampler, uv, 0.0);
  let bloom = textureSampleLevel(uBloomTex, uSampler, uv, 0.0).rgb * params.bloomAmt;
  var col = scene.rgb + bloom;
  let fragCoord = vec2f(pos.x, params.resolution.y - pos.y);
  let g = fract(sin(dot(fragCoord + vec2f(params.time * 61.7, params.time * 123.4),
    vec2f(12.9898, 78.233))) * 43758.5453) - 0.5;
  col += g * params.grainAmt * 0.14;
  let ba = dot(bloom, vec3f(0.333));
  return vec4f(col, clamp(scene.a + ba, 0.0, 1.0));
}`;

const SIM_RES = 96;
const FLOW_RES = 256;
const SIM_DT = 1 / 60;
const VELOCITY_DISSIPATION = 0.985;
const PRESSURE_DECAY = 0.8;
const PRESSURE_ITERATIONS = 4;

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

/** One WebGPU device per page, shared by every HexFloat instance. */
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
            rule.selectorText = rule.selectorText.replace(
              /:hover\b/g,
              HOVER_REWRITE,
            );
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
  style.textContent = `[${CONTENT_ATTR}], [${CONTENT_ATTR}] * { cursor: var(--canvasui-cursor, auto) !important; }`;
  document.head.appendChild(style);
}

interface DoubleTarget {
  read: GpuTarget;
  write: GpuTarget;
  swap: () => void;
}

function destroyTarget(t: GpuTarget | null) {
  (t as unknown as { destroy?: () => void } | null)?.destroy?.();
}

export function createHexFloat(
  elements: HexFloatElements,
  options: HexFloatOptions = {},
): HexFloatInstance | null {
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
  let mainFx: Effect | null = null;
  let splatFx: Effect | null = null;
  let advectFx: Effect | null = null;
  let clearFx: Effect | null = null;
  let divergenceFx: Effect | null = null;
  let curlFx: Effect | null = null;
  let vorticityFx: Effect | null = null;
  let pressureFx: Effect | null = null;
  let gradientFx: Effect | null = null;
  let brightFx: Effect | null = null;
  let blurFx: Effect | null = null;
  let compositeFx: Effect | null = null;
  let contentTexture: Texture | null = null;
  let fallback2d: CanvasRenderingContext2D | null = null;

  let velocity: DoubleTarget | null = null;
  let flowTarget: DoubleTarget | null = null;
  let divergence: GpuTarget | null = null;
  let curl: GpuTarget | null = null;
  let pressure: DoubleTarget | null = null;
  let sceneTarget: GpuTarget | null = null;
  let bloomA: GpuTarget | null = null;
  let bloomB: GpuTarget | null = null;

  let contentMaxX = 1;
  let bg: [number, number, number] = [1, 1, 1];
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
    bg = [1, 1, 1];
  }

  function clearTarget(t: GpuTarget | Surface | null, clear: [number, number, number, number]) {
    if (!gpu || !t) return;
    gpuFrame(gpu, (f) => f.pass({ target: t, clear }, () => {}));
  }

  function createTargetPair(
    size: number,
    format: GPUTextureFormat,
    label: string,
  ): DoubleTarget {
    let read = target(gpu!, {
      size: [size, size],
      format,
      clearColor: [0, 0, 0, 1],
      label: `${label}.read`,
    });
    let write = target(gpu!, {
      size: [size, size],
      format,
      clearColor: [0, 0, 0, 1],
      label: `${label}.write`,
    });
    clearTarget(read, [0, 0, 0, 1]);
    clearTarget(write, [0, 0, 0, 1]);
    return {
      get read() {
        return read;
      },
      get write() {
        return write;
      },
      swap() {
        const t = read;
        read = write;
        write = t;
      },
    };
  }

  function releaseSim() {
    if (!velocity || !flowTarget || !pressure) return;
    [
      velocity.read,
      velocity.write,
      flowTarget.read,
      flowTarget.write,
      pressure.read,
      pressure.write,
      divergence,
      curl,
    ].forEach((t) => destroyTarget(t));
    velocity = null;
    flowTarget = null;
    pressure = null;
    divergence = null;
    curl = null;
  }

  function ensureSim() {
    if (velocity && flowTarget && pressure && divergence && curl) return;
    velocity = createTargetPair(SIM_RES, "rg16float", "hexfloat.velocity");
    flowTarget = createTargetPair(FLOW_RES, "r16float", "hexfloat.flow");
    pressure = createTargetPair(SIM_RES, "r16float", "hexfloat.pressure");
    divergence = target(gpu!, {
      size: [SIM_RES, SIM_RES],
      format: "r16float",
      clearColor: [0, 0, 0, 1],
      label: "hexfloat.divergence",
    });
    curl = target(gpu!, {
      size: [SIM_RES, SIM_RES],
      format: "r16float",
      clearColor: [0, 0, 0, 1],
      label: "hexfloat.curl",
    });
    clearTarget(divergence, [0, 0, 0, 1]);
    clearTarget(curl, [0, 0, 0, 1]);
  }

  function releasePost() {
    [sceneTarget, bloomA, bloomB].forEach((t) => destroyTarget(t));
    sceneTarget = null;
    bloomA = null;
    bloomB = null;
  }

  function ensurePost() {
    if (!screen) return;
    const [w, h] = screen.size;
    if (sceneTarget && sceneTarget.size[0] === w && sceneTarget.size[1] === h) {
      return;
    }
    releasePost();
    sceneTarget = target(gpu!, {
      size: [w, h],
      format: "rgba8unorm",
      clearColor: [0, 0, 0, 0],
      label: "hexfloat.scene",
    });
    const bw = Math.max(1, w >> 2);
    const bh = Math.max(1, h >> 2);
    bloomA = target(gpu!, {
      size: [bw, bh],
      format: "rgba8unorm",
      clearColor: [0, 0, 0, 0],
      label: "hexfloat.bloomA",
    });
    bloomB = target(gpu!, {
      size: [bw, bh],
      format: "rgba8unorm",
      clearColor: [0, 0, 0, 0],
      label: "hexfloat.bloomB",
    });
  }

  function syncCanvasSize() {
    const dpr = getCanvasPixelRatio(output);
    const width = Math.max(1, Math.round(output.clientWidth * dpr));
    const height = Math.max(1, Math.round(output.clientHeight * dpr));
    if (screen) {
      const [w, h] = screen.size;
      if (w !== width || h !== height) {
        screen.resize([width, height]);
        releasePost();
      }
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

  syncBgColor();
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
        label: "hexfloat.content",
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
    mainFx!.set({ uContent: texture });
  }

  let time = 0;
  let pointerOn = false;
  let pointerClientX = 0;
  let pointerClientY = 0;
  let prevFlowX = 0;
  let prevFlowY = 0;
  let hasPrevFlow = false;
  let simActiveUntil = 0;

  function gapColor(): [number, number, number] {
    if (config.gapColor !== "auto") return config.gapColor;
    const lum = 0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2];
    const k = lum > 0.5 ? 0.55 : 0.35;
    return [bg[0] * k, bg[1] * k, bg[2] * k];
  }

  function applySplat(x: number, y: number, dx: number, dy: number, dye: number) {
    if (!splatFx || !velocity || !flowTarget) return;
    const aspect = output.clientWidth / Math.max(output.clientHeight, 1);
    const rUv = Math.max(config.radius, 40) / Math.max(output.clientHeight, 1);
    const radius = rUv * rUv * 0.28;

    splatFx.set({
      uTarget: velocity.read,
      params: { aspect, point: [x, y], radius, color: [dx, dy, 0] },
    });
    splatFx.draw(velocity.write);
    velocity.swap();

    splatFx.set({
      uTarget: flowTarget.read,
      params: { aspect, point: [x, y], radius, color: [dye, 0, 0] },
    });
    splatFx.draw(flowTarget.write);
    flowTarget.swap();
  }

  function stepSim(delta: number) {
    if (
      !velocity ||
      !flowTarget ||
      !pressure ||
      !divergence ||
      !curl ||
      !curlFx ||
      !vorticityFx ||
      !divergenceFx ||
      !clearFx ||
      !pressureFx ||
      !gradientFx ||
      !advectFx
    )
      return;

    const texelSize = [1 / SIM_RES, 1 / SIM_RES];
    curlFx.set({
      uVelocity: velocity.read,
      params: { texelSize },
    });
    curlFx.draw(curl);

    vorticityFx.set({
      uVelocity: velocity.read,
      uCurl: curl,
      params: {
        texelSize,
        curlStrength: Math.max(config.swirl, 0),
        dt: SIM_DT,
      },
    });
    vorticityFx.draw(velocity.write);
    velocity.swap();

    divergenceFx.set({
      uVelocity: velocity.read,
      params: { texelSize },
    });
    divergenceFx.draw(divergence);

    clearFx.set({
      uTexture: pressure.read,
      params: { value: Math.pow(PRESSURE_DECAY, delta * 60) },
    });
    clearFx.draw(pressure.write);
    pressure.swap();

    pressureFx.set({
      uDivergence: divergence,
      params: { texelSize },
    });
    for (let i = 0; i < PRESSURE_ITERATIONS; i++) {
      pressureFx.set({ uPressure: pressure.read });
      pressureFx.draw(pressure.write);
      pressure.swap();
    }

    gradientFx.set({
      uPressure: pressure.read,
      uVelocity: velocity.read,
      params: { texelSize },
    });
    gradientFx.draw(velocity.write);
    velocity.swap();

    advectFx.set({
      uVelocity: velocity.read,
      uSource: velocity.read,
      params: {
        texelSize,
        dt: SIM_DT,
        dissipation: Math.pow(VELOCITY_DISSIPATION, delta * 60),
      },
    });
    advectFx.draw(velocity.write);
    velocity.swap();

    const flowDissipation = 0.9 + Math.min(Math.max(config.trail, 0), 1) * 0.08;
    advectFx.set({
      uVelocity: velocity.read,
      uSource: flowTarget.read,
      params: {
        texelSize,
        dt: SIM_DT,
        dissipation: Math.pow(flowDissipation, delta * 60),
      },
    });
    advectFx.draw(flowTarget.write);
    flowTarget.swap();
  }

  function setMainParams(): boolean {
    if (!mainFx || !flowTarget || !screen) return false;
    const [width, height] = screen.size;
    const dpr = width / Math.max(output.clientWidth, 1);
    const seam = gapColor();
    mainFx.set({
      uFlow: flowTarget.read,
      params: {
        res: [width, height],
        size: Math.max(config.size, 8) * dpr,
        gap: Math.max(config.gap, 0) * dpr,
        bevel: Math.max(config.bevel, 0) * dpr,
        tilt: (Math.min(Math.max(config.tilt, -30), 30) * Math.PI) / 180,
        dist: 2.6 - Math.min(Math.max(config.perspective, 0), 1) * 2.2,
        floatAmount: Math.max(config.float, 0),
        shine: Math.max(config.shine, 0),
        lift: Math.max(config.lift, 0),
        irid: Math.max(config.iridescence, 0),
        scroll: [content.scrollLeft * dpr, content.scrollTop * dpr],
        time,
        hasContent: htmlInCanvas ? 1 : 0,
        maxX: contentMaxX,
        bg,
        gapColor: seam,
      },
    });
    return true;
  }

  function drawMain(targetSurface: GpuTarget) {
    if (!setMainParams()) return;
    mainFx!.draw(targetSurface);
  }

  function render() {
    if (!gpu || !screen || !mainFx || !flowTarget) return;
    uploadContent();

    const bloomOn = config.bloom > 0.001;
    const usePost = bloomOn || config.grain > 0.001;
    if (!usePost) {
      if (setMainParams()) gpuFrame(gpu, (f) => f.pass(screen!, mainFx!));
      return;
    }

    ensurePost();
    if (!sceneTarget || !bloomA || !bloomB || !brightFx || !blurFx || !compositeFx) return;
    drawMain(sceneTarget);

    if (bloomOn) {
      brightFx.set({ uScene: sceneTarget });
      brightFx.draw(bloomA);

      blurFx.set({
        uScene: bloomA,
        params: { dir: [1 / bloomA.size[0], 0] },
      });
      blurFx.draw(bloomB);
      blurFx.set({
        uScene: bloomB,
        params: { dir: [0, 1 / bloomA.size[1]] },
      });
      blurFx.draw(bloomA);
    } else {
      clearTarget(bloomA, [0, 0, 0, 0]);
    }

    const [width, height] = screen.size;
    compositeFx.set({
      uScene: sceneTarget,
      uBloomTex: bloomOn ? bloomA : sceneTarget,
      params: {
        resolution: [width, height],
        bloomAmt: bloomOn ? Math.min(Math.max(config.bloom, 0), 1) * 1.4 : 0,
        grainAmt: Math.min(Math.max(config.grain, 0), 1),
        time,
      },
    });
    gpuFrame(gpu, (f) => f.pass(screen!, compositeFx!));
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

  function animating(): boolean {
    if (reducedMotion) return false;
    if (config.float > 0) return true;
    if (config.grain > 0.001) return true;
    if (pointerOn) return true;
    if (performance.now() < simActiveUntil) return true;
    return false;
  }

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
    const delta = Math.min(Math.max((now - lastTime) / 1000, 0), 1 / 30);
    lastTime = now;
    if (!reducedMotion) {
      time += delta * Math.max(config.speed, 0);
      if (pointerOn) {
        const p = contentPoint(pointerClientX, pointerClientY);
        if (p) {
          const w = Math.max(output.clientWidth, 1);
          const h = Math.max(output.clientHeight, 1);
          const fx = p.x / w;
          const fy = p.y / h;
          const dx = hasPrevFlow ? (fx - prevFlowX) * w : 0;
          const dy = hasPrevFlow ? (fy - prevFlowY) * h : 0;
          const push = 1.6 * Math.max(config.flow, 0);
          applySplat(fx, fy, dx * push, dy * push, 10 * delta);
          prevFlowX = fx;
          prevFlowY = fy;
          hasPrevFlow = true;
          simActiveUntil = now + 4000;
        }
      }
      if (now < simActiveUntil || pointerOn) stepSim(delta);
    }
    render();
    if (!animating() && !contentDirty) {
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
        label: "hexfloat",
      });
      const linear = sampler(gpu, {
        minFilter: "linear",
        magFilter: "linear",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
      });
      ensureSim();
      mainFx = effect(gpu, MAIN_SHADER, {
        label: "hexfloat.main",
        set: {
          uContentSampler: linear,
          uFlowSampler: linear,
          uContent: ensureContentTexture(),
          uFlow: flowTarget!.read,
        },
      });
      splatFx = effect(gpu, SPLAT_SHADER, {
        label: "hexfloat.splat",
        set: { uSampler: linear, uTarget: velocity!.read },
      });
      advectFx = effect(gpu, ADVECT_SHADER, {
        label: "hexfloat.advect",
        set: { uSampler: linear, uVelocity: velocity!.read, uSource: velocity!.read },
      });
      clearFx = effect(gpu, CLEAR_SHADER, {
        label: "hexfloat.clear",
        set: { uSampler: linear, uTexture: pressure!.read },
      });
      divergenceFx = effect(gpu, DIVERGENCE_SHADER, {
        label: "hexfloat.divergence",
        set: { uSampler: linear, uVelocity: velocity!.read },
      });
      curlFx = effect(gpu, CURL_SHADER, {
        label: "hexfloat.curl",
        set: { uSampler: linear, uVelocity: velocity!.read },
      });
      vorticityFx = effect(gpu, VORTICITY_SHADER, {
        label: "hexfloat.vorticity",
        set: { uSampler: linear, uVelocity: velocity!.read, uCurl: curl! },
      });
      pressureFx = effect(gpu, PRESSURE_SHADER, {
        label: "hexfloat.pressure",
        set: { uSampler: linear, uPressure: pressure!.read, uDivergence: divergence! },
      });
      gradientFx = effect(gpu, GRADIENT_SHADER, {
        label: "hexfloat.gradient",
        set: { uSampler: linear, uPressure: pressure!.read, uVelocity: velocity!.read },
      });
      brightFx = effect(gpu, BRIGHT_SHADER, {
        label: "hexfloat.bright",
        set: { uSampler: linear, uScene: flowTarget!.read },
      });
      blurFx = effect(gpu, BLUR_SHADER, {
        label: "hexfloat.blur",
        set: { uSampler: linear, uScene: flowTarget!.read },
      });
      compositeFx = effect(gpu, COMPOSITE_SHADER, {
        label: "hexfloat.composite",
        set: { uSampler: linear, uScene: flowTarget!.read, uBloomTex: flowTarget!.read },
      });
      syncCanvasSize();
      start();
    })
    .catch((error) => {
      if (destroyed) return;
      console.warn("HexFloat: WebGPU unavailable, showing content without the effect.", error);
      fallback2d = output.getContext("2d");
      contentDirty = true;
      start();
    });

  function onPointerMove(event: PointerEvent) {
    pointerClientX = event.clientX;
    pointerClientY = event.clientY;
    pointerOn = true;
    simActiveUntil = performance.now() + 4000;
    updateHover(event.clientX, event.clientY);
    start();
  }

  function onPointerLeave() {
    pointerOn = false;
    hasPrevFlow = false;
    setHoverTarget(null);
    start();
  }

  content.addEventListener("pointermove", onPointerMove, { passive: true });
  content.addEventListener("pointerleave", onPointerLeave, { passive: true });

  function onScroll() {
    if (pointerOn) updateHover(pointerClientX, pointerClientY);
    start();
  }
  content.addEventListener("scroll", onScroll, { passive: true });

  function contentPoint(
    clientX: number,
    clientY: number,
  ): { x: number; y: number } | null {
    const rect = output.getBoundingClientRect();
    const dpr = output.width / Math.max(output.clientWidth, 1);
    const w = output.width;
    const hPx = output.height;
    if (w < 1 || hPx < 1) return null;
    const sx = (clientX - rect.left) * dpr;
    const sy = (clientY - rect.top) * dpr;
    const aspect = w / hPx;
    const ndcX = ((sx / w) * 2 - 1) * aspect;
    const ndcY = (sy / hPx) * 2 - 1;
    const tilt = (Math.min(Math.max(config.tilt, -30), 30) * Math.PI) / 180;
    const sa = Math.sin(tilt);
    const ca = Math.cos(tilt);
    const cell = Math.max(config.size, 8) * dpr;
    const h = hPx / cell;
    const dist = 2.6 - Math.min(Math.max(config.perspective, 0), 1) * 2.2;
    const d = h * dist;
    const focal = (d + Math.sqrt(d * d + h * h * sa * sa)) / (h * ca);
    const dy =
      0.5 * h - sa * d - (ca * d * (ca - focal * sa)) / (sa + focal * ca);
    const scrollX = content.scrollLeft * dpr;
    const scrollY = content.scrollTop * dpr;
    const roX = scrollX / cell + (0.5 * w) / cell;
    const roY = scrollY / cell + 0.5 * h + dy + sa * d;
    const roZ = -ca * d;
    const rdX = ndcX;
    const rdY = ndcY * ca - focal * sa;
    const rdZ = ndcY * sa + focal * ca;
    if (rdZ < 1e-6) return null;
    const t = -roZ / rdZ;
    const px = (roX + rdX * t) * cell - scrollX;
    const py = (roY + rdY * t) * cell - scrollY;
    return { x: px / dpr, y: py / dpr };
  }

  let forwarding = false;
  let hoverChain: Element[] = [];
  let hoverTarget: Element | null = null;

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
    if (target) {
      content.style.setProperty(
        "--canvasui-cursor",
        getComputedStyle(target).cursor,
      );
    } else {
      content.style.removeProperty("--canvasui-cursor");
    }
  }

  function updateHover(clientX: number, clientY: number) {
    if (!htmlInCanvas) return;
    const p = contentPoint(clientX, clientY);
    if (!p) {
      setHoverTarget(null);
      return;
    }
    const rect = content.getBoundingClientRect();
    const targetEl = document.elementFromPoint(rect.left + p.x, rect.top + p.y);
    setHoverTarget(targetEl && content.contains(targetEl) ? targetEl : null);
  }

  function onClick(event: MouseEvent) {
    if (forwarding || !htmlInCanvas) return;
    const p = contentPoint(event.clientX, event.clientY);
    if (!p) return;
    const rect = content.getBoundingClientRect();
    const tx = rect.left + p.x;
    const ty = rect.top + p.y;
    if (Math.hypot(tx - event.clientX, ty - event.clientY) < 1.5) return;
    event.preventDefault();
    event.stopPropagation();
    const targetEl = document.elementFromPoint(tx, ty);
    if (!targetEl || !content.contains(targetEl)) return;
    const focusable = targetEl.closest<HTMLElement>(
      "a, button, input, select, textarea, [tabindex]",
    );
    forwarding = true;
    try {
      focusable?.focus?.();
      targetEl.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          cancelable: true,
          view: window,
          clientX: tx,
          clientY: ty,
          button: event.button,
          ctrlKey: event.ctrlKey,
          shiftKey: event.shiftKey,
          altKey: event.altKey,
          metaKey: event.metaKey,
        }),
      );
    } finally {
      forwarding = false;
    }
  }

  content.addEventListener("click", onClick, true);

  function caretAt(x: number, y: number): { node: Node; offset: number } | null {
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
    const p = contentPoint(event.clientX, event.clientY);
    if (!p) return null;
    const rect = content.getBoundingClientRect();
    const tx = rect.left + p.x;
    const ty = rect.top + p.y;
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
    if (reducedMotion) {
      pointerOn = false;
      hasPrevFlow = false;
      simActiveUntil = 0;
    }
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

  const mutation = new MutationObserver(() => {
    syncBgColor();
    start();
  });
  mutation.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "style", "data-theme"],
  });

  return {
    setOptions(next) {
      if (
        !Object.entries(next).some(
          ([key, value]) => config[key as keyof HexFloatOptions] !== value,
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
      setHoverTarget(null);
      content.removeAttribute(CONTENT_ATTR);
      content.removeEventListener("pointermove", onPointerMove);
      content.removeEventListener("pointerleave", onPointerLeave);
      content.removeEventListener("scroll", onScroll);
      content.removeEventListener("click", onClick, true);
      content.removeEventListener("mousedown", onMouseDown, true);
      window.removeEventListener("mousemove", onSelMove, true);
      window.removeEventListener("mouseup", onSelEnd, true);
      observer.disconnect();
      intersection.disconnect();
      mutation.disconnect();
      motionQuery.removeEventListener("change", onMotionChange);
      contentTexture?.destroy();
      releaseSim();
      releasePost();
      screen?.dispose();
      if (htmlInCanvas) paintable.onpaint = null;
    },
  };
}
