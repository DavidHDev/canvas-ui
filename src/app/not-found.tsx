import Link from "next/link";
import { ArrowRight } from "@/components/icons";

import { Navbar } from "@/components/landing/navbar";

export default function NotFound() {
  return (
    <>
      <Navbar />
      <main className="page-enter flex min-h-svh flex-col items-center justify-center px-5 pt-14 text-center sm:px-8">
        <p className="chip font-mono tabular-nums">404</p>
        <h1 className="mt-5 text-[clamp(2.25rem,5.5vw,3.25rem)] leading-[1.04] font-medium tracking-tighter text-balance">
          Nothing here yet.
        </h1>
        <p className="mt-4 max-w-md text-base leading-7 text-balance text-muted-foreground">
          The page you are looking for does not exist or has moved.
        </p>
        <div className="mt-8 flex w-full flex-col items-stretch gap-3 sm:w-auto sm:flex-row sm:items-center">
          <Link
            href="/"
            className="group inline-flex h-11 items-center justify-center gap-2 rounded-control bg-foreground px-6 text-[15px] font-medium tracking-[-0.01em] text-background transition-[opacity,transform] duration-150 ease-out hover:opacity-85 active:scale-[0.98]"
          >
            Back home
            <ArrowRight
              aria-hidden
              strokeWidth={2.25}
              className="-mr-1.5 size-[15px] transition-transform duration-200 ease-out group-hover:translate-x-0.5 motion-reduce:transition-none"
            />
          </Link>
          <Link
            href="/components"
            className="inline-flex h-11 items-center justify-center rounded-control bg-muted/60 px-6 text-[15px] font-medium text-foreground transition-[border-color,background-color,transform] duration-150 ease-out hover:border-border-strong hover:bg-[var(--surface-hover)] active:scale-[0.98]"
          >
            Browse components
          </Link>
        </div>
      </main>
    </>
  );
}
