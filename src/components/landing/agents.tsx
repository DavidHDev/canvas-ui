"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ArrowUp, Check, Loader2, Terminal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Reveal } from "@/components/landing/reveal";
import { Stitches } from "@/components/landing/stitches";

const ADD_COMMAND =
  "npx shadcn@latest add @canvas-ui/particle-reveal-react";

const STAGE_AT = [0, 700, 1800, 3200, 4000];

function useStagedPlayback(active: boolean) {
  const [stage, setStage] = useState(0);
  useEffect(() => {
    if (!active) return;
    const timers = STAGE_AT.slice(1).map((at, index) =>
      setTimeout(() => setStage(index + 1), at),
    );
    return () => timers.forEach(clearTimeout);
  }, [active]);
  return stage;
}

function Msg({
  shown,
  children,
  className = "",
}: {
  shown: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`agents-msg ${className}`} data-shown={shown || undefined}>
      {children}
    </div>
  );
}

export function Agents() {
  const cardRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = cardRef.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.45 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const stage = useStagedPlayback(inView);

  return (
    <section
      aria-labelledby="agents-heading"
      className="relative border-t border-dashed border-border/60"
    >
      <Stitches />
      <div className="w-full px-5 py-24 sm:px-8 sm:py-32">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[1.2fr_1fr] lg:gap-16">
          <Reveal className="order-2 lg:order-1">
            <div
              ref={cardRef}
              className="rounded-xl border border-border/60 bg-muted/30 px-2 pb-2"
            >
              <div className="flex items-center justify-between px-2 py-2">
                <p className="text-sm font-medium">Agent</p>
                <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span
                    aria-hidden
                    className="size-1.5 animate-pulse rounded-full bg-foreground/70"
                  />
                  MCP connected
                </span>
              </div>

              <div className="overflow-hidden rounded-lg border border-dashed border-border/70 bg-background">
                <div className="flex min-h-72 flex-col gap-4 px-4 py-5 sm:px-5">
                  <Msg shown={stage >= 0} className="flex justify-end">
                    <p className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-4 py-2.5 text-sm leading-6 text-primary-foreground">
                      Add a particle reveal effect to my hero section
                    </p>
                  </Msg>

                  <Msg shown={stage >= 1}>
                    <p className="max-w-[85%] text-sm leading-6 text-muted-foreground">
                      Found{" "}
                      <span className="text-foreground">particle-reveal</span>{" "}
                      in the Canvas UI registry. Installing it now.
                    </p>
                  </Msg>

                  <Msg shown={stage >= 2}>
                    <div className="w-full rounded-lg border border-border/60 bg-muted/30 p-1.5">
                      <div className="flex items-center justify-between gap-3 px-1.5 py-1">
                        <span className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
                          <Terminal aria-hidden className="size-3" />
                          shadcn CLI
                        </span>
                        {stage >= 3 ? (
                          <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                            <Check aria-hidden className="size-3" />
                            Installed
                          </span>
                        ) : (
                          <Loader2
                            aria-label="Installing"
                            className="size-3.5 animate-spin text-muted-foreground"
                          />
                        )}
                      </div>
                      <p className="overflow-hidden rounded-md border border-dashed border-border/70 bg-background px-2.5 py-2 font-mono text-xs whitespace-nowrap text-foreground/90">
                        {ADD_COMMAND}
                      </p>
                    </div>
                  </Msg>

                  <Msg shown={stage >= 4}>
                    <p className="max-w-[85%] text-sm leading-6 text-muted-foreground">
                      Done.{" "}
                      <span className="text-foreground">
                        ParticleReveal.tsx
                      </span>{" "}
                      is now wired into your hero.
                    </p>
                  </Msg>
                </div>

                <div className="px-3 pb-3">
                  <div aria-hidden className="flex items-center gap-2">
                    <Input
                      readOnly
                      tabIndex={-1}
                      placeholder="Ask your agent anything…"
                      className="pointer-events-none rounded-md bg-muted/30"
                    />
                    <Button
                      size="icon"
                      tabIndex={-1}
                      className="pointer-events-none shrink-0 rounded-md"
                    >
                      <ArrowUp />
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </Reveal>

          <Reveal delay={100} className="order-1 lg:order-2">
            <h2
              id="agents-heading"
              className="text-3xl font-medium tracking-tighter text-balance sm:text-4xl"
            >
              Built for agents.
            </h2>
            <p className="mt-4 max-w-md text-base leading-7 text-muted-foreground">
              The registry speaks the shadcn protocol, so any assistant with the
              shadcn MCP server can browse the library, read the docs, and
              install components, all from a single prompt.
            </p>
            <Link
              href="/docs/mcp"
              className="group mt-6 inline-flex items-center gap-1.5 text-[15px] font-medium text-foreground transition-colors duration-150 hover:text-muted-foreground"
            >
              Set up the MCP server
              <ArrowRight
                aria-hidden
                strokeWidth={2.25}
                className="size-[15px] transition-transform duration-200 ease-out group-hover:translate-x-0.5 motion-reduce:transition-none"
              />
            </Link>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
