"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "@/components/icons";

import { useThemeToggle } from "@/hooks/use-theme-toggle";

const emptySubscribe = () => () => {};

export function ThemeToggle() {
  const { resolvedTheme, toggleTheme } = useThemeToggle();
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  const isDark = mounted && resolvedTheme === "dark";

  return (
    <button
      type="button"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={toggleTheme}
      className="btn-icon btn-icon-quiet"
    >
      <Sun
        aria-hidden
        className="col-start-1 row-start-1 size-[17px] scale-100 rotate-0 opacity-100 blur-none transition-[opacity,filter,transform] duration-300 ease-out dark:scale-75 dark:-rotate-45 dark:opacity-0 dark:blur-[2px] motion-reduce:transform-none motion-reduce:transition-[opacity]"
      />
      <Moon
        aria-hidden
        className="col-start-1 row-start-1 size-[17px] scale-75 rotate-45 opacity-0 blur-[2px] transition-[opacity,filter,transform] duration-300 ease-out dark:scale-100 dark:rotate-0 dark:opacity-100 dark:blur-none motion-reduce:transform-none motion-reduce:transition-[opacity]"
      />
    </button>
  );
}
