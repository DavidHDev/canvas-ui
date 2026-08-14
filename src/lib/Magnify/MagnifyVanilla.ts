import { createRectCache } from "../rect-cache";

export type ZoomModifier = "shift" | "alt" | "ctrl" | "meta" | "none";

export interface MagnifyOptions {
  /** Lens radius in CSS pixels. */
  size?: number;
  /** Magnification inside the lens (1 to 4). */
  zoom?: number;
  /** Let the wheel or trackpad adjust the magnification while zoomModifier is held. */
  scrollZoom?: boolean;
  /** Key held to zoom instead of scroll. "none" captures every wheel event over the content. */
  zoomModifier?: ZoomModifier;
  /** HUD accent color as RGB in the 0 to 1 range. Tints the reticle, readout, and ripple outline. */
  color?: [number, number, number];
  /** How quickly the lens follows the cursor (0 to 1). 1 snaps to it. */
  follow?: number;
  /** Overall HUD intensity (0 to 1). 0 hides every reticle element. */
  hud?: number;
  /** Show the outer ring. */
  ring?: boolean;
  /** Show the crosshair lines through the center. */
  crosshair?: boolean;
  /** Show the tick marks around the ring. */
  ticks?: boolean;
  /** Show the corner brackets inside the lens. */
  brackets?: boolean;
  /** Show the center dot. */
  dot?: boolean;
  /** Show a faint measurement grid inside the lens. */
  grid?: boolean;
  /** Show the data readout beside the lens. */
  readout?: boolean;
  /** Chromatic aberration split inside the lens (0 to 3). 0 disables it. */
  aberration?: number;
  /** Dreamy insight haze inside the lens (0 to 1). Softens and lifts the magnified content. */
  haze?: number;
  /** Emit a ripple across the page on click. */
  ripples?: boolean;
  /** How fast the ripple wavefront travels, in CSS pixels per second. */
  rippleSpeed?: number;
  /** Thickness of the colored ripple outline in CSS pixels. */
  rippleWidth?: number;
  /** Width of the band the ripple bends, in CSS pixels. */
  rippleBendWidth?: number;
  /** How many CSS pixels the ripple bends the page. */
  rippleBend?: number;
  /** Strength of the colored ripple outline (0 to 2). 0 hides it. */
  rippleGlow?: number;
  /** Seconds a ripple lives before it fades out. */
  rippleLife?: number;
}

export interface MagnifyElements {
  /** Canvas with layoutsubtree that hosts the HTML content. */
  source: HTMLCanvasElement;
  /** The element inside the source canvas that gets captured. */
  content: HTMLElement;
  /** Canvas the WebGL effect renders to. */
  output: HTMLCanvasElement;
}

export interface MagnifyInstance {
  /** Update effect options live. */
  setOptions: (options: MagnifyOptions) => void;
  /** Re-read canvas size. Call when the element is resized. */
  resize: () => void;
  /** Stop the loop and release all GPU resources. */
  destroy: () => void;
}

const DEFAULTS: Required<MagnifyOptions> = {
  size: 140,
  zoom: 1.5,
  scrollZoom: false,
  zoomModifier: "shift",
  color: [0.8, 0.8, 0.8],
  follow: 0.25,
  hud: 0.8,
  ring: true,
  crosshair: true,
  ticks: true,
  brackets: true,
  dot: true,
  grid: false,
  readout: true,
  aberration: 0.8,
  haze: 0.2,
  ripples: true,
  rippleSpeed: 900,
  rippleWidth: 2,
  rippleBendWidth: 100,
  rippleBend: 20,
  rippleGlow: 1,
  rippleLife: 1.4,
};

const MAX_RIPPLES = 6;
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const WHEEL_LINE = 16;
const ZOOM_SENSITIVITY = 0.0022;

function clampZoom(value: number) {
  return Math.min(Math.max(value, MIN_ZOOM), MAX_ZOOM);
}

const MODIFIER_HELD: Record<ZoomModifier, (event: WheelEvent) => boolean> = {
  shift: (event) => event.shiftKey,
  alt: (event) => event.altKey,
  ctrl: (event) => event.ctrlKey,
  meta: (event) => event.metaKey,
  none: () => true,
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
void main () {
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
out vec4 outColor;
uniform sampler2D uContent;
uniform vec2 uResolution;
uniform float uMaxX;
uniform float uHasContent;
uniform float uDpr;
uniform vec2 uCenter;
uniform float uRadius;
uniform float uZoom;
uniform float uAlpha;
uniform vec3 uColor;
uniform float uHud;
uniform float uRing;
uniform float uCross;
uniform float uTicks;
uniform float uBrackets;
uniform float uDot;
uniform float uGrid;
uniform float uAberration;
uniform float uHaze;
uniform vec4 uRipples[${MAX_RIPPLES}];
uniform float uRippleWidth;
uniform float uRippleBendWidth;
uniform float uRippleBend;
uniform float uRippleGlow;

const float PI = 3.14159265358979;

float pow2 (float x) { return x * x; }

vec3 page (vec2 px, float lod) {
  vec2 uv = px / uResolution;
  uv.x = clamp(uv.x, 0.0005, uMaxX - 0.0005);
  uv.y = clamp(uv.y, 0.0005, 0.9995);
  return pow(textureLod(uContent, vec2(uv.x, 1.0 - uv.y), lod).rgb, vec3(2.2));
}

vec3 pageAA (vec2 px, float minLod) {
  float footprint = max(length(fwidth(px)), 1.0);
  return page(px, max(minLod, log2(footprint)));
}

float line (float d, float halfWidth) {
  return 1.0 - smoothstep(halfWidth - 0.75, halfWidth + 0.75, abs(d));
}

void main () {
  vec2 fragPx = gl_FragCoord.xy;
  vec2 p = fragPx - uCenter;
  float d = length(p);
  float R = uRadius;
  float w = 1.1 * uDpr;

  vec2 rippleOffset = vec2(0.0);
  float crest = 0.0;
  float bendVis = 0.0;
  for (int i = 0; i < ${MAX_RIPPLES}; i++) {
    vec4 rp = uRipples[i];
    vec2 rd = fragPx - rp.xy;
    float rl = max(length(rd), 1.0);
    float bendBand = exp(-pow2((rl - rp.z) / max(uRippleBendWidth * uDpr, 1.0)));
    float crestBand = exp(-pow2((rl - rp.z) / max(uRippleWidth * uDpr, 1.0)));
    rippleOffset += (rd / rl) * bendBand * rp.w * uRippleBend * uDpr;
    crest = max(crest, crestBand * rp.w);
    bendVis = max(bendVis, bendBand * rp.w);
  }

  float inContent = 1.0 - smoothstep(
    uMaxX * uResolution.x - 2.0, uMaxX * uResolution.x, fragPx.x);
  crest *= inContent;
  float rippleCover = smoothstep(0.001, 0.03, bendVis) * inContent;

  float lensMask = 1.0 - smoothstep(R - 1.5, R, d);
  vec2 lensPx = uCenter + p / max(uZoom, 1.0) - rippleOffset;
  float rimT = pow2(clamp(d / max(R, 1.0), 0.0, 1.0));
  vec2 dir = p / max(d, 0.5);
  float caPx = uAberration * 5.0 * rimT * uDpr;
  float hazeLod = uHaze * 3.0 * (0.3 + 0.7 * rimT);
  vec3 inside;
  inside.r = pageAA(lensPx + dir * caPx, hazeLod).r;
  inside.g = pageAA(lensPx, hazeLod).g;
  inside.b = pageAA(lensPx - dir * caPx, hazeLod).b;

  vec3 soft = page(lensPx, 4.5);
  inside = mix(
    inside,
    soft * (1.0 + 0.4 * uHaze) + uColor * 0.06 * uHaze,
    clamp(uHaze, 0.0, 1.0) * 0.45);

  vec3 bent = pageAA(fragPx - rippleOffset, 0.0);

  float hud = 0.0;

  hud += uRing * line(d - R, 1.3 * uDpr);

  float angle = atan(p.y, p.x);
  float sector = PI / 4.0;
  float da = abs(angle - (floor(angle / sector + 0.5) * sector)) * max(d, 1.0);
  float tickBand = smoothstep(R + 4.0 * uDpr, R + 6.0 * uDpr, d)
    * (1.0 - smoothstep(R + 12.0 * uDpr, R + 14.0 * uDpr, d));
  hud += uTicks * line(da, w) * tickBand;

  float reach = R * 1.14;
  float crossLine = max(
    line(p.x, w) * step(abs(p.y), reach),
    line(p.y, w) * step(abs(p.x), reach));
  hud += uCross * crossLine * smoothstep(6.0 * uDpr, 10.0 * uDpr, d) * 0.75;

  vec2 q = abs(p);
  float c = R * 0.64;
  float len = R * 0.2;
  float arm1 = line(q.x - c, w) * step(c - len, q.y) * step(q.y, c + w);
  float arm2 = line(q.y - c, w) * step(c - len, q.x) * step(q.x, c + w);
  hud += uBrackets * max(arm1, arm2);

  hud += uDot * (1.0 - smoothstep(1.6 * uDpr, 2.6 * uDpr, d));
  hud += uDot * line(d - 5.5 * uDpr, 0.9 * uDpr) * 0.6;

  float spacing = max(R * 0.25, 8.0);
  float gx = line(mod(p.x + spacing * 0.5, spacing) - spacing * 0.5, 0.6 * uDpr);
  float gy = line(mod(p.y + spacing * 0.5, spacing) - spacing * 0.5, 0.6 * uDpr);
  hud += uGrid * max(gx, gy) * lensMask * 0.16;

  hud = clamp(hud, 0.0, 1.0) * uHud;

  if (uHasContent < 0.5) {
    vec3 hudCol = pow(max(uColor, 0.0), vec3(1.0 / 2.2));
    float hudA = hud * uAlpha;
    float glow = clamp(pow(crest, 1.5) * uRippleGlow, 0.0, 1.0) * inContent;
    float a = max(hudA, lensMask * uAlpha * 0.08);
    a = max(a, glow * 0.7);
    outColor = vec4(hudCol * clamp(hudA + glow * 0.7, 0.0, 1.0), a);
    return;
  }

  vec3 base = mix(bent, inside, lensMask * uAlpha);
  base += uColor * pow(crest, 1.5) * uRippleGlow * 0.7;
  float hudA = hud * uAlpha;
  base = mix(base, uColor, hudA);

  float alpha = max(lensMask * uAlpha, rippleCover);
  alpha = max(alpha, clamp(pow(crest, 1.5) * uRippleGlow, 0.0, 1.0));
  alpha = max(alpha, hudA);

  outColor = vec4(pow(max(base, 0.0), vec3(1.0 / 2.2)) * alpha, alpha);
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

export function createMagnify(
  elements: MagnifyElements,
  options: MagnifyOptions = {},
): MagnifyInstance | null {
  const config = { ...DEFAULTS, ...options };
  const { source, content, output } = elements;

  const gl = output.getContext("webgl2", {
    alpha: true,
    depth: false,
    stencil: false,
    antialias: false,
    premultipliedAlpha: true,
  });
  if (!gl || gl.isContextLost()) return null;

  const sourceCtx = source.getContext("2d") as ElementImageContext | null;
  const paintable = source as PaintableCanvas;
  const htmlInCanvas = Boolean(
    sourceCtx &&
    typeof sourceCtx.drawElementImage === "function" &&
    typeof paintable.requestPaint === "function",
  );

  let contentDirty = false;
  let wake = () => {};

  if (htmlInCanvas) {
    paintable.onpaint = () => {
      try {
        sourceCtx!.reset();
        sourceCtx!.drawElementImage!(content, 0, 0);
        contentDirty = true;
        wake();
      } catch {}
    };
  }

  function compile(type: number, text: string): WebGLShader {
    const shader = gl!.createShader(type)!;
    gl!.shaderSource(shader, text);
    gl!.compileShader(shader);
    if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) {
      console.error("Magnify shader error:", gl!.getShaderInfoLog(shader));
    }
    return shader;
  }

  const vertexShader = compile(gl.VERTEX_SHADER, VERT);
  const fragmentShader = compile(gl.FRAGMENT_SHADER, FRAG);
  const program = gl.createProgram()!;
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  const uniforms: Record<string, WebGLUniformLocation> = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < count; i++) {
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

  const contentTexture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, contentTexture);
  gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_MIN_FILTER,
    gl.LINEAR_MIPMAP_LINEAR,
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.RGBA,
    1,
    1,
    0,
    gl.RGBA,
    gl.UNSIGNED_BYTE,
    new Uint8Array([0, 0, 0, 0]),
  );
  gl.generateMipmap(gl.TEXTURE_2D);

  let contentMaxX = 1;

  const readout = document.createElement("div");
  readout.setAttribute("aria-hidden", "true");
  Object.assign(readout.style, {
    position: "absolute",
    left: "0",
    top: "0",
    pointerEvents: "none",
    whiteSpace: "pre",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    fontSize: "10px",
    lineHeight: "1.8",
    letterSpacing: "0.14em",
    opacity: "0",
    zIndex: "1",
    willChange: "transform, opacity",
  } satisfies Partial<CSSStyleDeclaration>);
  (output.parentElement ?? output.ownerDocument.body).appendChild(readout);

  function accentCss(): string {
    const [r, g, b] = config.color;
    return `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`;
  }

  function syncCanvasSize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(output.clientWidth * dpr));
    const height = Math.max(1, Math.round(output.clientHeight * dpr));
    if (output.width !== width || output.height !== height) {
      output.width = width;
      output.height = height;
    }
    contentMaxX = Math.min(
      1,
      Math.max(0.05, content.clientWidth / Math.max(output.clientWidth, 1)),
    );
    if (htmlInCanvas) {
      const cssWidth = Math.max(1, Math.round(source.clientWidth));
      const cssHeight = Math.max(1, Math.round(source.clientHeight));
      if (source.width !== cssWidth * dpr || source.height !== cssHeight * dpr) {
        source.width = cssWidth * dpr;
        source.height = cssHeight * dpr;
      }
      paintable.requestPaint!();
    }
  }

  syncCanvasSize();

  function uploadContent() {
    if (!htmlInCanvas || !contentDirty) return;
    contentDirty = false;
    gl!.bindTexture(gl!.TEXTURE_2D, contentTexture);
    gl!.texImage2D(
      gl!.TEXTURE_2D,
      0,
      gl!.RGBA,
      gl!.RGBA,
      gl!.UNSIGNED_BYTE,
      source,
    );
    gl!.generateMipmap(gl!.TEXTURE_2D);
  }

  let posX = output.clientWidth / 2;
  let posY = output.clientHeight / 2;
  let targetX = posX;
  let targetY = posY;
  let presence = 0;
  let presenceTarget = 0;
  let hasPointer = false;
  let zoomTarget = clampZoom(config.zoom);
  let zoomValue = zoomTarget;

  const ripples: { x: number; y: number; r0: number; age: number }[] = [];
  const rippleData = new Float32Array(MAX_RIPPLES * 4);

  function syncReadout(now: number) {
    const show = config.readout && config.hud > 0.01 && presence > 0.05;
    readout.style.opacity = show
      ? String(Math.min(presence, 1) * Math.min(config.hud, 1))
      : "0";
    if (!show) return;
    const R = Math.max(config.size, 8) * presence;
    const width = output.clientWidth;
    const boxW = 120;
    let rx = posX + R + 18;
    if (rx + boxW > width - 8) rx = posX - R - 18 - boxW;
    const ry = Math.min(
      Math.max(posY - 34, 8),
      Math.max(output.clientHeight - 90, 8),
    );
    readout.style.transform = `translate(${Math.round(rx)}px, ${Math.round(ry)}px)`;
    readout.style.color = accentCss();
    const blink = Math.floor(now / 600) % 2 === 0 ? "\u25CF" : "\u25CB";
    readout.textContent =
      `X ${String(Math.round(posX)).padStart(4, " ")}\n` +
      `Y ${String(Math.round(posY)).padStart(4, " ")}\n` +
      `${zoomValue.toFixed(1)}X MAG\n` +
      `R ${Math.round(config.size)}PX ${blink}`;
  }

  function render() {
    uploadContent();
    const dpr = output.width / Math.max(output.clientWidth, 1);
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
    gl!.viewport(0, 0, output.width, output.height);
    gl!.disable(gl!.SCISSOR_TEST);
    gl!.clearColor(0, 0, 0, 0);
    gl!.clear(gl!.COLOR_BUFFER_BIT);
    if (presence <= 0.004 && ripples.length === 0) return;

    const R = Math.max(config.size, 8) * presence;
    const alpha = Math.min(presence * 5, 1);
    const cx = posX * dpr;
    const cy = output.height - posY * dpr;

    if (ripples.length === 0) {
      const margin = (R * 0.25 + 160) * dpr;
      const sx = Math.max(0, Math.floor(cx - R * dpr - margin));
      const sy = Math.max(0, Math.floor(cy - R * dpr - margin));
      gl!.enable(gl!.SCISSOR_TEST);
      gl!.scissor(
        sx,
        sy,
        Math.min(output.width - sx, Math.ceil((R * dpr + margin) * 2)),
        Math.min(output.height - sy, Math.ceil((R * dpr + margin) * 2)),
      );
    }

    rippleData.fill(0);
    for (let i = 0; i < Math.min(ripples.length, MAX_RIPPLES); i++) {
      const ripple = ripples[i];
      const t = ripple.age / Math.max(config.rippleLife, 0.1);
      rippleData[i * 4] = ripple.x * dpr;
      rippleData[i * 4 + 1] = output.height - ripple.y * dpr;
      rippleData[i * 4 + 2] =
        (ripple.r0 + Math.max(config.rippleSpeed, 1) * ripple.age) * dpr;
      rippleData[i * 4 + 3] = Math.pow(Math.max(1 - t, 0), 2);
    }

    gl!.useProgram(program);
    gl!.activeTexture(gl!.TEXTURE0);
    gl!.bindTexture(gl!.TEXTURE_2D, contentTexture);
    gl!.uniform1i(uniforms.uContent, 0);
    gl!.uniform2f(uniforms.uResolution, output.width, output.height);
    gl!.uniform1f(uniforms.uMaxX, contentMaxX);
    gl!.uniform1f(uniforms.uHasContent, htmlInCanvas ? 1 : 0);
    gl!.uniform1f(uniforms.uDpr, dpr);
    gl!.uniform2f(uniforms.uCenter, cx, cy);
    gl!.uniform1f(uniforms.uRadius, R * dpr);
    gl!.uniform1f(uniforms.uZoom, zoomValue);
    gl!.uniform1f(uniforms.uAlpha, alpha);
    gl!.uniform3f(
      uniforms.uColor,
      config.color[0],
      config.color[1],
      config.color[2],
    );
    gl!.uniform1f(uniforms.uHud, Math.min(Math.max(config.hud, 0), 1));
    gl!.uniform1f(uniforms.uRing, config.ring ? 1 : 0);
    gl!.uniform1f(uniforms.uCross, config.crosshair ? 1 : 0);
    gl!.uniform1f(uniforms.uTicks, config.ticks ? 1 : 0);
    gl!.uniform1f(uniforms.uBrackets, config.brackets ? 1 : 0);
    gl!.uniform1f(uniforms.uDot, config.dot ? 1 : 0);
    gl!.uniform1f(uniforms.uGrid, config.grid ? 1 : 0);
    gl!.uniform1f(uniforms.uAberration, Math.max(config.aberration, 0));
    gl!.uniform1f(uniforms.uHaze, Math.min(Math.max(config.haze, 0), 1));
    gl!.uniform4fv(uniforms["uRipples[0]"], rippleData);
    gl!.uniform1f(uniforms.uRippleWidth, Math.max(config.rippleWidth, 0.5));
    gl!.uniform1f(
      uniforms.uRippleBendWidth,
      Math.max(config.rippleBendWidth, 1),
    );
    gl!.uniform1f(uniforms.uRippleBend, Math.max(config.rippleBend, 0));
    gl!.uniform1f(uniforms.uRippleGlow, Math.max(config.rippleGlow, 0));
    gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
    gl!.disable(gl!.SCISSOR_TEST);
  }

  let raf = 0;
  let lastTime = performance.now();
  let destroyed = false;
  let running = false;
  let visible = true;

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reducedMotion = motionQuery.matches;

  function frame(now: number) {
    if (destroyed) return;
    if (!visible) {
      running = false;
      return;
    }
    const delta = Math.min((now - lastTime) / 1000, 1 / 30);
    lastTime = now;

    const follow = Math.min(Math.max(config.follow, 0.02), 1);
    const kPos =
      reducedMotion || follow >= 1
        ? 1
        : 1 - Math.exp(-delta * (4 + follow * 26));
    const kScale = reducedMotion ? 1 : 1 - Math.exp(-delta * 11);
    posX += (targetX - posX) * kPos;
    posY += (targetY - posY) * kPos;
    presence += (presenceTarget - presence) * kScale;
    zoomValue += (zoomTarget - zoomValue) * kScale;

    for (const ripple of ripples) ripple.age += delta;
    for (let i = ripples.length - 1; i >= 0; i--) {
      if (ripples[i].age > Math.max(config.rippleLife, 0.1)) {
        ripples.splice(i, 1);
      }
    }

    render();
    syncReadout(now);

    const settled =
      Math.abs(targetX - posX) < 0.1 &&
      Math.abs(targetY - posY) < 0.1 &&
      Math.abs(presenceTarget - presence) < 0.002 &&
      Math.abs(zoomTarget - zoomValue) < 0.002;
    if (settled && !contentDirty && ripples.length === 0) {
      posX = targetX;
      posY = targetY;
      presence = presenceTarget;
      zoomValue = zoomTarget;
      running = false;
      return;
    }
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (destroyed || running || !visible) return;
    running = true;
    lastTime = performance.now();
    raf = requestAnimationFrame(frame);
  }

  wake = start;
  start();

  const rectCache = createRectCache(output);

  function onPointerMove(event: PointerEvent) {
    const rect = rectCache.current;
    targetX = event.clientX - rect.left;
    targetY = event.clientY - rect.top;
    if (!hasPointer) {
      posX = targetX;
      posY = targetY;
      hasPointer = true;
    }
    presenceTarget = 1;
    start();
  }

  function onPointerLeave() {
    presenceTarget = 0;
    hasPointer = false;
    start();
  }

  function onPointerDown(event: PointerEvent) {
    if (!config.ripples || event.button > 0 || reducedMotion) return;
    if (ripples.length >= MAX_RIPPLES) ripples.shift();
    ripples.push({
      x: posX,
      y: posY,
      r0: Math.max(config.size, 8) * presence,
      age: 0,
    });
    start();
  }

  content.addEventListener("pointermove", onPointerMove, { passive: true });
  content.addEventListener("pointerleave", onPointerLeave, { passive: true });
  content.addEventListener("pointerdown", onPointerDown, { passive: true });

  function onWheel(event: WheelEvent) {
    const held = MODIFIER_HELD[config.zoomModifier] ?? MODIFIER_HELD.shift;
    if (!held(event)) return;
    const rect = output.getBoundingClientRect();
    if (
      event.clientX < rect.left ||
      event.clientX > rect.right ||
      event.clientY < rect.top ||
      event.clientY > rect.bottom
    ) {
      return;
    }
    event.preventDefault();
    const unit =
      event.deltaMode === 1
        ? WHEEL_LINE
        : event.deltaMode === 2
          ? output.clientHeight
          : 1;
    const delta =
      Math.abs(event.deltaY) >= Math.abs(event.deltaX)
        ? event.deltaY
        : event.deltaX;
    zoomTarget = clampZoom(
      zoomTarget * Math.exp(-delta * unit * ZOOM_SENSITIVITY),
    );
    start();
  }

  const WHEEL_OPTIONS: AddEventListenerOptions = {
    passive: false,
    capture: true,
  };

  let wheelBound = false;
  function syncWheel() {
    if (config.scrollZoom === wheelBound) return;
    wheelBound = config.scrollZoom;
    if (wheelBound) window.addEventListener("wheel", onWheel, WHEEL_OPTIONS);
    else window.removeEventListener("wheel", onWheel, WHEEL_OPTIONS);
  }
  syncWheel();

  function onScroll() {
    start();
  }
  content.addEventListener("scroll", onScroll, { passive: true });

  function onMotionChange() {
    reducedMotion = motionQuery.matches;
    start();
  }
  motionQuery.addEventListener("change", onMotionChange);

  const observer = new ResizeObserver(() => {
    syncCanvasSize();
    start();
  });
  observer.observe(output);
  observer.observe(content);

  const intersection = new IntersectionObserver((entries) => {
    visible = entries[entries.length - 1]?.isIntersecting ?? true;
    if (visible) start();
  });
  intersection.observe(output);

  return {
    setOptions(next) {
      if (
        !Object.entries(next).some(
          ([key, value]) => config[key as keyof MagnifyOptions] !== value,
        )
      )
        return;
      const previousZoom = config.zoom;
      Object.assign(config, next);
      if (!config.scrollZoom || config.zoom !== previousZoom) {
        zoomTarget = clampZoom(config.zoom);
      }
      syncWheel();
      start();
    },
    resize() {
      syncCanvasSize();
      start();
    },
    destroy() {
      destroyed = true;
      rectCache.destroy();
      cancelAnimationFrame(raf);
      content.removeEventListener("pointermove", onPointerMove);
      content.removeEventListener("pointerleave", onPointerLeave);
      content.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("wheel", onWheel, WHEEL_OPTIONS);
      content.removeEventListener("scroll", onScroll);
      observer.disconnect();
      intersection.disconnect();
      motionQuery.removeEventListener("change", onMotionChange);
      readout.remove();
      gl!.deleteTexture(contentTexture);
      gl!.deleteProgram(program);
      gl!.deleteShader(vertexShader);
      gl!.deleteShader(fragmentShader);
      gl!.deleteBuffer(quad);
      if (htmlInCanvas) paintable.onpaint = null;
    },
  };
}
