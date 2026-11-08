"use client";

import { NewsletterGate } from "@/components/common/newsletter-gate";
import {
  NEWSLETTER_DESCRIPTION,
  NewsletterSignup,
} from "@/components/common/newsletter-signup";
import { Reveal } from "@/components/landing/reveal";
import { Stitches } from "@/components/landing/stitches";

export function Newsletter() {
  return (
    <NewsletterGate>
      <section
        id="newsletter"
        aria-labelledby="newsletter-heading"
        className="relative border-t border-dashed border-border/60"
      >
        <Stitches />
        <div className="w-full px-5 py-24 sm:px-8 sm:py-32">
          <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[1fr_1.2fr] lg:gap-16">
            <Reveal>
              <h2
                id="newsletter-heading"
                className="text-3xl font-medium tracking-tighter text-balance sm:text-4xl"
              >
                See how Canvas UI evolves.
              </h2>
              <p className="mt-4 max-w-sm text-base leading-7 text-muted-foreground">
                {NEWSLETTER_DESCRIPTION}
              </p>
            </Reveal>
            <Reveal delay={100}>
              <div className="rounded-[calc(var(--radius)+1.25rem)] border border-border/60 bg-muted/30 p-2">
                <div className="rounded-[calc(var(--radius)+0.75rem)] border border-dashed border-border/70 bg-background p-4 sm:p-5">
                  <NewsletterSignup showHeader={false} layout="stack" />
                </div>
              </div>
            </Reveal>
          </div>
        </div>
      </section>
    </NewsletterGate>
  );
}
