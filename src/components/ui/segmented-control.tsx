"use client";

import { useLayoutEffect, useRef } from "react";

import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  id: T;
  label: string;
  count?: number;
}

export type SegmentedVariant = "pill" | "track";

const VARIANTS: Record<
  SegmentedVariant,
  {
    root: string;
    indicator: string;
    button: string;
    active: string;
    idle: string;
  }
> = {
  pill: {
    root: "inline-flex rounded-bar bg-muted/60 p-1",
    indicator: "top-1 bottom-1 rounded-control bg-background shadow-[0_1px_2px_rgb(0_0_0/0.08)]",
    button: "h-8 rounded-control px-3.5 text-[13px]",
    active: "text-foreground",
    idle: "text-muted-foreground hover:text-foreground",
  },
  track: {
    root: "flex",
    indicator: "inset-y-0 rounded-[7px] bg-foreground/10",
    button:
      "h-[26px] flex-auto justify-center rounded-[7px] px-2 text-[12.5px]",
    active: "text-foreground",
    idle: "text-muted-foreground hover:text-foreground/90",
  },
};

export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onValueChange,
  variant = "pill",
  className,
}: {
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
  variant?: SegmentedVariant;
  className?: string;
}) {
  const look = VARIANTS[variant];
  const rootRef = useRef<HTMLDivElement>(null);
  const indicatorRef = useRef<HTMLSpanElement>(null);
  const placed = useRef(false);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const indicator = indicatorRef.current;
    if (!root || !indicator) return;

    let placedWidth = -1;

    const scrollable = () =>
      getComputedStyle(root).overflowX !== "visible" &&
      root.scrollWidth > root.clientWidth + 1;
    const updateFade = () => {
      const canScroll = scrollable();
      const max = root.scrollWidth - root.clientWidth;
      root.dataset.fadeStart = String(canScroll && root.scrollLeft > 1);
      root.dataset.fadeEnd = String(canScroll && root.scrollLeft < max - 1);
    };

    const place = (animate: boolean) => {
      const active = root.querySelector<HTMLElement>('[aria-pressed="true"]');
      if (!active || active.offsetWidth === 0) return;
      placedWidth = root.offsetWidth;
      placed.current = true;
      if (!animate) indicator.style.transition = "none";
      indicator.style.width = `${active.offsetWidth}px`;
      indicator.style.transform = `translateX(${active.offsetLeft}px)`;
      indicator.style.opacity = "1";
      if (!animate) {
        void indicator.offsetWidth;
        indicator.style.transition = "";
      }
      if (scrollable()) {
        const pad = 28;
        const left = active.offsetLeft;
        const right = left + active.offsetWidth;
        const behavior = animate ? "smooth" : "instant";
        if (left - pad < root.scrollLeft) {
          root.scrollTo({ left: left - pad, behavior });
        } else if (right + pad > root.scrollLeft + root.clientWidth) {
          root.scrollTo({ left: right + pad - root.clientWidth, behavior });
        }
      }
      updateFade();
    };

    place(placed.current);
    updateFade();

    const observer = new ResizeObserver(() => {
      updateFade();
      if (root.offsetWidth === placedWidth) return;
      place(false);
    });
    observer.observe(root);
    root.addEventListener("scroll", updateFade, { passive: true });
    return () => {
      observer.disconnect();
      root.removeEventListener("scroll", updateFade);
    };
  }, [value, options.length]);

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={label}
      className={cn(
        "segmented-control relative items-center",
        look.root,
        className,
      )}
    >
      <span
        ref={indicatorRef}
        aria-hidden
        className={cn(
          "segmented-indicator pointer-events-none absolute left-0 opacity-0",
          look.indicator,
        )}
      />
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={active}
            onClick={() => onValueChange(option.id)}
            className={cn(
              "relative inline-flex cursor-pointer items-center gap-1.5 font-medium whitespace-nowrap transition-[color,transform] duration-150 ease-out active:scale-[0.97] motion-reduce:transition-none",
              look.button,
              active ? look.active : look.idle,
            )}
          >
            {option.label}
            {option.count !== undefined ? (
              <span
                className={cn(
                  "text-[12px] font-normal tabular-nums transition-colors duration-150",
                  active ? "text-muted-foreground" : "text-muted-foreground/60",
                )}
              >
                {option.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
