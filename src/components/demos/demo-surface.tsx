"use client";

import { usePathname } from "next/navigation";
import type { CSSProperties, ReactNode } from "react";

import { NewsletterInline } from "@/components/common/newsletter-inline";
import { useDemoScrollbarGutter } from "@/components/demos/demo-controls";

export interface DemoProps {
  children?: ReactNode;
}

export interface DemoSurface {
  page: boolean;
  props: { className: string; style: CSSProperties; children: ReactNode };
}

/** The docs signup that a full-page demo covers up, for demos that lay out
    their own page content instead of using PageDemoContent. */
export function PageDemoSignup() {
  const onDocs = usePathname()?.startsWith("/docs") ?? false;
  return onDocs ? <NewsletterInline /> : null;
}

export function PageDemoContent({ children }: { children: ReactNode }) {
  const setContentEl = useDemoScrollbarGutter();
  return (
    <div
      ref={setContentEl}
      data-page-demo=""
      className="min-h-full bg-background px-5 pt-24 pb-10 sm:px-8 lg:pt-16 lg:pr-8 lg:pl-72"
    >
      {children}
      <PageDemoSignup />
    </div>
  );
}

export function useDemoSurface(
  children: ReactNode | undefined,
  scene: ReactNode,
): DemoSurface {
  const page = children !== undefined && children !== null;

  if (page) {
    return {
      page,
      props: {
        className: "page-enter inset-0 z-30",
        style: { position: "fixed" },
        children: <PageDemoContent>{children}</PageDemoContent>,
      },
    };
  }

  return {
    page,
    props: {
      className: "inset-0",
      style: { position: "absolute" },
      children: scene,
    },
  };
}
