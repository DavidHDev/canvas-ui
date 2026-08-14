import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { SVGLoader } from "three/addons/loaders/SVGLoader.js";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import { createRectCache } from "../rect-cache";

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
  /** Canvas the scene renders to. */
  canvas: HTMLCanvasElement;
}

export interface LiquidObjectInstance {
  /** Update options live. Changing src loads the new asset. */
  setOptions: (options: LiquidObjectOptions) => void;
  /** Re-read canvas size. Call when the element is resized. */
  resize: () => void;
  /** Stop the loop and release all GPU resources. */
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

const QUAD_VERT = `
out vec2 vUv;

void main() {
  vUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const SPLAT_FRAG = `
uniform sampler2D tTarget;
uniform vec2 uPoint;
uniform vec3 uValue;
uniform float uRadius;
uniform float uAspect;

in vec2 vUv;
out vec4 fragColor;

void main() {
  vec2 d = vUv - uPoint;
  d.x *= uAspect;
  float fall = exp(-dot(d, d) / max(uRadius, 1e-5));
  fragColor = vec4(texture(tTarget, vUv).xyz + uValue * fall, 1.0);
}
`;

const CURL_FRAG = `
uniform sampler2D tVelocity;
uniform vec2 uTexel;

in vec2 vUv;
out vec4 fragColor;

void main() {
  float l = texture(tVelocity, vUv - vec2(uTexel.x, 0.0)).y;
  float r = texture(tVelocity, vUv + vec2(uTexel.x, 0.0)).y;
  float b = texture(tVelocity, vUv - vec2(0.0, uTexel.y)).x;
  float t = texture(tVelocity, vUv + vec2(0.0, uTexel.y)).x;
  fragColor = vec4((r - l - t + b) * 0.5, 0.0, 0.0, 1.0);
}
`;

const VORTICITY_FRAG = `
uniform sampler2D tVelocity;
uniform sampler2D tCurl;
uniform vec2 uTexel;
uniform float uCurl;
uniform float uDt;

in vec2 vUv;
out vec4 fragColor;

void main() {
  float l = texture(tCurl, vUv - vec2(uTexel.x, 0.0)).x;
  float r = texture(tCurl, vUv + vec2(uTexel.x, 0.0)).x;
  float b = texture(tCurl, vUv - vec2(0.0, uTexel.y)).x;
  float t = texture(tCurl, vUv + vec2(0.0, uTexel.y)).x;
  float c = texture(tCurl, vUv).x;

  vec2 force = vec2(abs(t) - abs(b), abs(r) - abs(l)) * 0.5;
  force /= length(force) + 1e-4;
  force *= uCurl * c;
  force.y *= -1.0;

  vec2 v = texture(tVelocity, vUv).xy + force * uDt;
  fragColor = vec4(clamp(v, -600.0, 600.0), 0.0, 1.0);
}
`;

const DIVERGENCE_FRAG = `
uniform sampler2D tVelocity;
uniform vec2 uTexel;

in vec2 vUv;
out vec4 fragColor;

void main() {
  float l = texture(tVelocity, vUv - vec2(uTexel.x, 0.0)).x;
  float r = texture(tVelocity, vUv + vec2(uTexel.x, 0.0)).x;
  float b = texture(tVelocity, vUv - vec2(0.0, uTexel.y)).y;
  float t = texture(tVelocity, vUv + vec2(0.0, uTexel.y)).y;
  fragColor = vec4((r - l + t - b) * 0.5, 0.0, 0.0, 1.0);
}
`;

const PRESSURE_FRAG = `
uniform sampler2D tPressure;
uniform sampler2D tDivergence;
uniform vec2 uTexel;

in vec2 vUv;
out vec4 fragColor;

void main() {
  float l = texture(tPressure, vUv - vec2(uTexel.x, 0.0)).x;
  float r = texture(tPressure, vUv + vec2(uTexel.x, 0.0)).x;
  float b = texture(tPressure, vUv - vec2(0.0, uTexel.y)).x;
  float t = texture(tPressure, vUv + vec2(0.0, uTexel.y)).x;
  float d = texture(tDivergence, vUv).x;
  fragColor = vec4((l + r + b + t - d) * 0.25, 0.0, 0.0, 1.0);
}
`;

const GRADIENT_FRAG = `
uniform sampler2D tPressure;
uniform sampler2D tVelocity;
uniform vec2 uTexel;

in vec2 vUv;
out vec4 fragColor;

void main() {
  float l = texture(tPressure, vUv - vec2(uTexel.x, 0.0)).x;
  float r = texture(tPressure, vUv + vec2(uTexel.x, 0.0)).x;
  float b = texture(tPressure, vUv - vec2(0.0, uTexel.y)).x;
  float t = texture(tPressure, vUv + vec2(0.0, uTexel.y)).x;
  vec2 v = texture(tVelocity, vUv).xy - vec2(r - l, t - b) * 0.5;
  fragColor = vec4(v, 0.0, 1.0);
}
`;

const ADVECT_FRAG = `
uniform sampler2D tVelocity;
uniform sampler2D tSource;
uniform vec2 uTexel;
uniform float uDt;
uniform float uDissipation;

in vec2 vUv;
out vec4 fragColor;

void main() {
  vec2 coord = vUv - uDt * texture(tVelocity, vUv).xy * uTexel;
  fragColor = texture(tSource, coord) * uDissipation;
}
`;

const FADE_FRAG = `
uniform sampler2D tSource;
uniform float uFade;

in vec2 vUv;
out vec4 fragColor;

void main() {
  fragColor = texture(tSource, vUv) * uFade;
}
`;

const COMPOSITE_FRAG = `
uniform sampler2D tScene;
uniform sampler2D tField;
uniform vec2 uFieldTexel;
uniform float uDistortion;
uniform float uAberration;
uniform float uGrain;
uniform vec2 uCursor;
uniform float uLensRadius;
uniform float uGlow;
uniform float uAspect;
uniform float uSheen;
uniform float uIridescence;
uniform float uAmbient;
uniform float uTime;
uniform vec3 uBackground;
uniform float uHasBackground;
uniform float uExposure;
uniform float uBrightness;
uniform float uSaturation;

in vec2 vUv;
out vec4 fragColor;

vec3 neutral(vec3 color) {
  const float startCompression = 0.76;
  const float desaturation = 0.15;
  float x = min(color.r, min(color.g, color.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < startCompression) return color;
  float d = 1.0 - startCompression;
  float newPeak = 1.0 - d * d / (peak + d - startCompression);
  color *= newPeak / peak;
  float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
  return mix(color, vec3(newPeak), g);
}

vec3 toSrgb(vec3 c) {
  vec3 lo = c * 12.92;
  vec3 hi = 1.055 * pow(max(c, vec3(0.0)), vec3(0.41666)) - 0.055;
  return mix(lo, hi, step(vec3(0.0031308), c));
}

vec4 unpremultiply(vec4 c) {
  return vec4(c.rgb / max(c.a, 1e-4), c.a);
}

void main() {
  vec2 flow = texture(tField, vUv).xy;
  vec2 drift = vec2(
    sin(vUv.y * 9.0 + uTime * 0.7) + sin(vUv.y * 21.0 - uTime * 1.1) * 0.6,
    sin(vUv.x * 8.0 - uTime * 0.6) + sin(vUv.x * 17.0 + uTime * 0.9) * 0.6
  );
  vec2 push = flow * uDistortion * 0.001 + drift * uAmbient * 0.0016;

  float lx = length(texture(tField, vUv - vec2(uFieldTexel.x, 0.0)).xy);
  float rx = length(texture(tField, vUv + vec2(uFieldTexel.x, 0.0)).xy);
  float by = length(texture(tField, vUv - vec2(0.0, uFieldTexel.y)).xy);
  float ty = length(texture(tField, vUv + vec2(0.0, uFieldTexel.y)).xy);
  vec2 grad = vec2(rx - lx, ty - by);

  vec2 toCursor = (vUv - uCursor) * vec2(uAspect, 1.0);
  float lens = smoothstep(uLensRadius, uLensRadius * 0.15, length(toCursor)) * uGlow;
  vec2 spread = normalize(toCursor + 1e-5) * (lens * uAberration * 0.006) / vec2(uAspect, 1.0);
  vec4 sr = unpremultiply(texture(tScene, vUv - push - spread));
  vec4 sg = unpremultiply(texture(tScene, vUv - push));
  vec4 sb = unpremultiply(texture(tScene, vUv - push + spread));

  float alpha = (sr.a + sg.a + sb.a) / 3.0;
  vec3 color = vec3(sr.r, sg.g, sb.b);

  vec3 normal = normalize(vec3(-grad * 0.3, 1.0));
  float spec = pow(max(dot(normal, normalize(vec3(-0.4, 0.55, 0.73))), 0.0), 16.0);
  color += spec * uSheen * 2.5 * alpha;

  float energy = length(flow);
  float rim = length(grad);
  float wave = smoothstep(0.4, 8.0, rim + energy * 0.12) * alpha;
  vec3 shimmer = 0.5 + 0.5 * cos(vec3(0.0, 2.094, 4.188) + energy * 0.045 + (grad.x - grad.y) * 0.1 + uTime * 0.6);
  color += shimmer * wave * uIridescence * 0.5;

  color = clamp(neutral(color * uExposure * uBrightness), 0.0, 1.0);
  float gray = dot(color, vec3(0.2126, 0.7152, 0.0722));
  color = max(mix(vec3(gray), color, uSaturation), 0.0);
  color = toSrgb(color);

  vec3 blended = color * alpha + uBackground * (1.0 - alpha) * uHasBackground;
  float grainMask = mix(alpha, 1.0, uHasBackground);
  float grainN = fract(sin(dot(gl_FragCoord.xy + vec2(uTime * 127.1, uTime * 311.7), vec2(12.9898, 78.233))) * 43758.5453);
  blended += (grainN - 0.5) * uGrain * (0.35 + 0.65 * lens) * 0.14 * grainMask;
  fragColor = vec4(max(blended, 0.0), mix(alpha, 1.0, uHasBackground));
}
`;

const CAMERA_DIR = new THREE.Vector3(0, -1, 4).normalize();
const MODEL_LIFT = 0.3;
const RASTER_SIZE = 256;
const TEXTURE_SIZE = 512;
const ALPHA_THRESHOLD = 64;

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

export function createLiquidObject(
  elements: LiquidObjectElements,
  options: LiquidObjectOptions = {},
): LiquidObjectInstance | null {
  const { canvas } = elements;
  const config: Required<LiquidObjectOptions> = { ...DEFAULTS, ...options };

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
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

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

  scene.add(camera);
  const surface = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    metalness: 0,
    roughness: 0.35,
    envMapIntensity: 1,
  });

  const baseLooks = new Map<
    THREE.Material,
    { color: THREE.Color; metalness: number; roughness: number }
  >();

  function rememberLook(material: THREE.Material) {
    if (baseLooks.has(material)) return;
    const standard = material as THREE.MeshStandardMaterial;
    baseLooks.set(material, {
      color: standard.color ? standard.color.clone() : new THREE.Color(1, 1, 1),
      metalness:
        typeof standard.metalness === "number" ? standard.metalness : 0,
      roughness:
        typeof standard.roughness === "number" ? standard.roughness : 0.5,
    });
  }

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
    envTarget = pmrem.fromScene(roomScene!, 0.6, 0.1, 1000);
    scene.environment = envTarget.texture;
  }

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
    disposeObject(model, surface);
    model = null;
  }

  function clearAsset() {
    if (assetSource?.kind === "mesh") disposeObject(assetSource.scene, surface);
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
          if (!material) continue;
          rememberLook(material);
        }
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
    mapShapeUvs(geometry, assetSource.uvSpan);
    geometry.rotateX(Math.PI);
    surface.map = assetSource.texture ?? null;
    surface.needsUpdate = true;
    mountModel(new THREE.Mesh(geometry, surface));
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
          painted = await rasterizeImage(
            new Blob([buffer], { type: "image/svg+xml" }),
            TEXTURE_SIZE,
          );
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
      floatGroup.scale.setScalar(1);
    }
    applyOptions();
  };
  motionQuery.addEventListener("change", onMotionChange);

  const backgroundColor = new THREE.Color();
  const tintColor = new THREE.Color();

  const quad = new THREE.BufferGeometry();
  quad.setAttribute(
    "position",
    new THREE.BufferAttribute(
      new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]),
      3,
    ),
  );
  const passScene = new THREE.Scene();
  const passCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const blankPass = new THREE.ShaderMaterial();
  const passMesh = new THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>(
    quad,
    blankPass,
  );
  passMesh.frustumCulled = false;
  passScene.add(passMesh);

  function makePass(
    fragmentShader: string,
    uniforms: THREE.ShaderMaterialParameters["uniforms"],
  ) {
    return new THREE.ShaderMaterial({
      glslVersion: THREE.GLSL3,
      vertexShader: QUAD_VERT,
      fragmentShader,
      uniforms,
      depthTest: false,
      depthWrite: false,
      blending: THREE.NoBlending,
    });
  }

  function makeSimTarget(size: number, format: THREE.PixelFormat) {
    const target = new THREE.WebGLRenderTarget(size, size, {
      format,
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      wrapS: THREE.ClampToEdgeWrapping,
      wrapT: THREE.ClampToEdgeWrapping,
      depthBuffer: false,
      stencilBuffer: false,
    });
    target.texture.colorSpace = THREE.NoColorSpace;
    target.texture.generateMipmaps = false;
    return target;
  }

  const velocity = [
    makeSimTarget(SIM_RES, THREE.RGBAFormat),
    makeSimTarget(SIM_RES, THREE.RGBAFormat),
  ];
  const pressure = [
    makeSimTarget(SIM_RES, THREE.RGBAFormat),
    makeSimTarget(SIM_RES, THREE.RGBAFormat),
  ];
  const field = [
    makeSimTarget(FIELD_RES, THREE.RGBAFormat),
    makeSimTarget(FIELD_RES, THREE.RGBAFormat),
  ];
  const divergence = makeSimTarget(SIM_RES, THREE.RGBAFormat);
  const curl = makeSimTarget(SIM_RES, THREE.RGBAFormat);

  const sceneTarget = new THREE.WebGLRenderTarget(1, 1, {
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    wrapS: THREE.ClampToEdgeWrapping,
    wrapT: THREE.ClampToEdgeWrapping,
    samples: 4,
  });
  sceneTarget.texture.colorSpace = THREE.LinearSRGBColorSpace;
  sceneTarget.texture.generateMipmaps = false;

  const simTexel = new THREE.Vector2(1 / SIM_RES, 1 / SIM_RES);
  const fieldTexel = new THREE.Vector2(1 / FIELD_RES, 1 / FIELD_RES);

  const splatPass = makePass(SPLAT_FRAG, {
    tTarget: { value: null },
    uPoint: { value: new THREE.Vector2(0.5, 0.5) },
    uValue: { value: new THREE.Vector3() },
    uRadius: { value: 0.02 },
    uAspect: { value: 1 },
  });
  const curlPass = makePass(CURL_FRAG, {
    tVelocity: { value: null },
    uTexel: { value: simTexel },
  });
  const vorticityPass = makePass(VORTICITY_FRAG, {
    tVelocity: { value: null },
    tCurl: { value: curl.texture },
    uTexel: { value: simTexel },
    uCurl: { value: 1 },
    uDt: { value: SIM_STEP },
  });
  const divergencePass = makePass(DIVERGENCE_FRAG, {
    tVelocity: { value: null },
    uTexel: { value: simTexel },
  });
  const pressurePass = makePass(PRESSURE_FRAG, {
    tPressure: { value: null },
    tDivergence: { value: divergence.texture },
    uTexel: { value: simTexel },
  });
  const gradientPass = makePass(GRADIENT_FRAG, {
    tPressure: { value: null },
    tVelocity: { value: null },
    uTexel: { value: simTexel },
  });
  const advectPass = makePass(ADVECT_FRAG, {
    tVelocity: { value: null },
    tSource: { value: null },
    uTexel: { value: simTexel },
    uDt: { value: SIM_STEP },
    uDissipation: { value: 0.98 },
  });
  const fadePass = makePass(FADE_FRAG, {
    tSource: { value: null },
    uFade: { value: 0.8 },
  });
  const compositePass = makePass(COMPOSITE_FRAG, {
    tScene: { value: sceneTarget.texture },
    tField: { value: field[0].texture },
    uFieldTexel: { value: fieldTexel },
    uDistortion: { value: 1 },
    uAberration: { value: 0.4 },
    uGrain: { value: 0.25 },
    uCursor: { value: new THREE.Vector2(0.5, 0.5) },
    uLensRadius: { value: 0.3 },
    uGlow: { value: 0 },
    uAspect: { value: 1 },
    uSheen: { value: 0.5 },
    uIridescence: { value: 1 },
    uAmbient: { value: 0.5 },
    uTime: { value: 0 },
    uBackground: { value: new THREE.Vector3() },
    uHasBackground: { value: 0 },
    uExposure: { value: 1 },
    uBrightness: { value: 1 },
    uSaturation: { value: 1 },
  });

  function runPass(
    material: THREE.ShaderMaterial,
    target: THREE.WebGLRenderTarget | null,
  ) {
    passMesh.material = material;
    renderer.setRenderTarget(target);
    renderer.render(passScene, passCamera);
  }

  function wipe(target: THREE.WebGLRenderTarget) {
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, false, false);
  }

  function clearSimulation() {
    for (const target of [
      ...velocity,
      ...pressure,
      ...field,
      divergence,
      curl,
    ]) {
      wipe(target);
    }
    renderer.setRenderTarget(null);
  }

  const splatValue = new THREE.Vector3();
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

  function onPointerMove(event: PointerEvent) {
    const rect = rectCache.current;
    if (rect.width < 1 || rect.height < 1) return;
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const previous = pointers.get(event.pointerId);
    pointers.set(event.pointerId, { x: px, y: py });
    cursorUv.set(px / rect.width, 1 - py / rect.height);
    if (!previous) return;
    const force = Math.max(config.cursorForce, 0) * 1.1;
    const dx = (px - previous.x) * force;
    const dy = -(py - previous.y) * force;
    if (dx * dx + dy * dy < 1e-8) return;
    if (queued.length < 64) {
      queued.push([px / rect.width, 1 - py / rect.height, dx, dy, 1]);
    }
    const kick = Math.max(config.wobble, 0) * 0.0025;
    wobbleTiltVel.x -= dy * kick;
    wobbleTiltVel.y += dx * kick;
  }

  function onPointerDown(event: PointerEvent) {
    const rect = canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return;
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    pointers.set(event.pointerId, { x: px, y: py });
    cursorUv.set(px / rect.width, 1 - py / rect.height);
    const strength = Math.max(config.splash, 0);
    if (strength <= 0) return;
    squashVel -= 1.8 * Math.min(strength, 2) * Math.max(config.wobble, 0);
    const x = px / rect.width;
    const y = 1 - py / rect.height;
    for (let i = 0; i < 8 && queued.length < 64; i++) {
      const angle = (i / 8) * Math.PI * 2;
      const cx = Math.cos(angle);
      const cy = Math.sin(angle);
      queued.push([
        x + cx * 0.02,
        y + cy * 0.02,
        cx * 70 * strength,
        cy * 70 * strength,
        2.2,
      ]);
    }
  }

  function onPointerLeave(event: PointerEvent) {
    pointers.delete(event.pointerId);
  }

  canvas.addEventListener("pointermove", onPointerMove, { passive: true });
  canvas.addEventListener("pointerdown", onPointerDown, { passive: true });
  canvas.addEventListener("pointerleave", onPointerLeave, { passive: true });
  canvas.addEventListener("pointercancel", onPointerLeave, { passive: true });

  function splat(
    target: THREE.WebGLRenderTarget[],
    value: THREE.Vector3,
    radius: number,
  ) {
    splatPass.uniforms.tTarget.value = target[0].texture;
    (splatPass.uniforms.uPoint.value as THREE.Vector2).copy(pointer);
    (splatPass.uniforms.uValue.value as THREE.Vector3).copy(value);
    splatPass.uniforms.uRadius.value = radius;
    splatPass.uniforms.uAspect.value = aspect;
    runPass(splatPass, target[1]);
    target.reverse();
  }

  function stepSimulation(delta: number) {
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

    curlPass.uniforms.tVelocity.value = velocity[0].texture;
    runPass(curlPass, curl);

    vorticityPass.uniforms.tVelocity.value = velocity[0].texture;
    vorticityPass.uniforms.uCurl.value = Math.max(config.swirl, 0) * 4;
    vorticityPass.uniforms.uDt.value = delta;
    runPass(vorticityPass, velocity[1]);
    velocity.reverse();

    divergencePass.uniforms.tVelocity.value = velocity[0].texture;
    runPass(divergencePass, divergence);

    fadePass.uniforms.tSource.value = pressure[0].texture;
    fadePass.uniforms.uFade.value = Math.pow(0.8, delta * 60);
    runPass(fadePass, pressure[1]);
    pressure.reverse();
    for (let i = 0; i < PRESSURE_STEPS; i++) {
      pressurePass.uniforms.tPressure.value = pressure[0].texture;
      runPass(pressurePass, pressure[1]);
      pressure.reverse();
    }

    gradientPass.uniforms.tPressure.value = pressure[0].texture;
    gradientPass.uniforms.tVelocity.value = velocity[0].texture;
    runPass(gradientPass, velocity[1]);
    velocity.reverse();

    const settle = Math.min(Math.max(config.persistence, 0), 1);
    const frames = delta * 60;
    const flowDecay = Math.pow(0.985 + settle * 0.015, frames);
    const fieldDecay = Math.pow(0.9 + settle * 0.099, frames);

    advectPass.uniforms.tVelocity.value = velocity[0].texture;
    advectPass.uniforms.tSource.value = velocity[0].texture;
    advectPass.uniforms.uDt.value = delta;
    advectPass.uniforms.uTexel.value = simTexel;
    advectPass.uniforms.uDissipation.value = flowDecay;
    runPass(advectPass, velocity[1]);
    velocity.reverse();

    advectPass.uniforms.tVelocity.value = velocity[0].texture;
    advectPass.uniforms.tSource.value = field[0].texture;
    advectPass.uniforms.uTexel.value = fieldTexel;
    advectPass.uniforms.uDissipation.value = fieldDecay;
    runPass(advectPass, field[1]);
    field.reverse();

    simEnergy *= fieldDecay;
    renderer.setRenderTarget(null);
  }

  function applyOptions() {
    scene.background = null;
    renderer.setClearColor(0x000000, 0);
    scene.environmentIntensity = config.environmentIntensity;
    controls.enableRotate = config.orbit;
    controls.enableZoom = config.zoom;
    controls.autoRotate = config.autoRotate && !reducedMotion;
    controls.autoRotateSpeed = config.autoRotateSpeed;
    camera.fov = config.fov;
    camera.updateProjectionMatrix();
    floatGroup.position.x = config.xOffset;
    floatGroup.position.y = MODEL_LIFT + config.yOffset;

    const gloss = Math.min(Math.max(config.gloss, 0), 1);
    const metallic = Math.min(Math.max(config.metallic, 0), 1);
    const roughness = 1 - gloss;
    if (config.tint) tintColor.set(config.tint);
    else tintColor.set(0xffffff);

    surface.roughness = roughness;
    surface.metalness = metallic;
    surface.color.copy(tintColor);

    for (const [material, base] of baseLooks) {
      const standard = material as THREE.MeshStandardMaterial;
      if (standard.color) standard.color.copy(base.color).multiply(tintColor);
      if (typeof standard.metalness === "number") {
        standard.metalness = base.metalness + (1 - base.metalness) * metallic;
      }
      if (typeof standard.roughness === "number") {
        standard.roughness =
          base.roughness + (0.25 - base.roughness) * metallic;
      }
    }

    compositePass.uniforms.uDistortion.value = Math.max(config.distortion, 0);
    compositePass.uniforms.uAberration.value = Math.min(
      Math.max(config.aberration, 0),
      1,
    );
    compositePass.uniforms.uGrain.value = Math.min(
      Math.max(config.grain, 0),
      1,
    );
    compositePass.uniforms.uLensRadius.value =
      0.12 + Math.min(Math.max(config.cursorSize, 0.02), 1) * 0.45;
    compositePass.uniforms.uSheen.value = Math.max(config.sheen, 0);
    compositePass.uniforms.uIridescence.value = Math.max(config.iridescence, 0);
    compositePass.uniforms.uAmbient.value = reducedMotion
      ? 0
      : Math.max(config.ambient, 0);
    compositePass.uniforms.uBrightness.value = Math.max(config.brightness, 0);
    compositePass.uniforms.uSaturation.value = Math.max(config.saturation, 0);
    if (config.background) {
      backgroundColor.set(config.background);
      (compositePass.uniforms.uBackground.value as THREE.Vector3).set(
        backgroundColor.r,
        backgroundColor.g,
        backgroundColor.b,
      );
      compositePass.uniforms.uHasBackground.value = 1;
    } else {
      compositePass.uniforms.uHasBackground.value = 0;
    }

    applyFit();
    buildModel();
  }

  function resize() {
    const width = Math.max(canvas.clientWidth, 1);
    const height = Math.max(canvas.clientHeight, 1);
    const pr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pr);
    renderer.setSize(width, height, false);
    sceneTarget.setSize(
      Math.max(1, Math.round(width * pr)),
      Math.max(1, Math.round(height * pr)),
    );
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    aspect = width / height;
    splatPass.uniforms.uAspect.value = aspect;
  }

  const observer = new ResizeObserver(resize);
  observer.observe(canvas);
  resize();
  clearSimulation();
  applyOptions();
  loadAsset();

  let inView = true;
  let loopRunning = false;
  let lastTime = 0;
  let elapsed = Math.random() * 100;

  function tick(time: number) {
    if (!inView) {
      lastTime = 0;
      stopLoop();
      return;
    }
    const delta = lastTime ? Math.min((time - lastTime) / 1000, 0.05) : 0;
    lastTime = time;
    if (envDirty) {
      envDirty = false;
      refreshEnvironment();
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
      floatGroup.rotation.x =
        (Math.cos(elapsed / 4) / 8) * config.rotationIntensity + wobbleTilt.x;
      floatGroup.rotation.y =
        (Math.sin(elapsed / 4) / 8) * config.rotationIntensity + wobbleTilt.y;
      floatGroup.rotation.z =
        (Math.sin(elapsed / 4) / 20) * config.rotationIntensity;
      floatGroup.position.y =
        MODEL_LIFT +
        config.yOffset +
        (Math.sin(elapsed / 1.5) / 10) * config.floatIntensity;
    }

    if (delta > 0 && (queued.length > 0 || simEnergy > 0.002)) {
      stepSimulation(Math.min(delta, SIM_STEP * 2));
    }

    renderer.setRenderTarget(sceneTarget);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, camera);

    compositePass.uniforms.tField.value = field[0].texture;
    compositePass.uniforms.uTime.value = time * 0.001;
    glow += ((pointers.size > 0 ? 1 : 0) - glow) * Math.min(delta * 6, 1);
    compositePass.uniforms.uGlow.value = glow;
    (compositePass.uniforms.uCursor.value as THREE.Vector2).copy(cursorUv);
    compositePass.uniforms.uAspect.value = aspect;
    compositePass.uniforms.uExposure.value = renderer.toneMappingExposure;
    runPass(compositePass, null);
  }

  function startLoop() {
    if (loopRunning || !inView || disposed) return;
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

  startLoop();

  return {
    setOptions(next: LiquidObjectOptions) {
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

      const previousHighlight = config.highlight;
      const previousDistance = config.cameraDistance;
      Object.assign(config, next);
      if (config.highlight !== previousHighlight) envDirty = true;
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
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointerleave", onPointerLeave);
      canvas.removeEventListener("pointercancel", onPointerLeave);
      motionQuery.removeEventListener("change", onMotionChange);
      controls.dispose();
      clearAsset();
      if (roomScene) disposeObject(roomScene);
      envTarget?.dispose();
      pmrem.dispose();
      draco.dispose();
      surface.dispose();
      quad.dispose();
      blankPass.dispose();
      for (const material of [
        splatPass,
        curlPass,
        vorticityPass,
        divergencePass,
        pressurePass,
        gradientPass,
        advectPass,
        fadePass,
        compositePass,
      ]) {
        material.dispose();
      }
      for (const target of [
        ...velocity,
        ...pressure,
        ...field,
        divergence,
        curl,
        sceneTarget,
      ]) {
        target.dispose();
      }
      renderer.dispose();
    },
  };
}
