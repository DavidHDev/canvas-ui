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
  type Geometry,
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

export type DitherMethod = "bayer" | "halftone" | "floyd";

export interface DitheredObjectOptions {
  /** URL of the asset to display: GLB/glTF, SVG, PNG, JPEG, WebP, or GIF. Object URLs from a file input work too. The format is sniffed from the bytes, not the extension. */
  src?: string;
  /** Dither pattern: an ordered Bayer grid, clustered halftone dots, or Floyd-Steinberg error diffusion. */
  method?: DitherMethod;
  /** Size of the dither cells in CSS pixels. */
  gridSize?: number;
  /** Extra pixelation applied on top of the grid size (1 to 10). */
  pixelSizeRatio?: number;
  /** Collapse the scene to grayscale before dithering. */
  grayscale?: boolean;
  /** Invert the final colors. */
  invert?: boolean;
  /** Enable the dither pass. Turn off to see the raw render. */
  dither?: boolean;
  /** Background color behind the object. Empty string keeps the canvas transparent. */
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

export interface DitheredObjectElements {
  canvas: HTMLCanvasElement;
}

export interface DitheredObjectInstance {
  setOptions: (options: DitheredObjectOptions) => void;
  resize: () => void;
  destroy: () => void;
}

const DEFAULTS: Required<DitheredObjectOptions> = {
  src: "",
  method: "bayer",
  gridSize: 4,
  pixelSizeRatio: 1,
  grayscale: true,
  invert: false,
  dither: true,
  background: "",
  highlight: "#066aff",
  environmentIntensity: 0.1,
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

struct SceneParams {
  sh: array<vec4f, 9>,
  viewProj: mat4x4f,
  cameraPos: vec3f,
  envIntensity: f32,
  highlight: vec3f,
  pad: f32,
}

struct ModelParams {
  model: mat4x4f,
  normalMatrix: mat3x3f,
  baseColor: vec4f,
  emissiveRoughness: vec4f,
  metalOpacityMapUnlit: vec4f,
}

struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) worldPos: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
}

@group(0) @binding(0) var<uniform> scene: SceneParams;
@group(0) @binding(1) var<uniform> modelParams: ModelParams;
@group(0) @binding(2) var baseMap: texture_2d<f32>;
@group(0) @binding(3) var mapSampler: sampler;
@group(0) @binding(4) var uEnv: texture_2d<f32>;
@group(0) @binding(5) var uEnvSampler: sampler;

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
  return s.rgb + scene.highlight * s.a;
}

fn shIrradiance(n: vec3f) -> vec3f {
  let c = scene.sh;
  var e = c[0] * 0.282095;
  e += c[1] * (0.488603 * n.y);
  e += c[2] * (0.488603 * n.z);
  e += c[3] * (0.488603 * n.x);
  e += c[4] * (1.092548 * n.x * n.y);
  e += c[5] * (1.092548 * n.y * n.z);
  e += c[6] * (0.315392 * (3.0 * n.z * n.z - 1.0));
  e += c[7] * (1.092548 * n.x * n.z);
  e += c[8] * (0.546274 * (n.x * n.x - n.y * n.y));
  return max(e.rgb + scene.highlight * e.a, vec3f(0.0));
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
) -> VSOut {
  let world = modelParams.model * vec4f(position, 1.0);
  var clip = scene.viewProj * world;
  clip.z = clip.z * 0.5 + clip.w * 0.5;
  var out: VSOut;
  out.pos = clip;
  out.worldPos = world.xyz;
  out.normal = normalize(modelParams.normalMatrix * normal);
  out.uv = uv;
  return out;
}

@fragment fn fs_main(in: VSOut, @builtin(front_facing) front: bool) -> @location(0) vec4f {
  let sampled = textureSampleLevel(baseMap, mapSampler, in.uv, 0.0);
  let useMap = modelParams.metalOpacityMapUnlit.z;
  let unlit = modelParams.metalOpacityMapUnlit.w;
  var albedo = modelParams.baseColor.rgb * mix(vec3f(1.0), srgbToLinear(sampled.rgb), useMap);
  let alpha = modelParams.baseColor.a * mix(1.0, sampled.a, useMap);
  if (alpha < 0.01) { discard; }
  if (unlit > 0.5) {
    return vec4f(albedo * alpha, alpha);
  }

  var n = normalize(in.normal);
  if (!front) { n = -n; }
  let v = normalize(scene.cameraPos - in.worldPos);
  let ndv = max(dot(n, v), 0.0001);
  let rough = clamp(modelParams.emissiveRoughness.w, 0.0, 1.0);
  let metal = clamp(modelParams.metalOpacityMapUnlit.x, 0.0, 1.0);

  let diffuseColor = albedo * (1.0 - metal);
  let specularColor = mix(vec3f(0.04), albedo, vec3f(metal));
  let irradiance = shIrradiance(n) * scene.envIntensity;
  let radiance = envRadiance(reflect(-v, n), rough) * scene.envIntensity;

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
  color += modelParams.emissiveRoughness.rgb;
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

const POST_SHADER = `
struct Params {
  resolution: vec2f,
  gridSize: f32,
  pixelSizeRatio: f32,
  grayscale: f32,
  invert: f32,
  dither: f32,
  method: u32,
  pad: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var tDiffuse: texture_2d<f32>;
@group(0) @binding(2) var tMask: texture_2d<f32>;
@group(0) @binding(3) var uSampler: sampler;

const THRESHOLDS = array<f32, 16>(
  0.94118, 0.29412, 0.76471, 0.05882,
  0.47059, 0.70588, 0.23529, 0.52941,
  0.82353, 0.11765, 0.88235, 0.17647,
  0.35294, 0.58824, 0.41176, 0.64706
);
const SCREEN_ANGLE = 0.70710678;
const CORNER_REACH = 1.41421356;

fn toSrgb(c: vec3f) -> vec3f {
  let clamped = clamp(c, vec3f(0.0), vec3f(1.0));
  return select(clamped * 12.92, 1.055 * pow(clamped, vec3f(1.0 / 2.4)) - vec3f(0.055), clamped >= vec3f(0.0031308));
}

fn mod2(x: vec2f, y: f32) -> vec2f {
  return x - vec2f(y) * floor(x / vec2f(y));
}

fn bayerThreshold(cellCoord: vec2f) -> f32 {
  let p = vec2u(mod2(cellCoord, 4.0));
  return THRESHOLDS[p.x * 4u + p.y];
}

fn halftoneThreshold(cellCoord: vec2f) -> f32 {
  let screen = vec2f(
    cellCoord.x * SCREEN_ANGLE - cellCoord.y * SCREEN_ANGLE,
    cellCoord.x * SCREEN_ANGLE + cellCoord.y * SCREEN_ANGLE
  );
  return clamp(length(fract(screen) - vec2f(0.5)) * CORNER_REACH, 0.0, 1.0);
}

fn thresholdAt(cellCoord: vec2f) -> f32 {
  if (params.method == 1u) { return halftoneThreshold(cellCoord); }
  return bayerThreshold(cellCoord);
}

fn maskAt(cellCoord: vec2f) -> bool {
  let last = vec2i(textureDimensions(tMask)) - vec2i(1);
  let cell = clamp(vec2i(floor(cellCoord)), vec2i(0), last);
  return textureLoad(tMask, cell, 0).r > 0.5;
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let fragCoord = uv * params.resolution;
  if (params.dither < 0.5) {
    let raw = textureSampleLevel(tDiffuse, uSampler, uv, 0.0);
    return vec4f(toSrgb(raw.rgb) * raw.a, raw.a);
  }
  let pixelSize = params.gridSize * params.pixelSizeRatio;
  let pixelUv = (floor(fragCoord / vec2f(pixelSize)) + vec2f(0.5)) * pixelSize / params.resolution;
  let tex = textureSampleLevel(tDiffuse, uSampler, pixelUv, 0.0);
  var color = toSrgb(tex.rgb);
  let level = dot(color, vec3f(1.0));
  if (params.grayscale > 0.5) { color = vec3f(level); }
  let cellCoord = fragCoord / vec2f(params.gridSize);
  let lit = select(level >= thresholdAt(cellCoord), maskAt(cellCoord), params.method == 2u);
  if (!lit) { color = vec3f(0.0); }
  if (params.invert > 0.5) { color = vec3f(1.0) - color; }
  return vec4f(color * tex.a, tex.a);
}`;

const LEVEL_SHADER = `
struct Params {
  resolution: vec2f,
  gridSize: f32,
  pixelSizeRatio: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var tDiffuse: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

fn toSrgb(c: vec3f) -> vec3f {
  let clamped = clamp(c, vec3f(0.0), vec3f(1.0));
  return select(clamped * 12.92, 1.055 * pow(clamped, vec3f(1.0 / 2.4)) - vec3f(0.055), clamped >= vec3f(0.0031308));
}

@fragment fn fs_main(@builtin(position) pos: vec4f) -> @location(0) vec4f {
  let fragCoord = (floor(pos.xy) + vec2f(0.5)) * params.gridSize;
  let pixelSize = params.gridSize * params.pixelSizeRatio;
  let pixelUv = (floor(fragCoord / vec2f(pixelSize)) + vec2f(0.5)) * pixelSize / params.resolution;
  let tex = textureSampleLevel(tDiffuse, uSampler, pixelUv, 0.0);
  return vec4f(toSrgb(tex.rgb), tex.a);
}`;

interface FormerDef {
  kind: "ring" | "box";
  intensity: number;
  position: [number, number, number];
  scale: [number, number, number];
  lookAtCenter?: boolean;
  withLight?: boolean;
}

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
const METHOD_INDEX: Record<DitherMethod, number> = { bayer: 0, halftone: 1, floyd: 2 };

type AssetKind = "glb" | "gltf" | "svg" | "bitmap";
type ImageLike = HTMLCanvasElement | HTMLImageElement | ImageBitmap | OffscreenCanvas;

interface MaterialInfo {
  baseColor: [number, number, number, number];
  emissive: [number, number, number];
  roughness: number;
  metalness: number;
  opacity: number;
  hasMap: number;
  unlit: number;
}

interface RenderMesh {
  mesh: THREE.Mesh;
  geometry: Geometry;
  draw: Draw;
  texture: Texture;
  ownsTexture: boolean;
  material: MaterialInfo;
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
  const rectangle = () => new THREE.Shape([
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

function createImageObject(canvas: HTMLCanvasElement): THREE.Mesh {
  const longest = Math.max(canvas.width, canvas.height, 1);
  const aspectW = canvas.width / longest;
  const aspectH = canvas.height / longest;
  const shapeGeometry = new THREE.ExtrudeGeometry(buildShapes(canvas, aspectW, aspectH), {
    depth: EXTRUDE_DEPTH,
    bevelEnabled: true,
    bevelThickness: BEVEL_SIZE,
    bevelSize: BEVEL_SIZE,
    bevelOffset: 0,
    bevelSegments: 2,
    steps: 1,
    curveSegments: 1,
  });
  const position = shapeGeometry.getAttribute("position");
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) {
    uv[i * 2] = position.getX(i) / aspectW;
    uv[i * 2 + 1] = position.getY(i) / aspectH;
  }
  shapeGeometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.6, metalness: 0 });
  return new THREE.Mesh(shapeGeometry, material);
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

function diffuse(pixels: Uint8Array, mask: Uint8Array, rows: [Float32Array, Float32Array], width: number, height: number) {
  let current = rows[0];
  let next = rows[1];
  current.fill(0);
  for (let y = 0; y < height; y++) {
    next.fill(0);
    const row = y * width;
    for (let x = 0; x < width; x++) {
      const i = (row + x) * 4;
      const tone = Math.min((pixels[i] + pixels[i + 1] + pixels[i + 2]) / 255, 1) + current[x + 1];
      const lit = tone >= 0.5;
      mask[row + x] = lit ? 255 : 0;
      const error = lit ? tone - 1 : tone;
      current[x + 2] += error * 0.4375;
      next[x] += error * 0.1875;
      next[x + 1] += error * 0.3125;
      next[x + 2] += error * 0.0625;
    }
    const spent = current;
    current = next;
    next = spent;
  }
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

function imageSize(image: ImageLike): [number, number] {
  if (image instanceof HTMLImageElement) return [image.naturalWidth || image.width, image.naturalHeight || image.height];
  return [image.width, image.height];
}

function createTextureFromImage(gpu: Gpu, image: ImageLike, flipY: boolean, label: string): Texture {
  const [width, height] = imageSize(image);
  const texture = gpu.device.createTexture({
    size: [Math.max(1, width), Math.max(1, height)],
    format: "rgba8unorm",
    usage: ["texture_binding", "copy_dst", "render_attachment"],
    label,
  });
  gpu.gpu.queue.copyExternalImageToTexture(
    { source: image, flipY },
    { texture: texture.gpu },
    [texture.size[0], texture.size[1]],
  );
  return texture;
}

function createSolidTexture(gpu: Gpu, rgba: [number, number, number, number], label: string): Texture {
  const texture = gpu.device.createTexture({
    size: [1, 1],
    format: "rgba8unorm",
    usage: ["texture_binding", "copy_dst", "render_attachment"],
    label,
  });
  gpu.gpu.queue.writeTexture({ texture: texture.gpu }, new Uint8Array(rgba), { bytesPerRow: 4 }, [1, 1]);
  return texture;
}

function attributeArray(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined, itemSize: number, fallback: number[]) {
  if (!attribute) return null;
  const out = new Float32Array(attribute.count * itemSize);
  for (let i = 0; i < attribute.count; i++) {
    for (let j = 0; j < itemSize; j++) out[i * itemSize + j] = attribute.getComponent(i, j) ?? fallback[j] ?? 0;
  }
  return out;
}

function materialInfo(material: THREE.Material | undefined, config: Required<DitheredObjectOptions>): MaterialInfo {
  const anyMat = material as Partial<THREE.MeshStandardMaterial> & Partial<THREE.MeshBasicMaterial>;
  const color = anyMat.color instanceof THREE.Color ? anyMat.color : new THREE.Color(1, 1, 1);
  const emissive = anyMat.emissive instanceof THREE.Color ? anyMat.emissive : new THREE.Color(0, 0, 0);
  const emissiveIntensity = typeof anyMat.emissiveIntensity === "number" ? anyMat.emissiveIntensity : 1;
  const baseRoughness = typeof anyMat.roughness === "number" ? anyMat.roughness : 0.6;
  return {
    baseColor: [color.r, color.g, color.b, typeof anyMat.opacity === "number" ? anyMat.opacity : 1],
    emissive: [emissive.r * emissiveIntensity, emissive.g * emissiveIntensity, emissive.b * emissiveIntensity],
    roughness: config.roughness >= 0 ? config.roughness : baseRoughness,
    metalness: typeof anyMat.metalness === "number" ? anyMat.metalness : 0,
    opacity: typeof anyMat.opacity === "number" ? anyMat.opacity : 1,
    hasMap: anyMat.map instanceof THREE.Texture ? 1 : 0,
    unlit: material instanceof THREE.MeshBasicMaterial ? 1 : 0,
  };
}

export function createDitheredObject(
  elements: DitheredObjectElements,
  options: DitheredObjectOptions = {},
): DitheredObjectInstance | null {
  if (!supportsWebGPU()) return null;
  const { canvas } = elements;
  const config: Required<DitheredObjectOptions> = { ...DEFAULTS, ...resolveOptions(DEFAULTS, options) };

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

  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath(config.dracoDecoderPath);
  loader.setDRACOLoader(draco);

  let gpu: Gpu | null = null;
  let screen: Surface | null = null;
  let sceneTarget: Target | null = null;
  let levelTarget: Target | null = null;
  let postFx: Effect | null = null;
  let levelFx: Effect | null = null;
  let linearSampler: GPUSampler | null = null;
  let whiteTexture: Texture | null = null;
  let maskTexture: Texture | null = null;
  let envAtlas: Target | null = null;
  let envSampler: GPUSampler | null = null;
  let envSh: [number, number, number, number][] = [];
  let fallback2d: CanvasRenderingContext2D | null = null;
  let renderMeshes: RenderMesh[] = [];

  let model: THREE.Object3D | null = null;
  let modelMaxDim = 1;
  let loadedSrc: string | null = null;
  let loadToken = 0;
  let disposed = false;
  let fullWidth = 1;
  let fullHeight = 1;
  let dpr = 1;
  let lastTime = 0;
  let elapsed = Math.random() * 100;
  let raf = 0;
  let loopRunning = false;
  let inView = true;
  let pageVisible = typeof document === "undefined" || document.visibilityState !== "hidden";

  const diffusion = {
    targetWidth: 0,
    targetHeight: 0,
    pixels: new Uint8Array(0),
    mask: new Uint8Array(0),
    rows: [new Float32Array(0), new Float32Array(0)] as [Float32Array, Float32Array],
    generation: 0,
    pending: false,
    ready: false,
  };

  function ensureWhiteTexture() {
    if (!whiteTexture) whiteTexture = createSolidTexture(gpu!, [255, 255, 255, 255], "dithered-object.white");
    return whiteTexture;
  }

  function ensureMaskTexture(width = 1, height = 1) {
    if (!maskTexture || maskTexture.size[0] !== width || maskTexture.size[1] !== height) {
      maskTexture?.destroy();
      maskTexture = gpu!.device.createTexture({
        size: [width, height],
        format: "r8unorm",
        usage: ["texture_binding", "copy_dst"],
        label: "dithered-object.mask",
      });
    }
    return maskTexture;
  }

  function clearRenderMeshes() {
    const geometries = new Set<Geometry>();
    for (const item of renderMeshes) {
      geometries.add(item.geometry);
      if (item.ownsTexture) item.texture.destroy();
    }
    for (const item of geometries) item.destroy();
    renderMeshes = [];
  }

  function uploadMaterialTexture(material: THREE.Material | undefined): { texture: Texture; owns: boolean } {
    const map = (material as Partial<THREE.MeshStandardMaterial> | undefined)?.map;
    const image = map instanceof THREE.Texture ? (map.source?.data ?? map.image) as ImageLike | undefined : undefined;
    if (!image) return { texture: ensureWhiteTexture(), owns: false };
    try {
      return { texture: createTextureFromImage(gpu!, image, Boolean(map?.flipY), "dithered-object.map"), owns: true };
    } catch {
      return { texture: ensureWhiteTexture(), owns: false };
    }
  }

  function buildGeometry(mesh: THREE.Mesh) {
    const source = mesh.geometry.clone();
    if (!source.getAttribute("normal")) source.computeVertexNormals();
    const position = attributeArray(source.getAttribute("position"), 3, [0, 0, 0]);
    if (!position) {
      source.dispose();
      return null;
    }
    const normal = attributeArray(source.getAttribute("normal"), 3, [0, 1, 0]) ?? new Float32Array((position.length / 3) * 3);
    const uv = attributeArray(source.getAttribute("uv"), 2, [0, 0]) ?? new Float32Array((position.length / 3) * 2);
    const vertices = new Float32Array((position.length / 3) * 8);
    for (let i = 0; i < position.length / 3; i++) {
      vertices[i * 8] = position[i * 3];
      vertices[i * 8 + 1] = position[i * 3 + 1];
      vertices[i * 8 + 2] = position[i * 3 + 2];
      vertices[i * 8 + 3] = normal[i * 3];
      vertices[i * 8 + 4] = normal[i * 3 + 1];
      vertices[i * 8 + 5] = normal[i * 3 + 2];
      vertices[i * 8 + 6] = uv[i * 2];
      vertices[i * 8 + 7] = uv[i * 2 + 1];
    }
    const index = source.index?.array;
    const indices = index instanceof Uint32Array ? index : index ? new Uint16Array(Array.from(index)) : undefined;
    const result = geometry(gpu!, {
      buffers: [{ data: vertices, stride: 32, attributes: { position: "float32x3", normal: "float32x3", uv: "float32x2" } }],
      indices,
      topology: "triangle-list",
      label: "dithered-object.geometry",
    });
    source.dispose();
    return result;
  }

  function rebuildRenderMeshes() {
    if (!gpu || !linearSampler || !envAtlas || !envSampler) return;
    clearRenderMeshes();
    if (!model) return;
    model.updateMatrixWorld(true);
    model.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      const gpuGeometry = buildGeometry(mesh);
      if (!gpuGeometry) return;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const groups = mesh.geometry.groups.length
        ? mesh.geometry.groups
        : [{ start: 0, count: gpuGeometry.indexCount ?? gpuGeometry.vertexCount ?? 0, materialIndex: 0 }];
      for (const group of groups) {
        const material = mats[group.materialIndex ?? 0] ?? mats[0];
        const tex = uploadMaterialTexture(material);
        const side = material?.side ?? THREE.FrontSide;
        const slice = gpuGeometry.slice(
          gpuGeometry.indexCount !== undefined
            ? { firstIndex: group.start, indexCount: group.count }
            : { firstVertex: group.start, vertexCount: group.count },
        );
        renderMeshes.push({
          mesh,
          geometry: gpuGeometry,
          texture: tex.texture,
          ownsTexture: tex.owns,
          material: materialInfo(material, config),
          draw: draw(gpu!, {
            shader: FORWARD_SHADER,
            geometry: slice,
            cull: side === THREE.DoubleSide ? "none" : side === THREE.BackSide ? "front" : "back",
            depth: { write: true, compare: "less-equal" },
            label: "dithered-object.forward",
            blend: "alpha",
            set: { baseMap: tex.texture, mapSampler: linearSampler, uEnv: envAtlas, uEnvSampler: envSampler },
          }),
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
    for (const item of renderMeshes) item.material = materialInfo(Array.isArray(item.mesh.material) ? item.mesh.material[0] : item.mesh.material, config);
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
    clearRenderMeshes();
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
    rebuildRenderMeshes();
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
        adoptModel(createImageObject(source));
      }
      config.onLoad?.();
      startLoop();
    } catch (error) {
      if (disposed || token !== loadToken) return;
      config.onError?.(error);
    }
  }

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reducedMotion = motionQuery.matches;

  function methodIndex() {
    const index = METHOD_INDEX[config.method] ?? 0;
    return index === 2 && !diffusion.ready ? 0 : index;
  }

  function resizeDiffusion(width: number, height: number) {
    if (diffusion.targetWidth === width && diffusion.targetHeight === height) return;
    diffusion.targetWidth = width;
    diffusion.targetHeight = height;
    diffusion.generation += 1;
    diffusion.ready = false;
    diffusion.pending = false;
    diffusion.pixels = new Uint8Array(width * height * 4);
    diffusion.mask = new Uint8Array(width * height);
    diffusion.rows = [new Float32Array(width + 2), new Float32Array(width + 2)];
    if (gpu && postFx) {
      ensureMaskTexture(width, height);
      postFx.set({ tMask: maskTexture! });
    }
  }

  function updateDiffusion(generation: number) {
    if (!levelTarget || !maskTexture || diffusion.pending) return;
    diffusion.pending = true;
    levelTarget.read().then((pixels) => {
      diffusion.pending = false;
      if (disposed || generation !== diffusion.generation) return;
      diffuse(pixels, diffusion.mask, diffusion.rows, diffusion.targetWidth, diffusion.targetHeight);
      gpu?.gpu.queue.writeTexture(
        { texture: maskTexture!.gpu },
        diffusion.mask,
        { bytesPerRow: diffusion.targetWidth },
        [diffusion.targetWidth, diffusion.targetHeight],
      );
      diffusion.ready = true;
    }).catch(() => {
      diffusion.pending = false;
    });
  }

  function applyOptions() {
    controls.enableRotate = config.orbit;
    controls.enableZoom = config.zoom;
    controls.autoRotate = config.autoRotate && !reducedMotion;
    controls.autoRotateSpeed = config.autoRotateSpeed;
    camera.fov = fitFov(config.fov, camera.aspect);
    camera.updateProjectionMatrix();
    floatGroup.position.x = config.xOffset;
    floatGroup.position.y = MODEL_LIFT + config.yOffset;
    applyRoughness();
    applyFit();
  }

  function resize() {
    const width = Math.max(canvas.clientWidth, 1);
    const height = Math.max(canvas.clientHeight, 1);
    dpr = getCanvasPixelRatio(canvas);
    fullWidth = Math.max(Math.round(width * dpr), 1);
    fullHeight = Math.max(Math.round(height * dpr), 1);
    if (screen) {
      if (screen.size[0] !== fullWidth || screen.size[1] !== fullHeight) screen.resize([fullWidth, fullHeight]);
    } else {
      canvas.width = fullWidth;
      canvas.height = fullHeight;
    }
    const pixelSize = config.dither ? Math.max(config.gridSize, 1) * Math.max(config.pixelSizeRatio, 1) * dpr : 1;
    const targetScale = Math.min(1, 2 / pixelSize);
    const targetSize: [number, number] = [Math.max(Math.round(fullWidth * targetScale), 1), Math.max(Math.round(fullHeight * targetScale), 1)];
    if (sceneTarget && (sceneTarget.size[0] !== targetSize[0] || sceneTarget.size[1] !== targetSize[1])) sceneTarget.resize(targetSize);
    const grid = Math.max(config.gridSize, 1) * dpr;
    const diffusionSize: [number, number] = [Math.max(Math.ceil(fullWidth / grid), 1), Math.max(Math.ceil(fullHeight / grid), 1)];
    resizeDiffusion(diffusionSize[0], diffusionSize[1]);
    if (levelTarget && (levelTarget.size[0] !== diffusionSize[0] || levelTarget.size[1] !== diffusionSize[1])) levelTarget.resize(diffusionSize);
    camera.aspect = width / height;
    camera.fov = fitFov(config.fov, camera.aspect);
    camera.updateProjectionMatrix();
  }

  function colorTuple(color: string, fallback: string): [number, number, number, number] {
    const c = new THREE.Color(color || fallback);
    return [c.r, c.g, c.b, color ? 1 : 0];
  }

  const viewProj = new THREE.Matrix4();
  const normalMatrix = new THREE.Matrix3();
  const highlightColor = new THREE.Color();

  function buildEnvironment() {
    if (!gpu || envAtlas) return;
    const baked = bakeStudioRadiance();
    envSh = baked.sh;
    const hi = gpu.device.createTexture({
      size: [ENV_WIDTH, ENV_HEIGHT],
      format: "rgba16float",
      usage: ["texture_binding", "copy_dst"],
      label: "dithered-object.env-hi",
    });
    const lo = gpu.device.createTexture({
      size: [ENV_WIDTH / 2, ENV_HEIGHT / 2],
      format: "rgba16float",
      usage: ["texture_binding", "copy_dst"],
      label: "dithered-object.env-lo",
    });
    gpu.gpu.queue.writeTexture({ texture: hi.gpu }, toHalfArray(baked.hi), { bytesPerRow: ENV_WIDTH * 8 }, [ENV_WIDTH, ENV_HEIGHT]);
    gpu.gpu.queue.writeTexture({ texture: lo.gpu }, toHalfArray(baked.lo), { bytesPerRow: (ENV_WIDTH / 2) * 8 }, [ENV_WIDTH / 2, ENV_HEIGHT / 2]);
    envAtlas = target(gpu, { size: [ENV_WIDTH, ENV_HEIGHT * ENV_LEVELS], format: "rgba16float", label: "dithered-object.env" });
    envSampler = sampler(gpu, { minFilter: "linear", magFilter: "linear", addressModeU: "repeat", addressModeV: "clamp-to-edge" });
    const prefilter = gpuEffect(gpu, PREFILTER_SHADER, {
      label: "dithered-object.prefilter",
      set: { params: { hiSize: [ENV_WIDTH, ENV_HEIGHT] }, uHi: hi, uLo: lo },
    });
    prefilter.draw(envAtlas);
    hi.destroy();
    lo.destroy();
  }

  function renderFallback() {
    if (!fallback2d) return;
    fallback2d.clearRect(0, 0, canvas.width, canvas.height);
    if (config.background) {
      fallback2d.fillStyle = config.background;
      fallback2d.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  function render(time: number) {
    if (!gpu || !screen || !sceneTarget || !postFx || !levelFx || !levelTarget) return;
    camera.updateMatrixWorld();
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    scene.updateMatrixWorld(true);
    const bg = colorTuple(config.background, "#000000");
    highlightColor.set(config.highlight || "#066aff").multiplyScalar(15);
    const sceneParams = {
      sh: envSh,
      viewProj: viewProj.elements,
      cameraPos: [camera.position.x, camera.position.y, camera.position.z],
      envIntensity: Math.max(config.environmentIntensity, 0),
      highlight: [highlightColor.r, highlightColor.g, highlightColor.b],
    };
    for (const item of renderMeshes) {
      normalMatrix.getNormalMatrix(item.mesh.matrixWorld);
      item.draw.set({
        scene: sceneParams,
        modelParams: {
          model: item.mesh.matrixWorld.elements,
          normalMatrix: normalMatrix.elements,
          baseColor: item.material.baseColor,
          emissiveRoughness: [...item.material.emissive, item.material.roughness],
          metalOpacityMapUnlit: [item.material.metalness, item.material.opacity, item.material.hasMap, item.material.unlit],
        },
      });
    }
    const gridSize = Math.max(config.gridSize, 1) * dpr;
    const postParams = {
      resolution: [fullWidth, fullHeight],
      gridSize,
      pixelSizeRatio: Math.max(config.pixelSizeRatio, 1),
      grayscale: config.grayscale ? 1 : 0,
      invert: config.invert ? 1 : 0,
      dither: config.dither ? 1 : 0,
      method: methodIndex(),
    };
    postFx.set({ params: postParams });
    levelFx.set({ params: { resolution: [fullWidth, fullHeight], gridSize, pixelSizeRatio: Math.max(config.pixelSizeRatio, 1) } });
    gpuFrame(gpu, (f) => {
      f.pass({ target: sceneTarget!, clear: bg, clearDepth: 1 }, (pass) => {
        for (const item of renderMeshes) pass.draw(item.draw);
      });
      if (config.dither && config.method === "floyd") f.pass({ target: levelTarget!, clear: [0, 0, 0, 0] }, levelFx!);
      f.pass({ target: screen!, clear: [0, 0, 0, 0] }, postFx!);
    });
    if (config.dither && config.method === "floyd") updateDiffusion(diffusion.generation);
    void time;
  }

  function tick(time: number) {
    if (!inView || !pageVisible || disposed) {
      lastTime = 0;
      stopLoop();
      return;
    }
    if (fallback2d) {
      renderFallback();
      raf = requestAnimationFrame(tick);
      return;
    }
    if (!gpu) {
      raf = requestAnimationFrame(tick);
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
    render(time);
    raf = requestAnimationFrame(tick);
  }

  function startLoop() {
    if (loopRunning || !inView || !pageVisible || disposed) return;
    loopRunning = true;
    raf = requestAnimationFrame(tick);
  }

  function stopLoop() {
    if (!loopRunning) return;
    loopRunning = false;
    cancelAnimationFrame(raf);
  }

  const onMotionChange = () => {
    reducedMotion = motionQuery.matches;
    if (reducedMotion) floatGroup.rotation.set(0, 0, 0);
    applyOptions();
  };
  motionQuery.addEventListener("change", onMotionChange);

  const observer = createCanvasResizeObserver(() => {
    resize();
    startLoop();
  });
  observer.observe(canvas);

  const viewObserver = typeof IntersectionObserver !== "undefined"
    ? new IntersectionObserver((entries) => {
        inView = entries[entries.length - 1]?.isIntersecting ?? true;
        if (inView) startLoop();
        else stopLoop();
      })
    : null;
  viewObserver?.observe(canvas);

  const onVisibilityChange = () => {
    pageVisible = document.visibilityState !== "hidden";
    if (pageVisible) {
      lastTime = 0;
      startLoop();
    } else {
      stopLoop();
    }
  };
  document.addEventListener("visibilitychange", onVisibilityChange);

  resize();
  applyOptions();
  loadAsset();

  acquireGpu().then((device) => {
    if (disposed) return;
    gpu = device;
    screen = surface(gpu, canvas, { autoResize: false, alphaMode: "premultiplied", label: "dithered-object" });
    linearSampler = sampler(gpu, { minFilter: "linear", magFilter: "linear", addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge" });
    buildEnvironment();
    sceneTarget = target(gpu, { size: [1, 1], format: "rgba16float", depth: true, msaa: 4, label: "dithered-object.scene" });
    levelTarget = target(gpu, { size: [1, 1], format: "rgba8unorm", label: "dithered-object.level" });
    ensureMaskTexture(diffusion.targetWidth || 1, diffusion.targetHeight || 1);
    postFx = gpuEffect(gpu, POST_SHADER, { label: "dithered-object.post", set: { uSampler: linearSampler, tDiffuse: sceneTarget, tMask: maskTexture! } });
    levelFx = gpuEffect(gpu, LEVEL_SHADER, { label: "dithered-object.level", set: { uSampler: linearSampler, tDiffuse: sceneTarget } });
    resize();
    rebuildRenderMeshes();
    startLoop();
  }).catch((error) => {
    if (disposed) return;
    console.warn("DitheredObject: WebGPU unavailable, showing fallback canvas.", error);
    fallback2d = canvas.getContext("2d");
    startLoop();
  });

  return {
    setOptions(next: DitheredObjectOptions) {
      next = resolveOptions(DEFAULTS, next);
      let changed = false;
      for (const [key, value] of Object.entries(next)) {
        if (typeof value === "function") continue;
        if (config[key as keyof DitheredObjectOptions] !== value) {
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
      rebuildRenderMeshes();
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
      document.removeEventListener("visibilitychange", onVisibilityChange);
      motionQuery.removeEventListener("change", onMotionChange);
      controls.dispose();
      clearModel();
      clearRenderMeshes();
      whiteTexture?.destroy();
      maskTexture?.destroy();
      (envAtlas as unknown as { destroy?: () => void } | null)?.destroy?.();
      (sceneTarget as unknown as { destroy?: () => void } | null)?.destroy?.();
      (levelTarget as unknown as { destroy?: () => void } | null)?.destroy?.();
      screen?.dispose();
      draco.dispose();
    },
  };
}
