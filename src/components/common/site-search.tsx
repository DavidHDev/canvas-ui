"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Search } from "@/components/icons";
import { useRouter } from "next/navigation";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";

import { ORDERED_COMPONENTS } from "@/components/common/component-groups";
import { DURATION, EASE_OUT } from "@/components/common/motion-tokens";
import { cn } from "@/lib/utils";

type Source = "keyboard" | "pointer";

let searchOpen = false;
let lastSource: Source = "pointer";
const listeners = new Set<() => void>();

function setSearchOpen(next: boolean, source: Source) {
  searchOpen = next;
  lastSource = source;
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
  suggested?: boolean;
  isNew?: boolean;
}

const DOC_ENTRIES: SearchEntry[] = [
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
  {
    href: "/docs/rendering",
    label: "Rendering",
    section: "Getting Started",
    hint: "webgl webgpu vgpu wgsl renderer",
  },
  { href: "/docs/mcp", label: "MCP", section: "Getting Started" },
  {
    href: "/components",
    label: "Browse All",
    section: "Components",
    hint: "catalogue gallery live html universal",
    suggested: true,
  },
];

const HINTS: Record<string, string> = {
  "ascii-object":
    "ascii 3d model glb gltf svg image studio three.js characters glyph shape terminal",
  "ascii-sweep":
    "ascii sweep swap transition tabs text swap band glow terminal glyph scan",
  "asciify":
    "ascii text characters cursor trail overlay gradient glyph terminal matrix ripple click",
  "bend": "scroll cube fold",
  "blaze": "fire sparks embers smoke heat haze glow background footer hero",
  "bubble":
    "droplet metaball glass refraction cursor trail liquid blob",
  "canvas":
    "woven fabric texture paper linen burlap parchment scroll folds print material background overlay",
  "cloth": "fabric flag wind wave textile banner ripple",
  "clouds": "fog mist wind",
  "decrypt-reveal":
    "ascii cipher hover matrix hacker encrypt decode text",
  "dithered-object":
    "3d model gltf glb svg png bayer halftone floyd steinberg",
  "displacement":
    "grid distortion warp ripple chromatic aberration grain",
  "droplets": "rain water refraction",
  "flame-wrap":
    "fire flame border burning hot sparks heat molten edge card",
  "force-field":
    "shield energy hexagon hex grid lattice ripple shockwave impact refraction plasma sci-fi",
  "frost":
    "ice frozen frost melt refraction winter freeze snow blur glass pane",
  "glass": "lens refraction magnify zoom",
  "glass-object":
    "liquid glass 3d model svg png refraction dispersion transmission three.js",
  "glitch":
    "glitch burst rgb split slices corruption datamosh broadcast tear noise",
  "glyph-rain":
    "matrix rain code falling glyphs katakana light glow digital",
  "grid": "3d tiles ripple waves",
  "hex-float": "hexagon tiles shiny perspective tilt cursor lift",
  "ink-object":
    "3d model gltf glb svg png ink hatching strokes dashes print linocut woodcut",
  "laser": "beam scroll reveal glow",
  "liquid": "fluid simulation water",
  "magnify": "zoom lens hud reticle scanner sci-fi ripple magnifier",
  "particle-object":
    "particles 3d model svg png image push physics point cloud three.js",
  "particle-reveal": "dust grains cursor",
  "particle-scroll": "sand dissolve scroll",
  "peel": "page curl sticker corner",
  "retro-dither": "pixel lens gameboy",
  "ripple": "water rings waves click pond splash refraction",
  "shatter":
    "3d glass shards break lift float refraction pieces fragments cursor lens broken tiles",
  "liquid-object":
    "liquid fluid water ripple warp distort chromatic aberration rainbow fringe swirl eddy melt 3d model glb svg png image logo cursor three.js",
  "vhs": "tape scanlines noise grain",
  "chrome-object":
    "liquid metal chrome mirror reflection silver 3d model svg png environment three.js",
  "topographic-object":
    "contour lines map terrain elevation survey topo 3d model svg png three.js",
  "wireframe-object":
    "wireframe edges lines mesh blueprint technical hidden line nodes 3d model svg png three.js",
};

const COMPONENT_ENTRIES: SearchEntry[] = ORDERED_COMPONENTS.map((entry) => {
  const slug = entry.href.split("/").pop() ?? "";
  return {
    href: entry.href,
    label: entry.name,
    section: "Components",
    hint: `${HINTS[slug] ?? ""} ${entry.description}`,
    isNew: entry.isNew,
  };
});

const ENTRIES = [...DOC_ENTRIES, ...COMPONENT_ENTRIES];

function matches(entry: SearchEntry, query: string) {
  const haystack =
    `${entry.label} ${entry.section} ${entry.hint ?? ""}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((word) => haystack.includes(word));
}

const SECTION_ORDER = Array.from(new Set(ENTRIES.map((entry) => entry.section)));

function rank(entries: SearchEntry[], query: string) {
  const q = query.trim().toLowerCase();
  const score = (entry: SearchEntry) => {
    const label = entry.label.toLowerCase();
    if (label.startsWith(q)) return 0;
    if (label.includes(q)) return 1;
    return 2;
  };
  return entries
    .map((entry, index) => ({ entry, index, score: score(entry) }))
    .sort(
      (a, b) =>
        SECTION_ORDER.indexOf(a.entry.section) -
          SECTION_ORDER.indexOf(b.entry.section) ||
        a.score - b.score ||
        a.index - b.index,
    )
    .map(({ entry }) => entry);
}

export function SearchButton() {
  return (
    <button
      type="button"
      aria-label="Search"
      aria-keyshortcuts="Meta+K /"
      onClick={() => setSearchOpen(true, "pointer")}
      className="btn-icon btn-icon-quiet"
    >
      <Search aria-hidden className="size-[16px]" />
    </button>
  );
}

type Mode = "instant" | "reduced" | "full";

const backdropVariants = {
  hidden: (mode: Mode) => ({
    opacity: 0,
    transition: { duration: mode === "instant" ? 0 : DURATION.exit },
  }),
  shown: (mode: Mode) => ({
    opacity: 1,
    transition: {
      duration: mode === "instant" ? 0 : DURATION.base,
      ease: EASE_OUT,
    },
  }),
};

const panelVariants = {
  hidden: (mode: Mode) =>
    mode === "full"
      ? {
          opacity: 0,
          transform: "translateY(6px) scale(0.98)",
          transition: { duration: DURATION.exit, ease: EASE_OUT },
        }
      : {
          opacity: 0,
          transition: { duration: mode === "instant" ? 0 : DURATION.exit },
        },
  shown: (mode: Mode) => ({
    opacity: 1,
    transform: "translateY(0px) scale(1)",
    transition: {
      duration: mode === "instant" ? 0 : DURATION.base,
      ease: EASE_OUT,
    },
  }),
};

export function SearchDialog() {
  const router = useRouter();
  const shouldReduceMotion = useReducedMotion();
  const open = useSyncExternalStore(
    subscribe,
    () => searchOpen,
    () => false,
  );
  const source = useSyncExternalStore(
    subscribe,
    () => lastSource,
    () => "pointer" as Source,
  );
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );
  const mode: Mode =
    source === "keyboard" ? "instant" : shouldReduceMotion ? "reduced" : "full";

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(!searchOpen, "keyboard");
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
        setSearchOpen(true, "keyboard");
      } else if (event.key === "Escape" && searchOpen) {
        setSearchOpen(false, "keyboard");
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

  const go = (href: string, via: Source) => {
    setSearchOpen(false, via);
    router.push(href);
  };

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence custom={mode}>
      {open && (
        <motion.div
          key="search"
          custom={mode}
          variants={backdropVariants}
          initial="hidden"
          animate="shown"
          exit="hidden"
          className="fixed inset-0 z-100 flex items-start justify-center bg-background/50 px-4 pt-[16vh] backdrop-blur-sm sm:px-5"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) {
              setSearchOpen(false, "pointer");
            }
          }}
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label="Search"
            custom={mode}
            variants={panelVariants}
            initial="hidden"
            animate="shown"
            exit="hidden"
            className="surface-popover w-full max-w-md overflow-hidden rounded-panel p-0"
          >
            <SearchPanel go={go} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function SearchPanel({ go }: { go: (href: string, via: Source) => void }) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);

  const searching = query.trim().length > 0;
  const results = useMemo(
    () =>
      searching
        ? rank(ENTRIES.filter((entry) => matches(entry, query)), query)
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
      go(results[activeIndex].href, "keyboard");
    }
  };

  let lastSection = "";

  return (
    <>
      <div className="flex items-center gap-2.5 border-b border-border-subtle px-4">
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
          className="h-12 w-full bg-transparent text-[16px] outline-none placeholder:text-muted-foreground/70 sm:text-[14px]"
        />
        <kbd className="kbd shrink-0">esc</kbd>
      </div>

      <div ref={listRef} className="max-h-[46vh] overflow-y-auto overscroll-contain p-2">
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
                  <p
                    className={cn(
                      "px-2.5 pb-1.5 text-[12px] font-medium text-muted-foreground/70",
                      index === 0 ? "pt-1" : "pt-3",
                    )}
                  >
                    {heading}
                  </p>
                ) : null}
                <button
                  type="button"
                  data-active={active}
                  onClick={() => go(entry.href, "pointer")}
                  onPointerMove={() => setActiveIndex(index)}
                  className={cn(
                    "flex w-full cursor-pointer items-center gap-1.5 rounded-control px-2.5 py-2 text-left text-[13.5px] outline-none",
                    active
                      ? "bg-[var(--surface-hover)] text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {entry.label}
                  {entry.isNew ? (
                    <>
                      <span
                        aria-hidden
                        className="size-1.5 shrink-0 rounded-full bg-blue-500"
                      />
                      <span className="sr-only">New</span>
                    </>
                  ) : null}
                </button>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
