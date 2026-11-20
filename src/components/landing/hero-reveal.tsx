"use client";

import { useTheme } from "next-themes";
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";

import { ParticleReveal } from "@/components/docs/live/ParticleReveal";
import { supportsHtmlInCanvas } from "@/lib/ParticleReveal/ParticleRevealVanilla";

const emptySubscribe = () => () => {};

function FallbackVideo() {
  const { resolvedTheme } = useTheme();
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const tone = !mounted
    ? null
    : resolvedTheme === "light"
      ? "light"
      : resolvedTheme === "dark"
        ? "dark"
        : null;

  return (
    <>
      <div
        aria-hidden
        className="absolute inset-0 bg-[url(/assets/fallback-hero-poster-light.jpg)] bg-cover bg-center dark:bg-[url(/assets/fallback-hero-poster-dark.jpg)]"
      />
      {tone ? (
        <video
          key={tone}
          src={`/assets/fallback-hero-${tone}.mp4`}
          autoPlay
          muted
          loop
          playsInline
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : null}
    </>
  );
}

export function HeroReveal({
  background,
  children,
}: {
  background: ReactNode;
  children: ReactNode;
}) {
  const hostRef = useRef<HTMLDivElement>(null);

  const native = useSyncExternalStore(
    emptySubscribe,
    supportsHtmlInCanvas,
    () => false,
  );

  useEffect(() => {
    if (!native) return;
    const host = hostRef.current;
    if (!host) return;
    const target = host.firstElementChild;
    if (!(target instanceof HTMLElement)) return;

    let raf = 0;
    let userActive = false;
    let t = Math.random() * 100;
    let last = performance.now();
    let inView = true;
    let running = false;
    const reducedMotionQuery = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    let reducedMotion = reducedMotionQuery.matches;
    let hostRect = host.getBoundingClientRect();

    const updateHostRect = () => {
      hostRect = host.getBoundingClientRect();
    };

    const resizeObserver = new ResizeObserver(updateHostRect);
    resizeObserver.observe(host);
    window.addEventListener("resize", updateHostRect);
    window.addEventListener("scroll", updateHostRect, { passive: true });

    const stop = () => {
      if (!running) return;
      running = false;
      cancelAnimationFrame(raf);
    };

    const start = () => {
      if (reducedMotion || running || !inView || document.hidden) return;
      running = true;
      last = performance.now();
      raf = requestAnimationFrame(tick);
    };

    const onMove = (event: PointerEvent) => {
      if (event.isTrusted) {
        userActive = true;
        stop();
      }
    };
    const onLeave = (event: PointerEvent) => {
      if (event.isTrusted) {
        userActive = false;
        start();
      }
    };
    host.addEventListener("pointermove", onMove, true);
    host.addEventListener("pointerleave", onLeave, true);

    const tick = (now: number) => {
      if (!inView || document.hidden || reducedMotion || userActive) {
        running = false;
        return;
      }
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      if (!userActive) {
        t += dt;
        const nx =
          0.5 + 0.34 * Math.sin(t * 0.37) + 0.14 * Math.sin(t * 0.93 + 1.7);
        const ny =
          0.5 +
          0.3 * Math.sin(t * 0.53 + 0.8) +
          0.14 * Math.sin(t * 1.19 + 4.1);
        target.dispatchEvent(
          new PointerEvent("pointermove", {
            bubbles: true,
            clientX: hostRect.left + hostRect.width * nx,
            clientY: hostRect.top + hostRect.height * ny,
          }),
        );
      }
      raf = requestAnimationFrame(tick);
    };

    const observer = new IntersectionObserver((entries) => {
      inView = entries[entries.length - 1]?.isIntersecting ?? true;
      if (inView) {
        start();
      } else {
        stop();
      }
    });
    observer.observe(host);

    const onVisibilityChange = () => {
      if (document.hidden) {
        stop();
      } else {
        start();
      }
    };
    const onMotionChange = () => {
      reducedMotion = reducedMotionQuery.matches;
      if (reducedMotion) stop();
      else start();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    reducedMotionQuery.addEventListener("change", onMotionChange);

    start();

    return () => {
      stop();
      observer.disconnect();
      resizeObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      reducedMotionQuery.removeEventListener("change", onMotionChange);
      window.removeEventListener("resize", updateHostRect);
      window.removeEventListener("scroll", updateHostRect);
      host.removeEventListener("pointermove", onMove, true);
      host.removeEventListener("pointerleave", onLeave, true);
    };
  }, [native]);

  if (!native) {
    return (
      <div className="absolute inset-0">
        <FallbackVideo />
        {children}
      </div>
    );
  }

  return (
    <div ref={hostRef} className="absolute inset-0">
      <ParticleReveal
        radius={700}
        softness={0.55}
        size={1}
        scatter={0}
        drift={2}
        aberration={70}
        bend={100}
        fade={1}
        threshold={0}
        smoothing={0.5}
        style={{ position: "absolute", inset: 0 }}
      >
        {background}
        {children}
      </ParticleReveal>
    </div>
  );
}
