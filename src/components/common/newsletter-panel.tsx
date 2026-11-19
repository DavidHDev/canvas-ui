"use client";

import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { X } from "@/components/icons";

import { NewsletterFrame } from "@/components/common/newsletter-frame";
import { isNewsletterHiddenOn } from "@/components/common/newsletter-gate";
import { NewsletterSignup } from "@/components/common/newsletter-signup";
import { useSubscribed } from "@/components/common/use-subscribed";
import { usePreference } from "@/hooks/use-preference";
import { cn } from "@/lib/utils";

const STATES = ["open", "dismissed", "reopened", "hidden", "shown"] as const;

const subscribeToNothing = () => () => {};

export function NewsletterPanel() {
  const [state, setState] = usePreference<(typeof STATES)[number]>(
    "newsletter",
    "open",
    STATES,
  );

  const [subscribed] = useSubscribed();
  const onCatalogue = isNewsletterHiddenOn(usePathname());

  const mounted = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );

  const visible =
    state === "open" || state === "reopened" || state === "shown";

  if (!mounted || onCatalogue || subscribed === "yes" || !visible) return null;

  return (
    <aside
      aria-label="Newsletter"
      data-newsletter-panel
      onAnimationEnd={(event) => {
        if (event.animationName.startsWith("newsletter-panel-")) {
          setState("shown");
        }
      }}
      className={cn(
        "fixed top-[4.75rem] right-[calc(1rem+var(--demo-sbw,0px))] z-40 hidden w-[21rem] origin-top-right will-change-transform xl:block",
        state === "open" && "newsletter-panel-enter",
        state === "reopened" && "newsletter-panel-reopen",
      )}
    >
      <NewsletterFrame floating>
        <NewsletterSignup
          layout="stack"
          action={
            <button
              type="button"
              onClick={() => setState("dismissed")}
              aria-label="Dismiss"
              className="pressable inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-[color,background-color,transform] duration-150 hover:bg-[var(--surface-hover)] hover:text-foreground"
            >
              <X aria-hidden className="size-3.5" />
            </button>
          }
          onSuccess={() => {
            window.setTimeout(() => setState("dismissed"), 4000);
          }}
        />
      </NewsletterFrame>
    </aside>
  );
}
