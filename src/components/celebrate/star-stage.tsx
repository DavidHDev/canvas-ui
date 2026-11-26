"use client";

import { useEffect, useImperativeHandle, useState, type Ref } from "react";

import { Blaze } from "@/lib/Blaze/Blaze";
import { FlameWrap } from "@/lib/FlameWrap/FlameWrap";
import { hexToRgb, lighten } from "@/lib/celebrate";

const DESIGN_W = 960;

const CARD_W = 520;
const CARD_H = 264;

const IDLE_MS = 700;
const COUNT_MS = 4800;
const TAIL_MS = 1800;

export const RUN_MS = IDLE_MS + COUNT_MS + TAIL_MS;

const FULL_HEAT_STARS = 4000;

const MIN_CEILING = 0.55;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export interface StarStageHandle {
  restart: () => void;
  getOutputCanvas: () => HTMLCanvasElement | null;
}

export interface StarStageProps {
  stars: number;
  slug: string;
  hex: string;
  ref?: Ref<StarStageHandle>;
}

export function StarStage({ stars, slug, hex, ref }: StarStageProps) {
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(DESIGN_W);
  const [runId, setRunId] = useState(0);
  const [{ count, heat, burst }, setFrame] = useState({
    count: 0,
    heat: 0,
    burst: 0,
  });

  useImperativeHandle(ref, () => ({
    restart: () => setRunId((n) => n + 1),
    getOutputCanvas: () => {
      const blazeRoot = root?.firstElementChild;
      return (
        blazeRoot?.querySelector<HTMLCanvasElement>(
          ":scope > canvas:not([layoutsubtree])",
        ) ?? null
      );
    },
  }));

  useEffect(() => {
    if (!root) return;
    const observer = new ResizeObserver(([entry]) =>
      setWidth(entry.contentRect.width),
    );
    observer.observe(root);
    return () => observer.disconnect();
  }, [root]);

  useEffect(() => {
    let raf = 0;
    const start = performance.now();

    const ceiling = lerp(MIN_CEILING, 1, Math.min(stars / FULL_HEAT_STARS, 1));

    const tick = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(Math.max((elapsed - IDLE_MS) / COUNT_MS, 0), 1);
      const p = easeInOutCubic(t);
      const since = elapsed - IDLE_MS - COUNT_MS;
      setFrame({
        count: Math.round(p * stars),
        heat: Math.pow(p, 1.5) * ceiling,
        burst: (since >= 0 ? Math.exp(-since / 460) : 0) * ceiling,
      });
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [runId, stars]);

  const flame = hexToRgb(hex);
  const css = ([r, g, b]: [number, number, number], k = 1) =>
    `rgb(${Math.round(r * k * 255)} ${Math.round(g * k * 255)} ${Math.round(b * k * 255)})`;
  const ramp = [
    css(flame, 0.1),
    css(flame, 0.5),
    css(flame),
    css(lighten(flame, 0.35)),
    css(lighten(flame, 0.8)),
  ];

  const scale = width / DESIGN_W;
  const px = (value: number) => value * scale;

  const formatted = count.toLocaleString("en-US");
  const baseNumber =
    formatted.length <= 5 ? 108 : formatted.length <= 7 ? 84 : 66;

  return (
    <div
      ref={setRoot}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
      }}
    >
      <Blaze
        layer="page"
        height={lerp(0.18, 0.62, heat)}
        intensity={lerp(0.35, 1, heat)}
        speed={lerp(0.5, 1.35, heat)}
        haze={lerp(0, 0.8, heat)}
        turbulence={0.55}
        sparks={Math.min(1, lerp(0, 0.9, heat) + burst * 0.4)}
        sparkSize={1.1}
        smoke={lerp(0, 0.5, heat)}
        glow={Math.min(1, lerp(0.2, 0.9, heat) + burst * 0.3)}
        colors={ramp}
        style={{ position: "absolute", inset: 0 }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: "100%",
            background:
              "radial-gradient(120% 90% at 50% 42%, #16264d 0%, #0b1224 45%, #05070f 100%)",
          }}
        >
          <FlameWrap
            color={flame}
            intensity={lerp(0.12, 1.5, heat) + burst * 0.7}
            height={px(110)}
            spread={0}
            radius={px(24)}
            speed={lerp(0.22, 0.7, heat)}
            scale={0.75}
            turbulence={lerp(0.35, 0.7, heat)}
            turbulenceScale={0.6}
            turbulenceReach={px(lerp(10, 28, heat))}
            sparks={lerp(0.3, 2.2, heat) + burst}
            sparkSize={0.4}
            sparkDensity={lerp(0.5, 1.7, heat)}
            sparkSpeed={lerp(0.7, 1.5, heat)}
            rim={lerp(0.8, 2.6, heat)}
            melt={px(lerp(1, 4.5, heat))}
            distortion={px(lerp(2, 11, heat))}
            smoke={lerp(0.2, 1.3, heat)}
            ember={lerp(0.2, 1.5, heat)}
            scorch={lerp(0, 0.5, heat)}
            style={{ width: px(CARD_W), height: px(CARD_H), marginTop: px(64) }}
          >
            <div
              style={{
                position: "relative",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
                height: "100%",
                boxSizing: "border-box",
                padding: `${px(40)}px ${px(44)}px`,
                borderRadius: px(24),
                border: "1px solid rgba(125,165,255,0.2)",
                background:
                  "linear-gradient(180deg, rgba(16,26,54,0.92) 0%, rgba(8,13,30,0.94) 100%)",
              }}
            >
              <div
                style={{
                  fontSize: px(baseNumber),
                  lineHeight: 0.92,
                  fontWeight: 500,
                  letterSpacing: "-0.055em",
                  fontVariantNumeric: "tabular-nums",
                  color: "#ffffff",
                  transform: `scale(${(1 + burst * 0.045).toFixed(4)})`,
                }}
              >
                {formatted}
              </div>

              <div
                style={{
                  marginTop: px(12),
                  fontSize: px(16),
                  fontWeight: 450,
                  letterSpacing: "-0.01em",
                  color: "rgba(196,215,255,0.66)",
                }}
              >
                Stars on GitHub
              </div>

              <div
                style={{
                  position: "absolute",
                  left: px(24),
                  bottom: px(18),
                  fontSize: px(13),
                  letterSpacing: "-0.005em",
                  color: "rgba(190,212,255,0.45)",
                }}
              >
                {slug}
              </div>
            </div>
          </FlameWrap>
        </div>
      </Blaze>
    </div>
  );
}
