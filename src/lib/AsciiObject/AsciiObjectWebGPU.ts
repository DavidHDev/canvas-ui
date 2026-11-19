import { getCanvasPixelRatio, createCanvasResizeObserver } from "../canvas-viewport";
import {
  draw,
  effect as gpuEffect,
  frame as gpuFrame,
  geometry,
  init,
  sampler,
  surface,
  target,
  type Draw,
  type Effect,
  type Geometry as VgpuGeometry,
  type Gpu,
  type Surface,
  type Target,
} from "vgpu";
import type { Texture } from "vgpu";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { resolveOptions } from "../options";

export interface AsciiObjectOptions {
  /** URL of the asset to display: GLB/glTF, SVG, PNG, JPEG, WebP, or GIF. Object URLs from a file input work too. The format is sniffed from the bytes, not the extension. */
  src?: string;
  /** Render the object as ASCII characters. Turn off to see the raw render. */
  ascii?: boolean;
  /** Height of one character cell in CSS pixels. */
  cellSize?: number;
  /** Width of a character cell relative to its height (0.35 to 1.25). */
  cellAspect?: number;
  /** Characters the renderer may choose from. Shapes are matched, not just brightness, and a space is always available for empty cells. */
  charset?: string;
  /** Tint each character with the scene color underneath it. Turn off for a single-color look. */
  colored?: boolean;
  /** Character color used when colored is off. */
  color?: string;
  /** Tone contrast of the character selection. 1 keeps the original tones, higher values deepen shadows. */
  contrast?: number;
  /** How strongly characters snap to edges and contours of the object. 1 turns the effect off. */
  edgeContrast?: number;
  /** Brightness multiplier applied before characters are chosen. */
  exposure?: number;
  /** Invert the object tones so dark areas get the dense characters. */
  invert?: boolean;
  /** Background color behind the characters. Empty string keeps the canvas transparent. */
  background?: string;
  /** Accent color of the ring light in the studio environment. */
  highlight?: string;
  /** Brightness of the studio environment lighting. */
  environmentIntensity?: number;
  /** Roughness override applied to every material (0 to 1). Negative keeps the asset's own values. */
  roughness?: number;
  /** Size of the longest side of the object in scene units. The camera sits about 4 units away. */
  scale?: number;
  /** Horizontal offset of the object in scene units. */
  xOffset?: number;
  /** Vertical offset of the object in scene units. */
  yOffset?: number;
  /** Strength of the floating bob animation (0 disables). */
  floatIntensity?: number;
  /** Strength of the idle rocking rotation (0 disables). */
  rotationIntensity?: number;
  /** Speed of the float and rocking animation. */
  floatSpeed?: number;
  /** Let the user orbit the camera by dragging. */
  orbit?: boolean;
  /** Let the user zoom with the scroll wheel or pinch. */
  zoom?: boolean;
  /** Spin the camera around the object turntable-style. */
  autoRotate?: boolean;
  /** Turntable speed when autoRotate is on. */
  autoRotateSpeed?: number;
  /** Camera field of view in degrees. */
  fov?: number;
  /** Camera distance from the center of the object. */
  cameraDistance?: number;
  /** Base URL of the Draco decoder, fetched only when a model needs it. */
  dracoDecoderPath?: string;
  /** Called after an asset finishes loading. */
  onLoad?: (() => void) | null;
  /** Called when an asset fails to load. */
  onError?: ((error: unknown) => void) | null;
}

export interface AsciiObjectElements {
  canvas: HTMLCanvasElement;
}

export interface AsciiObjectInstance {
  setOptions: (options: AsciiObjectOptions) => void;
  resize: () => void;
  destroy: () => void;
}

const PRINTABLE_ASCII = Array.from({ length: 95 }, (_, i) => String.fromCharCode(32 + i)).join("");

const DEFAULTS: Required<AsciiObjectOptions> = {
  src: "",
  ascii: true,
  cellSize: 10,
  cellAspect: 0.6,
  charset: PRINTABLE_ASCII,
  colored: true,
  color: "#ffffff",
  contrast: 1.5,
  edgeContrast: 3,
  exposure: 1,
  invert: false,
  background: "",
  highlight: "#066aff",
  environmentIntensity: 1,
  roughness: -1,
  scale: 3,
  xOffset: 0,
  yOffset: 0,
  floatIntensity: 2,
  rotationIntensity: 1,
  floatSpeed: 2,
  orbit: true,
  zoom: false,
  autoRotate: false,
  autoRotateSpeed: 2,
  fov: 65,
  cameraDistance: 4.2,
  dracoDecoderPath: "https://www.gstatic.com/draco/versioned/decoders/1.5.7/",
  onLoad: null,
  onError: null,
};

const ENV_WIDTH = 128;
const ENV_HEIGHT = 64;
const ENV_LEVELS = 6;

const FORWARD_SHADER = `
const PI = 3.14159265359;
const ENV_LEVELS = 6.0;
const ENV_ROWS = 64.0;

struct Params {
  sh: array<vec4f, 9>,
  mvp: mat4x4f,
  model: mat4x4f,
  normalMatrix: mat4x4f,
  baseColor: vec4f,
  cameraPos: vec3f,
  roughness: f32,
  emissive: vec3f,
  metalness: f32,
  highlight: vec3f,
  envIntensity: f32,
  useMap: f32,
  opacity: f32,
  alphaTest: f32,
  pad: f32,
}

struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) worldPos: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
  @location(3) color: vec4f,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var uMap: texture_2d<f32>;
@group(0) @binding(2) var uMapSampler: sampler;
@group(0) @binding(3) var uEnv: texture_2d<f32>;
@group(0) @binding(4) var uEnvSampler: sampler;

fn srgbToLinear(c: vec3f) -> vec3f {
  return pow(max(c, vec3f(0.0)), vec3f(2.2));
}

fn equirect(d: vec3f) -> vec2f {
  let u = (atan2(d.x, -d.z) + PI) / (2.0 * PI);
  let v = acos(clamp(d.y, -1.0, 1.0)) / PI;
  return vec2f(u, v);
}

fn envRadiance(d: vec3f, roughness: f32) -> vec3f {
  let uv = equirect(d);
  let lod = clamp(roughness, 0.0, 1.0) * (ENV_LEVELS - 1.0);
  let l0 = floor(lod);
  let l1 = min(l0 + 1.0, ENV_LEVELS - 1.0);
  let v = clamp(uv.y, 0.5 / ENV_ROWS, 1.0 - 0.5 / ENV_ROWS);
  let a = textureSampleLevel(uEnv, uEnvSampler, vec2f(uv.x, (l0 + v) / ENV_LEVELS), 0.0);
  let b = textureSampleLevel(uEnv, uEnvSampler, vec2f(uv.x, (l1 + v) / ENV_LEVELS), 0.0);
  let s = mix(a, b, lod - l0);
  return s.rgb + params.highlight * s.a;
}

fn shIrradiance(n: vec3f) -> vec3f {
  let c = params.sh;
  var e = c[0] * 0.282095;
  e += c[1] * (0.488603 * n.y);
  e += c[2] * (0.488603 * n.z);
  e += c[3] * (0.488603 * n.x);
  e += c[4] * (1.092548 * n.x * n.y);
  e += c[5] * (1.092548 * n.y * n.z);
  e += c[6] * (0.315392 * (3.0 * n.z * n.z - 1.0));
  e += c[7] * (1.092548 * n.x * n.z);
  e += c[8] * (0.546274 * (n.x * n.x - n.y * n.y));
  return max(e.rgb + params.highlight * e.a, vec3f(0.0));
}

fn dfgApprox(ndv: f32, roughness: f32) -> vec2f {
  let c0 = vec4f(-1.0, -0.0275, -0.572, 0.022);
  let c1 = vec4f(1.0, 0.0425, 1.04, -0.04);
  let r = roughness * c0 + c1;
  let a004 = min(r.x * r.x, exp2(-9.28 * ndv)) * r.x + r.y;
  return vec2f(-1.04, 1.04) * a004 + r.zw;
}

@vertex fn vs_main(
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
  @location(3) color: vec4f,
) -> VSOut {
  let world = params.model * vec4f(position, 1.0);
  var clip = params.mvp * vec4f(position, 1.0);
  clip.z = clip.z * 0.5 + clip.w * 0.5;
  var out: VSOut;
  out.pos = clip;
  out.worldPos = world.xyz;
  out.normal = normalize((params.normalMatrix * vec4f(normal, 0.0)).xyz);
  out.uv = uv;
  out.color = color;
  return out;
}

@fragment fn fs_main(in: VSOut, @builtin(front_facing) front: bool) -> @location(0) vec4f {
  var tex = textureSampleLevel(uMap, uMapSampler, in.uv, 0.0);
  var albedo = params.baseColor.rgb * in.color.rgb;
  var alpha = params.baseColor.a * params.opacity * in.color.a;
  if (params.useMap > 0.5) {
    albedo *= srgbToLinear(tex.rgb);
    alpha *= tex.a;
  }
  if (alpha <= params.alphaTest) { discard; }

  var n = normalize(in.normal);
  if (!front) { n = -n; }
  let v = normalize(params.cameraPos - in.worldPos);
  let ndv = max(dot(n, v), 0.0001);
  let rough = clamp(params.roughness, 0.0, 1.0);
  let metal = clamp(params.metalness, 0.0, 1.0);

  let diffuseColor = albedo * (1.0 - metal);
  let specularColor = mix(vec3f(0.04), albedo, vec3f(metal));
  let irradiance = shIrradiance(n) * params.envIntensity;
  let radiance = envRadiance(reflect(-v, n), rough) * params.envIntensity;

  let fab = dfgApprox(ndv, rough);
  let fssEss = specularColor * fab.x + vec3f(fab.y);
  let ess = fab.x + fab.y;
  let ems = 1.0 - ess;
  let favg = specularColor + (1.0 - specularColor) * 0.047619;
  let fms = fssEss * favg / (1.0 - ems * favg);
  let single = fssEss;
  let multi = fms * ems;
  let diffuse = diffuseColor * (1.0 - (single + multi));

  var color = radiance * single + multi * irradiance + diffuse * irradiance;
  color += params.emissive;
  color = clamp(color, vec3f(0.0), vec3f(1.0));
  return vec4f(color * alpha, alpha);
}`;

const PREFILTER_SHADER = `
const PI = 3.14159265359;
const LEVELS = 6.0;
const SRC_W = 64u;
const SRC_H = 32u;

struct Params { hiSize: vec2f, pad: vec2f }
@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var uHi: texture_2d<f32>;
@group(0) @binding(2) var uLo: texture_2d<f32>;

fn dirFor(u: f32, v: f32) -> vec3f {
  let phi = u * 2.0 * PI - PI;
  let theta = v * PI;
  let st = sin(theta);
  return vec3f(st * sin(phi), cos(theta), -st * cos(phi));
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let level = floor(uv.y * LEVELS);
  let local = fract(uv.y * LEVELS);
  if (level < 0.5) {
    let px = vec2i(i32(uv.x * params.hiSize.x), i32(local * params.hiSize.y));
    return textureLoad(uHi, px, 0);
  }
  let n = dirFor(uv.x, local);
  let roughness = level / (LEVELS - 1.0);
  let a = roughness * roughness;
  let a2 = a * a;
  var acc = vec4f(0.0);
  var wsum = 0.0;
  for (var j = 0u; j < SRC_H; j++) {
    let theta = (f32(j) + 0.5) / f32(SRC_H) * PI;
    let dOmega = sin(theta);
    for (var i = 0u; i < SRC_W; i++) {
      let l = dirFor((f32(i) + 0.5) / f32(SRC_W), (f32(j) + 0.5) / f32(SRC_H));
      let ndl = dot(n, l);
      if (ndl <= 0.0) { continue; }
      let ndh = sqrt(max((1.0 + ndl) * 0.5, 0.0));
      let denom = ndh * ndh * (a2 - 1.0) + 1.0;
      let d = a2 / max(PI * denom * denom, 1e-6);
      let w = d * ndl * dOmega;
      acc += textureLoad(uLo, vec2i(i32(i), i32(j)), 0) * w;
      wsum += w;
    }
  }
  return acc / max(wsum, 1e-6);
}`;

const CELL_SHADER = `
struct Params {
  resolution: vec2f,
  cellPx: vec2f,
  glyphCount: u32,
  contrast: f32,
  edgeContrast: f32,
  exposure: f32,
  invert: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var tScene: texture_2d<f32>;
@group(0) @binding(2) var sceneSampler: sampler;
@group(0) @binding(3) var tShapes: texture_2d<f32>;

const INNER: array<vec2f, 6> = array<vec2f, 6>(
  vec2f(0.28, 0.26), vec2f(0.72, 0.14),
  vec2f(0.28, 0.56), vec2f(0.72, 0.44),
  vec2f(0.28, 0.86), vec2f(0.72, 0.74)
);
const OUTER: array<vec2f, 10> = array<vec2f, 10>(
  vec2f(0.28, -0.2), vec2f(0.72, -0.2),
  vec2f(-0.22, 0.25), vec2f(1.22, 0.25),
  vec2f(-0.22, 0.5), vec2f(1.22, 0.5),
  vec2f(-0.22, 0.75), vec2f(1.22, 0.75),
  vec2f(0.28, 1.2), vec2f(0.72, 1.2)
);
const RING: array<vec2f, 6> = array<vec2f, 6>(
  vec2f(1.0, 0.0), vec2f(0.5, 0.8660254), vec2f(-0.5, 0.8660254),
  vec2f(-1.0, 0.0), vec2f(-0.5, -0.8660254), vec2f(0.5, -0.8660254)
);

fn toSrgb(cIn: vec3f) -> vec3f {
  let c = clamp(cIn, vec3f(0.0), vec3f(1.0));
  return mix(c * 12.92, 1.055 * pow(c, vec3f(1.0 / 2.4)) - 0.055, step(vec3f(0.0031308), c));
}

fn fetchTap(p: vec2f) -> vec4f {
  let uv = p / params.resolution;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { return vec4f(0.0); }
  return textureSampleLevel(tScene, sceneSampler, uv, 0.0);
}

fn sampleCircle(cellBase: vec2f, c: vec2f) -> vec4f {
  let middle = cellBase + c * params.cellPx;
  let r = params.cellPx.y * 0.161;
  var acc = fetchTap(middle);
  for (var k = 0u; k < 6u; k++) { acc += fetchTap(middle + RING[k] * r); }
  return acc / 7.0;
}

fn circleLum(acc: vec4f) -> f32 {
  let straight = toSrgb(acc.rgb / max(acc.a, 1e-4));
  var level = clamp(dot(straight, vec3f(0.2126, 0.7152, 0.0722)) * params.exposure, 0.0, 1.0);
  level = mix(level, 1.0 - level, params.invert);
  return level * acc.a;
}

fn dirContrast(value: f32, ext: f32) -> f32 {
  let peak = max(value, ext);
  if (peak < 1e-4) { return value; }
  return pow(value / peak, params.edgeContrast) * peak;
}

@fragment fn fs_main(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let cellBase = floor(pos.xy - vec2f(0.5)) * params.cellPx;
  var v: array<f32, 6>;
  var colAcc = vec3f(0.0);
  var alphaAcc = 0.0;
  for (var i = 0u; i < 6u; i++) {
    let acc = sampleCircle(cellBase, INNER[i]);
    v[i] = circleLum(acc);
    colAcc += acc.rgb;
    alphaAcc += acc.a;
  }
  var e: array<f32, 10>;
  for (var i = 0u; i < 10u; i++) { e[i] = circleLum(sampleCircle(cellBase, OUTER[i])); }
  v[0] = dirContrast(v[0], max(max(e[0], e[1]), max(e[2], e[4])));
  v[1] = dirContrast(v[1], max(max(e[0], e[1]), max(e[3], e[5])));
  v[2] = dirContrast(v[2], max(e[2], max(e[4], e[6])));
  v[3] = dirContrast(v[3], max(e[3], max(e[5], e[7])));
  v[4] = dirContrast(v[4], max(max(e[4], e[6]), max(e[8], e[9])));
  v[5] = dirContrast(v[5], max(max(e[5], e[7]), max(e[8], e[9])));
  let peak = max(max(max(v[0], v[1]), max(v[2], v[3])), max(v[4], v[5]));
  if (peak > 1e-4) {
    for (var i = 0u; i < 6u; i++) { v[i] = pow(v[i] / peak, params.contrast) * peak; }
  }
  var best = 0u;
  var bestD = 1e9;
  for (var g = 0u; g < params.glyphCount; g++) {
    var d = 0.0;
    for (var i = 0u; i < 6u; i++) {
      let diff = v[i] - textureLoad(tShapes, vec2i(i32(i), i32(g)), 0).r;
      d += diff * diff;
    }
    if (d < bestD) {
      bestD = d;
      best = g;
    }
  }
  let cellColor = toSrgb(colAcc / max(alphaAcc, 1e-4));
  return vec4f(cellColor, f32(best) / 255.0);
}`;

const POST_SHADER = `
struct Params {
  resolution: vec2f,
  cellPx: vec2f,
  grid: vec2f,
  atlasGrid: vec2f,
  atlasPad: vec2f,
  atlasInner: vec2f,
  color: vec3f,
  ascii: f32,
  background: vec3f,
  colored: f32,
  hasBg: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var tScene: texture_2d<f32>;
@group(0) @binding(2) var sceneSampler: sampler;
@group(0) @binding(3) var tCells: texture_2d<f32>;
@group(0) @binding(4) var tAtlas: texture_2d<f32>;
@group(0) @binding(5) var atlasSampler: sampler;

fn toSrgb(cIn: vec3f) -> vec3f {
  let c = clamp(cIn, vec3f(0.0), vec3f(1.0));
  return mix(c * 12.92, 1.055 * pow(c, vec3f(1.0 / 2.4)) - 0.055, step(vec3f(0.0031308), c));
}

fn mod1(x: f32, y: f32) -> f32 { return x - y * floor(x / y); }

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  if (params.ascii < 0.5) {
    let raw = textureSampleLevel(tScene, sceneSampler, uv, 0.0);
    let rawColor = toSrgb(raw.rgb / max(raw.a, 1e-4));
    if (params.hasBg > 0.5) {
      return vec4f(params.background * (1.0 - raw.a) + rawColor * raw.a, 1.0);
    }
    return vec4f(rawColor * raw.a, raw.a);
  }
  let fragCoord = uv * params.resolution;
  let cellPos = fragCoord / params.cellPx;
  let cell = clamp(floor(cellPos), vec2f(0.0), params.grid - vec2f(1.0));
  let info = textureLoad(tCells, vec2i(cell), 0);
  let glyph = floor(info.a * 255.0 + 0.5);
  let local = clamp(cellPos - cell, vec2f(0.0), vec2f(1.0));
  let gx = mod1(glyph, params.atlasGrid.x);
  let gy = floor(glyph / params.atlasGrid.x);
  let atlasUv = vec2f(
    (gx + params.atlasPad.x + local.x * params.atlasInner.x) / params.atlasGrid.x,
    (gy + params.atlasPad.y + local.y * params.atlasInner.y) / params.atlasGrid.y
  );
  let atlasStep = params.atlasInner / params.atlasGrid;
  let mask = textureSampleGrad(tAtlas, atlasSampler, atlasUv, dpdx(cellPos) * atlasStep, dpdy(cellPos) * atlasStep).a;
  let glyphColor = mix(params.color, info.rgb, vec3f(params.colored));
  if (params.hasBg > 0.5) {
    return vec4f(mix(params.background, glyphColor, vec3f(mask)), 1.0);
  }
  return vec4f(glyphColor * mask, mask);
}`;

interface FormerDef {
  kind: "ring" | "box";
  intensity: number;
  position: [number, number, number];
  scale: [number, number, number];
  lookAtCenter?: boolean;
  withLight?: boolean;
}

const ROOM_FORMERS: FormerDef[] = [
  { kind: "ring", intensity: 15, position: [2, 3, -2], scale: [10, 10, 10], lookAtCenter: true },
  { kind: "box", intensity: 80, position: [-14, 10, 8], scale: [0.1, 2.5, 2.5] },
  { kind: "box", intensity: 80, position: [-14, 14, -4], scale: [0.1, 2.5, 2.5], withLight: true },
  { kind: "box", intensity: 23, position: [14, 12, 0], scale: [0.1, 5, 5], withLight: true },
  { kind: "box", intensity: 16, position: [0, 9, 14], scale: [5, 5, 0.1], withLight: true },
  { kind: "box", intensity: 80, position: [7, 8, -14], scale: [2.5, 2.5, 0.1], withLight: true },
  { kind: "box", intensity: 80, position: [-7, 16, -14], scale: [2.5, 2.5, 0.1], withLight: true },
  { kind: "box", intensity: 1, position: [0, 20, 0], scale: [0.1, 0.1, 0.1], withLight: true },
  { kind: "box", intensity: 20, position: [0, 15, 0], scale: [10, 1, 10], withLight: true },
];

const ROOM_BLOCKS: Array<{
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}> = [
  { position: [-10.906, -1, 1.846], rotation: [0, -0.195, 0], scale: [2.328, 7.905, 4.651] },
  { position: [-5.607, -0.754, -0.758], rotation: [0, 0.994, 0], scale: [1.97, 1.534, 3.955] },
  { position: [6.167, -0.16, 7.803], rotation: [0, 0.561, 0], scale: [3.927, 6.285, 3.687] },
  { position: [-2.017, 0.018, 6.124], rotation: [0, 0.333, 0], scale: [2.002, 4.566, 2.064] },
  { position: [2.291, -0.756, -2.621], rotation: [0, -0.286, 0], scale: [1.546, 1.552, 1.496] },
  { position: [-2.193, -0.369, -5.547], rotation: [0, 0.516, 0], scale: [3.875, 3.487, 2.986] },
];

interface RoomSurface {
  kind: "box" | "ring";
  inverse: THREE.Matrix4;
  normalMatrix: THREE.Matrix3;
  emissive: [number, number, number] | null;
  ring: boolean;
  albedo: number;
  backSide: boolean;
}

interface RoomLight {
  kind: "point" | "spot";
  position: THREE.Vector3;
  intensity: number;
  cutoff: number;
  decay: number;
  direction?: THREE.Vector3;
  angleCos?: number;
}

interface StudioRadiance {
  hi: Float32Array;
  lo: Float32Array;
  sh: [number, number, number, number][];
}

let studioRadiance: StudioRadiance | null = null;

function bakeStudioRadiance(): StudioRadiance {
  if (studioRadiance) return studioRadiance;
  const surfaces: RoomSurface[] = [];
  const lights: RoomLight[] = [];
  const holder = new THREE.Object3D();
  const gray = new THREE.Color("gray");

  function add(
    kind: "box" | "ring",
    position: [number, number, number],
    scale: [number, number, number],
    extra: Partial<RoomSurface> & { rotation?: [number, number, number]; lookAtCenter?: boolean },
  ) {
    holder.position.set(...position);
    holder.rotation.set(...(extra.rotation ?? [0, 0, 0]));
    holder.scale.set(...scale);
    if (extra.lookAtCenter) holder.lookAt(0, 0, 0);
    holder.updateMatrixWorld(true);
    surfaces.push({
      kind,
      inverse: holder.matrixWorld.clone().invert(),
      normalMatrix: new THREE.Matrix3().getNormalMatrix(holder.matrixWorld),
      emissive: extra.emissive ?? null,
      ring: extra.ring ?? false,
      albedo: extra.albedo ?? 1,
      backSide: extra.backSide ?? false,
    });
  }

  add("box", [0, 13.2, 0], [31.5, 28.5, 31.5], { albedo: gray.r, backSide: true });
  for (const def of ROOM_BLOCKS) add("box", def.position, def.scale, { rotation: def.rotation });
  for (const def of ROOM_FORMERS) {
    add(def.kind, def.position, def.scale, {
      emissive: def.kind === "ring" ? [0, 0, 0] : [def.intensity, def.intensity, def.intensity],
      ring: def.kind === "ring",
      lookAtCenter: def.lookAtCenter,
    });
    if (def.withLight) {
      lights.push({ kind: "point", position: new THREE.Vector3(...def.position), intensity: 100, cutoff: 28, decay: 2 });
    }
  }
  lights.push({ kind: "point", position: new THREE.Vector3(0.5, 14, 0.5), intensity: 100, cutoff: 28, decay: 2 });
  for (const [x, z] of [[-15, 15], [15, 15], [15, -15], [-15, -15]]) {
    const position = new THREE.Vector3(x, 20, z);
    lights.push({
      kind: "spot",
      position,
      intensity: 2,
      cutoff: 0,
      decay: 0,
      direction: position.clone().negate().normalize(),
      angleCos: Math.cos(0.2),
    });
  }

  const origin = new THREE.Vector3(0, 0.5, 0);
  const localO = new THREE.Vector3();
  const localD = new THREE.Vector3();
  const hitPoint = new THREE.Vector3();
  const hitNormal = new THREE.Vector3();
  const toLight = new THREE.Vector3();

  function shade(point: THREE.Vector3, normal: THREE.Vector3, albedo: number) {
    let irradiance = 0;
    for (const light of lights) {
      toLight.subVectors(light.position, point);
      const dist = toLight.length();
      toLight.divideScalar(dist);
      const ndl = normal.dot(toLight);
      if (ndl <= 0) continue;
      let falloff = 1 / Math.max(Math.pow(dist, light.decay), 0.01);
      if (light.cutoff > 0) {
        const ratio = dist / light.cutoff;
        falloff *= Math.pow(Math.min(Math.max(1 - ratio * ratio * ratio * ratio, 0), 1), 2);
      }
      if (light.kind === "spot") {
        const cos = -toLight.dot(light.direction!);
        const t = Math.min(Math.max((cos - light.angleCos!) / (1 - light.angleCos!), 0), 1);
        falloff *= t * t * (3 - 2 * t);
      }
      irradiance += light.intensity * falloff * ndl;
    }
    return (irradiance * albedo) / Math.PI;
  }

  function trace(dir: THREE.Vector3, out: [number, number, number, number]) {
    let bestT = Infinity;
    let best: RoomSurface | null = null;
    let bestAxis = 0;
    for (const surface of surfaces) {
      localO.copy(origin).applyMatrix4(surface.inverse);
      localD.copy(dir).transformDirection(surface.inverse);
      const scale = new THREE.Vector3().copy(dir).applyMatrix4(surface.inverse).sub(new THREE.Vector3().applyMatrix4(surface.inverse)).length();
      localD.multiplyScalar(scale);
      if (surface.kind === "ring") {
        if (Math.abs(localD.z) < 1e-8) continue;
        const t = -localO.z / localD.z;
        if (t <= 1e-4 || t >= bestT) continue;
        const px = localO.x + localD.x * t;
        const py = localO.y + localD.y * t;
        const r = Math.hypot(px, py);
        if (r < 0.5 || r > 1) continue;
        bestT = t;
        best = surface;
        bestAxis = 2;
        continue;
      }
      let tNear = -Infinity;
      let tFar = Infinity;
      let nearAxis = 0;
      let farAxis = 0;
      const o = [localO.x, localO.y, localO.z];
      const d = [localD.x, localD.y, localD.z];
      let miss = false;
      for (let axis = 0; axis < 3; axis++) {
        if (Math.abs(d[axis]) < 1e-9) {
          if (Math.abs(o[axis]) > 0.5) { miss = true; break; }
          continue;
        }
        let t0 = (-0.5 - o[axis]) / d[axis];
        let t1 = (0.5 - o[axis]) / d[axis];
        if (t0 > t1) [t0, t1] = [t1, t0];
        if (t0 > tNear) { tNear = t0; nearAxis = axis; }
        if (t1 < tFar) { tFar = t1; farAxis = axis; }
        if (tNear > tFar) { miss = true; break; }
      }
      if (miss) continue;
      const t = surface.backSide ? tFar : tNear;
      if (t <= 1e-4 || t >= bestT) continue;
      bestT = t;
      best = surface;
      bestAxis = surface.backSide ? farAxis : nearAxis;
    }
    if (!best) {
      out[0] = out[1] = out[2] = out[3] = 0;
      return;
    }
    if (best.ring) {
      out[0] = out[1] = out[2] = 0;
      out[3] = 1;
      return;
    }
    if (best.emissive) {
      out[0] = best.emissive[0];
      out[1] = best.emissive[1];
      out[2] = best.emissive[2];
      out[3] = 0;
      return;
    }
    hitPoint.copy(origin).addScaledVector(dir, bestT);
    localO.copy(hitPoint).applyMatrix4(best.inverse);
    hitNormal.set(0, 0, 0);
    hitNormal.setComponent(bestAxis, Math.sign(localO.getComponent(bestAxis)) || 1);
    hitNormal.applyMatrix3(best.normalMatrix).normalize();
    if (hitNormal.dot(dir) > 0) hitNormal.negate();
    const l = shade(hitPoint, hitNormal, best.albedo);
    out[0] = out[1] = out[2] = l;
    out[3] = 0;
  }

  const hi = new Float32Array(ENV_WIDTH * ENV_HEIGHT * 4);
  const sh: [number, number, number, number][] = Array.from({ length: 9 }, () => [0, 0, 0, 0]);
  const dir = new THREE.Vector3();
  const sample: [number, number, number, number] = [0, 0, 0, 0];
  const dPhi = (2 * Math.PI) / ENV_WIDTH;
  const dTheta = Math.PI / ENV_HEIGHT;
  const band = [Math.PI, (2 * Math.PI) / 3, Math.PI / 4];
  for (let j = 0; j < ENV_HEIGHT; j++) {
    const theta = ((j + 0.5) / ENV_HEIGHT) * Math.PI;
    const st = Math.sin(theta);
    const ct = Math.cos(theta);
    const dOmega = dPhi * dTheta * st;
    for (let i = 0; i < ENV_WIDTH; i++) {
      const phi = ((i + 0.5) / ENV_WIDTH) * 2 * Math.PI - Math.PI;
      dir.set(st * Math.sin(phi), ct, -st * Math.cos(phi));
      trace(dir, sample);
      const o = (j * ENV_WIDTH + i) * 4;
      hi[o] = sample[0];
      hi[o + 1] = sample[1];
      hi[o + 2] = sample[2];
      hi[o + 3] = sample[3];
      const { x, y, z } = dir;
      const basis = [
        0.282095,
        0.488603 * y,
        0.488603 * z,
        0.488603 * x,
        1.092548 * x * y,
        1.092548 * y * z,
        0.315392 * (3 * z * z - 1),
        1.092548 * x * z,
        0.546274 * (x * x - y * y),
      ];
      for (let k = 0; k < 9; k++) {
        const w = basis[k] * dOmega;
        sh[k][0] += sample[0] * w;
        sh[k][1] += sample[1] * w;
        sh[k][2] += sample[2] * w;
        sh[k][3] += sample[3] * w;
      }
    }
  }
  for (let k = 0; k < 9; k++) {
    const l = k === 0 ? 0 : k < 4 ? 1 : 2;
    const scale = band[l] / Math.PI;
    for (let c = 0; c < 4; c++) sh[k][c] *= scale;
  }

  const loW = ENV_WIDTH / 2;
  const loH = ENV_HEIGHT / 2;
  const lo = new Float32Array(loW * loH * 4);
  for (let j = 0; j < loH; j++) {
    for (let i = 0; i < loW; i++) {
      const o = (j * loW + i) * 4;
      for (let c = 0; c < 4; c++) {
        lo[o + c] =
          (hi[((2 * j) * ENV_WIDTH + 2 * i) * 4 + c] +
            hi[((2 * j) * ENV_WIDTH + 2 * i + 1) * 4 + c] +
            hi[((2 * j + 1) * ENV_WIDTH + 2 * i) * 4 + c] +
            hi[((2 * j + 1) * ENV_WIDTH + 2 * i + 1) * 4 + c]) *
          0.25;
      }
    }
  }
  studioRadiance = { hi, lo, sh };
  return studioRadiance;
}

function floatToHalf(value: number): number {
  const f = new Float32Array(1);
  const u = new Uint32Array(f.buffer);
  f[0] = value;
  const x = u[0];
  const sign = (x >> 16) & 0x8000;
  const mantissa = x & 0x007fffff;
  const exponent = (x >> 23) & 0xff;
  if (exponent === 0xff) return sign | (mantissa ? 0x7e00 : 0x7c00);
  const half = exponent - 127 + 15;
  if (half >= 0x1f) return sign | 0x7c00;
  if (half <= 0) return half < -10 ? sign : sign | ((mantissa | 0x00800000) >> (1 - half + 13));
  return sign | (half << 10) | (mantissa >> 13);
}

function toHalfArray(data: Float32Array): Uint16Array<ArrayBuffer> {
  const out = new Uint16Array(new ArrayBuffer(data.length * 2));
  for (let i = 0; i < data.length; i++) out[i] = floatToHalf(data[i]);
  return out;
}

const CAMERA_DIR = new THREE.Vector3(0, -1, 4).normalize();

function fitFov(fov: number, aspect: number): number {
  if (aspect >= 1) return fov;
  const half = THREE.MathUtils.degToRad(fov) / 2;
  const margin = 1 + 0.25 * (1 - aspect);
  return THREE.MathUtils.radToDeg(2 * Math.atan((Math.tan(half) * margin) / aspect));
}
const MODEL_LIFT = 0.3;
const RASTER_SIZE = 2048;
const TRACE_SIZE = 512;
const ALPHA_CUTOFF = 127;
const SIMPLIFY_TOLERANCE = 1;
const MIN_AREA = 6;
const MAX_CONTOURS = 64;
const EXTRUDE_DEPTH = 0.08;
const BEVEL_SIZE = 0.006;
const ATLAS_CELL = 64;
const ATLAS_PAD = 8;
const MAX_GLYPHS = 255;
const VERTEX_STRIDE = 12;
const INNER_CIRCLES: Array<[number, number]> = [
  [0.28, 0.26],
  [0.72, 0.14],
  [0.28, 0.56],
  [0.72, 0.44],
  [0.28, 0.86],
  [0.72, 0.74],
];

type AssetKind = "glb" | "gltf" | "svg" | "bitmap";

type TextureImage = HTMLImageElement | HTMLCanvasElement | ImageBitmap | OffscreenCanvas;

interface RenderItem {
  object: THREE.Mesh;
  material: THREE.Material;
  geometry: VgpuGeometry;
  draw: Draw;
  call: { firstIndex?: number; indices?: number; firstVertex?: number; vertices?: number };
}

function clampAspect(aspect: number) {
  return Math.min(Math.max(aspect || 0.6, 0.35), 1.25);
}

function buildGlyphList(charset: string) {
  const seen = new Set<string>([" "]);
  const glyphs = [" "];
  for (const ch of charset) {
    if (glyphs.length >= MAX_GLYPHS) break;
    if (ch === "\n" || ch === "\r" || ch === "\t" || seen.has(ch)) continue;
    seen.add(ch);
    glyphs.push(ch);
  }
  return glyphs;
}

function glyphShapes(image: ImageData, cols: number, cellW: number, cellH: number, count: number) {
  const vectors = new Float32Array(count * 6);
  const radius = cellH * 0.26;
  const padW = cellW + ATLAS_PAD * 2;
  const padH = cellH + ATLAS_PAD * 2;
  for (let g = 0; g < count; g++) {
    const originX = (g % cols) * padW + ATLAS_PAD;
    const originY = Math.floor(g / cols) * padH + ATLAS_PAD;
    for (let c = 0; c < 6; c++) {
      const cx = INNER_CIRCLES[c][0] * cellW;
      const cy = INNER_CIRCLES[c][1] * cellH;
      let sum = 0;
      let total = 0;
      for (let y = Math.floor(cy - radius); y <= Math.ceil(cy + radius); y++) {
        for (let x = Math.floor(cx - radius); x <= Math.ceil(cx + radius); x++) {
          const dx = x + 0.5 - cx;
          const dy = y + 0.5 - cy;
          if (dx * dx + dy * dy > radius * radius) continue;
          total += 1;
          if (x < -ATLAS_PAD || y < -ATLAS_PAD || x >= cellW + ATLAS_PAD || y >= cellH + ATLAS_PAD) continue;
          sum += image.data[((originY + y) * image.width + originX + x) * 4 + 3];
        }
      }
      vectors[g * 6 + c] = total ? sum / (total * 255) : 0;
    }
  }
  for (let c = 0; c < 6; c++) {
    let peak = 0;
    for (let g = 0; g < count; g++) peak = Math.max(peak, vectors[g * 6 + c]);
    if (peak > 0) {
      for (let g = 0; g < count; g++) vectors[g * 6 + c] /= peak;
    }
  }
  return vectors;
}

function sniffKind(bytes: Uint8Array): AssetKind | null {
  if (bytes.length < 4) return null;
  const ascii = (start: number, text: string) => {
    for (let i = 0; i < text.length; i++) {
      if (bytes[start + i] !== text.charCodeAt(i)) return false;
    }
    return true;
  };
  if (ascii(0, "glTF")) return "glb";
  if (bytes[0] === 0x89 && ascii(1, "PNG")) return "bitmap";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "bitmap";
  if (ascii(0, "RIFF") && ascii(8, "WEBP")) return "bitmap";
  if (ascii(0, "GIF8")) return "bitmap";
  let head = "";
  try {
    head = new TextDecoder().decode(bytes.subarray(0, 2048)).replace(/^\uFEFF/, "").trimStart();
  } catch {
    return null;
  }
  if (head.startsWith("{")) return "gltf";
  if (head.startsWith("<")) return head.includes("<svg") ? "svg" : null;
  return null;
}

function makeCanvas(width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
}

function drawToCanvas(source: CanvasImageSource, width: number, height: number) {
  const canvas = makeCanvas(width, height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2d context unavailable");
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function decodeWithImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not decode the image"));
    };
    image.src = url;
  });
}

async function decodeWithBitmap(blob: Blob): Promise<HTMLCanvasElement | null> {
  if (typeof createImageBitmap !== "function") return null;
  try {
    const bitmap = await createImageBitmap(blob);
    const longest = Math.max(bitmap.width, bitmap.height, 1);
    const scale = Math.min(1, RASTER_SIZE / longest);
    const canvas = drawToCanvas(bitmap, bitmap.width * scale, bitmap.height * scale);
    bitmap.close();
    return canvas;
  } catch {
    return null;
  }
}

async function decodeImage(blob: Blob, kind: AssetKind): Promise<HTMLCanvasElement> {
  const vector = kind === "svg";
  if (!vector) {
    const decoded = await decodeWithBitmap(blob);
    if (decoded) return decoded;
  }
  const image = await decodeWithImage(blob);
  const width = image.naturalWidth || RASTER_SIZE;
  const height = image.naturalHeight || RASTER_SIZE;
  const longest = Math.max(width, height, 1);
  const scale = vector ? RASTER_SIZE / longest : Math.min(1, RASTER_SIZE / longest);
  return drawToCanvas(image, width * scale, height * scale);
}

function traceContours(inside: Uint8Array, width: number, height: number) {
  const segments: number[] = [];
  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width - 1; x++) {
      const base = y * width + x;
      const code = inside[base] | (inside[base + 1] << 1) | (inside[base + width + 1] << 2) | (inside[base + width] << 3);
      if (code === 0 || code === 15) continue;
      const top = x + 0.5;
      const right = y + 0.5;
      switch (code) {
        case 1:
        case 14:
          segments.push(x, right, top, y);
          break;
        case 2:
        case 13:
          segments.push(top, y, x + 1, right);
          break;
        case 3:
        case 12:
          segments.push(x, right, x + 1, right);
          break;
        case 4:
        case 11:
          segments.push(x + 1, right, top, y + 1);
          break;
        case 6:
        case 9:
          segments.push(top, y, top, y + 1);
          break;
        case 7:
        case 8:
          segments.push(x, right, top, y + 1);
          break;
        case 5:
          segments.push(x, right, top, y, x + 1, right, top, y + 1);
          break;
        default:
          segments.push(top, y, x + 1, right, x, right, top, y + 1);
          break;
      }
    }
  }
  const count = segments.length / 4;
  const stride = width * 2 + 1;
  const ends = new Map<number, number[]>();
  const keyAt = (index: number) => segments[index * 2 + 1] * 2 * stride + segments[index * 2] * 2;
  for (let i = 0; i < count; i++) {
    for (const end of [i * 2, i * 2 + 1]) {
      const key = keyAt(end);
      const bucket = ends.get(key);
      if (bucket) bucket.push(i);
      else ends.set(key, [i]);
    }
  }
  const used = new Uint8Array(count);
  const contours: number[][] = [];
  for (let start = 0; start < count; start++) {
    if (used[start]) continue;
    const points: number[] = [];
    let current = start;
    let x = segments[start * 4];
    let y = segments[start * 4 + 1];
    while (current >= 0 && !used[current]) {
      used[current] = 1;
      const head = current * 4;
      const forward = segments[head] === x && segments[head + 1] === y;
      x = forward ? segments[head + 2] : segments[head];
      y = forward ? segments[head + 3] : segments[head + 1];
      points.push(x, y);
      const bucket = ends.get(y * 2 * stride + x * 2);
      let next = -1;
      if (bucket) {
        for (const candidate of bucket) {
          if (!used[candidate]) {
            next = candidate;
            break;
          }
        }
      }
      current = next;
    }
    if (points.length >= 8) contours.push(points);
  }
  return contours;
}

function simplify(points: number[], tolerance: number) {
  const count = points.length / 2;
  if (count < 4) return points;
  const keep = new Uint8Array(count);
  keep[0] = 1;
  keep[count - 1] = 1;
  const stack = [0, count - 1];
  const toleranceSq = tolerance * tolerance;
  while (stack.length) {
    const last = stack.pop() as number;
    const first = stack.pop() as number;
    if (last - first < 2) continue;
    const ax = points[first * 2];
    const ay = points[first * 2 + 1];
    const dx = points[last * 2] - ax;
    const dy = points[last * 2 + 1] - ay;
    const lengthSq = dx * dx + dy * dy;
    let farthest = -1;
    let farthestSq = toleranceSq;
    for (let i = first + 1; i < last; i++) {
      const px = points[i * 2] - ax;
      const py = points[i * 2 + 1] - ay;
      const t = lengthSq > 0 ? (px * dx + py * dy) / lengthSq : 0;
      const clamped = t < 0 ? 0 : t > 1 ? 1 : t;
      const ox = px - dx * clamped;
      const oy = py - dy * clamped;
      const distanceSq = ox * ox + oy * oy;
      if (distanceSq > farthestSq) {
        farthest = i;
        farthestSq = distanceSq;
      }
    }
    if (farthest < 0) continue;
    keep[farthest] = 1;
    stack.push(first, farthest, farthest, last);
  }
  const result: number[] = [];
  for (let i = 0; i < count; i++) {
    if (keep[i]) result.push(points[i * 2], points[i * 2 + 1]);
  }
  return result;
}

function ringArea(points: number[]) {
  let area = 0;
  for (let i = 0, j = points.length - 2; i < points.length; j = i, i += 2) {
    area += (points[j] - points[i]) * (points[j + 1] + points[i + 1]);
  }
  return Math.abs(area) / 2;
}

function ringContains(points: number[], x: number, y: number) {
  let inside = false;
  for (let i = 0, j = points.length - 2; i < points.length; j = i, i += 2) {
    const yi = points[i + 1];
    const yj = points[j + 1];
    if (yi > y === yj > y) continue;
    const t = (y - yi) / (yj - yi);
    if (x < points[i] + t * (points[j] - points[i])) inside = !inside;
  }
  return inside;
}

function buildShapes(canvas: HTMLCanvasElement, aspectW: number, aspectH: number) {
  const rectangle = () =>
    new THREE.Shape([
      new THREE.Vector2(0, 0),
      new THREE.Vector2(aspectW, 0),
      new THREE.Vector2(aspectW, aspectH),
      new THREE.Vector2(0, aspectH),
    ]);
  const scale = Math.min(1, TRACE_SIZE / Math.max(canvas.width, canvas.height, 1));
  const trace = scale < 1 ? drawToCanvas(canvas, canvas.width * scale, canvas.height * scale) : canvas;
  const ctx = trace.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [rectangle()];
  const traceW = trace.width;
  const traceH = trace.height;
  const data = ctx.getImageData(0, 0, traceW, traceH).data;
  const width = traceW + 2;
  const height = traceH + 2;
  const inside = new Uint8Array(width * height);
  let covered = 0;
  for (let y = 0; y < traceH; y++) {
    for (let x = 0; x < traceW; x++) {
      const on = data[(y * traceW + x) * 4 + 3] >= ALPHA_CUTOFF ? 1 : 0;
      inside[(y + 1) * width + x + 1] = on;
      covered += on;
    }
  }
  if (covered >= traceW * traceH * 0.995) return [rectangle()];
  const rings = traceContours(inside, width, height)
    .map((points) => simplify(points, SIMPLIFY_TOLERANCE))
    .filter((points) => points.length >= 6 && ringArea(points) >= MIN_AREA)
    .map((points) => ({ points, area: ringArea(points), depth: 0 }))
    .sort((a, b) => b.area - a.area)
    .slice(0, MAX_CONTOURS);
  if (!rings.length) return [rectangle()];
  for (const ring of rings) {
    for (const other of rings) {
      if (other !== ring && other.area > ring.area && ringContains(other.points, ring.points[0], ring.points[1])) ring.depth += 1;
    }
  }
  const toPath = (points: number[]) => {
    const path: THREE.Vector2[] = [];
    for (let i = 0; i < points.length; i += 2) {
      path.push(new THREE.Vector2(((points[i] - 0.5) / traceW) * aspectW, (1 - (points[i + 1] - 0.5) / traceH) * aspectH));
    }
    return path;
  };
  const shapes = new Map<(typeof rings)[number], THREE.Shape>();
  for (const ring of rings) {
    if (ring.depth % 2 === 0) shapes.set(ring, new THREE.Shape(toPath(ring.points)));
  }
  for (const ring of rings) {
    if (ring.depth % 2 === 0) continue;
    let parent: (typeof rings)[number] | null = null;
    for (const other of rings) {
      if (other.depth !== ring.depth - 1) continue;
      if (!ringContains(other.points, ring.points[0], ring.points[1])) continue;
      if (!parent || other.area < parent.area) parent = other;
    }
    const shape = parent ? shapes.get(parent) : undefined;
    if (shape) shape.holes.push(new THREE.Path(toPath(ring.points)));
  }
  const result = [...shapes.values()];
  return result.length ? result : [rectangle()];
}

function createImageObject(canvas: HTMLCanvasElement, anisotropy: number): THREE.Mesh {
  const longest = Math.max(canvas.width, canvas.height, 1);
  const aspectW = canvas.width / longest;
  const aspectH = canvas.height / longest;
  const meshGeometry = new THREE.ExtrudeGeometry(buildShapes(canvas, aspectW, aspectH), {
    depth: EXTRUDE_DEPTH,
    bevelEnabled: true,
    bevelThickness: BEVEL_SIZE,
    bevelSize: BEVEL_SIZE,
    bevelOffset: 0,
    bevelSegments: 2,
    steps: 1,
    curveSegments: 1,
  });
  const position = meshGeometry.getAttribute("position");
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) {
    uv[i * 2] = position.getX(i) / aspectW;
    uv[i * 2 + 1] = position.getY(i) / aspectH;
  }
  meshGeometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.6, metalness: 0 });
  return new THREE.Mesh(meshGeometry, material);
}

function disposeObject(root: THREE.Object3D) {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!material) continue;
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) value.dispose();
      }
      material.dispose();
    }
  });
}

function matrixElements(matrix: THREE.Matrix4) {
  return matrix.elements;
}

function getTextureImage(texture: THREE.Texture | null | undefined): TextureImage | null {
  const image = texture?.image as TextureImage | undefined;
  if (!image) return null;
  const width = "naturalWidth" in image ? image.naturalWidth : image.width;
  const height = "naturalHeight" in image ? image.naturalHeight : image.height;
  if (!width || !height) return null;
  return image;
}

function imageSize(image: TextureImage): [number, number] {
  const width = "naturalWidth" in image ? image.naturalWidth : image.width;
  const height = "naturalHeight" in image ? image.naturalHeight : image.height;
  return [Math.max(1, Math.round(width)), Math.max(1, Math.round(height))];
}

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

export function createAsciiObject(elements: AsciiObjectElements, options: AsciiObjectOptions = {}): AsciiObjectInstance | null {
  if (!supportsWebGPU()) return null;
  const { canvas } = elements;
  const config: Required<AsciiObjectOptions> = { ...DEFAULTS, ...resolveOptions(DEFAULTS, options) };

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(config.fov, 1, 0.1, 200);
  camera.position.copy(CAMERA_DIR).multiplyScalar(config.cameraDistance);

  const floatGroup = new THREE.Group();
  floatGroup.position.y = MODEL_LIFT;
  const fitGroup = new THREE.Group();
  floatGroup.add(fitGroup);
  scene.add(floatGroup);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.enablePan = false;

  let gpu: Gpu | null = null;
  let screen: Surface | null = null;
  let sceneTarget: Target | null = null;
  let cellTarget: Target | null = null;
  let cellFx: Effect | null = null;
  let postFx: Effect | null = null;
  let fallback2d: CanvasRenderingContext2D | null = null;
  let linearSampler: GPUSampler | null = null;
  let whiteTexture: Texture | null = null;
  let envAtlas: Target | null = null;
  let envSampler: GPUSampler | null = null;
  let envSh: [number, number, number, number][] = [];
  let atlasTexture: Texture | null = null;
  let shapeTexture: Texture | null = null;

  let model: THREE.Object3D | null = null;
  let modelMaxDim = 1;
  let loadedSrc: string | null = null;
  let loadToken = 0;
  let disposed = false;
  let renderItems: RenderItem[] = [];
  let gpuModelDirty = true;
  let materialTextures = new WeakMap<THREE.Texture, Texture>();
  const ownedTextures = new Set<Texture>();

  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath(config.dracoDecoderPath);
  loader.setDRACOLoader(draco);

  function destroyTexture(texture: Texture | null) {
    texture?.destroy();
    if (texture) ownedTextures.delete(texture);
  }

  function createWhiteTexture() {
    if (!gpu || whiteTexture) return;
    whiteTexture = gpu.device.createTexture({
      size: [1, 1],
      format: "rgba8unorm",
      usage: ["texture_binding", "copy_dst", "render_attachment"],
      label: "ascii-object.white",
    });
    gpu.gpu.queue.writeTexture({ texture: whiteTexture.gpu }, new Uint8Array([255, 255, 255, 255]), {}, [1, 1]);
  }

  function textureFor(map: THREE.Texture | null | undefined): Texture {
    createWhiteTexture();
    if (!gpu || !map) return whiteTexture!;
    const cached = materialTextures.get(map);
    if (cached) return cached;
    const image = getTextureImage(map);
    if (!image) return whiteTexture!;
    try {
      const [width, height] = imageSize(image);
      const texture = gpu.device.createTexture({
        size: [width, height],
        format: "rgba8unorm",
        usage: ["texture_binding", "copy_dst", "render_attachment"],
        label: "ascii-object.map",
      });
      gpu.gpu.queue.copyExternalImageToTexture({ source: image, flipY: map.flipY }, { texture: texture.gpu }, [width, height]);
      materialTextures.set(map, texture);
      ownedTextures.add(texture);
      return texture;
    } catch {
      return whiteTexture!;
    }
  }

  function destroyRenderItems() {
    const geometries = new Set<VgpuGeometry>();
    for (const item of renderItems) geometries.add(item.geometry);
    for (const geom of geometries) geom.destroy();
    renderItems = [];
    for (const texture of [...ownedTextures]) {
      if (texture !== whiteTexture && texture !== atlasTexture && texture !== shapeTexture) destroyTexture(texture);
    }
    materialTextures = new WeakMap<THREE.Texture, Texture>();
  }

  function buildRenderGeometry(mesh: THREE.Mesh): VgpuGeometry | null {
    if (!gpu) return null;
    const source = mesh.geometry as THREE.BufferGeometry;
    const position = source.getAttribute("position");
    if (!position) return null;
    const normal = source.getAttribute("normal");
    const uv = source.getAttribute("uv");
    const color = source.getAttribute("color");
    const count = position.count;
    const data = new Float32Array(count * VERTEX_STRIDE);
    for (let i = 0; i < count; i++) {
      const o = i * VERTEX_STRIDE;
      data[o] = position.getX(i);
      data[o + 1] = position.getY(i);
      data[o + 2] = position.getZ(i);
      data[o + 3] = normal?.getX(i) ?? 0;
      data[o + 4] = normal?.getY(i) ?? 0;
      data[o + 5] = normal?.getZ(i) ?? 1;
      data[o + 6] = uv?.getX(i) ?? 0;
      data[o + 7] = uv?.getY(i) ?? 0;
      data[o + 8] = color?.getX(i) ?? 1;
      data[o + 9] = color?.getY(i) ?? 1;
      data[o + 10] = color?.getZ(i) ?? 1;
      data[o + 11] = color && color.itemSize >= 4 ? color.getW(i) : 1;
    }
    const index = source.getIndex();
    const indices = index
      ? (() => {
          const out = position.count > 65535 ? new Uint32Array(index.count) : new Uint16Array(index.count);
          for (let i = 0; i < index.count; i++) out[i] = index.getX(i);
          return out;
        })()
      : undefined;
    return geometry(gpu, {
      label: "ascii-object.mesh",
      topology: "triangle-list",
      vertexCount: count,
      indices,
      buffers: [
        {
          data,
          stride: VERTEX_STRIDE * 4,
          attributes: {
            position: { format: "float32x3", location: 0, offset: 0 },
            normal: { format: "float32x3", location: 1, offset: 12 },
            uv: { format: "float32x2", location: 2, offset: 24 },
            color: { format: "float32x4", location: 3, offset: 32 },
          },
        },
      ],
    });
  }

  function rebuildGpuModel() {
    if (!gpu || !model || !gpuModelDirty) return;
    gpuModelDirty = false;
    destroyRenderItems();
    model.updateMatrixWorld(true);
    model.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh) return;
      const geom = buildRenderGeometry(mesh);
      if (!geom) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const groups = mesh.geometry.groups.length
        ? mesh.geometry.groups
        : [{ start: 0, count: mesh.geometry.getIndex()?.count ?? mesh.geometry.getAttribute("position")?.count ?? 0, materialIndex: 0 }];
      for (const group of groups) {
        const material = materials[group.materialIndex ?? 0] ?? materials[0];
        if (!material) continue;
        const map = (material as THREE.MeshStandardMaterial).map ?? null;
        const passDraw = draw(gpu!, {
          label: "ascii-object.forward",
          shader: FORWARD_SHADER,
          geometry: geom,
          blend: "alpha",
          depth: { write: true, compare: "less-equal" },
          set: { uMapSampler: linearSampler!, uMap: textureFor(map), uEnv: envAtlas!, uEnvSampler: envSampler! },
        });
        const indexed = Boolean(mesh.geometry.getIndex());
        renderItems.push({
          object: mesh,
          material,
          geometry: geom,
          draw: passDraw,
          call: indexed ? { firstIndex: group.start, indices: group.count } : { firstVertex: group.start, vertices: group.count },
        });
      }
    });
  }

  function applyRoughness() {
    if (!model) return;
    model.traverse((node) => {
      const mesh = node as THREE.Mesh;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const material of materials) {
        const standard = material as THREE.MeshStandardMaterial;
        if (!standard || typeof standard.roughness !== "number") continue;
        if (standard.userData.baseRoughness === undefined) standard.userData.baseRoughness = standard.roughness;
        standard.roughness = config.roughness >= 0 ? config.roughness : standard.userData.baseRoughness;
      }
    });
  }

  function applyFit() {
    if (!model) return;
    fitGroup.scale.setScalar(config.scale / modelMaxDim);
  }

  function clearModel() {
    if (!model) return;
    fitGroup.remove(model);
    disposeObject(model);
    model = null;
    modelMaxDim = 1;
    gpuModelDirty = true;
    destroyRenderItems();
  }

  function adoptModel(object: THREE.Object3D) {
    clearModel();
    model = object;
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    const offset = bounds.getCenter(new THREE.Vector3());
    modelMaxDim = Math.max(size.x, size.y, size.z, 1e-4);
    model.position.sub(offset);
    applyRoughness();
    applyFit();
    fitGroup.add(model);
    gpuModelDirty = true;
  }

  async function loadAsset() {
    const src = config.src;
    if (src === loadedSrc) return;
    loadedSrc = src;
    const token = ++loadToken;
    if (!src) {
      clearModel();
      return;
    }
    try {
      const response = await fetch(src);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const buffer = await response.arrayBuffer();
      if (disposed || token !== loadToken) return;
      const bytes = new Uint8Array(buffer);
      const kind = sniffKind(bytes);
      if (!kind) throw new Error("Unrecognized asset format");
      if (kind === "glb" || kind === "gltf") {
        draco.setDecoderPath(config.dracoDecoderPath);
        const resourcePath = src.slice(0, src.lastIndexOf("/") + 1);
        const data = kind === "glb" ? buffer : new TextDecoder().decode(bytes);
        const gltf = await loader.parseAsync(data, resourcePath);
        if (disposed || token !== loadToken) {
          disposeObject(gltf.scene);
          return;
        }
        adoptModel(gltf.scene);
      } else {
        const blob = new Blob([buffer], { type: kind === "svg" ? "image/svg+xml" : "" });
        const source = await decodeImage(blob, kind);
        if (disposed || token !== loadToken) return;
        adoptModel(createImageObject(source, 1));
      }
      config.onLoad?.();
      startLoop();
    } catch (error) {
      if (disposed || token !== loadToken) return;
      config.onError?.(error);
    }
  }

  let atlasCanvas: HTMLCanvasElement | null = null;
  let shapeVectors: Float32Array | null = null;
  let builtCharset: string | null = null;
  let builtAspect = 0;
  let glyphCount = 1;
  let atlasGrid: [number, number] = [1, 1];
  let atlasPad: [number, number] = [0, 0];
  let atlasInner: [number, number] = [1, 1];

  function uploadAtlas() {
    if (!gpu || !atlasCanvas || !shapeVectors) return;
    destroyTexture(atlasTexture);
    destroyTexture(shapeTexture);
    atlasTexture = gpu.device.createTexture({
      size: [atlasCanvas.width, atlasCanvas.height],
      format: "rgba8unorm",
      usage: ["texture_binding", "copy_dst", "render_attachment"],
      label: "ascii-object.atlas",
    });
    gpu.gpu.queue.copyExternalImageToTexture({ source: atlasCanvas }, { texture: atlasTexture.gpu }, [atlasCanvas.width, atlasCanvas.height]);
    shapeTexture = gpu.device.createTexture({
      size: [6, glyphCount],
      format: "r32float",
      usage: ["texture_binding", "copy_dst"],
      label: "ascii-object.shapes",
    });
    const floatsPerRow = 64;
    const padded = new Float32Array(floatsPerRow * glyphCount);
    for (let g = 0; g < glyphCount; g++) {
      for (let c = 0; c < 6; c++) padded[g * floatsPerRow + c] = shapeVectors[g * 6 + c];
    }
    gpu.gpu.queue.writeTexture(
      { texture: shapeTexture.gpu },
      padded,
      { bytesPerRow: floatsPerRow * 4, rowsPerImage: glyphCount },
      [6, glyphCount],
    );
    cellFx?.set({ tShapes: shapeTexture });
    postFx?.set({ tAtlas: atlasTexture });
  }

  function rebuildAtlas() {
    const aspect = clampAspect(config.cellAspect);
    if (builtCharset === config.charset && builtAspect === aspect) return;
    const glyphs = buildGlyphList(config.charset);
    const cellH = ATLAS_CELL;
    const cellW = Math.max(Math.round(cellH * aspect), 8);
    const padW = cellW + ATLAS_PAD * 2;
    const padH = cellH + ATLAS_PAD * 2;
    const cols = Math.ceil(Math.sqrt(glyphs.length));
    const rows = Math.ceil(glyphs.length / cols);
    const surfaceCanvas = makeCanvas(cols * padW, rows * padH);
    const ctx = surfaceCanvas.getContext("2d");
    if (!ctx) return;
    builtCharset = config.charset;
    builtAspect = aspect;
    ctx.clearRect(0, 0, surfaceCanvas.width, surfaceCanvas.height);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const fontPx = Math.floor(Math.min(cellH * 0.92, cellW / 0.58));
    ctx.font = `600 ${fontPx}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    for (let g = 0; g < glyphs.length; g++) {
      ctx.fillText(glyphs[g], (g % cols) * padW + padW / 2, Math.floor(g / cols) * padH + padH / 2);
    }
    const image = ctx.getImageData(0, 0, surfaceCanvas.width, surfaceCanvas.height);
    atlasCanvas = surfaceCanvas;
    shapeVectors = glyphShapes(image, cols, cellW, cellH, glyphs.length);
    glyphCount = glyphs.length;
    atlasGrid = [cols, rows];
    atlasPad = [ATLAS_PAD / padW, ATLAS_PAD / padH];
    atlasInner = [cellW / padW, cellH / padH];
    uploadAtlas();
  }

  let dpr = 1;
  let resolution: [number, number] = [1, 1];
  let cellPx: [number, number] = [6, 10];
  let gridSize: [number, number] = [1, 1];

  function syncCellGrid() {
    const cellH = Math.max(config.cellSize, 3) * dpr;
    const cellW = cellH * clampAspect(config.cellAspect);
    cellPx = [cellW, cellH];
    const cols = Math.max(Math.ceil(resolution[0] / cellW), 1);
    const rows = Math.max(Math.ceil(resolution[1] / cellH), 1);
    gridSize = [cols, rows];
    if (cellTarget) {
      const [w, h] = cellTarget.size;
      if (w !== cols || h !== rows) cellTarget.resize([cols, rows]);
    }
  }

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reducedMotion = motionQuery.matches;

  function applyOptions() {
    controls.enableRotate = config.orbit;
    controls.enableZoom = config.zoom;
    controls.autoRotate = config.autoRotate && !reducedMotion;
    controls.autoRotateSpeed = config.autoRotateSpeed;
    camera.fov = fitFov(config.fov, camera.aspect);
    camera.updateProjectionMatrix();
    floatGroup.position.x = config.xOffset;
    floatGroup.position.y = MODEL_LIFT + config.yOffset;
    rebuildAtlas();
    syncCellGrid();
    applyRoughness();
    applyFit();
  }

  function resize() {
    const width = Math.max(canvas.clientWidth, 1);
    const height = Math.max(canvas.clientHeight, 1);
    dpr = getCanvasPixelRatio(canvas);
    const deviceW = Math.max(1, Math.round(width * dpr));
    const deviceH = Math.max(1, Math.round(height * dpr));
    resolution = [deviceW, deviceH];
    if (screen) {
      const [w, h] = screen.size;
      if (w !== deviceW || h !== deviceH) screen.resize([deviceW, deviceH]);
    } else if (canvas.width !== deviceW || canvas.height !== deviceH) {
      canvas.width = deviceW;
      canvas.height = deviceH;
    }
    if (sceneTarget) {
      const [w, h] = sceneTarget.size;
      if (w !== deviceW || h !== deviceH) sceneTarget.resize([deviceW, deviceH]);
    }
    camera.aspect = width / height;
    camera.fov = fitFov(config.fov, camera.aspect);
    camera.updateProjectionMatrix();
    syncCellGrid();
  }

  const observer = createCanvasResizeObserver(() => {
    resize();
    startLoop();
  });
  observer.observe(canvas);
  resize();
  applyOptions();
  loadAsset();

  const highlightColor = new THREE.Color();
  const baseColor = new THREE.Color();
  const emissive = new THREE.Color();
  const background = new THREE.Color();
  const postColor = new THREE.Color();
  const modelViewProjection = new THREE.Matrix4();
  const normalMatrix4 = new THREE.Matrix4();

  function buildEnvironment() {
    if (!gpu || envAtlas) return;
    const baked = bakeStudioRadiance();
    envSh = baked.sh;
    const hi = gpu.device.createTexture({
      size: [ENV_WIDTH, ENV_HEIGHT],
      format: "rgba16float",
      usage: ["texture_binding", "copy_dst"],
      label: "ascii-object.env-hi",
    });
    const lo = gpu.device.createTexture({
      size: [ENV_WIDTH / 2, ENV_HEIGHT / 2],
      format: "rgba16float",
      usage: ["texture_binding", "copy_dst"],
      label: "ascii-object.env-lo",
    });
    gpu.gpu.queue.writeTexture({ texture: hi.gpu }, toHalfArray(baked.hi), { bytesPerRow: ENV_WIDTH * 8 }, [ENV_WIDTH, ENV_HEIGHT]);
    gpu.gpu.queue.writeTexture({ texture: lo.gpu }, toHalfArray(baked.lo), { bytesPerRow: (ENV_WIDTH / 2) * 8 }, [ENV_WIDTH / 2, ENV_HEIGHT / 2]);
    envAtlas = target(gpu, { size: [ENV_WIDTH, ENV_HEIGHT * ENV_LEVELS], format: "rgba16float", label: "ascii-object.env" });
    envSampler = sampler(gpu, { minFilter: "linear", magFilter: "linear", addressModeU: "repeat", addressModeV: "clamp-to-edge" });
    const prefilter = gpuEffect(gpu, PREFILTER_SHADER, {
      label: "ascii-object.prefilter",
      set: { params: { hiSize: [ENV_WIDTH, ENV_HEIGHT] }, uHi: hi, uLo: lo },
    });
    prefilter.draw(envAtlas);
    hi.destroy();
    lo.destroy();
  }

  function materialUniforms(material: THREE.Material) {
    const standard = material as THREE.MeshStandardMaterial;
    baseColor.copy(standard.color ?? new THREE.Color(1, 1, 1));
    emissive.copy(standard.emissive ?? new THREE.Color(0, 0, 0));
    const roughness = typeof standard.roughness === "number" ? standard.roughness : 0.6;
    const metalness = typeof standard.metalness === "number" ? standard.metalness : 0;
    const opacity = typeof material.opacity === "number" ? material.opacity : 1;
    const alphaTest = typeof material.alphaTest === "number" ? material.alphaTest : 0;
    return { roughness, metalness, opacity, alphaTest };
  }

  function renderFallback() {
    if (!fallback2d) return;
    fallback2d.clearRect(0, 0, canvas.width, canvas.height);
    if (config.background) {
      fallback2d.fillStyle = config.background;
      fallback2d.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  function render() {
    if (fallback2d) {
      renderFallback();
      return;
    }
    if (!gpu || !screen || !sceneTarget || !cellTarget || !cellFx || !postFx) return;
    rebuildGpuModel();
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    highlightColor.set(config.highlight).multiplyScalar(15);
    cellFx.set({
      params: {
        resolution,
        cellPx,
        glyphCount,
        contrast: Math.max(config.contrast, 0.05),
        edgeContrast: Math.max(config.edgeContrast, 0.05),
        exposure: Math.max(config.exposure, 0),
        invert: config.invert ? 1 : 0,
      },
    });
    postColor.setStyle(config.color || "#ffffff", THREE.NoColorSpace);
    const hasBg = config.background ? 1 : 0;
    if (config.background) background.setStyle(config.background, THREE.NoColorSpace);
    postFx.set({
      params: {
        resolution,
        cellPx,
        grid: gridSize,
        atlasGrid,
        atlasPad,
        atlasInner,
        ascii: config.ascii ? 1 : 0,
        colored: config.colored ? 1 : 0,
        color: [postColor.r, postColor.g, postColor.b],
        background: [background.r, background.g, background.b],
        hasBg,
      },
    });

    gpuFrame(gpu, (f) => {
      f.pass({ target: sceneTarget!, clear: [0, 0, 0, 0] }, (pass) => {
        for (const item of renderItems) {
          item.object.updateWorldMatrix(true, false);
          modelViewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse).multiply(item.object.matrixWorld);
          normalMatrix4.identity().setFromMatrix3(new THREE.Matrix3().getNormalMatrix(item.object.matrixWorld));
          const mat = materialUniforms(item.material);
          item.draw.set({
            params: {
              sh: envSh,
              highlight: [highlightColor.r, highlightColor.g, highlightColor.b],
              mvp: matrixElements(modelViewProjection),
              model: matrixElements(item.object.matrixWorld),
              normalMatrix: matrixElements(normalMatrix4),
              cameraPos: [camera.position.x, camera.position.y, camera.position.z],
              baseColor: [baseColor.r, baseColor.g, baseColor.b, 1],
              emissive: [emissive.r, emissive.g, emissive.b],
              roughness: mat.roughness,
              metalness: mat.metalness,
              envIntensity: Math.max(config.environmentIntensity, 0),
              useMap: (item.material as THREE.MeshStandardMaterial).map ? 1 : 0,
              opacity: mat.opacity,
              alphaTest: mat.alphaTest,
            },
          });
          pass.draw(item.draw, item.call);
        }
      });
      if (config.ascii) f.pass({ target: cellTarget!, clear: [0, 0, 0, 0] }, cellFx!);
      f.pass({ target: screen!, clear: [0, 0, 0, 0] }, postFx!);
    });
  }

  function onMotionChange() {
    reducedMotion = motionQuery.matches;
    if (reducedMotion) floatGroup.rotation.set(0, 0, 0);
    applyOptions();
    startLoop();
  }
  motionQuery.addEventListener("change", onMotionChange);

  let inView = true;
  let pageVisible = typeof document === "undefined" || !document.hidden;
  let loopRunning = false;
  let raf = 0;
  let lastTime = 0;
  let elapsed = Math.random() * 100;

  function isVisible() {
    return inView && pageVisible;
  }

  function tick(time: number) {
    if (!isVisible()) {
      lastTime = 0;
      stopLoop();
      return;
    }
    const delta = lastTime ? Math.min((time - lastTime) / 1000, 0.1) : 0;
    lastTime = time;
    controls.update();
    if (!reducedMotion) {
      elapsed += delta * config.floatSpeed;
      floatGroup.rotation.x = (Math.cos(elapsed / 4) / 8) * config.rotationIntensity;
      floatGroup.rotation.y = (Math.sin(elapsed / 4) / 8) * config.rotationIntensity;
      floatGroup.rotation.z = (Math.sin(elapsed / 4) / 20) * config.rotationIntensity;
      floatGroup.position.y = MODEL_LIFT + config.yOffset + (Math.sin(elapsed / 1.5) / 10) * config.floatIntensity;
    }
    render();
    raf = requestAnimationFrame(tick);
  }

  function startLoop() {
    if (loopRunning || !isVisible() || disposed) return;
    loopRunning = true;
    raf = requestAnimationFrame(tick);
  }

  function stopLoop() {
    if (!loopRunning) return;
    loopRunning = false;
    cancelAnimationFrame(raf);
  }

  const viewObserver =
    typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver((entries) => {
          inView = entries[entries.length - 1]?.isIntersecting ?? true;
          if (isVisible()) startLoop();
          else stopLoop();
        })
      : null;
  viewObserver?.observe(canvas);

  function onVisibilityChange() {
    pageVisible = !document.hidden;
    if (isVisible()) startLoop();
    else stopLoop();
  }
  document.addEventListener("visibilitychange", onVisibilityChange);

  acquireGpu()
    .then((device) => {
      if (disposed) return;
      gpu = device;
      screen = surface(gpu, canvas, { autoResize: false, alphaMode: "premultiplied", label: "ascii-object" });
      sceneTarget = target(gpu, { size: resolution, format: "rgba16float", depth: true, msaa: 4, label: "ascii-object.scene" });
      cellTarget = target(gpu, { size: gridSize, format: "rgba8unorm", label: "ascii-object.cells" });
      linearSampler = sampler(gpu, { minFilter: "linear", magFilter: "linear", addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge" });
      createWhiteTexture();
      buildEnvironment();
      rebuildAtlas();
      if (!atlasTexture || !shapeTexture) uploadAtlas();
      cellFx = gpuEffect(gpu, CELL_SHADER, {
        label: "ascii-object.cells",
        set: { tScene: sceneTarget, sceneSampler: linearSampler, tShapes: shapeTexture! },
      });
      postFx = gpuEffect(gpu, POST_SHADER, {
        label: "ascii-object.post",
        set: { tScene: sceneTarget, sceneSampler: linearSampler, tCells: cellTarget, tAtlas: atlasTexture!, atlasSampler: linearSampler },
      });
      resize();
      gpuModelDirty = true;
      rebuildGpuModel();
      startLoop();
    })
    .catch((error) => {
      if (disposed) return;
      console.warn("AsciiObject: WebGPU unavailable; showing the configured background only.", error);
      fallback2d = canvas.getContext("2d");
      startLoop();
    });

  startLoop();

  return {
    setOptions(next: AsciiObjectOptions) {
      next = resolveOptions(DEFAULTS, next);
      let changed = false;
      for (const [key, value] of Object.entries(next)) {
        if (typeof value === "function") continue;
        if (config[key as keyof AsciiObjectOptions] !== value) {
          changed = true;
          break;
        }
      }
      if (!changed) {
        Object.assign(config, next);
        return;
      }
      const previousDistance = config.cameraDistance;
      Object.assign(config, next);
      if (config.cameraDistance !== previousDistance) camera.position.copy(CAMERA_DIR).multiplyScalar(config.cameraDistance);
      applyOptions();
      resize();
      loadAsset();
      startLoop();
    },
    resize() {
      resize();
      startLoop();
    },
    destroy() {
      disposed = true;
      loadToken += 1;
      stopLoop();
      observer.disconnect();
      viewObserver?.disconnect();
      motionQuery.removeEventListener("change", onMotionChange);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      controls.dispose();
      clearModel();
      draco.dispose();
      destroyRenderItems();
      destroyTexture(whiteTexture);
      destroyTexture(atlasTexture);
      destroyTexture(shapeTexture);
      (sceneTarget as unknown as { destroy?: () => void } | null)?.destroy?.();
      (cellTarget as unknown as { destroy?: () => void } | null)?.destroy?.();
      (envAtlas as unknown as { destroy?: () => void } | null)?.destroy?.();
      screen?.dispose();
    },
  };
}
