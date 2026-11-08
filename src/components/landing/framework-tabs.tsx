"use client";

import { useState } from "react";

import { ChoiceSelect } from "@/components/docs/choice-select";
import { CopyButton } from "@/components/docs/copy-button";

export interface FrameworkVariant {
  id: string;
  label: string;
  fileName: string;
  source: string;
  /** Pre-highlighted HTML produced on the server. */
  html: string;
}

export function FrameworkTabs({ variants }: { variants: FrameworkVariant[] }) {
  const [activeId, setActiveId] = useState(variants[0]?.id);
  const active = variants.find((v) => v.id === activeId) ?? variants[0];

  return (
    <div className="rounded-[calc(var(--radius)+0.25rem+1px)] border border-border/60 bg-background px-1 pb-1">
      <div className="flex items-center justify-between gap-2 px-1 py-2">
        <ChoiceSelect
          label="Framework"
          options={variants}
          value={active.id}
          onValueChange={setActiveId}
          align="start"
          className="my-0"
        />
        <div className="flex items-center gap-2 pr-1.5">
          <span className="hidden text-[12px] text-muted-foreground sm:block">
            {active.fileName}
          </span>
          <CopyButton text={active.source} />
        </div>
      </div>
      <div
        key={active.id}
        className="docs-code framework-snippet-enter min-h-56 overflow-x-auto rounded-lg border border-dashed border-border/70 bg-background text-[13px] leading-6"
        dangerouslySetInnerHTML={{ __html: active.html }}
      />
    </div>
  );
}
