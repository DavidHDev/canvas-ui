"use client";

import { Quote } from "lucide-react";
import Image from "next/image";
import { useCallback, useSyncExternalStore, type ReactNode } from "react";

import { Reveal } from "@/components/landing/reveal";
import { Bend } from "@/components/docs/live/Bend";

interface CommunityQuote {
  author: string;
  handle: string;
  text: string;
  url: string;
}

const QUOTES: CommunityQuote[] = [
  {
    author: "Chrome for Developers",
    handle: "ChromiumDev",
    text: "Great to see HTML-in-Canvas already empowering new frameworks to bring the power of this API to more developers.",
    url: "https://x.com/ChromiumDev/status/2080344080085577968?s=20",
  },
  {
    author: "shadcn",
    handle: "shadcn",
    text: "One of the most impressive registries I've seen. I don't even know how half of this works. Congrats on the launch.",
    url: "https://x.com/shadcn/status/2080259921816220118?s=20",
  },
  {
    author: "Evan Robertson",
    handle: "evanbrobertson",
    text: "I haven't been this impressed with effects in the browser in a long time.",
    url: "https://x.com/evanbrobertson/status/2080276793433419785?s=20",
  },
  {
    author: "Maarten",
    handle: "mrvdlei",
    text: "Without a doubt the biggest UI release of the year.",
    url: "https://x.com/mrvdlei/status/2080288325689110841?s=20",
  },
  {
    author: "Wasil",
    handle: "arwasil",
    text: "Make the web fun again.",
    url: "https://x.com/arwasil/status/2080283031307522112?s=20",
  },
  {
    author: "Farhad Nawab",
    handle: "FarhadNawab",
    text: "Landing pages are about to get a lot harder to ignore.",
    url: "https://x.com/FarhadNawab/status/2080307076576968757?s=20",
  },
  {
    author: "Aleksandr Pasevin",
    handle: "A_Pasevin",
    text: "The tech of my dreams is finally here.",
    url: "https://x.com/A_Pasevin/status/2080274902372823210?s=20",
  },
  {
    author: "Shounak Ghosh",
    handle: "shahankk42",
    text: "My mind is officially blown.",
    url: "https://x.com/shahankk42/status/2080275172553331052?s=20",
  },
  {
    author: "Dennis Morello",
    handle: "morellodev",
    text: "Name a cooler UI library. I'll wait.",
    url: "https://x.com/morellodev/status/2080278692249424023?s=20",
  },
  {
    author: "Francisco Macedo",
    handle: "franbmacedo",
    text: "The state of the art for products in the age of AI: building blocks that work well and are easy for an LLM to use.",
    url: "https://x.com/franbmacedo/status/2080300346706890810?s=20",
  },
  {
    author: "Marcel",
    handle: "miltovi777",
    text: "My mind is blown. The future of the web is so cool.",
    url: "https://x.com/miltovi777/status/2080319581827002543?s=20",
  },
  {
    author: "Dennis",
    handle: "Denn1s_B",
    text: "Are we witnessing history in the making right now?",
    url: "https://x.com/Denn1s_B/status/2080488703701745726?s=20",
  },
  {
    author: "jhcoder",
    handle: "J_HardCoder",
    text: "An HTML-in-Canvas component library... groundbreaking, crazy, and amazing.",
    url: "https://x.com/J_HardCoder/status/2080480446589345928?s=20",
  },
  {
    author: "Andrew V",
    handle: "AI_Andrew",
    text: "The internet should not be allowed to be this fun.",
    url: "https://x.com/AI_Andrew/status/2080453298214109405?s=20",
  },
  {
    author: "Karim",
    handle: "karimthemghribi",
    text: "This is legendary.",
    url: "https://x.com/karimthemghribi/status/2080449614029930509?s=20",
  },
  {
    author: "Guan Mu",
    handle: "ZeroZ_JQ",
    text: "Imagination maxed out.",
    url: "https://x.com/ZeroZ_JQ/status/2080448387699339707?s=20",
  },
  {
    author: "Pierre",
    handle: "pgllmt",
    text: "The first true HTML-in-Canvas component library. The kind of thing that moves the web forward.",
    url: "https://x.com/pgllmt/status/2080322186506563832?s=20",
  },
  {
    author: "Skinner",
    handle: "CreativeSkyAI",
    text: "This is art.",
    url: "https://x.com/CreativeSkyAI/status/2080423928694972583?s=20",
  },
];

const ROWS = [
  { items: QUOTES.slice(0, 9), duration: "78s", reverse: false },
  { items: QUOTES.slice(9), duration: "88s", reverse: true },
] as const;

const DESKTOP_QUERY = "(min-width: 48rem)";

function subscribeDesktop(onChange: () => void) {
  const query = window.matchMedia(DESKTOP_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function useIsDesktop() {
  return useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia(DESKTOP_QUERY).matches,
    () => false,
  );
}

function HorizontalBend({ children }: { children: ReactNode }) {
  const setSpacerRef = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    requestAnimationFrame(() => {
      if (node.parentElement) {
        const scrollRange =
          node.parentElement.scrollHeight - node.parentElement.clientHeight;
        node.parentElement.scrollTop = scrollRange / 2;
      }
    });
  }, []);

  return (
    <div className="community-horizontal-bend-shell">
      <Bend
        zone={128}
        angle={76}
        rounding={108}
        perspective={760}
        direction="in"
        ease={1}
        smoothing={0.18}
        top
        bottom
        tumble={0}
        tilt={0}
        interactionRotation={-90}
        className="community-horizontal-bend"
      >
        <div ref={setSpacerRef} className="community-bend-scroll-spacer">
          <div className="community-horizontal-bend-content">{children}</div>
        </div>
      </Bend>
    </div>
  );
}

function QuoteCard({
  quote,
  focusable,
}: {
  quote: CommunityQuote;
  focusable: boolean;
}) {
  return (
    <a
      href={quote.url}
      target="_blank"
      rel="noreferrer"
      tabIndex={focusable ? undefined : -1}
      className="community-quote-card group block h-44 w-72 shrink-0 rounded-2xl border border-border/60 bg-muted/30 p-2 text-left sm:w-80"
      aria-label={`${quote.author} on X: ${quote.text}`}
    >
      <div className="flex h-full flex-col rounded-lg border border-dashed border-border/70 bg-background p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Image
              src={`/assets/community/${quote.handle}.jpg`}
              alt=""
              width={40}
              height={40}
              loading="eager"
              className="community-quote-avatar size-10 shrink-0 rounded-full border border-border/60 object-cover"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium tracking-tight">
                {quote.author}
              </p>
              <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                @{quote.handle}
              </p>
            </div>
          </div>
          <Quote
            aria-hidden
            className="size-4 shrink-0 fill-current text-muted-foreground/30"
            strokeWidth={0}
          />
        </div>
        <blockquote className="mt-auto line-clamp-3 text-[15px] leading-6 text-muted-foreground">
          {quote.text}
        </blockquote>
      </div>
    </a>
  );
}

function MobileQuotes() {
  return (
    <div className="flex flex-col gap-4">
      {ROWS.map((row, rowIndex) => (
        <ul key={rowIndex} className="community-quotes-scroller flex gap-4">
          {row.items.map((quote) => (
            <li key={quote.url} className="community-quote-snap">
              <QuoteCard quote={quote} focusable />
            </li>
          ))}
        </ul>
      ))}
    </div>
  );
}

export function CommunityQuotes() {
  const isDesktop = useIsDesktop();

  return (
    <div className="mt-28 sm:mt-36">
      <Reveal>
        <h2 className="text-3xl font-medium tracking-tighter text-balance sm:text-4xl">
          Words from X
        </h2>
        <p className="mt-4 max-w-md text-base leading-7 text-muted-foreground">
          What developers are saying about Canvas UI.
        </p>
      </Reveal>

      <Reveal delay={80} className="-mx-5 mt-12 sm:-mx-8">
        {isDesktop ? (
          <HorizontalBend>
            <div className="community-quotes-marquee overflow-hidden">
              <div className="flex flex-col gap-4">
                {ROWS.map((row, rowIndex) => (
                  <div key={rowIndex} className="community-marquee">
                    <div
                      className="community-marquee-track flex w-max"
                      data-direction={row.reverse ? "reverse" : undefined}
                      style={
                        {
                          "--community-marquee-duration": row.duration,
                        } as React.CSSProperties
                      }
                    >
                      {[0, 1].map((copy) => (
                        <ul
                          key={copy}
                          aria-hidden={copy === 1 || undefined}
                          className="flex gap-4 pr-4"
                        >
                          {row.items.map((quote) => (
                            <li key={quote.url}>
                              <QuoteCard quote={quote} focusable={copy === 0} />
                            </li>
                          ))}
                        </ul>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </HorizontalBend>
        ) : (
          <MobileQuotes />
        )}
      </Reveal>
    </div>
  );
}
