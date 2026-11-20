import { getCanvasPixelRatio, createCanvasResizeObserver } from "../canvas-viewport";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { resolveOptions } from "../options";

export interface TopographicObjectOptions {
  /** URL of the asset to display: GLB/glTF, SVG, PNG, JPEG, WebP, or GIF. Object URLs from a file input work too. The format is sniffed from the bytes, not the extension. SVGs and transparent images rise into terrain shaped by their outline; opaque photos become terrain shaped by their brightness. */
  src?: string;
  /** Number of contour intervals from the lowest to the highest point. Spacing is fixed to the object, so lines never crawl as it turns. */
  lines?: number;
  /** Draw every Nth contour as a heavier index contour, like a survey map. 0 turns index contours off. */
  indexEvery?: number;
  /** Width of the regular contour lines in CSS pixels. */
  lineWidth?: number;
  /** Width of the index contours and the outline in CSS pixels. */
  indexWidth?: number;
  /** Color of the contour lines as any CSS color. Empty string follows the element's text color, so it adapts to light and dark themes. */
  lineColor?: string;
  /** Color of the index contours and the outline. Empty string uses the line color. */
  indexColor?: string;
  /** Strength of the soft surface tone between the lines: a faint tint of the line color that deepens where the surface turns away and steps up with elevation (0 to 1). 0 keeps the object as pure line work. */
  fill?: number;
  /** How much the light direction thickens lines on shaded slopes and thins them on lit ones (0 to 1). */
  shading?: number;
  /** Opacity of the outline: the coastline of 2D assets and the silhouette of 3D models (0 to 1). */
  outline?: number;
  /** Speed at which the contours climb the surface, in intervals per second. 0 keeps the map still. */
  drift?: number;
  /** Relief height of 2D assets (SVG or image) as a fraction of their longest side. */
  depth?: number;
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

export interface TopographicObjectElements {
  canvas: HTMLCanvasElement;
}

export interface TopographicObjectInstance {
  setOptions: (options: TopographicObjectOptions) => void;
  resize: () => void;
  destroy: () => void;
}

const DEFAULTS: Required<TopographicObjectOptions> = {
  src: "",
  lines: 14,
  indexEvery: 5,
  lineWidth: 1,
  indexWidth: 1.5,
  lineColor: "",
  indexColor: "",
  fill: 0.5,
  shading: 0.5,
  outline: 1,
  drift: 0,
  depth: 0.14,
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
const RASTER_SIZE = 512;
const GRID_CELLS = 224;
const REVEAL_MS = 1800;
const COLOR_POLL_MS = 250;

const VERTEX_SHADER = `
attribute float elevation;
attribute float edge;
varying vec3 vViewPos;
varying vec3 vViewNormal;
varying float vElevation;
varying float vEdge;

void main() {
  vec4 viewPos = modelViewMatrix * vec4(position, 1.0);
  vViewPos = viewPos.xyz;
  vViewNormal = normalMatrix * normal;
  vElevation = elevation;
  vEdge = edge;
  gl_Position = projectionMatrix * viewPos;
}`;

const FRAGMENT_SHADER = `
uniform vec4 uLineColor;
uniform vec4 uIndexColor;
uniform float uLines;
uniform float uIndexEvery;
uniform float uLineWidth;
uniform float uIndexWidth;
uniform float uPhase;
uniform float uFill;
uniform float uShading;
uniform float uOutline;
uniform float uReveal;
uniform float uTerrain;
varying vec3 vViewPos;
varying vec3 vViewNormal;
varying float vElevation;
varying float vEdge;

float lineMask(float t, float fw, float width) {
  float w = max(width, 1.0);
  float dist = abs(fract(t + 0.5) - 0.5) / fw;
  float cover = 1.0 - smoothstep(w * 0.5 - 0.5, w * 0.5 + 0.5, dist);
  float room = smoothstep(w * 1.6, w * 3.2, 1.0 / fw);
  return cover * clamp(width, 0.0, 1.0) * room;
}

void main() {
  float t = vElevation * uLines - uPhase;
  float fw = max(fwidth(t), 1e-5);
  float fwEdge = max(fwidth(vEdge), 1e-5);
  vec3 n = normalize(gl_FrontFacing ? vViewNormal : -vViewNormal);
  vec3 v = normalize(-vViewPos);
  float ndv = abs(dot(n, v));
  float fwRim = max(fwidth(ndv), 1e-5);
  if (vEdge < 0.0) discard;

  vec3 lightDir = normalize(vec3(-0.45, 0.6, 0.66));
  float ndl = max(dot(n, lightDir), 0.0);
  float weight = mix(1.0, 0.55 + 1.1 * (1.0 - ndl), uShading);

  float slope = smoothstep(0.0005, 0.002, fw);
  float level = vElevation * uLines;
  float aboveBase = smoothstep(0.15, 0.5, level) * (1.0 - smoothstep(uLines - 0.45, uLines - 0.15, level)) * slope;
  float minor = lineMask(t, fw, uLineWidth * weight) * aboveBase;
  float index = 0.0;
  if (uIndexEvery >= 1.0) {
    index = lineMask(t / uIndexEvery, fw / uIndexEvery, uIndexWidth * weight) * aboveBase;
  }
  float outlineWidth = max(uIndexWidth, 1.0);
  float coast = uTerrain * (1.0 - smoothstep(outlineWidth - 0.5, outlineWidth + 0.5, vEdge / fwEdge));
  float rim = (1.0 - uTerrain) * (1.0 - smoothstep(outlineWidth * 0.75 - 0.5, outlineWidth * 0.75 + 0.5, ndv / fwRim)) * smoothstep(0.002, 0.01, fwRim);
  float outline = max(coast, rim) * uOutline * clamp(uIndexWidth, 0.0, 1.0);

  float aIndex = max(index, outline) * uIndexColor.a;
  float aMinor = minor * 0.6 * uLineColor.a;
  float alpha = aIndex + aMinor * (1.0 - aIndex);
  vec3 color = uIndexColor.rgb * aIndex + uLineColor.rgb * aMinor * (1.0 - aIndex);

  float band = clamp(floor(t) / max(uLines - 1.0, 1.0), 0.0, 1.0);
  float turn = pow(1.0 - ndv, 1.5);
  float aFill = uFill * (0.03 + 0.2 * turn) * mix(0.75, 1.25, band) * uLineColor.a;
  color += uLineColor.rgb * aFill * (1.0 - alpha);
  alpha += aFill * (1.0 - alpha);

  float reveal = 1.0 - smoothstep(uReveal - 0.08, uReveal, vElevation);
  float coverage = clamp(vEdge / fwEdge + 0.5, 0.0, 1.0);
  gl_FragColor = vec4(color, alpha) * reveal * coverage;
}`;

type AssetKind = "glb" | "gltf" | "svg" | "bitmap";

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
    head = new TextDecoder()
      .decode(bytes.subarray(0, 2048))
      .replace(/^﻿/, "")
      .trimStart();
  } catch {
    return null;
  }
  if (head.startsWith("{")) return "gltf";
  if (head.startsWith("<")) return head.includes("<svg") ? "svg" : null;
  return null;
}

function svgAspect(text: string): number | null {
  const tag = /<svg\b[^>]*>/i.exec(text)?.[0];
  if (!tag) return null;
  const attr = (name: string) =>
    new RegExp(`\\s${name}\\s*=\\s*["']([^"']+)["']`, "i").exec(tag)?.[1];
  const width = parseFloat(attr("width") ?? "");
  const height = parseFloat(attr("height") ?? "");
  if (width > 0 && height > 0 && !/%/.test(attr("width") ?? "")) {
    return width / height;
  }
  const box = attr("viewBox")?.trim().split(/[\s,]+/).map(Number);
  if (box && box.length === 4 && box[2] > 0 && box[3] > 0) return box[2] / box[3];
  return null;
}

function decodeImage(blob: Blob): Promise<HTMLImageElement> {
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

interface Raster {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

async function rasterize(bytes: Uint8Array, kind: AssetKind): Promise<Raster> {
  const svgText = kind === "svg" ? new TextDecoder().decode(bytes) : "";
  const blob = new Blob([bytes as BlobPart], {
    type: kind === "svg" ? "image/svg+xml" : "",
  });
  const image = await decodeImage(blob);
  let aspect = image.naturalWidth > 0 && image.naturalHeight > 0
    ? image.naturalWidth / image.naturalHeight
    : 1;
  if (kind === "svg") aspect = svgAspect(svgText) ?? aspect;
  const contentW = aspect >= 1 ? RASTER_SIZE : Math.max(1, Math.round(RASTER_SIZE * aspect));
  const contentH = aspect >= 1 ? Math.max(1, Math.round(RASTER_SIZE / aspect)) : RASTER_SIZE;
  const pad = Math.round(RASTER_SIZE * 0.06);
  const canvas = document.createElement("canvas");
  canvas.width = contentW + pad * 2;
  canvas.height = contentH + pad * 2;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2d context unavailable");
  ctx.drawImage(image, pad, pad, contentW, contentH);
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
  return { data, width: canvas.width, height: canvas.height };
}

const EDT_INF = 1e20;

function edt1d(
  f: Float64Array,
  n: number,
  d: Float64Array,
  v: Int32Array,
  z: Float64Array,
) {
  let k = 0;
  v[0] = 0;
  z[0] = -EDT_INF;
  z[1] = EDT_INF;
  for (let q = 1; q < n; q++) {
    let s =
      (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++;
    v[k] = q;
    z[k] = s;
    z[k + 1] = EDT_INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    const dq = q - v[k];
    d[q] = dq * dq + f[v[k]];
  }
}

function distanceTransform(feature: Uint8Array, width: number, height: number) {
  const n = Math.max(width, height);
  const f = new Float64Array(n);
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  const grid = new Float64Array(width * height);
  for (let i = 0; i < grid.length; i++) grid[i] = feature[i] ? 0 : EDT_INF;
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) f[y] = grid[y * width + x];
    edt1d(f, height, d, v, z);
    for (let y = 0; y < height; y++) grid[y * width + x] = d[y];
  }
  const out = new Float32Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) f[x] = grid[y * width + x];
    edt1d(f, width, d, v, z);
    for (let x = 0; x < width; x++) out[y * width + x] = Math.sqrt(d[x]);
  }
  return out;
}

function blur(
  field: Float32Array,
  width: number,
  height: number,
  radius: number,
  passes: number,
) {
  const r = Math.max(1, Math.round(radius));
  let src = field;
  let tmp = new Float32Array(field.length);
  const norm = 1 / (2 * r + 1);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < height; y++) {
      const row = y * width;
      let acc = 0;
      for (let i = -r; i <= r; i++) acc += src[row + Math.min(width - 1, Math.max(0, i))];
      for (let x = 0; x < width; x++) {
        tmp[row + x] = acc * norm;
        acc += src[row + Math.min(width - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
      }
    }
    const out = new Float32Array(field.length);
    for (let x = 0; x < width; x++) {
      let acc = 0;
      for (let i = -r; i <= r; i++) acc += tmp[Math.min(height - 1, Math.max(0, i)) * width + x];
      for (let y = 0; y < height; y++) {
        out[y * width + x] = acc * norm;
        acc +=
          tmp[Math.min(height - 1, y + r + 1) * width + x] -
          tmp[Math.max(0, y - r) * width + x];
      }
    }
    src = out;
    tmp = new Float32Array(field.length);
  }
  return src;
}

function hash2(x: number, y: number) {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return h - Math.floor(h);
}

function valueNoise(x: number, y: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(x: number, y: number) {
  let sum = 0;
  let amp = 0.5;
  let freq = 1;
  let norm = 0;
  for (let i = 0; i < 3; i++) {
    sum += (valueNoise(x * freq + i * 17.3, y * freq - i * 9.1) * 2 - 1) * amp;
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
}

function smoothstep(edge0: number, edge1: number, x: number) {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

interface TerrainField {
  width: number;
  height: number;
  sdf: Float32Array;
  elevation: Float32Array;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function buildTerrainField(raster: Raster): TerrainField {
  const { data, width, height } = raster;
  const count = width * height;
  let transparent = 0;
  for (let i = 0; i < count; i++) if (data[i * 4 + 3] < 128) transparent++;
  const pad = Math.round(RASTER_SIZE * 0.06);
  const padArea = count - (width - pad * 2) * (height - pad * 2);
  const shaped = transparent - padArea > count * 0.01;

  const inside = new Uint8Array(count);
  const alpha = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    alpha[i] = data[i * 4 + 3] / 255;
    inside[i] = shaped
      ? alpha[i] >= 0.5 ? 1 : 0
      : (() => {
          const x = i % width;
          const y = (i / width) | 0;
          return x >= pad && y >= pad && x < width - pad && y < height - pad ? 1 : 0;
        })();
  }
  const outside = new Uint8Array(count);
  for (let i = 0; i < count; i++) outside[i] = inside[i] ? 0 : 1;
  const distIn = distanceTransform(outside, width, height);
  const distOut = distanceTransform(inside, width, height);

  let sdf: Float32Array = new Float32Array(count);
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let i = 0; i < count; i++) {
    let s = inside[i] ? distIn[i] - 0.5 : -(distOut[i] - 0.5);
    if (shaped && alpha[i] > 0 && alpha[i] < 1) {
      const refined = alpha[i] - 0.5;
      if (Math.abs(refined) < Math.abs(s)) s = refined;
    }
    sdf[i] = s;
    if (inside[i]) {
      const x = i % width;
      const y = (i / width) | 0;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) throw new Error("No opaque pixels to build terrain from");
  sdf = blur(sdf, width, height, 1, 2);

  const longest = Math.max(maxX - minX + 1, maxY - minY + 1);
  const elevation = new Float32Array(count);
  if (shaped) {
    let maxDist = 0;
    for (let i = 0; i < count; i++) if (inside[i] && distIn[i] > maxDist) maxDist = distIn[i];
    const signed = new Float32Array(count);
    for (let i = 0; i < count; i++) signed[i] = inside[i] ? distIn[i] : -distOut[i];
    const soft = blur(signed, width, height, Math.max(2, maxDist * 0.12), 2);
    let maxSoft = 0;
    for (let i = 0; i < count; i++) if (soft[i] > maxSoft) maxSoft = soft[i];
    const noiseScale = 3.2 / longest;
    for (let i = 0; i < count; i++) {
      if (sdf[i] <= 0) {
        elevation[i] = 0;
        continue;
      }
      const x = i % width;
      const y = (i / width) | 0;
      const p = Math.min(Math.max(soft[i], 0) / Math.max(maxSoft, 1e-6), 1);
      const massif = p * (1.2 - 0.2 * p);
      const grain = fbm(x * noiseScale, y * noiseScale) * 0.1 * smoothstep(0.05, 0.5, p);
      elevation[i] = Math.max(0, massif + grain) * smoothstep(0, 2, sdf[i]);
    }
  } else {
    const luma = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      luma[i] =
        (data[i * 4] * 0.2126 + data[i * 4 + 1] * 0.7152 + data[i * 4 + 2] * 0.0722) / 255;
    }
    const soft = blur(luma, width, height, Math.max(1.5, longest * 0.02), 3);
    const values: number[] = [];
    for (let i = 0; i < count; i++) if (inside[i]) values.push(soft[i]);
    values.sort((a, b) => a - b);
    const lo = values[Math.floor(values.length * 0.01)] ?? 0;
    const hi = values[Math.floor(values.length * 0.99)] ?? 1;
    const ramp = longest * 0.05;
    for (let i = 0; i < count; i++) {
      if (sdf[i] <= 0) {
        elevation[i] = 0;
        continue;
      }
      const x = (soft[i] - lo) / Math.max(hi - lo, 1e-6);
      const s = Math.min(Math.max((x + 0.2) / 1.4, 0), 1);
      const level = s * s * (3 - 2 * s);
      elevation[i] = (0.08 + 0.92 * level) * smoothstep(0, ramp, sdf[i]);
    }
  }
  let maxElevation = 0;
  for (let i = 0; i < count; i++) if (elevation[i] > maxElevation) maxElevation = elevation[i];
  const scaleElevation = 1 / Math.max(maxElevation, 1e-6);
  for (let i = 0; i < count; i++) elevation[i] *= scaleElevation;
  return { width, height, sdf, elevation, minX, minY, maxX, maxY };
}

function sampleField(field: Float32Array, width: number, height: number, x: number, y: number) {
  const fx = Math.min(Math.max(x, 0), width - 1);
  const fy = Math.min(Math.max(y, 0), height - 1);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);
  const tx = fx - x0;
  const ty = fy - y0;
  const a = field[y0 * width + x0];
  const b = field[y0 * width + x1];
  const c = field[y1 * width + x0];
  const d = field[y1 * width + x1];
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

function buildTerrainGeometry(field: TerrainField, depth: number) {
  const { width, height, sdf, elevation } = field;
  const longestPx = Math.max(width, height);
  const step = longestPx / GRID_CELLS;
  const cols = Math.ceil((width - 1) / step) + 1;
  const rows = Math.ceil((height - 1) / step) + 1;
  const centerX = (field.minX + field.maxX + 1) / 2;
  const centerY = (field.minY + field.maxY + 1) / 2;
  const contentLongest = Math.max(field.maxX - field.minX + 1, field.maxY - field.minY + 1);
  const relief = depth * contentLongest;

  const gridSdf = new Float32Array(cols * rows);
  const gridElevation = new Float32Array(cols * rows);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = i * step;
      const y = j * step;
      gridSdf[j * cols + i] = sampleField(sdf, width, height, x, y);
      gridElevation[j * cols + i] = sampleField(elevation, width, height, x, y);
    }
  }

  const remap = new Int32Array(cols * rows).fill(-1);
  const positions: number[] = [];
  const elevations: number[] = [];
  const edges: number[] = [];
  const indices: number[] = [];
  const vertex = (i: number, j: number) => {
    const k = j * cols + i;
    if (remap[k] >= 0) return remap[k];
    remap[k] = elevations.length;
    const e = gridSdf[k] > 0 ? gridElevation[k] : 0;
    positions.push(i * step - centerX, centerY - j * step, e * relief);
    elevations.push(e);
    edges.push(gridSdf[k]);
    return remap[k];
  };
  for (let j = 0; j < rows - 1; j++) {
    for (let i = 0; i < cols - 1; i++) {
      const a = gridSdf[j * cols + i];
      const b = gridSdf[j * cols + i + 1];
      const c = gridSdf[(j + 1) * cols + i];
      const d = gridSdf[(j + 1) * cols + i + 1];
      if (Math.max(a, b, c) >= 0) {
        indices.push(vertex(i, j), vertex(i, j + 1), vertex(i + 1, j));
      }
      if (Math.max(b, c, d) >= 0) {
        indices.push(vertex(i + 1, j), vertex(i, j + 1), vertex(i + 1, j + 1));
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("elevation", new THREE.Float32BufferAttribute(elevations, 1));
  geometry.setAttribute("edge", new THREE.Float32BufferAttribute(edges, 1));
  geometry.setIndex(
    elevations.length > 65535
      ? new THREE.Uint32BufferAttribute(indices, 1)
      : new THREE.Uint16BufferAttribute(indices, 1),
  );
  geometry.computeVertexNormals();
  return geometry;
}

function prepareModel(root: THREE.Object3D) {
  root.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.isMesh && mesh.geometry?.getAttribute("position")) meshes.push(mesh);
  });
  if (meshes.length === 0) throw new Error("The model has no meshes");
  const point = new THREE.Vector3();
  let minY = Infinity;
  let maxY = -Infinity;
  for (const mesh of meshes) {
    const position = mesh.geometry.getAttribute("position");
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      if (point.y < minY) minY = point.y;
      if (point.y > maxY) maxY = point.y;
    }
  }
  const span = Math.max(maxY - minY, 1e-6);
  for (const mesh of meshes) {
    const geometry = mesh.geometry.clone();
    mesh.geometry.dispose();
    mesh.geometry = geometry;
    if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
    const position = geometry.getAttribute("position");
    const elevation = new Float32Array(position.count);
    for (let i = 0; i < position.count; i++) {
      point.fromBufferAttribute(position, i).applyMatrix4(mesh.matrixWorld);
      elevation[i] = (point.y - minY) / span;
    }
    geometry.setAttribute("elevation", new THREE.BufferAttribute(elevation, 1));
    geometry.setAttribute(
      "edge",
      new THREE.BufferAttribute(new Float32Array(position.count).fill(1), 1),
    );
  }
  return meshes;
}

function disposeObject(root: THREE.Object3D, keep: THREE.Material[] = []) {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      if (!material || keep.includes(material)) continue;
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) value.dispose();
      }
      material.dispose();
    }
  });
}

let colorContext: CanvasRenderingContext2D | null = null;
const colorCache = new Map<string, [number, number, number, number]>();

function parseCssColor(value: string): [number, number, number, number] | null {
  const cached = colorCache.get(value);
  if (cached) return cached;
  if (!colorContext) {
    const probe = document.createElement("canvas");
    probe.width = 1;
    probe.height = 1;
    colorContext = probe.getContext("2d", { willReadFrequently: true });
  }
  const ctx = colorContext;
  if (!ctx) return null;
  ctx.fillStyle = "#010203";
  ctx.fillStyle = value;
  if (ctx.fillStyle === "#010203" && value.trim().toLowerCase() !== "#010203") {
    return null;
  }
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillRect(0, 0, 1, 1);
  const pixel = ctx.getImageData(0, 0, 1, 1).data;
  const color: [number, number, number, number] = [
    pixel[0] / 255,
    pixel[1] / 255,
    pixel[2] / 255,
    pixel[3] / 255,
  ];
  if (colorCache.size > 64) colorCache.clear();
  colorCache.set(value, color);
  return color;
}

export function createTopographicObject(
  elements: TopographicObjectElements,
  options: TopographicObjectOptions = {},
): TopographicObjectInstance | null {
  const { canvas } = elements;
  const config: Required<TopographicObjectOptions> = {
    ...DEFAULTS,
    ...resolveOptions(DEFAULTS, options),
  };

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      premultipliedAlpha: true,
      powerPreference: "high-performance",
    });
  } catch {
    return null;
  }
  renderer.autoClear = false;

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

  const uniforms = {
    uLineColor: { value: new THREE.Vector4(0, 0, 0, 1) },
    uIndexColor: { value: new THREE.Vector4(0, 0, 0, 1) },
    uLines: { value: config.lines },
    uIndexEvery: { value: config.indexEvery },
    uLineWidth: { value: 1 },
    uIndexWidth: { value: 1 },
    uPhase: { value: 0 },
    uFill: { value: 0 },
    uShading: { value: 0 },
    uOutline: { value: 1 },
    uReveal: { value: 0 },
    uTerrain: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    side: THREE.DoubleSide,
    transparent: true,
    premultipliedAlpha: true,
    depthWrite: false,
    depthFunc: THREE.LessEqualDepth,
  });
  const depthMaterial = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    side: THREE.DoubleSide,
    colorWrite: false,
    depthWrite: true,
  });

  let model: THREE.Object3D | null = null;
  let modelMaxDim = 1;
  let terrainField: TerrainField | null = null;
  let builtDepth = -1;
  let loadedSrc: string | null = null;
  let loadToken = 0;
  let disposed = false;
  let revealStart = -1;
  let reveal = 0;

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
    disposeObject(model, [material, depthMaterial]);
    model = null;
  }

  function mountModel(next: THREE.Object3D) {
    clearModel();
    model = next;
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    modelMaxDim = Math.max(size.x, size.y, size.z, 1e-4);
    model.position.sub(bounds.getCenter(new THREE.Vector3()));
    applyFit();
    fitGroup.add(model);
  }

  function buildTerrain() {
    if (!terrainField) return;
    const depth = Math.min(Math.max(config.depth, 0), 1);
    builtDepth = depth;
    mountModel(new THREE.Mesh(buildTerrainGeometry(terrainField, depth), material));
  }

  function startReveal() {
    revealStart = -1;
    reveal = reducedMotion ? 2 : 0;
  }

  async function loadAsset() {
    const src = config.src;
    if (src === loadedSrc) return;
    loadedSrc = src;
    const token = ++loadToken;
    if (!src) {
      terrainField = null;
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
        const root = gltf.scene;
        const bounds = new THREE.Box3().setFromObject(root);
        root.position.sub(bounds.getCenter(new THREE.Vector3()));
        const meshes = prepareModel(root);
        for (const mesh of meshes) {
          const old = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          for (const item of old) {
            for (const value of Object.values(item)) {
              if (value instanceof THREE.Texture) value.dispose();
            }
            item.dispose();
          }
          mesh.material = material;
        }
        terrainField = null;
        uniforms.uTerrain.value = 0;
        mountModel(root);
      } else {
        const raster = await rasterize(bytes, kind);
        if (disposed || token !== loadToken) return;
        terrainField = buildTerrainField(raster);
        uniforms.uTerrain.value = 1;
        buildTerrain();
      }
      startReveal();
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
    if (reducedMotion) {
      floatGroup.rotation.set(0, 0, 0);
      reveal = 2;
    }
    applyOptions();
  };
  motionQuery.addEventListener("change", onMotionChange);

  const lineColor = new THREE.Vector4();
  const indexColor = new THREE.Vector4();
  let autoColor = "";
  let lastColorPoll = -Infinity;

  function refreshColors(now: number) {
    if (!config.lineColor || !config.indexColor) {
      if (now - lastColorPoll >= COLOR_POLL_MS) {
        lastColorPoll = now;
        autoColor = getComputedStyle(canvas).color;
      }
    }
    const line = parseCssColor(config.lineColor || autoColor) ?? [0.5, 0.5, 0.5, 1];
    const index = config.indexColor ? parseCssColor(config.indexColor) ?? line : line;
    lineColor.set(line[0], line[1], line[2], line[3]);
    indexColor.set(index[0], index[1], index[2], index[3]);
    uniforms.uLineColor.value.copy(lineColor);
    uniforms.uIndexColor.value.copy(indexColor);
  }

  function applyOptions() {
    const background = config.background ? parseCssColor(config.background) : null;
    if (background) {
      renderer.setClearColor(
        new THREE.Color().setRGB(background[0], background[1], background[2], THREE.SRGBColorSpace),
        background[3],
      );
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

    uniforms.uLines.value = Math.max(config.lines, 1);
    uniforms.uIndexEvery.value = Math.max(Math.round(config.indexEvery), 0);
    uniforms.uFill.value = Math.min(Math.max(config.fill, 0), 1);
    uniforms.uShading.value = Math.min(Math.max(config.shading, 0), 1);
    uniforms.uOutline.value = Math.min(Math.max(config.outline, 0), 1);
    refreshColors(performance.now());

    applyFit();
    if (terrainField && Math.min(Math.max(config.depth, 0), 1) !== builtDepth) {
      buildTerrain();
    }
  }

  let pixelRatio = 1;
  function resize() {
    const width = Math.max(canvas.clientWidth, 1);
    const height = Math.max(canvas.clientHeight, 1);
    pixelRatio = getCanvasPixelRatio(canvas, renderer.getContext());
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.fov = fitFov(config.fov, camera.aspect);
    camera.updateProjectionMatrix();
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
  let phase = 0;

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
      floatGroup.rotation.x = (Math.cos(elapsed / 4) / 8) * config.rotationIntensity;
      floatGroup.rotation.y = (Math.sin(elapsed / 4) / 8) * config.rotationIntensity;
      floatGroup.rotation.z = (Math.sin(elapsed / 4) / 20) * config.rotationIntensity;
      floatGroup.position.y =
        MODEL_LIFT + config.yOffset + (Math.sin(elapsed / 1.5) / 10) * config.floatIntensity;
      phase += delta * config.drift;
    }
    if (model && reveal < 2) {
      if (revealStart < 0) revealStart = time;
      const t = Math.min((time - revealStart) / REVEAL_MS, 1);
      reveal = t >= 1 ? 2 : t * t * (3 - 2 * t) * 1.1;
    }

    refreshColors(time);
    uniforms.uPhase.value = phase;
    uniforms.uReveal.value = reveal;
    uniforms.uLineWidth.value = Math.max(config.lineWidth, 0) * pixelRatio;
    uniforms.uIndexWidth.value = Math.max(config.indexWidth, 0) * pixelRatio;

    renderer.clear(true, true, true);
    scene.overrideMaterial = depthMaterial;
    renderer.render(scene, camera);
    scene.overrideMaterial = null;
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
    setOptions(next: TopographicObjectOptions) {
      next = resolveOptions(DEFAULTS, next);
      let changed = false;
      for (const [key, value] of Object.entries(next)) {
        if (typeof value === "function") continue;
        if (config[key as keyof TopographicObjectOptions] !== value) {
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
      controls.dispose();
      clearModel();
      terrainField = null;
      draco.dispose();
      material.dispose();
      depthMaterial.dispose();
      renderer.dispose();
    },
  };
}
