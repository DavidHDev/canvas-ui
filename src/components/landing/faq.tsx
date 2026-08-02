"use client";

import { useState } from "react";
import { Plus } from "lucide-react";

import { Reveal } from "@/components/landing/reveal";
import { Stitches } from "@/components/landing/stitches";
import { cn } from "@/lib/utils";

const ITEMS = [
  {
    question: "Is Canvas UI free to use?",
    answer:
      "Yes. Canvas UI is licensed under MIT + Commons Clause: use every component in any personal or commercial app or website, free forever. The only restriction is reselling or redistributing the components themselves, whether alone, in a bundle, or as a port.",
  },
  {
    question: "Which browsers are supported?",
    answer:
      "Components that draw live HTML on canvas rely on an experimental browser capability, available today in Chrome behind a flag. Everywhere else they degrade gracefully: your content renders as regular HTML, and effects like Blaze, Liquid, Laser, Clouds, Bubble, Droplets, Glass, Magnify, Grid, and Ripple keep running as a pure WebGL overlay on top of it. WebGL-based components work in every modern browser.",
  },
  {
    question: "Will it slow my site down?",
    answer:
      "The effects render on the GPU via WebGL and animate outside React's render cycle. Each component initializes only when mounted, pauses when off-screen, and cleans up fully on unmount. Reduced-motion preferences are respected.",
  },
  {
    question: "Do I need React?",
    answer:
      "No. Every component ships in seven flavors: React, Solid, Preact, Vue, Svelte, Angular, and dependency-free vanilla TypeScript. Same engine and the same options in all of them.",
  },
  {
    question: "How do updates work?",
    answer:
      "The code is copied into your repo, so nothing updates from under you. When a component improves, re-run the install command to pull the latest version, or just keep your copy and evolve it yourself.",
  },
];

function FaqItem({
  item,
  open,
  onToggle,
}: {
  item: (typeof ITEMS)[number];
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-b border-dashed border-border/60">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-4 py-5 text-left"
      >
        <span className="text-[15px] font-medium tracking-tight sm:text-base">
          {item.question}
        </span>
        <Plus
          aria-hidden
          strokeWidth={2}
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform duration-200 ease-out motion-reduce:transition-none",
            open && "rotate-45",
          )}
        />
      </button>
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-300 motion-reduce:transition-none",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
        style={{ transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)" }}
      >
        <div className="overflow-hidden">
          <p
            className={cn(
              "max-w-2xl pb-5 text-sm leading-6 text-muted-foreground transition-opacity duration-200",
              open ? "opacity-100" : "opacity-0",
            )}
          >
            {item.answer}
          </p>
        </div>
      </div>
    </div>
  );
}

export function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section
      aria-labelledby="faq-heading"
      className="relative border-t border-dashed border-border/60"
    >
      <Stitches />
      <div className="w-full px-5 py-24 sm:px-8 sm:py-32">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-[1fr_1.2fr] lg:gap-16">
          <Reveal>
            <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
              FAQ
            </p>
            <h2
              id="faq-heading"
              className="mt-3 text-3xl font-medium tracking-tighter text-balance sm:text-4xl"
            >
              Good questions.
            </h2>
          </Reveal>
          <Reveal delay={100}>
            <div className="-mt-5">
              {ITEMS.map((item, index) => (
                <FaqItem
                  key={item.question}
                  item={item}
                  open={openIndex === index}
                  onToggle={() =>
                    setOpenIndex(openIndex === index ? null : index)
                  }
                />
              ))}
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
