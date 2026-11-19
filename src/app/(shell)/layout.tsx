import Image from "next/image";
import Link from "next/link";

import { DocsSidebar } from "@/components/docs/docs-sidebar";
import { DocsMobileNav } from "@/components/docs/docs-mobile-nav";
import { GitHubStars } from "@/components/common/github-stars";
import { NewsletterInline } from "@/components/common/newsletter-inline";
import { NewsletterNavButton } from "@/components/common/newsletter-nav-button";
import { NewsletterPanel } from "@/components/common/newsletter-panel";
import { SearchButton, SearchDialog } from "@/components/common/site-search";
import { ThemeToggle } from "@/components/common/theme-toggle";

export default function ShellLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-svh flex-col">
      <DocsSidebar />

      <div className="sticky top-0 z-40 flex items-center justify-between border-b border-border-subtle bg-[var(--surface-bar)] pt-5 pb-4 pl-5 pr-[calc(1.25rem+var(--demo-sbw,0px))] backdrop-blur-xl backdrop-saturate-150 [view-transition-name:docs-mobile-header] lg:hidden">
        <Link href="/" aria-label="Canvas UI home" className="rounded-sm">
          <Image
            src="/logo.svg"
            alt="Canvas UI"
            width={104}
            height={21}
            priority
            className="invert dark:invert-0"
          />
        </Link>
        <div className="flex items-center gap-2">
          <NewsletterNavButton mode="scroll" className="grid" />
          <SearchButton />
          <ThemeToggle />
          <GitHubStars />
          <DocsMobileNav />
        </div>
      </div>

      <div className="surface-floating fixed top-4 right-[calc(1rem+var(--demo-sbw,0px))] z-40 hidden items-center gap-1.5 rounded-bar p-1 [view-transition-name:docs-controls] lg:flex">
        <NewsletterNavButton mode="scroll" className="grid xl:hidden" />
        <NewsletterNavButton />
        <SearchButton />
        <ThemeToggle />
        <GitHubStars />
      </div>

      <SearchDialog />

      <main className="flex-1 px-5 py-10 sm:px-8 lg:pt-16 lg:pr-8 lg:pl-72">
        {children}

        <NewsletterInline id="newsletter" />
      </main>

      <NewsletterPanel />
    </div>
  );
}
