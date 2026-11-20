import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export function NewsletterFrame({
  children,
  floating = false,
  raised = false,
  className,
}: {
  children: ReactNode;
  floating?: boolean;
  raised?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        raised
          ? "frame rounded-[calc(var(--radius)+0.75rem+var(--frame-gap))] p-[var(--frame-gap)]"
          : "rounded-[calc(var(--radius)+0.75rem+var(--frame-gap)+1px)] p-[var(--frame-gap)]",
        raised ? null : floating ? "surface-floating" : "frame",
        className,
      )}
    >
      <div
        className={cn(
          "rounded-[calc(var(--radius)+0.75rem)] p-4 sm:p-5",
          raised ? "bg-background" : "frame-inset",
          !raised && (floating ? "bg-transparent" : "bg-background"),
        )}
      >
        {children}
      </div>
    </div>
  );
}
