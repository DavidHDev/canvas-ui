"use client";

import { Pipette, RotateCcw } from "@/components/icons";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";

import { DemoPortalContext } from "@/components/demos/demo-context";

type Hsv = { h: number; s: number; v: number };

const EASE = [0.23, 1, 0.32, 1] as const;
const DISC_RADIUS = 84;
const THUMB_INSET = 9;
const POPOVER_WIDTH = 188;

const WHEEL_W = 180;
const WHEEL_CX = WHEEL_W / 2;
const WHEEL_CY = DISC_RADIUS;
const BAND_STROKE = 14;
const BAND_R = DISC_RADIUS + 6 + BAND_STROKE / 2;
const BAND_HALF_SPAN = (42 * Math.PI) / 180;
const BAND_ANG_LEFT = Math.PI / 2 + BAND_HALF_SPAN;
const BAND_ANG_RIGHT = Math.PI / 2 - BAND_HALF_SPAN;
const WHEEL_H = WHEEL_CY + BAND_R + THUMB_INSET + 2;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

function normalizeHex(input: string): string | null {
  const raw = input.trim().replace(/^#/, "").toLowerCase();
  if (/^[0-9a-f]{6}$/.test(raw)) return `#${raw}`;
  if (/^[0-9a-f]{3}$/.test(raw)) {
    return `#${raw[0]}${raw[0]}${raw[1]}${raw[1]}${raw[2]}${raw[2]}`;
  }
  return null;
}

const K1 = 0.206;
const K2 = 0.03;
const K3 = (1 + K1) / (1 + K2);

const toe = (x: number) =>
  0.5 * (K3 * x - K1 + Math.sqrt((K3 * x - K1) ** 2 + 4 * K2 * K3 * x));

const toeInv = (x: number) => (x * x + K1 * x) / (K3 * (x + K2));

const srgbTransfer = (x: number) =>
  x >= 0.0031308 ? 1.055 * Math.pow(x, 1 / 2.4) - 0.055 : 12.92 * x;

const srgbTransferInv = (x: number) =>
  x >= 0.04045 ? Math.pow((x + 0.055) / 1.055, 2.4) : x / 12.92;

function oklabToLinearSrgb(
  L: number,
  a: number,
  b: number,
): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

function linearSrgbToOklab(
  r: number,
  g: number,
  b: number,
): [number, number, number] {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function computeMaxSaturation(a: number, b: number): number {
  let k0: number, k1: number, k2: number, k3: number, k4: number;
  let wl: number, wm: number, ws: number;
  if (-1.88170328 * a - 0.80936493 * b > 1) {
    k0 = 1.19086277;
    k1 = 1.76576728;
    k2 = 0.59662641;
    k3 = 0.75515197;
    k4 = 0.56771245;
    wl = 4.0767416621;
    wm = -3.3077115913;
    ws = 0.2309699292;
  } else if (1.81444104 * a - 1.19445276 * b > 1) {
    k0 = 0.73956515;
    k1 = -0.45954404;
    k2 = 0.08285427;
    k3 = 0.1254107;
    k4 = 0.14503204;
    wl = -1.2684380046;
    wm = 2.6097574011;
    ws = -0.3413193965;
  } else {
    k0 = 1.35733652;
    k1 = -0.00915799;
    k2 = -1.1513021;
    k3 = -0.50559606;
    k4 = 0.00692167;
    wl = -0.0041960863;
    wm = -0.7034186147;
    ws = 1.707614701;
  }
  let S = k0 + k1 * a + k2 * b + k3 * a * a + k4 * a * b;
  const kl = 0.3963377774 * a + 0.2158037573 * b;
  const km = -0.1055613458 * a - 0.0638541728 * b;
  const ks = -0.0894841775 * a - 1.291485548 * b;
  const l_ = 1 + S * kl;
  const m_ = 1 + S * km;
  const s_ = 1 + S * ks;
  const f = wl * l_ ** 3 + wm * m_ ** 3 + ws * s_ ** 3;
  const f1 = 3 * (wl * kl * l_ ** 2 + wm * km * m_ ** 2 + ws * ks * s_ ** 2);
  const f2 = 6 * (wl * kl * kl * l_ + wm * km * km * m_ + ws * ks * ks * s_);
  S -= (f * f1) / (f1 * f1 - 0.5 * f * f2);
  return S;
}

function findCusp(a: number, b: number): [number, number] {
  const sCusp = computeMaxSaturation(a, b);
  const [r, g, bb] = oklabToLinearSrgb(1, sCusp * a, sCusp * b);
  const lCusp = Math.cbrt(1 / Math.max(r, g, bb));
  return [lCusp, lCusp * sCusp];
}

const CUSP_BINS = 1024;
const cuspCache = new Float64Array(CUSP_BINS * 2);
const cuspSeen = new Uint8Array(CUSP_BINS);

function cuspForHue(h: number): [number, number] {
  const bin = Math.min(
    CUSP_BINS - 1,
    Math.floor((((h % 1) + 1) % 1) * CUSP_BINS),
  );
  if (!cuspSeen[bin]) {
    const angle = (2 * Math.PI * (bin + 0.5)) / CUSP_BINS;
    const [lCusp, cCusp] = findCusp(Math.cos(angle), Math.sin(angle));
    cuspCache[bin * 2] = lCusp;
    cuspCache[bin * 2 + 1] = cCusp;
    cuspSeen[bin] = 1;
  }
  return [cuspCache[bin * 2], cuspCache[bin * 2 + 1]];
}

const S0 = 0.5;

function okhsvToLinearSrgb(
  h: number,
  s: number,
  v: number,
  cusp?: [number, number],
): [number, number, number] {
  if (v <= 0) return [0, 0, 0];
  const a_ = Math.cos(2 * Math.PI * h);
  const b_ = Math.sin(2 * Math.PI * h);
  const [cuspL, cuspC] = cusp ?? findCusp(a_, b_);
  const sMax = cuspC / cuspL;
  const tMax = cuspC / (1 - cuspL);
  const k = 1 - S0 / sMax;
  const denom = S0 + tMax - tMax * k * s;
  const lV = 1 - (s * S0) / denom;
  const cV = (s * tMax * S0) / denom;
  let L = v * lV;
  let C = v * cV;
  const lVt = toeInv(lV);
  const cVt = (cV * lVt) / lV;
  const lNew = toeInv(L);
  C = (C * lNew) / L;
  L = lNew;
  const [rs, gs, bs] = oklabToLinearSrgb(lVt, a_ * cVt, b_ * cVt);
  const scaleL = Math.cbrt(1 / Math.max(rs, gs, bs, 0));
  L *= scaleL;
  C *= scaleL;
  return oklabToLinearSrgb(L, C * a_, C * b_);
}

function hsvToHex({ h, s, v }: Hsv): string {
  const rgb = okhsvToLinearSrgb(h / 360, s / 100, v / 100);
  const channel = (x: number) =>
    Math.round(clamp(srgbTransfer(x), 0, 1) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(rgb[0])}${channel(rgb[1])}${channel(rgb[2])}`;
}

function hexToHsv(hex: string): Hsv {
  const value = parseInt(hex.slice(1), 16);
  const r = srgbTransferInv(((value >> 16) & 255) / 255);
  const g = srgbTransferInv(((value >> 8) & 255) / 255);
  const b = srgbTransferInv((value & 255) / 255);
  const [L, labA, labB] = linearSrgbToOklab(r, g, b);
  if (L <= 1e-6) return { h: 0, s: 0, v: 0 };
  const C = Math.hypot(labA, labB);
  if (C < 1e-6) return { h: 0, s: 0, v: clamp(toe(L), 0, 1) * 100 };
  const a_ = labA / C;
  const b_ = labB / C;
  const h = (Math.atan2(labB, labA) / (2 * Math.PI) + 1) % 1;
  const [cuspL, cuspC] = findCusp(a_, b_);
  const sMax = cuspC / cuspL;
  const tMax = cuspC / (1 - cuspL);
  const k = 1 - S0 / sMax;
  const t = tMax / (C + L * tMax);
  const lV = t * L;
  const cV = t * C;
  const lVt = toeInv(lV);
  const cVt = (cV * lVt) / lV;
  const [rs, gs, bs] = oklabToLinearSrgb(lVt, a_ * cVt, b_ * cVt);
  const scaleL = Math.cbrt(1 / Math.max(rs, gs, bs, 0));
  const toeL = toe(L / scaleL);
  const v = toeL / lV;
  const s = ((S0 + tMax) * cV) / (tMax * S0 + tMax * k * cV);
  return {
    h: h * 360,
    s: clamp(s, 0, 1) * 100,
    v: clamp(v, 0, 1) * 100,
  };
}

const THUMB_SHADOW = "0 0 0 1px rgba(0,0,0,0.14), 0 1px 3px rgba(0,0,0,0.25)";

function ColorDisc({
  hsv,
  onChange,
}: {
  hsv: Hsv;
  onChange: (next: Hsv) => void;
}) {
  const discRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dragging, setDragging] = useState(false);
  const reachRadius = DISC_RADIUS - THUMB_INSET;

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const size = Math.round(DISC_RADIUS * 2 * dpr);
    canvas.width = size;
    canvas.height = size;
    const image = ctx.createImageData(size, size);
    const data = image.data;
    const center = size / 2;
    const reach = (DISC_RADIUS - THUMB_INSET) * dpr;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x + 0.5 - center;
        const dy = y + 0.5 - center;
        const h = (Math.atan2(dy, dx) / (2 * Math.PI) + 1.25) % 1;
        const s = clamp(Math.hypot(dx, dy) / reach, 0, 1);
        const rgb = okhsvToLinearSrgb(h, s, 1, cuspForHue(h));
        const i = (y * size + x) * 4;
        data[i] = Math.round(clamp(srgbTransfer(rgb[0]), 0, 1) * 255);
        data[i + 1] = Math.round(clamp(srgbTransfer(rgb[1]), 0, 1) * 255);
        data[i + 2] = Math.round(clamp(srgbTransfer(rgb[2]), 0, 1) * 255);
        data[i + 3] = 255;
      }
    }
    const layer = document.createElement("canvas");
    layer.width = size;
    layer.height = size;
    layer.getContext("2d")?.putImageData(image, 0, 0);
    ctx.filter = `blur(${5 * dpr}px)`;
    ctx.drawImage(layer, 0, 0);
    ctx.filter = "none";
    ctx.globalCompositeOperation = "destination-in";
    ctx.beginPath();
    ctx.arc(center, center, center - 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";
  }, []);

  const fromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const rect = discRef.current?.getBoundingClientRect();
      if (!rect) return;
      const dx = clientX - rect.left - DISC_RADIUS;
      const dy = clientY - rect.top - DISC_RADIUS;
      const h = ((Math.atan2(dy, dx) * 180) / Math.PI + 90 + 360) % 360;
      const s = clamp(Math.hypot(dx, dy) / reachRadius, 0, 1) * 100;
      onChange({ ...hsv, h, s });
    },
    [hsv, onChange, reachRadius],
  );

  const handlePointerDown = (e: ReactPointerEvent) => {
    e.preventDefault();
    try {
      discRef.current?.setPointerCapture(e.pointerId);
    } catch {}
    setDragging(true);
    fromPointer(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: ReactPointerEvent) => {
    if (!dragging) return;
    if (e.pointerType === "mouse" && e.buttons === 0) {
      setDragging(false);
      return;
    }
    fromPointer(e.clientX, e.clientY);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    let dh = 0;
    let ds = 0;
    if (e.key === "ArrowRight") dh = 2;
    else if (e.key === "ArrowLeft") dh = -2;
    else if (e.key === "ArrowUp") ds = 2;
    else if (e.key === "ArrowDown") ds = -2;
    else return;
    e.preventDefault();
    onChange({
      ...hsv,
      h: (hsv.h + dh + 360) % 360,
      s: clamp(hsv.s + ds, 0, 100),
    });
  };

  const angle = ((hsv.h - 90) * Math.PI) / 180;
  const radius = (hsv.s / 100) * reachRadius;
  const thumbX = DISC_RADIUS + radius * Math.cos(angle);
  const thumbY = DISC_RADIUS + radius * Math.sin(angle);

  return (
    <div
      ref={discRef}
      role="slider"
      aria-label="Hue and saturation"
      aria-valuemin={0}
      aria-valuemax={360}
      aria-valuenow={Math.round(hsv.h)}
      aria-valuetext={`Hue ${Math.round(hsv.h)} degrees, saturation ${Math.round(hsv.s)}%`}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
      onLostPointerCapture={() => setDragging(false)}
      onKeyDown={handleKeyDown}
      className="relative mx-auto cursor-pointer rounded-full outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
      style={{
        width: DISC_RADIUS * 2,
        height: DISC_RADIUS * 2,
        touchAction: "none",
      }}
    >
      <canvas
        ref={canvasRef}
        aria-hidden
        className="pointer-events-none absolute inset-0 size-full rounded-full ring-1 ring-foreground/10 ring-inset"
      />
      <div
        className="pointer-events-none absolute size-4 rounded-full border-2 border-white transition-transform duration-150 ease-[cubic-bezier(0.23,1,0.32,1)] motion-reduce:transition-none"
        style={{
          left: thumbX,
          top: thumbY,
          background: hsvToHex(hsv),
          boxShadow: THUMB_SHADOW,
          transform: `translate(-50%, -50%) scale(${dragging ? 1.25 : 1})`,
        }}
      />
    </div>
  );
}

function bandPoint(t: number) {
  const angle = BAND_ANG_LEFT + t * (BAND_ANG_RIGHT - BAND_ANG_LEFT);
  return {
    x: WHEEL_CX + BAND_R * Math.cos(angle),
    y: WHEEL_CY + BAND_R * Math.sin(angle),
  };
}

function BrightnessBand({
  hsv,
  onChange,
}: {
  hsv: Hsv;
  onChange: (next: Hsv) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [dragging, setDragging] = useState(false);
  const gradientId = useId();

  const fromPointer = useCallback(
    (clientX: number, clientY: number) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const dx = clientX - rect.left - WHEEL_CX;
      const dy = clientY - rect.top - WHEEL_CY;
      let angle = Math.atan2(dy, dx);
      if (angle < -Math.PI / 2) angle += Math.PI * 2;
      const t = clamp(
        (BAND_ANG_LEFT - angle) / (BAND_ANG_LEFT - BAND_ANG_RIGHT),
        0,
        1,
      );
      onChange({ ...hsv, v: t * 100 });
    },
    [hsv, onChange],
  );

  const handlePointerDown = (e: ReactPointerEvent) => {
    e.preventDefault();
    try {
      svgRef.current?.setPointerCapture(e.pointerId);
    } catch {}
    setDragging(true);
    fromPointer(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: ReactPointerEvent) => {
    if (!dragging) return;
    if (e.pointerType === "mouse" && e.buttons === 0) {
      setDragging(false);
      return;
    }
    fromPointer(e.clientX, e.clientY);
  };

  const handleKeyDown = (e: KeyboardEvent<SVGElement>) => {
    let delta = 0;
    if (e.key === "ArrowRight" || e.key === "ArrowUp") delta = 2;
    else if (e.key === "ArrowLeft" || e.key === "ArrowDown") delta = -2;
    else if (e.key === "PageUp") delta = 10;
    else if (e.key === "PageDown") delta = -10;
    else if (e.key === "Home") delta = -hsv.v;
    else if (e.key === "End") delta = 100 - hsv.v;
    else return;
    e.preventDefault();
    onChange({ ...hsv, v: clamp(hsv.v + delta, 0, 100) });
  };

  const left = bandPoint(0);
  const right = bandPoint(1);
  const bandPath = `M ${left.x} ${left.y} A ${BAND_R} ${BAND_R} 0 0 0 ${right.x} ${right.y}`;
  const thumb = bandPoint(hsv.v / 100);

  return (
    <svg
      ref={svgRef}
      role="slider"
      aria-label="Brightness"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(hsv.v)}
      tabIndex={0}
      viewBox={`0 0 ${WHEEL_W} ${WHEEL_H}`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={() => setDragging(false)}
      onPointerCancel={() => setDragging(false)}
      onLostPointerCapture={() => setDragging(false)}
      onKeyDown={handleKeyDown}
      className="absolute inset-0 cursor-pointer rounded-2xl outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring"
      style={{
        width: WHEEL_W,
        height: WHEEL_H,
        touchAction: "none",
        pointerEvents: "none",
      }}
    >
      <defs>
        <linearGradient
          id={gradientId}
          gradientUnits="userSpaceOnUse"
          x1={left.x}
          y1={left.y}
          x2={right.x}
          y2={right.y}
        >
          <stop offset="0" stopColor="#000" />
          <stop offset="1" stopColor="#fff" />
        </linearGradient>
      </defs>
      <path
        d={bandPath}
        fill="none"
        strokeWidth={BAND_STROKE + 2}
        strokeLinecap="round"
        className="stroke-foreground/15"
      />
      <path
        d={bandPath}
        fill="none"
        stroke={`url(#${gradientId})`}
        strokeWidth={BAND_STROKE}
        strokeLinecap="round"
        style={{ pointerEvents: "stroke" }}
      />
      <path
        d={bandPath}
        fill="none"
        stroke="transparent"
        strokeWidth={BAND_STROKE + 10}
        strokeLinecap="round"
        style={{ pointerEvents: "stroke" }}
      />
      <circle
        cx={thumb.x}
        cy={thumb.y}
        r={dragging ? 9 : 7.5}
        fill={hsvToHex({ h: hsv.h, s: 0, v: hsv.v })}
        stroke="#fff"
        strokeWidth={2}
        style={{
          pointerEvents: "none",
          transition: "r 150ms cubic-bezier(0.23, 1, 0.32, 1)",
          filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.35))",
        }}
      />
    </svg>
  );
}

const emptySubscribe = () => () => {};

interface EyeDropperConstructor {
  new (): { open(): Promise<{ sRGBHex: string }> };
}

function useEyeDropper(): EyeDropperConstructor | null {
  return useSyncExternalStore(
    emptySubscribe,
    () => (window as { EyeDropper?: EyeDropperConstructor }).EyeDropper ?? null,
    () => null,
  );
}

export function ColorPopover({
  id,
  anchorRef,
  value,
  onValueChange,
  onClose,
}: {
  id: string;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  value: string;
  onValueChange: (hex: string) => void;
  onClose: () => void;
}) {
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{
    top: number;
    left: number;
    origin: string;
  } | null>(null);
  const shouldReduceMotion = useReducedMotion();
  const eyeDropper = useEyeDropper();
  const portalTarget = useContext(DemoPortalContext);

  const initial = normalizeHex(value) ?? "#ffffff";
  const [state, setState] = useState<{ hsv: Hsv; draft: string; seen: string }>(
    () => ({ hsv: hexToHsv(initial), draft: initial, seen: initial }),
  );

  const incoming = normalizeHex(value);
  if (incoming && incoming !== state.seen) {
    setState({ hsv: hexToHsv(incoming), draft: incoming, seen: incoming });
  }

  const apply = (next: Hsv) => {
    const hex = hsvToHex(next);
    setState({ hsv: next, draft: hex, seen: hex });
    onValueChange(hex);
  };

  const commitDraft = () => {
    const hex = normalizeHex(state.draft);
    if (hex && hex !== hsvToHex(state.hsv)) {
      apply(hexToHsv(hex));
    } else {
      setState((prev) => ({ ...prev, draft: hsvToHex(prev.hsv) }));
    }
  };

  const place = useCallback(() => {
    const anchor = anchorRef.current;
    const pop = popRef.current;
    if (!anchor || !pop) return;
    const rect = anchor.getBoundingClientRect();
    const height = pop.offsetHeight;
    const left = clamp(
      rect.right - POPOVER_WIDTH,
      8,
      window.innerWidth - POPOVER_WIDTH - 8,
    );
    let top = rect.bottom + 8;
    let origin = "top right";
    if (top + height > window.innerHeight - 8) {
      top = Math.max(8, rect.top - 8 - height);
      origin = "bottom right";
    }
    setPos({ top, left, origin });
  }, [anchorRef]);

  useLayoutEffect(() => {
    place();
  }, [place]);

  useEffect(() => {
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [place]);

  useEffect(() => {
    popRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const handleDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (
        !popRef.current?.contains(target) &&
        !anchorRef.current?.contains(target)
      ) {
        onClose();
      }
    };
    document.addEventListener("pointerdown", handleDown);
    return () => document.removeEventListener("pointerdown", handleDown);
  }, [anchorRef, onClose]);

  return createPortal(
    <motion.div
      ref={popRef}
      id={id}
      role="dialog"
      aria-label="Color picker"
      tabIndex={-1}
      initial={
        shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.82 }
      }
      animate={{ opacity: 1, scale: 1 }}
      exit={
        shouldReduceMotion
          ? { opacity: 0, transition: { duration: 0.12 } }
          : {
              opacity: 0,
              scale: 0.9,
              transition: { duration: 0.14, ease: EASE },
            }
      }
      transition={{ type: "spring", duration: 0.4, bounce: 0 }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          onClose();
        }
      }}
      className="fixed z-[60] flex flex-col gap-2 rounded-t-[94px] rounded-b-2xl border border-border bg-popover/95 px-3 pt-2.5 pb-3 shadow-[var(--shadow-popover)] backdrop-blur-xl outline-none"
      style={{
        width: POPOVER_WIDTH,
        top: pos?.top ?? -9999,
        left: pos?.left ?? -9999,
        transformOrigin: pos?.origin,
      }}
    >
      <div
        className="relative -mx-2"
        style={{ width: WHEEL_W, height: WHEEL_H }}
      >
        <motion.div
          initial={
            shouldReduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.85 }
          }
          animate={{ opacity: 1, scale: 1 }}
          transition={{
            type: "spring",
            duration: 0.45,
            bounce: 0,
            delay: 0.05,
          }}
          className="absolute inset-x-0 top-0"
          style={{ height: DISC_RADIUS * 2 }}
        >
          <ColorDisc hsv={state.hsv} onChange={apply} />
        </motion.div>
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            WebkitMaskImage: `radial-gradient(circle at ${WHEEL_CX}px ${WHEEL_CY}px, transparent ${DISC_RADIUS}px, black ${DISC_RADIUS + 1}px)`,
            maskImage: `radial-gradient(circle at ${WHEEL_CX}px ${WHEEL_CY}px, transparent ${DISC_RADIUS}px, black ${DISC_RADIUS + 1}px)`,
          }}
        >
          <motion.div
            initial={
              shouldReduceMotion ? { opacity: 0 } : { y: -18, scale: 0.85 }
            }
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{
              type: "spring",
              duration: 0.5,
              bounce: 0,
              delay: 0.16,
            }}
            className="pointer-events-none absolute inset-0"
          >
            <BrightnessBand hsv={state.hsv} onChange={apply} />
          </motion.div>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          value={state.draft}
          onChange={(e) =>
            setState((prev) => ({ ...prev, draft: e.target.value }))
          }
          onBlur={commitDraft}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          aria-label="Hex color"
          spellCheck={false}
          autoComplete="off"
          className="h-7 w-full min-w-0 rounded-md bg-muted/70 px-2 text-[12px] font-medium text-foreground/90 outline-none transition-colors hover:bg-muted focus:bg-muted"
          style={{ fontVariantNumeric: "tabular-nums" }}
        />
        {eyeDropper && (
          <button
            type="button"
            aria-label="Pick a color from the screen"
            title="Pick a color from the screen"
            onClick={() => {
              new eyeDropper()
                .open()
                .then((result) => {
                  const hex = normalizeHex(result.sRGBHex);
                  if (hex) apply(hexToHsv(hex));
                })
                .catch(() => {});
            }}
            className="inline-flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md bg-muted/70 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <Pipette aria-hidden className="size-3.5" />
          </button>
        )}
      </div>
    </motion.div>,
    portalTarget ?? document.body,
  );
}

export function ColorRow({
  label,
  value,
  onValueChange,
  displayValue,
  onReset,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  displayValue?: string;
  onReset?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const popoverId = useId();

  const close = useCallback(() => {
    setOpen(false);
    toggleRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="flex h-8 w-full shrink-0 items-center justify-between rounded-control bg-muted/60 px-3 transition-colors select-none hover:bg-muted/80">
      <span className="text-[12.5px] font-medium text-foreground/90">
        {label}
      </span>
      <span className="flex items-center gap-2">
        {onReset && (
          <button
            type="button"
            onClick={onReset}
            aria-label={`Reset ${label}`}
            title="Reset"
            className="inline-flex size-5 cursor-pointer items-center justify-center rounded-[6px] text-muted-foreground/60 transition-colors hover:bg-foreground/10 hover:text-foreground"
          >
            <RotateCcw aria-hidden className="size-3" />
          </button>
        )}
        <button
          ref={toggleRef}
          type="button"
          aria-expanded={open}
          aria-haspopup="dialog"
          aria-controls={open ? popoverId : undefined}
          aria-label={`${label} color`}
          onClick={() => setOpen((prev) => !prev)}
          className="flex cursor-pointer items-center gap-2 transition-transform active:scale-95"
        >
          <span
            className="text-[12.5px] font-medium text-muted-foreground"
            style={{ fontVariantNumeric: "tabular-nums" }}
          >
            {displayValue ?? value}
          </span>
          <span
            className="size-4.5 rounded-[5px] border border-border-strong"
            style={{ background: value }}
          />
        </button>
      </span>
      <AnimatePresence>
        {open && (
          <ColorPopover
            id={popoverId}
            anchorRef={toggleRef}
            value={value}
            onValueChange={onValueChange}
            onClose={close}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
