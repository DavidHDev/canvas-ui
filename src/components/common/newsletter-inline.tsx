"use client";

import { NewsletterFrame } from "@/components/common/newsletter-frame";
import { NewsletterGate } from "@/components/common/newsletter-gate";
import { NewsletterSignup } from "@/components/common/newsletter-signup";

export function NewsletterInline({ id }: { id?: string }) {
  return (
    <NewsletterGate>
      <div
        id={id}
        data-newsletter-inline
        className="mx-auto mt-24 w-full max-w-3xl pb-4 xl:hidden [main:has([data-wide-page])_&]:max-w-4xl"
      >
        <NewsletterFrame>
          <NewsletterSignup />
        </NewsletterFrame>
      </div>
    </NewsletterGate>
  );
}
