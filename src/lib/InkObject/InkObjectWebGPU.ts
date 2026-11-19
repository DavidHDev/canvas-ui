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

export interface InkObjectOptions {
  /** URL of the asset to display: GLB/glTF, SVG, PNG, JPEG, WebP, or GIF. Object URLs from a file input work too. The format is sniffed from the bytes, not the extension. */
  src?: string;
  /** Enable the ink pass. Turn off to see the raw render. */
  ink?: boolean;
  /** Color of the ink strokes, as any CSS color. Empty string picks one automatically: dark or light against `background`, or the page text color when the canvas is transparent, so it follows your theme. */
  inkColor?: string;
  /** Distance between stroke centers in CSS pixels. */
  lineSpacing?: number;
  /** Thickness of the strokes relative to the line spacing (0 to 1.5). */
  strokeWeight?: number;
  /** Angle of the stroke lines in degrees. */
  angle?: number;
  /** Length scale of the dash breakup along each stroke, in CSS pixels. */
  dashLength?: number;
  /** How aggressively strokes break into dashes as the tone lightens (0 keeps solid lines). */
  variation?: number;
  /** Ragged ink bleed along the stroke edges (0 to 1). */
  bleed?: number;
  /** Dry-brush speckle eaten out of the ink (0 to 1). */
  grain?: number;
  /** Hand-pressed waviness of the stroke lines (0 to 1). */
  wobble?: number;
  /** How far the stroke lines ride the surface height read from the depth buffer, so they wrap a 3D form. Flat art is unaffected. */
  relief?: number;
  /** Extrusion depth of 2D assets (SVG or image) as a fraction of their longest side. */
  depth?: number;
  /** Slope of the tone-to-ink ramp. Higher crushes midtones into solid black or bare paper. */
  contrast?: number;
  /** Tone that lands at half ink coverage. Raise it to ink only the darkest areas. */
  threshold?: number;
  /** Softness of the stroke edges (0 is a hard letterpress edge). */
  softness?: number;
  /** Ink the light areas instead of the dark ones. */
  invert?: boolean;
  /** Paper color behind the ink. Empty string keeps the canvas transparent. */
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

export interface InkObjectElements {
  canvas: HTMLCanvasElement;
}

export interface InkObjectInstance {
  setOptions: (options: InkObjectOptions) => void;
  resize: () => void;
  destroy: () => void;
}

const DEFAULTS: Required<InkObjectOptions> = {
  src: "",
  ink: true,
  inkColor: "",
  lineSpacing: 8,
  strokeWeight: 1,
  angle: 0,
  dashLength: 14,
  variation: 1,
  bleed: 0.35,
  grain: 0.32,
  wobble: 0.3,
  relief: 0.5,
  depth: 0.08,
  contrast: 2.2,
  threshold: 0.2,
  softness: 0.4,
  invert: false,
  background: "",
  highlight: "#066aff",
  environmentIntensity: 0.5,
  roughness: 0.35,
  scale: 3,
  xOffset: 0,
  yOffset: 0,
  floatIntensity: 0,
  rotationIntensity: 0,
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

const FORWARD_SHADER = `
struct SceneParams {
  viewProj: mat4x4f,
  view: mat4x4f,
  cameraPos: vec4f,
  highlightColor: vec4f,
  environment: vec4f,
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
  @location(3) viewZ: f32,
}

struct FSOut {
  @location(0) color: vec4f,
  @location(1) height: vec4f,
}

@group(0) @binding(0) var<uniform> scene: SceneParams;
@group(0) @binding(1) var<uniform> modelParams: ModelParams;
@group(0) @binding(2) var baseMap: texture_2d<f32>;
@group(0) @binding(3) var mapSampler: sampler;

fn srgbToLinear(c: vec3f) -> vec3f {
  return select(c / 12.92, pow((c + vec3f(0.055)) / 1.055, vec3f(2.4)), c > vec3f(0.04045));
}

fn aces(c: vec3f) -> vec3f {
  let a = 2.51;
  let b = 0.03;
  let cc = 2.43;
  let d = 0.59;
  let e = 0.14;
  return clamp((c * (a * c + vec3f(b))) / (c * (cc * c + vec3f(d)) + vec3f(e)), vec3f(0.0), vec3f(1.0));
}

fn attenuate(distance: f32, range: f32, decay: f32) -> f32 {
  let falloff = 1.0 / max(pow(distance, decay), 1.0);
  let window = pow(clamp(1.0 - pow(distance / range, 4.0), 0.0, 1.0), 2.0);
  return falloff * window;
}

fn addLight(sum: ptr<function, vec3f>, pos: vec3f, color: vec3f, intensity: f32, worldPos: vec3f, normal: vec3f, viewDir: vec3f, roughness: f32, metalness: f32, baseColor: vec3f) {
  let toLight = pos - worldPos;
  let dist = length(toLight);
  let lightDir = toLight / max(dist, 0.0001);
  let ndl = max(dot(normal, lightDir), 0.0);
  let radiance = color * intensity * attenuate(dist, 28.0, 2.0);
  let halfDir = normalize(lightDir + viewDir);
  let ndh = max(dot(normal, halfDir), 0.0);
  let specPower = mix(96.0, 8.0, roughness);
  let spec = pow(ndh, specPower) * (1.0 - roughness * 0.65);
  let diffuse = baseColor * ndl * (1.0 - metalness);
  (*sum) += (diffuse + vec3f(spec)) * radiance;
}

@vertex fn vs_main(
  @location(0) position: vec3f,
  @location(1) normal: vec3f,
  @location(2) uv: vec2f,
) -> VSOut {
  let world = modelParams.model * vec4f(position, 1.0);
  let view = scene.view * world;
  var clip = scene.viewProj * world;
  clip.z = clip.z * 0.5 + clip.w * 0.5;
  var out: VSOut;
  out.pos = clip;
  out.worldPos = world.xyz;
  out.normal = normalize(modelParams.normalMatrix * normal);
  out.uv = uv;
  out.viewZ = view.z;
  return out;
}

@fragment fn fs_main(in: VSOut) -> FSOut {
  let sampled = textureSampleLevel(baseMap, mapSampler, in.uv, 0.0);
  let texColor = srgbToLinear(sampled.rgb);
  let useMap = modelParams.metalOpacityMapUnlit.z;
  let unlit = modelParams.metalOpacityMapUnlit.w;
  let alpha = modelParams.baseColor.a * mix(1.0, sampled.a, useMap);
  if (alpha < 0.01) { discard; }
  var base = modelParams.baseColor.rgb * mix(vec3f(1.0), texColor, useMap);
  if (unlit > 0.5) {
    return FSOut(vec4f(base, alpha), vec4f(in.viewZ, 0.0, 0.0, 1.0));
  }
  let normal = normalize(in.normal);
  let viewDir = normalize(scene.cameraPos.xyz - in.worldPos);
  let roughness = clamp(modelParams.emissiveRoughness.w, 0.04, 1.0);
  let metalness = clamp(modelParams.metalOpacityMapUnlit.x, 0.0, 1.0);
  var lit = base * (0.04 + scene.environment.w * 0.75);
  addLight(&lit, vec3f(0.5, 14.0, 0.5), vec3f(1.0), 100.0 * scene.environment.w, in.worldPos, normal, viewDir, roughness, metalness, base);
  addLight(&lit, vec3f(-14.0, 14.0, -4.0), vec3f(1.0), 100.0 * scene.environment.w, in.worldPos, normal, viewDir, roughness, metalness, base);
  addLight(&lit, vec3f(14.0, 12.0, 0.0), vec3f(1.0), 100.0 * scene.environment.w, in.worldPos, normal, viewDir, roughness, metalness, base);
  addLight(&lit, vec3f(0.0, 9.0, 14.0), vec3f(1.0), 100.0 * scene.environment.w, in.worldPos, normal, viewDir, roughness, metalness, base);
  addLight(&lit, vec3f(7.0, 8.0, -14.0), vec3f(1.0), 100.0 * scene.environment.w, in.worldPos, normal, viewDir, roughness, metalness, base);
  addLight(&lit, vec3f(-7.0, 16.0, -14.0), vec3f(1.0), 100.0 * scene.environment.w, in.worldPos, normal, viewDir, roughness, metalness, base);
  addLight(&lit, vec3f(0.0, 20.0, 0.0), vec3f(1.0), 60.0 * scene.environment.w, in.worldPos, normal, viewDir, roughness, metalness, base);
  addLight(&lit, vec3f(0.0, 15.0, 0.0), vec3f(1.0), 80.0 * scene.environment.w, in.worldPos, normal, viewDir, roughness, metalness, base);
  addLight(&lit, vec3f(2.0, 3.0, -2.0), scene.highlightColor.rgb, 180.0 * scene.environment.w, in.worldPos, normal, viewDir, roughness, metalness, base);
  lit += modelParams.emissiveRoughness.rgb;
  let mapped = aces(lit);
  return FSOut(vec4f(mapped, alpha), vec4f(in.viewZ, 0.0, 0.0, 1.0));
}`;

const POST_SHADER = `
struct Params {
  inkColor: vec4f,
  paperColor: vec4f,
  resolution: vec2f,
  dir: vec2f,
  pixelRatio: f32,
  camNear: f32,
  camFar: f32,
  heightCenter: f32,
  heightSpan: f32,
  relief: f32,
  spacing: f32,
  weight: f32,
  dash: f32,
  variation: f32,
  bleed: f32,
  grain: f32,
  wobble: f32,
  contrast: f32,
  threshold: f32,
  softness: f32,
  invert: f32,
  ink: f32,
  paperAlpha: f32,
  pad: f32,
}

@group(0) @binding(0) var<uniform> params: Params;
@group(0) @binding(1) var tDiffuse: texture_2d<f32>;
@group(0) @binding(2) var uHeight: texture_2d<f32>;
@group(0) @binding(3) var uSampler: sampler;

const LUMA = vec3f(0.2126, 0.7152, 0.0722);

fn toSrgb(c: vec3f) -> vec3f {
  let clamped = clamp(c, vec3f(0.0), vec3f(1.0));
  return select(clamped * 12.92, 1.055 * pow(clamped, vec3f(1.0 / 2.4)) - vec3f(0.055), clamped >= vec3f(0.0031308));
}

fn hash21(pIn: vec2f) -> f32 {
  var p = fract(pIn * vec2f(123.34, 345.45));
  p += dot(p, p + vec2f(34.345));
  return fract(p.x * p.y);
}

fn vnoise(p: vec2f) -> f32 {
  let i = floor(p);
  let f = fract(p);
  let u = f * f * (vec2f(3.0) - 2.0 * f);
  let a = hash21(i);
  let b = hash21(i + vec2f(1.0, 0.0));
  let c = hash21(i + vec2f(0.0, 1.0));
  let d = hash21(i + vec2f(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

fn fbm2(p: vec2f) -> f32 {
  return vnoise(p) * 0.65 + vnoise(p * 2.07 + vec2f(7.3)) * 0.35;
}

fn toStroke(p: vec2f) -> vec2f {
  return vec2f(p.x * params.dir.x + p.y * params.dir.y, p.y * params.dir.x - p.x * params.dir.y);
}

fn toScreen(p: vec2f) -> vec2f {
  return vec2f(p.x * params.dir.x - p.y * params.dir.y, p.x * params.dir.y + p.y * params.dir.x);
}

fn sampleTone(pixel: vec2f) -> vec2f {
  let uv = pixel / params.resolution;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { return vec2f(0.0); }
  let tex = textureSampleLevel(tDiffuse, uSampler, uv, 0.0);
  let alpha = clamp(tex.a, 0.0, 1.0);
  if (alpha <= 0.0) { return vec2f(0.0); }
  let luma = dot(toSrgb(tex.rgb / alpha), LUMA);
  let tone = select(1.0 - luma, luma, params.invert > 0.5);
  return vec2f(tone * alpha, alpha);
}

fn sampleHeight(pixel: vec2f) -> f32 {
  let uv = pixel / params.resolution;
  if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) { return 0.5; }
  let alpha = clamp(textureSampleLevel(tDiffuse, uSampler, uv, 0.0).a, 0.0, 1.0);
  let viewZ = textureSampleLevel(uHeight, uSampler, uv, 0.0).r;
  let height = clamp(0.5 + (params.heightCenter + viewZ) / (2.0 * params.heightSpan), 0.0, 1.0);
  return mix(0.5, height, smoothstep(0.0, 0.6, alpha));
}

@fragment fn fs_main(@location(0) uv: vec2f) -> @location(0) vec4f {
  let raw = textureSampleLevel(tDiffuse, uSampler, uv, 0.0);
  if (params.ink < 0.5) {
    let rawPaper = params.paperAlpha * (1.0 - raw.a);
    return vec4f(toSrgb(raw.rgb) * raw.a + toSrgb(params.paperColor.rgb) * rawPaper, raw.a + rawPaper);
  }

  let frag = uv * params.resolution;
  let q = toStroke(frag);
  let n = q / params.spacing;
  let relief = (sampleHeight(frag) - 0.5) * params.relief * params.spacing * 2.0;
  let wobble = (fbm2(n * vec2f(0.06, 0.11)) - 0.5) * params.wobble * params.spacing;
  let shift = wobble + relief;
  let lineY = q.y + shift;
  let row = floor(lineY / params.spacing);
  let center = (row + 0.5) * params.spacing;
  let within = lineY - center;

  let band = vec2f(q.x, center - shift);
  let bandStep = toScreen(vec2f(0.0, params.spacing * 0.22));
  let tone = sampleTone(toScreen(band)) * 3.0 + sampleTone(toScreen(band) - bandStep) + sampleTone(toScreen(band) + bandStep);
  let presence = smoothstep(0.03, 0.45, clamp(tone.y * 0.2, 0.0, 1.0));
  let level = tone.x / max(tone.y, 1e-4);
  let amount = clamp(0.5 + (level - params.threshold) * params.contrast, 0.0, 1.0) * presence;
  let mark = smoothstep(0.0, 0.02, amount);

  let pitch = max(params.dash, 2.0);
  let rowPhase = hash21(vec2f(row * 0.73 + 5.1, 8.2)) * pitch;
  let qx = q.x + rowPhase;
  let cell = floor(qx / pitch);
  let rowJitter = 0.88 + 0.24 * hash21(vec2f(row, 3.3));
  let fill = mix(0.18, 0.80, amount) + 0.34 * smoothstep(0.90, 1.0, amount);
  let maxHalf = 0.5 * params.spacing * params.weight * rowJitter * fill;
  let lenScale = mix(mix(2.6, 0.3, clamp(params.variation, 0.0, 1.0)), 2.6, amount);

  var d = -params.spacing * 4.0;
  for (var i = -2; i <= 2; i++) {
    let ci = cell + f32(i);
    let r1 = hash21(vec2f(ci, row * 1.7 + 0.5));
    let r2 = hash21(vec2f(ci + 31.4, row * 2.3 + 0.5));
    let r3 = hash21(vec2f(ci + 77.7, row * 3.9 + 0.5));
    let keep = mix(1.0, clamp(amount * 3.6 + 0.1, 0.0, 1.0), clamp(params.variation, 0.0, 1.0));
    if (hash21(vec2f(ci + 13.7, row * 5.1 + 2.0)) > keep) { continue; }
    let beadX = (ci + 0.5 + (r1 - 0.5) * 0.5) * pitch;
    let beadY = (r3 - 0.5) * 0.22 * params.spacing;
    let beadHalf = pitch * 0.5 * max(lenScale, 0.04) * (0.75 + 0.5 * r2);
    let u = (qx - beadX) / beadHalf;
    let k = 1.0 - u * u;
    if (k > 0.0) {
      d = max(d, maxHalf * (0.82 + 0.36 * r2) * sqrt(k) - abs(within - beadY));
    }
  }

  d += (fbm2(n * vec2f(1.5, 3.1) + vec2f(19.0)) - 0.5) * params.bleed * params.spacing * 0.3 * mark;
  d -= max(vnoise(n * vec2f(5.3, 9.7) + vec2f(61.0)) - 0.5, 0.0) * params.grain * params.spacing * 0.5 * mark;
  d -= (1.0 - mark) * params.spacing * 4.0;

  let aa = mix(0.2, 1.6, clamp(params.softness, 0.0, 1.0)) * params.pixelRatio;
  let ink = smoothstep(-aa, aa, d);
  let inkColor = toSrgb(params.inkColor.rgb);
  let paperColor = toSrgb(params.paperColor.rgb);
  let paper = params.paperAlpha * (1.0 - ink);
  return vec4f(inkColor * ink + paperColor * paper, ink + paper);
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
  lit: boolean,
  depth: number,
): THREE.Mesh {
  const longest = Math.max(canvas.width, canvas.height, 1);
  const aspectW = canvas.width / longest;
  const aspectH = canvas.height / longest;
  const bevel = Math.min(BEVEL_SIZE, depth * 0.25);
  const geometry = new THREE.ExtrudeGeometry(
    buildShapes(canvas, aspectW, aspectH),
    {
      depth,
      bevelEnabled: bevel > 1e-5,
      bevelThickness: bevel,
      bevelSize: bevel,
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
  const material = lit
    ? new THREE.MeshStandardMaterial({
        map: texture,
        roughness: 0.6,
        metalness: 0,
      })
    : new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
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

let colorProbe: CanvasRenderingContext2D | null | undefined;

function parseCssColor(value: string): [number, number, number] | null {
  if (!value || typeof document === "undefined") return null;
  if (colorProbe === undefined) {
    const probe = document.createElement("canvas");
    probe.width = 1;
    probe.height = 1;
    colorProbe = probe.getContext("2d", { willReadFrequently: true });
  }
  if (!colorProbe) return null;
  colorProbe.clearRect(0, 0, 1, 1);
  colorProbe.fillStyle = "#000000";
  colorProbe.fillStyle = value;
  colorProbe.fillRect(0, 0, 1, 1);
  const [r, g, b] = colorProbe.getImageData(0, 0, 1, 1).data;
  return [r / 255, g / 255, b / 255];
}

const LIGHT_PAPER_INK: [number, number, number] = [0.067, 0.067, 0.067];
const DARK_PAPER_INK: [number, number, number] = [0.96, 0.96, 0.96];

function resolveInkColor(
  inkColor: string,
  background: string,
  canvas: HTMLCanvasElement,
): [number, number, number] {
  const explicit = parseCssColor(inkColor);
  if (explicit) return explicit;
  const paper = parseCssColor(background);
  if (paper) {
    const luma = 0.2126 * paper[0] + 0.7152 * paper[1] + 0.0722 * paper[2];
    return luma > 0.5 ? LIGHT_PAPER_INK : DARK_PAPER_INK;
  }
  return parseCssColor(getComputedStyle(canvas).color) ?? LIGHT_PAPER_INK;
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
const BEVEL_SIZE = 0.006;

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

function materialInfo(material: THREE.Material | undefined, config: Required<InkObjectOptions>): MaterialInfo {
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

export function createInkObject(
  elements: InkObjectElements,
  options: InkObjectOptions = {},
): InkObjectInstance | null {
  if (!supportsWebGPU()) return null;
  const { canvas } = elements;
  const config: Required<InkObjectOptions> = { ...DEFAULTS, ...resolveOptions(DEFAULTS, options) };

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
  let postFx: Effect | null = null;
  let linearSampler: GPUSampler | null = null;
  let whiteTexture: Texture | null = null;
  let fallback2d: CanvasRenderingContext2D | null = null;
  let renderMeshes: RenderMesh[] = [];

  let model: THREE.Object3D | null = null;
  let modelMaxDim = 1;
  let loadedSrc: string | null = null;
  let loadToken = 0;
  let imageSource: { canvas: HTMLCanvasElement; lit: boolean } | null = null;
  let builtDepth = 0;
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

  function ensureWhiteTexture() {
    if (!whiteTexture) whiteTexture = createSolidTexture(gpu!, [255, 255, 255, 255], "ink-object.white");
    return whiteTexture;
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
      return { texture: createTextureFromImage(gpu!, image, Boolean(map?.flipY), "ink-object.map"), owns: true };
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
      label: "ink-object.geometry",
    });
    source.dispose();
    return result;
  }

  function rebuildRenderMeshes() {
    if (!gpu || !linearSampler) return;
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
            label: "ink-object.forward",
            set: { baseMap: tex.texture, mapSampler: linearSampler },
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

  function buildImageModel() {
    if (!imageSource) return;
    builtDepth = Math.min(Math.max(config.depth, 0.002), 1);
    adoptModel(createImageObject(imageSource.canvas, 1, imageSource.lit, builtDepth));
  }

  async function loadAsset() {
    const src = config.src;
    if (src === loadedSrc) return;
    loadedSrc = src;
    const token = ++loadToken;
    if (!src) {
      imageSource = null;
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
        imageSource = null;
        adoptModel(gltf.scene);
      } else {
        const blob = new Blob([buffer], { type: kind === "svg" ? "image/svg+xml" : "" });
        const source = await decodeImage(blob, kind);
        if (disposed || token !== loadToken) return;
        imageSource = { canvas: source, lit: kind === "svg" };
        buildImageModel();
      }
      config.onLoad?.();
      startLoop();
    } catch (error) {
      if (disposed || token !== loadToken) return;
      config.onError?.(error);
    }
  }

  const modelCenter = new THREE.Vector3();
  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reducedMotion = motionQuery.matches;

  let inkCheckedAt = -Infinity;
  function applyInkColor(force: boolean) {
    const now = performance.now();
    if (!force && (config.inkColor || now - inkCheckedAt < 250)) return;
    inkCheckedAt = now;
    const [r, g, b] = resolveInkColor(config.inkColor, config.background, canvas);
    inkColor.setRGB(r, g, b, THREE.SRGBColorSpace);
  }

  function applyOptions() {
    applyInkColor(true);
    if (imageSource && Math.min(Math.max(config.depth, 0.002), 1) !== builtDepth) buildImageModel();
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
    if (sceneTarget && (sceneTarget.size[0] !== fullWidth || sceneTarget.size[1] !== fullHeight)) {
      sceneTarget.resize([fullWidth, fullHeight]);
      if (postFx) postFx.set({ tDiffuse: sceneTarget, uHeight: sceneTarget.colors[1] });
    }
    camera.aspect = width / height;
    camera.fov = fitFov(config.fov, camera.aspect);
    camera.updateProjectionMatrix();
  }

  const viewProj = new THREE.Matrix4();
  const normalMatrix = new THREE.Matrix3();
  const backgroundColor = new THREE.Color();
  const highlightColor = new THREE.Color();
  const inkColor = new THREE.Color();
  const paperColor = new THREE.Color();

  function renderFallback() {
    if (!fallback2d) return;
    fallback2d.clearRect(0, 0, canvas.width, canvas.height);
    if (config.background) {
      fallback2d.fillStyle = config.background;
      fallback2d.fillRect(0, 0, canvas.width, canvas.height);
    }
  }

  function render() {
    if (!gpu || !screen || !sceneTarget || !postFx) return;
    camera.updateMatrixWorld();
    camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
    viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    scene.updateMatrixWorld(true);
    backgroundColor.set(config.background || "#000000");
    highlightColor.set(config.highlight || "#066aff");
    const sceneParams = {
      viewProj: viewProj.elements,
      view: camera.matrixWorldInverse.elements,
      cameraPos: [camera.position.x, camera.position.y, camera.position.z, 0],
      highlightColor: [highlightColor.r, highlightColor.g, highlightColor.b, 1],
      environment: [backgroundColor.r, backgroundColor.g, backgroundColor.b, Math.max(config.environmentIntensity, 0)],
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
    const radians = (config.angle * Math.PI) / 180;
    applyInkColor(false);
    paperColor.set(config.background || "#ffffff");
    postFx.set({
      params: {
        inkColor: [inkColor.r, inkColor.g, inkColor.b, 1],
        paperColor: [paperColor.r, paperColor.g, paperColor.b, 1],
        resolution: [fullWidth, fullHeight],
        dir: [Math.cos(radians), Math.sin(radians)],
        pixelRatio: dpr,
        camNear: camera.near,
        camFar: camera.far,
        heightCenter: -modelCenter.copy(floatGroup.position).applyMatrix4(camera.matrixWorldInverse).z,
        heightSpan: Math.max(config.scale, 0.001) * 0.5,
        relief: Math.max(config.relief, 0),
        spacing: Math.max(config.lineSpacing, 1) * dpr,
        weight: Math.max(config.strokeWeight, 0),
        dash: Math.max(config.dashLength, 1) * dpr,
        variation: Math.max(config.variation, 0),
        bleed: Math.max(config.bleed, 0),
        grain: Math.max(config.grain, 0),
        wobble: Math.max(config.wobble, 0),
        contrast: Math.max(config.contrast, 0),
        threshold: config.threshold,
        softness: config.softness,
        invert: config.invert ? 1 : 0,
        ink: config.ink ? 1 : 0,
        paperAlpha: config.background ? 1 : 0,
      },
    });
    gpuFrame(gpu, (f) => {
      f.pass({ target: sceneTarget!, clear: [0, 0, 0, 0], clearDepth: 1 }, (pass) => {
        for (const item of renderMeshes) pass.draw(item.draw);
      });
      f.pass({ target: screen!, clear: [0, 0, 0, 0] }, postFx!);
    });
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
    screen = surface(gpu, canvas, { autoResize: false, alphaMode: "premultiplied", label: "ink-object" });
    linearSampler = sampler(gpu, { minFilter: "linear", magFilter: "linear", addressModeU: "clamp-to-edge", addressModeV: "clamp-to-edge" });
    sceneTarget = target(gpu, {
      size: [1, 1],
      colors: [{ format: "rgba16float" }, { format: "rgba16float" }],
      depth: true,
      label: "ink-object.scene",
    });
    postFx = gpuEffect(gpu, POST_SHADER, {
      label: "ink-object.post",
      set: {
        uSampler: linearSampler,
        tDiffuse: sceneTarget,
        uHeight: sceneTarget.colors[1],
      },
    });
    resize();
    rebuildRenderMeshes();
    startLoop();
  }).catch((error) => {
    if (disposed) return;
    console.warn("InkObject: WebGPU unavailable, showing fallback canvas.", error);
    fallback2d = canvas.getContext("2d");
    startLoop();
  });

  return {
    setOptions(next: InkObjectOptions) {
      next = resolveOptions(DEFAULTS, next);
      let changed = false;
      for (const [key, value] of Object.entries(next)) {
        if (typeof value === "function") continue;
        if (config[key as keyof InkObjectOptions] !== value) {
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
      imageSource = null;
      stopLoop();
      observer.disconnect();
      viewObserver?.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      motionQuery.removeEventListener("change", onMotionChange);
      controls.dispose();
      clearModel();
      clearRenderMeshes();
      whiteTexture?.destroy();
      (sceneTarget as unknown as { destroy?: () => void } | null)?.destroy?.();
      screen?.dispose();
      draco.dispose();
    },
  };
}
