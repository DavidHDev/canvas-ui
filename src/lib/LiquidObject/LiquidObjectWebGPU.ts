import { getCanvasPixelRatio, createCanvasResizeObserver } from "../canvas-viewport";
import {
  draw,
  effect as gpuEffect,
  frame as gpuFrame,
  geometry,
  init,
  sampler,
  surface as makeSurface,
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

export interface LiquidObjectOptions {
  /** URL of the asset to display: GLB/glTF, SVG, PNG, JPEG, WebP, or GIF. Object URLs from a file input work too. The format is sniffed from the bytes, not the extension. */
  src?: string;
  /** How far the liquid drags the object as it flows. */
  distortion?: number;
  /** Strength of the chromatic lens fringe in a soft radius around the cursor. */
  aberration?: number;
  /** Amount of animated film grain. Subtle across the frame, strongest inside the cursor lens. */
  grain?: number;
  /** Brightness of the light glinting off the moving liquid. */
  sheen?: number;
  /** Size of the area the cursor disturbs. */
  cursorSize?: number;
  /** How hard the cursor pushes the liquid. */
  cursorForce?: number;
  /** How long the ripples keep flowing after the cursor stops. */
  persistence?: number;
  /** How much the flow curls into swirls and eddies. */
  swirl?: number;
  /** Strength of the rainbow shimmer that appears where the liquid flows. */
  iridescence?: number;
  /** Strength of the liquid burst fired when the canvas is clicked or tapped (0 disables). */
  splash?: number;
  /** Amount of slow idle drift that keeps the surface alive while the cursor is away. */
  ambient?: number;
  /** How much the object tilts and bounces like jelly in response to the cursor. */
  wobble?: number;
  /** Surface finish of extruded 2D assets, from matte to mirror. Models keep their own materials. */
  gloss?: number;
  /** How metallic the asset reads. 0 keeps the original material finish, 1 turns it to polished metal. */
  metallic?: number;
  /** Tint multiplied over the asset colors. Empty string keeps the original colors. */
  tint?: string;
  /** Extrusion depth of 2D assets (SVG or image) as a fraction of their longest side. */
  depth?: number;
  /** Edge rounding of extruded 2D assets (0 to 1). Higher values melt the edges into a liquid lip. */
  bevel?: number;
  /** Accent color of the ring light in the studio environment. */
  highlight?: string;
  /** Brightness of the studio environment lighting. */
  environmentIntensity?: number;
  /** Brightness multiplier applied to the final image. */
  brightness?: number;
  /** Color saturation of the final image. 1 keeps the original colors, 0 is grayscale. */
  saturation?: number;
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

export interface LiquidObjectElements {
  canvas: HTMLCanvasElement;
}

export interface LiquidObjectInstance {
  setOptions: (options: LiquidObjectOptions) => void;
  resize: () => void;
  destroy: () => void;
}

const DEFAULTS: Required<LiquidObjectOptions> = {
  src: "",
  distortion: 2,
  aberration: 0.75,
  grain: 1,
  sheen: 1.6,
  cursorSize: 1,
  cursorForce: 1,
  persistence: 0.6,
  swirl: 0.5,
  iridescence: 1.5,
  splash: 1.2,
  ambient: 1,
  wobble: 0,
  gloss: 0.65,
  metallic: 0.15,
  tint: "",
  depth: 0.05,
  bevel: 0.5,
  highlight: "#ffffff",
  environmentIntensity: 1,
  brightness: 1,
  saturation: 1.2,
  background: "",
  scale: 3,
  xOffset: 0,
  yOffset: -0.2,
  floatIntensity: 1,
  rotationIntensity: 0.5,
  floatSpeed: 1.5,
  orbit: true,
  zoom: false,
  autoRotate: false,
  autoRotateSpeed: 2,
  fov: 60,
  cameraDistance: 4,
  dracoDecoderPath: "https://www.gstatic.com/draco/versioned/decoders/1.5.7/",
  onLoad: null,
  onError: null,
};

const SIM_RES = 128;
const FIELD_RES = 256;
const PRESSURE_STEPS = 4;
const SIM_STEP = 1 / 60;
const ENV_WIDTH = 128;
const ENV_HEIGHT = 64;
const ENV_LEVELS = 6;

const CAMERA_DIR = new THREE.Vector3(0, -1, 4).normalize();

function fitFov(fov: number, aspect: number): number {
  if (aspect >= 1) return fov;
  const half = THREE.MathUtils.degToRad(fov) / 2;
  const margin = 1 + 0.25 * (1 - aspect);
  return THREE.MathUtils.radToDeg(2 * Math.atan((Math.tan(half) * margin) / aspect));
}
const MODEL_LIFT = 0.3;
const RASTER_SIZE = 256;
const TEXTURE_SIZE = 512;
const ALPHA_THRESHOLD = 64;

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

function rasterizeImage(blob: Blob, size = RASTER_SIZE): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      const width = image.naturalWidth || 1024;
      const height = image.naturalHeight || 1024;
      const ratio = Math.min(1, size / Math.max(width, height));
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
  let opaque = 0;
  for (let i = 0; i < width * height; i++) {
    const on = data.data[i * 4 + 3] >= ALPHA_THRESHOLD ? 1 : 0;
    mask[i] = on;
    opaque += on;
  }

  if (opaque / (width * height) > 0.97) {
    return [
      new THREE.Shape([
        new THREE.Vector2(0, 0),
        new THREE.Vector2(width, 0),
        new THREE.Vector2(width, height),
        new THREE.Vector2(0, height),
      ]),
    ];
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

function mapShapeUvs(
  geometry: THREE.BufferGeometry,
  bounds: { spanX: number; spanY: number } | null,
) {
  let minX = 0;
  let minY = 0;
  let spanX: number;
  let spanY: number;
  if (bounds) {
    spanX = Math.max(bounds.spanX, 1e-6);
    spanY = Math.max(bounds.spanY, 1e-6);
  } else {
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    if (!box) return;
    minX = box.min.x;
    minY = box.min.y;
    spanX = Math.max(box.max.x - box.min.x, 1e-6);
    spanY = Math.max(box.max.y - box.min.y, 1e-6);
  }
  const position = geometry.getAttribute("position");
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) {
    uv[i * 2] = (position.getX(i) - minX) / spanX;
    uv[i * 2 + 1] = (position.getY(i) - minY) / spanY;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

function bleedColors(data: ImageData) {
  const { width, height } = data;
  const px = data.data;
  const total = width * height;
  const queue = new Int32Array(total);
  const seen = new Uint8Array(total);
  const filled = new Uint8Array(total);
  const seeds = new Uint8Array(total);
  let head = 0;
  let tail = 0;
  for (let i = 0; i < total; i++) {
    if (px[i * 4 + 3] > 8) {
      queue[tail++] = i;
      seen[i] = 1;
      filled[i] = 1;
      seeds[i] = 1;
    }
  }
  if (tail === 0 || tail === total) return;
  while (head < tail) {
    const index = queue[head++];
    const x = index % width;
    const y = (index / width) | 0;
    if (!filled[index]) {
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          if (ox === 0 && oy === 0) continue;
          const nx = x + ox;
          const ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const ni = ny * width + nx;
          if (!filled[ni]) continue;
          const from = ni * 4;
          r += px[from];
          g += px[from + 1];
          b += px[from + 2];
          count++;
        }
      }
      if (count > 0) {
        const to = index * 4;
        px[to] = r / count;
        px[to + 1] = g / count;
        px[to + 2] = b / count;
      }
      filled[index] = 1;
    }
    for (let n = 0; n < 4; n++) {
      const nx = n === 0 ? x - 1 : n === 1 ? x + 1 : x;
      const ny = n === 2 ? y - 1 : n === 3 ? y + 1 : y;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const neighbor = ny * width + nx;
      if (seen[neighbor]) continue;
      seen[neighbor] = 1;
      queue[tail++] = neighbor;
    }
  }
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const index = y * width + x;
        if (seeds[index]) continue;
        let r = 0;
        let g = 0;
        let b = 0;
        let count = 0;
        for (let oy = -1; oy <= 1; oy++) {
          for (let ox = -1; ox <= 1; ox++) {
            const nx = x + ox;
            const ny = y + oy;
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const from = (ny * width + nx) * 4;
            r += px[from];
            g += px[from + 1];
            b += px[from + 2];
            count++;
          }
        }
        const to = index * 4;
        px[to] = r / count;
        px[to + 1] = g / count;
        px[to + 2] = b / count;
      }
    }
  }
  for (let i = 0; i < total; i++) px[i * 4 + 3] = 255;
}

function textureFromImageData(data: ImageData): THREE.Texture {
  bleedColors(data);
  const canvas = document.createElement("canvas");
  canvas.width = data.width;
  canvas.height = data.height;
  const ctx = canvas.getContext("2d");
  if (ctx) ctx.putImageData(data, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = false;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

interface MeshSource {
  kind: "mesh";
  scene: THREE.Group;
}

interface ShapeSource {
  kind: "shapes";
  shapes: THREE.Shape[];
  texture: THREE.Texture | null;
  uvSpan: { spanX: number; spanY: number } | null;
}

type AssetSource = MeshSource | ShapeSource;

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

const SPLAT_SHADER = `
struct SplatParams {
  point: vec2f,
  value: vec3f,
  radius: f32,
  aspect: f32,
}

@group(0) @binding(0) var<uniform> params: SplatParams;
@group(0) @binding(1) var tTarget: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  var d = uv - params.point;
  d.x *= params.aspect;
  let fall = exp(-dot(d, d) / max(params.radius, 0.00001));
  return vec4f(textureSampleLevel(tTarget, uSampler, uv, 0.0).xyz + params.value * fall, 1.0);
}`;

const CURL_SHADER = `
struct TexelParams { texel: vec2f }
@group(0) @binding(0) var<uniform> params: TexelParams;
@group(0) @binding(1) var tVelocity: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let l = textureSampleLevel(tVelocity, uSampler, uv - vec2f(params.texel.x, 0.0), 0.0).y;
  let r = textureSampleLevel(tVelocity, uSampler, uv + vec2f(params.texel.x, 0.0), 0.0).y;
  let b = textureSampleLevel(tVelocity, uSampler, uv - vec2f(0.0, params.texel.y), 0.0).x;
  let t = textureSampleLevel(tVelocity, uSampler, uv + vec2f(0.0, params.texel.y), 0.0).x;
  return vec4f((r - l - t + b) * 0.5, 0.0, 0.0, 1.0);
}`;

const VORTICITY_SHADER = `
struct VorticityParams {
  texel: vec2f,
  curl: f32,
  dt: f32,
}
@group(0) @binding(0) var<uniform> params: VorticityParams;
@group(0) @binding(1) var tVelocity: texture_2d<f32>;
@group(0) @binding(2) var tCurl: texture_2d<f32>;
@group(0) @binding(3) var uSampler: sampler;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let l = textureSampleLevel(tCurl, uSampler, uv - vec2f(params.texel.x, 0.0), 0.0).x;
  let r = textureSampleLevel(tCurl, uSampler, uv + vec2f(params.texel.x, 0.0), 0.0).x;
  let b = textureSampleLevel(tCurl, uSampler, uv - vec2f(0.0, params.texel.y), 0.0).x;
  let t = textureSampleLevel(tCurl, uSampler, uv + vec2f(0.0, params.texel.y), 0.0).x;
  let c = textureSampleLevel(tCurl, uSampler, uv, 0.0).x;
  var force = vec2f(abs(t) - abs(b), abs(r) - abs(l)) * 0.5;
  force = force / (length(force) + 0.0001);
  force *= params.curl * c;
  force.y *= -1.0;
  let v = textureSampleLevel(tVelocity, uSampler, uv, 0.0).xy + force * params.dt;
  return vec4f(clamp(v, vec2f(-600.0), vec2f(600.0)), 0.0, 1.0);
}`;

const DIVERGENCE_SHADER = `
struct TexelParams { texel: vec2f }
@group(0) @binding(0) var<uniform> params: TexelParams;
@group(0) @binding(1) var tVelocity: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let l = textureSampleLevel(tVelocity, uSampler, uv - vec2f(params.texel.x, 0.0), 0.0).x;
  let r = textureSampleLevel(tVelocity, uSampler, uv + vec2f(params.texel.x, 0.0), 0.0).x;
  let b = textureSampleLevel(tVelocity, uSampler, uv - vec2f(0.0, params.texel.y), 0.0).y;
  let t = textureSampleLevel(tVelocity, uSampler, uv + vec2f(0.0, params.texel.y), 0.0).y;
  return vec4f((r - l + t - b) * 0.5, 0.0, 0.0, 1.0);
}`;

const PRESSURE_SHADER = `
struct TexelParams { texel: vec2f }
@group(0) @binding(0) var<uniform> params: TexelParams;
@group(0) @binding(1) var tPressure: texture_2d<f32>;
@group(0) @binding(2) var tDivergence: texture_2d<f32>;
@group(0) @binding(3) var uSampler: sampler;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let l = textureSampleLevel(tPressure, uSampler, uv - vec2f(params.texel.x, 0.0), 0.0).x;
  let r = textureSampleLevel(tPressure, uSampler, uv + vec2f(params.texel.x, 0.0), 0.0).x;
  let b = textureSampleLevel(tPressure, uSampler, uv - vec2f(0.0, params.texel.y), 0.0).x;
  let t = textureSampleLevel(tPressure, uSampler, uv + vec2f(0.0, params.texel.y), 0.0).x;
  let d = textureSampleLevel(tDivergence, uSampler, uv, 0.0).x;
  return vec4f((l + r + b + t - d) * 0.25, 0.0, 0.0, 1.0);
}`;

const GRADIENT_SHADER = `
struct TexelParams { texel: vec2f }
@group(0) @binding(0) var<uniform> params: TexelParams;
@group(0) @binding(1) var tPressure: texture_2d<f32>;
@group(0) @binding(2) var tVelocity: texture_2d<f32>;
@group(0) @binding(3) var uSampler: sampler;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let l = textureSampleLevel(tPressure, uSampler, uv - vec2f(params.texel.x, 0.0), 0.0).x;
  let r = textureSampleLevel(tPressure, uSampler, uv + vec2f(params.texel.x, 0.0), 0.0).x;
  let b = textureSampleLevel(tPressure, uSampler, uv - vec2f(0.0, params.texel.y), 0.0).x;
  let t = textureSampleLevel(tPressure, uSampler, uv + vec2f(0.0, params.texel.y), 0.0).x;
  let v = textureSampleLevel(tVelocity, uSampler, uv, 0.0).xy - vec2f(r - l, t - b) * 0.5;
  return vec4f(v, 0.0, 1.0);
}`;

const ADVECT_SHADER = `
struct AdvectParams {
  texel: vec2f,
  dt: f32,
  dissipation: f32,
}
@group(0) @binding(0) var<uniform> params: AdvectParams;
@group(0) @binding(1) var tVelocity: texture_2d<f32>;
@group(0) @binding(2) var tSource: texture_2d<f32>;
@group(0) @binding(3) var uSampler: sampler;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let coord = uv - params.dt * textureSampleLevel(tVelocity, uSampler, uv, 0.0).xy * params.texel;
  return textureSampleLevel(tSource, uSampler, coord, 0.0) * params.dissipation;
}`;

const FADE_SHADER = `
struct FadeParams { fade: f32 }
@group(0) @binding(0) var<uniform> params: FadeParams;
@group(0) @binding(1) var tSource: texture_2d<f32>;
@group(0) @binding(2) var uSampler: sampler;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  return textureSampleLevel(tSource, uSampler, uv, 0.0) * params.fade;
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

const MODEL_SHADER = `
const PI = 3.14159265359;
const ENV_LEVELS = 6.0;
const ENV_ROWS = 64.0;

struct ModelParams {
  sh: array<vec4f, 9>,
  viewProjection: mat4x4f,
  model: mat4x4f,
  normalMatrix: mat3x3f,
  cameraPosition: vec3f,
  baseColor: vec3f,
  metalness: f32,
  tint: vec3f,
  roughness: f32,
  highlight: vec3f,
  environmentIntensity: f32,
  emissive: vec3f,
  hasMap: f32,
  opacity: f32,
  alphaTest: f32,
}

struct VSOut {
  @builtin(position) position: vec4f,
  @location(0) worldPos: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
  @location(3) color: vec4f,
}

@group(0) @binding(0) var<uniform> params: ModelParams;
@group(0) @binding(1) var uMap: texture_2d<f32>;
@group(0) @binding(2) var uMapSampler: sampler;
@group(0) @binding(3) var uEnv: texture_2d<f32>;
@group(0) @binding(4) var uEnvSampler: sampler;

fn srgbToLinear(c: vec3f) -> vec3f {
  let lo = c / 12.92;
  let hi = pow(max((c + vec3f(0.055)) / 1.055, vec3f(0.0)), vec3f(2.4));
  return select(hi, lo, c <= vec3f(0.04045));
}

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

@vertex fn vs_main(
  @location(0) aPosition: vec3f,
  @location(1) aNormal: vec3f,
  @location(2) aUv: vec2f,
  @location(3) aColor: vec4f,
) -> VSOut {
  var out: VSOut;
  let world = params.model * vec4f(aPosition, 1.0);
  var clip = params.viewProjection * world;
  clip.z = clip.z * 0.5 + clip.w * 0.5;
  out.position = clip;
  out.worldPos = world.xyz;
  out.normal = normalize(params.normalMatrix * aNormal);
  out.uv = aUv;
  out.color = aColor;
  return out;
}

@fragment fn fs_main(in: VSOut, @builtin(front_facing) front: bool) -> @location(0) vec4f {
  var tex = textureSampleLevel(uMap, uMapSampler, in.uv, 0.0);
  var albedo = params.baseColor * params.tint * in.color.rgb;
  var alpha = params.opacity * in.color.a;
  if (params.hasMap > 0.5) {
    albedo *= srgbToLinear(tex.rgb);
    alpha *= tex.a;
  }
  if (alpha <= params.alphaTest) { discard; }

  var n = normalize(in.normal);
  if (!front) { n = -n; }
  let v = normalize(params.cameraPosition - in.worldPos);
  let ndv = max(dot(n, v), 0.0001);
  let rough = clamp(params.roughness, 0.0, 1.0);
  let metal = clamp(params.metalness, 0.0, 1.0);

  let diffuseColor = albedo * (1.0 - metal);
  let specularColor = mix(vec3f(0.04), albedo, vec3f(metal));
  let irradiance = shIrradiance(n) * params.environmentIntensity;
  let radiance = envRadiance(reflect(-v, n), rough) * params.environmentIntensity;

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
  color = max(color, vec3f(0.0));
  return vec4f(color * alpha, alpha);
}`

const COMPOSITE_SHADER = `
struct CompositeParams {
  fieldTexel: vec2f,
  cursor: vec2f,
  background: vec3f,
  distortion: f32,
  aberration: f32,
  grain: f32,
  lensRadius: f32,
  glow: f32,
  aspect: f32,
  sheen: f32,
  iridescence: f32,
  ambient: f32,
  time: f32,
  hasBackground: f32,
  exposure: f32,
  brightness: f32,
  saturation: f32,
}

@group(0) @binding(0) var<uniform> params: CompositeParams;
@group(0) @binding(1) var tScene: texture_2d<f32>;
@group(0) @binding(2) var tField: texture_2d<f32>;
@group(0) @binding(3) var uSampler: sampler;

fn neutral(inputColor: vec3f) -> vec3f {
  let startCompression = 0.76;
  let desaturation = 0.15;
  var color = inputColor;
  let x = min(color.r, min(color.g, color.b));
  let offset = select(0.04, x - 6.25 * x * x, x < 0.08);
  color -= vec3f(offset);
  let peak = max(color.r, max(color.g, color.b));
  if (peak < startCompression) { return color; }
  let d = 1.0 - startCompression;
  let newPeak = 1.0 - d * d / (peak + d - startCompression);
  color *= newPeak / peak;
  let g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
  return mix(color, vec3f(newPeak), g);
}

fn toSrgb(c: vec3f) -> vec3f {
  let lo = c * 12.92;
  let hi = 1.055 * pow(max(c, vec3f(0.0)), vec3f(0.41666)) - 0.055;
  return select(hi, lo, c <= vec3f(0.0031308));
}

fn unpremultiply(c: vec4f) -> vec4f {
  return vec4f(c.rgb / max(c.a, 0.0001), c.a);
}

@fragment fn fs_main(@location(0) uv: vec2f, @builtin(position) frag: vec4f) -> @location(0) vec4f {
  let flow = textureSampleLevel(tField, uSampler, uv, 0.0).xy;
  let drift = vec2f(
    sin(uv.y * 9.0 + params.time * 0.7) + sin(uv.y * 21.0 - params.time * 1.1) * 0.6,
    sin(uv.x * 8.0 - params.time * 0.6) + sin(uv.x * 17.0 + params.time * 0.9) * 0.6
  );
  let push = flow * params.distortion * 0.001 + drift * params.ambient * 0.0016;
  let lx = length(textureSampleLevel(tField, uSampler, uv - vec2f(params.fieldTexel.x, 0.0), 0.0).xy);
  let rx = length(textureSampleLevel(tField, uSampler, uv + vec2f(params.fieldTexel.x, 0.0), 0.0).xy);
  let by = length(textureSampleLevel(tField, uSampler, uv - vec2f(0.0, params.fieldTexel.y), 0.0).xy);
  let ty = length(textureSampleLevel(tField, uSampler, uv + vec2f(0.0, params.fieldTexel.y), 0.0).xy);
  let grad = vec2f(rx - lx, ty - by);
  let toCursor = (uv - params.cursor) * vec2f(params.aspect, 1.0);
  let lens = smoothstep(params.lensRadius, params.lensRadius * 0.15, length(toCursor)) * params.glow;
  let spread = normalize(toCursor + vec2f(0.00001)) * (lens * params.aberration * 0.006) / vec2f(params.aspect, 1.0);
  let sr = unpremultiply(textureSampleLevel(tScene, uSampler, uv - push - spread, 0.0));
  let sg = unpremultiply(textureSampleLevel(tScene, uSampler, uv - push, 0.0));
  let sb = unpremultiply(textureSampleLevel(tScene, uSampler, uv - push + spread, 0.0));
  let alpha = (sr.a + sg.a + sb.a) / 3.0;
  var color = vec3f(sr.r, sg.g, sb.b);
  let normal = normalize(vec3f(-grad * 0.3, 1.0));
  let spec = pow(max(dot(normal, normalize(vec3f(-0.4, 0.55, 0.73))), 0.0), 16.0);
  color += spec * params.sheen * 2.5 * alpha;
  let energy = length(flow);
  let rim = length(grad);
  let wave = smoothstep(0.4, 8.0, rim + energy * 0.12) * alpha;
  let shimmer = 0.5 + 0.5 * cos(vec3f(0.0, 2.094, 4.188) + energy * 0.045 + (grad.x - grad.y) * 0.1 + params.time * 0.6);
  color += shimmer * wave * params.iridescence * 0.5;
  color = clamp(neutral(color * params.exposure * params.brightness), vec3f(0.0), vec3f(1.0));
  let gray = dot(color, vec3f(0.2126, 0.7152, 0.0722));
  color = max(mix(vec3f(gray), color, params.saturation), vec3f(0.0));
  color = toSrgb(color);
  var blended = color * alpha + params.background * (1.0 - alpha) * params.hasBackground;
  let grainMask = mix(alpha, 1.0, params.hasBackground);
  let grainN = fract(sin(dot(frag.xy + vec2f(params.time * 127.1, params.time * 311.7), vec2f(12.9898, 78.233))) * 43758.5453);
  blended += (grainN - 0.5) * params.grain * (0.35 + 0.65 * lens) * 0.14 * grainMask;
  return vec4f(max(blended, vec3f(0.0)), mix(alpha, 1.0, params.hasBackground));
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

interface MaterialState {
  material: THREE.Material | null;
  baseColor: THREE.Color;
  metalness: number;
  roughness: number;
  opacity: number;
  alphaTest: number;
  emissive: THREE.Color;
  map: THREE.Texture | null;
}

interface GpuMesh {
  mesh: THREE.Mesh;
  geo: Geometry;
  pass: Draw;
  material: MaterialState;
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
  gpu.gpu.queue.writeTexture({ texture: tex.gpu }, new Uint8Array(rgba), { bytesPerRow: 4 }, [1, 1]);
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
  if (!attribute) return 0;
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
  const color = source.getAttribute("color") as THREE.BufferAttribute | THREE.InterleavedBufferAttribute | undefined;
  const index = source.index;
  const start = group?.start ?? 0;
  const count = group?.count ?? (index ? index.count : position.count);
  const data = new Float32Array(new ArrayBuffer(count * 12 * 4));
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
    data[o++] = color ? readAttribute(color, vertex, 0) : 1;
    data[o++] = color ? readAttribute(color, vertex, 1) : 1;
    data[o++] = color ? readAttribute(color, vertex, 2) : 1;
    data[o++] = color && color.itemSize >= 4 ? color.getW(vertex) : 1;
  }
  return data;
}

function materialStateFor(material: THREE.Material | null, fallbackMap: THREE.Texture | null): MaterialState {
  const standard = material as THREE.MeshStandardMaterial | null;
  return {
    material,
    baseColor: standard?.color ? standard.color.clone() : new THREE.Color(1, 1, 1),
    metalness: typeof standard?.metalness === "number" ? standard.metalness : 0,
    roughness: typeof standard?.roughness === "number" ? standard.roughness : 0.5,
    opacity: typeof material?.opacity === "number" ? material.opacity : 1,
    alphaTest: typeof material?.alphaTest === "number" ? material.alphaTest : 0,
    emissive: standard?.emissive ? standard.emissive.clone() : new THREE.Color(0, 0, 0),
    map: (standard?.map as THREE.Texture | null | undefined) ?? fallbackMap,
  };
}

export function createLiquidObject(
  elements: LiquidObjectElements,
  options: LiquidObjectOptions = {},
): LiquidObjectInstance | null {
  if (!supportsWebGPU()) return null;
  const { canvas } = elements;
  const config: Required<LiquidObjectOptions> = { ...DEFAULTS, ...resolveOptions(DEFAULTS, options) };

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

  const surfaceMaterial = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    metalness: 0,
    roughness: 0.35,
  });

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

  let gpu: Gpu | null = null;
  let screen: Surface | null = null;
  let sceneTarget: Target | null = null;
  let velocity: [Target, Target] | null = null;
  let pressure: [Target, Target] | null = null;
  let field: [Target, Target] | null = null;
  let divergence: Target | null = null;
  let curl: Target | null = null;
  let linearSampler: GPUSampler | null = null;
  let whiteTexture: Texture | null = null;
  let splatFx: Effect | null = null;
  let curlFx: Effect | null = null;
  let vorticityFx: Effect | null = null;
  let divergenceFx: Effect | null = null;
  let pressureFx: Effect | null = null;
  let gradientFx: Effect | null = null;
  let advectFx: Effect | null = null;
  let fadeFx: Effect | null = null;
  let compositeFx: Effect | null = null;
  let envAtlas: Target | null = null;
  let envSampler: GPUSampler | null = null;
  let envSh: [number, number, number, number][] = [];
  let gpuMeshes: GpuMesh[] = [];
  let gpuMeshesDirty = true;
  const textureCache = new Map<THREE.Texture, Texture>();
  let fallback2d: CanvasRenderingContext2D | null = null;

  const viewProjection = new THREE.Matrix4();
  const normalMatrix = new THREE.Matrix3();
  const backgroundColor = new THREE.Color();
  const tintColor = new THREE.Color(1, 1, 1);
  const highlightColor = new THREE.Color(1, 1, 1);
  let hasBackground = 0;
  let aspect = 1;

  const pointer = new THREE.Vector2(0.5, 0.5);
  const queued: [number, number, number, number, number][] = [];
  const pointers = new Map<number, { x: number; y: number }>();
  let simEnergy = 0;
  const cursorUv = new THREE.Vector2(0.5, 0.5);
  let glow = 0;
  const wobbleTilt = new THREE.Vector2();
  const wobbleTiltVel = new THREE.Vector2();
  let squash = 0;
  let squashVel = 0;
  const rectCache = createRectCache(canvas);

  function gpuTextureFor(map: THREE.Texture | null): Texture {
    if (!gpu || !whiteTexture || !map) return whiteTexture!;
    const cached = textureCache.get(map);
    if (cached) return cached;
    const image = map.image;
    if (!canCopySource(image)) return whiteTexture;
    const texture = uploadExternalTexture(gpu, null, image, "liquid-object.map");
    textureCache.set(map, texture);
    return texture;
  }

  function disposeGpuMeshes() {
    for (const part of gpuMeshes) part.geo.destroy();
    gpuMeshes = [];
    for (const texture of textureCache.values()) texture.destroy();
    textureCache.clear();
  }

  function buildGpuMeshes() {
    disposeGpuMeshes();
    if (!gpu || !sceneTarget || !linearSampler || !model || !whiteTexture || !envAtlas || !envSampler) return;
    gpuMeshesDirty = false;
    model.updateMatrixWorld(true);
    model.traverse((node) => {
      const mesh = node as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry) return;
      const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      const fallbackMap = mesh.material === surfaceMaterial ? surfaceMaterial.map : null;
      const groups = mesh.geometry.groups.length
        ? mesh.geometry.groups
        : [{ start: 0, count: mesh.geometry.index?.count ?? mesh.geometry.getAttribute("position")?.count ?? 0, materialIndex: 0 }];
      for (const group of groups) {
        const data = geometryDataFor(mesh.geometry, group);
        if (!data || data.length === 0) continue;
        const state = materialStateFor(
          materials[group.materialIndex ?? 0] ?? materials[0] ?? null,
          fallbackMap,
        );
        if (state.material === surfaceMaterial) state.baseColor.set(1, 1, 1);
        const geo = geometry(gpu!, {
          buffers: [
            {
              data,
              attributes: {
                aPosition: "float32x3",
                aNormal: "float32x3",
                aUv: "float32x2",
                aColor: "float32x4",
              },
            },
          ],
          topology: "triangle-list",
          label: "liquid-object.mesh",
        });
        const pass = draw(gpu!, {
          shader: MODEL_SHADER,
          geometry: geo,
          blend: "premultiplied",
          cull: "none",
          depth: { compare: "less-equal", write: true },
          set: { uMap: gpuTextureFor(state.map), uMapSampler: linearSampler, uEnv: envAtlas, uEnvSampler: envSampler },
          label: "liquid-object.model",
        });
        gpuMeshes.push({ mesh, geo, pass, material: state });
      }
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
    disposeObject(model, surfaceMaterial);
    model = null;
  }

  function clearAsset() {
    if (assetSource?.kind === "mesh") disposeObject(assetSource.scene, surfaceMaterial);
    if (assetSource?.kind === "shapes") assetSource.texture?.dispose();
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
    gpuMeshesDirty = true;
  }

  function buildModel() {
    if (!assetSource) return;
    if (assetSource.kind === "mesh") {
      if (model) return;
      assetSource.scene.traverse((node) => {
        const mesh = node as THREE.Mesh;
        if (!mesh.isMesh) return;
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
    mapShapeUvs(shapeGeometry, assetSource.uvSpan);
    shapeGeometry.rotateX(Math.PI);
    surfaceMaterial.map = assetSource.texture ?? null;
    mountModel(new THREE.Mesh(shapeGeometry, surfaceMaterial));
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
        let painted: ImageData | null = null;
        try {
          painted = await rasterizeImage(new Blob([buffer], { type: "image/svg+xml" }), TEXTURE_SIZE);
        } catch {
          painted = null;
        }
        if (disposed || token !== loadToken) return;
        clearAsset();
        assetSource = {
          kind: "shapes",
          shapes,
          texture: painted ? textureFromImageData(painted) : null,
          uvSpan: null,
        };
      } else {
        const blob = new Blob([buffer]);
        const data = await rasterizeImage(blob);
        const painted = await rasterizeImage(blob, TEXTURE_SIZE);
        if (disposed || token !== loadToken) return;
        const shapes = shapesFromImage(data);
        clearAsset();
        assetSource = {
          kind: "shapes",
          shapes,
          texture: textureFromImageData(painted),
          uvSpan: { spanX: data.width, spanY: data.height },
        };
      }
      buildModel();
      config.onLoad?.();
      startLoop();
    } catch (error) {
      if (disposed || token !== loadToken) return;
      config.onError?.(error);
    }
  }

  function onPointerMove(event: PointerEvent) {
    const rect = rectCache.current;
    if (rect.width < 1 || rect.height < 1) return;
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const previous = pointers.get(event.pointerId);
    pointers.set(event.pointerId, { x: px, y: py });
    cursorUv.set(px / rect.width, py / rect.height);
    if (!previous) return;
    const force = Math.max(config.cursorForce, 0) * 1.1;
    const dx = (px - previous.x) * force;
    const dy = (py - previous.y) * force;
    if (dx * dx + dy * dy < 1e-8) return;
    if (queued.length < 64) queued.push([px / rect.width, py / rect.height, dx, dy, 1]);
    const kick = Math.max(config.wobble, 0) * 0.0025;
    wobbleTiltVel.x += dy * kick;
    wobbleTiltVel.y += dx * kick;
    startLoop();
  }

  function onPointerDown(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    pointers.set(event.pointerId, { x: px, y: py });
    cursorUv.set(px / rect.width, py / rect.height);
    const strength = Math.max(config.splash, 0);
    if (strength <= 0) return;
    squashVel -= 1.8 * Math.min(strength, 2) * Math.max(config.wobble, 0);
    const x = px / rect.width;
    const y = py / rect.height;
    for (let i = 0; i < 8 && queued.length < 64; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const cx = Math.cos(angle);
      const cy = Math.sin(angle);
      queued.push([x + cx * 0.02, y + cy * 0.02, cx * 70 * strength, cy * 70 * strength, 2.2]);
    }
    startLoop();
  }

  function onPointerLeave(event: PointerEvent) {
    pointers.delete(event.pointerId);
    startLoop();
  }

  canvas.addEventListener("pointermove", onPointerMove, { passive: true });
  canvas.addEventListener("pointerdown", onPointerDown, { passive: true });
  canvas.addEventListener("pointerleave", onPointerLeave, { passive: true });
  canvas.addEventListener("pointercancel", onPointerLeave, { passive: true });

  function swap(pair: [Target, Target]) {
    const tmp = pair[0];
    pair[0] = pair[1];
    pair[1] = tmp;
  }

  function splat(pair: [Target, Target], value: THREE.Vector3, radius: number) {
    if (!splatFx) return;
    pointer.set(pointer.x, pointer.y);
    splatFx.set({
      tTarget: pair[0],
      params: {
        point: [pointer.x, pointer.y],
        value: [value.x, value.y, value.z],
        radius,
        aspect,
      },
    });
    splatFx.draw(pair[1]);
    swap(pair);
  }

  function clearTarget(targetToClear: Target) {
    if (!gpu) return;
    gpuFrame(gpu, (f) => f.pass({ target: targetToClear, clear: [0, 0, 0, 0] }, () => {}));
  }

  function clearSimulation() {
    if (!velocity || !pressure || !field || !divergence || !curl) return;
    for (const targetToClear of [...velocity, ...pressure, ...field, divergence, curl]) clearTarget(targetToClear);
  }

  const splatValue = new THREE.Vector3();

  function stepSimulation(delta: number) {
    if (
      !velocity ||
      !pressure ||
      !field ||
      !divergence ||
      !curl ||
      !curlFx ||
      !vorticityFx ||
      !divergenceFx ||
      !pressureFx ||
      !gradientFx ||
      !advectFx ||
      !fadeFx
    ) {
      return;
    }
    if (queued.length > 0) {
      const radius = Math.max(config.cursorSize, 0.02) * 0.01;
      for (const [x, y, dx, dy, r] of queued) {
        pointer.set(x, y);
        splatValue.set(dx, dy, 0);
        splat(velocity, splatValue, radius * r);
        splat(field, splatValue, radius * r);
      }
      queued.length = 0;
      simEnergy = 1;
    }

    curlFx.set({ tVelocity: velocity[0], params: { texel: [1 / SIM_RES, 1 / SIM_RES] } });
    curlFx.draw(curl);
    vorticityFx.set({
      tVelocity: velocity[0],
      tCurl: curl,
      params: { texel: [1 / SIM_RES, 1 / SIM_RES], curl: Math.max(config.swirl, 0) * 4, dt: delta },
    });
    vorticityFx.draw(velocity[1]);
    swap(velocity);
    divergenceFx.set({ tVelocity: velocity[0], params: { texel: [1 / SIM_RES, 1 / SIM_RES] } });
    divergenceFx.draw(divergence);
    fadeFx.set({ tSource: pressure[0], params: { fade: Math.pow(0.8, delta * 60) } });
    fadeFx.draw(pressure[1]);
    swap(pressure);
    for (let i = 0; i < PRESSURE_STEPS; i++) {
      pressureFx.set({ tPressure: pressure[0], tDivergence: divergence, params: { texel: [1 / SIM_RES, 1 / SIM_RES] } });
      pressureFx.draw(pressure[1]);
      swap(pressure);
    }
    gradientFx.set({ tPressure: pressure[0], tVelocity: velocity[0], params: { texel: [1 / SIM_RES, 1 / SIM_RES] } });
    gradientFx.draw(velocity[1]);
    swap(velocity);

    const settle = Math.min(Math.max(config.persistence, 0), 1);
    const frames = delta * 60;
    const flowDecay = Math.pow(0.985 + settle * 0.015, frames);
    const fieldDecay = Math.pow(0.9 + settle * 0.099, frames);
    advectFx.set({
      tVelocity: velocity[0],
      tSource: velocity[0],
      params: { texel: [1 / SIM_RES, 1 / SIM_RES], dt: delta, dissipation: flowDecay },
    });
    advectFx.draw(velocity[1]);
    swap(velocity);
    advectFx.set({
      tVelocity: velocity[0],
      tSource: field[0],
      params: { texel: [1 / FIELD_RES, 1 / FIELD_RES], dt: delta, dissipation: fieldDecay },
    });
    advectFx.draw(field[1]);
    swap(field);
    simEnergy *= fieldDecay;
  }

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reducedMotion = motionQuery.matches;
  const onMotionChange = () => {
    reducedMotion = motionQuery.matches;
    if (reducedMotion) {
      floatGroup.rotation.set(0, 0, 0);
      floatGroup.scale.setScalar(1);
    }
    applyOptions();
  };
  motionQuery.addEventListener("change", onMotionChange);

  function applyOptions() {
    hasBackground = config.background ? 1 : 0;
    if (config.background) backgroundColor.set(config.background);
    if (config.tint) tintColor.set(config.tint);
    else tintColor.set(0xffffff);
    highlightColor.set(config.highlight);
    controls.enableRotate = config.orbit;
    controls.enableZoom = config.zoom;
    controls.autoRotate = config.autoRotate && !reducedMotion;
    controls.autoRotateSpeed = config.autoRotateSpeed;
    camera.fov = fitFov(config.fov, camera.aspect);
    camera.updateProjectionMatrix();
    floatGroup.position.x = config.xOffset;
    floatGroup.position.y = MODEL_LIFT + config.yOffset;

    const gloss = Math.min(Math.max(config.gloss, 0), 1);
    const metallic = Math.min(Math.max(config.metallic, 0), 1);
    surfaceMaterial.roughness = 1 - gloss;
    surfaceMaterial.metalness = metallic;
    surfaceMaterial.color.copy(tintColor);
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
    if (sceneTarget && (sceneTarget.size[0] !== pixelWidth || sceneTarget.size[1] !== pixelHeight)) {
      sceneTarget.resize([pixelWidth, pixelHeight]);
    }
    camera.aspect = width / height;
    camera.fov = fitFov(config.fov, camera.aspect);
    camera.updateProjectionMatrix();
    aspect = width / height;
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

  function buildEnvironment() {
    if (!gpu || envAtlas) return;
    const baked = bakeStudioRadiance();
    envSh = baked.sh;
    const hi = gpu.device.createTexture({
      size: [ENV_WIDTH, ENV_HEIGHT],
      format: "rgba16float",
      usage: ["texture_binding", "copy_dst"],
      label: "liquid-object.env-hi",
    });
    const lo = gpu.device.createTexture({
      size: [ENV_WIDTH / 2, ENV_HEIGHT / 2],
      format: "rgba16float",
      usage: ["texture_binding", "copy_dst"],
      label: "liquid-object.env-lo",
    });
    gpu.gpu.queue.writeTexture({ texture: hi.gpu }, toHalfArray(baked.hi), { bytesPerRow: ENV_WIDTH * 8 }, [ENV_WIDTH, ENV_HEIGHT]);
    gpu.gpu.queue.writeTexture({ texture: lo.gpu }, toHalfArray(baked.lo), { bytesPerRow: (ENV_WIDTH / 2) * 8 }, [ENV_WIDTH / 2, ENV_HEIGHT / 2]);
    envAtlas = target(gpu, { size: [ENV_WIDTH, ENV_HEIGHT * ENV_LEVELS], format: "rgba16float", label: "liquid-object.env" });
    envSampler = sampler(gpu, { minFilter: "linear", magFilter: "linear", addressModeU: "repeat", addressModeV: "clamp-to-edge" });
    const prefilter = gpuEffect(gpu, PREFILTER_SHADER, {
      label: "liquid-object.prefilter",
      set: { params: { hiSize: [ENV_WIDTH, ENV_HEIGHT] }, uHi: hi, uLo: lo },
    });
    prefilter.draw(envAtlas);
    hi.destroy();
    lo.destroy();
  }

  function render(time: number) {
    if (!gpu || !screen || !sceneTarget || !field || !compositeFx) return;
    buildEnvironment();
    if (!envAtlas || !envSampler) return;
    if (gpuMeshesDirty) buildGpuMeshes();
    const device = gpu;
    const outputTarget = screen;
    const objectTarget = sceneTarget;
    const compositePass = compositeFx;
    const activeField = field[0];
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    viewProjection.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const envHighlight = highlightColor.clone().multiplyScalar(15);
    const metallic = Math.min(Math.max(config.metallic, 0), 1);
    const shapeRoughness = 1 - Math.min(Math.max(config.gloss, 0), 1);
    const meshTextures = new Map<GpuMesh, Texture>();
    for (const part of gpuMeshes) {
      meshTextures.set(part, gpuTextureFor(part.material.map));
    }

    compositePass.set({
      tScene: objectTarget,
      tField: activeField,
      params: {
        fieldTexel: [1 / FIELD_RES, 1 / FIELD_RES],
        distortion: Math.max(config.distortion, 0),
        aberration: Math.min(Math.max(config.aberration, 0), 1),
        grain: Math.min(Math.max(config.grain, 0), 1),
        cursor: [cursorUv.x, cursorUv.y],
        lensRadius: 0.12 + Math.min(Math.max(config.cursorSize, 0.02), 1) * 0.45,
        glow,
        aspect,
        sheen: Math.max(config.sheen, 0),
        iridescence: Math.max(config.iridescence, 0),
        ambient: reducedMotion ? 0 : Math.max(config.ambient, 0),
        time: time * 0.001,
        background: [backgroundColor.r, backgroundColor.g, backgroundColor.b],
        hasBackground,
        exposure: 1,
        brightness: Math.max(config.brightness, 0),
        saturation: Math.max(config.saturation, 0),
      },
    });

    gpuFrame(device, (encoder) => {
      encoder.pass({ target: objectTarget, clear: [0, 0, 0, 0] }, (pass) => {
        for (const part of gpuMeshes) {
          const material = part.material;
          const isShape = material.material === surfaceMaterial;
          const metalness = isShape
            ? metallic
            : material.metalness + (1 - material.metalness) * metallic;
          const roughness = isShape
            ? shapeRoughness
            : material.roughness + (0.25 - material.roughness) * metallic;
          const mapTexture = meshTextures.get(part) ?? whiteTexture!;
          normalMatrix.getNormalMatrix(part.mesh.matrixWorld);
          part.pass.set({
            uMap: mapTexture,
            params: {
              sh: envSh,
              viewProjection: Array.from(viewProjection.elements),
              model: Array.from(part.mesh.matrixWorld.elements),
              normalMatrix: Array.from(normalMatrix.elements),
              cameraPosition: [camera.position.x, camera.position.y, camera.position.z],
              baseColor: [material.baseColor.r, material.baseColor.g, material.baseColor.b],
              tint: [tintColor.r, tintColor.g, tintColor.b],
              metalness,
              roughness,
              highlight: [envHighlight.r, envHighlight.g, envHighlight.b],
              environmentIntensity: Math.max(config.environmentIntensity, 0),
              emissive: [material.emissive.r, material.emissive.g, material.emissive.b],
              hasMap: material.map ? 1 : 0,
              opacity: material.opacity,
              alphaTest: material.alphaTest,
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
    const delta = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 0;
    lastTime = time;
    if (fallback2d) {
      renderFallback();
      stopLoop();
      return;
    }
    if (!gpu) {
      stopLoop();
      return;
    }
    controls.update();
    if (!reducedMotion) {
      elapsed += delta * config.floatSpeed;
      wobbleTiltVel.x += (wobbleTilt.x * -46 - wobbleTiltVel.x * 4.6) * delta;
      wobbleTiltVel.y += (wobbleTilt.y * -46 - wobbleTiltVel.y * 4.6) * delta;
      if (wobbleTiltVel.length() > 3) wobbleTiltVel.setLength(3);
      wobbleTilt.addScaledVector(wobbleTiltVel, delta);
      if (wobbleTilt.length() > 0.3) wobbleTilt.setLength(0.3);
      squashVel += (squash * -64 - squashVel * 5.2) * delta;
      squash = Math.min(Math.max(squash + squashVel * delta, -0.3), 0.3);
      const bulge = 1 - squash * 0.5;
      floatGroup.scale.set(bulge, 1 + squash, bulge);
      floatGroup.rotation.x = (Math.cos(elapsed / 4) / 8) * config.rotationIntensity + wobbleTilt.x;
      floatGroup.rotation.y = (Math.sin(elapsed / 4) / 8) * config.rotationIntensity + wobbleTilt.y;
      floatGroup.rotation.z = (Math.sin(elapsed / 4) / 20) * config.rotationIntensity;
      floatGroup.position.y = MODEL_LIFT + config.yOffset + (Math.sin(elapsed / 1.5) / 10) * config.floatIntensity;
    }
    glow += ((pointers.size > 0 ? 1 : 0) - glow) * Math.min(delta * 6, 1);
    if (delta > 0 && (queued.length > 0 || simEnergy > 0.002)) stepSimulation(Math.min(delta, SIM_STEP * 2));
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

  function makeSimTarget(size: number, label: string): Target {
    return target(gpu!, {
      size: [size, size],
      format: "rgba16float",
      label,
    });
  }

  acquireGpu()
    .then((device) => {
      if (disposed) return;
      gpu = device;
      screen = makeSurface(gpu, canvas, {
        autoResize: false,
        alphaMode: "premultiplied",
        label: "liquid-object",
      });
      const width = Math.max(1, canvas.width);
      const height = Math.max(1, canvas.height);
      sceneTarget = target(gpu, {
        size: [width, height],
        format: "rgba16float",
        depth: "depth24plus",
        label: "liquid-object.scene",
      });
      velocity = [makeSimTarget(SIM_RES, "liquid-object.velocity-a"), makeSimTarget(SIM_RES, "liquid-object.velocity-b")];
      pressure = [makeSimTarget(SIM_RES, "liquid-object.pressure-a"), makeSimTarget(SIM_RES, "liquid-object.pressure-b")];
      field = [makeSimTarget(FIELD_RES, "liquid-object.field-a"), makeSimTarget(FIELD_RES, "liquid-object.field-b")];
      divergence = makeSimTarget(SIM_RES, "liquid-object.divergence");
      curl = makeSimTarget(SIM_RES, "liquid-object.curl");
      linearSampler = sampler(gpu, {
        minFilter: "linear",
        magFilter: "linear",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
      });
      whiteTexture = createOnePixelTexture(gpu, [255, 255, 255, 255], "liquid-object.white");
      splatFx = gpuEffect(gpu, SPLAT_SHADER, { set: { tTarget: velocity[0], uSampler: linearSampler }, label: "liquid-object.splat" });
      curlFx = gpuEffect(gpu, CURL_SHADER, { set: { tVelocity: velocity[0], uSampler: linearSampler }, label: "liquid-object.curl-pass" });
      vorticityFx = gpuEffect(gpu, VORTICITY_SHADER, { set: { tVelocity: velocity[0], tCurl: curl, uSampler: linearSampler }, label: "liquid-object.vorticity" });
      divergenceFx = gpuEffect(gpu, DIVERGENCE_SHADER, { set: { tVelocity: velocity[0], uSampler: linearSampler }, label: "liquid-object.divergence-pass" });
      pressureFx = gpuEffect(gpu, PRESSURE_SHADER, { set: { tPressure: pressure[0], tDivergence: divergence, uSampler: linearSampler }, label: "liquid-object.pressure" });
      gradientFx = gpuEffect(gpu, GRADIENT_SHADER, { set: { tPressure: pressure[0], tVelocity: velocity[0], uSampler: linearSampler }, label: "liquid-object.gradient" });
      advectFx = gpuEffect(gpu, ADVECT_SHADER, { set: { tVelocity: velocity[0], tSource: velocity[0], uSampler: linearSampler }, label: "liquid-object.advect" });
      fadeFx = gpuEffect(gpu, FADE_SHADER, { set: { tSource: pressure[0], uSampler: linearSampler }, label: "liquid-object.fade" });
      compositeFx = gpuEffect(gpu, COMPOSITE_SHADER, { set: { tScene: sceneTarget, tField: field[0], uSampler: linearSampler }, label: "liquid-object.composite" });
      clearSimulation();
      buildEnvironment();
      buildGpuMeshes();
      resize();
      startLoop();
    })
    .catch((error) => {
      if (disposed) return;
      console.warn("LiquidObject: WebGPU unavailable, showing fallback background.", error);
      fallback2d = canvas.getContext("2d");
      renderFallback();
    });

  resize();
  applyOptions();
  loadAsset();
  startLoop();

  return {
    setOptions(next: LiquidObjectOptions) {
      next = resolveOptions(DEFAULTS, next);
      let changed = false;
      for (const [key, value] of Object.entries(next)) {
        if (typeof value === "function") continue;
        if (config[key as keyof LiquidObjectOptions] !== value) {
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
      rectCache.destroy();
      loadToken += 1;
      stopLoop();
      observer.disconnect();
      viewObserver?.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("pointercancel", onPointerLeave);
      motionQuery.removeEventListener("change", onMotionChange);
      controls.dispose();
      clearAsset();
      disposeGpuMeshes();
      for (const targetToDestroy of [
        ...(velocity ?? []),
        ...(pressure ?? []),
        ...(field ?? []),
        divergence,
        curl,
        sceneTarget,
        envAtlas,
      ]) {
        (targetToDestroy as unknown as { destroy?: () => void } | null)?.destroy?.();
      }
      whiteTexture?.destroy();
      screen?.dispose();
      draco.dispose();
      surfaceMaterial.dispose();
    },
  };
}
