"use client";

import { usePathname } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Menu, X } from "@/components/icons";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { DURATION, EASE_DRAWER, EASE_OUT } from "@/components/common/motion-tokens";
import { SiteLogo } from "@/components/common/site-logo";
import {
  centerActiveLink,
  DocsNavList,
  PlaygroundCta,
  useScrollFade,
} from "@/components/docs/docs-sidebar";

export function DocsMobileNav() {
  const shouldReduceMotion = useReducedMotion();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [lastPathname, setLastPathname] = useState(pathname);
  const [setNavEl, navEl] = useScrollFade();
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);

  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    document.documentElement.style.overflow = "hidden";
    dialogRef.current?.focus({ preventScroll: true });
    const trigger = triggerRef.current;
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.documentElement.style.removeProperty("overflow");
      trigger?.focus({ preventScroll: true });
    };
  }, [open]);

  useEffect(() => {
    centerActiveLink(navEl);
  }, [navEl]);

  const content = shouldReduceMotion
    ? { hidden: { opacity: 0 }, shown: { opacity: 1 } }
    : {
        hidden: { opacity: 0, transform: "translateY(-8px)" },
        shown: { opacity: 1, transform: "translateY(0px)" },
      };

  return (
    <div className="lg:hidden">
      <button
        ref={triggerRef}
        type="button"
        aria-label="Open docs navigation"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className="btn-icon"
      >
        <Menu aria-hidden className="size-[17px]" />
      </button>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && (
              <motion.div
                role="dialog"
                aria-modal="true"
                aria-label="Docs navigation"
                initial={{ opacity: 0 }}
                animate={{
                  opacity: 1,
                  transition: { duration: DURATION.base, ease: EASE_OUT },
                }}
                exit={{
                  opacity: 0,
                  transition: { duration: DURATION.exit, ease: EASE_OUT },
                }}
                className="fixed inset-0 z-60 bg-background lg:hidden"
              >
                <motion.div
                  ref={dialogRef}
                  tabIndex={-1}
                  initial={content.hidden}
                  animate={{
                    ...content.shown,
                    transition: { duration: DURATION.slow, ease: EASE_DRAWER },
                  }}
                  exit={{
                    ...content.hidden,
                    transition: { duration: DURATION.exit, ease: EASE_OUT },
                  }}
                  className="flex h-full flex-col outline-none"
                >
                  <div className="flex items-center justify-between px-5 pt-5 pb-4">
                    <SiteLogo />
                    <button
                      type="button"
                      aria-label="Close docs navigation"
                      onClick={() => setOpen(false)}
                      className="btn-icon"
                    >
                      <X aria-hidden className="size-[17px]" />
                    </button>
                  </div>

                  <nav
                    ref={setNavEl}
                    aria-label="Docs"
                    className="demo-controls-scroll flex-1 overflow-y-auto overscroll-contain px-3 pb-5"
                  >
                    <DocsNavList onNavigate={() => setOpen(false)} />
                  </nav>

                  <PlaygroundCta onNavigate={() => setOpen(false)} />
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}
