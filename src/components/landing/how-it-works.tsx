"use client";

import { useEffect, useRef, useState } from "react";
import { MousePointer2 } from "@/components/icons";

import { Reveal } from "@/components/landing/reveal";

const TYPED = "npx shadcn@latest add @canvas-ui/particle-reveal-react";
const PHASE_MS = 5200;

const STEPS = [
  {
    index: "01",
    title: "Pick a component",
    body: "Browse the library and find the effect that fits. Every demo on this site is the real component, running live.",
    window: "canvasui.dev/components",
  },
  {
    index: "02",
    title: "Run one command",
    body: "The shadcn CLI pulls the full source into your project. No package to install, no version to pin.",
    window: "zsh",
  },
  {
    index: "03",
    title: "Make it yours",
    body: "The code lives in your repo from day one. Tune the props, restyle it, or rip it apart. It's yours.",
    window: "hero.tsx",
  },
];

const TILES = ["Blaze", "Liquid", "Glass", "Shatter", "Particle Reveal", "VHS"];

function PickStage() {
  return (
    <div className="hiw-phase-enter relative grid h-full grid-cols-3 grid-rows-2 gap-2 p-3">
      {TILES.map((name, index) => (
        <div
          key={name}
          className={`flex items-center justify-center rounded-md bg-muted/45 px-2 text-center text-xs text-muted-foreground ${
            index === 4 ? "hiw-tile-selected" : ""
          }`}
        >
          {name}
        </div>
      ))}
      <MousePointer2
        aria-hidden
        className="hiw-cursor absolute top-[72%] left-1/2 size-4 fill-foreground text-foreground drop-shadow-sm"
      />
    </div>
  );
}

function TerminalStage() {
  return (
    <div className="hiw-phase-enter flex h-full flex-col gap-1.5 overflow-hidden p-4 font-mono text-[11px] leading-6 tracking-[-0.02em] sm:text-xs">
      <div className="flex overflow-hidden whitespace-nowrap">
        <span className="shrink-0 text-muted-foreground">$&nbsp;</span>
        <span
          className="hiw-type"
          style={{ "--hiw-type-width": "52ch" } as React.CSSProperties}
        >
          {TYPED}
        </span>
        <span className="hiw-caret shrink-0 text-foreground/70">▍</span>
      </div>
      <div className="hiw-line" style={{ animationDelay: "2150ms" }}>
        <span className="text-muted-foreground">✓</span> Found particle-reveal
        in <span className="text-foreground">@canvas-ui</span>
      </div>
      <div className="hiw-line" style={{ animationDelay: "2600ms" }}>
        <span className="text-muted-foreground">✓</span> ParticleReveal.tsx
        added to components/canvasui
      </div>
      <div
        className="hiw-line text-muted-foreground"
        style={{ animationDelay: "3050ms" }}
      >
        Done in 1.4s
      </div>
    </div>
  );
}

function EditStage() {
  return (
    <div className="hiw-phase-enter h-full overflow-hidden p-4 font-mono text-[11px] leading-6 whitespace-pre text-foreground/85 sm:text-[12.5px]">
      <div>
        <span className="text-muted-foreground">{"import"}</span>
        {" { ParticleReveal } "}
        <span className="text-muted-foreground">{"from"}</span>
        {' "@/components/canvasui/ParticleReveal";'}
      </div>
      <div>&nbsp;</div>
      <div>
        <span className="text-muted-foreground">{"export function"}</span>
        {" Hero() {"}
      </div>
      <div>
        {"  "}
        <span className="text-muted-foreground">{"return"}</span>
        {" ("}
      </div>
      <div className="hiw-flash-line">
        {"    <ParticleReveal radius={"}
        <span className="hiw-swap inline-grid">
          <span className="hiw-swap-old">500</span>
          <span className="hiw-swap-new">900</span>
        </span>
        {"} bend={100}>"}
      </div>
      <div>{'      <img src="/hero.jpg" alt="" />'}</div>
      <div>{"    </ParticleReveal>"}</div>
      <div>{"  );"}</div>
      <div>{"}"}</div>
    </div>
  );
}

export function HowItWorks() {
  const [phase, setPhase] = useState(0);
  const [tick, setTick] = useState(0);
  const [inView, setInView] = useState(false);
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => setInView(entry.isIntersecting),
      { threshold: 0.3 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!inView) return;
    const timer = setTimeout(() => {
      setPhase((current) => (current + 1) % STEPS.length);
      setTick((current) => current + 1);
    }, PHASE_MS);
    return () => clearTimeout(timer);
  }, [phase, tick, inView]);

  const goTo = (index: number) => {
    setPhase(index);
    setTick((current) => current + 1);
  };

  return (
    <section
      aria-labelledby="how-it-works-heading"
      className="relative"
    >
      <div className="w-full px-5 py-24 sm:px-8 sm:py-32">
        <Reveal>
          <h2
            id="how-it-works-heading"
            className="text-3xl font-medium tracking-tighter text-balance sm:text-4xl"
          >
            Copy, paste, ship.
          </h2>
        </Reveal>

        <Reveal
          delay={80}
          className="mt-12 grid grid-cols-1 items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:gap-16"
        >
          <ol className="order-2 flex flex-col gap-2 lg:order-1">
            {STEPS.map((step, index) => {
              const active = phase === index;
              return (
                <li key={step.index}>
                  <button
                    type="button"
                    onClick={() => goTo(index)}
                    aria-current={active ? "step" : undefined}
                    className={`relative w-full cursor-pointer overflow-hidden rounded-frame px-5 py-4 text-left transition-colors duration-200 ease-out ${
                      active ? "bg-muted/70" : "bg-muted/35 hover:bg-muted/55"
                    }`}
                  >
                    {active && (
                      <span
                        key={`${phase}-${tick}`}
                        aria-hidden
                        className="hiw-progress absolute inset-0 bg-foreground/[0.045]"
                        style={{
                          animationDuration: `${PHASE_MS}ms`,
                          animationPlayState: inView ? "running" : "paused",
                        }}
                      />
                    )}
                    <span className="relative block">
                      <span
                        className={`block font-mono text-sm transition-colors duration-200 ${
                          active ? "text-foreground" : "text-muted-foreground/70"
                        }`}
                      >
                        {step.index}
                      </span>
                      <span
                        className={`mt-1.5 block text-lg font-medium tracking-tight transition-colors duration-200 ${
                          active ? "text-foreground" : "text-muted-foreground"
                        }`}
                      >
                        {step.title}
                      </span>
                      <span
                        className={`grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.23,1,0.32,1)] ${
                          active ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                        }`}
                      >
                        <span className="overflow-hidden">
                          <span
                            className={`block max-w-sm pt-2 text-sm leading-6 text-muted-foreground transition-opacity duration-300 ${
                              active ? "opacity-100" : "opacity-0"
                            }`}
                          >
                            {step.body}
                          </span>
                        </span>
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ol>

          <div
            ref={stageRef}
            className="order-1 min-w-0 frame pt-0 lg:order-2"
          >
            <div className="flex items-center gap-2 px-3 py-2">
              <span className="font-mono text-[11px] text-muted-foreground">
                {STEPS[phase].window}
              </span>
            </div>
            <div className="h-64 min-w-0 overflow-hidden frame-inset bg-background sm:h-72">
              {phase === 0 && <PickStage key={tick} />}
              {phase === 1 && <TerminalStage key={tick} />}
              {phase === 2 && <EditStage key={tick} />}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
