"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";

export function Reveal({
  children,
  className,
  delay = 0,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  /** Stagger delay in ms (keep within 0-240). */
  delay?: number;
  as?: "div" | "li" | "section";
}) {
  const ref = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) {
      el.dataset.inView = "true";
      return;
    }
    let delivered = false;
    const observer = new IntersectionObserver(
      (entries) => {
        delivered = true;
        if (entries.some((entry) => entry.isIntersecting)) {
          el.dataset.inView = "true";
          observer.disconnect();
        }
      },
      { rootMargin: "0px 0px -60px 0px" },
    );
    observer.observe(el);

    const safety = window.setTimeout(() => {
      if (!delivered) {
        el.dataset.inView = "true";
        observer.disconnect();
      }
    }, 1200);

    return () => {
      window.clearTimeout(safety);
      observer.disconnect();
    };
  }, []);

  return (
    <Tag
      ref={ref as React.Ref<never>}
      className={cn("reveal", className)}
      style={delay ? { transitionDelay: `${delay}ms` } : undefined}
    >
      {children}
    </Tag>
  );
}
