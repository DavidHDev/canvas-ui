"use client";

import { ChevronsUpDown } from "@/components/icons";
import { useEffect, useRef, useState, type ReactNode } from "react";

import {
  SegmentedControl,
  type SegmentedOption,
} from "@/components/ui/segmented-control";
import { cn } from "@/lib/utils";

const ROW_PAD = 6;
const LABEL_PAD = 19;
const SEGMENT_PAD = { stack: 8, select: 10 } as const;

let measureContext: CanvasRenderingContext2D | null = null;

function textWidth(text: string, family: string) {
  measureContext ??= document.createElement("canvas").getContext("2d");
  if (!measureContext) return text.length * 7;
  measureContext.font = `500 12.5px ${family}`;
  return measureContext.measureText(text).width;
}

export function SegmentedRow<T extends string>({
  label,
  options,
  value,
  onValueChange,
  trailing,
  overflow = "stack",
  className,
}: {
  label: string;
  options: readonly SegmentedOption<T>[];
  value: T;
  onValueChange: (value: T) => void;
  trailing?: ReactNode;
  overflow?: "stack" | "select";
  className?: string;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  const labels = options.map((option) => option.label).join("\u0000");

  useEffect(() => {
    const row = rowRef.current;
    const parent = row?.parentElement;
    if (!row || !parent) return;
    let live = true;
    const measure = () => {
      const available = parent.clientWidth;
      if (!live || available === 0) return;
      const family = getComputedStyle(row).fontFamily;
      const pad = SEGMENT_PAD[overflow];
      const trailingEl = row.querySelector<HTMLElement>("[data-row-trailing]");
      let needed =
        ROW_PAD + LABEL_PAD + textWidth(label, family) + (trailingEl ? trailingEl.offsetWidth + 3 : 0);
      for (const item of labels.split("\u0000")) needed += textWidth(item, family) + pad * 2;
      setCompact(available < Math.ceil(needed));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(parent);
    document.fonts?.ready.then(measure);
    return () => {
      live = false;
      observer.disconnect();
    };
  }, [overflow, label, labels]);

  const stacked = overflow === "stack" && compact;
  const selecting = overflow === "select" && compact;

  if (selecting) {
    const active = options.find((option) => option.id === value);
    return (
      <div
        ref={rowRef}
        className={cn(
          "relative flex h-8 w-full min-w-0 items-center rounded-control bg-muted/60 pr-2.5 pl-3 transition-colors duration-150 ease-out hover:bg-muted/80",
          className,
        )}
      >
        <span className="shrink-0 text-[12.5px] font-medium text-foreground/90">{label}</span>
        <span className="ml-auto flex min-w-0 items-center gap-1 pl-3 text-[12.5px] font-medium text-muted-foreground">
          <span className="truncate">{active?.label}</span>
          <ChevronsUpDown aria-hidden className="size-3.5 shrink-0" />
        </span>
        <select
          aria-label={label}
          value={value}
          onChange={(event) => onValueChange(event.target.value as T)}
          className="absolute inset-0 cursor-pointer appearance-none opacity-0"
        >
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
    );
  }

  return (
    <div
      ref={rowRef}
      className={cn(
        "min-w-0 rounded-control bg-muted/60 p-[3px]",
        stacked ? "flex flex-col gap-[3px]" : "flex h-8 items-center",
        className,
      )}
    >
      <span
        className={cn(
          "shrink-0 text-[12.5px] font-medium whitespace-nowrap text-foreground/90",
          stacked ? "flex h-[23px] items-center px-[9px]" : "pr-2.5 pl-[9px]",
        )}
      >
        {label}
      </span>
      <div className="flex min-w-0 flex-1 items-center gap-[3px]">
        <SegmentedControl
          variant="track"
          label={label}
          options={options}
          value={value}
          onValueChange={onValueChange}
          className={cn(
            "min-w-0 flex-1",
            overflow === "select"
              ? "[&>button]:px-2.5"
              : "[&>button]:min-w-0 [&>button]:flex-1",
          )}
        />
        {trailing ? (
          <span data-row-trailing className="flex shrink-0 items-center">
            {trailing}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export const TRACK_BUTTON =
  "pressable inline-grid size-[26px] cursor-pointer place-items-center rounded-[7px] text-muted-foreground transition-colors duration-150 ease-out hover:bg-foreground/5 hover:text-foreground aria-expanded:bg-foreground/10 aria-expanded:text-foreground";
