import type { Metadata } from "next";

import { GitHubStars } from "@/components/common/github-stars";
import { NewsletterNavButton } from "@/components/common/newsletter-nav-button";
import { NewsletterPanel } from "@/components/common/newsletter-panel";
import { SearchButton, SearchDialog } from "@/components/common/site-search";
import { ThemeToggle } from "@/components/common/theme-toggle";
import { PlaygroundClient } from "@/components/playground/playground-client";

export const metadata: Metadata = {
  title: "Playground",
  description:
    "Try every Canvas UI component on a real landing page. Pick an effect, tune its controls, switch between WebGL and WebGPU, and watch it run over live HTML.",
  alternates: { canonical: "/playground" },
};

export default function PlaygroundPage() {
  return (
    <>
      <div className="surface-floating fixed top-4 right-[calc(1rem+var(--demo-sbw,0px))] z-40 hidden items-center gap-1.5 rounded-bar p-1 [view-transition-name:docs-controls] lg:flex">
        <NewsletterNavButton />
        <SearchButton />
        <ThemeToggle />
        <GitHubStars />
      </div>

      <SearchDialog />

      <PlaygroundClient />

      <NewsletterPanel />
    </>
  );
}
