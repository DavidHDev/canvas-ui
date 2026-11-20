"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "@/components/icons";

import { cn } from "@/lib/utils";

const links = [
  { href: "/docs", label: "Docs" },
  { href: "/components", label: "Components" },
  { href: "/playground", label: "Playground" },
];

export function MobileMenu() {
  const [open, setOpen] = useState(false);

  return (
    <div className="sm:hidden">
      <button
        type="button"
        aria-label={open ? "Close menu" : "Open menu"}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="btn-icon"
      >
        <Menu
          aria-hidden
          className={cn(
            "col-start-1 row-start-1 size-[18px] transition-[opacity,filter] duration-200 ease-out motion-reduce:transition-none",
            open ? "opacity-0 blur-[3px]" : "opacity-100 blur-none",
          )}
        />
        <X
          aria-hidden
          className={cn(
            "col-start-1 row-start-1 size-[18px] transition-[opacity,filter] duration-200 ease-out motion-reduce:transition-none",
            open ? "opacity-100 blur-none" : "opacity-0 blur-[3px]",
          )}
        />
      </button>

      <div
        className={cn(
          "absolute inset-x-0 top-full border-b border-border bg-background shadow-[var(--shadow-float)] transition-[opacity,transform] ease-drawer motion-reduce:transition-none",
          open
            ? "translate-y-0 opacity-100 duration-300"
            : "pointer-events-none -translate-y-1.5 opacity-0 duration-150",
        )}
      >
        <ul className="flex flex-col px-3 py-3">
          {links.map((link, i) => (
            <li
              key={link.href}
              style={{ transitionDelay: open ? `${40 + i * 35}ms` : "0ms" }}
              className={cn(
                "transition-[opacity,transform] ease-out motion-reduce:transition-none",
                open
                  ? "translate-y-0 opacity-100 duration-250"
                  : "-translate-y-1 opacity-0 duration-150",
              )}
            >
              <Link
                href={link.href}
                onClick={() => setOpen(false)}
                className="block rounded-control px-2 py-2.5 text-[15px] text-muted-foreground transition-colors duration-150 hover:bg-[var(--surface-hover)] hover:text-foreground"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
