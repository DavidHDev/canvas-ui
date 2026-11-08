"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Check, Copy, Info } from "lucide-react";

import { Accordion, AccordionHeader, AccordionItem, AccordionPanel, AccordionTrigger } from "@/components/ui/accordion";
import { isHtmlInCanvasBlocked } from "@/lib/html-in-canvas";

const FLAG_PATH = "flags/#canvas-draw-element";
const CHROME_FLAG = `chrome://${FLAG_PATH}`;

interface ElementImageContext extends CanvasRenderingContext2D {
  drawElementImage?: (element: Element, x: number, y: number) => void;
}

type PaintableCanvas = HTMLCanvasElement & { requestPaint?: () => void };

let cachedSupport: boolean | null = null;

function supportsHtmlInCanvas(): boolean {
  if (typeof document === "undefined" || isHtmlInCanvasBlocked()) return false;
  if (cachedSupport !== null) return cachedSupport;
  const probe = document.createElement("canvas") as PaintableCanvas;
  const ctx = probe.getContext("2d") as ElementImageContext | null;
  cachedSupport = Boolean(ctx && typeof ctx.drawElementImage === "function" && typeof probe.requestPaint === "function");
  return cachedSupport;
}

const subscribe = () => () => {};
const getServerSnapshot = () => true;

type BrowserKind = "chromium" | "unsupported" | "unknown";

interface BrowserInfo {
  /** Display name, or null when we couldn't identify the browser. */
  name: string | null;
  kind: BrowserKind;
  /** Flags URL for this browser (chromium), or the Chrome one as a reference. */
  flag: string;
}

let cachedBrowser: BrowserInfo | null = null;

function detectBrowser(): BrowserInfo {
  if (cachedBrowser) return cachedBrowser;
  if (typeof navigator === "undefined") {
    return { name: null, kind: "unknown", flag: CHROME_FLAG };
  }

  const ua = navigator.userAgent;
  const nav = navigator as Navigator & { brave?: unknown; vendor?: string };
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (nav.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  let info: BrowserInfo;
  if (isIOS) {
    info = { name: "Safari", kind: "unsupported", flag: CHROME_FLAG };
  } else if (typeof nav.brave !== "undefined") {
    info = { name: "Brave", kind: "chromium", flag: `brave://${FLAG_PATH}` };
  } else if (/Edg\//.test(ua)) {
    info = { name: "Edge", kind: "chromium", flag: `edge://${FLAG_PATH}` };
  } else if (/OPR\//.test(ua)) {
    info = { name: "Opera", kind: "chromium", flag: `opera://${FLAG_PATH}` };
  } else if (/Firefox\//.test(ua)) {
    info = { name: "Firefox", kind: "unsupported", flag: CHROME_FLAG };
  } else if (/Chrome\/|Chromium\//.test(ua)) {
    info = { name: "Chrome", kind: "chromium", flag: CHROME_FLAG };
  } else if (/Safari\//.test(ua) && (nav.vendor ?? "").includes("Apple")) {
    info = { name: "Safari", kind: "unsupported", flag: CHROME_FLAG };
  } else {
    info = { name: null, kind: "unknown", flag: CHROME_FLAG };
  }

  cachedBrowser = info;
  return info;
}

export function HtmlInCanvasBanner() {
  const supported = useSyncExternalStore(subscribe, supportsHtmlInCanvas, getServerSnapshot);

  if (supported) return null;

  if (isHtmlInCanvasBlocked()) {
    return (
      <Notice>
        Android shows the fallback version here: HTML-in-Canvas stays off on
        Android as a precaution after a renderer crash report. Open this page in
        desktop Chrome 157 or later to see the full effect.
      </Notice>
    );
  }

  const browser = detectBrowser();

  // HTML-in-Canvas ships in Chrome 157. Other engines don't implement it, so
  // there is nothing to enable there: the only advice is to switch browsers.
  if (browser.kind !== "chromium") {
    return (
      <Notice>
        {browser.name ?? "Your browser"}{" "}
        doesn&apos;t support HTML-in-Canvas yet, so you&apos;re seeing the
        fallback version. Open this page in Chrome 157 or later to see the full
        effect.
      </Notice>
    );
  }

  return (
    <Accordion className="not-typeset mt-6 mb-4 rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
      <AccordionItem value="enable">
        <AccordionHeader render={<div />} className="flex">
          <AccordionTrigger className="w-full flex-wrap items-start gap-x-2.5 gap-y-1.5 text-left [&>svg]:mt-[3px] [&>svg]:ml-auto sm:[&>svg]:ml-0">
            <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 text-[13px] leading-5 text-muted-foreground">
              This component needs HTML-in-Canvas, which isn&apos;t on in this version of {browser.name}.
            </span>
            <span className="ml-auto hidden shrink-0 text-[13px] leading-5 font-medium text-muted-foreground transition-colors group-hover:text-foreground sm:inline">How to enable</span>
          </AccordionTrigger>
        </AccordionHeader>

        <AccordionPanel>
          <ol className="mt-3 space-y-2">
            <li className="flex gap-3 text-[13px] leading-6 text-muted-foreground">
              <StepMarker n={1} />
              <span className="min-w-0 flex-1">
                Update {browser.name} to the latest version, then reload this page. Chrome turns HTML-in-Canvas on by default from version 157.
              </span>
            </li>
            <li className="flex gap-3 text-[13px] leading-6 text-muted-foreground">
              <StepMarker n={2} />
              <span className="min-w-0 flex-1">
                <span className="sm:hidden">
                  Still seeing this? Copy this into the address bar, set the HTML-in-Canvas dropdown to Enabled, and relaunch {browser.name}:
                </span>
                <span className="hidden sm:inline">
                  Still seeing this? Copy <CopyFlag flag={browser.flag} /> into the address bar, set the HTML-in-Canvas dropdown to Enabled, and relaunch {browser.name}.
                </span>
                <span className="mt-1.5 block sm:hidden">
                  <CopyFlag flag={browser.flag} />
                </span>
              </span>
            </li>
          </ol>
        </AccordionPanel>
      </AccordionItem>
    </Accordion>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="not-typeset mt-6 mb-4 flex gap-2.5 rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
      <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <p className="text-[13px] leading-5 text-muted-foreground">{children}</p>
    </div>
  );
}

function CopyFlag({ flag }: { flag: string }) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const copy = () => {
    navigator.clipboard
      .writeText(flag)
      .then(() => {
        setCopied(true);
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        timeoutRef.current = setTimeout(() => setCopied(false), 1400);
      })
      .catch(() => {});
  };

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy ${flag} to clipboard`}
      className="mr-1.5 ml-0.5 inline cursor-pointer rounded bg-muted/60 box-decoration-clone px-1.5 py-0.5 align-middle font-mono text-[12px] break-all text-foreground/90 transition-colors duration-150 hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      {flag}
      <span aria-hidden className="relative ml-1.5 inline-flex size-3 translate-y-px">
        <Copy
          className={`absolute inset-0 size-3 text-muted-foreground transition-all duration-150 ease-out motion-reduce:transition-none ${copied ? "scale-50 opacity-0" : "scale-100 opacity-100"}`}
        />
        <Check
          className={`absolute inset-0 size-3 text-muted-foreground transition-all duration-150 ease-out motion-reduce:transition-none ${copied ? "scale-100 opacity-100" : "scale-50 opacity-0"}`}
        />
      </span>
      <span aria-live="polite" className="sr-only">
        {copied ? "Copied" : ""}
      </span>
    </button>
  );
}

function StepMarker({ n }: { n: number }) {
  return (
    <span aria-hidden className="w-3 shrink-0 text-right text-[12px] leading-6 tabular-nums text-muted-foreground/50 select-none">
      {n}
    </span>
  );
}
