"use client";

import { useQueryState } from "nuqs";
import { useCallback, useRef, useState, useSyncExternalStore } from "react";

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
  const pendingSelection = useRef<string | null>(null);
  const [controlsHost, setControlsHost] = useState<HTMLElement | null>(null);
  const isLg = useIsLg();

  const demo = getPlaygroundDemo(param);
  const Demo = demo.Component;

  const applySelection = useCallback((slug: string) => {
    pendingSelection.current = null;
    // nuqs batches the reset with selection and replaces any queued control edits.
    resetControls.current?.();
    void setParam(
      slug === DEFAULT_PLAYGROUND_SLUG ? null : slug,
      { history: "replace" },
    );
  }, [setParam]);

  const registerReset = useCallback((reset: (() => void) | null) => {
    resetControls.current = reset;
    if (reset && pendingSelection.current !== null) {
      applySelection(pendingSelection.current);
    }
  }, [applySelection]);

  const select = (next: string) => {
    const resolved = getPlaygroundDemo(next).slug;
    if (resolved === demo.slug) {
      pendingSelection.current = null;
      return;
    }
    // On a cold load, wait for the outgoing demo's schema before clearing its
    // query keys. This preserves unrelated parameters without importing demos
    // eagerly or letting a shared URL's settings leak into the next component.
    if (!resetControls.current) {
      pendingSelection.current = resolved;
      return;
    }
    applySelection(resolved);
  };

  return (
    <>
      <PlaygroundSidebar
        activeSlug={demo.slug}
        onSelect={select}
        onControlsHostChange={setControlsHost}
      />

      <DemoControlsResetContext.Provider value={registerReset}>
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
