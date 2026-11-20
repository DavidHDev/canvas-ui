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

export interface WireframeObjectOptions {
  /** URL of the asset to display: GLB/glTF, SVG, PNG, JPEG, WebP, or GIF. Object URLs from a file input work too. The format is sniffed from the bytes, not the extension. */
  src?: string;
  /** Color of the edge lines as any CSS color. Empty string follows the element's CSS `color`, so the drawing matches the page theme. */
  lineColor?: string;
  /** Width of the edge lines in CSS pixels. */
  lineWidth?: number;
  /** Overall opacity of the drawing (0 to 1). */
  opacity?: number;
  /** Fold angle in degrees above which an edge counts as a crease and is drawn. Silhouettes are always drawn. */
  creaseAngle?: number;
  /** Opacity of the dashed lines hidden behind the surface (0 hides them). */
  hiddenLines?: number;
  /** Opacity of the full triangle topology behind the feature edges (0 to 1). Diagonals across flat faces are skipped. */
  topology?: number;
  /** Draw glowing nodes where feature edges meet at a corner. */
  nodes?: boolean;
  /** Radius of the corner nodes in CSS pixels. */
  nodeSize?: number;
  /** Color of the corner nodes and the scan highlight as any CSS color. Empty string uses the line color. */
  nodeColor?: string;
  /** Strength of the soft glow around nodes and lines (0 to 1). */
  glow?: number;
  /** How much edges dim with distance from the camera (0 to 1). */
  depthFade?: number;
  /** Strength of the scan band that sweeps over the object and lights up its topology (0 disables). */
  scan?: number;
  /** Speed of the scan band. 1 sweeps about once every six seconds. */
  scanSpeed?: number;
  /** Extrusion depth of 2D assets (SVG or image) as a fraction of their longest side. */
  depth?: number;
  /** Edge rounding of extruded 2D assets (0 to 1). Adds a chamfer ring around each outline. */
  bevel?: number;
  /** Background color behind the drawing. Empty string keeps the canvas transparent. */
  background?: string;
  /** Size of the longest side of the asset in scene units. The camera sits about 4 units away. Portrait canvases shrink it to fit the width. */
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

export interface WireframeObjectElements {
  canvas: HTMLCanvasElement;
}

export interface WireframeObjectInstance {
  setOptions: (options: WireframeObjectOptions) => void;
  resize: () => void;
  destroy: () => void;
}

const DEFAULTS: Required<WireframeObjectOptions> = {
  src: "",
  lineColor: "",
  lineWidth: 1,
  opacity: 1,
  creaseAngle: 30,
  hiddenLines: 0.22,
  topology: 0.1,
  nodes: true,
  nodeSize: 2.25,
  nodeColor: "#066aff",
  glow: 0.6,
  depthFade: 0.5,
  scan: 0.6,
  scanSpeed: 1,
  depth: 0.16,
  bevel: 0,
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

function fitFov(fov: number, aspect: number): number {
  if (aspect >= 1) return fov;
  const half = THREE.MathUtils.degToRad(fov) / 2;
  const margin = 1 + 0.25 * (1 - aspect);
  return THREE.MathUtils.radToDeg(2 * Math.atan((Math.tan(half) * margin) / aspect));
}
const MODEL_LIFT = 0.3;
const RASTER_SIZE = 256;
const ALPHA_THRESHOLD = 64;
const MAX_NODES = 480;
const SCAN_WIDTH = 0.09;
const EDGE_STRIDE = 13;
const NODE_STRIDE = 4;

const UNIFORMS = `
struct Frame {
  model: mat4x4f,
  view: mat4x4f,
  proj: mat4x4f,
  normalMatrix: mat3x3f,
  cameraPos: vec4f,
  lineColor: vec4f,
  accent: vec4f,
  resolution: vec2f,
  boundsY: vec2f,
  lineWidth: f32,
  glowRadius: f32,
  glow: f32,
  creaseCos: f32,
  topology: f32,
  scan: f32,
  scanPos: f32,
  centerDist: f32,
  radius: f32,
  depthFade: f32,
  opacity: f32,
  hidden: f32,
  dash: f32,
  nodeSize: f32,
}

@group(0) @binding(0) var<uniform> u: Frame;

fn webgpuDepth(clip: vec4f) -> f32 {
  return clip.z * 0.5 + clip.w * 0.5;
}
`;

const PREPASS_SHADER = `${UNIFORMS}
@vertex fn vs_main(@location(0) position: vec3f) -> @builtin(position) vec4f {
  let clip = u.proj * u.view * u.model * vec4f(position, 1.0);
  return vec4f(clip.xy, webgpuDepth(clip), clip.w);
}

@fragment fn fs_main() -> @location(0) vec4f {
  return vec4f(0.0);
}`;

const LINE_SHADER = `${UNIFORMS}
struct LineOut {
  @builtin(position) pos: vec4f,
  @location(0) localW: vec2f,
  @location(1) w: f32,
  @location(2) len: f32,
  @location(3) weight: f32,
  @location(4) width: f32,
  @location(5) scan: f32,
  @location(6) fade: f32,
}

fn collapsed() -> LineOut {
  var out: LineOut;
  out.pos = vec4f(2.0, 2.0, 2.0, 1.0);
  out.localW = vec2f(0.0);
  out.w = 1.0;
  out.len = 0.0;
  out.weight = 0.0;
  out.width = 0.0;
  out.scan = 0.0;
  out.fade = 0.0;
  return out;
}

@vertex fn vs_main(
  @location(0) corner: vec2f,
  @location(1) edgeStart: vec3f,
  @location(2) edgeEnd: vec3f,
  @location(3) normalA: vec3f,
  @location(4) normalB: vec3f,
  @location(5) crease: f32,
) -> LineOut {
  let wa = u.model * vec4f(edgeStart, 1.0);
  let wb = u.model * vec4f(edgeEnd, 1.0);
  let n1 = normalize(u.normalMatrix * normalA);
  let n2 = normalize(u.normalMatrix * normalB);
  let toCam = u.cameraPos.xyz - 0.5 * (wa.xyz + wb.xyz);
  let facing = dot(n1, toCam) * dot(n2, toCam);
  let boundary = 1.0 - step(-1.5, crease);
  let creased = max(boundary, 1.0 - step(u.creaseCos, crease));
  let silhouette = (1.0 - boundary) * (1.0 - step(0.0, facing));
  let feature = max(creased, silhouette);

  let objPos = mix(edgeStart, edgeEnd, corner.x);
  let yNorm = (objPos.y - u.boundsY.x) / max(u.boundsY.y - u.boundsY.x, 1e-5);
  let scanD = (yNorm - u.scanPos) / ${SCAN_WIDTH.toFixed(3)};
  let scan = u.scan * exp(-scanD * scanD);
  let structural = 1.0 - step(0.99995, crease);
  var weight = select(max(feature, structural * max(u.topology, scan * 0.4)), feature, u.hidden > 0.5);
  if (weight <= 0.001) {
    return collapsed();
  }
  let contour = max(boundary, silhouette);
  let width = u.lineWidth * select(0.55, mix(0.7, 1.0, contour), feature > 0.5);
  weight *= select(1.0, mix(0.85, 1.0, contour), feature > 0.5);

  var va = u.view * wa;
  var vb = u.view * wb;
  va = vec4f(va.xyz * 0.9985, va.w);
  vb = vec4f(vb.xyz * 0.9985, vb.w);
  let ca = u.proj * va;
  let cb = u.proj * vb;
  if (ca.w < 1e-3 || cb.w < 1e-3) {
    return collapsed();
  }
  let sa = (ca.xy / ca.w * 0.5 + 0.5) * u.resolution;
  let sb = (cb.xy / cb.w * 0.5 + 0.5) * u.resolution;
  let dir = sb - sa;
  let len = length(dir);
  let d = select(vec2f(1.0, 0.0), dir / max(len, 1e-6), len > 1e-4);
  let nrm = vec2f(-d.y, d.x);
  let halfW = max(width * 0.5, 0.5) + 1.0 + u.glowRadius;
  let along = corner.x * len + (corner.x * 2.0 - 1.0) * halfW;
  let across = corner.y * halfW;
  let screen = sa + d * along + nrm * across;
  let clip = select(cb, ca, corner.x < 0.5);
  var out: LineOut;
  out.pos = vec4f((screen / u.resolution * 2.0 - 1.0) * clip.w, webgpuDepth(clip), clip.w);
  out.localW = vec2f(along, across) * clip.w;
  out.w = clip.w;
  out.len = len;
  out.weight = weight;
  out.width = width;
  out.scan = scan;
  let viewDist = select(-vb.z, -va.z, corner.x < 0.5);
  let near01 = clamp((u.centerDist - viewDist) / max(u.radius, 1e-4) * 0.5 + 0.5, 0.0, 1.0);
  out.fade = 1.0 - u.depthFade * (1.0 - near01);
  return out;
}

@fragment fn fs_main(in: LineOut) -> @location(0) vec4f {
  let local = in.localW / in.w;
  let along = local.x;
  let q = vec2f(along - clamp(along, 0.0, in.len), local.y);
  let dist = length(q);
  let core = max(in.width * 0.5, 0.5);
  let coverage = clamp(in.width, 0.0, 1.0);
  let line = (1.0 - smoothstep(core - 0.5, core + 0.5, dist)) * coverage;
  var alpha: f32;
  if (u.hidden > 0.0) {
    let phase = fract(along / u.dash);
    let soft = 1.0 / u.dash;
    let dash = smoothstep(0.0, soft, phase) * (1.0 - smoothstep(0.5, 0.5 + soft, phase));
    alpha = line * dash * u.hidden;
  } else {
    var halo = 0.0;
    if (u.glowRadius > 0.0) {
      halo = exp(-dist * dist / (u.glowRadius * u.glowRadius * 0.3)) * u.glow * 0.2;
    }
    alpha = max(line, halo) * (1.0 + in.scan * 0.5);
  }
  alpha = clamp(alpha * in.weight * in.fade * u.opacity * u.lineColor.a, 0.0, 1.0);
  if (alpha < 0.002) {
    discard;
  }
  let color = mix(u.lineColor.rgb, u.accent.rgb, clamp(in.scan * 0.9, 0.0, 1.0));
  return vec4f(color * alpha, alpha);
}`;

const NODE_SHADER = `${UNIFORMS}
struct NodeOut {
  @builtin(position) pos: vec4f,
  @location(0) offsetW: vec2f,
  @location(1) w: f32,
  @location(2) radius: f32,
  @location(3) scan: f32,
  @location(4) fade: f32,
}

@vertex fn vs_main(
  @location(0) corner: vec2f,
  @location(1) center: vec3f,
  @location(2) weight: f32,
) -> NodeOut {
  var out: NodeOut;
  var v = u.view * u.model * vec4f(center, 1.0);
  v = vec4f(v.xyz * 0.997, v.w);
  let c = u.proj * v;
  if (c.w < 1e-3) {
    out.pos = vec4f(2.0, 2.0, 2.0, 1.0);
    out.offsetW = vec2f(0.0);
    out.w = 1.0;
    out.radius = 0.0;
    out.scan = 0.0;
    out.fade = 0.0;
    return out;
  }
  let yNorm = (center.y - u.boundsY.x) / max(u.boundsY.y - u.boundsY.x, 1e-5);
  let scanD = (yNorm - u.scanPos) / ${SCAN_WIDTH.toFixed(3)};
  let scan = u.scan * exp(-scanD * scanD);
  let radius = u.nodeSize * mix(0.8, 1.2, clamp(weight, 0.0, 1.0)) * (1.0 + scan * 0.6);
  let extent = radius * (1.0 + 2.0 * u.glow) + 1.5;
  let offset = corner * extent;
  out.pos = vec4f(c.xy + offset / u.resolution * 2.0 * c.w, webgpuDepth(c), c.w);
  out.offsetW = offset * c.w;
  out.w = c.w;
  out.radius = radius;
  out.scan = scan;
  let near01 = clamp((u.centerDist + v.z) / max(u.radius, 1e-4) * 0.5 + 0.5, 0.0, 1.0);
  out.fade = 1.0 - u.depthFade * (1.0 - near01);
  return out;
}

@fragment fn fs_main(in: NodeOut) -> @location(0) vec4f {
  let d = length(in.offsetW / in.w);
  let core = 1.0 - smoothstep(in.radius - 0.75, in.radius + 0.75, d);
  let haloR = in.radius * (1.0 + 2.0 * u.glow) + 0.5;
  let fall = 1.0 - smoothstep(in.radius * 0.6, haloR, d);
  let halo = fall * fall * u.glow * (0.5 + in.scan * 0.35);
  let hot = (1.0 - smoothstep(0.0, in.radius, d)) * 0.35 * core;
  let color = mix(u.accent.rgb, vec3f(1.0), hot);
  let alpha = clamp(max(core, halo) * in.fade * u.opacity * u.accent.a, 0.0, 1.0);
  if (alpha < 0.002) {
    discard;
  }
  return vec4f(color * alpha, alpha);
}`;

const COMPOSITE_SHADER = `
struct Composite {
  background: vec4f,
}

@group(0) @binding(0) var<uniform> params: Composite;
@group(0) @binding(1) var tScene: texture_2d<f32>;
@group(0) @binding(2) var sceneSampler: sampler;

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let drawing = textureSampleLevel(tScene, sceneSampler, uv, 0.0);
  let background = params.background.rgb * params.background.a;
  return vec4f(
    drawing.rgb + background * (1.0 - drawing.a),
    drawing.a + params.background.a * (1.0 - drawing.a),
  );
}`;

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
      .replace(/^﻿/, "")
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

function simplifyClosedLoop(points: Point[], epsilon: number): Point[] {
  if (points.length < 8) return points;
  const [sx, sy] = points[0];
  let far = 0;
  let farDist = -1;
  for (let i = 1; i < points.length; i++) {
    const d = Math.hypot(points[i][0] - sx, points[i][1] - sy);
    if (d > farDist) {
      farDist = d;
      far = i;
    }
  }
  const first = simplifyLoop(points.slice(0, far + 1), epsilon);
  const second = simplifyLoop([...points.slice(far), points[0]], epsilon);
  const out = [...first, ...second.slice(1, -1)];
  return out.length >= 3 ? out : points;
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

function maskFromImage(data: ImageData): Uint8Array {
  const { width, height } = data;
  const px = data.data;
  const count = width * height;
  const mask = new Uint8Array(count);
  let opaque = true;
  for (let i = 0; i < count; i++) {
    if (px[i * 4 + 3] < 250) {
      opaque = false;
      break;
    }
  }
  if (!opaque) {
    for (let i = 0; i < count; i++) {
      mask[i] = px[i * 4 + 3] >= ALPHA_THRESHOLD ? 1 : 0;
    }
    return mask;
  }
  const luma = new Uint8Array(count);
  const histogram = new Float64Array(256);
  for (let i = 0; i < count; i++) {
    const l = Math.round(
      px[i * 4] * 0.2126 + px[i * 4 + 1] * 0.7152 + px[i * 4 + 2] * 0.0722,
    );
    luma[i] = l;
    histogram[l]++;
  }
  let total = 0;
  for (let i = 0; i < 256; i++) total += i * histogram[i];
  let below = 0;
  let belowSum = 0;
  let best = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t++) {
    below += histogram[t];
    if (below === 0) continue;
    const above = count - below;
    if (above === 0) break;
    belowSum += t * histogram[t];
    const meanBelow = belowSum / below;
    const meanAbove = (total - belowSum) / above;
    const between = below * above * (meanBelow - meanAbove) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  let borderDark = 0;
  let borderTotal = 0;
  for (let x = 0; x < width; x++) {
    for (const y of [0, height - 1]) {
      borderTotal++;
      if (luma[y * width + x] <= threshold) borderDark++;
    }
  }
  for (let y = 0; y < height; y++) {
    for (const x of [0, width - 1]) {
      borderTotal++;
      if (luma[y * width + x] <= threshold) borderDark++;
    }
  }
  const subjectDark = borderDark < borderTotal / 2;
  for (let i = 0; i < count; i++) {
    mask[i] = luma[i] <= threshold === subjectDark ? 1 : 0;
  }
  return mask;
}

function shapesFromImage(data: ImageData): THREE.Shape[] {
  const { width, height } = data;
  const mask = maskFromImage(data);
  const minArea = Math.max(12, width * height * 0.0015);
  const rawLoops = traceContours(mask, width, height);
  let loops: Point[][] = [];
  for (const rawLoop of rawLoops) {
    const loop = simplifyClosedLoop(
      chaikin(simplifyClosedLoop(rawLoop, 1), 2),
      0.35,
    );
    if (Math.abs(signedArea(loop)) > minArea) loops.push(loop);
  }
  loops.sort((a, b) => Math.abs(signedArea(b)) - Math.abs(signedArea(a)));
  loops = loops.slice(0, 40);
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
    for (const path of parsed.paths) shapes.push(...path.toShapes());
  }
  if (shapes.length === 0) throw new Error("No fillable shapes in the SVG");
  return shapes;
}

function cleanShapes(shapes: THREE.Shape[]): THREE.Shape[] {
  const box = new THREE.Box2();
  for (const shape of shapes) {
    for (const point of shape.getPoints(4)) box.expandByPoint(point);
  }
  const size = Math.max(box.max.x - box.min.x, box.max.y - box.min.y, 1e-4);
  const epsilon = size * 0.0012;
  const clean = (points: THREE.Vector2[]) => {
    const loop: Point[] = points.map((p) => [p.x, p.y]);
    if (
      loop.length > 1 &&
      Math.hypot(
        loop[0][0] - loop[loop.length - 1][0],
        loop[0][1] - loop[loop.length - 1][1],
      ) < size * 1e-6
    ) {
      loop.pop();
    }
    return simplifyClosedLoop(loop, epsilon).map(
      ([x, y]) => new THREE.Vector2(x, y),
    );
  };
  const out: THREE.Shape[] = [];
  for (const shape of shapes) {
    const extracted = shape.extractPoints(16);
    const outline = clean(extracted.shape);
    if (outline.length < 3) continue;
    const next = new THREE.Shape(outline);
    for (const hole of extracted.holes) {
      const path = clean(hole);
      if (path.length >= 3) next.holes.push(new THREE.Path(path));
    }
    out.push(next);
  }
  return out.length ? out : shapes;
}

function extrudeShapes(
  shapes: THREE.Shape[],
  depth: number,
  bevel: number,
): THREE.BufferGeometry {
  const box = new THREE.Box2();
  for (const shape of shapes) {
    for (const point of shape.getPoints(4)) box.expandByPoint(point);
  }
  const size2d = Math.max(box.max.x - box.min.x, box.max.y - box.min.y, 1e-4);
  const depthUnits = depth * size2d;
  const bevelAmount = Math.min(bevel * depthUnits * 0.35, size2d * 0.03);
  const geometry = new THREE.ExtrudeGeometry(shapes, {
    depth: Math.max(depthUnits - bevelAmount * 2, depthUnits * 0.1),
    bevelEnabled: bevelAmount > 1e-4,
    bevelThickness: bevelAmount,
    bevelSize: bevelAmount * 0.9,
    bevelOffset: 0,
    bevelSegments: 2,
    curveSegments: 1,
  });
  geometry.rotateX(Math.PI);
  return geometry;
}

function disposeObject(root: THREE.Object3D) {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const materials = Array.isArray(mesh.material)
      ? mesh.material
      : [mesh.material];
    for (const material of materials) {
      if (!material) continue;
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) value.dispose();
      }
      material.dispose();
    }
  });
}

interface WireData {
  positions: Float32Array<ArrayBuffer>;
  indices: Uint32Array<ArrayBuffer>;
  edges: Float32Array<ArrayBuffer>;
  edgeCount: number;
  edgeVertices: Uint32Array;
  min: THREE.Vector3;
  max: THREE.Vector3;
  size: number;
  radius: number;
}

function extractWire(root: THREE.Object3D): WireData | null {
  root.updateMatrixWorld(true);
  const rootInverse = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const local = new THREE.Matrix4();
  const point = new THREE.Vector3();
  const raw: number[] = [];
  const rawTriangles: number[] = [];
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    const position = mesh.geometry.getAttribute("position");
    if (!position) return;
    local.multiplyMatrices(rootInverse, mesh.matrixWorld);
    const base = raw.length / 3;
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i).applyMatrix4(local);
      raw.push(point.x, point.y, point.z);
    }
    const index = mesh.geometry.index;
    const drawCount = index ? index.count : position.count;
    for (let i = 0; i + 2 < drawCount; i += 3) {
      if (index) {
        rawTriangles.push(
          base + index.getX(i),
          base + index.getX(i + 1),
          base + index.getX(i + 2),
        );
      } else {
        rawTriangles.push(base + i, base + i + 1, base + i + 2);
      }
    }
  });
  if (rawTriangles.length === 0) return null;

  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  for (let i = 0; i < raw.length; i += 3) {
    min.x = Math.min(min.x, raw[i]);
    min.y = Math.min(min.y, raw[i + 1]);
    min.z = Math.min(min.z, raw[i + 2]);
    max.x = Math.max(max.x, raw[i]);
    max.y = Math.max(max.y, raw[i + 1]);
    max.z = Math.max(max.z, raw[i + 2]);
  }
  const center = min.clone().add(max).multiplyScalar(0.5);
  const size = Math.max(max.x - min.x, max.y - min.y, max.z - min.z, 1e-6);

  const quantum = size * 1e-5;
  const remap = new Uint32Array(raw.length / 3);
  const lookup = new Map<string, number>();
  const welded: number[] = [];
  for (let i = 0; i < raw.length / 3; i++) {
    const x = raw[i * 3] - center.x;
    const y = raw[i * 3 + 1] - center.y;
    const z = raw[i * 3 + 2] - center.z;
    const key = `${Math.round(x / quantum)},${Math.round(y / quantum)},${Math.round(z / quantum)}`;
    let id = lookup.get(key);
    if (id === undefined) {
      id = welded.length / 3;
      lookup.set(key, id);
      welded.push(x, y, z);
    }
    remap[i] = id;
  }
  const positions = new Float32Array(welded);
  const vertexCount = positions.length / 3;

  const triangles: number[] = [];
  const normals: number[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();
  const ab = new THREE.Vector3();
  const ac = new THREE.Vector3();
  const minArea = size * size * 1e-12;
  for (let i = 0; i < rawTriangles.length; i += 3) {
    const i0 = remap[rawTriangles[i]];
    const i1 = remap[rawTriangles[i + 1]];
    const i2 = remap[rawTriangles[i + 2]];
    if (i0 === i1 || i1 === i2 || i0 === i2) continue;
    a.fromArray(positions, i0 * 3);
    b.fromArray(positions, i1 * 3);
    c.fromArray(positions, i2 * 3);
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    ab.cross(ac);
    const area = ab.length();
    if (area < minArea) continue;
    ab.divideScalar(area);
    triangles.push(i0, i1, i2);
    normals.push(ab.x, ab.y, ab.z);
  }
  if (triangles.length === 0) return null;

  const edgeMap = new Map<number, number[]>();
  for (let t = 0; t < triangles.length / 3; t++) {
    for (let e = 0; e < 3; e++) {
      const v0 = triangles[t * 3 + e];
      const v1 = triangles[t * 3 + ((e + 1) % 3)];
      const lo = Math.min(v0, v1);
      const hi = Math.max(v0, v1);
      const key = lo * vertexCount + hi;
      const record = edgeMap.get(key);
      if (!record) {
        edgeMap.set(key, [lo, hi, t, -1, 1]);
      } else {
        if (record[4] === 1) record[3] = t;
        record[4]++;
      }
    }
  }

  const edgeCount = edgeMap.size;
  const edges = new Float32Array(edgeCount * EDGE_STRIDE);
  const edgeVertices = new Uint32Array(edgeCount * 2);
  let e = 0;
  for (const [v0, v1, f1, f2, faceCount] of edgeMap.values()) {
    const o = e * EDGE_STRIDE;
    edges[o] = positions[v0 * 3];
    edges[o + 1] = positions[v0 * 3 + 1];
    edges[o + 2] = positions[v0 * 3 + 2];
    edges[o + 3] = positions[v1 * 3];
    edges[o + 4] = positions[v1 * 3 + 1];
    edges[o + 5] = positions[v1 * 3 + 2];
    const n2 = faceCount === 2 ? f2 : f1;
    edges[o + 6] = normals[f1 * 3];
    edges[o + 7] = normals[f1 * 3 + 1];
    edges[o + 8] = normals[f1 * 3 + 2];
    edges[o + 9] = normals[n2 * 3];
    edges[o + 10] = normals[n2 * 3 + 1];
    edges[o + 11] = normals[n2 * 3 + 2];
    edges[o + 12] =
      faceCount === 2
        ? edges[o + 6] * edges[o + 9] +
          edges[o + 7] * edges[o + 10] +
          edges[o + 8] * edges[o + 11]
        : -2;
    edgeVertices[e * 2] = v0;
    edgeVertices[e * 2 + 1] = v1;
    e++;
  }

  const centeredMin = min.clone().sub(center);
  const centeredMax = max.clone().sub(center);
  return {
    positions,
    indices: new Uint32Array(triangles),
    edges,
    edgeCount,
    edgeVertices,
    min: centeredMin,
    max: centeredMax,
    size,
    radius: centeredMax.length(),
  };
}

function findNodes(
  data: WireData,
  creaseCos: number,
): Float32Array<ArrayBuffer> {
  const { edges, edgeVertices, edgeCount, positions } = data;
  const vertexCount = positions.length / 3;
  const valence = new Uint16Array(vertexCount);
  const firstDir = new Float32Array(vertexCount * 3);
  const turn = new Float32Array(vertexCount);
  for (let e = 0; e < edgeCount; e++) {
    const crease = edges[e * EDGE_STRIDE + 12];
    if (!(crease < -1.5 || crease < creaseCos)) continue;
    const v0 = edgeVertices[e * 2];
    const v1 = edgeVertices[e * 2 + 1];
    let dx = positions[v1 * 3] - positions[v0 * 3];
    let dy = positions[v1 * 3 + 1] - positions[v0 * 3 + 1];
    let dz = positions[v1 * 3 + 2] - positions[v0 * 3 + 2];
    const len = Math.hypot(dx, dy, dz) || 1;
    dx /= len;
    dy /= len;
    dz /= len;
    for (const [v, sign] of [
      [v0, 1],
      [v1, -1],
    ] as const) {
      const n = valence[v]++;
      if (n === 0) {
        firstDir[v * 3] = dx * sign;
        firstDir[v * 3 + 1] = dy * sign;
        firstDir[v * 3 + 2] = dz * sign;
      } else if (n === 1) {
        turn[v] =
          firstDir[v * 3] * dx * sign +
          firstDir[v * 3 + 1] * dy * sign +
          firstDir[v * 3 + 2] * dz * sign;
      }
    }
  }
  const candidates: { v: number; score: number; weight: number }[] = [];
  const sharpTurn = Math.cos((145 * Math.PI) / 180);
  for (let v = 0; v < vertexCount; v++) {
    const n = valence[v];
    if (n >= 3) candidates.push({ v, score: 2 + n, weight: Math.min(n / 4, 1) });
    else if (n === 1) candidates.push({ v, score: 1.5, weight: 0.35 });
    else if (n === 2 && turn[v] > sharpTurn) {
      candidates.push({ v, score: 1 + (turn[v] - sharpTurn), weight: 0.5 });
    }
  }
  candidates.sort((a, b) => b.score - a.score);
  const spacing = data.size * 0.04;
  const cell = spacing;
  const grid = new Map<string, number[]>();
  const accepted: number[] = [];
  for (const candidate of candidates) {
    if (accepted.length / NODE_STRIDE >= MAX_NODES) break;
    const x = positions[candidate.v * 3];
    const y = positions[candidate.v * 3 + 1];
    const z = positions[candidate.v * 3 + 2];
    const gx = Math.floor(x / cell);
    const gy = Math.floor(y / cell);
    const gz = Math.floor(z / cell);
    let blocked = false;
    for (let ix = -1; ix <= 1 && !blocked; ix++) {
      for (let iy = -1; iy <= 1 && !blocked; iy++) {
        for (let iz = -1; iz <= 1 && !blocked; iz++) {
          const list = grid.get(`${gx + ix},${gy + iy},${gz + iz}`);
          if (!list) continue;
          for (const index of list) {
            if (
              Math.hypot(
                accepted[index] - x,
                accepted[index + 1] - y,
                accepted[index + 2] - z,
              ) < spacing
            ) {
              blocked = true;
              break;
            }
          }
        }
      }
    }
    if (blocked) continue;
    const key = `${gx},${gy},${gz}`;
    const list = grid.get(key);
    if (list) list.push(accepted.length);
    else grid.set(key, [accepted.length]);
    accepted.push(x, y, z, candidate.weight);
  }
  return new Float32Array(accepted);
}

let colorProbe: CanvasRenderingContext2D | null | undefined;

function parseCssColor(value: string): [number, number, number, number] | null {
  if (typeof document === "undefined") return null;
  if (colorProbe === undefined) {
    const probe = document.createElement("canvas");
    probe.width = 1;
    probe.height = 1;
    colorProbe = probe.getContext("2d", { willReadFrequently: true });
  }
  if (!colorProbe) return null;
  colorProbe.clearRect(0, 0, 1, 1);
  colorProbe.fillStyle = "rgba(0, 0, 0, 0)";
  colorProbe.fillStyle = value;
  colorProbe.fillRect(0, 0, 1, 1);
  const [r, g, b, a] = colorProbe.getImageData(0, 0, 1, 1).data;
  return [r / 255, g / 255, b / 255, a / 255];
}

const colorCache = new Map<string, [number, number, number, number]>();

function cssColor(
  value: string,
  fallback: [number, number, number, number],
): [number, number, number, number] {
  const cached = colorCache.get(value);
  if (cached) return cached;
  const parsed = parseCssColor(value) ?? fallback;
  if (colorCache.size > 64) colorCache.clear();
  colorCache.set(value, parsed);
  return parsed;
}

interface ShapeSource {
  kind: "shapes";
  shapes: THREE.Shape[];
}

interface MeshSource {
  kind: "mesh";
  scene: THREE.Group;
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

const LINE_CORNERS = new Float32Array([0, -1, 0, 1, 1, -1, 1, 1]);
const NODE_CORNERS = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
const QUAD_INDEX = new Uint16Array([0, 2, 1, 1, 2, 3]);
const MAX_BLEND = {
  color: { src: "one", dst: "one", op: "max" },
  alpha: { src: "one", dst: "one", op: "max" },
} as const;

export function createWireframeObject(
  elements: WireframeObjectElements,
  options: WireframeObjectOptions = {},
): WireframeObjectInstance | null {
  if (!supportsWebGPU()) return null;
  const { canvas } = elements;
  const config: Required<WireframeObjectOptions> = {
    ...DEFAULTS,
    ...resolveOptions(DEFAULTS, options),
  };

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(config.fov, 1, 0.1, 200);
  camera.position.copy(CAMERA_DIR).multiplyScalar(config.cameraDistance);
  scene.add(camera);

  const floatGroup = new THREE.Group();
  floatGroup.position.y = MODEL_LIFT;
  const fitGroup = new THREE.Group();
  floatGroup.add(fitGroup);
  const modelRoot = new THREE.Group();
  fitGroup.add(modelRoot);
  scene.add(floatGroup);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.enablePan = false;

  let gpu: Gpu | null = null;
  let screen: Surface | null = null;
  let sceneTarget: Target | null = null;
  let compositeFx: Effect | null = null;
  let nearestSampler: GPUSampler | null = null;
  let fallback2d: CanvasRenderingContext2D | null = null;

  let wire: WireData | null = null;
  let nodeData: Float32Array<ArrayBuffer> | null = null;
  let builtNodeCos = Number.NaN;
  let prepassGeometry: Geometry | null = null;
  let lineGeometry: Geometry | null = null;
  let nodeGeometry: Geometry | null = null;
  let prepassDraw: Draw | null = null;
  let hiddenLineDraw: Draw | null = null;
  let visibleLineDraw: Draw | null = null;
  let nodeDraw: Draw | null = null;

  function destroyNodeGpu() {
    nodeGeometry?.destroy();
    nodeGeometry = null;
    nodeDraw = null;
  }

  function destroyWireGpu() {
    destroyNodeGpu();
    prepassGeometry?.destroy();
    lineGeometry?.destroy();
    prepassGeometry = null;
    lineGeometry = null;
    prepassDraw = null;
    hiddenLineDraw = null;
    visibleLineDraw = null;
  }

  function uploadNodes() {
    destroyNodeGpu();
    if (!gpu || !nodeData || nodeData.length === 0) return;
    nodeGeometry = geometry(gpu, {
      buffers: [
        { data: NODE_CORNERS, stride: 8, attributes: { corner: "float32x2" } },
        {
          data: nodeData,
          stride: NODE_STRIDE * 4,
          stepMode: "instance",
          attributes: { center: "float32x3", weight: "float32" },
        },
      ],
      indices: QUAD_INDEX,
      instanceCount: nodeData.length / NODE_STRIDE,
      topology: "triangle-list",
      label: "wireframe-object.nodes",
    });
    nodeDraw = draw(gpu, {
      shader: NODE_SHADER,
      geometry: nodeGeometry,
      blend: "premultiplied",
      depth: { write: false, compare: "less-equal" },
      label: "wireframe-object.nodes",
    });
  }

  function uploadWire() {
    destroyWireGpu();
    if (!gpu || !wire) return;
    prepassGeometry = geometry(gpu, {
      buffers: [
        { data: wire.positions, stride: 12, attributes: { position: "float32x3" } },
      ],
      indices: wire.indices,
      topology: "triangle-list",
      label: "wireframe-object.prepass",
    });
    prepassDraw = draw(gpu, {
      shader: PREPASS_SHADER,
      geometry: prepassGeometry,
      writeMask: [],
      depth: { write: true, compare: "less-equal", bias: 2, biasSlopeScale: 2 },
      label: "wireframe-object.prepass",
    });
    lineGeometry = geometry(gpu, {
      buffers: [
        { data: LINE_CORNERS, stride: 8, attributes: { corner: "float32x2" } },
        {
          data: wire.edges,
          stride: EDGE_STRIDE * 4,
          stepMode: "instance",
          attributes: {
            edgeStart: "float32x3",
            edgeEnd: "float32x3",
            normalA: "float32x3",
            normalB: "float32x3",
            crease: "float32",
          },
        },
      ],
      indices: QUAD_INDEX,
      instanceCount: wire.edgeCount,
      topology: "triangle-list",
      label: "wireframe-object.lines",
    });
    hiddenLineDraw = draw(gpu, {
      shader: LINE_SHADER,
      geometry: lineGeometry,
      blend: MAX_BLEND,
      depth: { write: false, compare: "greater" },
      label: "wireframe-object.hidden-lines",
    });
    visibleLineDraw = draw(gpu, {
      shader: LINE_SHADER,
      geometry: lineGeometry,
      blend: MAX_BLEND,
      depth: { write: false, compare: "less-equal" },
      label: "wireframe-object.lines",
    });
    uploadNodes();
  }

  function buildNodes() {
    if (!wire) {
      nodeData = null;
      destroyNodeGpu();
      return;
    }
    const creaseCos = Math.cos((config.creaseAngle * Math.PI) / 180);
    builtNodeCos = creaseCos;
    nodeData = findNodes(wire, creaseCos);
    uploadNodes();
  }

  function clearWire() {
    destroyWireGpu();
    wire = null;
    nodeData = null;
    builtNodeCos = Number.NaN;
  }

  function mountWire(data: WireData) {
    clearWire();
    wire = data;
    applyFit();
    const creaseCos = Math.cos((config.creaseAngle * Math.PI) / 180);
    builtNodeCos = creaseCos;
    nodeData = findNodes(wire, creaseCos);
    uploadWire();
  }

  let assetSource: ShapeSource | MeshSource | null = null;
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
    if (!wire) return;
    fitGroup.scale.setScalar(config.scale / wire.size);
  }

  function clearAsset() {
    if (assetSource?.kind === "mesh") disposeObject(assetSource.scene);
    assetSource = null;
    builtDepth = -1;
    builtBevel = -1;
    clearWire();
  }

  function buildModel() {
    if (!assetSource) return;
    if (assetSource.kind === "mesh") {
      if (wire) return;
      const data = extractWire(assetSource.scene);
      if (!data) throw new Error("The model has no triangles to draw");
      mountWire(data);
      return;
    }
    const depth = Math.min(Math.max(config.depth, 0.01), 1);
    const bevel = Math.min(Math.max(config.bevel, 0), 1);
    if (wire && depth === builtDepth && bevel === builtBevel) return;
    builtDepth = depth;
    builtBevel = bevel;
    const geometry = extrudeShapes(assetSource.shapes, depth, bevel);
    const mesh = new THREE.Mesh(geometry);
    const data = extractWire(mesh);
    geometry.dispose();
    (mesh.material as THREE.Material).dispose();
    if (data) mountWire(data);
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
        const shapes = cleanShapes(shapesFromSvg(new TextDecoder().decode(bytes)));
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

  function applyOptions() {
    controls.enableRotate = config.orbit;
    controls.enableZoom = config.zoom;
    controls.autoRotate = config.autoRotate && !reducedMotion;
    controls.autoRotateSpeed = config.autoRotateSpeed;
    camera.fov = fitFov(config.fov, camera.aspect);
    camera.updateProjectionMatrix();
    floatGroup.position.x = config.xOffset;
    floatGroup.position.y = MODEL_LIFT + config.yOffset;
    applyFit();
    buildModel();
    if (wire && Math.cos((config.creaseAngle * Math.PI) / 180) !== builtNodeCos) {
      buildNodes();
    }
  }

  let pixelRatio = 1;
  let fullWidth = 1;
  let fullHeight = 1;

  function resize() {
    const width = Math.max(canvas.clientWidth, 1);
    const height = Math.max(canvas.clientHeight, 1);
    pixelRatio = getCanvasPixelRatio(canvas);
    fullWidth = Math.max(Math.round(width * pixelRatio), 1);
    fullHeight = Math.max(Math.round(height * pixelRatio), 1);
    if (screen) {
      if (screen.size[0] !== fullWidth || screen.size[1] !== fullHeight) {
        screen.resize([fullWidth, fullHeight]);
      }
    } else {
      canvas.width = fullWidth;
      canvas.height = fullHeight;
    }
    if (
      sceneTarget &&
      (sceneTarget.size[0] !== fullWidth || sceneTarget.size[1] !== fullHeight)
    ) {
      sceneTarget.resize([fullWidth, fullHeight]);
      compositeFx?.set({ tScene: sceneTarget });
    }
    camera.aspect = width / height;
    camera.fov = fitFov(config.fov, camera.aspect);
    camera.updateProjectionMatrix();
  }

  let themeColor: [number, number, number, number] = [0.1, 0.1, 0.1, 1];
  let themeReadAt = -Infinity;
  function readThemeColor(now: number) {
    if (now - themeReadAt < 250) return;
    themeReadAt = now;
    const computed = getComputedStyle(canvas).color;
    if (computed) themeColor = cssColor(computed, themeColor);
  }

  const modelCenter = new THREE.Vector3();
  const viewCenter = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();
  const cameraPos = new THREE.Vector3();

  function backgroundColor(): [number, number, number, number] {
    return config.background ? cssColor(config.background, [0, 0, 0, 0]) : [0, 0, 0, 0];
  }

  function frameUniforms(now: number) {
    readThemeColor(now);
    const lineColor = config.lineColor
      ? cssColor(config.lineColor, themeColor)
      : themeColor;
    const accent = config.nodeColor ? cssColor(config.nodeColor, lineColor) : lineColor;

    camera.updateMatrixWorld();
    scene.updateMatrixWorld(true);
    normalMatrix.getNormalMatrix(modelRoot.matrixWorld);
    cameraPos.setFromMatrixPosition(camera.matrixWorld);

    const lineWidth = Math.max(config.lineWidth, 0) * pixelRatio;
    const glow = Math.min(Math.max(config.glow, 0), 1);
    const scan = reducedMotion ? 0 : Math.max(config.scan, 0);
    modelCenter.setFromMatrixPosition(floatGroup.matrixWorld);
    viewCenter.copy(modelCenter).applyMatrix4(camera.matrixWorldInverse);

    return {
      model: modelRoot.matrixWorld.elements,
      view: camera.matrixWorldInverse.elements,
      proj: camera.projectionMatrix.elements,
      normalMatrix: normalMatrix.elements,
      cameraPos: [cameraPos.x, cameraPos.y, cameraPos.z, 1],
      lineColor,
      accent,
      resolution: [fullWidth, fullHeight],
      boundsY: wire ? [wire.min.y, wire.max.y] : [-1, 1],
      lineWidth,
      glowRadius: glow > 0 ? (2 + lineWidth * 1.5) * glow * pixelRatio : 0,
      glow,
      creaseCos: Math.cos(
        (Math.min(Math.max(config.creaseAngle, 0), 180) * Math.PI) / 180,
      ),
      topology: Math.min(Math.max(config.topology, 0), 1),
      scan,
      scanPos: -0.3 + ((scanClock * 0.16) % 1) * 1.6,
      centerDist: -viewCenter.z,
      radius: wire ? wire.radius * fitGroup.scale.x : 1,
      depthFade: Math.min(Math.max(config.depthFade, 0), 1),
      opacity: Math.min(Math.max(config.opacity, 0), 1),
      hidden: 0,
      dash: 6 * pixelRatio,
      nodeSize: config.nodes ? Math.max(config.nodeSize, 0) * pixelRatio : 0,
    };
  }

  function renderFallback() {
    if (!fallback2d) return;
    fallback2d.clearRect(0, 0, canvas.width, canvas.height);
    if (config.background) {
      fallback2d.fillStyle = config.background;
      fallback2d.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  function render(now: number) {
    if (!gpu || !screen || !sceneTarget || !compositeFx) return;
    const values = frameUniforms(now);
    const hiddenOpacity = Math.min(Math.max(config.hiddenLines, 0), 1);
    const showNodes = config.nodes && config.nodeSize > 0;
    prepassDraw?.set({ u: values });
    visibleLineDraw?.set({ u: values });
    hiddenLineDraw?.set({ u: { ...values, hidden: hiddenOpacity } });
    if (showNodes) nodeDraw?.set({ u: values });
    compositeFx.set({ params: { background: backgroundColor() } });
    gpuFrame(gpu, (f) => {
      f.pass({ target: sceneTarget!, clear: [0, 0, 0, 0], clearDepth: 1 }, (pass) => {
        if (prepassDraw) pass.draw(prepassDraw);
        if (hiddenLineDraw && hiddenOpacity > 0) pass.draw(hiddenLineDraw);
        if (visibleLineDraw) pass.draw(visibleLineDraw);
        if (nodeDraw && showNodes) pass.draw(nodeDraw);
      });
      f.pass({ target: screen!, clear: [0, 0, 0, 0] }, compositeFx!);
    });
  }

  let inView = true;
  let pageVisible =
    typeof document === "undefined" || document.visibilityState !== "hidden";
  let loopRunning = false;
  let raf = 0;
  let lastTime = 0;
  let elapsed = Math.random() * 100;
  let scanClock = 0;

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
      scanClock += delta * Math.max(config.scanSpeed, 0);
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

  resize();
  applyOptions();
  loadAsset();

  acquireGpu()
    .then((device) => {
      if (disposed) return;
      gpu = device;
      screen = surface(gpu, canvas, {
        autoResize: false,
        alphaMode: "premultiplied",
        label: "wireframe-object",
      });
      nearestSampler = sampler(gpu, {
        minFilter: "nearest",
        magFilter: "nearest",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge",
      });
      sceneTarget = target(gpu, {
        size: [1, 1],
        colors: [{ format: "rgba8unorm" }],
        depth: true,
        label: "wireframe-object.scene",
      });
      compositeFx = gpuEffect(gpu, COMPOSITE_SHADER, {
        label: "wireframe-object.composite",
        set: { tScene: sceneTarget, sceneSampler: nearestSampler },
      });
      resize();
      uploadWire();
      startLoop();
    })
    .catch((error) => {
      if (disposed) return;
      console.warn(
        "WireframeObject: WebGPU unavailable, showing fallback canvas.",
        error,
      );
      fallback2d = canvas.getContext("2d");
      startLoop();
    });

  startLoop();

  return {
    setOptions(next: WireframeObjectOptions) {
      next = resolveOptions(DEFAULTS, next);
      let changed = false;
      for (const [key, value] of Object.entries(next)) {
        if (typeof value === "function") continue;
        if (config[key as keyof WireframeObjectOptions] !== value) {
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
      try {
        applyOptions();
      } catch (error) {
        config.onError?.(error);
      }
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
      clearAsset();
      (sceneTarget as unknown as { destroy?: () => void } | null)?.destroy?.();
      screen?.dispose();
      draco.dispose();
    },
  };
}

