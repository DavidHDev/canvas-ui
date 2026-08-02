import { highlight } from "@/components/docs/highlight";
import { FrameworkTabs } from "@/components/landing/framework-tabs";
import { Reveal } from "@/components/landing/reveal";
import { Stitches } from "@/components/landing/stitches";

const SNIPPETS = [
  {
    id: "react",
    label: "React",
    fileName: "hero.tsx",
    lang: "tsx",
    source: `import { ParticleReveal } from "@/components/canvasui/ParticleReveal";

export function Hero() {
  return (
    <ParticleReveal radius={300}>
      <YourContent />
    </ParticleReveal>
  );
}`,
  },
  {
    id: "vue",
    label: "Vue",
    fileName: "Hero.vue",
    lang: "vue",
    source: `<script setup lang="ts">
import ParticleReveal from "@/components/canvasui/ParticleReveal.vue";
</script>

<template>
  <ParticleReveal :radius="300">
    <YourContent />
  </ParticleReveal>
</template>`,
  },
  {
    id: "svelte",
    label: "Svelte",
    fileName: "Hero.svelte",
    lang: "svelte",
    source: `<script lang="ts">
  import ParticleReveal from "$lib/components/canvasui/ParticleReveal.svelte";
</script>

<ParticleReveal radius={300}>
  <YourContent />
</ParticleReveal>`,
  },
  {
    id: "solid",
    label: "Solid",
    fileName: "hero.tsx",
    lang: "tsx",
    source: `import { ParticleReveal } from "@/components/canvasui/ParticleReveal";

export function Hero() {
  return (
    <ParticleReveal radius={300}>
      <YourContent />
    </ParticleReveal>
  );
}`,
  },
  {
    id: "preact",
    label: "Preact",
    fileName: "hero.tsx",
    lang: "tsx",
    source: `import { ParticleReveal } from "@/components/canvasui/ParticleReveal";

export function Hero() {
  return (
    <ParticleReveal radius={300}>
      <YourContent />
    </ParticleReveal>
  );
}`,
  },
  {
    id: "angular",
    label: "Angular",
    fileName: "hero.component.ts",
    lang: "ts",
    source: `import { Component } from "@angular/core";

import { ParticleRevealComponent } from "@/components/canvasui/ParticleReveal.component";

@Component({
  selector: "app-hero",
  imports: [ParticleRevealComponent],
  template: \`
    <cui-particle-reveal [options]="{ radius: 300 }">
      <your-content />
    </cui-particle-reveal>
  \`,
})
export class HeroComponent {}`,
  },
  {
    id: "vanilla",
    label: "Vanilla",
    fileName: "main.ts",
    lang: "ts",
    source: `import { createParticleReveal } from "./canvasui/ParticleRevealVanilla";

const reveal = createParticleReveal(
  { source, content, output },
  { radius: 300 },
);`,
  },
] as const;

export async function Frameworks() {
  const variants = await Promise.all(
    SNIPPETS.map(async (snippet) => ({
      id: snippet.id,
      label: snippet.label,
      fileName: snippet.fileName,
      source: snippet.source,
      html: await highlight(snippet.source, snippet.lang),
    })),
  );

  return (
    <section
      aria-labelledby="frameworks-heading"
      className="relative border-t border-dashed border-border/60"
    >
      <Stitches />
      <div className="w-full px-5 py-24 sm:px-8 sm:py-32">
        <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-[1fr_1.2fr] lg:gap-16">
          <Reveal>
            <p className="font-mono text-xs tracking-widest text-muted-foreground uppercase">
              Framework agnostic
            </p>
            <h2
              id="frameworks-heading"
              className="mt-3 text-3xl font-medium tracking-tighter text-balance sm:text-4xl"
            >
              One component, seven flavors.
            </h2>
            <p className="mt-4 max-w-md text-base leading-7 text-muted-foreground">
              Every effect ships as React, Solid, Preact, Vue, Svelte, Angular,
              and dependency-free vanilla TypeScript. Same engine, same props,
              native to your stack.
            </p>
          </Reveal>
          <Reveal delay={100}>
            <FrameworkTabs variants={variants} />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
