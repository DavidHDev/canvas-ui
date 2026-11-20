"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "@/components/icons";

import { cn } from "@/lib/utils";

export function CopyButton({
  text,
  label,
  className,
}: {
  text: string;
  label?: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setCopied(false), 1600);
  };

  return (
    <button
      type="button"
      aria-label={copied ? "Copied" : (label ?? "Copy to clipboard")}
      onClick={copy}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-control px-2.5 text-[13px] text-muted-foreground transition-[color,background-color,border-color,transform] duration-150 ease-out hover:bg-[var(--surface-hover)] hover:text-foreground active:scale-[0.96] motion-reduce:transition-none",
        className,
      )}
    >
      <span className="grid size-[15px]">
        <Copy
          aria-hidden
          className={cn(
            "col-start-1 row-start-1 size-[15px] transition-[opacity,filter,transform] duration-200 ease-out motion-reduce:transition-[opacity]",
            copied ? "scale-75 opacity-0 blur-[2px]" : "scale-100 opacity-100 blur-none",
          )}
        />
        <Check
          aria-hidden
          className={cn(
            "col-start-1 row-start-1 size-[15px] transition-[opacity,filter,transform] duration-200 ease-out motion-reduce:transition-[opacity]",
            copied ? "scale-100 opacity-100 blur-none" : "scale-75 opacity-0 blur-[2px]",
          )}
        />
      </span>
      {label ? <span>{copied ? "Copied" : label}</span> : null}
    </button>
  );
}
