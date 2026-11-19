"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { useSubscribed } from "@/components/common/use-subscribed";

const HIDDEN_ON = new Set(["/components"]);

export function isNewsletterHiddenOn(pathname: string | null) {
  return pathname !== null && HIDDEN_ON.has(pathname.replace(/\/$/, "") || "/");
}

export function NewsletterGate({ children }: { children: ReactNode }) {
  const [subscribed] = useSubscribed();
  const pathname = usePathname();

  if (subscribed === "yes") return null;
  if (isNewsletterHiddenOn(pathname)) return null;

  return <>{children}</>;
}
