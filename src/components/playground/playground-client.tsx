"use client";

import { useQueryState } from "nuqs";
import { useRef, useState, useSyncExternalStore } from "react";

import { DemoControlsTargetContext } from "@/components/demos/demo-controls";
import { MockSite } from "@/components/playground/mock-site";
import { PlaygroundSidebar } from "@/components/playground/playground-sidebar";
import { DemoControlsResetContext } from "@/hooks/use-demo-controls";
import {
  DEFAULT_PLAYGROUND_SLUG,
  getPlaygroundDemo,
} from "@/components/playground/demos";

const LG_QUERY = "(min-width: 64rem)";

function subscribeLg(onChange: () => void) {
  const query = window.matchMedia(LG_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function useIsLg() {
  return useSyncExternalStore(
    subscribeLg,
    () => window.matchMedia(LG_QUERY).matches,
    () => false,
  );
}

export function PlaygroundClient() {
  const [param, setParam] = useQueryState("c");
  const resetControls = useRef<(() => void) | null>(null);
  const [controlsHost, setControlsHost] = useState<HTMLElement | null>(null);
  const isLg = useIsLg();

  const demo = getPlaygroundDemo(param);
  const Demo = demo.Component;

  const select = (next: string) => {
    const resolved = getPlaygroundDemo(next).slug;
    if (resolved === demo.slug) return;
    // nuqs batches the reset with selection and replaces any queued control edits.
    resetControls.current?.();
    void setParam(
      resolved === DEFAULT_PLAYGROUND_SLUG ? null : resolved,
      { history: "replace" },
    );
  };

  return (
    <>
      <PlaygroundSidebar
        activeSlug={demo.slug}
        onSelect={select}
        onControlsHostChange={setControlsHost}
      />

      <DemoControlsResetContext.Provider value={resetControls}>
        <DemoControlsTargetContext.Provider value={isLg ? controlsHost : null}>
          {demo.kind === "wrap" ? (
            <Demo key={demo.slug}>
              <MockSite />
            </Demo>
          ) : (
            <Demo key={demo.slug} />
          )}
        </DemoControlsTargetContext.Provider>
      </DemoControlsResetContext.Provider>
    </>
  );
}
