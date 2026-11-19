"use client";

import type { ReactNode } from "react";
import { useTheme } from "next-themes";

export type EntryStatus = "loading" | "ready" | "error";

export const HERO_BLEED_CLASS = "absolute -inset-x-[25%] -inset-y-[70%] z-10";
export const HERO_BLEED_SCALE = 0.55;

export const HERO_MODEL = "/assets/models/bolt.glb";

export function EntryPage({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-svh overflow-x-clip px-5 pt-24 pb-10 sm:px-8 lg:pt-16 lg:pr-8 lg:pl-72">
      <div className="page-enter">{children}</div>
    </main>
  );
}

export function StatusPill({ status }: { status: EntryStatus }) {
  if (status === "ready") return null;
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 z-10 flex justify-center">
      <span className="surface-floating inline-flex h-7 items-center rounded-md px-3 text-[12px] font-medium text-muted-foreground">
        {status === "loading" ? "Loading asset…" : "Could not load the asset."}
      </span>
    </div>
  );
}

export function ObjectHero({
  status,
  background,
  children,
}: {
  status: EntryStatus;
  background?: string;
  children: ReactNode;
}) {
  const { resolvedTheme } = useTheme();
  return (
    <>
      <div
        className={`absolute inset-0 rounded-2xl ${
          background ? "" : resolvedTheme === "dark" ? "bg-[#0a0a0a]" : "bg-white"
        }`}
        style={background ? { backgroundColor: background } : undefined}
      />
      <div className={HERO_BLEED_CLASS}>{children}</div>
      <StatusPill status={status} />
    </>
  );
}

export function omit<T extends object, K extends keyof T>(
  value: T,
  keys: readonly K[],
): Omit<T, K> {
  const next = { ...value };
  for (const key of keys) delete next[key];
  return next;
}
