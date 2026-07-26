"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Link } from "lucide-react";

import { cn } from "@/lib/utils";

interface HeadingAnchorProps {
  id: string;
  children: React.ReactNode;
}

export function HeadingAnchor({ id, children }: HeadingAnchorProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleCopy = async () => {
    const url = `${window.location.origin}${window.location.pathname}#${id}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setCopied(false), 1600);
  };

  return (
    <span className="group/anchor inline-flex items-center gap-2">
      <a href={`#${id}`} className="text-foreground no-underline">
        {children}
      </a>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? "Copied" : `Copy link to ${id} section`}
        className={cn(
          "opacity-0 transition-[color,opacity,transform] duration-150 ease-out cursor-pointer",
          "group-hover/anchor:opacity-100",
          "text-muted-foreground hover:text-foreground active:scale-95",
          "motion-reduce:transition-none",
        )}
      >
        <span className="grid size-3.75">
          <Link
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
      </button>
    </span>
  );
}
