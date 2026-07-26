"use client";

import {
  Accordion,
  AccordionHeader,
  AccordionItem,
  AccordionPanel,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import type { TOCItemType } from "./toc-minimap";

export function TOCMobile({ items }: { items: TOCItemType[] }) {
  if (!items.length) return null;

  function scrollToHeading(url: string) {
    history.pushState(null, "", url);
    document.getElementById(url.replace("#", ""))?.scrollIntoView({
      behavior: "smooth",
    });
  }

  return (
    <Accordion className="xl:hidden not-typeset mt-6 mb-4 rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
      <AccordionItem value="toc">
        <AccordionHeader render={<div />} className="flex">
          <AccordionTrigger className="w-full text-sm font-medium">
            On this page
          </AccordionTrigger>
        </AccordionHeader>
        <AccordionPanel>
          <nav className="mt-2 flex flex-col gap-0.5">
            {items.map((item) => (
              <button
                key={item.url}
                onClick={() => scrollToHeading(item.url)}
                className={cn(
                  "w-full text-left text-[13px] leading-6 text-muted-foreground transition-colors hover:text-foreground py-1",
                  item.depth >= 3 && "pl-4",
                  item.depth >= 4 && "pl-8",
                )}
              >
                {item.title}
              </button>
            ))}
          </nav>
        </AccordionPanel>
      </AccordionItem>
    </Accordion>
  );
}
