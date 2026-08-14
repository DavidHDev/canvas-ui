import { createRectCache } from "../rect-cache";

export interface LiquidOptions {
  /** Resolution of the simulation grid. */
  simResolution?: number;
  /** Resolution of the fluid trail texture. */
  dyeResolution?: number;
  /** How much the trail persists each frame (closer to 1 lasts longer). */
  densityDissipation?: number;
  /** How much motion persists each frame (closer to 1 lasts longer). */
  velocityDissipation?: number;
  /** How much pressure carries over between frames. */
  pressure?: number;
  /** Pressure solver iterations. */
  pressureIterations?: number;
  /** Rotational force added back into the flow. */
  curl?: number;
  /** Radius of the pointer splat. */
  radius?: number;
  /** Force multiplier applied on pointer movement. */
  force?: number;
  /** Strength of the color tint left by the flow. */
  intensity?: number;
  /** How strongly the flow warps the content. */
  distortion?: number;
  /** How much of the fluid color blends over the content. */
  blend?: number;
  /** Trail color as [r, g, b] in 0-1 range. Ignored when rainbow is on. */
  color?: [number, number, number];
  /** Color the trail from the flow direction instead of a fixed color. */
  rainbow?: boolean;
}

export interface LiquidElements {
  /** Canvas with layoutsubtree that hosts the HTML content. */
  source: HTMLCanvasElement;
  /** The element inside the source canvas that gets captured. */
  content: HTMLElement;
  /** Canvas the WebGL effect renders to. */
  output: HTMLCanvasElement;
}

export interface LiquidInstance {
  /** Inject a splat at (x, y) in [0,1] space with velocity (dx, dy). */
  splat: (x: number, y: number, dx: number, dy: number) => void;
  /** Update simulation options live, including simulation target resolution. */
  setOptions: (options: LiquidOptions) => void;
  /** Re-read canvas size. Call when the element is resized. */
  resize: () => void;
  /** Stop the loop and release all GPU resources. */
  destroy: () => void;
}

const DEFAULTS: Required<LiquidOptions> = {
  simResolution: 128,
  dyeResolution: 512,
  densityDissipation: 0.96,
  velocityDissipation: 1,
  pressure: 0.8,
  pressureIterations: 4,
  curl: 1.9,
  radius: 0.3,
  force: 1.1,
  intensity: 2,
  distortion: 0.4,
  blend: 5,
  color: [0.145, 0.239, 0.867],
  rainbow: false,
};

const DT = 1 / 60;

function srgbToLinear(value: number): number {
  return value <= 0.04045
    ? value / 12.92
    : Math.pow((value + 0.055) / 1.055, 2.4);
}

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
out vec2 vL;
out vec2 vR;
out vec2 vT;
out vec2 vB;
uniform vec2 texelSize;
void main () {
  vUv = aPos * 0.5 + 0.5;
  vL = vUv - vec2(texelSize.x, 0.0);
  vR = vUv + vec2(texelSize.x, 0.0);
  vT = vUv + vec2(0.0, texelSize.y);
  vB = vUv - vec2(0.0, texelSize.y);
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const FRAG_DISPLAY = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uContent;
uniform sampler2D uFluid;
uniform vec3 uColor;
uniform float uDistortion;
uniform float uIntensity;
uniform float uBlend;
uniform float uRainbow;
uniform float uHasContent;
vec3 toLinear (vec3 c) {
  return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c));
}
vec3 toSrgb (vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}
void main () {
  vec3 fluid = texture(uFluid, vUv).rgb;
  if (uHasContent < 0.5) {
    float mag = length(fluid);
    vec3 tint = uRainbow == 1.0
      ? clamp(fluid / max(mag, 1e-3), 0.0, 1.0)
      : uColor;
    float overlay = (1.0 - exp(-mag * uIntensity * 0.5)) * 0.82;
    outColor = vec4(toSrgb(clamp(tint, 0.0, 1.0)) * overlay, overlay);
    return;
  }
  vec2 uv = vUv - fluid.rg * uDistortion * 0.001;
  vec4 content = texture(uContent, vec2(uv.x, 1.0 - uv.y));
  content.rgb = toLinear(content.rgb);
  vec3 tint = uRainbow == 1.0 ? fluid : uColor * length(fluid);
  vec4 fluidColor = vec4(tint, 1.0);
  vec4 blended = mix(content, fluidColor, uBlend * 0.01 * clamp(length(fluid), 0.0, 1.0));
  vec4 final = mix(blended, vec4(0.0), 1.0 - content.a);
  outColor = vec4(toSrgb(clamp(final.rgb, 0.0, 1.0)), final.a);
}`;

const FRAG_SPLAT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTarget;
uniform float uAspect;
uniform vec3 uColor;
uniform vec2 uPoint;
uniform float uRadius;
void main () {
  vec2 p = vUv - uPoint;
  p.x *= uAspect;
  vec3 splat = exp(-dot(p, p) / uRadius) * uColor;
  vec3 base = texture(uTarget, vUv).xyz;
  outColor = vec4(base + splat, 1.0);
}`;

const FRAG_ADVECT = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 texelSize;
uniform float uDt;
uniform float uDissipation;
void main () {
  vec2 coord = vUv - uDt * texture(uVelocity, vUv).xy * texelSize;
  outColor = uDissipation * texture(uSource, coord);
  outColor.a = 1.0;
}`;

const FRAG_CLEAR = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 outColor;
uniform sampler2D uTexture;
uniform float uValue;
void main () {
  outColor = uValue * texture(uTexture, vUv);
}`;

const FRAG_DIVERGENCE = `#version 300 es
precision highp float;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
out vec4 outColor;
uniform sampler2D uVelocity;
void main () {
  float L = texture(uVelocity, vL).x;
  float R = texture(uVelocity, vR).x;
  float T = texture(uVelocity, vT).y;
  float B = texture(uVelocity, vB).y;
  vec2 C = texture(uVelocity, vUv).xy;
  if (vL.x < 0.0) { L = -C.x; }
  if (vR.x > 1.0) { R = -C.x; }
  if (vT.y > 1.0) { T = -C.y; }
  if (vB.y < 0.0) { B = -C.y; }
  float div = 0.5 * (R - L + T - B);
  outColor = vec4(div, 0.0, 0.0, 1.0);
}`;

const FRAG_CURL = `#version 300 es
precision highp float;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
out vec4 outColor;
uniform sampler2D uVelocity;
void main () {
  float L = texture(uVelocity, vL).y;
  float R = texture(uVelocity, vR).y;
  float T = texture(uVelocity, vT).x;
  float B = texture(uVelocity, vB).x;
  float vorticity = R - L - T + B;
  outColor = vec4(vorticity, 0.0, 0.0, 1.0);
}`;

const FRAG_VORTICITY = `#version 300 es
precision highp float;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
out vec4 outColor;
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform float uCurlStrength;
uniform float uDt;
void main () {
  float L = texture(uCurl, vL).x;
  float R = texture(uCurl, vR).x;
  float T = texture(uCurl, vT).x;
  float B = texture(uCurl, vB).x;
  float C = texture(uCurl, vUv).x;
  vec2 force = vec2(abs(T) - abs(B), abs(R) - abs(L)) * 0.5;
  force /= length(force) + 1.0;
  force *= uCurlStrength * C;
  force.y *= -1.0;
  vec2 velocity = texture(uVelocity, vUv).xy;
  outColor = vec4(velocity + force * uDt, 0.0, 1.0);
}`;

const FRAG_PRESSURE = `#version 300 es
precision highp float;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
out vec4 outColor;
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
void main () {
  float L = texture(uPressure, vL).x;
  float R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x;
  float B = texture(uPressure, vB).x;
  float divergence = texture(uDivergence, vUv).x;
  float pressure = (L + R + B + T - divergence) * 0.25;
  outColor = vec4(pressure, 0.0, 0.0, 1.0);
}`;

const FRAG_GRADIENT = `#version 300 es
precision highp float;
in vec2 vUv;
in vec2 vL;
in vec2 vR;
in vec2 vT;
in vec2 vB;
out vec4 outColor;
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
void main () {
  float L = texture(uPressure, vL).x;
  float R = texture(uPressure, vR).x;
  float T = texture(uPressure, vT).x;
  float B = texture(uPressure, vB).x;
  vec2 velocity = texture(uVelocity, vUv).xy;
  velocity.xy -= vec2(R - L, T - B);
  outColor = vec4(velocity, 0.0, 1.0);
}`;

interface Target {
  fbo: WebGLFramebuffer;
  texture: WebGLTexture;
  width: number;
  height: number;
}

interface DoubleTarget {
  read: Target;
  write: Target;
  swap: () => void;
}

interface FluidTargets {
  velocity: DoubleTarget;
  dye: DoubleTarget;
  divergence: Target;
  curl: Target;
  pressure: DoubleTarget;
}

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

export function createLiquid(
  elements: LiquidElements,
  options: LiquidOptions = {},
): LiquidInstance | null {
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

  const supportsFloatTargets = Boolean(
    gl.getExtension("EXT_color_buffer_float") ||
      gl.getExtension("EXT_color_buffer_half_float"),
  );
  if (!supportsFloatTargets) return null;

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

  const supportsLinear = Boolean(gl.getExtension("OES_texture_float_linear"));
  const filtering = supportsLinear ? gl.LINEAR : gl.NEAREST;

  const shaders: WebGLShader[] = [];

  function compile(type: number, source: string): WebGLShader {
    const shader = gl!.createShader(type)!;
    gl!.shaderSource(shader, source);
    gl!.compileShader(shader);
    if (!gl!.getShaderParameter(shader, gl!.COMPILE_STATUS)) {
      console.error("Liquid shader error:", gl!.getShaderInfoLog(shader));
    }
    shaders.push(shader);
    return shader;
  }

  const vertexShader = compile(gl.VERTEX_SHADER, VERT);

  interface Program {
    program: WebGLProgram;
    uniforms: Record<string, WebGLUniformLocation>;
  }

  const programs: WebGLProgram[] = [];

  function createProgram(fragSource: string): Program {
    const program = gl!.createProgram()!;
    gl!.attachShader(program, vertexShader);
    gl!.attachShader(program, compile(gl!.FRAGMENT_SHADER, fragSource));
    gl!.linkProgram(program);
    programs.push(program);
    const uniforms: Record<string, WebGLUniformLocation> = {};
    const count = gl!.getProgramParameter(program, gl!.ACTIVE_UNIFORMS);
    for (let i = 0; i < count; i++) {
      const info = gl!.getActiveUniform(program, i)!;
      uniforms[info.name] = gl!.getUniformLocation(program, info.name)!;
    }
    return { program, uniforms };
  }

  const displayProgram = createProgram(FRAG_DISPLAY);
  const splatProgram = createProgram(FRAG_SPLAT);
  const advectProgram = createProgram(FRAG_ADVECT);
  const clearProgram = createProgram(FRAG_CLEAR);
  const divergenceProgram = createProgram(FRAG_DIVERGENCE);
  const curlProgram = createProgram(FRAG_CURL);
  const vorticityProgram = createProgram(FRAG_VORTICITY);
  const pressureProgram = createProgram(FRAG_PRESSURE);
  const gradientProgram = createProgram(FRAG_GRADIENT);

  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
    gl.STATIC_DRAW,
  );
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  function createTarget(
    size: number,
    internalFormat: number,
    format: number,
    filter: number,
  ): Target {
    const texture = gl!.createTexture()!;
    gl!.bindTexture(gl!.TEXTURE_2D, texture);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MIN_FILTER, filter);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_MAG_FILTER, filter);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_S, gl!.CLAMP_TO_EDGE);
    gl!.texParameteri(gl!.TEXTURE_2D, gl!.TEXTURE_WRAP_T, gl!.CLAMP_TO_EDGE);
    gl!.texImage2D(
      gl!.TEXTURE_2D,
      0,
      internalFormat,
      size,
      size,
      0,
      format,
      gl!.HALF_FLOAT,
      null,
    );
    const fbo = gl!.createFramebuffer()!;
    gl!.bindFramebuffer(gl!.FRAMEBUFFER, fbo);
    gl!.framebufferTexture2D(
      gl!.FRAMEBUFFER,
      gl!.COLOR_ATTACHMENT0,
      gl!.TEXTURE_2D,
      texture,
      0,
    );
    gl!.viewport(0, 0, size, size);
    gl!.clearColor(0, 0, 0, 1);
    gl!.clear(gl!.COLOR_BUFFER_BIT);
    return { fbo, texture, width: size, height: size };
  }

  function createDoubleTarget(
    size: number,
    internalFormat: number,
    format: number,
    filter: number,
  ): DoubleTarget {
    let read = createTarget(size, internalFormat, format, filter);
    let write = createTarget(size, internalFormat, format, filter);
    return {
      get read() {
        return read;
      },
      get write() {
        return write;
      },
      swap() {
        const t = read;
        read = write;
        write = t;
      },
    };
  }

  function createFluidTargets(
    simResolution: number,
    dyeResolution: number,
  ): FluidTargets {
    return {
      velocity: createDoubleTarget(
        simResolution,
        gl!.RG16F,
        gl!.RG,
        filtering,
      ),
      dye: createDoubleTarget(
        dyeResolution,
        gl!.RGBA16F,
        gl!.RGBA,
        filtering,
      ),
      divergence: createTarget(
        simResolution,
        gl!.R16F,
        gl!.RED,
        gl!.NEAREST,
      ),
      curl: createTarget(
        simResolution,
        gl!.R16F,
        gl!.RED,
        gl!.NEAREST,
      ),
      pressure: createDoubleTarget(
        simResolution,
        gl!.R16F,
        gl!.RED,
        gl!.NEAREST,
      ),
    };
  }

  let fluidTargets = createFluidTargets(
    config.simResolution,
    config.dyeResolution,
  );

  function releaseTargets(targets: FluidTargets) {
    [
      targets.velocity.read,
      targets.velocity.write,
      targets.dye.read,
      targets.dye.write,
      targets.pressure.read,
      targets.pressure.write,
      targets.divergence,
      targets.curl,
    ].forEach((t) => {
      gl!.deleteFramebuffer(t.fbo);
      gl!.deleteTexture(t.texture);
    });
  }

  function rebuildFluidTargets(simResolution: number, dyeResolution: number) {
    const next = createFluidTargets(simResolution, dyeResolution);
    const previous = fluidTargets;
    fluidTargets = next;
    releaseTargets(previous);
  }

  let texelX = 0;
  let texelY = 0;

  function updateTexelSize() {
    const width = Math.max(output.clientWidth, 1);
    const height = Math.max(output.clientHeight, 1);
    texelX = 1 / (config.simResolution * (width / (height + 400)));
    texelY = 1 / config.simResolution;
  }

  function syncCanvasSize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(output.clientWidth * dpr));
    const height = Math.max(1, Math.round(output.clientHeight * dpr));
    if (output.width !== width || output.height !== height) {
      output.width = width;
      output.height = height;
    }
    if (htmlInCanvas) {
      const cssWidth = Math.max(1, Math.round(source.clientWidth));
      const cssHeight = Math.max(1, Math.round(source.clientHeight));
      if (source.width !== cssWidth * dpr || source.height !== cssHeight * dpr) {
        source.width = cssWidth * dpr;
        source.height = cssHeight * dpr;
      }
      paintable.requestPaint!();
    }
    updateTexelSize();
  }

  syncCanvasSize();

  const contentTexture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, contentTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
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
  }

  function blit(target: Target | null) {
    if (target) {
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, target.fbo);
      gl!.viewport(0, 0, target.width, target.height);
    } else {
      gl!.bindFramebuffer(gl!.FRAMEBUFFER, null);
      gl!.viewport(0, 0, output.width, output.height);
    }
    gl!.drawArrays(gl!.TRIANGLE_STRIP, 0, 4);
  }

  function bindTexture(texture: WebGLTexture, unit: number): number {
    gl!.activeTexture(gl!.TEXTURE0 + unit);
    gl!.bindTexture(gl!.TEXTURE_2D, texture);
    return unit;
  }

  function applySplat(x: number, y: number, dx: number, dy: number) {
    const aspect = output.clientWidth / Math.max(output.clientHeight, 1);
    const radius = config.radius / 100;

    gl!.useProgram(splatProgram.program);
    gl!.uniform1i(
      splatProgram.uniforms.uTarget,
      bindTexture(fluidTargets.velocity.read.texture, 0),
    );
    gl!.uniform1f(splatProgram.uniforms.uAspect, aspect);
    gl!.uniform2f(splatProgram.uniforms.uPoint, x, y);
    gl!.uniform3f(splatProgram.uniforms.uColor, dx, dy, 10);
    gl!.uniform1f(splatProgram.uniforms.uRadius, radius);
    blit(fluidTargets.velocity.write);
    fluidTargets.velocity.swap();

    gl!.uniform1i(
      splatProgram.uniforms.uTarget,
      bindTexture(fluidTargets.dye.read.texture, 0),
    );
    blit(fluidTargets.dye.write);
    fluidTargets.dye.swap();
  }

  function step(delta: number) {
    gl!.disable(gl!.BLEND);

    gl!.useProgram(curlProgram.program);
    gl!.uniform2f(curlProgram.uniforms.texelSize, texelX, texelY);
    gl!.uniform1i(
      curlProgram.uniforms.uVelocity,
      bindTexture(fluidTargets.velocity.read.texture, 0),
    );
    blit(fluidTargets.curl);

    gl!.useProgram(vorticityProgram.program);
    gl!.uniform2f(vorticityProgram.uniforms.texelSize, texelX, texelY);
    gl!.uniform1i(
      vorticityProgram.uniforms.uVelocity,
      bindTexture(fluidTargets.velocity.read.texture, 0),
    );
    gl!.uniform1i(
      vorticityProgram.uniforms.uCurl,
      bindTexture(fluidTargets.curl.texture, 1),
    );
    gl!.uniform1f(vorticityProgram.uniforms.uCurlStrength, config.curl);
    gl!.uniform1f(vorticityProgram.uniforms.uDt, DT);
    blit(fluidTargets.velocity.write);
    fluidTargets.velocity.swap();

    gl!.useProgram(divergenceProgram.program);
    gl!.uniform2f(divergenceProgram.uniforms.texelSize, texelX, texelY);
    gl!.uniform1i(
      divergenceProgram.uniforms.uVelocity,
      bindTexture(fluidTargets.velocity.read.texture, 0),
    );
    blit(fluidTargets.divergence);

    gl!.useProgram(clearProgram.program);
    gl!.uniform1i(
      clearProgram.uniforms.uTexture,
      bindTexture(fluidTargets.pressure.read.texture, 0),
    );
    gl!.uniform1f(
      clearProgram.uniforms.uValue,
      Math.pow(config.pressure, delta * 60),
    );
    blit(fluidTargets.pressure.write);
    fluidTargets.pressure.swap();

    gl!.useProgram(pressureProgram.program);
    gl!.uniform2f(pressureProgram.uniforms.texelSize, texelX, texelY);
    gl!.uniform1i(
      pressureProgram.uniforms.uDivergence,
      bindTexture(fluidTargets.divergence.texture, 0),
    );
    for (let i = 0; i < config.pressureIterations; i++) {
      gl!.uniform1i(
        pressureProgram.uniforms.uPressure,
        bindTexture(fluidTargets.pressure.read.texture, 1),
      );
      blit(fluidTargets.pressure.write);
      fluidTargets.pressure.swap();
    }

    gl!.useProgram(gradientProgram.program);
    gl!.uniform2f(gradientProgram.uniforms.texelSize, texelX, texelY);
    gl!.uniform1i(
      gradientProgram.uniforms.uPressure,
      bindTexture(fluidTargets.pressure.read.texture, 0),
    );
    gl!.uniform1i(
      gradientProgram.uniforms.uVelocity,
      bindTexture(fluidTargets.velocity.read.texture, 1),
    );
    blit(fluidTargets.velocity.write);
    fluidTargets.velocity.swap();

    gl!.useProgram(advectProgram.program);
    gl!.uniform2f(advectProgram.uniforms.texelSize, texelX, texelY);
    gl!.uniform1i(
      advectProgram.uniforms.uVelocity,
      bindTexture(fluidTargets.velocity.read.texture, 0),
    );
    gl!.uniform1i(
      advectProgram.uniforms.uSource,
      bindTexture(fluidTargets.velocity.read.texture, 0),
    );
    gl!.uniform1f(advectProgram.uniforms.uDt, DT);
    gl!.uniform1f(
      advectProgram.uniforms.uDissipation,
      Math.pow(config.velocityDissipation, delta * 60),
    );
    blit(fluidTargets.velocity.write);
    fluidTargets.velocity.swap();

    gl!.uniform1i(
      advectProgram.uniforms.uVelocity,
      bindTexture(fluidTargets.velocity.read.texture, 0),
    );
    gl!.uniform1i(
      advectProgram.uniforms.uSource,
      bindTexture(fluidTargets.dye.read.texture, 1),
    );
    gl!.uniform1f(
      advectProgram.uniforms.uDissipation,
      Math.pow(config.densityDissipation, delta * 60),
    );
    blit(fluidTargets.dye.write);
    fluidTargets.dye.swap();
  }

  function render() {
    uploadContent();
    gl!.useProgram(displayProgram.program);
    gl!.uniform1i(
      displayProgram.uniforms.uContent,
      bindTexture(contentTexture, 0),
    );
    gl!.uniform1i(
      displayProgram.uniforms.uFluid,
      bindTexture(fluidTargets.dye.read.texture, 1),
    );
    gl!.uniform3f(
      displayProgram.uniforms.uColor,
      srgbToLinear(config.color[0]),
      srgbToLinear(config.color[1]),
      srgbToLinear(config.color[2]),
    );
    gl!.uniform1f(displayProgram.uniforms.uDistortion, config.distortion);
    gl!.uniform1f(displayProgram.uniforms.uIntensity, config.intensity);
    gl!.uniform1f(displayProgram.uniforms.uBlend, config.blend);
    gl!.uniform1f(displayProgram.uniforms.uRainbow, config.rainbow ? 1 : 0);
    gl!.uniform1f(displayProgram.uniforms.uHasContent, htmlInCanvas ? 1 : 0);
    blit(null);
  }

  const queued: Array<[number, number, number, number]> = [];

  let raf = 0;
  let lastTime = performance.now();
  let destroyed = false;
  let running = false;
  let visible = true;
  let idleAt = 0;

  function idleDelayMs() {
    const dissipation = Math.min(config.densityDissipation, 0.999);
    const frames = Math.log(1e-7) / Math.log(dissipation);
    return (frames / 60) * 1000;
  }

  function frame(now: number) {
    if (destroyed) return;
    if (!visible) {
      running = false;
      return;
    }
    const delta = Math.min((now - lastTime) / 1000, 1 / 30);
    lastTime = now;
    if (queued.length > 0) {
      idleAt = now + idleDelayMs();
      while (queued.length > 0) {
        const [x, y, dx, dy] = queued.pop()!;
        applySplat(x, y, dx, dy);
      }
    }
    step(delta);
    render();
    if (now >= idleAt && !contentDirty) {
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

  const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  let reducedMotion = motionQuery.matches;

  function onMotionChange() {
    reducedMotion = motionQuery.matches;
    if (!reducedMotion) start();
  }
  motionQuery.addEventListener("change", onMotionChange);

  const pointers = new Map<number, { x: number; y: number }>();

  const rectCache = createRectCache(output);

  function onPointerMove(event: PointerEvent) {
    if (reducedMotion) return;
    const rect = rectCache.current;
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    if (px < 0 || px > rect.width || py < 0 || py > rect.height) {
      pointers.delete(event.pointerId);
      return;
    }
    const previous = pointers.get(event.pointerId);
    pointers.set(event.pointerId, { x: px, y: py });
    if (!previous) return;
    const dx = (px - previous.x) * config.force;
    const dy = -(py - previous.y) * config.force;
    queued.push([px / rect.width, 1 - py / rect.height, dx, dy]);
    start();
  }

  function onPointerDown(event: PointerEvent) {
    if (reducedMotion) return;
    const rect = output.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    if (x < 0 || x > rect.width || y < 0 || y > rect.height) return;
    pointers.set(event.pointerId, { x, y });
    queued.push([x / rect.width, 1 - y / rect.height, 1, 1]);
    start();
  }

  function onPointerLeave(event: PointerEvent) {
    pointers.delete(event.pointerId);
  }

  const listenTarget = window;
  listenTarget.addEventListener("pointerdown", onPointerDown as EventListener, {
    passive: true,
  });
  listenTarget.addEventListener("pointermove", onPointerMove as EventListener, { passive: true });
  listenTarget.addEventListener(
    "pointerup",
    onPointerLeave as EventListener,
    { passive: true },
  );
  listenTarget.addEventListener(
    "pointerleave",
    onPointerLeave as EventListener,
  );
  listenTarget.addEventListener(
    "pointercancel",
    onPointerLeave as EventListener,
  );

  const observer = new ResizeObserver(() => {
    syncCanvasSize();
    start();
  });
  observer.observe(output);

  const intersection = new IntersectionObserver((entries) => {
    visible = entries[entries.length - 1]?.isIntersecting ?? true;
    if (visible) start();
  });
  intersection.observe(output);

  return {
    splat(x, y, dx, dy) {
      if (reducedMotion) return;
      queued.push([x, y, dx, dy]);
      start();
    },
    setOptions(next) {
      if (
        !Object.entries(next).some(
          ([key, value]) => config[key as keyof LiquidOptions] !== value,
        )
      )
        return;
      const simResolution = next.simResolution ?? config.simResolution;
      const dyeResolution = next.dyeResolution ?? config.dyeResolution;
      const resolutionChanged =
        simResolution !== config.simResolution ||
        dyeResolution !== config.dyeResolution;

      if (resolutionChanged) {
        rebuildFluidTargets(simResolution, dyeResolution);
        config.simResolution = simResolution;
        config.dyeResolution = dyeResolution;
        updateTexelSize();
      }

      Object.assign(config, next);
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
      observer.disconnect();
      intersection.disconnect();
      motionQuery.removeEventListener("change", onMotionChange);
      releaseTargets(fluidTargets);
      gl!.deleteTexture(contentTexture);
      programs.forEach((program) => gl!.deleteProgram(program));
      shaders.forEach((shader) => gl!.deleteShader(shader));
      gl!.deleteBuffer(quad);
      if (htmlInCanvas) paintable.onpaint = null;
      listenTarget.removeEventListener(
        "pointerdown",
        onPointerDown as EventListener,
      );
      listenTarget.removeEventListener(
        "pointermove",
        onPointerMove as EventListener,
      );
      listenTarget.removeEventListener(
        "pointerup",
        onPointerLeave as EventListener,
      );
      listenTarget.removeEventListener(
        "pointerleave",
        onPointerLeave as EventListener,
      );
      listenTarget.removeEventListener(
        "pointercancel",
        onPointerLeave as EventListener,
      );
    },
  };
}
