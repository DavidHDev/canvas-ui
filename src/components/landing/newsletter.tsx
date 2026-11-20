"use client";

import Link from "next/link";

import { NewsletterGate } from "@/components/common/newsletter-gate";
import {
  NEWSLETTER_DESCRIPTION,
  NewsletterSignup,
} from "@/components/common/newsletter-signup";
import { Reveal } from "@/components/landing/reveal";

export function Newsletter() {
  return (
    <NewsletterGate>
      <section
        id="newsletter"
        aria-labelledby="newsletter-heading"
        className="relative"
      >
        <div className="w-full px-5 py-14 sm:px-8 sm:py-20">
          <Reveal className="grid grid-cols-1 items-center gap-8 rounded-[calc(var(--radius)+0.75rem)] bg-muted/45 px-6 py-8 sm:px-10 sm:py-10 lg:grid-cols-[1fr_1fr] lg:gap-16">
            <div>
              <h2
                id="newsletter-heading"
                className="text-3xl font-medium tracking-tighter text-balance sm:text-4xl"
              >
                See how Canvas UI evolves.
              </h2>
              <p className="mt-3 max-w-sm text-base leading-7 text-muted-foreground">
                {NEWSLETTER_DESCRIPTION} See our{" "}
                <Link
                  href="/privacy"
                  target="_blank"
                  rel="noreferrer"
                  className="text-foreground/80 underline decoration-border-strong underline-offset-4 transition-colors duration-150 hover:text-foreground hover:decoration-foreground"
                >
                  privacy policy
                </Link>
                .
              </p>
            </div>
            <NewsletterSignup showHeader={false} showPrivacy={false} layout="pill" />
          </Reveal>
        </div>
      </section>
    </NewsletterGate>
  );
}
