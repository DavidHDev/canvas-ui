import { getCanvasPixelRatio, createCanvasResizeObserver } from "../canvas-viewport";
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

const PRINTABLE_ASCII = Array.from({ length: 95 }, (_, i) =>
  String.fromCharCode(32 + i),
).join("");

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

const POST_VERT = `
out vec2 vUv;
void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const SRGB_ENCODE = `
vec3 toSrgb(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
`;

const CELL_FRAG = `
precision highp float;
out vec4 outColor;
uniform sampler2D tScene;
uniform sampler2D tShapes;
uniform vec2 uResolution;
uniform vec2 uCellPx;
uniform int uGlyphCount;
uniform float uContrast;
uniform float uEdgeContrast;
uniform float uExposure;
uniform float uInvert;
${SRGB_ENCODE}
const vec2 INNER[6] = vec2[6](
  vec2(0.28, 0.26), vec2(0.72, 0.14),
  vec2(0.28, 0.56), vec2(0.72, 0.44),
  vec2(0.28, 0.86), vec2(0.72, 0.74)
);
const vec2 OUTER[10] = vec2[10](
  vec2(0.28, -0.2), vec2(0.72, -0.2),
  vec2(-0.22, 0.25), vec2(1.22, 0.25),
  vec2(-0.22, 0.5), vec2(1.22, 0.5),
  vec2(-0.22, 0.75), vec2(1.22, 0.75),
  vec2(0.28, 1.2), vec2(0.72, 1.2)
);
const vec2 RING[6] = vec2[6](
  vec2(1.0, 0.0), vec2(0.5, 0.8660254), vec2(-0.5, 0.8660254),
  vec2(-1.0, 0.0), vec2(-0.5, -0.8660254), vec2(0.5, -0.8660254)
);
vec2 cellBase;
vec4 fetchTap(vec2 p) {
  vec2 uv = p / uResolution;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) return vec4(0.0);
  return texture(tScene, uv);
}
vec4 sampleCircle(vec2 c) {
  vec2 middle = cellBase + vec2(c.x, 1.0 - c.y) * uCellPx;
  float r = uCellPx.y * 0.161;
  vec4 acc = fetchTap(middle);
  for (int k = 0; k < 6; k++) acc += fetchTap(middle + RING[k] * r);
  return acc / 7.0;
}
float circleLum(vec4 acc) {
  vec3 straight = toSrgb(acc.rgb / max(acc.a, 1e-4));
  float level = clamp(dot(straight, vec3(0.2126, 0.7152, 0.0722)) * uExposure, 0.0, 1.0);
  level = mix(level, 1.0 - level, uInvert);
  return level * acc.a;
}
float dirContrast(float value, float ext) {
  float peak = max(value, ext);
  if (peak < 1e-4) return value;
  return pow(value / peak, uEdgeContrast) * peak;
}
void main() {
  cellBase = floor(gl_FragCoord.xy) * uCellPx;
  float v[6];
  vec3 colAcc = vec3(0.0);
  float alphaAcc = 0.0;
  for (int i = 0; i < 6; i++) {
    vec4 acc = sampleCircle(INNER[i]);
    v[i] = circleLum(acc);
    colAcc += acc.rgb;
    alphaAcc += acc.a;
  }
  float e[10];
  for (int i = 0; i < 10; i++) e[i] = circleLum(sampleCircle(OUTER[i]));
  v[0] = dirContrast(v[0], max(max(e[0], e[1]), max(e[2], e[4])));
  v[1] = dirContrast(v[1], max(max(e[0], e[1]), max(e[3], e[5])));
  v[2] = dirContrast(v[2], max(e[2], max(e[4], e[6])));
  v[3] = dirContrast(v[3], max(e[3], max(e[5], e[7])));
  v[4] = dirContrast(v[4], max(max(e[4], e[6]), max(e[8], e[9])));
  v[5] = dirContrast(v[5], max(max(e[5], e[7]), max(e[8], e[9])));
  float peak = max(max(max(v[0], v[1]), max(v[2], v[3])), max(v[4], v[5]));
  if (peak > 1e-4) {
    for (int i = 0; i < 6; i++) v[i] = pow(v[i] / peak, uContrast) * peak;
  }
  int best = 0;
  float bestD = 1e9;
  for (int g = 0; g < uGlyphCount; g++) {
    float d = 0.0;
    for (int i = 0; i < 6; i++) {
      float diff = v[i] - texelFetch(tShapes, ivec2(i, g), 0).r;
      d += diff * diff;
    }
    if (d < bestD) {
      bestD = d;
      best = g;
    }
  }
  vec3 cellColor = toSrgb(colAcc / max(alphaAcc, 1e-4));
  outColor = vec4(cellColor, float(best) / 255.0);
}`;

const POST_FRAG = `
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D tScene;
uniform sampler2D tCells;
uniform sampler2D tAtlas;
uniform vec2 uResolution;
uniform vec2 uCellPx;
uniform vec2 uGrid;
uniform vec2 uAtlasGrid;
uniform vec2 uAtlasPad;
uniform vec2 uAtlasInner;
uniform float uAscii;
uniform float uColored;
uniform vec3 uColor;
uniform vec3 uBackground;
uniform float uHasBg;
${SRGB_ENCODE}
void main() {
  if (uAscii < 0.5) {
    vec4 raw = texture(tScene, vUv);
    vec3 rawColor = toSrgb(raw.rgb);
    if (uHasBg > 0.5) {
      outColor = vec4(uBackground * (1.0 - raw.a) + rawColor, 1.0);
    } else {
      outColor = vec4(rawColor * raw.a, raw.a);
    }
    return;
  }
  vec2 fragCoord = vUv * uResolution;
  vec2 cellPos = fragCoord / uCellPx;
  vec2 cell = clamp(floor(cellPos), vec2(0.0), uGrid - 1.0);
  vec4 info = texelFetch(tCells, ivec2(cell), 0);
  float glyph = floor(info.a * 255.0 + 0.5);
  vec2 local = clamp(cellPos - cell, 0.0, 1.0);
  float gx = mod(glyph, uAtlasGrid.x);
  float gy = floor(glyph / uAtlasGrid.x);
  vec2 atlasUv = vec2(
    (gx + uAtlasPad.x + local.x * uAtlasInner.x) / uAtlasGrid.x,
    (uAtlasGrid.y - gy - 1.0 + uAtlasPad.y + local.y * uAtlasInner.y) /
      uAtlasGrid.y
  );
  vec2 atlasStep = uAtlasInner / uAtlasGrid;
  float mask = textureGrad(
    tAtlas,
    atlasUv,
    dFdx(cellPos) * atlasStep,
    dFdy(cellPos) * atlasStep
  ).a;
  vec3 glyphColor = mix(uColor, info.rgb, uColored);
  if (uHasBg > 0.5) {
    outColor = vec4(mix(uBackground, glyphColor, mask), 1.0);
  } else {
    outColor = vec4(glyphColor * mask, mask);
  }
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
  {
    position: [-10.906, -1, 1.846],
    rotation: [0, -0.195, 0],
    scale: [2.328, 7.905, 4.651],
  },
  {
    position: [-5.607, -0.754, -0.758],
    rotation: [0, 0.994, 0],
    scale: [1.97, 1.534, 3.955],
  },
  {
    position: [6.167, -0.16, 7.803],
    rotation: [0, 0.561, 0],
    scale: [3.927, 6.285, 3.687],
  },
  {
    position: [-2.017, 0.018, 6.124],
    rotation: [0, 0.333, 0],
    scale: [2.002, 4.566, 2.064],
  },
  {
    position: [2.291, -0.756, -2.621],
    rotation: [0, -0.286, 0],
    scale: [1.546, 1.552, 1.496],
  },
  {
    position: [-2.193, -0.369, -5.547],
    rotation: [0, 0.516, 0],
    scale: [3.875, 3.487, 2.986],
  },
];

const ROOM_FORMERS: FormerDef[] = [
  {
    kind: "ring",
    intensity: 15,
    position: [2, 3, -2],
    scale: [10, 10, 10],
    lookAtCenter: true,
  },
  {
    kind: "box",
    intensity: 80,
    position: [-14, 10, 8],
    scale: [0.1, 2.5, 2.5],
  },
  {
    kind: "box",
    intensity: 80,
    position: [-14, 14, -4],
    scale: [0.1, 2.5, 2.5],
    withLight: true,
  },
  {
    kind: "box",
    intensity: 23,
    position: [14, 12, 0],
    scale: [0.1, 5, 5],
    withLight: true,
  },
  {
    kind: "box",
    intensity: 16,
    position: [0, 9, 14],
    scale: [5, 5, 0.1],
    withLight: true,
  },
  {
    kind: "box",
    intensity: 80,
    position: [7, 8, -14],
    scale: [2.5, 2.5, 0.1],
    withLight: true,
  },
  {
    kind: "box",
    intensity: 80,
    position: [-7, 16, -14],
    scale: [2.5, 2.5, 0.1],
    withLight: true,
  },
  {
    kind: "box",
    intensity: 1,
    position: [0, 20, 0],
    scale: [0.1, 0.1, 0.1],
    withLight: true,
  },
  {
    kind: "box",
    intensity: 20,
    position: [0, 15, 0],
    scale: [10, 1, 10],
    withLight: true,
  },
];

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
const INNER_CIRCLES: Array<[number, number]> = [
  [0.28, 0.26],
  [0.72, 0.14],
  [0.28, 0.56],
  [0.72, 0.44],
  [0.28, 0.86],
  [0.72, 0.74],
];

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

function glyphShapes(
  image: ImageData,
  cols: number,
  cellW: number,
  cellH: number,
  count: number,
) {
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
        for (
          let x = Math.floor(cx - radius);
          x <= Math.ceil(cx + radius);
          x++
        ) {
          const dx = x + 0.5 - cx;
          const dy = y + 0.5 - cy;
          if (dx * dx + dy * dy > radius * radius) continue;
          total += 1;
          if (
            x < -ATLAS_PAD ||
            y < -ATLAS_PAD ||
            x >= cellW + ATLAS_PAD ||
            y >= cellH + ATLAS_PAD
          )
            continue;
          sum +=
            image.data[((originY + y) * image.width + originX + x) * 4 + 3];
        }
      }
      vectors[g * 6 + c] = total ? sum / (total * 255) : 0;
    }
  }
  for (let c = 0; c < 6; c++) {
    let peak = 0;
    for (let g = 0; g < count; g++) {
      peak = Math.max(peak, vectors[g * 6 + c]);
    }
    if (peak > 0) {
      for (let g = 0; g < count; g++) vectors[g * 6 + c] /= peak;
    }
  }
  return vectors;
}

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
      .replace(/^\uFEFF/, "")
      .trimStart();
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

function drawToCanvas(
  source: CanvasImageSource,
  width: number,
  height: number,
) {
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
    const canvas = drawToCanvas(
      bitmap,
      bitmap.width * scale,
      bitmap.height * scale,
    );
    bitmap.close();
    return canvas;
  } catch {
    return null;
  }
}

async function decodeImage(
  blob: Blob,
  kind: AssetKind,
): Promise<HTMLCanvasElement> {
  const vector = kind === "svg";
  if (!vector) {
    const decoded = await decodeWithBitmap(blob);
    if (decoded) return decoded;
  }
  const image = await decodeWithImage(blob);
  const width = image.naturalWidth || RASTER_SIZE;
  const height = image.naturalHeight || RASTER_SIZE;
  const longest = Math.max(width, height, 1);
  const scale = vector
    ? RASTER_SIZE / longest
    : Math.min(1, RASTER_SIZE / longest);
  return drawToCanvas(image, width * scale, height * scale);
}

function traceContours(inside: Uint8Array, width: number, height: number) {
  const segments: number[] = [];
  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width - 1; x++) {
      const base = y * width + x;
      const code =
        inside[base] |
        (inside[base + 1] << 1) |
        (inside[base + width + 1] << 2) |
        (inside[base + width] << 3);
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
  const keyAt = (index: number) =>
    segments[index * 2 + 1] * 2 * stride + segments[index * 2] * 2;
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

function buildShapes(
  canvas: HTMLCanvasElement,
  aspectW: number,
  aspectH: number,
) {
  const rectangle = () =>
    new THREE.Shape([
      new THREE.Vector2(0, 0),
      new THREE.Vector2(aspectW, 0),
      new THREE.Vector2(aspectW, aspectH),
      new THREE.Vector2(0, aspectH),
    ]);

  const scale = Math.min(
    1,
    TRACE_SIZE / Math.max(canvas.width, canvas.height, 1),
  );
  const trace =
    scale < 1
      ? drawToCanvas(canvas, canvas.width * scale, canvas.height * scale)
      : canvas;
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
      if (
        other !== ring &&
        other.area > ring.area &&
        ringContains(other.points, ring.points[0], ring.points[1])
      ) {
        ring.depth += 1;
      }
    }
  }

  const toPath = (points: number[]) => {
    const path: THREE.Vector2[] = [];
    for (let i = 0; i < points.length; i += 2) {
      path.push(
        new THREE.Vector2(
          ((points[i] - 0.5) / traceW) * aspectW,
          (1 - (points[i + 1] - 0.5) / traceH) * aspectH,
        ),
      );
    }
    return path;
  };

  const shapes = new Map<(typeof rings)[number], THREE.Shape>();
  for (const ring of rings) {
    if (ring.depth % 2 === 0)
      shapes.set(ring, new THREE.Shape(toPath(ring.points)));
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

function createImageObject(
  canvas: HTMLCanvasElement,
  anisotropy: number,
): THREE.Mesh {
  const longest = Math.max(canvas.width, canvas.height, 1);
  const aspectW = canvas.width / longest;
  const aspectH = canvas.height / longest;
  const geometry = new THREE.ExtrudeGeometry(
    buildShapes(canvas, aspectW, aspectH),
    {
      depth: EXTRUDE_DEPTH,
      bevelEnabled: true,
      bevelThickness: BEVEL_SIZE,
      bevelSize: BEVEL_SIZE,
      bevelOffset: 0,
      bevelSegments: 2,
      steps: 1,
      curveSegments: 1,
    },
  );
  const position = geometry.getAttribute("position");
  const uv = new Float32Array(position.count * 2);
  for (let i = 0; i < position.count; i++) {
    uv[i * 2] = position.getX(i) / aspectW;
    uv[i * 2 + 1] = position.getY(i) / aspectH;
  }
  geometry.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.6,
    metalness: 0,
  });
  return new THREE.Mesh(geometry, material);
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
        if (!(value instanceof THREE.Texture)) continue;
        value.dispose();
      }
      material.dispose();
    }
  });
}

export function createAsciiObject(
  elements: AsciiObjectElements,
  options: AsciiObjectOptions = {},
): AsciiObjectInstance | null {
  const { canvas } = elements;
  const config: Required<AsciiObjectOptions> = { ...DEFAULTS, ...resolveOptions(DEFAULTS, options) };

  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      alpha: true,
      powerPreference: "high-performance",
    });
  } catch {
    return null;
  }
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.setClearColor(0x000000, 0);

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

  const target = new THREE.WebGLRenderTarget(1, 1, { samples: 4 });
  target.texture.colorSpace = THREE.SRGBColorSpace;

  const sharedResolution = new THREE.Vector2(1, 1);
  const sharedCellPx = new THREE.Vector2(6, 10);
  const sharedGrid = new THREE.Vector2(1, 1);

  const cellTarget = new THREE.WebGLRenderTarget(1, 1, {
    depthBuffer: false,
    stencilBuffer: false,
    minFilter: THREE.NearestFilter,
    magFilter: THREE.NearestFilter,
  });

  const postMaterial = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: POST_VERT,
    fragmentShader: POST_FRAG,
    uniforms: {
      tScene: { value: target.texture },
      tCells: { value: cellTarget.texture },
      tAtlas: { value: null },
      uResolution: { value: sharedResolution },
      uCellPx: { value: sharedCellPx },
      uGrid: { value: sharedGrid },
      uAtlasGrid: { value: new THREE.Vector2(1, 1) },
      uAtlasPad: { value: new THREE.Vector2(0, 0) },
      uAtlasInner: { value: new THREE.Vector2(1, 1) },
      uAscii: { value: 1 },
      uColored: { value: 1 },
      uColor: { value: new THREE.Color(1, 1, 1) },
      uBackground: { value: new THREE.Color(0, 0, 0) },
      uHasBg: { value: 0 },
    },
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending,
  });
  const postGeometry = new THREE.BufferGeometry();
  postGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(
      new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]),
      3,
    ),
  );
  const postMesh = new THREE.Mesh(postGeometry, postMaterial);
  postMesh.frustumCulled = false;
  const postScene = new THREE.Scene();
  postScene.add(postMesh);
  const postCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  const cellMaterial = new THREE.ShaderMaterial({
    glslVersion: THREE.GLSL3,
    vertexShader: POST_VERT,
    fragmentShader: CELL_FRAG,
    uniforms: {
      tScene: { value: target.texture },
      tShapes: { value: null },
      uResolution: { value: sharedResolution },
      uCellPx: { value: sharedCellPx },
      uGlyphCount: { value: 1 },
      uContrast: { value: 1.5 },
      uEdgeContrast: { value: 3 },
      uExposure: { value: 1 },
      uInvert: { value: 0 },
    },
    depthTest: false,
    depthWrite: false,
    blending: THREE.NoBlending,
  });
  const cellMesh = new THREE.Mesh(postGeometry, cellMaterial);
  cellMesh.frustumCulled = false;
  const cellScene = new THREE.Scene();
  cellScene.add(cellMesh);

  let atlasTexture: THREE.CanvasTexture | null = null;
  let shapeTexture: THREE.DataTexture | null = null;
  let builtCharset: string | null = null;
  let builtAspect = 0;

  const pmrem = new THREE.PMREMGenerator(renderer);
  let roomScene: THREE.Scene | null = null;
  let ringMaterial: THREE.MeshBasicMaterial | null = null;
  let envTarget: THREE.WebGLRenderTarget | null = null;
  let envDirty = true;

  function buildRoom() {
    roomScene = new THREE.Scene();
    const room = new THREE.Group();
    room.position.set(0, -0.5, 0);
    roomScene.add(room);

    for (const [x, z] of [
      [-15, 15],
      [15, 15],
      [15, -15],
      [-15, -15],
    ]) {
      const spot = new THREE.SpotLight(0xffffff, 2, 0, 0.2, 1, 0);
      spot.position.set(x, 20, z);
      room.add(spot, spot.target);
    }
    const center = new THREE.PointLight(0xffffff, 100, 28, 2);
    center.position.set(0.5, 14, 0.5);
    room.add(center);

    const box = new THREE.BoxGeometry();
    const shell = new THREE.Mesh(
      box,
      new THREE.MeshStandardMaterial({ color: "gray", side: THREE.BackSide }),
    );
    shell.position.set(0, 13.2, 0);
    shell.scale.set(31.5, 28.5, 31.5);
    room.add(shell);

    const white = new THREE.MeshStandardMaterial({ color: 0xffffff });
    for (const def of ROOM_BLOCKS) {
      const mesh = new THREE.Mesh(box, white);
      mesh.position.set(...def.position);
      mesh.rotation.set(...def.rotation);
      mesh.scale.set(...def.scale);
      room.add(mesh);
    }

    for (const def of ROOM_FORMERS) {
      const geometry =
        def.kind === "ring"
          ? new THREE.RingGeometry(0.5, 1, 64)
          : new THREE.BoxGeometry();
      const material = new THREE.MeshBasicMaterial({
        side: THREE.DoubleSide,
        toneMapped: false,
      });
      material.color
        .set(def.kind === "ring" ? config.highlight : "#ffffff")
        .multiplyScalar(def.intensity);
      if (def.kind === "ring") ringMaterial = material;
      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(...def.position);
      mesh.scale.set(...def.scale);
      if (def.lookAtCenter) mesh.lookAt(0, 0, 0);
      room.add(mesh);
      if (def.withLight) {
        const light = new THREE.PointLight(0xffffff, 100, 28, 2);
        light.position.set(...def.position);
        room.add(light);
      }
    }
  }

  function refreshEnvironment() {
    if (!roomScene) buildRoom();
    if (ringMaterial) {
      ringMaterial.color.set(config.highlight).multiplyScalar(15);
    }
    envTarget?.dispose();
    envTarget = pmrem.fromScene(roomScene!, 0, 0.1, 1000);
    scene.environment = envTarget.texture;
  }

  let model: THREE.Object3D | null = null;
  let modelMaxDim = 1;
  let loadedSrc: string | null = null;
  let loadToken = 0;
  let disposed = false;

  const loader = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath(config.dracoDecoderPath);
  loader.setDRACOLoader(draco);

  function applyRoughness() {
    if (!model) return;
    model.traverse((node) => {
      const mesh = node as THREE.Mesh;
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      for (const material of materials) {
        const standard = material as THREE.MeshStandardMaterial;
        if (!standard || typeof standard.roughness !== "number") continue;
        if (standard.userData.baseRoughness === undefined) {
          standard.userData.baseRoughness = standard.roughness;
        }
        standard.roughness =
          config.roughness >= 0
            ? config.roughness
            : standard.userData.baseRoughness;
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
        const blob = new Blob([buffer], {
          type: kind === "svg" ? "image/svg+xml" : "",
        });
        const source = await decodeImage(blob, kind);
        if (disposed || token !== loadToken) return;
        adoptModel(
          createImageObject(source, renderer.capabilities.getMaxAnisotropy()),
        );
      }
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
    const surface = makeCanvas(cols * padW, rows * padH);
    const ctx = surface.getContext("2d");
    if (!ctx) return;
    builtCharset = config.charset;
    builtAspect = aspect;
    ctx.clearRect(0, 0, surface.width, surface.height);
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const fontPx = Math.floor(Math.min(cellH * 0.92, cellW / 0.58));
    ctx.font = `600 ${fontPx}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;
    for (let g = 0; g < glyphs.length; g++) {
      ctx.fillText(
        glyphs[g],
        (g % cols) * padW + padW / 2,
        Math.floor(g / cols) * padH + padH / 2,
      );
    }
    const image = ctx.getImageData(0, 0, surface.width, surface.height);
    const vectors = glyphShapes(image, cols, cellW, cellH, glyphs.length);
    atlasTexture?.dispose();
    shapeTexture?.dispose();
    atlasTexture = new THREE.CanvasTexture(surface);
    atlasTexture.minFilter = THREE.LinearMipmapLinearFilter;
    atlasTexture.magFilter = THREE.LinearFilter;
    atlasTexture.wrapS = THREE.ClampToEdgeWrapping;
    atlasTexture.wrapT = THREE.ClampToEdgeWrapping;
    shapeTexture = new THREE.DataTexture(
      vectors,
      6,
      glyphs.length,
      THREE.RedFormat,
      THREE.FloatType,
    );
    shapeTexture.needsUpdate = true;
    postMaterial.uniforms.tAtlas.value = atlasTexture;
    (postMaterial.uniforms.uAtlasGrid.value as THREE.Vector2).set(cols, rows);
    (postMaterial.uniforms.uAtlasPad.value as THREE.Vector2).set(
      ATLAS_PAD / padW,
      ATLAS_PAD / padH,
    );
    (postMaterial.uniforms.uAtlasInner.value as THREE.Vector2).set(
      cellW / padW,
      cellH / padH,
    );
    cellMaterial.uniforms.tShapes.value = shapeTexture;
    cellMaterial.uniforms.uGlyphCount.value = glyphs.length;
  }

  function syncCellGrid() {
    const pr = renderer.getPixelRatio();
    const cellH = Math.max(config.cellSize, 3) * pr;
    const cellW = cellH * clampAspect(config.cellAspect);
    sharedCellPx.set(cellW, cellH);
    const cols = Math.max(Math.ceil(sharedResolution.x / cellW), 1);
    const rows = Math.max(Math.ceil(sharedResolution.y / cellH), 1);
    sharedGrid.set(cols, rows);
    if (cellTarget.width !== cols || cellTarget.height !== rows) {
      cellTarget.setSize(cols, rows);
    }
  }

  function applyOptions() {
    scene.environmentIntensity = config.environmentIntensity;
    controls.enableRotate = config.orbit;
    controls.enableZoom = config.zoom;
    controls.autoRotate = config.autoRotate && !reducedMotion;
    controls.autoRotateSpeed = config.autoRotateSpeed;
    camera.fov = fitFov(config.fov, camera.aspect);
    camera.updateProjectionMatrix();
    floatGroup.position.x = config.xOffset;
    floatGroup.position.y = MODEL_LIFT + config.yOffset;
    cellMaterial.uniforms.uContrast.value = Math.max(config.contrast, 0.05);
    cellMaterial.uniforms.uEdgeContrast.value = Math.max(
      config.edgeContrast,
      0.05,
    );
    cellMaterial.uniforms.uExposure.value = Math.max(config.exposure, 0);
    cellMaterial.uniforms.uInvert.value = config.invert ? 1 : 0;
    postMaterial.uniforms.uAscii.value = config.ascii ? 1 : 0;
    postMaterial.uniforms.uColored.value = config.colored ? 1 : 0;
    (postMaterial.uniforms.uColor.value as THREE.Color).setStyle(
      config.color || "#ffffff",
      THREE.NoColorSpace,
    );
    postMaterial.uniforms.uHasBg.value = config.background ? 1 : 0;
    if (config.background) {
      (postMaterial.uniforms.uBackground.value as THREE.Color).setStyle(
        config.background,
        THREE.NoColorSpace,
      );
    }
    rebuildAtlas();
    syncCellGrid();
    applyRoughness();
    applyFit();
  }

  function resize() {
    const width = Math.max(canvas.clientWidth, 1);
    const height = Math.max(canvas.clientHeight, 1);
    const pr = getCanvasPixelRatio(canvas, renderer.getContext());
    renderer.setPixelRatio(pr);
    renderer.setSize(width, height, false);
    const deviceW = Math.round(width * pr);
    const deviceH = Math.round(height * pr);
    target.setSize(deviceW, deviceH);
    sharedResolution.set(deviceW, deviceH);
    camera.aspect = width / height;
    camera.fov = fitFov(config.fov, camera.aspect);
    camera.updateProjectionMatrix();
    syncCellGrid();
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

  function tick(time: number) {
    if (!inView || !pageVisible) {
      lastTime = 0;
      stopLoop();
      return;
    }
    const delta = lastTime ? Math.min((time - lastTime) / 1000, 0.1) : 0;
    lastTime = time;
    if (envDirty) {
      envDirty = false;
      refreshEnvironment();
    }
    controls.update();

    if (!reducedMotion) {
      elapsed += delta * config.floatSpeed;
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

    renderer.setRenderTarget(target);
    renderer.render(scene, camera);
    if (config.ascii) {
      renderer.setRenderTarget(cellTarget);
      renderer.render(cellScene, postCamera);
    }
    renderer.setRenderTarget(null);
    renderer.render(postScene, postCamera);
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

  let lastTime = 0;
  let elapsed = Math.random() * 100;

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

      const previousHighlight = config.highlight;
      const previousDistance = config.cameraDistance;
      Object.assign(config, next);
      if (config.highlight !== previousHighlight) envDirty = true;
      if (config.cameraDistance !== previousDistance) {
        camera.position.copy(CAMERA_DIR).multiplyScalar(config.cameraDistance);
      }
      applyOptions();
      resize();
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
      if (roomScene) disposeObject(roomScene);
      envTarget?.dispose();
      pmrem.dispose();
      draco.dispose();
      target.dispose();
      cellTarget.dispose();
      cellMaterial.dispose();
      atlasTexture?.dispose();
      shapeTexture?.dispose();
      postGeometry.dispose();
      postMaterial.dispose();
      renderer.dispose();
    },
  };
}
