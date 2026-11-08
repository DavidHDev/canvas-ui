"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { PreviewVideo } from "@/components/common/preview-video";
import { COMPONENTS, type ComponentEntry } from "@/data/components";

const MID = Math.ceil(COMPONENTS.length / 2);
const ROWS: {
  items: ComponentEntry[];
  direction?: "reverse";
  duration: string;
}[] = [
  { items: COMPONENTS.slice(0, MID), duration: "80s" },
  { items: COMPONENTS.slice(MID), direction: "reverse", duration: "96s" },
];

function GalleryCard({
  component,
  focusable = true,
}: {
  component: ComponentEntry;
  focusable?: boolean;
}) {
  return (
    <Link
      href={component.href}
      tabIndex={focusable ? undefined : -1}
      className="group block w-64 shrink-0 rounded-[calc(var(--radius)+0.25rem+1px)] border border-border/60 bg-background p-1 transition-colors duration-150 hover:bg-muted/50 sm:w-72"
    >
      <div className="relative flex aspect-4/3 items-center justify-center overflow-hidden rounded-lg border border-dashed border-border/70 bg-background/60">
        <PreviewVideo
          src={component.video}
          className="absolute inset-0 size-full object-cover"
        />
        <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/75 via-black/35 to-transparent p-4 opacity-0 transition-opacity duration-200 ease-out group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none">
          <h3 className="text-[15px] font-medium tracking-tight text-white">
            {component.name}
          </h3>
          <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-white/70">
            {component.description}
          </p>
        </div>
      </div>
    </Link>
  );
}

export function GalleryMarquee() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const io = new IntersectionObserver(
      (entries) => {
        const entry = entries[entries.length - 1];
        if (!entry) return;
        if (entry.isIntersecting) setReady(true);
        setInView(entry.isIntersecting);
      },
      { rootMargin: "600px" },
    );
    io.observe(host);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={hostRef} className="flex flex-col gap-4">
      {ROWS.map((row, rowIndex) => (
        <div key={rowIndex} className="marquee">
          {ready ? (
            <div
              className="marquee-track"
              data-direction={row.direction}
              data-ready=""
              data-in-view={inView ? "" : undefined}
              style={
                { "--marquee-duration": row.duration } as React.CSSProperties
              }
            >
              {[0, 1].map((copy) => (
                <ul
                  key={copy}
                  aria-hidden={copy === 1 || undefined}
                  className="flex gap-4 pr-4"
                >
                  {row.items.map((component) => (
                    <li key={component.href}>
                      <GalleryCard
                        component={component}
                        focusable={copy === 0}
                      />
                    </li>
                  ))}
                </ul>
              ))}
            </div>
          ) : (
            <div
              aria-hidden
              className="w-64 rounded-2xl border border-transparent p-2 sm:w-72"
            >
              <div className="aspect-4/3 rounded-lg border border-transparent" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
