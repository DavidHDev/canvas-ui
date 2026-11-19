"use client";

import type { ReactNode } from "react";

import { ChoiceSelect } from "@/components/docs/choice-select";
import { CopyButton } from "@/components/docs/copy-button";
import { usePreference } from "@/hooks/use-preference";

export interface SnippetTab {
  id: string;
  label: string;
  fileName?: string;
  source: string;
  html?: string;
}

export function SnippetTabs({
  storageKey,
  tabs,
  footers,
}: {
  storageKey: string;
  tabs: readonly SnippetTab[];
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
      <div className="not-typeset frame">
        <div className="frame-bar">
          <ChoiceSelect
            label="Client"
            options={tabs}
            value={active.id}
            onValueChange={setActiveId}
          />
          {active.html ? <CopyButton text={active.source} /> : null}
        </div>
        <div className="frame-inset overflow-hidden">
          {active.html ? (
            <>
              {active.fileName ? (
                <div className="flex items-center justify-between px-4 pt-3 pb-1">
                  <span className="text-[12px] text-muted-foreground">
                    {active.fileName}
                  </span>
                </div>
              ) : null}
              <div
                key={active.id}
                className="docs-code framework-snippet-enter max-h-[480px] overflow-auto text-[13px] leading-6"
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
