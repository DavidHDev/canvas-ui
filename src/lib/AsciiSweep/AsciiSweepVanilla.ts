export type AsciiSweepCharset = "ascii" | "blocks" | "binary";

export type AsciiSweepBlend = "auto" | "add" | "over";

export interface AsciiSweepOptions {
  /** Sweep direction in degrees. 0 sweeps left to right, 90 sweeps bottom to top. */
  angle?: number;
  /** Seconds the sweep takes from one panel to the other. */
  duration?: number;
  /** Width of the ascii band as a fraction of the travel (0 to 1). */
  band?: number;
  /** Feather of the band edges as a fraction of the band (0 to 1). */
  softness?: number;
  /** How ragged the sweep edge is. Higher tears the boundary apart row by row. */
  turbulence?: number;
  /** Length of the glowing trail left behind the band, as a fraction of the band. */
  trail?: number;
  /** Drives the sweep manually from 0 to 1. Set to -1 to let the component animate itself. */
  progress?: number;
  /** Size of one glyph pixel in CSS pixels. Characters are 5x5 glyph pixels. */
  scale?: number;
  /** Empty glyph pixels around each character (0 to 3). */
  spacing?: number;
  /** Built-in character ramp: real ascii glyphs, shade blocks, or binary digits. */
  charset?: AsciiSweepCharset;
  /** Custom ramp of packed 5x5 bitmaps (dark to bright), overrides charset. */
  glyphs?: number[];
  /** Color of the sweeping characters, as any CSS color. */
  color?: string;
  /** How strongly the ink color replaces the content color (0 to 1). */
  tint?: number;
  /** Soft phosphor glow around the characters (0 to 1). */
  glow?: number;
  /** Chromatic aberration across the band, in CSS pixels. */
  aberration?: number;
  /** How much characters flicker on and off as the band passes (0 to 1). */
  flicker?: number;
  /** Share of cells inside the band that light up (0 to 1). */
  density?: number;
  /** Horizontal tearing of content rows inside the band, in CSS pixels. */
  displace?: number;
  /** Contrast applied to character density before picking a glyph. */
  contrast?: number;
  /** Density offset applied before picking a glyph (-1 to 1). */
  brightness?: number;
  /** Invert character density inside the band (0 to 1). */
  invert?: number;
  /** Contrast against the background above which a pixel counts as content and grows characters. */
  threshold?: number;
  /** How far the content dims underneath the band (0 to 1). */
  fade?: number;
  /** How characters composite over the content. "auto" adds on dark pages and paints over on light ones. */
  blend?: AsciiSweepBlend;
  /** Color of the page behind the content, as any CSS color, or "auto" to read it from the DOM. */
  background?: string;
  /** Called when a sweep starts. */
  onSweepStart?: (to: number) => void;
  /** Called once the sweep has fully settled on its destination panel. */
  onSweepEnd?: (to: number) => void;
}

export interface AsciiSweepSlot {
  /** Canvas with layoutsubtree that hosts this panel's HTML. */
  source: HTMLCanvasElement;
  /** The element inside the source canvas that gets captured. */
  content: HTMLElement;
}

export interface AsciiSweepElements {
  /** The two panel slots the effect sweeps between. */
  slots: [AsciiSweepSlot, AsciiSweepSlot];
  /** Canvas the WebGL effect renders to. */
  output: HTMLCanvasElement;
}

export interface AsciiSweepInstance {
  /** Update effect options live. */
  setOptions: (options: AsciiSweepOptions) => void;
  /** Sweep to slot 0 or 1. Pass an angle to override the configured direction for this sweep only. */
  sweep: (to: 0 | 1, options?: { angle?: number }) => void;
  /** The slot the effect is resting on, or animating toward. */
  current: () => 0 | 1;
  /** Force both panels to be captured again. */
  capture: () => void;
  /** Re-read canvas size. Call when the element is resized. */
  resize: () => void;
  /** Stop the loop and release all GPU resources. */
  destroy: () => void;
}

const CHARSETS: Record<AsciiSweepCharset, number[]> = {
  ascii: [
    0, 128, 131200, 14336, 459200, 469440, 4357252, 18157905, 11512810,
    15724526,
  ],
  blocks: [0, 328000, 22041621, 22369621, 11512810, 33554431],
  binary: [0, 4591758, 15324974],
};

/** Seconds the settled effect takes to dissolve away. */
const FADE_OUT_S = 0.45;

const MAX_GLYPHS = 16;
const FALLBACK_CAPTURE_DELAY = 500;

const DEFAULTS: Required<AsciiSweepOptions> = {
  angle: 0,
  duration: 2,
  band: 0.28,
  softness: 0.45,
  turbulence: 0.5,
  trail: 0.75,
  progress: -1,
  scale: 2,
  spacing: 1,
  charset: "ascii",
  glyphs: [],
  color: "#4ade80",
  tint: 0.75,
  glow: 2,
  aberration: 5,
  flicker: 0.35,
  density: 0.9,
  displace: 14,
  contrast: 1.2,
  brightness: 0,
  invert: 0,
  threshold: 0.1,
  fade: 0.75,
  blend: "auto",
  background: "auto",
  onSweepStart: () => {},
  onSweepEnd: () => {},
};

type PaintableCanvas = HTMLCanvasElement & {
  onpaint?: (() => void) | null;
  requestPaint?: () => void;
};

type ElementImageContext = CanvasRenderingContext2D & {
  drawElementImage?: (element: Element, x: number, y: number) => void;
};

const VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
out vec2 vUv;
void main () {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;

uniform sampler2D uFrom;
uniform sampler2D uTo;
uniform vec2 uResolution;
uniform float uProgress;
uniform vec2 uDir;
uniform float uBand;
uniform float uSoftness;
uniform float uTurbulence;
uniform float uTrail;
uniform float uGlyphPx;
uniform float uSpacing;
uniform uint uGlyphs[${MAX_GLYPHS}];
uniform int uGlyphCount;
uniform vec3 uInk;
uniform float uTint;
uniform float uGlow;
uniform float uAberration;
uniform float uFlicker;
uniform float uDensity;
uniform float uDisplace;
uniform float uContrast;
uniform float uBrightness;
uniform float uInvert;
uniform float uThreshold;
uniform float uFade;
uniform float uAdditive;
uniform vec3 uBg;
uniform float uBgLum;
uniform float uTime;
uniform float uLod;
uniform float uActive;
uniform float uMaxX;

#define S(a, b, t) smoothstep(a, b, t)

float glyphBit (int index, ivec2 p) {
  if (p.x < 0 || p.x > 4 || p.y < 0 || p.y > 4) return 0.0;
  uint bits = uGlyphs[index];
  return float((bits >> uint((4 - p.x) + 5 * p.y)) & 1u);
}

float hash21 (vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

float hash31 (vec3 p) {
  return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}

vec4 panel (sampler2D tex, vec2 uv, float lod, vec2 fringe) {
  vec4 c = textureLod(tex, uv, lod);
  if (uAberration > 0.001) {
    c.r = textureLod(tex, uv + fringe, lod).r;
    c.b = textureLod(tex, uv - fringe, lod).b;
  }
  return c;
}

void main () {
  if (uActive < 0.001) {
    outColor = vec4(0.0);
    return;
  }

  vec2 uv = vUv;
  // Leave the panel's scrollbar alone. The output canvas spans the whole
  // container, but the captured content stops where the scrollbar begins.
  if (uv.x > uMaxX) {
    outColor = vec4(0.0);
    return;
  }
  float cellPx = max((5.0 + 2.0 * uSpacing) * uGlyphPx, 1.0);
  vec2 frag = uv * uResolution;
  vec2 cell = floor(frag / cellPx);
  vec2 cellUv = (cell + 0.5) * cellPx / uResolution;

  // Normalized coordinate along the sweep axis: 0 where the band enters, 1 where it leaves.
  float extent = max(0.5 * (abs(uDir.x) + abs(uDir.y)), 1e-4);
  float axis = dot(cellUv - 0.5, uDir) / (2.0 * extent) + 0.5;

  float band = max(uBand, 1e-3);

  // Tear the edge apart per text row so the boundary eats lines instead of
  // cutting straight. Seeds are time independent so the edge does not crawl.
  float rowSeed = hash21(vec2(floor(cell.y * 0.5), 19.7)) - 0.5;
  float cellSeed = hash21(cell * 0.37 + 3.1) - 0.5;
  float jitter = (rowSeed * 0.8 + cellSeed * 0.4) * uTurbulence * band;
  axis += jitter;

  float feather = max(clamp(uSoftness, 0.0, 1.0) * band, 1e-4);

  // The head travels just past the far edge, far enough for the character band
  // and its jittered edge to clear. Any glow still lingering past that is
  // dissolved by the fade out, rather than by stretching the travel further,
  // which would race the band across and leave the tail playing offscreen.
  float glowSpan = band * (1.0 + uTrail) + feather;
  float travel = 1.0 + band * (1.0 + uTrail) + uTurbulence * band;
  float head = uProgress * travel;
  float behind = head - axis;
  // Swap inside the band, where the characters are densest, so the change is
  // hidden. A wide crossfade would show both panels at once and read as ghosting.
  float swap = S(band * 0.30, band * 0.62, behind);
  float enter = S(0.0, feather, behind);
  float leave = 1.0 - S(band, band + max(uTrail, 0.001) * band, behind);
  float ascii = clamp(enter * leave, 0.0, 1.0);

  // A wider, softer envelope than the character band itself, used for bloom so
  // the glow reaches past the glyphs the way a phosphor tube does.
  float aura = (1.0 - S(0.0, glowSpan, abs(behind - band * 0.5)))
    * S(-feather * 2.0, feather, behind);

  vec2 fringe = (uDir * uAberration * max(ascii, aura * 0.5))
    / max(uResolution, vec2(1.0));

  vec2 texUv = vec2(uv.x, 1.0 - uv.y);
  if (uDisplace > 0.001) {
    // Displace in coarse horizontal slices that hold for a few frames, which
    // reads as tape tearing rather than per-frame noise.
    float sliceH = max(cellPx * 1.6, 2.0);
    float slice = floor(frag.y / sliceH);
    float tick = floor(uTime * 12.0);
    float pick = hash21(vec2(slice, tick));
    float tear = (hash21(vec2(slice * 1.7, tick * 0.31)) - 0.5)
      * step(0.45, pick);
    texUv.x += (tear * 2.0 * uDisplace * ascii) / max(uResolution.x, 1.0);
  }

  vec4 rawFrom = panel(uFrom, texUv, 0.0, fringe);
  vec4 rawTo = panel(uTo, texUv, 0.0, fringe);

  vec3 base = mix(
    mix(uBg, rawFrom.rgb, rawFrom.a),
    mix(uBg, rawTo.rgb, rawTo.a),
    swap);
  // Cover wherever either panel has ink, so the live DOM never shows through
  // mid-sweep and the two panels never appear stacked.
  float alpha = max(rawFrom.a, rawTo.a);

  vec2 cellTexUv = vec2(cellUv.x, 1.0 - cellUv.y);

  if (aura > 0.002) {
    // Bloom follows the edges the characters land on, not raw brightness.
    // Gating on absolute contrast would light up every filled region, so a
    // photo or a dark panel would bloom as one solid block. Comparing a sharp
    // sample against a broad one leaves only text, icons and real detail.
    vec2 spread = vec2(cellPx) / max(uResolution, vec2(1.0));
    float edge = 0.0;
    for (int i = 0; i < 5; i++) {
      vec2 tap = vec2(
        float(i == 1) - float(i == 2),
        float(i == 3) - float(i == 4)) * spread;
      vec4 sFrom = textureLod(uFrom, texUv + tap, uLod);
      vec4 sTo = textureLod(uTo, texUv + tap, uLod);
      vec4 bFrom = textureLod(uFrom, texUv + tap, uLod + 2.5);
      vec4 bTo = textureLod(uTo, texUv + tap, uLod + 2.5);
      vec3 sharpRgb = mix(
        mix(uBg, sFrom.rgb, sFrom.a), mix(uBg, sTo.rgb, sTo.a), swap);
      vec3 broadRgb = mix(
        mix(uBg, bFrom.rgb, bFrom.a), mix(uBg, bTo.rgb, bTo.a), swap);
      edge += abs(
        dot(sharpRgb, vec3(0.299, 0.587, 0.114)) -
        dot(broadRgb, vec3(0.299, 0.587, 0.114)));
    }
    edge = clamp(edge / (5.0 * 0.16), 0.0, 1.0);
    float haze = edge * aura * clamp(uGlow, 0.0, 2.0) * 0.5;
    base += uInk * haze * (0.55 + 0.85 * uAdditive);
    alpha = max(alpha, haze * 0.8);
  }

  if (ascii > 0.002) {
    vec4 cellFrom = panel(uFrom, cellTexUv, uLod, fringe);
    vec4 cellTo = panel(uTo, cellTexUv, uLod, fringe);
    vec3 cellRgb = mix(
      mix(uBg, cellFrom.rgb, cellFrom.a),
      mix(uBg, cellTo.rgb, cellTo.a),
      swap);

    float lum = dot(cellRgb, vec3(0.299, 0.587, 0.114));
    float ink = abs(lum - uBgLum);
    float present = S(uThreshold * 0.5, uThreshold + 0.02, ink);

    // Characters trace detail, not brightness. A broad average of the same
    // spot tells us whether this cell sits on an edge (text, icons, the fine
    // structure of a photo) or inside a flat region. Without this every cell
    // over a photo or a filled panel passes the ink test at once and the band
    // floods into a solid block of characters instead of following content.
    vec4 broadFrom = textureLod(uFrom, cellTexUv, uLod + 2.5);
    vec4 broadTo = textureLod(uTo, cellTexUv, uLod + 2.5);
    vec3 broadRgb = mix(
      mix(uBg, broadFrom.rgb, broadFrom.a),
      mix(uBg, broadTo.rgb, broadTo.a),
      swap);
    float detail = abs(lum - dot(broadRgb, vec3(0.299, 0.587, 0.114)));
    present *= mix(0.5, 1.0, S(0.01, uThreshold + 0.06, detail));

    present *= step(hash21(cell + 11.3), clamp(uDensity, 0.0, 1.0));
    if (uFlicker > 0.001) {
      float roll = hash31(vec3(cell, floor(uTime * 18.0)));
      present *= 1.0 - clamp(uFlicker, 0.0, 1.0) * step(roll, 0.4);
    }

    // A cell averaged over a glyph rarely exceeds a third of full contrast, so
    // normalize into that range before picking a character. Without this every
    // cell lands on the blank end of the ramp.
    float t = clamp(ink / 0.35, 0.0, 1.0);
    float amount = clamp((t - 0.5) * uContrast + 0.5 + uBrightness, 0.0, 1.0);
    amount = mix(amount, 1.0 - amount, clamp(uInvert, 0.0, 1.0));

    // Nudge the character choice per cell and per tick. Neighbouring cells then
    // land on different glyphs, which is what makes the band read as churning
    // text rather than as a regular screen of identical marks.
    float churn = hash31(vec3(cell, floor(uTime * 15.0))) - 0.5;
    float picked = clamp(amount + churn * 0.25, 0.0, 1.0);
    int index = min(int(picked * float(uGlyphCount)), uGlyphCount - 1);

    ivec2 local = ivec2(floor((frag - cell * cellPx) / max(uGlyphPx, 0.001)));
    int pad = int(uSpacing);
    float on = glyphBit(index, ivec2(local.x - pad, local.y - pad));

    // Push the sampled color away from the background so faint text still
    // reads as ink rather than fading into the page.
    vec3 contentInk = clamp(uBg + (cellRgb - uBg) / max(ink, 0.2), 0.0, 1.0);
    vec3 glyphColor = mix(contentInk, uInk, clamp(uTint, 0.0, 1.0));
    // Characters sit at their own brightness, so the band has depth instead of
    // every mark burning at one level.
    float level = 0.72 + 0.28 * hash21(cell * 0.91 + 7.7);
    glyphColor *= level;
    // The brightest characters burn toward white, like a hot phosphor core.
    glyphColor = mix(glyphColor, vec3(1.0),
      amount * amount * level * 0.55 * uAdditive);

    float strength = ascii * present;
    float lit = on * strength;

    // Dim from the continuous band envelope rather than the per-cell mask, so
    // the paper behind the characters darkens smoothly instead of in squares.
    base = mix(base, uBg, clamp(uFade, 0.0, 1.0) * ascii * (1.0 - on));
    base = mix(mix(base, glyphColor, lit), base + glyphColor * lit, uAdditive);
    alpha = max(alpha, lit);
  }

  base = clamp(base, 0.0, 1.0);
  alpha = clamp(alpha, 0.0, 1.0) * uActive;
  outColor = vec4(base * alpha, alpha);
}`;

export function supportsHtmlInCanvas(): boolean {
  if (typeof document === "undefined") return false;
  const probe = document.createElement("canvas") as PaintableCanvas;
  const ctx = probe.getContext("2d") as ElementImageContext | null;
  return Boolean(
    ctx &&
    typeof ctx.drawElementImage === "function" &&
    typeof probe.requestPaint === "function",
  );
}

interface FallbackRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface FallbackPaintState {
  style: CSSStyleDeclaration;
  visible: boolean;
  opacity: number;
  clip: FallbackRect;
  childrenClip: FallbackRect;
}

function intersectFallbackRects(
  first: FallbackRect,
  second: FallbackRect,
): FallbackRect {
  return {
    left: Math.max(first.left, second.left),
    top: Math.max(first.top, second.top),
    right: Math.min(first.right, second.right),
    bottom: Math.min(first.bottom, second.bottom),
  };
}

function paintFallbackSnapshot(
  content: HTMLElement,
  canvas: HTMLCanvasElement,
) {
  const rootRect = content.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.max(1, Math.round(rootRect.width * dpr));
  const height = Math.max(1, Math.round(rootRect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas is unavailable");
  ctx.resetTransform();
  ctx.clearRect(0, 0, width, height);
  ctx.scale(dpr, dpr);

  const rootClip: FallbackRect = {
    left: rootRect.left,
    top: rootRect.top,
    right: rootRect.right,
    bottom: rootRect.bottom,
  };
  const states = new WeakMap<Element, FallbackPaintState>();

  function resolveState(element: Element): FallbackPaintState {
    const cached = states.get(element);
    if (cached) return cached;

    const parent = element.parentElement;
    const parentState =
      parent && content.contains(parent) ? resolveState(parent) : null;
    const style = getComputedStyle(element);
    const ownOpacity = Number.parseFloat(style.opacity);
    const opacity =
      (parentState?.opacity ?? 1) *
      (Number.isFinite(ownOpacity) ? ownOpacity : 1);
    const visible =
      (parentState?.visible ?? true) &&
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.visibility !== "collapse" &&
      opacity > 0;
    const clip = parentState?.childrenClip ?? rootClip;
    const rect = element.getBoundingClientRect();
    const childrenClip = { ...clip };
    if (style.overflowX !== "visible") {
      childrenClip.left = Math.max(childrenClip.left, rect.left);
      childrenClip.right = Math.min(childrenClip.right, rect.right);
    }
    if (style.overflowY !== "visible") {
      childrenClip.top = Math.max(childrenClip.top, rect.top);
      childrenClip.bottom = Math.min(childrenClip.bottom, rect.bottom);
    }

    const state = { style, visible, opacity, clip, childrenClip };
    states.set(element, state);
    return state;
  }

  const walker = document.createTreeWalker(content, NodeFilter.SHOW_ELEMENT);
  let current: Node | null = walker.currentNode;
  while (current) {
    const element = current as HTMLElement;
    const rect = element.getBoundingClientRect();
    const state = resolveState(element);
    const visibleRect = intersectFallbackRects(rect, state.clip);
    if (
      state.visible &&
      visibleRect.right > visibleRect.left &&
      visibleRect.bottom > visibleRect.top
    ) {
      const { style } = state;
      ctx.save();
      ctx.beginPath();
      ctx.rect(
        state.clip.left - rootRect.left,
        state.clip.top - rootRect.top,
        state.clip.right - state.clip.left,
        state.clip.bottom - state.clip.top,
      );
      ctx.clip();
      ctx.globalAlpha = state.opacity;
      const x = rect.left - rootRect.left;
      const y = rect.top - rootRect.top;

      if (style.backgroundColor !== "transparent") {
        ctx.fillStyle = style.backgroundColor;
        ctx.fillRect(x, y, rect.width, rect.height);
      }

      paintFallbackMedia(ctx, element, style, rect, rootRect);
      paintFallbackText(ctx, element, style, rootRect);
      paintFallbackBorders(ctx, style, rect, rootRect);
      ctx.restore();
    }
    current = walker.nextNode();
  }
  ctx.globalAlpha = 1;
}

function paintFallbackMedia(
  ctx: CanvasRenderingContext2D,
  element: HTMLElement,
  style: CSSStyleDeclaration,
  rect: DOMRect,
  rootRect: DOMRect,
) {
  const drawable =
    element instanceof HTMLImageElement
      ? element.complete && element.naturalWidth > 0
        ? element
        : null
      : element instanceof HTMLCanvasElement
        ? element
        : element instanceof HTMLVideoElement && element.readyState >= 2
          ? element
          : null;
  if (!drawable) return;
  if (!isFallbackMediaOriginClean(drawable)) return;

  const sourceWidth =
    drawable instanceof HTMLImageElement
      ? drawable.naturalWidth
      : drawable instanceof HTMLVideoElement
        ? drawable.videoWidth
        : drawable.width;
  const sourceHeight =
    drawable instanceof HTMLImageElement
      ? drawable.naturalHeight
      : drawable instanceof HTMLVideoElement
        ? drawable.videoHeight
        : drawable.height;
  if (!(sourceWidth > 0 && sourceHeight > 0)) return;

  let sourceX = 0;
  let sourceY = 0;
  let cropWidth = sourceWidth;
  let cropHeight = sourceHeight;
  let targetX = rect.left - rootRect.left;
  let targetY = rect.top - rootRect.top;
  let targetWidth = rect.width;
  let targetHeight = rect.height;
  const [positionX, positionY] = resolveObjectPosition(style.objectPosition);
  if (style.objectFit === "cover") {
    const scale = Math.max(
      rect.width / sourceWidth,
      rect.height / sourceHeight,
    );
    cropWidth = rect.width / scale;
    cropHeight = rect.height / scale;
    sourceX = (sourceWidth - cropWidth) * positionX;
    sourceY = (sourceHeight - cropHeight) * positionY;
  } else if (
    style.objectFit === "contain" ||
    style.objectFit === "scale-down"
  ) {
    const containScale = Math.min(
      rect.width / sourceWidth,
      rect.height / sourceHeight,
      style.objectFit === "scale-down" ? 1 : Number.POSITIVE_INFINITY,
    );
    targetWidth = sourceWidth * containScale;
    targetHeight = sourceHeight * containScale;
    targetX += (rect.width - targetWidth) * positionX;
    targetY += (rect.height - targetHeight) * positionY;
  }

  try {
    ctx.drawImage(
      drawable,
      sourceX,
      sourceY,
      cropWidth,
      cropHeight,
      targetX,
      targetY,
      targetWidth,
      targetHeight,
    );
  } catch {}
}

function isFallbackMediaOriginClean(
  drawable: HTMLImageElement | HTMLCanvasElement | HTMLVideoElement,
): boolean {
  const probe = document.createElement("canvas");
  probe.width = probe.height = 1;
  const ctx = probe.getContext("2d", { willReadFrequently: true });
  if (!ctx) return false;
  try {
    ctx.drawImage(drawable, 0, 0, 1, 1);
    ctx.getImageData(0, 0, 1, 1);
    return true;
  } catch {
    return false;
  }
}

function resolveObjectPosition(position: string): [number, number] {
  const [x = "50%", y = "50%"] = position.split(/\s+/);
  return [
    resolvePositionValue(x, "left", "right"),
    resolvePositionValue(y, "top", "bottom"),
  ];
}

function resolvePositionValue(
  value: string,
  start: string,
  end: string,
): number {
  if (value === start) return 0;
  if (value === end) return 1;
  if (value === "center") return 0.5;
  if (value.endsWith("%")) {
    return Math.min(1, Math.max(0, Number.parseFloat(value) / 100));
  }
  return 0.5;
}

function paintFallbackText(
  ctx: CanvasRenderingContext2D,
  element: HTMLElement,
  style: CSSStyleDeclaration,
  rootRect: DOMRect,
) {
  const textNodes = Array.from(element.childNodes).filter(
    (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
  );
  if (textNodes.length === 0) return;

  ctx.fillStyle = style.color;
  ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
  ctx.textBaseline = "alphabetic";
  if ("letterSpacing" in ctx) {
    ctx.letterSpacing =
      style.letterSpacing === "normal" ? "0px" : style.letterSpacing;
  }
  const textAlign: CanvasTextAlign =
    style.textAlign === "center" ||
    style.textAlign === "right" ||
    style.textAlign === "start" ||
    style.textAlign === "end"
      ? style.textAlign
      : "left";
  const direction: CanvasDirection = style.direction === "rtl" ? "rtl" : "ltr";
  ctx.textAlign = textAlign;
  ctx.direction = direction;

  const whiteSpace = style.whiteSpace;
  const preservesNewlines =
    whiteSpace === "pre" ||
    whiteSpace === "pre-wrap" ||
    whiteSpace === "pre-line" ||
    whiteSpace === "break-spaces";
  const preservesSpaces = preservesNewlines && whiteSpace !== "pre-line";

  const anchor =
    textAlign === "center"
      ? 0.5
      : textAlign === "right" ||
          (textAlign === "end" && direction === "ltr") ||
          (textAlign === "start" && direction === "rtl")
        ? 1
        : 0;

  function transform(text: string): string {
    if (style.textTransform === "uppercase") return text.toUpperCase();
    if (style.textTransform === "lowercase") return text.toLowerCase();
    return text;
  }

  function drawAcrossRects(text: string, rects: DOMRect[]) {
    const visible = rects.filter(
      (rect) =>
        rect.right > rootRect.left &&
        rect.left < rootRect.right &&
        rect.bottom > rootRect.top &&
        rect.top < rootRect.bottom,
    );
    if (visible.length === 0) return;
    const totalWidth = visible.reduce((sum, rect) => sum + rect.width, 0);
    let offset = 0;
    for (let index = 0; index < visible.length; index++) {
      const rect = visible[index];
      const remaining = text.length - offset;
      if (remaining <= 0) break;
      const count =
        index === visible.length - 1
          ? remaining
          : Math.min(
              remaining,
              Math.max(1, Math.round((text.length * rect.width) / totalWidth)),
            );
      const slice = text.slice(offset, offset + count);
      offset += count;
      const line = preservesSpaces ? slice : slice.trim();
      if (!line.trim()) continue;
      const x = rect.left - rootRect.left + rect.width * anchor;
      const metrics = ctx.measureText(line);
      const ascent = metrics.fontBoundingBoxAscent ?? 0;
      const descent = metrics.fontBoundingBoxDescent ?? 0;
      const y =
        ascent > 0
          ? rect.top -
            rootRect.top +
            (rect.height - ascent - descent) / 2 +
            ascent
          : rect.bottom - rootRect.top - rect.height * 0.2;
      ctx.fillText(line, x, y, Math.max(rect.width, 1));
    }
  }

  for (const node of textNodes) {
    const raw = node.textContent ?? "";
    const range = document.createRange();

    if (preservesNewlines) {
      let position = 0;
      for (const part of raw.split("\n")) {
        const start = position;
        position += part.length + 1;
        if (!part.trim()) continue;
        range.setStart(node, start);
        range.setEnd(node, start + part.length);
        const text = transform(
          preservesSpaces ? part : part.replace(/\s+/g, " ").trim(),
        );
        drawAcrossRects(text, Array.from(range.getClientRects()));
      }
      continue;
    }

    const text = transform(raw.replace(/\s+/g, " ").trim());
    if (!text) continue;
    range.selectNodeContents(node);
    drawAcrossRects(text, Array.from(range.getClientRects()));
  }
}

function paintFallbackBorders(
  ctx: CanvasRenderingContext2D,
  style: CSSStyleDeclaration,
  rect: DOMRect,
  rootRect: DOMRect,
) {
  const x = rect.left - rootRect.left;
  const y = rect.top - rootRect.top;
  const top = Number.parseFloat(style.borderTopWidth);
  const right = Number.parseFloat(style.borderRightWidth);
  const bottom = Number.parseFloat(style.borderBottomWidth);
  const left = Number.parseFloat(style.borderLeftWidth);
  if (top > 0) {
    ctx.fillStyle = style.borderTopColor;
    ctx.fillRect(x, y, rect.width, top);
  }
  if (right > 0) {
    ctx.fillStyle = style.borderRightColor;
    ctx.fillRect(x + rect.width - right, y, right, rect.height);
  }
  if (bottom > 0) {
    ctx.fillStyle = style.borderBottomColor;
    ctx.fillRect(x, y + rect.height - bottom, rect.width, bottom);
  }
  if (left > 0) {
    ctx.fillStyle = style.borderLeftColor;
    ctx.fillRect(x, y, left, rect.height);
  }
}

export function createAsciiSweep(
  elements: AsciiSweepElements,
  options: AsciiSweepOptions = {},
): AsciiSweepInstance | null {
  try {
    return initializeAsciiSweep(elements, options);
  } catch (error) {
    console.error("AsciiSweep initialization failed:", error);
    return null;
  }
}

interface SlotState {
  source: HTMLCanvasElement;
  content: HTMLElement;
  ctx: ElementImageContext | null;
  paintable: PaintableCanvas;
  texture: WebGLTexture;
  fallbackCanvas: HTMLCanvasElement | null;
  dirty: boolean;
  /** Timestamp of the most recent capture that reached the texture. */
  stamp: number;
  captureTimer: number;
  captureDeadline: number;
  scrollTimer: number;
  capturedScrollLeft: number;
  capturedScrollTop: number;
  captureErrorLogged: boolean;
  uploadErrorLogged: boolean;
}

function initializeAsciiSweep(
  elements: AsciiSweepElements,
  options: AsciiSweepOptions,
): AsciiSweepInstance | null {
  const config = { ...DEFAULTS, ...options };
  const { slots, output } = elements;
  if (!slots || slots.length !== 2) {
    throw new Error("AsciiSweep needs exactly two slots");
  }

  const gl = output.getContext("webgl2", {
    alpha: true,
    depth: false,
    stencil: false,
    antialias: false,
    premultipliedAlpha: true,
  });
  if (!gl || gl.isContextLost()) return null;

  const probeCtx = (() => {
    const probe = document.createElement("canvas");
    probe.width = probe.height = 1;
    return probe.getContext("2d", { willReadFrequently: true });
  })();

  function parseColor(value: string): [number, number, number] | null {
    if (!probeCtx || !value) return null;
    probeCtx.clearRect(0, 0, 1, 1);
    probeCtx.fillStyle = "#000";
    probeCtx.fillStyle = value;
    const resolved = probeCtx.fillStyle;
    probeCtx.clearRect(0, 0, 1, 1);
    probeCtx.fillStyle = resolved;
    probeCtx.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = probeCtx.getImageData(0, 0, 1, 1).data;
    if (a === 0) return null;
    return [r / 255, g / 255, b / 255];
  }

  let destroyed = false;
  let wake = () => {};

  function compile(type: number, text: string): WebGLShader {
    const shader = gl!.createShader(type)!;
    gl!.shaderSource(shader, text);
    gl!.compileShader(shader);
    if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) {
      const message = gl!.getShaderInfoLog(shader) || "Unknown shader error";
      gl!.deleteShader(shader);
      throw new Error(message);
    }
    return shader;
  }

  const vertexShader = compile(gl.VERTEX_SHADER, VERT);
  const fragmentShader = compile(gl.FRAGMENT_SHADER, FRAG);
  const program = gl.createProgram()!;
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message =
      gl.getProgramInfoLog(program) || "Unknown program link error";
    gl.deleteProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    throw new Error(message);
  }

  const uniforms: Record<string, WebGLUniformLocation> = {};
  const uniformCount = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < uniformCount; i++) {
    const info = gl.getActiveUniform(program, i)!;
    uniforms[info.name] = gl.getUniformLocation(program, info.name)!;
  }

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  function createSlotTexture(): WebGLTexture {
    const texture = gl!.createTexture()!;
    gl!.bindTexture(gl!.TEXTURE_2D, texture);
    gl!.texParameteri(
      gl!.TEXTURE_2D,
      gl!.TEXTURE_MIN_FILTER,
      gl!.LINEAR_MIPMAP_LINEAR,
    );
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, gl!.LINEAR);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
    gl!.texImage2D(
      gl!.TEXTURE_2D,
      0,
      gl!.RGBA,
      1,
      1,
      0,
      gl!.RGBA,
      gl!.UNSIGNED_BYTE,
      new Uint8Array([0, 0, 0, 0]),
    );
    return texture;
  }

  const firstCtx = slots[0].source.getContext(
    "2d",
  ) as ElementImageContext | null;
  const htmlInCanvas = Boolean(
    firstCtx &&
    typeof firstCtx.drawElementImage === "function" &&
    typeof (slots[0].source as PaintableCanvas).requestPaint === "function",
  );

  const states: SlotState[] = slots.map((slot, index) => ({
    source: slot.source,
    content: slot.content,
    ctx:
      index === 0
        ? firstCtx
        : (slot.source.getContext("2d") as ElementImageContext | null),
    paintable: slot.source as PaintableCanvas,
    texture: createSlotTexture(),
    fallbackCanvas: null,
    dirty: false,
    stamp: 0,
    captureTimer: 0,
    captureDeadline: 0,
    scrollTimer: 0,
    capturedScrollLeft: 0,
    capturedScrollTop: 0,
    captureErrorLogged: false,
    uploadErrorLogged: false,
  }));

  if (htmlInCanvas) {
    for (const state of states) {
      state.paintable.onpaint = () => {
        try {
          state.ctx!.reset();
          state.ctx!.drawElementImage!(state.content, 0, 0);
          state.dirty = true;
          wake();
        } catch {}
      };
    }
  }

  function queueCapture(state: SlotState, immediate = false) {
    if (htmlInCanvas || destroyed) return;
    const delay = immediate ? 0 : FALLBACK_CAPTURE_DELAY;
    const deadline = performance.now() + delay;
    if (state.captureTimer && state.captureDeadline <= deadline) return;
    window.clearTimeout(state.captureTimer);
    state.captureDeadline = deadline;
    state.captureTimer = window.setTimeout(
      () => captureFallback(state),
      delay,
    );
  }

  function captureFallback(state: SlotState) {
    window.clearTimeout(state.captureTimer);
    window.clearTimeout(state.scrollTimer);
    state.captureTimer = 0;
    state.scrollTimer = 0;
    try {
      paintFallbackSnapshot(state.content, state.source);
      if (destroyed) return;
      state.fallbackCanvas = state.source;
      state.capturedScrollLeft = state.content.scrollLeft;
      state.capturedScrollTop = state.content.scrollTop;
      state.dirty = true;
      state.captureErrorLogged = false;
      wake();
    } catch (error) {
      if (!destroyed && !state.captureErrorLogged) {
        state.captureErrorLogged = true;
        console.warn("AsciiSweep could not capture its HTML fallback:", error);
      }
    }
  }

  function requestCapture(immediate = false) {
    for (const state of states) {
      if (htmlInCanvas) state.paintable.requestPaint?.();
      else queueCapture(state, immediate);
    }
  }

  /**
   * Both panels stay visible and captured at all times, because a panel that
   * is hidden when the browser repaints captures as an empty texture, and
   * sweeping back to it would then reveal nothing. Instead the panel on show
   * is stacked on top and painted opaque, so it occludes the other one while
   * the effect is at rest and the real DOM stays live and selectable.
   */
  function applyStacking(shown: 0 | 1) {
    states.forEach((state, index) => {
      const front = index === shown;
      // The stacking layer is the source canvas under html-in-canvas, because
      // the two canvases are the siblings that overlap. In the DOM fallback the
      // content element is itself the layer.
      const layer = htmlInCanvas ? state.source : state.content;
      // Scrollbars are deliberately left alone. Both panels are the same size
      // and scroll together, so whichever is in front shows a scrollbar in the
      // same place. Toggling it per panel would add and remove a scrollbar
      // mid sweep and reflow the content underneath.
      layer.style.zIndex = front ? "1" : "0";
      layer.style.pointerEvents = front ? "" : "none";
      // The captured element carries the page background so the front panel is
      // opaque and fully occludes the one behind it.
      state.content.style.backgroundColor = backgroundCss;
      // Keep the panel behind out of the tab order and the accessibility tree,
      // so assistive tech never sees both panels at once.
      if (front) layer.removeAttribute("aria-hidden");
      else layer.setAttribute("aria-hidden", "true");
      layer.inert = !front;
    });
  }

  let contentMaxX = 1;

  function syncCanvasSize(): boolean {
    let changed = false;
    // clientWidth excludes the panel's own scrollbar, so this is the fraction
    // of the output the captured content actually covers.
    contentMaxX = Math.min(
      1,
      Math.max(
        0.05,
        states[0].content.clientWidth / Math.max(output.clientWidth, 1),
      ),
    );
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(output.clientWidth * dpr));
    const height = Math.max(1, Math.round(output.clientHeight * dpr));
    if (output.width !== width || output.height !== height) {
      output.width = width;
      output.height = height;
      changed = true;
    }
    if (htmlInCanvas) {
      for (const state of states) {
        const cssWidth = Math.max(1, Math.round(state.source.clientWidth));
        const cssHeight = Math.max(1, Math.round(state.source.clientHeight));
        if (
          state.source.width !== cssWidth * dpr ||
          state.source.height !== cssHeight * dpr
        ) {
          state.source.width = cssWidth * dpr;
          state.source.height = cssHeight * dpr;
          changed = true;
        }
        state.paintable.requestPaint?.();
      }
    }
    return changed;
  }

  syncCanvasSize();

  let backingRgb: [number, number, number] = [1, 1, 1];
  let backingLum = 1;
  let inkRgb: [number, number, number] = [0.29, 0.87, 0.5];
  let backgroundCss = "#ffffff";

  function syncBacking() {
    let resolved: [number, number, number] | null = null;
    let resolvedCss: string | null = null;
    if (config.background && config.background !== "auto") {
      resolved = parseColor(config.background);
      if (resolved) resolvedCss = config.background;
    }
    if (!resolved) {
      let el: Element | null = states[0].content;
      while (el) {
        const bg = getComputedStyle(el).backgroundColor;
        if (bg && bg !== "transparent") {
          const parsed = parseColor(bg);
          if (parsed) {
            resolved = parsed;
            resolvedCss = bg;
            break;
          }
        }
        el = el.parentElement;
      }
    }
    backingRgb = resolved ?? [1, 1, 1];
    backingLum =
      0.299 * backingRgb[0] + 0.587 * backingRgb[1] + 0.114 * backingRgb[2];
    backgroundCss = resolvedCss ?? "#ffffff";
    inkRgb = parseColor(config.color) ?? [0.29, 0.87, 0.5];
  }

  syncBacking();

  const glyphData = new Uint32Array(MAX_GLYPHS);

  function resolveGlyphs(): number {
    const ramp =
      config.glyphs.length > 1
        ? config.glyphs
        : (CHARSETS[config.charset] ?? CHARSETS.ascii);
    const count = Math.min(ramp.length, MAX_GLYPHS);
    glyphData.fill(0);
    for (let i = 0; i < count; i++) glyphData[i] = ramp[i] >>> 0;
    return count;
  }

  function uploadSlot(state: SlotState) {
    const bitmap = htmlInCanvas ? state.source : state.fallbackCanvas;
    if (!bitmap || !state.dirty) return;
    if (bitmap.width < 1 || bitmap.height < 1) return;
    state.dirty = false;
    try {
      gl!.bindTexture(gl!.TEXTURE_2D, state.texture);
      gl!.texImage2D(
        gl!.TEXTURE_2D,
        0,
        gl!.RGBA,
        gl!.RGBA,
        gl!.UNSIGNED_BYTE,
        bitmap,
      );
      gl!.generateMipmap(gl!.TEXTURE_2D);
      state.stamp = performance.now();
      state.uploadErrorLogged = false;
    } catch (error) {
      if (!state.uploadErrorLogged) {
        state.uploadErrorLogged = true;
        console.warn("AsciiSweep could not upload a panel texture:", error);
      }
    }
  }

  let currentSlot: 0 | 1 = 0;
  let fromSlot: 0 | 1 = 0;
  let toSlot: 0 | 1 = 1;
  let progress = 0;
  let sweeping = false;
  let sweepStart = 0;
  let sweepClockSet = false;
  let sweepAngle = config.angle;
  let settleFrames = 0;
  let active = 0;
  let fadingOut = false;

  const controlled = () => config.progress >= 0;

  function render(now: number) {
    for (const state of states) uploadSlot(state);

    const from = states[fromSlot];
    const to = states[toSlot];

    gl!.useProgram(program);
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, from.texture);
    gl!.uniform1i(uniforms.uFrom, 0);
    gl!.activeTexture(gl!.TEXTURE1);
    gl!.bindTexture(gl!.TEXTURE_2D, to.texture);
    gl!.uniform1i(uniforms.uTo, 1);

    gl!.uniform2f(uniforms.uResolution, output.width, output.height);
    gl!.uniform1f(uniforms.uProgress, progress);

    const radians = (sweepAngle * Math.PI) / 180;
    gl!.uniform2f(uniforms.uDir, Math.cos(radians), Math.sin(radians));

    const dpr = output.width / Math.max(output.clientWidth, 1);
    const glyphCss = Math.max(config.scale, 0.5);
    const spacing = Math.round(Math.min(Math.max(config.spacing, 0), 3));
    gl!.uniform1f(uniforms.uGlyphPx, glyphCss * dpr);
    gl!.uniform1f(uniforms.uSpacing, spacing);
    // The content texture is in device pixels, so the LOD that averages a cell
    // has to be derived in device pixels too.
    gl!.uniform1f(
      uniforms.uLod,
      Math.max(0, Math.log2((5 + 2 * spacing) * glyphCss * dpr) - 1),
    );

    const glyphCount = resolveGlyphs();
    gl!.uniform1uiv(uniforms["uGlyphs[0]"], glyphData);
    gl!.uniform1i(uniforms.uGlyphCount, glyphCount);

    gl!.uniform1f(uniforms.uBand, Math.min(Math.max(config.band, 0.02), 1));
    gl!.uniform1f(uniforms.uSoftness, config.softness);
    gl!.uniform1f(uniforms.uTurbulence, Math.max(config.turbulence, 0));
    gl!.uniform1f(uniforms.uTrail, Math.max(config.trail, 0));
    gl!.uniform3f(uniforms.uInk, inkRgb[0], inkRgb[1], inkRgb[2]);
    gl!.uniform1f(uniforms.uTint, config.tint);
    gl!.uniform1f(uniforms.uGlow, config.glow);
    gl!.uniform1f(uniforms.uAberration, Math.max(config.aberration, 0) * dpr);
    gl!.uniform1f(uniforms.uFlicker, config.flicker);
    gl!.uniform1f(uniforms.uDensity, config.density);
    gl!.uniform1f(uniforms.uDisplace, Math.max(config.displace, 0) * dpr);
    gl!.uniform1f(uniforms.uContrast, Math.max(config.contrast, 0));
    gl!.uniform1f(uniforms.uBrightness, config.brightness);
    gl!.uniform1f(uniforms.uInvert, config.invert);
    gl!.uniform1f(uniforms.uThreshold, Math.max(config.threshold, 0.001));
    gl!.uniform1f(uniforms.uFade, config.fade);
    gl!.uniform1f(
      uniforms.uAdditive,
      config.blend === "add"
        ? 1
        : config.blend === "over"
          ? 0
          : backingLum < 0.5
            ? 1
            : 0,
    );
    gl!.uniform3f(uniforms.uBg, backingRgb[0], backingRgb[1], backingRgb[2]);
    gl!.uniform1f(uniforms.uBgLum, backingLum);
    gl!.uniform1f(uniforms.uTime, now / 1000);
    gl!.uniform1f(uniforms.uActive, active);
    gl!.uniform1f(uniforms.uMaxX, contentMaxX);

    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
    gl!.viewport(0, 0, output.width, output.height);
    gl!.clearColor(0, 0, 0, 0);
    gl!.clear(gl!.COLOR_BUFFER_BIT);
    gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
  }

  let raf = 0;
  let running = false;
  let lastFrame = performance.now();
  let visible = true;
  let pageVisible =
    typeof document === "undefined" || document.visibilityState !== "hidden";

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reducedMotion = motionQuery.matches;

  function ease(t: number): number {
    // Ease out. Velocity is highest at the very start, so the band reacts the
    // instant the panel changes instead of easing in from a standstill.
    const c = 1 - Math.min(Math.max(t, 0), 1);
    return 1 - c * c * c;
  }

  /** Exact inverse of ease(), used to re-anchor the clock mid sweep. */
  function easeInverse(p: number): number {
    return 1 - Math.cbrt(1 - Math.min(Math.max(p, 0), 1));
  }

  function frame(now: number) {
    if (destroyed) return;
    if (!visible || !pageVisible) {
      running = false;
      return;
    }

    if (controlled()) {
      progress = Math.min(Math.max(config.progress, 0), 1);
      fromSlot = 0;
      toSlot = 1;
      const shown: 0 | 1 = progress >= 0.5 ? 1 : 0;
      if (shown !== currentSlot) {
        currentSlot = shown;
        applyStacking(currentSlot);
      }
      active = 1;
      render(now);
      running = false;
      return;
    }

    if (sweeping) {
      // Start timing from the first frame that actually renders. The first
      // sweep pays for the initial panel paints, texture uploads and mipmap
      // builds, and starting the clock at the click would spend that setup
      // time out of the animation, leaving the band parked at the edge.
      if (!sweepClockSet) {
        sweepClockSet = true;
        sweepStart = now;
      }
      const duration = Math.max(config.duration, 0.05);
      const linear = reducedMotion
        ? 1
        : Math.min(1, (now - sweepStart) / 1000 / duration);
      progress = ease(linear);
      if (linear >= 1) {
        progress = 1;
        sweeping = false;
        // Hold the effect for a couple of frames after it lands so the panel
        // underneath is fully painted before the canvas goes transparent.
        settleFrames = 2;
        config.onSweepEnd?.(currentSlot);
      }
    }

    if (fadingOut) {
      // Ease the whole effect out rather than switching it off, so any glow
      // still lingering at the end of the travel dissolves instead of popping.
      const step = reducedMotion ? 1 : (now - lastFrame) / 1000 / FADE_OUT_S;
      active = Math.max(0, active - Math.max(step, 0));
      if (active <= 0.001) {
        active = 0;
        fadingOut = false;
      }
    }
    lastFrame = now;

    render(now);

    if (!sweeping && !fadingOut) {
      if (settleFrames > 0) {
        settleFrames -= 1;
        if (settleFrames === 0) fadingOut = true;
      } else if (active === 0) {
        running = false;
        return;
      }
    }

    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (destroyed || running || !visible || !pageVisible) return;
    running = true;
    lastFrame = performance.now();
    raf = requestAnimationFrame(frame);
  }

  wake = start;
  applyStacking(currentSlot);
  requestCapture(true);
  start();

  function sweep(to: 0 | 1, sweepOptions?: { angle?: number }) {
    if (destroyed || controlled()) return;
    const target: 0 | 1 = to === 1 ? 1 : 0;
    // Already resting on this panel, or already on the way to it.
    if (sweeping ? target === toSlot : target === currentSlot) return;

    if (sweeping) {
      // Interrupting a sweep in flight. Run the band backwards from wherever
      // it currently is instead of restarting it at the edge, which would make
      // it jump across the panel. Mirroring the progress and the direction
      // together keeps the band in the same place on screen, and the swap it
      // has already made is hidden under the characters as it passes back.
      progress = 1 - progress;
      const previousFrom = fromSlot;
      fromSlot = toSlot;
      toSlot = previousFrom;
      // Wrapped, so a long run of reversals cannot drift the angle.
      sweepAngle = (sweepAngle + 180) % 360;
      // Anchor the clock to the progress being resumed so the band keeps its
      // speed. The remaining travel then takes exactly as long as it should:
      // an immediate change of mind snaps back, a late one has further to go.
      sweepStart =
        performance.now() -
        easeInverse(progress) * Math.max(config.duration, 0.05) * 1000;
      sweepClockSet = true;
    } else {
      fromSlot = currentSlot;
      toSlot = target;
      progress = 0;
      sweepAngle = sweepOptions?.angle ?? config.angle;
      // Anchor on the first rendered frame instead, so the one-off cost of the
      // first paint and texture upload is not deducted from the animation.
      sweepClockSet = false;
    }

    currentSlot = target;
    sweeping = true;
    settleFrames = 0;
    fadingOut = false;
    active = 1;
    // Raise the destination panel now. Both panels are always captured, so the
    // textures for either side of the sweep are already valid.
    applyStacking(currentSlot);
    requestCapture(true);
    config.onSweepStart?.(target);
    start();
  }

  function onMotionChange() {
    reducedMotion = motionQuery.matches;
    start();
  }
  motionQuery.addEventListener("change", onMotionChange);

  let themeTimer = 0;
  function onThemeShift() {
    syncBacking();
    start();
    window.clearTimeout(themeTimer);
    themeTimer = window.setTimeout(() => {
      syncBacking();
      requestCapture();
      start();
    }, 300);
  }

  const themeObserver = new MutationObserver(onThemeShift);
  themeObserver.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "style", "data-theme"],
  });
  const schemeQuery = window.matchMedia("(prefers-color-scheme: dark)");
  schemeQuery.addEventListener("change", onThemeShift);

  const resizeObserver = new ResizeObserver(() => {
    if (syncCanvasSize()) requestCapture();
    start();
  });
  resizeObserver.observe(output);
  for (const state of states) resizeObserver.observe(state.content);

  const intersection = new IntersectionObserver((entries) => {
    visible = entries[entries.length - 1]?.isIntersecting ?? true;
    if (visible) start();
  });
  intersection.observe(output);

  // Keep both panels at the same scroll offset. The panel behind is inert, so
  // it never scrolls on its own, and a sweep would otherwise reveal the
  // incoming content at the top while the outgoing one sits further down.
  let syncingScroll = false;
  function onPanelScroll(event: Event) {
    if (syncingScroll || destroyed) return;
    const source = event.target as HTMLElement | null;
    if (!source) return;
    syncingScroll = true;
    for (const state of states) {
      if (state.content === source) continue;
      if (state.content.scrollTop !== source.scrollTop) {
        state.content.scrollTop = source.scrollTop;
      }
      if (state.content.scrollLeft !== source.scrollLeft) {
        state.content.scrollLeft = source.scrollLeft;
      }
    }
    syncingScroll = false;
    requestCapture();
    start();
  }
  for (const state of states) {
    state.content.addEventListener("scroll", onPanelScroll, { passive: true });
  }

  function onPageVisibility() {
    pageVisible = document.visibilityState !== "hidden";
    if (pageVisible) start();
  }
  document.addEventListener("visibilitychange", onPageVisibility);

  const contentObservers = htmlInCanvas
    ? []
    : states.map((state) => {
        const observer = new MutationObserver(() => queueCapture(state));
        observer.observe(state.content, {
          attributes: true,
          attributeFilter: ["class", "hidden", "src", "srcset", "style"],
          characterData: true,
          childList: true,
          subtree: true,
        });
        return observer;
      });

  function onFallbackVisualChange() {
    for (const state of states) queueCapture(state);
  }

  if (!htmlInCanvas) {
    for (const state of states) {
      state.content.addEventListener("load", onFallbackVisualChange, true);
      state.content.addEventListener(
        "loadeddata",
        onFallbackVisualChange,
        true,
      );
      state.content.addEventListener("input", onFallbackVisualChange, true);
      state.content.addEventListener("change", onFallbackVisualChange, true);
      state.content.addEventListener(
        "transitionend",
        onFallbackVisualChange,
        true,
      );
      state.content.addEventListener(
        "animationend",
        onFallbackVisualChange,
        true,
      );
    }
    document.fonts?.addEventListener("loadingdone", onFallbackVisualChange);
  }

  return {
    setOptions(next) {
      let changed = false;
      for (const [key, value] of Object.entries(next)) {
        if (typeof value === "function") continue;
        const prev = config[key as keyof typeof config];
        if (Array.isArray(value) && Array.isArray(prev)) {
          if (
            value.length !== prev.length ||
            value.some((item, i) => item !== prev[i])
          ) {
            changed = true;
            break;
          }
        } else if (prev !== value) {
          changed = true;
          break;
        }
      }
      Object.assign(config, next);
      if (!changed) return;
      syncBacking();
      start();
    },
    sweep,
    current: () => currentSlot,
    capture: () => {
      requestCapture(true);
      start();
    },
    resize() {
      syncCanvasSize();
      syncBacking();
      requestCapture();
      start();
    },
    destroy() {
      destroyed = true;
      cancelAnimationFrame(raf);
      window.clearTimeout(themeTimer);
      resizeObserver.disconnect();
      intersection.disconnect();
      themeObserver.disconnect();
      for (const observer of contentObservers) observer.disconnect();
      schemeQuery.removeEventListener("change", onThemeShift);
      motionQuery.removeEventListener("change", onMotionChange);
      document.removeEventListener("visibilitychange", onPageVisibility);
      if (!htmlInCanvas) {
        for (const state of states) {
          state.content.removeEventListener("load", onFallbackVisualChange, true);
          state.content.removeEventListener(
            "loadeddata",
            onFallbackVisualChange,
            true,
          );
          state.content.removeEventListener(
            "input",
            onFallbackVisualChange,
            true,
          );
          state.content.removeEventListener(
            "change",
            onFallbackVisualChange,
            true,
          );
          state.content.removeEventListener(
            "transitionend",
            onFallbackVisualChange,
            true,
          );
          state.content.removeEventListener(
            "animationend",
            onFallbackVisualChange,
            true,
          );
        }
        document.fonts?.removeEventListener(
          "loadingdone",
          onFallbackVisualChange,
        );
      }
      for (const state of states) {
        state.content.removeEventListener("scroll", onPanelScroll);
        window.clearTimeout(state.captureTimer);
        window.clearTimeout(state.scrollTimer);
        gl!.deleteTexture(state.texture);
        if (htmlInCanvas) state.paintable.onpaint = null;
      }
      gl!.deleteProgram(program);
      gl!.deleteShader(vertexShader);
      gl!.deleteShader(fragmentShader);
      gl!.deleteBuffer(quad);
    },
  };
}
