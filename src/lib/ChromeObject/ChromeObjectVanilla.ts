import { getCanvasPixelRatio, createCanvasResizeObserver } from "../canvas-viewport";
import { resolveOptions } from "../options";
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

const CHROME_VERTEX = `
uniform mat4 uFloatInverse;
out vec3 vWorldPos;
out vec3 vNormal;
out vec3 vObjPos;

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPos = world.xyz;
  vNormal = normalize(transpose(inverse(mat3(modelMatrix))) * normal);
  vObjPos = (uFloatInverse * world).xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const CHROME_FRAGMENT = `
precision highp float;

uniform mat4 uFloatMatrix;
uniform mat3 uEnvRotation;
uniform vec3 uTint;
uniform vec3 uHighlight;
uniform float uTime;
uniform float uFlow;
uniform float uFlowFrequency;
uniform float uRoughness;
uniform float uStreaks;
uniform float uDispersion;
uniform float uEnvironmentIntensity;

in vec3 vWorldPos;
in vec3 vNormal;
in vec3 vObjPos;

layout(location = 0) out highp vec4 fragColor;

const float C_PI = 3.14159265359;
const float C_TAU = 6.28318530718;

float wrapAngle(float a) {
  return a - C_TAU * floor((a + C_PI) / C_TAU);
}

float windowed(float x, float halfWidth, float soft) {
  return 1.0 - smoothstep(halfWidth - soft, halfWidth + soft, abs(x));
}

float softbox(float az, float el, vec4 rect, vec2 soft) {
  return windowed(wrapAngle(az - rect.x), rect.z, soft.x) * windowed(el - rect.y, rect.w, soft.y);
}

vec3 studio(vec3 dir, vec2 soft) {
  vec3 d = uEnvRotation * dir;
  float el = asin(clamp(d.y, -1.0, 1.0));
  float az = atan(d.x, d.z);
  float energy = 1.0 / (1.0 + 2.0 * (soft.x + soft.y));

  float ground = mix(0.03, 0.004, smoothstep(0.0, 1.0, -el));
  float sky = 0.026 + 0.05 * smoothstep(-0.1, 1.4, el);
  vec3 color = vec3(mix(ground, sky, smoothstep(-soft.y - 0.01, soft.y + 0.01, el)));

  color += vec3(0.92, 0.96, 1.0) * windowed(el - 0.02, 0.012, soft.y + 0.008) * 1.4 * energy;
  color += vec3(1.0) * smoothstep(0.87 - soft.y, 0.92 + soft.y, d.y) * 2.6 * energy;
  color += vec3(1.0, 0.98, 0.95) * softbox(az, el, vec4(-0.95, 0.34, 0.055, 0.5), soft) * 9.0 * energy;
  color += vec3(0.95, 0.98, 1.0) * softbox(az, el, vec4(1.12, 0.28, 0.04, 0.42), soft) * 6.0 * energy;
  color += vec3(1.0) * softbox(az, el, vec4(0.0, 0.2, 0.75, 0.32), soft + vec2(0.25)) * 0.22 * energy;
  color += vec3(1.0) * softbox(az, el, vec4(0.0, 0.42, 0.85, 0.05), soft) * 2.8 * energy;
  color += vec3(1.0) * softbox(az, el, vec4(0.0, 0.15, 0.7, 0.016), soft) * 1.8 * energy;
  color += vec3(1.0) * softbox(az, el, vec4(C_PI, 0.16, 1.1, 0.045), soft) * 4.0 * energy;
  color += uHighlight * softbox(az, el, vec4(2.25, -0.03, 0.42, 0.13), soft + vec2(0.06)) * 3.2 * energy;
  return color;
}

vec3 flowField(vec3 p, float t) {
  vec3 q = p + 0.5 * vec3(
    sin(p.y * 1.7 + t * 0.61),
    sin(p.z * 1.3 - t * 0.53),
    sin(p.x * 1.5 + t * 0.47)
  );
  vec3 g = vec3(0.0);
  vec3 d1 = vec3(0.802, 0.535, 0.267);
  vec3 d2 = vec3(-0.408, 0.816, 0.408);
  vec3 d3 = vec3(0.218, -0.436, 0.873);
  vec3 d4 = vec3(-0.667, -0.333, 0.667);
  g += d1 * cos(dot(q, d1) * 2.3 + t * 1.13);
  g += d2 * cos(dot(q, d2) * 3.1 - t * 0.87) * 0.75;
  g += d3 * cos(dot(q, d3) * 4.3 + t * 1.41) * 0.5;
  g += d4 * cos(dot(q, d4) * 5.9 - t * 1.07) * 0.35;
  return g;
}

vec3 chromeRrtOdtFit(vec3 v) {
  vec3 a = v * (v + 0.0245786) - 0.000090537;
  vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
  return a / b;
}

vec3 chromeAces(vec3 color) {
  mat3 inputMat = mat3(
    vec3(0.59719, 0.07600, 0.02840),
    vec3(0.35458, 0.90834, 0.13383),
    vec3(0.04823, 0.01566, 0.83777)
  );
  mat3 outputMat = mat3(
    vec3(1.60475, -0.10208, -0.00327),
    vec3(-0.53108, 1.10813, -0.07276),
    vec3(-0.07367, -0.00605, 1.07602)
  );
  color = inputMat * (color / 0.6);
  color = chromeRrtOdtFit(color);
  color = outputMat * color;
  return clamp(color, 0.0, 1.0);
}

vec3 chromeToSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055;
  return mix(hi, lo, vec3(lessThanEqual(c, vec3(0.0031308))));
}

void main() {
  vec3 n = normalize(vNormal);
  n = gl_FrontFacing ? n : -n;
  vec3 v = normalize(cameraPosition - vWorldPos);

  vec3 g = mat3(uFloatMatrix) * flowField(vObjPos * uFlowFrequency, uTime);
  g -= n * dot(g, n);
  n = normalize(n - g * uFlow * 0.24);

  float ndv = clamp(dot(n, v), 0.0, 1.0);
  vec3 r = reflect(-v, n);
  float spread = length(fwidth(r));
  float soft = 0.012 + uRoughness * 0.55 + spread * 0.6;
  vec2 softness = vec2(soft + uStreaks * 0.4, soft);

  vec3 side = n - v * dot(n, v);
  float spreadRgb = uDispersion * (0.01 + 0.07 * (1.0 - ndv) * (1.0 - ndv));
  vec3 env = vec3(
    studio(normalize(r + side * spreadRgb), softness).r,
    studio(r, softness).g,
    studio(normalize(r - side * spreadRgb), softness).b
  );

  vec3 fresnel = uTint + (1.0 - uTint) * pow(1.0 - ndv, 5.0);
  vec3 color = chromeAces(env * fresnel * uEnvironmentIntensity);
  fragColor = vec4(chromeToSrgb(color), 1.0);
}
`;

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

export function createChromeObject(
  elements: ChromeObjectElements,
  options: ChromeObjectOptions = {},
): ChromeObjectInstance | null {
  const { canvas } = elements;
  const config: Required<ChromeObjectOptions> = { ...DEFAULTS, ...resolveOptions(DEFAULTS, options) };

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance",
    });
  } catch {
    return null;
  }
  renderer.toneMapping = THREE.NoToneMapping;

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

  const chrome = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: CHROME_VERTEX,
    fragmentShader: CHROME_FRAGMENT,
    side: THREE.DoubleSide,
    toneMapped: false,
    uniforms: {
      uFloatMatrix: { value: new THREE.Matrix4() },
      uFloatInverse: { value: new THREE.Matrix4() },
      uEnvRotation: { value: new THREE.Matrix3() },
      uTint: { value: new THREE.Vector3(...SILVER) },
      uHighlight: { value: new THREE.Vector3(0, 0, 1) },
      uTime: { value: 0 },
      uFlow: { value: 0 },
      uFlowFrequency: { value: 1 },
      uRoughness: { value: 0 },
      uStreaks: { value: 0 },
      uDispersion: { value: 0 },
      uEnvironmentIntensity: { value: 1 },
    },
  });
  const uniforms = chrome.uniforms;

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

  function applyFit() {
    if (!model) return;
    fitGroup.scale.setScalar(config.scale / modelMaxDim);
  }

  function clearModel() {
    if (!model) return;
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
  }

  function buildModel() {
    if (!assetSource) return;
    if (assetSource.kind === "mesh") {
      if (model) return;
      assetSource.scene.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) return;
        const materials = Array.isArray(mesh.material)
          ? mesh.material
          : [mesh.material];
        for (const material of materials) {
          if (!material || material === chrome) continue;
          for (const value of Object.values(material)) {
            if (value instanceof THREE.Texture) value.dispose();
          }
          material.dispose();
        }
        mesh.material = chrome;
        if (!mesh.geometry.getAttribute("normal")) {
          mesh.geometry.computeVertexNormals();
        }
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
    let geometry: THREE.BufferGeometry = new THREE.ExtrudeGeometry(shapes, {
      depth: Math.max(depthUnits - bevelAmount * 2, depthUnits * 0.1),
      bevelEnabled: bevelAmount > 1e-4,
      bevelThickness: bevelAmount,
      bevelSize: bevelAmount * 0.9,
      bevelOffset: 0,
      bevelSegments: 12,
      curveSegments: 24,
    });
    geometry = toCreasedNormals(geometry, Math.PI / 7);
    flattenCapNormals(geometry);
    geometry.rotateX(Math.PI);
    mountModel(new THREE.Mesh(geometry, chrome));
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

  const backgroundColor = new THREE.Color();
  const scratchColor = new THREE.Color();

  function applyOptions() {
    if (config.background) {
      backgroundColor.set(config.background);
      renderer.setClearColor(backgroundColor, 1);
    } else {
      renderer.setClearColor(0x000000, 0);
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
      uniforms.uTint.value.set(scratchColor.r, scratchColor.g, scratchColor.b);
    } else {
      uniforms.uTint.value.set(...SILVER);
    }
    scratchColor.set(config.highlight || DEFAULTS.highlight);
    uniforms.uHighlight.value.set(scratchColor.r, scratchColor.g, scratchColor.b);
    uniforms.uFlow.value = Math.max(config.flow, 0);
    uniforms.uFlowFrequency.value = Math.max(config.flowScale, 0) / Math.max(config.scale, 1e-3);
    uniforms.uRoughness.value = Math.min(Math.max(config.roughness, 0), 1);
    uniforms.uStreaks.value = Math.min(Math.max(config.streaks, 0), 1);
    uniforms.uDispersion.value = Math.min(Math.max(config.dispersion, 0), 1);
    uniforms.uEnvironmentIntensity.value = Math.max(config.environmentIntensity, 0);

    applyFit();
    buildModel();
  }

  function resize() {
    const width = Math.max(canvas.clientWidth, 1);
    const height = Math.max(canvas.clientHeight, 1);
    const pr = getCanvasPixelRatio(canvas, renderer.getContext());
    renderer.setPixelRatio(pr);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.fov = fitFov(config.fov, camera.aspect);
    camera.updateProjectionMatrix();
  }

  const pointerTarget = new THREE.Vector2();
  const pointer = new THREE.Vector2();
  const envEuler = new THREE.Euler(0, 0, 0, "YXZ");
  const envMatrix = new THREE.Matrix4();

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
  resize();
  applyOptions();
  loadAsset();

  let inView = true;
  let pageVisible =
    typeof document === "undefined" || document.visibilityState !== "hidden";
  let loopRunning = false;
  let lastTime = 0;
  let elapsed = Math.random() * 100;
  let flowTime = Math.random() * 100;

  function tick(time: number) {
    if (!inView || !pageVisible) {
      lastTime = 0;
      stopLoop();
      return;
    }
    const delta = lastTime ? Math.min((time - lastTime) / 1000, 0.1) : 0;
    lastTime = time;
    controls.update();

    if (!reducedMotion) {
      elapsed += delta * config.floatSpeed;
      flowTime += delta * config.flowSpeed;
      floatGroup.rotation.x =
        (Math.cos(elapsed / 4) / 8) * config.rotationIntensity;
      floatGroup.rotation.y =
        (Math.sin(elapsed / 4) / 8) * config.rotationIntensity;
      floatGroup.rotation.z =
        (Math.sin(elapsed / 4) / 20) * config.rotationIntensity;
      floatGroup.position.y =
        MODEL_LIFT +
        config.yOffset +
        (Math.sin(elapsed / 1.5) / 10) * config.floatIntensity;
    }

    pointer.lerp(pointerTarget, 1 - Math.exp(-delta * 3));
    const influence = Math.max(config.cursorInfluence, 0);
    envEuler.set(pointer.y * influence * 0.25, pointer.x * influence * 0.5, 0);
    envMatrix.makeRotationFromEuler(envEuler);
    uniforms.uEnvRotation.value.setFromMatrix4(envMatrix);

    scene.updateMatrixWorld();
    uniforms.uFloatMatrix.value.copy(floatGroup.matrixWorld);
    uniforms.uFloatInverse.value.copy(floatGroup.matrixWorld).invert();
    uniforms.uTime.value = flowTime;

    renderer.render(scene, camera);
  }

  function startLoop() {
    if (loopRunning || !inView || !pageVisible || disposed) return;
    loopRunning = true;
    renderer.setAnimationLoop(tick);
  }

  function stopLoop() {
    if (!loopRunning) return;
    loopRunning = false;
    renderer.setAnimationLoop(null);
  }

  const viewObserver =
    typeof IntersectionObserver !== "undefined"
      ? new IntersectionObserver((entries) => {
          inView = entries[entries.length - 1]?.isIntersecting ?? true;
          if (inView) {
            startLoop();
          } else {
            stopLoop();
          }
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
      draco.dispose();
      chrome.dispose();
      renderer.dispose();
    },
  };
}
