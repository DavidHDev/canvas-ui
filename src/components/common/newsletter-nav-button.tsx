"use client";

import { usePathname } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { Mail } from "@/components/icons";

import { isNewsletterHiddenOn } from "@/components/common/newsletter-gate";
import { useSubscribed } from "@/components/common/use-subscribed";
import { usePreference } from "@/hooks/use-preference";
import { cn } from "@/lib/utils";

const STATES = ["open", "dismissed", "reopened", "hidden"] as const;

const emptySubscribe = () => () => {};

export function NewsletterNavButton({
  mode = "panel",
  className,
}: {
  mode?: "panel" | "scroll";
  className?: string;
}) {
  const [state, setState] = usePreference<(typeof STATES)[number]>(
    "newsletter",
    "open",
    STATES,
  );

  const [subscribed] = useSubscribed();
  const hiddenRoute = isNewsletterHiddenOn(usePathname());
  const [exiting, setExiting] = useState(false);

  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  const scrollToSignup = () => {
    const target = [
      ...document.querySelectorAll<HTMLElement>("[data-newsletter-inline], #newsletter"),
    ].find((element) => element.getClientRects().length > 0);
    if (!target) return;

    const reduce = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    target.scrollIntoView({
      behavior: reduce ? "auto" : "smooth",
      block: "center",
    });

    window.setTimeout(
      () => {
        target.querySelector<HTMLInputElement>("input[name=email]")?.focus({
          preventScroll: true,
        });
      },
      reduce ? 0 : 500,
    );
  };

  const handleClick = () => {
    if (mode === "scroll") {
      scrollToSignup();
      return;
    }

    setState("reopened");

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    setExiting(true);
    window.setTimeout(() => setExiting(false), 260);
  };

  const visible =
    mode === "scroll" || state === "dismissed" || state === "hidden";
  const announcing = mode === "panel" && state === "dismissed" && !exiting;

  if (!mounted || hiddenRoute || subscribed === "yes") return null;
  if (!visible && !exiting) return null;

  return (
    <button
      type="button"
      aria-label={
        mode === "scroll" ? "Go to newsletter signup" : "Show newsletter signup"
      }
      data-newsletter-button={mode}
      onClick={handleClick}
      onAnimationEnd={(event) => {
        if (event.animationName === "newsletter-nav-flash") setState("hidden");
      }}
      className={cn(
        exiting && "newsletter-nav-exit pointer-events-none",
        announcing && "newsletter-nav-enter",
        "btn-icon btn-icon-quiet relative",
        className ?? "hidden xl:grid",
      )}
    >
      {announcing ? (
        <span
          aria-hidden
          className="newsletter-nav-pulse pointer-events-none absolute inset-0 rounded-control"
        />
      ) : null}
      <Mail
        aria-hidden
        className={cn(
          "size-[17px] shrink-0",
          announcing && "newsletter-nav-flash",
        )}
      />
    </button>
  );
}
