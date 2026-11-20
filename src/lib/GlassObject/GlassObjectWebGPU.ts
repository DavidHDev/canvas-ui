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
  type Texture,
} from "vgpu";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import { resolveOptions } from "../options";

export interface GlassObjectOptions {
  /** URL of the asset to display: GLB/glTF, SVG, PNG, JPEG, WebP, or GIF. Object URLs from a file input work too. The format is sniffed from the bytes, not the extension. */
  src?: string;
  /** Index of refraction of the glass (1 to 2.33). */
  ior?: number;
  /** Thickness of the glass volume in scene units. Drives how strongly light bends. */
  thickness?: number;
  /** Surface roughness (0 to 1). Higher values frost the glass. */
  roughness?: number;
  /** Chromatic dispersion of the refraction (0 to 2). Splits light into rainbow fringes like real glass. */
  dispersion?: number;
  /** Clearcoat layer on top of the glass (0 to 1). */
  clearcoat?: number;
  /** Tint color of the glass volume as any CSS color. Empty string keeps the glass clear. */
  tint?: string;
  /** How strongly the tint absorbs light through the volume. */
  tintDensity?: number;
  /** Extrusion depth of 2D assets (SVG or image) as a fraction of their longest side. */
  depth?: number;
  /** Edge rounding of extruded 2D assets (0 to 1). Higher values melt the edges into a liquid lip. */
  bevel?: number;
  /** Accent color of the ring light in the studio environment. */
  highlight?: string;
  /** Brightness of the studio environment lighting. */
  environmentIntensity?: number;
  /** Background color behind the glass. Empty string keeps the canvas transparent. */
  background?: string;
  /** URL of an image shown as a backdrop behind the glass, cover-fit to the view. The glass samples and refracts it. Empty string disables the backdrop. */
  backgroundImage?: string;
  /** Size of the longest side of the asset in scene units. The camera sits about 4 units away. */
  scale?: number;
  /** Horizontal offset of the asset in scene units. */
  xOffset?: number;
  /** Vertical offset of the asset in scene units. */
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
  /** Spin the camera around the asset turntable-style. */
  autoRotate?: boolean;
  /** Turntable speed when autoRotate is on. */
  autoRotateSpeed?: number;
  /** Camera field of view in degrees. */
  fov?: number;
  /** Camera distance from the center of the asset. */
  cameraDistance?: number;
  /** Base URL of the Draco decoder, fetched only when a model needs it. */
  dracoDecoderPath?: string;
  /** Called after an asset finishes loading. */
  onLoad?: (() => void) | null;
  /** Called when an asset fails to load. */
  onError?: ((error: unknown) => void) | null;
}

export interface GlassObjectElements {
  canvas: HTMLCanvasElement;
}

export interface GlassObjectInstance {
  setOptions: (options: GlassObjectOptions) => void;
  resize: () => void;
  destroy: () => void;
}

const DEFAULTS: Required<GlassObjectOptions> = {
  src: "",
  ior: 1.75,
  thickness: 4,
  roughness: 0.25,
  dispersion: 1.5,
  clearcoat: 0.5,
  tint: "",
  tintDensity: 2,
  depth: 0.1,
  bevel: 1,
  highlight: "#066aff",
  environmentIntensity: 1,
  background: "",
  backgroundImage: "",
  scale: 3,
  xOffset: 0,
  yOffset: 0,
  floatIntensity: 1,
  rotationIntensity: 1,
  floatSpeed: 2,
  orbit: true,
  zoom: false,
  autoRotate: false,
  autoRotateSpeed: 2,
  fov: 55,
  cameraDistance: 4,
  dracoDecoderPath: "https://www.gstatic.com/draco/versioned/decoders/1.5.7/",
  onLoad: null,
  onError: null,
};

const CAMERA_DIR = new THREE.Vector3(0, -1, 4).normalize();

function fitFov(fov: number, aspect: number): number {
  if (aspect >= 1) return fov;
  const half = THREE.MathUtils.degToRad(fov) / 2;
  const margin = 1 + 0.25 * (1 - aspect);
  return THREE.MathUtils.radToDeg(2 * Math.atan((Math.tan(half) * margin) / aspect));
}
const MODEL_LIFT = 0.3;
const RASTER_SIZE = 256;
const ALPHA_THRESHOLD = 64;
const ENV_WIDTH = 64;
const ENV_HEIGHT = 32;
const ENV_LEVELS = 6;

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
  const invOrigin = new THREE.Vector3();
  const invPoint = new THREE.Vector3();

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
    for (const roomSurface of surfaces) {
      localO.copy(origin).applyMatrix4(roomSurface.inverse);
      localD.copy(dir).transformDirection(roomSurface.inverse);
      invPoint.copy(origin).add(dir).applyMatrix4(roomSurface.inverse);
      invOrigin.copy(origin).applyMatrix4(roomSurface.inverse);
      localD.multiplyScalar(invPoint.sub(invOrigin).length());
      if (roomSurface.kind === "ring") {
        if (Math.abs(localD.z) < 1e-8) continue;
        const t = -localO.z / localD.z;
        if (t <= 1e-4 || t >= bestT) continue;
        const px = localO.x + localD.x * t;
        const py = localO.y + localD.y * t;
        const r = Math.hypot(px, py);
        if (r < 0.5 || r > 1) continue;
        bestT = t;
        best = roomSurface;
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
          if (Math.abs(o[axis]) > 0.5) {
            miss = true;
            break;
          }
          continue;
        }
        let t0 = (-0.5 - o[axis]) / d[axis];
        let t1 = (0.5 - o[axis]) / d[axis];
        if (t0 > t1) [t0, t1] = [t1, t0];
        if (t0 > tNear) {
          tNear = t0;
          nearAxis = axis;
        }
        if (t1 < tFar) {
          tFar = t1;
          farAxis = axis;
        }
        if (tNear > tFar) {
          miss = true;
          break;
        }
      }
      if (miss) continue;
      const t = roomSurface.backSide ? tFar : tNear;
      if (t <= 1e-4 || t >= bestT) continue;
      bestT = t;
      best = roomSurface;
      bestAxis = roomSurface.backSide ? farAxis : nearAxis;
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
          (hi[(2 * j * ENV_WIDTH + 2 * i) * 4 + c] +
            hi[(2 * j * ENV_WIDTH + 2 * i + 1) * 4 + c] +
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

function srgbByteToLinear(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function radianceFromPixels(pixels: Uint8ClampedArray, width: number, height: number): StudioRadiance {
  const hi = new Float32Array(width * height * 4);
  const sh: [number, number, number, number][] = Array.from({ length: 9 }, () => [0, 0, 0, 0]);
  const dPhi = (2 * Math.PI) / width;
  const dTheta = Math.PI / height;
  const band = [Math.PI, (2 * Math.PI) / 3, Math.PI / 4];
  for (let j = 0; j < height; j++) {
    const theta = ((j + 0.5) / height) * Math.PI;
    const st = Math.sin(theta);
    const ct = Math.cos(theta);
    const dOmega = dPhi * dTheta * st;
    for (let i = 0; i < width; i++) {
      const src = (j * width + i) * 4;
      const dst = src;
      hi[dst] = srgbByteToLinear(pixels[src]);
      hi[dst + 1] = srgbByteToLinear(pixels[src + 1]);
      hi[dst + 2] = srgbByteToLinear(pixels[src + 2]);
      hi[dst + 3] = 0;
      const phi = ((i + 0.5) / width) * 2 * Math.PI - Math.PI;
      const x = st * Math.sin(phi);
      const y = ct;
      const z = -st * Math.cos(phi);
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
        sh[k][0] += hi[dst] * w;
        sh[k][1] += hi[dst + 1] * w;
        sh[k][2] += hi[dst + 2] * w;
      }
    }
  }
  for (let k = 0; k < 9; k++) {
    const l = k === 0 ? 0 : k < 4 ? 1 : 2;
    const scale = band[l] / Math.PI;
    for (let c = 0; c < 4; c++) sh[k][c] *= scale;
  }
  const loW = width / 2;
  const loH = height / 2;
  const lo = new Float32Array(loW * loH * 4);
  for (let j = 0; j < loH; j++) {
    for (let i = 0; i < loW; i++) {
      const o = (j * loW + i) * 4;
      for (let c = 0; c < 4; c++) {
        lo[o + c] =
          (hi[(2 * j * width + 2 * i) * 4 + c] +
            hi[(2 * j * width + 2 * i + 1) * 4 + c] +
            hi[((2 * j + 1) * width + 2 * i) * 4 + c] +
            hi[((2 * j + 1) * width + 2 * i + 1) * 4 + c]) *
          0.25;
      }
    }
  }
  return { hi, lo, sh };
}

function bakeBackdropRadiance(source: CanvasImageSource): StudioRadiance | null {
  const soft = document.createElement("canvas");
  soft.width = ENV_WIDTH;
  soft.height = ENV_HEIGHT;
  const ctx = soft.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.filter = "blur(4px)";
  ctx.drawImage(source, -4, -4, soft.width + 8, soft.height + 8);
  return radianceFromPixels(ctx.getImageData(0, 0, soft.width, soft.height).data, ENV_WIDTH, ENV_HEIGHT);
}

function flattenCapNormals(geometry: THREE.BufferGeometry) {
  const position = geometry.getAttribute("position");
  const normal = geometry.getAttribute("normal");
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const cb = new THREE.Vector3();
  const ab = new THREE.Vector3();
  for (const group of geometry.groups) {
    if (group.materialIndex !== 0) continue;
    for (let i = group.start; i < group.start + group.count; i += 3) {
      a.fromBufferAttribute(position, i);
      b.fromBufferAttribute(position, i + 1);
      c.fromBufferAttribute(position, i + 2);
      cb.subVectors(c, b);
      ab.subVectors(a, b);
      cb.cross(ab).normalize();
      for (let j = 0; j < 3; j++) normal.setXYZ(i + j, cb.x, cb.y, cb.z);
    }
  }
  normal.needsUpdate = true;
}

function disposeObject(root: THREE.Object3D, keep?: THREE.Material) {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    for (const material of materials) {
      if (!material || material === keep) continue;
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) value.dispose();
      }
      material.dispose();
    }
  });
}

function sniffKind(
  bytes: Uint8Array,
): "glb" | "gltf" | "svg" | "bitmap" | null {
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
    head = new TextDecoder()
      .decode(bytes.subarray(0, 2048))
      .replace(/^\uFEFF/, "")
      .trimStart();
  } catch {
    return null;
  }
  if (head.startsWith("{")) return "gltf";
  if (head.startsWith("<")) {
    return head.includes("<svg") ? "svg" : null;
  }
  return null;
}

function rasterizeImage(blob: Blob): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      const width = image.naturalWidth || 1024;
      const height = image.naturalHeight || 1024;
      const ratio = Math.min(1, RASTER_SIZE / Math.max(width, height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("2d context unavailable"));
        return;
      }
      ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(ctx.getImageData(0, 0, canvas.width, canvas.height));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not decode the image"));
    };
    image.src = url;
  });
}

type Point = [number, number];

function traceContours(mask: Uint8Array, w: number, h: number): Point[][] {
  const at = (x: number, y: number) =>
    x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1 ? 1 : 0;

  const segments: [Point, Point][] = [];
  const T = (cx: number, cy: number): Point => [cx - 0.5, cy - 1];
  const B = (cx: number, cy: number): Point => [cx - 0.5, cy];
  const L = (cx: number, cy: number): Point => [cx - 1, cy - 0.5];
  const R = (cx: number, cy: number): Point => [cx, cy - 0.5];

  for (let cy = 0; cy <= h; cy++) {
    for (let cx = 0; cx <= w; cx++) {
      const code =
        at(cx - 1, cy - 1) * 8 +
        at(cx, cy - 1) * 4 +
        at(cx, cy) * 2 +
        at(cx - 1, cy);
      switch (code) {
        case 1:
          segments.push([L(cx, cy), B(cx, cy)]);
          break;
        case 2:
          segments.push([B(cx, cy), R(cx, cy)]);
          break;
        case 3:
          segments.push([L(cx, cy), R(cx, cy)]);
          break;
        case 4:
          segments.push([T(cx, cy), R(cx, cy)]);
          break;
        case 5:
          segments.push([L(cx, cy), T(cx, cy)]);
          segments.push([B(cx, cy), R(cx, cy)]);
          break;
        case 6:
          segments.push([T(cx, cy), B(cx, cy)]);
          break;
        case 7:
          segments.push([L(cx, cy), T(cx, cy)]);
          break;
        case 8:
          segments.push([L(cx, cy), T(cx, cy)]);
          break;
        case 9:
          segments.push([T(cx, cy), B(cx, cy)]);
          break;
        case 10:
          segments.push([T(cx, cy), R(cx, cy)]);
          segments.push([L(cx, cy), B(cx, cy)]);
          break;
        case 11:
          segments.push([T(cx, cy), R(cx, cy)]);
          break;
        case 12:
          segments.push([L(cx, cy), R(cx, cy)]);
          break;
        case 13:
          segments.push([B(cx, cy), R(cx, cy)]);
          break;
        case 14:
          segments.push([L(cx, cy), B(cx, cy)]);
          break;
      }
    }
  }

  const key = (p: Point) =>
    (Math.round(p[0] * 2) + 4) * 8192 + Math.round(p[1] * 2) + 4;
  const adjacency = new Map<number, number[]>();
  for (let i = 0; i < segments.length; i++) {
    for (const p of segments[i]) {
      const k = key(p);
      const list = adjacency.get(k);
      if (list) list.push(i);
      else adjacency.set(k, [i]);
    }
  }

  const used = new Uint8Array(segments.length);
  const loops: Point[][] = [];
  for (let start = 0; start < segments.length; start++) {
    if (used[start]) continue;
    used[start] = 1;
    const loop: Point[] = [segments[start][0]];
    let point = segments[start][1];
    const startKey = key(segments[start][0]);
    while (key(point) !== startKey) {
      loop.push(point);
      const candidates = adjacency.get(key(point)) ?? [];
      let next = -1;
      for (const c of candidates) {
        if (!used[c]) {
          next = c;
          break;
        }
      }
      if (next < 0) break;
      used[next] = 1;
      const [a, b] = segments[next];
      point = key(a) === key(point) ? b : a;
    }
    if (loop.length >= 4) loops.push(loop);
  }
  return loops;
}

function simplifyLoop(points: Point[], epsilon: number): Point[] {
  if (points.length < 6) return points;
  const keepFlags = new Uint8Array(points.length);
  keepFlags[0] = 1;
  keepFlags[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length) {
    const [lo, hi] = stack.pop()!;
    const [ax, ay] = points[lo];
    const [bx, by] = points[hi];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1e-9;
    let worst = -1;
    let worstDist = epsilon;
    for (let i = lo + 1; i < hi; i++) {
      const d =
        Math.abs((points[i][0] - ax) * dy - (points[i][1] - ay) * dx) / len;
      if (d > worstDist) {
        worstDist = d;
        worst = i;
      }
    }
    if (worst > 0) {
      keepFlags[worst] = 1;
      stack.push([lo, worst], [worst, hi]);
    }
  }
  const out: Point[] = [];
  for (let i = 0; i < points.length; i++) {
    if (keepFlags[i]) out.push(points[i]);
  }
  return out;
}

function chaikin(points: Point[], iterations: number): Point[] {
  let current = points;
  for (let it = 0; it < iterations; it++) {
    const next: Point[] = [];
    for (let i = 0; i < current.length; i++) {
      const [ax, ay] = current[i];
      const [bx, by] = current[(i + 1) % current.length];
      next.push(
        [ax * 0.75 + bx * 0.25, ay * 0.75 + by * 0.25],
        [ax * 0.25 + bx * 0.75, ay * 0.25 + by * 0.75],
      );
    }
    current = next;
  }
  return current;
}

function signedArea(points: Point[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const [ax, ay] = points[i];
    const [bx, by] = points[(i + 1) % points.length];
    area += ax * by - bx * ay;
  }
  return area / 2;
}

function roundLoopCorners(
  points: THREE.Vector2[],
  radius: number,
): THREE.Vector2[] {
  const n = points.length;
  if (n < 3) return points;
  const out: THREE.Vector2[] = [];
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n];
    const curr = points[i];
    const next = points[(i + 1) % n];
    const inDir = curr.clone().sub(prev);
    const outDir = next.clone().sub(curr);
    const lenIn = inDir.length();
    const lenOut = outDir.length();
    if (lenIn < 1e-9 || lenOut < 1e-9) continue;
    inDir.divideScalar(lenIn);
    outDir.divideScalar(lenOut);
    const angle = Math.acos(Math.min(Math.max(inDir.dot(outDir), -1), 1));
    if (angle < 0.1) {
      out.push(curr.clone());
      continue;
    }
    const trim = Math.min(radius, lenIn * 0.5, lenOut * 0.5);
    const p0 = curr.clone().addScaledVector(inDir, -trim);
    const p1 = curr.clone().addScaledVector(outDir, trim);
    const steps = Math.max(2, Math.ceil(angle / 0.3));
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const a = (1 - t) * (1 - t);
      const b = 2 * (1 - t) * t;
      const c = t * t;
      out.push(
        new THREE.Vector2(
          a * p0.x + b * curr.x + c * p1.x,
          a * p0.y + b * curr.y + c * p1.y,
        ),
      );
    }
  }
  return out.length >= 3 ? out : points;
}

function dedupeClosingPoint(points: THREE.Vector2[]): THREE.Vector2[] {
  if (
    points.length > 1 &&
    points[0].distanceToSquared(points[points.length - 1]) < 1e-12
  ) {
    return points.slice(0, -1);
  }
  return points;
}

function roundShapeCorners(
  shapes: THREE.Shape[],
  radius: number,
): THREE.Shape[] {
  if (radius < 1e-6) return shapes;
  return shapes.map((shape) => {
    const extracted = shape.extractPoints(24);
    const rounded = new THREE.Shape(
      roundLoopCorners(dedupeClosingPoint(extracted.shape), radius),
    );
    for (const hole of extracted.holes) {
      rounded.holes.push(
        new THREE.Path(roundLoopCorners(dedupeClosingPoint(hole), radius)),
      );
    }
    return rounded;
  });
}

function containsPoint(loop: Point[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = loop.length - 1; i < loop.length; j = i++) {
    const [xi, yi] = loop[i];
    const [xj, yj] = loop[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function shapesFromImage(data: ImageData): THREE.Shape[] {
  const { width, height } = data;
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    mask[i] = data.data[i * 4 + 3] >= ALPHA_THRESHOLD ? 1 : 0;
  }

  const rawLoops = traceContours(mask, width, height);
  let loops: Point[][] = [];
  for (const rawLoop of rawLoops) {
    const loop = chaikin(simplifyLoop(rawLoop, 1), 2);
    if (Math.abs(signedArea(loop)) > 12) {
      loops.push(loop);
    }
  }
  loops.sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)));
  loops = loops.slice(0, 48);
  if (loops.length === 0) throw new Error("No opaque pixels to trace");

  const depths = loops.map((loop, i) => {
    const [x, y] = loop[0];
    let depth = 0;
    for (let j = 0; j < loops.length; j++) {
      if (j !== i && containsPoint(loops[j], x, y)) depth++;
    }
    return depth;
  });

  const shapes: THREE.Shape[] = [];
  const owners: { loop: Point[]; area: number; shape: THREE.Shape }[] = [];
  for (let i = 0; i < loops.length; i++) {
    if (depths[i] % 2 !== 0) continue;
    const shape = new THREE.Shape(
      loops[i].map(([x, y]) => new THREE.Vector2(x, y)),
    );
    shapes.push(shape);
    owners.push({
      loop: loops[i],
      area: Math.abs(signedArea(loops[i])),
      shape,
    });
  }
  for (let i = 0; i < loops.length; i++) {
    if (depths[i] % 2 === 0) continue;
    const [x, y] = loops[i][0];
    let owner: (typeof owners)[number] | null = null;
    for (const candidate of owners) {
      if (!containsPoint(candidate.loop, x, y)) continue;
      if (!owner || candidate.area < owner.area) owner = candidate;
    }
    owner?.shape.holes.push(
      new THREE.Path(loops[i].map(([px, py]) => new THREE.Vector2(px, py))),
    );
  }
  return shapes;
}

function shapesFromSvg(text: string): THREE.Shape[] {
  const parsed = new SVGLoader().parse(text);
  const shapes: THREE.Shape[] = [];
  for (const path of parsed.paths) {
    const style = path.userData?.style as { fill?: string } | undefined;
    if (style?.fill === "none") continue;
    shapes.push(...SVGLoader.createShapes(path));
  }
  if (shapes.length === 0) {
    for (const path of parsed.paths) {
      shapes.push(...SVGLoader.createShapes(path));
    }
  }
  if (shapes.length === 0) throw new Error("No fillable shapes in the SVG");
  return shapes;
}

interface MeshSource {
  kind: "mesh";
  scene: THREE.Group;
}

interface ShapeSource {
  kind: "shapes";
  shapes: THREE.Shape[];
}

type AssetSource = MeshSource | ShapeSource;

const PREFILTER_SHADER = `
const PI = 3.14159265359;
const LEVELS = 6.0;
const SRC_W = 32u;
const SRC_H = 16u;

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

const MIPMAP_SHADER = `
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


const BACKDROP_SHADER = `
struct BackdropParams {
  resolution: vec2f,
  studioBase: vec3f,
  backdropTransform: vec4f,
  hasBackdrop: f32,
  studioLight: f32,
}

@group(0) @binding(0) var<uniform> params: BackdropParams;
@group(0) @binding(1) var uBackdrop: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

fn srgbToLinear(c: vec3f) -> vec3f {
  let lo = c / 12.92;
  let hi = pow(max((c + vec3f(0.055)) / 1.055, vec3f(0.0)), vec3f(2.4));
  return select(hi, lo, c <= vec3f(0.04045));
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  if (params.hasBackdrop > 0.5) {
    let q = clamp(uv * params.backdropTransform.xy + params.backdropTransform.zw, vec2f(0.001), vec2f(0.999));
    let c = textureSampleLevel(uBackdrop, uSampler, q, 0.0);
    return vec4f(srgbToLinear(c.rgb), c.a);
  }
  let base = params.studioBase;
  let shade = select(base + (vec3f(1.0) - base) * 0.1, base * 0.62, params.studioLight > 0.5);
  let t = clamp(uv.y, 0.0, 1.0);
  var k = mix(0.75, 1.0, (t - 0.62) / 0.38);
  if (t < 0.48) {
    k = mix(0.0, 0.18, t / 0.48);
  } else if (t < 0.62) {
    k = mix(0.18, 0.75, (t - 0.48) / 0.14);
  }
  return vec4f(srgbToLinear(mix(base, shade, k)), 1.0);
}`;

const GLASS_SHADER = `
const PI = 3.14159265359;
const ENV_LEVELS = 6.0;
const ENV_ROWS = 32.0;

struct GlassParams {
  sh: array<vec4f, 9>,
  viewProjection: mat4x4f,
  model: mat4x4f,
  normalMatrix: mat3x3f,
  cameraPosition: vec3f,
  time: f32,
  resolution: vec2f,
  transmissionMapSize: vec2f,
  attenuationColor: vec3f,
  ior: f32,
  highlight: vec3f,
  thickness: f32,
  roughness: f32,
  dispersion: f32,
  clearcoat: f32,
  attenuationDistance: f32,
  environmentIntensity: f32,
}

struct VSOut {
  @builtin(position) position: vec4f,
  @location(0) worldPos: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
}

struct TransmissionTap {
  sample: vec4f,
  rayDistance: f32,
}

@group(0) @binding(0) var<uniform> params: GlassParams;
@group(0) @binding(1) var uBehind: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
@group(0) @binding(3) var uEnv: texture_2d<f32>;
@group(0) @binding(4) var uEnvSampler: sampler;

fn equirect(d: vec3f) -> vec2f {
  let u = (atan2(d.x, -d.z) + PI) / (2.0 * PI);
  let v = acos(clamp(d.y, -1.0, 1.0)) / PI;
  return vec2f(u, v);
}

fn envRadiance(d: vec3f, roughness: f32) -> vec3f {
  let envUv = equirect(d);
  let lod = clamp(roughness, 0.0, 1.0) * (ENV_LEVELS - 1.0);
  let l0 = floor(lod);
  let l1 = min(l0 + 1.0, ENV_LEVELS - 1.0);
  let v = clamp(envUv.y, 0.5 / ENV_ROWS, 1.0 - 0.5 / ENV_ROWS);
  let a = textureSampleLevel(uEnv, uEnvSampler, vec2f(envUv.x, (l0 + v) / ENV_LEVELS), 0.0);
  let b = textureSampleLevel(uEnv, uEnvSampler, vec2f(envUv.x, (l1 + v) / ENV_LEVELS), 0.0);
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

fn environmentBRDF(ndv: f32, specularColor: vec3f, roughness: f32) -> vec3f {
  let fab = dfgApprox(ndv, roughness);
  return specularColor * fab.x + vec3f(fab.y);
}

@vertex fn vs_main(
  @location(0) aPosition: vec3f,
  @location(1) aNormal: vec3f,
  @location(2) aUv: vec2f,
) -> VSOut {
  var out: VSOut;
  let world = params.model * vec4f(aPosition, 1.0);
  var clip = params.viewProjection * world;
  clip.z = clip.z * 0.5 + clip.w * 0.5;
  out.position = clip;
  out.worldPos = world.xyz;
  out.normal = normalize(params.normalMatrix * aNormal);
  out.uv = aUv;
  return out;
}

fn w0(a: f32) -> f32 { return (1.0 / 6.0) * (a * (a * (-a + 3.0) - 3.0) + 1.0); }
fn w1(a: f32) -> f32 { return (1.0 / 6.0) * (a * a * (3.0 * a - 6.0) + 4.0); }
fn w2(a: f32) -> f32 { return (1.0 / 6.0) * (a * (a * (-3.0 * a + 3.0) + 3.0) + 1.0); }
fn w3(a: f32) -> f32 { return (1.0 / 6.0) * (a * a * a); }
fn g0(a: f32) -> f32 { return w0(a) + w1(a); }
fn g1(a: f32) -> f32 { return w2(a) + w3(a); }
fn h0(a: f32) -> f32 { return -1.0 + w1(a) / (w0(a) + w1(a)); }
fn h1(a: f32) -> f32 { return 1.0 + w3(a) / (w2(a) + w3(a)); }

fn bicubic(uvIn: vec2f, lod: f32) -> vec4f {
  let size = vec2f(textureDimensions(uBehind, i32(lod)));
  let texel = 1.0 / size;
  let uv = uvIn * size + 0.5;
  let iuv = floor(uv);
  let fuv = fract(uv);
  let g0x = g0(fuv.x);
  let g1x = g1(fuv.x);
  let h0x = h0(fuv.x);
  let h1x = h1(fuv.x);
  let h0y = h0(fuv.y);
  let h1y = h1(fuv.y);
  let p0 = (vec2f(iuv.x + h0x, iuv.y + h0y) - 0.5) * texel;
  let p1 = (vec2f(iuv.x + h1x, iuv.y + h0y) - 0.5) * texel;
  let p2 = (vec2f(iuv.x + h0x, iuv.y + h1y) - 0.5) * texel;
  let p3 = (vec2f(iuv.x + h1x, iuv.y + h1y) - 0.5) * texel;
  return g0(fuv.y) * (g0x * textureSampleLevel(uBehind, uSampler, p0, lod) + g1x * textureSampleLevel(uBehind, uSampler, p1, lod)) +
    g1(fuv.y) * (g0x * textureSampleLevel(uBehind, uSampler, p2, lod) + g1x * textureSampleLevel(uBehind, uSampler, p3, lod));
}

fn textureBicubic(uv: vec2f, lod: f32) -> vec4f {
  let maxLod = f32(textureNumLevels(uBehind) - 1u);
  let l = clamp(lod, 0.0, maxLod);
  let f = bicubic(uv, floor(l));
  let c = bicubic(uv, min(ceil(l), maxLod));
  return mix(f, c, fract(l));
}

fn volumeAttenuation(transmissionDistance: f32, attenuationColor: vec3f, attenuationDistance: f32) -> vec3f {
  if (attenuationDistance > 1e19) { return vec3f(1.0); }
  let attenuationCoefficient = -log(max(attenuationColor, vec3f(1e-6))) / max(attenuationDistance, 1e-6);
  return exp(-attenuationCoefficient * transmissionDistance);
}

fn getTransmissionTap(worldPos: vec3f, v: vec3f, n: vec3f, ior: f32, roughness: f32) -> TransmissionTap {
  let refractionVector = refract(-v, n, 1.0 / max(ior, 1.001));
  let modelScale = vec3f(
    length(params.model[0].xyz),
    length(params.model[1].xyz),
    length(params.model[2].xyz)
  );
  let transmissionRay = normalize(refractionVector) * params.thickness * modelScale;
  let exitPos = worldPos + transmissionRay;
  let ndc = params.viewProjection * vec4f(exitPos, 1.0);
  var coords = ndc.xy / max(ndc.w, 1e-6) * 0.5 + vec2f(0.5);
  coords.y = 1.0 - coords.y;
  coords = clamp(coords, vec2f(0.001), vec2f(0.999));
  let lod = log2(max(params.transmissionMapSize.x, 1.0)) * roughness * clamp(ior * 2.0 - 2.0, 0.0, 1.0);
  var tap: TransmissionTap;
  tap.sample = textureBicubic(coords, lod);
  tap.rayDistance = length(transmissionRay);
  return tap;
}

@fragment fn fs_main(in: VSOut, @builtin(front_facing) front: bool) -> @location(0) vec4f {
  var n = normalize(in.normal);
  if (!front) { n = -n; }
  let v = normalize(params.cameraPosition - in.worldPos);
  let ndv = max(dot(n, v), 0.0001);
  let ior = clamp(params.ior, 1.0, 2.333);
  let roughness = min(max(params.roughness, 0.0525), 1.0);
  let f0 = pow((ior - 1.0) / (ior + 1.0), 2.0);
  let specularColor = vec3f(f0);

  let halfSpread = (ior - 1.0) * 0.025 * max(params.dispersion, 0.0);
  let iorR = max(ior - halfSpread, 1.001);
  let iorG = max(ior, 1.001);
  let iorB = max(ior + halfSpread, 1.001);
  let tapR = getTransmissionTap(in.worldPos, v, n, iorR, roughness);
  let tapG = getTransmissionTap(in.worldPos, v, n, iorG, roughness);
  let tapB = getTransmissionTap(in.worldPos, v, n, iorB, roughness);

  let transmittanceR = volumeAttenuation(tapR.rayDistance, params.attenuationColor, params.attenuationDistance).r;
  let transmittanceG = volumeAttenuation(tapG.rayDistance, params.attenuationColor, params.attenuationDistance).g;
  let transmittanceB = volumeAttenuation(tapB.rayDistance, params.attenuationColor, params.attenuationDistance).b;
  let transmittance = vec3f(transmittanceR, transmittanceG, transmittanceB);
  let transmittedLight = vec4f(tapR.sample.r, tapG.sample.g, tapB.sample.b, (tapR.sample.a + tapG.sample.a + tapB.sample.a) / 3.0);
  let attenuatedColor = transmittance * transmittedLight.rgb;
  let F = environmentBRDF(ndv, specularColor, roughness);
  let transmittanceFactor = dot(transmittance, vec3f(0.3333333));
  let transmittedAlpha = 1.0 - (1.0 - transmittedLight.a) * transmittanceFactor;
  let transmitted = vec4f((vec3f(1.0) - F) * attenuatedColor, transmittedAlpha);

  let reflectDir = reflect(-v, n);
  let radiance = envRadiance(reflectDir, roughness) * params.environmentIntensity;
  let irradiance = shIrradiance(n) * params.environmentIntensity;
  let fab = dfgApprox(ndv, roughness);
  let FssEss = specularColor * fab.x + vec3f(fab.y);
  let Ess = fab.x + fab.y;
  let Ems = 1.0 - Ess;
  let Favg = specularColor + (vec3f(1.0) - specularColor) * 0.047619;
  let Fms = FssEss * Favg / max(vec3f(1.0) - Ems * Favg, vec3f(1e-6));
  let single = FssEss;
  let multi = Fms * Ems;
  let indirectSpecular = radiance * single + multi * irradiance;

  var outgoing = transmitted.rgb + indirectSpecular;
  let clearcoat = clamp(params.clearcoat, 0.0, 1.0);
  let clearcoatRoughness = 0.06;
  let ccRadiance = envRadiance(reflectDir, clearcoatRoughness) * params.environmentIntensity;
  let fabcc = dfgApprox(ndv, clearcoatRoughness);
  let ccSpec = ccRadiance * (0.04 * fabcc.x + fabcc.y);
  let Fcc = 0.04 + (1.0 - 0.04) * pow(1.0 - clamp(ndv, 0.0, 1.0), 5.0);
  outgoing = outgoing * (1.0 - clearcoat * Fcc) + ccSpec * clearcoat;

  let alpha = clamp(transmitted.a, 0.0, 1.0);
  return vec4f(max(outgoing, vec3f(0.0)) * alpha, alpha);
}`;

const COMPOSITE_SHADER = `
struct CompositeParams {
  background: vec3f,
  hasBackground: f32,
  hasBackdrop: f32,
}

@group(0) @binding(0) var uBehind: texture_2d<f32>;
@group(0) @binding(1) var uGlass: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;
@group(0) @binding(3) var<uniform> params: CompositeParams;

fn rrtAndOdtFit(v: vec3f) -> vec3f {
  let a = v * (v + vec3f(0.0245786)) - vec3f(0.000090537);
  let b = v * (vec3f(0.983729) * v + vec3f(0.4329510)) + vec3f(0.238081);
  return a / b;
}

fn acesFilmicToneMapping(colorIn: vec3f) -> vec3f {
  let acesInputMat = mat3x3f(
    vec3f(0.59719, 0.07600, 0.02840),
    vec3f(0.35458, 0.90834, 0.13383),
    vec3f(0.04823, 0.01566, 0.83777)
  );
  let acesOutputMat = mat3x3f(
    vec3f( 1.60475, -0.10208, -0.00327),
    vec3f(-0.53108,  1.10813, -0.07276),
    vec3f(-0.07367, -0.00605,  1.07602)
  );
  var color = colorIn / 0.6;
  color = acesInputMat * color;
  color = rrtAndOdtFit(color);
  color = acesOutputMat * color;
  return clamp(color, vec3f(0.0), vec3f(1.0));
}

fn toSrgb(cIn: vec3f) -> vec3f {
  let c = clamp(cIn, vec3f(0.0), vec3f(1.0));
  let lo = c * 12.92;
  let hi = 1.055 * pow(c, vec3f(1.0 / 2.4)) - 0.055;
  return select(hi, lo, c <= vec3f(0.0031308));
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let behind = textureSampleLevel(uBehind, uSampler, uv, 0.0);
  let glass = textureSampleLevel(uGlass, uSampler, uv, 0.0);
  if (params.hasBackdrop > 0.5) {
    let linear = behind.rgb * behind.a * (1.0 - glass.a) + glass.rgb;
    let alpha = glass.a + behind.a * (1.0 - glass.a);
    return vec4f(toSrgb(acesFilmicToneMapping(max(linear, vec3f(0.0)))), alpha);
  }
  let toned = toSrgb(acesFilmicToneMapping(max(glass.rgb, vec3f(0.0))));
  if (params.hasBackground > 0.5) {
    return vec4f(toned + params.background * (1.0 - glass.a), 1.0);
  }
  return vec4f(toned, glass.a);
}`;

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

type ExternalImageSource =
  | HTMLCanvasElement
  | OffscreenCanvas
  | HTMLImageElement
  | ImageBitmap
  | ImageData
  | HTMLVideoElement
  | VideoFrame;

interface GpuMesh {
  mesh: THREE.Mesh;
  geo: Geometry;
  pass: Draw;
}

function textureSizeOf(source: ExternalImageSource): [number, number] {
  if (source instanceof HTMLImageElement) {
    return [source.naturalWidth || source.width, source.naturalHeight || source.height];
  }
  if (source instanceof HTMLVideoElement) {
    return [source.videoWidth || source.width, source.videoHeight || source.height];
  }
  const sized = source as { width?: number; height?: number; displayWidth?: number; displayHeight?: number };
  return [sized.width ?? sized.displayWidth ?? 1, sized.height ?? sized.displayHeight ?? 1];
}

function canCopySource(source: unknown): source is ExternalImageSource {
  if (!source || typeof source !== "object") return false;
  const [w, h] = textureSizeOf(source as ExternalImageSource);
  return w > 0 && h > 0;
}

function createOnePixelTexture(gpu: Gpu, rgba: [number, number, number, number], label: string): Texture {
  const tex = gpu.device.createTexture({
    size: [1, 1],
    format: "rgba8unorm",
    usage: ["texture_binding", "copy_dst"],
    label,
  });
  gpu.gpu.queue.writeTexture(
    { texture: tex.gpu },
    new Uint8Array(rgba),
    { bytesPerRow: 4 },
    [1, 1],
  );
  return tex;
}

function uploadExternalTexture(
  gpu: Gpu,
  previous: Texture | null,
  source: ExternalImageSource,
  label: string,
): Texture {
  const [rawW, rawH] = textureSizeOf(source);
  const width = Math.max(1, Math.round(rawW));
  const height = Math.max(1, Math.round(rawH));
  let tex = previous;
  if (!tex || tex.size[0] !== width || tex.size[1] !== height) {
    tex?.destroy();
    tex = gpu.device.createTexture({
      size: [width, height],
      format: "rgba8unorm",
      usage: ["texture_binding", "copy_dst", "render_attachment"],
      label,
    });
  }
  gpu.gpu.queue.copyExternalImageToTexture({ source }, { texture: tex.gpu }, [width, height]);
  return tex;
}

function readAttribute(
  attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined,
  index: number,
  item: 0 | 1 | 2,
): number {
  if (!attribute) return item === 2 ? 0 : 0;
  if (item === 0) return attribute.getX(index);
  if (item === 1) return attribute.getY(index);
  return attribute.itemSize > 2 ? attribute.getZ(index) : 0;
}

function geometryDataFor(
  source: THREE.BufferGeometry,
  group?: THREE.BufferGeometry["groups"][number],
): Float32Array<ArrayBuffer> | null {
  const position = source.getAttribute("position") as THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined;
  if (!position) return null;
  if (!source.getAttribute("normal")) source.computeVertexNormals();
  const normal = source.getAttribute("normal") as THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined;
  const uv = source.getAttribute("uv") as THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined;
  const index = source.index;
  const start = group?.start ?? 0;
  const count = group?.count ?? (index ? index.count : position.count);
  const data = new Float32Array(new ArrayBuffer(count * 8 * 4));
  let o = 0;
  for (let i = 0; i < count; i++) {
    const vertex = index ? index.getX(start + i) : start + i;
    data[o++] = readAttribute(position, vertex, 0);
    data[o++] = readAttribute(position, vertex, 1);
    data[o++] = readAttribute(position, vertex, 2);
    data[o++] = readAttribute(normal, vertex, 0);
    data[o++] = readAttribute(normal, vertex, 1);
    data[o++] = readAttribute(normal, vertex, 2);
    data[o++] = readAttribute(uv, vertex, 0);
    data[o++] = readAttribute(uv, vertex, 1);
  }
  return data;
}

export function createGlassObject(
  elements: GlassObjectElements,
  options: GlassObjectOptions = {},
): GlassObjectInstance | null {
  if (!supportsWebGPU()) return null;
  const { canvas } = elements;
  const config: Required<GlassObjectOptions> = { ...DEFAULTS, ...resolveOptions(DEFAULTS, options) };

  const camera = new THREE.PerspectiveCamera(config.fov, 1, 0.1, 200);
  camera.position.copy(CAMERA_DIR).multiplyScalar(config.cameraDistance);
  const scene = new THREE.Scene();
  const floatGroup = new THREE.Group();
  floatGroup.position.y = MODEL_LIFT;
  const fitGroup = new THREE.Group();
  floatGroup.add(fitGroup);
  scene.add(floatGroup);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.enablePan = false;

  const textureLoader = new THREE.TextureLoader();
  textureLoader.setCrossOrigin("anonymous");
  let backdropTexture: THREE.Texture | null = null;
  let backdropGpuTexture: Texture | null = null;
  let backdropSrc: string | null = null;
  let backdropTransform: [number, number, number, number] = [1, 1, 0, 0];

  const glass = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0,
    transmission: 1,
    clearcoatRoughness: 0.06,
    specularIntensity: 1,
  });

  let gpu: Gpu | null = null;
  let screen: Surface | null = null;
  let behindTarget: Target | null = null;
  let glassTarget: Target | null = null;
  let backdropFx: Effect | null = null;
  let compositeFx: Effect | null = null;
  let linearSampler: GPUSampler | null = null;
  let mipmapLayout: GPUBindGroupLayout | null = null;
  let mipmapPipeline: GPURenderPipeline | null = null;
  let behindMipTexture: Texture | null = null;
  let behindDirty = true;
  let uploadedBackdropImage: unknown = null;
  let envAtlas: Target | null = null;
  let envSampler: GPUSampler | null = null;
  let envSourceKey = "";
  let envSh: [number, number, number, number][] = [];
  let whiteTexture: Texture | null = null;
  let gpuMeshes: GpuMesh[] = [];
  let fallback2d: CanvasRenderingContext2D | null = null;
  let disposed = false;

  const viewProjection = new THREE.Matrix4();
  const normalMatrix = new THREE.Matrix3();
  const backgroundColor = new THREE.Color();
  const tintColor = new THREE.Color(1, 1, 1);
  const highlightColor = new THREE.Color();
  let hasBackground = 0;
  const studioBase = new THREE.Color(1, 1, 1);
  let studioLight = 1;
  const pageProbe = document.createElement("canvas");
  pageProbe.width = pageProbe.height = 1;
  const pageProbeCtx = pageProbe.getContext("2d", { willReadFrequently: true });

  function readPageColor(target: THREE.Color) {
    target.set(0xffffff);
    if (!pageProbeCtx) return;
    let el: Element | null = canvas;
    while (el) {
      const css = getComputedStyle(el).backgroundColor;
      if (css && css !== "transparent") {
        pageProbeCtx.clearRect(0, 0, 1, 1);
        pageProbeCtx.fillStyle = css;
        pageProbeCtx.fillRect(0, 0, 1, 1);
        const [r, g, b, a] = pageProbeCtx.getImageData(0, 0, 1, 1).data;
        if (a > 0) {
          target.setRGB(r / 255, g / 255, b / 255, THREE.SRGBColorSpace);
          return;
        }
      }
      el = el.parentElement;
    }
  }

  function syncStudio() {
    if (config.background) studioBase.set(config.background);
    else readPageColor(studioBase);
    const { r, g, b } = studioBase.getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace);
    studioLight = 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.5 ? 1 : 0;
    behindDirty = true;
  }

  function syncColors() {
    hasBackground = config.background ? 1 : 0;
    if (config.background) backgroundColor.set(config.background);
    if (config.tint) tintColor.set(config.tint);
    else tintColor.set(0xffffff);
    highlightColor.set(config.highlight);
    syncStudio();
  }

  function layoutBackdrop() {
    if (!backdropTexture) return;
    const image = backdropTexture.image as { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number };
    const imageWidth = image.naturalWidth || image.width || 1;
    const imageHeight = image.naturalHeight || image.height || 1;
    const planeAspect = camera.aspect || 1;
    const imageAspect = imageWidth / Math.max(imageHeight, 1);
    if (imageAspect > planeAspect) {
      const repeatX = planeAspect / imageAspect;
      backdropTransform = [repeatX, 1, (1 - repeatX) / 2, 0];
    } else {
      const repeatY = imageAspect / planeAspect;
      backdropTransform = [1, repeatY, 0, (1 - repeatY) / 2];
    }
  }

  function bindBackdropTexture() {
    if (!backdropFx || !whiteTexture) return;
    backdropFx.set({ uBackdrop: backdropGpuTexture ?? whiteTexture });
  }

  function uploadBackdropTexture() {
    if (!gpu || !backdropTexture) return;
    const image = backdropTexture.image;
    if (!canCopySource(image)) return;
    if (image === uploadedBackdropImage && backdropGpuTexture) return;
    uploadedBackdropImage = image;
    behindDirty = true;
    backdropGpuTexture = uploadExternalTexture(
      gpu,
      backdropGpuTexture,
      image,
      "glass-object.backdrop",
    );
    bindBackdropTexture();
  }

  function mipLevelCountFor(width: number, height: number): number {
    return Math.floor(Math.log2(Math.max(width, height))) + 1;
  }

  function ensureBehindMipTexture(width: number, height: number): Texture | null {
    if (!gpu) return null;
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    const mipLevelCount = mipLevelCountFor(w, h);
    if (
      !behindMipTexture ||
      behindMipTexture.size[0] !== w ||
      behindMipTexture.size[1] !== h ||
      behindMipTexture.mipLevelCount !== mipLevelCount
    ) {
      behindMipTexture?.destroy();
      behindDirty = true;
      behindMipTexture = gpu.device.createTexture({
        size: [w, h],
        format: "rgba16float",
        usage: ["texture_binding", "copy_dst", "render_attachment"],
        mipLevelCount,
        label: "glass-object.behind-mips",
      });
      for (const part of gpuMeshes) part.pass.set({ uBehind: behindMipTexture });
    }
    return behindMipTexture;
  }

  function ensureMipmapPipeline(): GPURenderPipeline | null {
    if (!gpu || !linearSampler) return null;
    if (!mipmapLayout) {
      mipmapLayout = gpu.gpu.createBindGroupLayout({
        label: "glass-object.mipmap.layout",
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
        label: "glass-object.mipmap",
        code: MIPMAP_SHADER,
      });
      mipmapPipeline = gpu.gpu.createRenderPipeline({
        label: "glass-object.mipmap",
        layout: gpu.gpu.createPipelineLayout({ bindGroupLayouts: [mipmapLayout] }),
        vertex: { module: shaderModule, entryPoint: "vs_main" },
        fragment: {
          module: shaderModule,
          entryPoint: "fs_main",
          targets: [{ format: "rgba16float" }],
        },
        primitive: { topology: "triangle-list" },
      });
    }
    return mipmapPipeline;
  }

  function generateBehindMipmaps() {
    if (!gpu || !linearSampler || !behindTarget || !behindMipTexture) return;
    const [width, height] = behindTarget.size;
    ensureBehindMipTexture(width, height);
    if (!behindMipTexture) return;
    const pipeline = ensureMipmapPipeline();
    if (!pipeline || !mipmapLayout) return;
    const encoder = gpu.gpu.createCommandEncoder({ label: "glass-object.mipmap" });
    encoder.copyTextureToTexture(
      { texture: behindTarget.color.gpu },
      { texture: behindMipTexture.gpu, mipLevel: 0 },
      [width, height],
    );
    for (let level = 1; level < behindMipTexture.mipLevelCount; level++) {
      const bindGroup = gpu.gpu.createBindGroup({
        label: "glass-object.mipmap",
        layout: mipmapLayout,
        entries: [
          {
            binding: 0,
            resource: behindMipTexture.gpu.createView({
              baseMipLevel: level - 1,
              mipLevelCount: 1,
            }),
          },
          { binding: 1, resource: linearSampler },
        ],
      });
      const pass = encoder.beginRenderPass({
        label: "glass-object.mipmap",
        colorAttachments: [
          {
            view: behindMipTexture.gpu.createView({ baseMipLevel: level, mipLevelCount: 1 }),
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

  function disposeEnvironment() {
    (envAtlas as unknown as { destroy?: () => void } | null)?.destroy?.();
    envAtlas = null;
    envSampler = null;
    envSh = [];
    envSourceKey = "";
  }

  function currentEnvironmentSource(): { key: string; bake: () => StudioRadiance } {
    const image = backdropTexture?.image;
    if (image && canCopySource(image)) {
      return {
        key: `backdrop:${backdropSrc ?? ""}`,
        bake: () => {
          try {
            const radiance = bakeBackdropRadiance(image as CanvasImageSource);
            if (radiance) return radiance;
          } catch {}
          return bakeStudioRadiance();
        },
      };
    }
    return { key: "room", bake: bakeStudioRadiance };
  }

  function buildEnvironment() {
    if (!gpu) return;
    const { key, bake } = currentEnvironmentSource();
    if (envAtlas && envSourceKey === key) return;
    const radiance = bake();
    behindDirty = true;
    disposeEnvironment();
    envSourceKey = key;
    envSh = radiance.sh;
    const hi = gpu.device.createTexture({
      size: [ENV_WIDTH, ENV_HEIGHT],
      format: "rgba16float",
      usage: ["texture_binding", "copy_dst"],
      label: "glass-object.env-hi",
    });
    const lo = gpu.device.createTexture({
      size: [ENV_WIDTH / 2, ENV_HEIGHT / 2],
      format: "rgba16float",
      usage: ["texture_binding", "copy_dst"],
      label: "glass-object.env-lo",
    });
    gpu.gpu.queue.writeTexture(
      { texture: hi.gpu },
      toHalfArray(radiance.hi),
      { bytesPerRow: ENV_WIDTH * 8 },
      [ENV_WIDTH, ENV_HEIGHT],
    );
    gpu.gpu.queue.writeTexture(
      { texture: lo.gpu },
      toHalfArray(radiance.lo),
      { bytesPerRow: (ENV_WIDTH / 2) * 8 },
      [ENV_WIDTH / 2, ENV_HEIGHT / 2],
    );
    envAtlas = target(gpu, {
      size: [ENV_WIDTH, ENV_HEIGHT * ENV_LEVELS],
      format: "rgba16float",
      label: "glass-object.env",
    });
    envSampler = sampler(gpu, {
      minFilter: "linear",
      magFilter: "linear",
      addressModeU: "repeat",
      addressModeV: "clamp-to-edge",
    });
    gpuEffect(gpu, PREFILTER_SHADER, {
      label: "glass-object.prefilter",
      set: { params: { hiSize: [ENV_WIDTH, ENV_HEIGHT] }, uHi: hi, uLo: lo },
    }).draw(envAtlas);
    hi.destroy();
    lo.destroy();
    buildGpuMeshes();
  }

  function loadBackdrop() {
    const src = config.backgroundImage;
    if (src === backdropSrc) return;
    backdropSrc = src;
    if (!src) {
      backdropTexture?.dispose();
      backdropTexture = null;
      backdropGpuTexture?.destroy();
      backdropGpuTexture = null;
      bindBackdropTexture();
      buildEnvironment();
      startLoop();
      return;
    }
    textureLoader.load(
      src,
      (texture) => {
        if (disposed || config.backgroundImage !== src) {
          texture.dispose();
          return;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.generateMipmaps = false;
        texture.minFilter = THREE.LinearFilter;
        backdropTexture?.dispose();
        backdropTexture = texture;
        layoutBackdrop();
        uploadBackdropTexture();
        buildEnvironment();
        startLoop();
      },
      undefined,
      (error) => config.onError?.(error),
    );
  }

  let model: THREE.Object3D | null = null;
  let modelMaxDim = 1;
  let assetSource: AssetSource | null = null;
  let builtDepth = -1;
  let builtBevel = -1;
  let loadedSrc: string | null = null;
  let loadToken = 0;

  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath(config.dracoDecoderPath);
  loader.setDRACOLoader(draco);

  function disposeGpuMeshes() {
    for (const part of gpuMeshes) part.geo.destroy();
    gpuMeshes = [];
  }

  function buildGpuMeshes() {
    disposeGpuMeshes();
    if (!gpu || !glassTarget || !behindMipTexture || !linearSampler || !envAtlas || !envSampler || !model) return;
    model.updateMatrixWorld(true);
    model.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      const groups = mesh.geometry.groups.length
        ? mesh.geometry.groups
        : [{ start: 0, count: mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position")?.count ?? 0, materialIndex: 0 }];
      for (const group of groups) {
        const data = geometryDataFor(mesh.geometry, group);
        if (!data || data.length === 0) continue;
        const geo = geometry(gpu!, {
          buffers: [
            {
              data,
              attributes: {
                aPosition: "float32x3",
                aNormal: "float32x3",
                aUv: "float32x2",
              },
            },
          ],
          topology: "triangle-list",
          label: "glass-object.mesh",
        });
        const pass = draw(gpu!, {
          shader: GLASS_SHADER,
          geometry: geo,
          blend: "premultiplied",
          cull: "none",
          depth: { compare: "less-equal", write: true },
          set: { uBehind: behindMipTexture, uSampler: linearSampler, uEnv: envAtlas, uEnvSampler: envSampler },
          label: "glass-object.glass",
        });
        gpuMeshes.push({ mesh, geo, pass });
      }
    });
  }

  function applyFit() {
    if (!model) return;
    fitGroup.scale.setScalar(config.scale / modelMaxDim);
    glass.thickness = Math.max(config.thickness, 0) / Math.max(fitGroup.scale.x, 1e-6);
  }

  function clearModel() {
    if (!model) return;
    disposeGpuMeshes();
    fitGroup.remove(model);
    disposeObject(model, glass);
    model = null;
  }

  function clearAsset() {
    if (assetSource?.kind === "mesh") disposeObject(assetSource.scene, glass);
    assetSource = null;
    builtDepth = -1;
    builtBevel = -1;
    clearModel();
  }

  function mountModel(next: THREE.Object3D) {
    clearModel();
    model = next;
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    const offset = bounds.getCenter(new THREE.Vector3());
    modelMaxDim = Math.max(size.x, size.y, size.z, 1e-4);
    model.position.sub(offset);
    applyFit();
    fitGroup.add(model);
    buildGpuMeshes();
  }

  function buildModel() {
    if (!assetSource) return;
    if (assetSource.kind === "mesh") {
      if (model) return;
      assetSource.scene.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) return;
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const material of materials) {
          if (!material || material === glass) continue;
          for (const value of Object.values(material)) {
            if (value instanceof THREE.Texture) value.dispose();
          }
          material.dispose();
        }
        mesh.material = glass;
        if (!mesh.geometry.getAttribute("normal")) mesh.geometry.computeVertexNormals();
      });
      mountModel(assetSource.scene);
      return;
    }

    const depth = Math.min(Math.max(config.depth, 0.02), 1);
    const bevel = Math.min(Math.max(config.bevel, 0), 1);
    if (model && depth === builtDepth && bevel === builtBevel) return;
    builtDepth = depth;
    builtBevel = bevel;

    const box = new THREE.Box2();
    for (const shape of assetSource.shapes) {
      for (const point of shape.getPoints(4)) box.expandByPoint(point);
    }
    const size2d = Math.max(box.max.x - box.min.x, box.max.y - box.min.y, 1e-4);
    const depthUnits = depth * size2d;
    const bevelAmount = bevel * depthUnits * 0.5;

    const shapes = roundShapeCorners(assetSource.shapes, bevelAmount * 1.25);
    let shapeGeometry: THREE.BufferGeometry = new THREE.ExtrudeGeometry(shapes, {
      depth: Math.max(depthUnits - bevelAmount * 2, depthUnits * 0.1),
      bevelEnabled: bevelAmount > 1e-4,
      bevelThickness: bevelAmount,
      bevelSize: bevelAmount * 0.9,
      bevelOffset: 0,
      bevelSegments: 12,
      curveSegments: 24,
    });
    shapeGeometry = toCreasedNormals(shapeGeometry, Math.PI / 7);
    flattenCapNormals(shapeGeometry);
    shapeGeometry.rotateX(Math.PI);
    mountModel(new THREE.Mesh(shapeGeometry, glass));
  }

  async function loadAsset() {
    const src = config.src;
    if (src === loadedSrc) return;
    loadedSrc = src;
    const token = ++loadToken;
    if (!src) {
      clearAsset();
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
        clearAsset();
        assetSource = { kind: "mesh", scene: gltf.scene };
      } else if (kind === "svg") {
        const shapes = shapesFromSvg(new TextDecoder().decode(bytes));
        if (disposed || token !== loadToken) return;
        clearAsset();
        assetSource = { kind: "shapes", shapes };
      } else {
        const data = await rasterizeImage(new Blob([buffer]));
        if (disposed || token !== loadToken) return;
        const shapes = shapesFromImage(data);
        clearAsset();
        assetSource = { kind: "shapes", shapes };
      }
      buildModel();
      config.onLoad?.();
      startLoop();
    } catch (error) {
      if (disposed || token !== loadToken) return;
      config.onError?.(error);
    }
  }

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reducedMotion = motionQuery.matches;
  const onMotionChange = () => {
    reducedMotion = motionQuery.matches;
    if (reducedMotion) floatGroup.rotation.set(0, 0, 0);
    applyOptions();
  };
  motionQuery.addEventListener("change", onMotionChange);

  function applyOptions() {
    behindDirty = true;
    syncColors();
    controls.enableRotate = config.orbit;
    controls.enableZoom = config.zoom;
    controls.autoRotate = config.autoRotate && !reducedMotion;
    controls.autoRotateSpeed = config.autoRotateSpeed;
    camera.fov = fitFov(config.fov, camera.aspect);
    camera.updateProjectionMatrix();
    loadBackdrop();
    layoutBackdrop();
    floatGroup.position.x = config.xOffset;
    floatGroup.position.y = MODEL_LIFT + config.yOffset;
    glass.ior = Math.min(Math.max(config.ior, 1), 2.333);
    glass.roughness = Math.min(Math.max(config.roughness, 0), 1);
    glass.dispersion = Math.max(config.dispersion, 0);
    glass.clearcoat = Math.min(Math.max(config.clearcoat, 0), 1);
    if (config.tint) {
      glass.attenuationColor.set(config.tint);
      glass.attenuationDistance = 1.5 / Math.max(config.tintDensity, 0.01);
    } else {
      glass.attenuationColor.set(0xffffff);
      glass.attenuationDistance = Infinity;
    }
    applyFit();
    buildModel();
    startLoop();
  }

  function resize() {
    const width = Math.max(canvas.clientWidth, 1);
    const height = Math.max(canvas.clientHeight, 1);
    const pr = getCanvasPixelRatio(canvas);
    const pixelWidth = Math.max(1, Math.round(width * pr));
    const pixelHeight = Math.max(1, Math.round(height * pr));
    if (screen) {
      if (screen.size[0] !== pixelWidth || screen.size[1] !== pixelHeight) screen.resize([pixelWidth, pixelHeight]);
    } else if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
      canvas.width = pixelWidth;
      canvas.height = pixelHeight;
    }
    if (behindTarget && (behindTarget.size[0] !== pixelWidth || behindTarget.size[1] !== pixelHeight)) {
      behindTarget.resize([pixelWidth, pixelHeight]);
    }
    if (gpu) ensureBehindMipTexture(pixelWidth, pixelHeight);
    if (glassTarget && (glassTarget.size[0] !== pixelWidth || glassTarget.size[1] !== pixelHeight)) {
      glassTarget.resize([pixelWidth, pixelHeight]);
    }
    behindDirty = true;
    camera.aspect = width / height;
    camera.fov = fitFov(config.fov, camera.aspect);
    camera.updateProjectionMatrix();
    layoutBackdrop();
    startLoop();
  }

  const observer = createCanvasResizeObserver(resize);
  observer.observe(canvas);

  let inView = true;
  let pageVisible = typeof document === "undefined" ? true : !document.hidden;
  let loopRunning = false;
  let raf = 0;
  let lastTime = 0;
  let elapsed = Math.random() * 100;

  function renderFallback() {
    if (!fallback2d) return;
    fallback2d.clearRect(0, 0, canvas.width, canvas.height);
    if (hasBackground) {
      fallback2d.fillStyle = config.background;
      fallback2d.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  function render(time: number) {
    if (!gpu || !screen || !behindTarget || !glassTarget || !backdropFx || !compositeFx) return;
    const device = gpu;
    const outputTarget = screen;
    const backgroundTarget = behindTarget;
    const objectTarget = glassTarget;
    const backgroundPass = backdropFx;
    const compositePass = compositeFx;
    uploadBackdropTexture();
    buildEnvironment();
    const [width, height] = outputTarget.size;
    ensureBehindMipTexture(width, height);
    const transmissionTexture = behindMipTexture;
    if (!transmissionTexture) return;
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);

    const hasBackdrop = backdropTexture && backdropGpuTexture ? 1 : 0;
    const studio = studioBase.getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace);
    backgroundPass.set({
      params: {
        resolution: [width, height],
        studioBase: [studio.r, studio.g, studio.b],
        backdropTransform,
        hasBackdrop,
        studioLight,
      },
    });
    const background = backgroundColor.getRGB({ r: 0, g: 0, b: 0 }, THREE.SRGBColorSpace);
    compositePass.set({
      params: {
        background: [background.r, background.g, background.b],
        hasBackground,
        hasBackdrop,
      },
    });

    if (behindDirty) {
      behindDirty = false;
      gpuFrame(device, (encoder) => {
        encoder.pass({ target: backgroundTarget, clear: [0, 0, 0, 0] }, backgroundPass);
      });
      generateBehindMipmaps();
    }

    gpuFrame(device, (encoder) => {
      encoder.pass({ target: objectTarget, clear: [0, 0, 0, 0] }, (pass) => {
        for (const part of gpuMeshes) {
          normalMatrix.getNormalMatrix(part.mesh.matrixWorld);
          part.pass.set({
            params: {
              sh: envSh,
              viewProjection: Array.from(viewProjection.elements),
              model: Array.from(part.mesh.matrixWorld.elements),
              normalMatrix: Array.from(normalMatrix.elements),
              cameraPosition: [camera.position.x, camera.position.y, camera.position.z],
              time: time * 0.001,
              resolution: [width, height],
              transmissionMapSize: [transmissionTexture.size[0], transmissionTexture.size[1]],
              attenuationColor: [tintColor.r, tintColor.g, tintColor.b],
              ior: Math.min(Math.max(config.ior, 1), 2.333),
              thickness: Math.max(config.thickness, 0) / Math.max(fitGroup.scale.x, 1e-6),
              roughness: Math.min(Math.max(config.roughness, 0), 1),
              dispersion: Math.max(config.dispersion, 0),
              clearcoat: Math.min(Math.max(config.clearcoat, 0), 1),
              attenuationDistance: config.tint ? 1.5 / Math.max(config.tintDensity, 0.01) : 1e20,
              highlight: [highlightColor.r, highlightColor.g, highlightColor.b],
              environmentIntensity: Math.max(config.environmentIntensity, 0),
            },
          });
          pass.draw(part.pass);
        }
      });
      encoder.pass({ target: outputTarget, clear: false }, compositePass);
    });
  }

  function tick(time: number) {
    if (disposed) return;
    if (!inView || !pageVisible) {
      lastTime = 0;
      stopLoop();
      return;
    }
    const delta = lastTime ? Math.min((time - lastTime) / 1000, 0.1) : 0;
    lastTime = time;
    if (fallback2d) {
      renderFallback();
      stopLoop();
      return;
    }
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

  const viewObserver =
    typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver((entries) => {
          inView = entries[entries.length - 1]?.isIntersecting ?? true;
          if (inView) startLoop();
          else stopLoop();
        })
      : null;
  viewObserver?.observe(canvas);

  const onVisibilityChange = () => {
    pageVisible = !document.hidden;
    if (pageVisible) startLoop();
    else stopLoop();
  };
  document.addEventListener("visibilitychange", onVisibilityChange);

  let themeTimer = 0;
  const onThemeShift = () => {
    if (config.background) return;
    syncStudio();
    window.clearTimeout(themeTimer);
    themeTimer = window.setTimeout(syncStudio, 300);
  };
  const themeObserver = new MutationObserver(onThemeShift);
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "style", "data-theme"],
  });
  const schemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
  schemeQuery.addEventListener("change", onThemeShift);

  acquireGpu()
    .then((device) => {
      if (disposed) return;
      gpu = device;
      screen = surface(gpu, canvas, {
        autoResize: false,
        alphaMode: "premultiplied",
        label: "glass-object",
      });
      const width = Math.max(1, canvas.width);
      const height = Math.max(1, canvas.height);
      behindTarget = target(gpu, {
        size: [width, height],
        format: "rgba16float",
        label: "glass-object.behind",
      });
      glassTarget = target(gpu, {
        size: [width, height],
        format: "rgba16float",
        depth: "depth24plus",
        msaa: 4,
        label: "glass-object.glass-target",
      });
      linearSampler = sampler(gpu, {
        minFilter: "linear",
        magFilter: "linear",
        mipmapFilter: "linear",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
      });
      whiteTexture = createOnePixelTexture(gpu, [255, 255, 255, 255], "glass-object.white");
      backdropFx = gpuEffect(gpu, BACKDROP_SHADER, {
        set: { uBackdrop: whiteTexture, uSampler: linearSampler },
        label: "glass-object.backdrop",
      });
      compositeFx = gpuEffect(gpu, COMPOSITE_SHADER, {
        set: { uBehind: behindTarget, uGlass: glassTarget, uSampler: linearSampler },
        label: "glass-object.composite",
      });
      ensureBehindMipTexture(width, height);
      buildEnvironment();
      uploadBackdropTexture();
      buildGpuMeshes();
      resize();
      startLoop();
    })
    .catch((error) => {
      if (disposed) return;
      console.warn("GlassObject: WebGPU unavailable, showing fallback background.", error);
      fallback2d = canvas.getContext("2d");
      renderFallback();
    });

  resize();
  applyOptions();
  loadAsset();
  startLoop();

  return {
    setOptions(next: GlassObjectOptions) {
      next = resolveOptions(DEFAULTS, next);
      let changed = false;
      for (const [key, value] of Object.entries(next)) {
        if (typeof value === "function") continue;
        if (config[key as keyof GlassObjectOptions] !== value) {
          changed = true;
          break;
        }
      }
      if (!changed) {
        Object.assign(config, next);
        return;
      }

      const previousHighlight = config.highlight;
      const previousDistance = config.cameraDistance;
      Object.assign(config, next);
      if (config.highlight !== previousHighlight) syncColors();
      if (config.cameraDistance !== previousDistance) {
        camera.position.copy(CAMERA_DIR).multiplyScalar(config.cameraDistance);
      }
      applyOptions();
      loadAsset();
      startLoop();
    },
    resize,
    destroy() {
      disposed = true;
      loadToken += 1;
      stopLoop();
      observer.disconnect();
      viewObserver?.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      motionQuery.removeEventListener("change", onMotionChange);
      themeObserver.disconnect();
      schemeQuery.removeEventListener("change", onThemeShift);
      window.clearTimeout(themeTimer);
      controls.dispose();
      clearAsset();
      disposeGpuMeshes();
      backdropTexture?.dispose();
      backdropGpuTexture?.destroy();
      whiteTexture?.destroy();
      behindMipTexture?.destroy();
      disposeEnvironment();
      (behindTarget as unknown as { destroy?: () => void } | null)?.destroy?.();
      (glassTarget as unknown as { destroy?: () => void } | null)?.destroy?.();
      screen?.dispose();
      draco.dispose();
      glass.dispose();
    },
  };
}
