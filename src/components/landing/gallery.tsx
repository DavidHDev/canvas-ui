import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { Reveal } from "@/components/landing/reveal";
import { GalleryMarquee } from "@/components/landing/gallery-marquee";
import { Stitches } from "@/components/landing/stitches";

export function Gallery() {
  return (
    <section
      aria-labelledby="gallery-heading"
      className="relative border-t border-dashed border-border/60 py-24 sm:py-32"
    >
      <Stitches />
      <Reveal className="flex w-full flex-wrap items-end justify-between gap-x-8 gap-y-4 px-5 sm:px-8">
        <h2
          id="gallery-heading"
          className="text-3xl font-medium tracking-tighter text-balance sm:text-4xl"
        >
          Every component, alive on canvas.
        </h2>
        <Link
          href="/components"
          className="group inline-flex items-center gap-1.5 text-[15px] font-medium text-foreground transition-colors duration-150 hover:text-muted-foreground"
        >
          Browse all
          <ArrowRight
            aria-hidden
            strokeWidth={2.25}
            className="size-[15px] transition-transform duration-200 ease-out group-hover:translate-x-0.5 motion-reduce:transition-none"
          />
        </Link>
      </Reveal>

      <Reveal delay={80} className="mt-12 flex flex-col gap-4">
        <GalleryMarquee />
      </Reveal>
    </section>
  );
}
