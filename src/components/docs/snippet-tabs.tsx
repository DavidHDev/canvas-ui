"use client";

import type { ReactNode } from "react";

import { ChoiceSelect } from "@/components/docs/choice-select";
import { CopyButton } from "@/components/docs/copy-button";
import { usePreference } from "@/hooks/use-preference";

export interface SnippetTab {
  /** Short identifier, e.g. "claude". */
  id: string;
  /** Tab label, e.g. "Claude Code". */
  label: string;
  /** Optional file name shown above the code. */
  fileName?: string;
  /** Raw source, used for the copy button. */
  source: string;
  /** Pre-highlighted HTML. Omit for a single-line command row. */
  html?: string;
}

export function SnippetTabs({
  storageKey,
  tabs,
  footers,
}: {
  /** localStorage key suffix the selection is persisted under. */
  storageKey: string;
  /** One snippet per tab, in display order. */
  tabs: readonly SnippetTab[];
  /** Optional content rendered below the snippet per tab id. */
  footers?: Record<string, ReactNode>;
}) {
  const [activeId, setActiveId] = usePreference(
    storageKey,
    tabs[0]?.id ?? "",
    tabs.map((tab) => tab.id),
  );
  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0];

  if (!active) return null;

  return (
    <div>
      <div className="not-typeset rounded-[calc(var(--radius)+0.25rem+1px)] border border-border/60 bg-background p-1">
        <div className="flex h-8 items-center justify-between gap-2">
          <ChoiceSelect
            label="Client"
            options={tabs}
            value={active.id}
            onValueChange={setActiveId}
          />
          {active.html ? <CopyButton text={active.source} /> : null}
        </div>
        <div className="mt-1 overflow-hidden rounded-lg border border-dashed border-border/70 bg-muted/40">
          {active.html ? (
            <>
              {active.fileName ? (
                <div className="flex items-center justify-between border-b border-dashed border-border/70 px-4 py-2">
                  <span className="text-[12px] text-muted-foreground">
                    {active.fileName}
                  </span>
                </div>
              ) : null}
              <div
                className="docs-code max-h-[480px] overflow-auto text-[13px] leading-6"
                dangerouslySetInnerHTML={{ __html: active.html }}
              />
            </>
          ) : (
            <div className="flex items-center justify-between gap-3 py-1.5 pr-1.5 pl-4">
              <code className="overflow-x-auto text-[13px] whitespace-nowrap text-foreground/90">
                {active.source}
              </code>
              <CopyButton text={active.source} />
            </div>
          )}
        </div>
      </div>
      {footers?.[active.id] ? <div>{footers[active.id]}</div> : null}
    </div>
  );
}
