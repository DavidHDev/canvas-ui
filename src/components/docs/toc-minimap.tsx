"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";

export type TOCItemType = {
  title: React.ReactNode;
  url: string;
  depth: number;
};

export type TOCMinimapProps = {
  items: TOCItemType[];
  className?: string;
};

export function TOCMinimap({ items, className }: TOCMinimapProps) {
  const [open, setOpen] = useState(false);
  const closeTimer = useRef<number | undefined>(undefined);
  const itemIds = useMemo(
    () => items.map((item) => item.url.replace("#", "")),
    [items],
  );

  const activeHeading = useActiveHeading(itemIds);

  const close = useCallback(() => {
    clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 150);
  }, []);

  const cancelClose = useCallback(() => {
    clearTimeout(closeTimer.current);
    setOpen(true);
  }, []);

  useEffect(() => {
    return () => clearTimeout(closeTimer.current);
  }, []);

  if (!items.length) {
    return null;
  }

  function handleItemClick(url: string) {
    scrollToHeading(url);
  }

  return (
    <div
      className={cn("ml-auto w-18", className)}
      onPointerEnter={cancelClose}
      onPointerLeave={close}
    >
      <HoverCard
        open={open}
        onOpenChange={(nextOpen) => {
          if (nextOpen) setOpen(true);
        }}
      >
        <HoverCardTrigger
          delay={0}
          closeDelay={0}
          render={
            <div className="flex max-h-[50dvh] flex-col gap-3 overflow-hidden py-3 pl-6 opacity-100 transition-opacity duration-200 data-popup-open:opacity-0">
              {items.map((item) => (
                <div
                  key={item.url}
                  data-depth={item.depth}
                  data-active={item.url === `#${activeHeading}`}
                  className={cn(
                    "h-0.5 w-6 shrink-0 rounded-xs bg-ring/50 transition-[background-color] duration-200",
                    "data-[depth=3]:ml-2 data-[depth=3]:w-4",
                    "data-[depth=4]:ml-4 data-[depth=4]:w-2",
                    "data-active:bg-foreground",
                  )}
                />
              ))}
            </div>
          }
        />

        <HoverCardContent
          className="w-56 overflow-hidden p-0 duration-200 data-[side=left]:slide-in-from-right-3 data-[side=left]:slide-out-to-right-3 data-open:zoom-in-100 data-closed:zoom-out-100"
          align="start"
          alignOffset={0}
          positionMethod="fixed"
          side="left"
          sideOffset={-60}
          onPointerEnter={cancelClose}
          onPointerLeave={close}
        >
          <div className="flex max-h-[50dvh] overflow-y-auto overscroll-contain">
            <ul className="flex size-full flex-col px-6 py-4 text-sm">
              {items.map((item) => (
                <li key={item.url} className="flex py-1">
                  <button
                    data-depth={item.depth}
                    data-active={item.url === `#${activeHeading}`}
                    className={cn(
                      "w-full text-left transition-[color] duration-200 cursor-pointer!",
                      "text-muted-foreground hover:text-foreground data-active:text-foreground",
                      "data-[depth=3]:pl-4 data-[depth=4]:pl-8",
                    )}
                    onClick={() => handleItemClick(item.url)}
                  >
                    {item.title}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </HoverCardContent>
      </HoverCard>
    </div>
  );
}

export function useActiveHeading(itemIds: string[]) {
  const [activeId, setActiveId] = useState<string | null>(null);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        }
      },
      { rootMargin: "0% 0% -80% 0%", threshold: 0.98 },
    );

    for (const id of itemIds ?? []) {
      const element = document.getElementById(id);
      if (element) {
        observer.observe(element);
      }
    }

    return () => {
      for (const id of itemIds ?? []) {
        const element = document.getElementById(id);
        if (element) {
          observer.unobserve(element);
        }
      }
    };
  }, [itemIds]);

  return activeId ?? itemIds[0] ?? null;
}

function scrollToHeading(url: string) {
  history.pushState(null, "", url);
  document.getElementById(url.replace("#", ""))?.scrollIntoView({
    behavior: "smooth",
  });
}
