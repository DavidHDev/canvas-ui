import { getCanvasPixelRatio, createCanvasResizeObserver } from "../canvas-viewport";
import { resolveOptions } from "../options";
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
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";

export interface ChromeObjectOptions {
  /** URL of the asset to display: GLB/glTF, SVG, PNG, JPEG, WebP, or GIF. Object URLs from a file input work too. The format is sniffed from the bytes, not the extension. */
  src?: string;
  /** Surface roughness (0 to 1). 0 is a perfect mirror; higher values soften the reflections into brushed satin. */
  roughness?: number;
  /** Strength of the liquid ripples that wobble the reflections (0 holds the metal still). */
  flow?: number;
  /** Speed of the liquid ripples. */
  flowSpeed?: number;
  /** Size of the ripple pattern relative to the object. Higher values give more, smaller ripples. */
  flowScale?: number;
  /** Anisotropic streaking that smears the reflections sideways like brushed metal (0 to 1). */
  streaks?: number;
  /** Rainbow fringes on the reflections, strongest at grazing angles (0 to 1). */
  dispersion?: number;
  /** Tint of the metal as any CSS color, e.g. "#e8c37a" for gold. Empty string keeps neutral silver. */
  tint?: string;
  /** Accent color of the colored panel in the studio environment. */
  highlight?: string;
  /** Brightness of the studio environment. */
  environmentIntensity?: number;
  /** How far the reflections swing toward the cursor (0 disables). */
  cursorInfluence?: number;
  /** Extrusion depth of 2D assets (SVG or image) as a fraction of their longest side. */
  depth?: number;
  /** Edge rounding of extruded 2D assets (0 to 1). Rounded edges catch the most light. */
  bevel?: number;
  /** Background color behind the object. Empty string keeps the canvas transparent. */
  background?: string;
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

export interface ChromeObjectElements {
  canvas: HTMLCanvasElement;
}

export interface ChromeObjectInstance {
  setOptions: (options: ChromeObjectOptions) => void;
  resize: () => void;
  destroy: () => void;
}

const DEFAULTS: Required<ChromeObjectOptions> = {
  src: "",
  roughness: 0.08,
  flow: 0.5,
  flowSpeed: 0.4,
  flowScale: 1.5,
  streaks: 0.25,
  dispersion: 0.3,
  tint: "",
  highlight: "#066aff",
  environmentIntensity: 1,
  cursorInfluence: 1,
  depth: 0.12,
  bevel: 1,
  background: "",
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
const MODEL_LIFT = 0.3;
const RASTER_SIZE = 256;
const ALPHA_THRESHOLD = 64;
const SILVER: [number, number, number] = [0.93, 0.94, 0.96];

function fitFov(fov: number, aspect: number): number {
  if (aspect >= 1) return fov;
  const half = THREE.MathUtils.degToRad(fov) / 2;
  const margin = 1 + 0.25 * (1 - aspect);
  return THREE.MathUtils.radToDeg(2 * Math.atan((Math.tan(half) * margin) / aspect));
}

const CHROME_SHADER = `
const C_PI = 3.14159265359;
const C_TAU = 6.28318530718;

struct ChromeParams {
  viewProjection: mat4x4f,
  model: mat4x4f,
  floatMatrix: mat4x4f,
  floatInverse: mat4x4f,
  normalMatrix: mat3x3f,
  envRotation: mat3x3f,
  cameraPosition: vec3f,
  time: f32,
  tint: vec3f,
  flow: f32,
  highlight: vec3f,
  flowFrequency: f32,
  roughness: f32,
  streaks: f32,
  dispersion: f32,
  environmentIntensity: f32,
}

struct VSOut {
  @builtin(position) position: vec4f,
  @location(0) worldPos: vec3f,
  @location(1) normal: vec3f,
  @location(2) objPos: vec3f,
}

@group(0) @binding(0) var<uniform> params: ChromeParams;

fn wrapAngle(a: f32) -> f32 {
  return a - C_TAU * floor((a + C_PI) / C_TAU);
}

fn windowed(x: f32, halfWidth: f32, soft: f32) -> f32 {
  return 1.0 - smoothstep(halfWidth - soft, halfWidth + soft, abs(x));
}

fn softbox(az: f32, el: f32, rect: vec4f, soft: vec2f) -> f32 {
  return windowed(wrapAngle(az - rect.x), rect.z, soft.x) * windowed(el - rect.y, rect.w, soft.y);
}

fn studio(dir: vec3f, soft: vec2f) -> vec3f {
  let d = params.envRotation * dir;
  let el = asin(clamp(d.y, -1.0, 1.0));
  let az = atan2(d.x, d.z);
  let energy = 1.0 / (1.0 + 2.0 * (soft.x + soft.y));

  let ground = mix(0.03, 0.004, smoothstep(0.0, 1.0, -el));
  let sky = 0.026 + 0.05 * smoothstep(-0.1, 1.4, el);
  var color = vec3f(mix(ground, sky, smoothstep(-soft.y - 0.01, soft.y + 0.01, el)));

  color += vec3f(0.92, 0.96, 1.0) * windowed(el - 0.02, 0.012, soft.y + 0.008) * 1.4 * energy;
  color += vec3f(1.0) * smoothstep(0.87 - soft.y, 0.92 + soft.y, d.y) * 2.6 * energy;
  color += vec3f(1.0, 0.98, 0.95) * softbox(az, el, vec4f(-0.95, 0.34, 0.055, 0.5), soft) * 9.0 * energy;
  color += vec3f(0.95, 0.98, 1.0) * softbox(az, el, vec4f(1.12, 0.28, 0.04, 0.42), soft) * 6.0 * energy;
  color += vec3f(1.0) * softbox(az, el, vec4f(0.0, 0.2, 0.75, 0.32), soft + vec2f(0.25)) * 0.22 * energy;
  color += vec3f(1.0) * softbox(az, el, vec4f(0.0, 0.42, 0.85, 0.05), soft) * 2.8 * energy;
  color += vec3f(1.0) * softbox(az, el, vec4f(0.0, 0.15, 0.7, 0.016), soft) * 1.8 * energy;
  color += vec3f(1.0) * softbox(az, el, vec4f(C_PI, 0.16, 1.1, 0.045), soft) * 4.0 * energy;
  color += params.highlight * softbox(az, el, vec4f(2.25, -0.03, 0.42, 0.13), soft + vec2f(0.06)) * 3.2 * energy;
  return color;
}

fn flowField(p: vec3f, t: f32) -> vec3f {
  let q = p + 0.5 * vec3f(
    sin(p.y * 1.7 + t * 0.61),
    sin(p.z * 1.3 - t * 0.53),
    sin(p.x * 1.5 + t * 0.47)
  );
  var g = vec3f(0.0);
  let d1 = vec3f(0.802, 0.535, 0.267);
  let d2 = vec3f(-0.408, 0.816, 0.408);
  let d3 = vec3f(0.218, -0.436, 0.873);
  let d4 = vec3f(-0.667, -0.333, 0.667);
  g += d1 * cos(dot(q, d1) * 2.3 + t * 1.13);
  g += d2 * cos(dot(q, d2) * 3.1 - t * 0.87) * 0.75;
  g += d3 * cos(dot(q, d3) * 4.3 + t * 1.41) * 0.5;
  g += d4 * cos(dot(q, d4) * 5.9 - t * 1.07) * 0.35;
  return g;
}

fn chromeRrtOdtFit(v: vec3f) -> vec3f {
  let a = v * (v + vec3f(0.0245786)) - vec3f(0.000090537);
  let b = v * (vec3f(0.983729) * v + vec3f(0.4329510)) + vec3f(0.238081);
  return a / b;
}

fn chromeAces(colorIn: vec3f) -> vec3f {
  let inputMat = mat3x3f(
    vec3f(0.59719, 0.07600, 0.02840),
    vec3f(0.35458, 0.90834, 0.13383),
    vec3f(0.04823, 0.01566, 0.83777)
  );
  let outputMat = mat3x3f(
    vec3f(1.60475, -0.10208, -0.00327),
    vec3f(-0.53108, 1.10813, -0.07276),
    vec3f(-0.07367, -0.00605, 1.07602)
  );
  var color = inputMat * (colorIn / 0.6);
  color = chromeRrtOdtFit(color);
  color = outputMat * color;
  return clamp(color, vec3f(0.0), vec3f(1.0));
}

fn chromeToSrgb(cIn: vec3f) -> vec3f {
  let c = clamp(cIn, vec3f(0.0), vec3f(1.0));
  let lo = c * 12.92;
  let hi = 1.055 * pow(c, vec3f(1.0 / 2.4)) - vec3f(0.055);
  return select(hi, lo, c <= vec3f(0.0031308));
}

@vertex fn vs_main(
  @location(0) aPosition: vec3f,
  @location(1) aNormal: vec3f,
) -> VSOut {
  var out: VSOut;
  let world = params.model * vec4f(aPosition, 1.0);
  var clip = params.viewProjection * world;
  clip.z = clip.z * 0.5 + clip.w * 0.5;
  out.position = clip;
  out.worldPos = world.xyz;
  out.normal = normalize(params.normalMatrix * aNormal);
  out.objPos = (params.floatInverse * world).xyz;
  return out;
}

@fragment fn fs_main(in: VSOut, @builtin(front_facing) front: bool) -> @location(0) vec4f {
  var n = normalize(in.normal);
  n = select(-n, n, front);
  let v = normalize(params.cameraPosition - in.worldPos);

  let fm = params.floatMatrix;
  var g = mat3x3f(fm[0].xyz, fm[1].xyz, fm[2].xyz) * flowField(in.objPos * params.flowFrequency, params.time);
  g -= n * dot(g, n);
  n = normalize(n - g * params.flow * 0.24);

  let ndv = clamp(dot(n, v), 0.0, 1.0);
  let r = reflect(-v, n);
  let spread = length(fwidth(r));
  let soft = 0.012 + params.roughness * 0.55 + spread * 0.6;
  let softness = vec2f(soft + params.streaks * 0.4, soft);

  let side = n - v * dot(n, v);
  let spreadRgb = params.dispersion * (0.01 + 0.07 * (1.0 - ndv) * (1.0 - ndv));
  let env = vec3f(
    studio(normalize(r + side * spreadRgb), softness).r,
    studio(r, softness).g,
    studio(normalize(r - side * spreadRgb), softness).b
  );

  let fresnel = params.tint + (vec3f(1.0) - params.tint) * pow(1.0 - ndv, 5.0);
  let color = chromeAces(env * fresnel * params.environmentIntensity);
  return vec4f(chromeToSrgb(color), 1.0);
}`;

const COMPOSITE_SHADER = `
@group(0) @binding(0) var uScene: texture_2d<f32>;
@group(0) @binding(1) var uSampler: sampler;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  return textureSampleLevel(uScene, uSampler, uv, 0.0);
}`;

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
    shapes.push(...path.toShapes());
  }
  if (shapes.length === 0) {
    for (const path of parsed.paths) {
      shapes.push(...path.toShapes());
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

interface GpuMesh {
  mesh: THREE.Mesh;
  geo: Geometry;
  pass: Draw;
}

function readAttribute(
  attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined,
  index: number,
  item: 0 | 1 | 2,
): number {
  if (!attribute) return 0;
  if (item === 0) return attribute.getX(index);
  if (item === 1) return attribute.getY(index);
  return attribute.itemSize > 2 ? attribute.getZ(index) : 0;
}

function geometryDataFor(source: THREE.BufferGeometry): Float32Array<ArrayBuffer> | null {
  const position = source.getAttribute("position") as THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined;
  if (!position) return null;
  if (!source.getAttribute("normal")) source.computeVertexNormals();
  const normal = source.getAttribute("normal") as THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined;
  const index = source.index;
  const count = index ? index.count : position.count;
  const data = new Float32Array(new ArrayBuffer(count * 6 * 4));
  let o = 0;
  for (let i = 0; i < count; i++) {
    const vertex = index ? index.getX(i) : i;
    data[o++] = readAttribute(position, vertex, 0);
    data[o++] = readAttribute(position, vertex, 1);
    data[o++] = readAttribute(position, vertex, 2);
    data[o++] = readAttribute(normal, vertex, 0);
    data[o++] = readAttribute(normal, vertex, 1);
    data[o++] = readAttribute(normal, vertex, 2);
  }
  return data;
}

function srgbTuple(color: THREE.Color): [number, number, number] {
  const out = { r: 0, g: 0, b: 0 };
  color.getRGB(out, THREE.SRGBColorSpace);
  return [out.r, out.g, out.b];
}

export function createChromeObject(
  elements: ChromeObjectElements,
  options: ChromeObjectOptions = {},
): ChromeObjectInstance | null {
  if (!supportsWebGPU()) return null;
  const { canvas } = elements;
  const config: Required<ChromeObjectOptions> = { ...DEFAULTS, ...resolveOptions(DEFAULTS, options) };

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

  const chrome = new THREE.MeshBasicMaterial();

  let gpu: Gpu | null = null;
  let screen: Surface | null = null;
  let sceneTarget: Target | null = null;
  let compositeFx: Effect | null = null;
  let copySampler: GPUSampler | null = null;
  let gpuMeshes: GpuMesh[] = [];
  let fallback2d: CanvasRenderingContext2D | null = null;

  let model: THREE.Object3D | null = null;
  let modelMaxDim = 1;
  let assetSource: AssetSource | null = null;
  let builtDepth = -1;
  let builtBevel = -1;
  let loadedSrc: string | null = null;
  let loadToken = 0;
  let disposed = false;

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
    if (!gpu || !model) return;
    model.updateMatrixWorld(true);
    model.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      const data = geometryDataFor(mesh.geometry);
      if (!data || data.length === 0) return;
      const geo = geometry(gpu!, {
        buffers: [
          {
            data,
            attributes: {
              aPosition: "float32x3",
              aNormal: "float32x3",
            },
          },
        ],
        topology: "triangle-list",
        label: "chrome-object.mesh",
      });
      const pass = draw(gpu!, {
        shader: CHROME_SHADER,
        geometry: geo,
        cull: "none",
        depth: { compare: "less-equal", write: true },
        label: "chrome-object.chrome",
      });
      gpuMeshes.push({ mesh, geo, pass });
    });
  }

  function applyFit() {
    if (!model) return;
    fitGroup.scale.setScalar(config.scale / modelMaxDim);
  }

  function clearModel() {
    if (!model) return;
    disposeGpuMeshes();
    fitGroup.remove(model);
    disposeObject(model, chrome);
    model = null;
  }

  function clearAsset() {
    if (assetSource?.kind === "mesh") disposeObject(assetSource.scene, chrome);
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
          if (!material || material === chrome) continue;
          for (const value of Object.values(material)) {
            if (value instanceof THREE.Texture) value.dispose();
          }
          material.dispose();
        }
        mesh.material = chrome;
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
    mountModel(new THREE.Mesh(shapeGeometry, chrome));
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

  const scratchColor = new THREE.Color();
  const tint: [number, number, number] = [...SILVER];
  const highlight: [number, number, number] = [0, 0, 1];
  let clearColor: [number, number, number, number] = [0, 0, 0, 0];

  function applyOptions() {
    if (config.background) {
      scratchColor.set(config.background);
      clearColor = [...srgbTuple(scratchColor), 1];
    } else {
      clearColor = [0, 0, 0, 0];
    }
    controls.enableRotate = config.orbit;
    controls.enableZoom = config.zoom;
    controls.autoRotate = config.autoRotate && !reducedMotion;
    controls.autoRotateSpeed = config.autoRotateSpeed;
    camera.fov = fitFov(config.fov, camera.aspect);
    camera.updateProjectionMatrix();
    floatGroup.position.x = config.xOffset;
    floatGroup.position.y = MODEL_LIFT + config.yOffset;

    if (config.tint) {
      scratchColor.set(config.tint);
      tint[0] = scratchColor.r;
      tint[1] = scratchColor.g;
      tint[2] = scratchColor.b;
    } else {
      [tint[0], tint[1], tint[2]] = SILVER;
    }
    scratchColor.set(config.highlight || DEFAULTS.highlight);
    highlight[0] = scratchColor.r;
    highlight[1] = scratchColor.g;
    highlight[2] = scratchColor.b;

    applyFit();
    buildModel();
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
    if (sceneTarget && (sceneTarget.size[0] !== pixelWidth || sceneTarget.size[1] !== pixelHeight)) {
      sceneTarget.resize([pixelWidth, pixelHeight]);
      compositeFx?.set({ uScene: sceneTarget });
    }
    camera.aspect = width / height;
    camera.fov = fitFov(config.fov, camera.aspect);
    camera.updateProjectionMatrix();
  }

  const pointerTarget = new THREE.Vector2();
  const pointer = new THREE.Vector2();
  const envEuler = new THREE.Euler(0, 0, 0, "YXZ");
  const envMatrix = new THREE.Matrix4();
  const envRotation = new THREE.Matrix3();

  function onPointerMove(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    pointerTarget.set(
      THREE.MathUtils.clamp(((event.clientX - rect.left) / rect.width) * 2 - 1, -1, 1),
      THREE.MathUtils.clamp(((event.clientY - rect.top) / rect.height) * 2 - 1, -1, 1),
    );
  }

  function onPointerOut(event: PointerEvent) {
    if (!event.relatedTarget) pointerTarget.set(0, 0);
  }

  function onBlur() {
    pointerTarget.set(0, 0);
  }

  window.addEventListener("pointermove", onPointerMove, { passive: true });
  document.addEventListener("pointerout", onPointerOut, { passive: true });
  window.addEventListener("blur", onBlur);

  const observer = createCanvasResizeObserver(resize);
  observer.observe(canvas);

  let inView = true;
  let pageVisible =
    typeof document === "undefined" || document.visibilityState !== "hidden";
  let loopRunning = false;
  let raf = 0;
  let lastTime = 0;
  let elapsed = Math.random() * 100;
  let flowTime = Math.random() * 100;

  const viewProjection = new THREE.Matrix4();
  const normalMatrix = new THREE.Matrix3();
  const floatInverse = new THREE.Matrix4();

  function renderFallback() {
    if (!fallback2d) return;
    fallback2d.clearRect(0, 0, canvas.width, canvas.height);
    if (config.background) {
      fallback2d.fillStyle = config.background;
      fallback2d.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  function render() {
    if (!gpu || !screen || !sceneTarget || !compositeFx) return;
    const output = screen;
    const sceneColor = sceneTarget;
    const composite = compositeFx;
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    floatInverse.copy(floatGroup.matrixWorld).invert();

    const shared = {
      viewProjection: Array.from(viewProjection.elements),
      floatMatrix: Array.from(floatGroup.matrixWorld.elements),
      floatInverse: Array.from(floatInverse.elements),
      envRotation: Array.from(envRotation.elements),
      cameraPosition: [camera.position.x, camera.position.y, camera.position.z],
      time: flowTime,
      tint,
      flow: Math.max(config.flow, 0),
      highlight,
      flowFrequency: Math.max(config.flowScale, 0) / Math.max(config.scale, 1e-3),
      roughness: Math.min(Math.max(config.roughness, 0), 1),
      streaks: Math.min(Math.max(config.streaks, 0), 1),
      dispersion: Math.min(Math.max(config.dispersion, 0), 1),
      environmentIntensity: Math.max(config.environmentIntensity, 0),
    };

    gpuFrame(gpu, (f) => {
      f.pass({ target: sceneColor, clear: clearColor, clearDepth: 1 }, (pass) => {
        for (const part of gpuMeshes) {
          normalMatrix.getNormalMatrix(part.mesh.matrixWorld);
          part.pass.set({
            params: {
              ...shared,
              model: Array.from(part.mesh.matrixWorld.elements),
              normalMatrix: Array.from(normalMatrix.elements),
            },
          });
          pass.draw(part.pass);
        }
      });
      f.pass({ target: output, clear: [0, 0, 0, 0] }, composite);
    });
  }

  function tick(time: number) {
    if (disposed) return;
    if (!inView || !pageVisible) {
      lastTime = 0;
      stopLoop();
      return;
    }
    if (fallback2d) {
      renderFallback();
      stopLoop();
      return;
    }
    const delta = lastTime ? Math.min((time - lastTime) / 1000, 0.1) : 0;
    lastTime = time;
    controls.update();

    if (!reducedMotion) {
      elapsed += delta * config.floatSpeed;
      flowTime += delta * config.flowSpeed;
      floatGroup.rotation.x = (Math.cos(elapsed / 4) / 8) * config.rotationIntensity;
      floatGroup.rotation.y = (Math.sin(elapsed / 4) / 8) * config.rotationIntensity;
      floatGroup.rotation.z = (Math.sin(elapsed / 4) / 20) * config.rotationIntensity;
      floatGroup.position.y = MODEL_LIFT + config.yOffset + (Math.sin(elapsed / 1.5) / 10) * config.floatIntensity;
    }

    pointer.lerp(pointerTarget, 1 - Math.exp(-delta * 3));
    const influence = Math.max(config.cursorInfluence, 0);
    envEuler.set(pointer.y * influence * 0.25, pointer.x * influence * 0.5, 0);
    envMatrix.makeRotationFromEuler(envEuler);
    envRotation.setFromMatrix4(envMatrix);

    render();
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
    pageVisible = document.visibilityState !== "hidden";
    if (pageVisible) {
      lastTime = 0;
      startLoop();
    } else {
      stopLoop();
    }
  };
  document.addEventListener("visibilitychange", onVisibilityChange);

  acquireGpu()
    .then((device) => {
      if (disposed) return;
      gpu = device;
      screen = surface(gpu, canvas, {
        autoResize: false,
        alphaMode: "premultiplied",
        label: "chrome-object",
      });
      const width = Math.max(1, canvas.width);
      const height = Math.max(1, canvas.height);
      sceneTarget = target(gpu, {
        size: [width, height],
        format: "rgba8unorm",
        depth: "depth24plus",
        msaa: 4,
        label: "chrome-object.scene",
      });
      copySampler = sampler(gpu, {
        minFilter: "nearest",
        magFilter: "nearest",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
      });
      compositeFx = gpuEffect(gpu, COMPOSITE_SHADER, {
        set: { uScene: sceneTarget, uSampler: copySampler },
        label: "chrome-object.composite",
      });
      buildGpuMeshes();
      resize();
      startLoop();
    })
    .catch((error) => {
      if (disposed) return;
      console.warn("ChromeObject: WebGPU unavailable, showing fallback background.", error);
      fallback2d = canvas.getContext("2d");
      renderFallback();
    });

  resize();
  applyOptions();
  loadAsset();
  startLoop();

  return {
    setOptions(next: ChromeObjectOptions) {
      next = resolveOptions(DEFAULTS, next);
      let changed = false;
      for (const [key, value] of Object.entries(next)) {
        if (typeof value === "function") continue;
        if (config[key as keyof ChromeObjectOptions] !== value) {
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
      window.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerout", onPointerOut);
      window.removeEventListener("blur", onBlur);
      controls.dispose();
      clearAsset();
      disposeGpuMeshes();
      (sceneTarget as unknown as { destroy?: () => void } | null)?.destroy?.();
      screen?.dispose();
      draco.dispose();
      chrome.dispose();
    },
  };
}
