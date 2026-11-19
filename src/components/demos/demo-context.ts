"use client";

import { createContext, useContext } from "react";

export const DemoControlsTargetContext = createContext<HTMLElement | null>(
  null,
);

export const DemoPortalContext = createContext<HTMLElement | null>(null);

export interface StageState {
  body: HTMLElement | null;
  expanded: boolean;
  staticFallback: boolean;
}

export const StageContext = createContext<StageState | null>(null);

export function useStage() {
  return useContext(StageContext);
}
