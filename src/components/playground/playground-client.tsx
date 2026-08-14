"use client";

import { useQueryState } from "nuqs";
import { useState, useSyncExternalStore } from "react";

import { DemoControlsTargetContext } from "@/components/demos/demo-controls";
import { MockSite } from "@/components/playground/mock-site";
import { PlaygroundSidebar } from "@/components/playground/playground-sidebar";
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
  const [controlsHost, setControlsHost] = useState<HTMLElement | null>(null);
  const isLg = useIsLg();

  const demo = getPlaygroundDemo(param);
  const Demo = demo.Component;

  const select = (next: string) => {
    const resolved = getPlaygroundDemo(next).slug;
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

      <DemoControlsTargetContext.Provider value={isLg ? controlsHost : null}>
        {demo.kind === "wrap" ? (
          <Demo key={demo.slug}>
            <MockSite />
          </Demo>
        ) : (
          <Demo key={demo.slug} />
        )}
      </DemoControlsTargetContext.Provider>
    </>
  );
}
