"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

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
        "inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-[13px] text-muted-foreground transition-[color,transform] duration-150 ease-out hover:text-foreground active:scale-95 motion-reduce:transition-none",
        className,
      )}
    >
      <span className="grid size-3.75">
        <Copy
          aria-hidden
          className={cn(
            "col-start-1 row-start-1 size-3.75 transition-[opacity,filter] duration-200 ease-out motion-reduce:transition-none",
            copied ? "opacity-0 blur-[3px]" : "opacity-100 blur-none",
          )}
        />
        <Check
          aria-hidden
          className={cn(
            "col-start-1 row-start-1 size-3.75 transition-[opacity,filter] duration-200 ease-out motion-reduce:transition-none",
            copied ? "opacity-100 blur-none" : "opacity-0 blur-[3px]",
          )}
        />
      </span>
      {label ? <span>{copied ? "Copied" : label}</span> : null}
    </button>
  );
}
