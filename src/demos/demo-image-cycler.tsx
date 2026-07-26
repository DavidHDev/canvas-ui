"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";

import { HeadingAnchor } from "@/components/docs/heading-anchor";

const EASE = "cubic-bezier(0.23, 1, 0.32, 1)";


export const DEMO_IMAGES = [
  "https://images.unsplash.com/photo-1782977389500-dd7adad33ebe?q=80&w=2032&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  "https://images.unsplash.com/photo-1782094002386-7d9ae1f49f50?q=80&w=1817&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  "https://images.unsplash.com/photo-1781499455083-6ccc3beb20cd?q=80&w=1809&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
  "https://images.unsplash.com/photo-1779684474703-5c0519bcf7e8?q=80&w=2703&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D",
];

export function DemoImageSection({
  hint,
  alt,
  images = DEMO_IMAGES,
}: {
  /** One-line instruction shown under the heading. */
  hint: string;
  /** Alt text for the active photo. */
  alt: string;
  images?: string[];
}) {
  return (
    <section className="mt-8" aria-label="Demo">
      <h2
        id="demo"
        className="scroll-mt-24 text-lg font-semibold tracking-[-0.01em]"
      >
        <HeadingAnchor id="demo">Demo</HeadingAnchor>
      </h2>
      <p className="mt-2 text-[13px] text-muted-foreground">{hint}</p>
      <div className="mt-3 overflow-hidden rounded-xl border border-border/60">
        <DemoImageCycler images={images} alt={alt} />
      </div>
    </section>
  );
}

export function DemoImageCycler({
  images,
  alt,
  interval = 10000,
}: {
  images: string[];
  alt: string;
  interval?: number;
}) {
  const shouldReduceMotion = useReducedMotion();
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = setInterval(
      () => setActive((prev) => (prev + 1) % images.length),
      interval,
    );
    return () => clearInterval(id);
  }, [images.length, interval]);

  return (
    <div className="relative aspect-video w-full overflow-hidden">
      {images.map((src, index) => {
        const isActive = index === active;
        return (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={src}
            src={src}
            crossOrigin="anonymous"
            alt={isActive ? alt : ""}
            aria-hidden={!isActive}
            loading={index === 0 ? "eager" : "lazy"}
            className="absolute inset-0 h-full w-full object-cover"
            style={{
              opacity: isActive ? 1 : 0,
              transform:
                shouldReduceMotion || isActive ? "scale(1)" : "scale(1.06)",
              filter:
                shouldReduceMotion || isActive ? "blur(0px)" : "blur(14px)",
              transition: shouldReduceMotion
                ? `opacity 0.4s ${EASE}`
                : `opacity 1.6s ${EASE}, transform 1.6s ${EASE}, filter 1.6s ${EASE}`,
            }}
          />
        );
      })}
    </div>
  );
}
