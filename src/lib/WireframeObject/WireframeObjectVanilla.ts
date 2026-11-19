import { getCanvasPixelRatio, createCanvasResizeObserver } from "../canvas-viewport";
import { resolveOptions } from "../options";
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

const PREPASS_VERT = `
precision highp float;
uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uProj;
in vec3 position;
void main() {
  gl_Position = uProj * uView * uModel * vec4(position, 1.0);
}`;

const PREPASS_FRAG = `
precision highp float;
out vec4 outColor;
void main() {
  outColor = vec4(0.0);
}`;

const LINE_VERT = `
precision highp float;
uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uProj;
uniform mat3 uNormalMatrix;
uniform vec3 uCameraPos;
uniform vec2 uResolution;
uniform vec2 uBoundsY;
uniform float uLineWidth;
uniform float uGlowRadius;
uniform float uCreaseCos;
uniform float uTopology;
uniform float uScan;
uniform float uScanPos;
uniform float uCenterDist;
uniform float uRadius;
uniform float uDepthFade;
uniform float uHidden;

in vec2 aCorner;
in vec3 iStart;
in vec3 iEnd;
in vec3 iN1;
in vec3 iN2;
in float iCrease;

out vec2 vLocalW;
out float vW;
out float vLen;
out float vWeight;
out float vWidth;
out float vScan;
out float vFade;

void collapse() {
  gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  vLocalW = vec2(0.0);
  vW = 1.0;
  vLen = 0.0;
  vWeight = 0.0;
  vWidth = 0.0;
  vScan = 0.0;
  vFade = 0.0;
}

void main() {
  vec4 wa = uModel * vec4(iStart, 1.0);
  vec4 wb = uModel * vec4(iEnd, 1.0);
  vec3 n1 = normalize(uNormalMatrix * iN1);
  vec3 n2 = normalize(uNormalMatrix * iN2);
  vec3 toCam = uCameraPos - 0.5 * (wa.xyz + wb.xyz);
  float facing = dot(n1, toCam) * dot(n2, toCam);
  float boundary = 1.0 - step(-1.5, iCrease);
  float crease = max(boundary, 1.0 - step(uCreaseCos, iCrease));
  float silhouette = (1.0 - boundary) * (1.0 - step(0.0, facing));
  float feature = max(crease, silhouette);

  vec3 objPos = mix(iStart, iEnd, aCorner.x);
  float yNorm = (objPos.y - uBoundsY.x) / max(uBoundsY.y - uBoundsY.x, 1e-5);
  float scanD = (yNorm - uScanPos) / ${SCAN_WIDTH.toFixed(3)};
  float scan = uScan * exp(-scanD * scanD);
  float structural = 1.0 - step(0.99995, iCrease);
  float weight = uHidden > 0.5 ? feature : max(feature, structural * max(uTopology, scan * 0.4));
  if (weight <= 0.001) {
    collapse();
    return;
  }
  float contour = max(boundary, silhouette);
  float width = uLineWidth * (feature > 0.5 ? mix(0.7, 1.0, contour) : 0.55);
  weight *= feature > 0.5 ? mix(0.85, 1.0, contour) : 1.0;

  vec4 va = uView * wa;
  vec4 vb = uView * wb;
  va.xyz *= 0.9985;
  vb.xyz *= 0.9985;
  vec4 ca = uProj * va;
  vec4 cb = uProj * vb;
  if (ca.w < 1e-3 || cb.w < 1e-3) {
    collapse();
    return;
  }
  vec2 sa = (ca.xy / ca.w * 0.5 + 0.5) * uResolution;
  vec2 sb = (cb.xy / cb.w * 0.5 + 0.5) * uResolution;
  vec2 dir = sb - sa;
  float len = length(dir);
  vec2 d = len > 1e-4 ? dir / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-d.y, d.x);
  float halfW = max(width * 0.5, 0.5) + 1.0 + uGlowRadius;
  float along = aCorner.x * len + (aCorner.x * 2.0 - 1.0) * halfW;
  float across = aCorner.y * halfW;
  vec2 screen = sa + d * along + nrm * across;
  vec4 clip = aCorner.x < 0.5 ? ca : cb;
  gl_Position = vec4((screen / uResolution * 2.0 - 1.0) * clip.w, clip.z, clip.w);
  vLocalW = vec2(along, across) * clip.w;
  vW = clip.w;
  vLen = len;
  vWeight = weight;
  vWidth = width;
  vScan = scan;
  float viewDist = aCorner.x < 0.5 ? -va.z : -vb.z;
  float near01 = clamp((uCenterDist - viewDist) / max(uRadius, 1e-4) * 0.5 + 0.5, 0.0, 1.0);
  vFade = 1.0 - uDepthFade * (1.0 - near01);
}`;

const LINE_FRAG = `
precision highp float;
uniform vec4 uLineColor;
uniform vec4 uAccent;
uniform float uGlow;
uniform float uGlowRadius;
uniform float uOpacity;
uniform float uHidden;
uniform float uDash;

in vec2 vLocalW;
in float vW;
in float vLen;
in float vWeight;
in float vWidth;
in float vScan;
in float vFade;

out vec4 outColor;

void main() {
  vec2 local = vLocalW / vW;
  float along = local.x;
  vec2 q = vec2(along - clamp(along, 0.0, vLen), local.y);
  float dist = length(q);
  float core = max(vWidth * 0.5, 0.5);
  float coverage = clamp(vWidth, 0.0, 1.0);
  float line = (1.0 - smoothstep(core - 0.5, core + 0.5, dist)) * coverage;
  float alpha;
  if (uHidden > 0.0) {
    float phase = fract(along / uDash);
    float soft = 1.0 / uDash;
    float dash = smoothstep(0.0, soft, phase) * (1.0 - smoothstep(0.5, 0.5 + soft, phase));
    alpha = line * dash * uHidden;
  } else {
    float halo = uGlowRadius > 0.0
      ? exp(-dist * dist / (uGlowRadius * uGlowRadius * 0.3)) * uGlow * 0.2
      : 0.0;
    alpha = max(line, halo) * (1.0 + vScan * 0.5);
  }
  alpha = clamp(alpha * vWeight * vFade * uOpacity * uLineColor.a, 0.0, 1.0);
  if (alpha < 0.002) discard;
  vec3 color = mix(uLineColor.rgb, uAccent.rgb, clamp(vScan * 0.9, 0.0, 1.0));
  outColor = vec4(color * alpha, alpha);
}`;

const NODE_VERT = `
precision highp float;
uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uProj;
uniform vec2 uResolution;
uniform vec2 uBoundsY;
uniform float uNodeSize;
uniform float uGlow;
uniform float uScan;
uniform float uScanPos;
uniform float uCenterDist;
uniform float uRadius;
uniform float uDepthFade;

in vec2 aCorner;
in vec3 iCenter;
in float iWeight;

out vec2 vOffsetW;
out float vW;
out float vRadius;
out float vScan;
out float vFade;

void main() {
  vec4 v = uView * uModel * vec4(iCenter, 1.0);
  v.xyz *= 0.997;
  vec4 c = uProj * v;
  if (c.w < 1e-3) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
    vOffsetW = vec2(0.0);
    vW = 1.0;
    vRadius = 0.0;
    vScan = 0.0;
    vFade = 0.0;
    return;
  }
  float yNorm = (iCenter.y - uBoundsY.x) / max(uBoundsY.y - uBoundsY.x, 1e-5);
  float scanD = (yNorm - uScanPos) / ${SCAN_WIDTH.toFixed(3)};
  float scan = uScan * exp(-scanD * scanD);
  float radius = uNodeSize * mix(0.8, 1.2, clamp(iWeight, 0.0, 1.0)) * (1.0 + scan * 0.6);
  float extent = radius * (1.0 + 2.0 * uGlow) + 1.5;
  vec2 offset = aCorner * extent;
  gl_Position = vec4(c.xy + offset / uResolution * 2.0 * c.w, c.z, c.w);
  vOffsetW = offset * c.w;
  vW = c.w;
  vRadius = radius;
  vScan = scan;
  float near01 = clamp((uCenterDist + v.z) / max(uRadius, 1e-4) * 0.5 + 0.5, 0.0, 1.0);
  vFade = 1.0 - uDepthFade * (1.0 - near01);
}`;

const NODE_FRAG = `
precision highp float;
uniform vec4 uAccent;
uniform float uGlow;
uniform float uOpacity;

in vec2 vOffsetW;
in float vW;
in float vRadius;
in float vScan;
in float vFade;

out vec4 outColor;

void main() {
  float d = length(vOffsetW / vW);
  float core = 1.0 - smoothstep(vRadius - 0.75, vRadius + 0.75, d);
  float haloR = vRadius * (1.0 + 2.0 * uGlow) + 0.5;
  float fall = 1.0 - smoothstep(vRadius * 0.6, haloR, d);
  float halo = fall * fall * uGlow * (0.5 + vScan * 0.35);
  float hot = (1.0 - smoothstep(0.0, vRadius, d)) * 0.35 * core;
  vec3 color = mix(uAccent.rgb, vec3(1.0), hot);
  float alpha = clamp(max(core, halo) * vFade * uOpacity * uAccent.a, 0.0, 1.0);
  if (alpha < 0.002) discard;
  outColor = vec4(color * alpha, alpha);
}`;

const COMPOSITE_VERT = `
precision highp float;
in vec2 position;
out vec2 vUv;
void main() {
  vUv = position * 0.5 + 0.5;
  gl_Position = vec4(position, 0.0, 1.0);
}`;

const COMPOSITE_FRAG = `
precision highp float;
uniform sampler2D tScene;
uniform vec4 uBackground;
in vec2 vUv;
out vec4 outColor;
void main() {
  vec4 drawing = texture(tScene, vUv);
  vec3 background = uBackground.rgb * uBackground.a;
  outColor = vec4(
    drawing.rgb + background * (1.0 - drawing.a),
    drawing.a + uBackground.a * (1.0 - drawing.a)
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

function unboundedSphere() {
  return new THREE.Sphere(new THREE.Vector3(), Infinity);
}

export function createWireframeObject(
  elements: WireframeObjectElements,
  options: WireframeObjectOptions = {},
): WireframeObjectInstance | null {
  const { canvas } = elements;
  const config: Required<WireframeObjectOptions> = {
    ...DEFAULTS,
    ...resolveOptions(DEFAULTS, options),
  };

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: true,
      premultipliedAlpha: true,
      powerPreference: "high-performance",
    });
  } catch {
    return null;
  }
  renderer.setClearColor(0x000000, 0);
  renderer.autoClear = false;

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

  const sceneTarget = new THREE.WebGLRenderTarget(1, 1, {
    depthBuffer: true,
    stencilBuffer: false,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
    generateMipmaps: false,
  });

  const uniforms = {
    uModel: { value: new THREE.Matrix4() },
    uView: { value: new THREE.Matrix4() },
    uProj: { value: new THREE.Matrix4() },
    uNormalMatrix: { value: new THREE.Matrix3() },
    uCameraPos: { value: new THREE.Vector3() },
    uResolution: { value: new THREE.Vector2(1, 1) },
    uBoundsY: { value: new THREE.Vector2(-1, 1) },
    uLineColor: { value: new THREE.Vector4(0, 0, 0, 1) },
    uAccent: { value: new THREE.Vector4(0, 0, 0, 1) },
    uLineWidth: { value: 1 },
    uGlowRadius: { value: 0 },
    uGlow: { value: 0 },
    uCreaseCos: { value: 0 },
    uTopology: { value: 0 },
    uScan: { value: 0 },
    uScanPos: { value: -1 },
    uCenterDist: { value: 4 },
    uRadius: { value: 1 },
    uDepthFade: { value: 0 },
    uOpacity: { value: 1 },
    uDash: { value: 6 },
    uNodeSize: { value: 2 },
  };

  const prepassMaterial = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: PREPASS_VERT,
    fragmentShader: PREPASS_FRAG,
    uniforms,
    side: THREE.DoubleSide,
    colorWrite: false,
    depthWrite: true,
    depthTest: true,
    polygonOffset: true,
    polygonOffsetFactor: 2,
    polygonOffsetUnits: 2,
  });

  const lineMaterial = (hidden: boolean) =>
    new THREE.RawShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: LINE_VERT,
      fragmentShader: LINE_FRAG,
      uniforms: { ...uniforms, uHidden: { value: 0 } },
      transparent: true,
      side: THREE.DoubleSide,
      depthTest: true,
      depthWrite: false,
      depthFunc: hidden ? THREE.GreaterDepth : THREE.LessEqualDepth,
      blending: THREE.CustomBlending,
      blendEquation: THREE.MaxEquation,
      blendEquationAlpha: THREE.MaxEquation,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneFactor,
    });
  const hiddenLineMaterial = lineMaterial(true);
  const visibleLineMaterial = lineMaterial(false);

  const nodeMaterial = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: NODE_VERT,
    fragmentShader: NODE_FRAG,
    uniforms,
    transparent: true,
    side: THREE.DoubleSide,
    depthTest: true,
    depthWrite: false,
    depthFunc: THREE.LessEqualDepth,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendEquationAlpha: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
  });

  const compositeMaterial = new THREE.RawShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: COMPOSITE_VERT,
    fragmentShader: COMPOSITE_FRAG,
    uniforms: {
      tScene: { value: sceneTarget.texture },
      uBackground: { value: new THREE.Vector4(0, 0, 0, 0) },
    },
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending,
  });
  const compositeGeometry = new THREE.BufferGeometry();
  compositeGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array([-1, -1, 3, -1, -1, 3]), 2),
  );
  compositeGeometry.boundingSphere = unboundedSphere();
  const compositeMesh = new THREE.Mesh(compositeGeometry, compositeMaterial);
  compositeMesh.frustumCulled = false;
  const compositeScene = new THREE.Scene();
  compositeScene.add(compositeMesh);
  const compositeCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const lineCorners = new THREE.BufferAttribute(
    new Float32Array([0, -1, 0, 1, 1, -1, 1, 1]),
    2,
  );
  const nodeCorners = new THREE.BufferAttribute(
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    2,
  );
  const quadIndex = [0, 2, 1, 1, 2, 3];

  let wire: WireData | null = null;
  let prepassMesh: THREE.Mesh | null = null;
  let hiddenLines: THREE.Mesh | null = null;
  let visibleLines: THREE.Mesh | null = null;
  let nodeMesh: THREE.Mesh | null = null;
  let builtNodeCos = Number.NaN;

  function clearNodes() {
    if (!nodeMesh) return;
    modelRoot.remove(nodeMesh);
    nodeMesh.geometry.dispose();
    nodeMesh = null;
  }

  function clearWire() {
    clearNodes();
    for (const mesh of [prepassMesh, hiddenLines, visibleLines]) {
      if (!mesh) continue;
      modelRoot.remove(mesh);
    }
    prepassMesh?.geometry.dispose();
    visibleLines?.geometry.dispose();
    prepassMesh = null;
    hiddenLines = null;
    visibleLines = null;
    wire = null;
    builtNodeCos = Number.NaN;
  }

  function buildNodes() {
    clearNodes();
    if (!wire) return;
    const creaseCos = Math.cos((config.creaseAngle * Math.PI) / 180);
    builtNodeCos = creaseCos;
    const nodes = findNodes(wire, creaseCos);
    const count = nodes.length / NODE_STRIDE;
    if (count === 0) return;
    const geometry = new THREE.InstancedBufferGeometry();
    geometry.setAttribute("aCorner", nodeCorners);
    geometry.setIndex(quadIndex);
    const buffer = new THREE.InstancedInterleavedBuffer(nodes, NODE_STRIDE);
    geometry.setAttribute("iCenter", new THREE.InterleavedBufferAttribute(buffer, 3, 0));
    geometry.setAttribute("iWeight", new THREE.InterleavedBufferAttribute(buffer, 1, 3));
    geometry.instanceCount = count;
    geometry.boundingSphere = unboundedSphere();
    nodeMesh = new THREE.Mesh(geometry, nodeMaterial);
    nodeMesh.frustumCulled = false;
    nodeMesh.renderOrder = 3;
    modelRoot.add(nodeMesh);
  }

  function mountWire(data: WireData) {
    clearWire();
    wire = data;
    const prepassGeometry = new THREE.BufferGeometry();
    prepassGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(data.positions, 3),
    );
    prepassGeometry.setIndex(new THREE.BufferAttribute(data.indices, 1));
    prepassGeometry.boundingSphere = unboundedSphere();
    prepassMesh = new THREE.Mesh(prepassGeometry, prepassMaterial);
    prepassMesh.frustumCulled = false;
    prepassMesh.renderOrder = 0;

    const lineGeometry = new THREE.InstancedBufferGeometry();
    lineGeometry.setAttribute("aCorner", lineCorners);
    lineGeometry.setIndex(quadIndex);
    const buffer = new THREE.InstancedInterleavedBuffer(data.edges, EDGE_STRIDE);
    lineGeometry.setAttribute("iStart", new THREE.InterleavedBufferAttribute(buffer, 3, 0));
    lineGeometry.setAttribute("iEnd", new THREE.InterleavedBufferAttribute(buffer, 3, 3));
    lineGeometry.setAttribute("iN1", new THREE.InterleavedBufferAttribute(buffer, 3, 6));
    lineGeometry.setAttribute("iN2", new THREE.InterleavedBufferAttribute(buffer, 3, 9));
    lineGeometry.setAttribute("iCrease", new THREE.InterleavedBufferAttribute(buffer, 1, 12));
    lineGeometry.instanceCount = data.edgeCount;
    lineGeometry.boundingSphere = unboundedSphere();

    hiddenLines = new THREE.Mesh(lineGeometry, hiddenLineMaterial);
    hiddenLines.frustumCulled = false;
    hiddenLines.renderOrder = 1;
    visibleLines = new THREE.Mesh(lineGeometry, visibleLineMaterial);
    visibleLines.frustumCulled = false;
    visibleLines.renderOrder = 2;
    modelRoot.add(prepassMesh, hiddenLines, visibleLines);
    applyFit();
    buildNodes();
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

  function resize() {
    const width = Math.max(canvas.clientWidth, 1);
    const height = Math.max(canvas.clientHeight, 1);
    pixelRatio = getCanvasPixelRatio(canvas, renderer.getContext());
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    const buffer = renderer.getDrawingBufferSize(new THREE.Vector2());
    sceneTarget.setSize(buffer.x, buffer.y);
    uniforms.uResolution.value.copy(buffer);
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

  function updateUniforms(now: number) {
    readThemeColor(now);
    const lineColor = config.lineColor
      ? cssColor(config.lineColor, themeColor)
      : themeColor;
    const accent = config.nodeColor ? cssColor(config.nodeColor, lineColor) : lineColor;
    const background = config.background
      ? cssColor(config.background, [0, 0, 0, 0])
      : ([0, 0, 0, 0] as [number, number, number, number]);
    uniforms.uLineColor.value.set(...lineColor);
    uniforms.uAccent.value.set(...accent);
    compositeMaterial.uniforms.uBackground.value.set(...background);

    camera.updateMatrixWorld();
    scene.updateMatrixWorld(true);
    uniforms.uModel.value.copy(modelRoot.matrixWorld);
    uniforms.uNormalMatrix.value.getNormalMatrix(modelRoot.matrixWorld);
    uniforms.uView.value.copy(camera.matrixWorldInverse);
    uniforms.uProj.value.copy(camera.projectionMatrix);
    uniforms.uCameraPos.value.setFromMatrixPosition(camera.matrixWorld);

    const lineWidth = Math.max(config.lineWidth, 0) * pixelRatio;
    const glow = Math.min(Math.max(config.glow, 0), 1);
    uniforms.uLineWidth.value = lineWidth;
    uniforms.uGlow.value = glow;
    uniforms.uGlowRadius.value = glow > 0 ? (2 + lineWidth * 1.5) * glow * pixelRatio : 0;
    uniforms.uCreaseCos.value = Math.cos(
      (Math.min(Math.max(config.creaseAngle, 0), 180) * Math.PI) / 180,
    );
    uniforms.uTopology.value = Math.min(Math.max(config.topology, 0), 1);
    uniforms.uOpacity.value = Math.min(Math.max(config.opacity, 0), 1);
    uniforms.uDepthFade.value = Math.min(Math.max(config.depthFade, 0), 1);
    uniforms.uDash.value = 6 * pixelRatio;
    uniforms.uNodeSize.value = config.nodes ? Math.max(config.nodeSize, 0) * pixelRatio : 0;
    hiddenLineMaterial.uniforms.uHidden.value = Math.min(Math.max(config.hiddenLines, 0), 1);

    const scan = reducedMotion ? 0 : Math.max(config.scan, 0);
    uniforms.uScan.value = scan;
    uniforms.uScanPos.value = -0.3 + ((scanClock * 0.16) % 1) * 1.6;

    if (wire) {
      uniforms.uBoundsY.value.set(wire.min.y, wire.max.y);
      uniforms.uRadius.value = wire.radius * fitGroup.scale.x;
    }
    modelCenter.setFromMatrixPosition(floatGroup.matrixWorld);
    viewCenter.copy(modelCenter).applyMatrix4(camera.matrixWorldInverse);
    uniforms.uCenterDist.value = -viewCenter.z;
  }

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
  let scanClock = 0;

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

    updateUniforms(time);
    if (nodeMesh) nodeMesh.visible = config.nodes && config.nodeSize > 0;
    if (hiddenLines) hiddenLines.visible = config.hiddenLines > 0;

    renderer.setRenderTarget(sceneTarget);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, false);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.clear(true, true, false);
    renderer.render(compositeScene, compositeCamera);
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
    resize,
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
      prepassMaterial.dispose();
      hiddenLineMaterial.dispose();
      visibleLineMaterial.dispose();
      nodeMaterial.dispose();
      compositeMaterial.dispose();
      compositeGeometry.dispose();
      sceneTarget.dispose();
      draco.dispose();
      renderer.dispose();
    },
  };
}
