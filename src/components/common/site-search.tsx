"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";

import { cn } from "@/lib/utils";

const EASE = [0.23, 1, 0.32, 1] as const;

let searchOpen = false;
const listeners = new Set<() => void>();

function setSearchOpen(next: boolean) {
  searchOpen = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const emptySubscribe = () => () => {};

interface SearchEntry {
  href: string;
  label: string;
  section: string;
  hint?: string;
  /** Shown as a quick link before the user types anything. */
  suggested?: boolean;
}

const ENTRIES: SearchEntry[] = [
  {
    href: "/docs",
    label: "Introduction",
    section: "Getting Started",
    suggested: true,
  },
  {
    href: "/docs/installation",
    label: "Installation",
    section: "Getting Started",
    suggested: true,
  },
  { href: "/docs/mcp", label: "MCP", section: "Getting Started" },
  {
    href: "/components",
    label: "Browse All",
    section: "Components",
    suggested: true,
  },
  {
    href: "/docs/components/ascii-object",
    label: "ASCII Object",
    section: "Components",
    hint: "ascii 3d model glb gltf svg image studio three.js characters glyph shape terminal",
  },
  {
    href: "/docs/components/ascii-sweep",
    label: "ASCII Sweep",
    section: "Components",
    hint: "ascii sweep swap transition tabs text swap band glow terminal glyph scan",
  },
  {
    href: "/docs/components/asciify",
    label: "Asciify",
    section: "Components",
    hint: "ascii text characters filter cursor lens terminal glyph matrix",
  },
  {
    href: "/docs/components/bend",
    label: "Bend",
    section: "Components",
    hint: "scroll cube fold",
  },
  {
    href: "/docs/components/blaze",
    label: "Blaze",
    section: "Components",
    hint: "fire sparks smoke heat",
  },
  {
    href: "/docs/components/bubble",
    label: "Bubble",
    section: "Components",
    hint: "droplet metaball glass refraction cursor trail liquid blob",
  },
  {
    href: "/docs/components/canvas",
    label: "Canvas",
    section: "Components",
    hint: "painting woven fabric texture paper halftone grain screen print",
  },
  {
    href: "/docs/components/cloth",
    label: "Cloth",
    section: "Components",
    hint: "fabric flag wind wave textile banner ripple",
  },
  {
    href: "/docs/components/clouds",
    label: "Clouds",
    section: "Components",
    hint: "fog mist wind",
  },
  {
    href: "/docs/components/decrypt-reveal",
    label: "Decrypt Reveal",
    section: "Components",
    hint: "ascii cipher hover matrix hacker encrypt decode text",
  },
  {
    href: "/docs/components/dithered-object",
    label: "Dithered Object",
    section: "Components",
    hint: "3d model gltf glb svg png bayer halftone floyd steinberg",
  },
  {
    href: "/docs/components/displacement",
    label: "Displacement",
    section: "Components",
    hint: "grid distortion warp ripple chromatic aberration grain",
  },
  {
    href: "/docs/components/droplets",
    label: "Droplets",
    section: "Components",
    hint: "rain water refraction",
  },
  {
    href: "/docs/components/flame-wrap",
    label: "Flame Wrap",
    section: "Components",
    hint: "fire flame border burning hot sparks heat molten edge card",
  },
  {
    href: "/docs/components/force-field",
    label: "Force Field",
    section: "Components",
    hint: "shield energy hexagon hex grid lattice ripple shockwave impact refraction plasma sci-fi",
  },
  {
    href: "/docs/components/frost",
    label: "Frost",
    section: "Components",
    hint: "ice frozen frost melt refraction winter freeze snow blur glass pane",
  },
  {
    href: "/docs/components/glass",
    label: "Glass",
    section: "Components",
    hint: "lens refraction magnify zoom",
  },
  {
    href: "/docs/components/glass-object",
    label: "Glass Object",
    section: "Components",
    hint: "liquid glass 3d model svg png refraction dispersion transmission three.js",
  },
  {
    href: "/docs/components/glitch",
    label: "Glitch",
    section: "Components",
    hint: "glitch burst rgb split slices corruption datamosh broadcast tear noise",
  },
  {
    href: "/docs/components/glyph-rain",
    label: "Glyph Rain",
    section: "Components",
    hint: "matrix rain code falling glyphs katakana light glow digital",
  },
  {
    href: "/docs/components/grid",
    label: "Grid",
    section: "Components",
    hint: "3d tiles ripple waves",
  },
  {
    href: "/docs/components/hex-float",
    label: "Hex Float",
    section: "Components",
    hint: "hexagon tiles shiny perspective tilt cursor lift",
  },
  {
    href: "/docs/components/ink-object",
    label: "Ink Object",
    section: "Components",
    hint: "3d model gltf glb svg png ink hatching strokes dashes print linocut woodcut",
  },
  {
    href: "/docs/components/laser",
    label: "Laser",
    section: "Components",
    hint: "beam scroll reveal glow",
  },
  {
    href: "/docs/components/liquid",
    label: "Liquid",
    section: "Components",
    hint: "fluid simulation water",
  },
  {
    href: "/docs/components/magnify",
    label: "Magnify",
    section: "Components",
    hint: "zoom lens hud reticle scanner sci-fi ripple magnifier",
  },
  {
    href: "/docs/components/particle-object",
    label: "Particle Object",
    section: "Components",
    hint: "particles 3d model svg png image push physics point cloud three.js",
  },
  {
    href: "/docs/components/particle-reveal",
    label: "Particle Reveal",
    section: "Components",
    hint: "dust grains cursor",
  },
  {
    href: "/docs/components/particle-scroll",
    label: "Particle Scroll",
    section: "Components",
    hint: "sand dissolve scroll",
  },
  {
    href: "/docs/components/peel",
    label: "Peel",
    section: "Components",
    hint: "page curl sticker corner",
  },
  {
    href: "/docs/components/retro-dither",
    label: "Retro Dither",
    section: "Components",
    hint: "pixel lens gameboy",
  },
  {
    href: "/docs/components/ripple",
    label: "Ripple",
    section: "Components",
    hint: "water rings waves click pond splash refraction",
  },
  {
    href: "/docs/components/shatter",
    label: "Shatter",
    section: "Components",
    hint: "3d glass shards break lift float refraction pieces fragments cursor lens broken tiles",
  },
  {
    href: "/docs/components/liquid-object",
    label: "Liquid Object",
    section: "Components",
    hint: "liquid fluid water ripple warp distort chromatic aberration rainbow fringe swirl eddy melt 3d model glb svg png image logo cursor three.js",
  },
  {
    href: "/docs/components/vhs",
    label: "VHS",
    section: "Components",
    hint: "tape scanlines noise grain",
  },
];

function matches(entry: SearchEntry, query: string) {
  const haystack =
    `${entry.label} ${entry.section} ${entry.hint ?? ""}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

export function SearchButton() {
  return (
    <button
      type="button"
      aria-label="Search"
      onClick={() => setSearchOpen(true)}
      className="grid size-8 place-items-center rounded-full border border-border/70 text-muted-foreground transition-[color,transform] duration-150 ease-out hover:text-foreground active:scale-95 motion-reduce:transition-none sm:border-transparent"
    >
      <Search aria-hidden className="size-[16px]" />
    </button>
  );
}

export function SearchDialog() {
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();
  const open = useSyncExternalStore(
    subscribe,
    () => searchOpen,
    () => false,
  );
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(!searchOpen);
      } else if (event.key === "/" && !searchOpen) {
        const target = event.target as HTMLElement | null;
        if (
          target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.tagName === "SELECT" ||
            target.isContentEditable)
        ) {
          return;
        }
        event.preventDefault();
        setSearchOpen(true);
      } else if (event.key === "Escape" && searchOpen) {
        setSearchOpen(false);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  const go = (href: string) => {
    setSearchOpen(false);
    router.push(href);
  };

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.12 } }}
          transition={{ duration: 0.2, ease: EASE }}
          className="fixed inset-0 z-100 flex items-start justify-center bg-background/40 px-5 pt-[18vh] backdrop-blur-md"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) setSearchOpen(false);
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Search"
            initial={
              shouldReduceMotion
                ? { opacity: 0 }
                : { opacity: 0, scale: 0.97, y: 8 }
            }
            animate={
              shouldReduceMotion
                ? { opacity: 1 }
                : { opacity: 1, scale: 1, y: 0 }
            }
            exit={
              shouldReduceMotion
                ? { opacity: 0, transition: { duration: 0.12 } }
                : {
                    opacity: 0,
                    scale: 0.98,
                    transition: { duration: 0.12, ease: EASE },
                  }
            }
            transition={{ duration: 0.2, ease: EASE }}
            className="w-full max-w-md overflow-hidden rounded-2xl border border-border/60 bg-background/85 shadow-xl shadow-black/10 backdrop-blur-xl backdrop-saturate-150"
          >
            <SearchPanel go={go} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function SearchPanel({ go }: { go: (href: string) => void }) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);

  const searching = query.trim().length > 0;
  const results = useMemo(
    () =>
      searching
        ? ENTRIES.filter((entry) => matches(entry, query))
        : ENTRIES.filter((entry) => entry.suggested),
    [query, searching],
  );

  const moveActive = (next: number) => {
    setActiveIndex(next);
    requestAnimationFrame(() => {
      listRef.current
        ?.querySelector('[data-active="true"]')
        ?.scrollIntoView({ block: "nearest" });
    });
  };

  const onInputKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      moveActive(Math.min(activeIndex + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      moveActive(Math.max(activeIndex - 1, 0));
    } else if (event.key === "Enter" && results[activeIndex]) {
      event.preventDefault();
      go(results[activeIndex].href);
    }
  };

  let lastSection = "";

  return (
    <>
      <div className="flex items-center gap-2.5 border-b border-border/60 px-4">
        <Search aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <input
          autoFocus
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={onInputKeyDown}
          placeholder="Search components and docs"
          aria-label="Search components and docs"
          className="h-12 w-full bg-transparent text-[14px] outline-none placeholder:text-muted-foreground/70"
        />
        <kbd className="shrink-0 rounded-md border border-border/60 px-1.5 py-0.5 text-[11px] text-muted-foreground/70">
          esc
        </kbd>
      </div>

      <div ref={listRef} className="max-h-[46vh] overflow-y-auto p-2">
        {results.length === 0 ? (
          <p className="px-2.5 py-6 text-center text-[13px] text-muted-foreground">
            No results for &ldquo;{query}&rdquo;
          </p>
        ) : (
          results.map((entry, index) => {
            const section = searching ? entry.section : "Quick links";
            const heading = section !== lastSection ? section : null;
            lastSection = section;
            const active = index === activeIndex;
            return (
              <div key={entry.href}>
                {heading ? (
                  <p className="px-2.5 pt-3 pb-1.5 text-[12px] font-medium text-muted-foreground/70 first:pt-1">
                    {heading}
                  </p>
                ) : null}
                <button
                  type="button"
                  data-active={active}
                  onClick={() => go(entry.href)}
                  onPointerMove={() => setActiveIndex(index)}
                  className={cn(
                    "flex w-full cursor-pointer items-center rounded-lg px-2.5 py-2 text-left text-[13.5px] transition-colors duration-100",
                    active
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {entry.label}
                </button>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
