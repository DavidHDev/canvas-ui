import type { Metadata } from "next";

import { Agents } from "@/components/landing/agents";
import { Cta } from "@/components/landing/cta";
import { Faq } from "@/components/landing/faq";
import { Frameworks } from "@/components/landing/frameworks";
import { Gallery } from "@/components/landing/gallery";
import { Hero } from "@/components/landing/hero";
import { HowItWorks } from "@/components/landing/how-it-works";
import { Navbar } from "@/components/landing/navbar";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
};

const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareSourceCode",
  name: "Canvas UI",
  description:
    "A free, open source component library of creative canvas and WebGL effects for React, Solid, Preact, Vue, Svelte, Angular, and vanilla JS.",
  url: "https://canvasui.dev",
  codeRepository: "https://github.com/DavidHDev/canvas-ui",
  programmingLanguage: "TypeScript",
  author: {
    "@type": "Person",
    name: "David Haz",
    url: "https://github.com/DavidHDev",
  },
};

const htmlSafeJsonStringify = (obj: unknown): string =>
  JSON.stringify(obj)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");

export default function Home() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: htmlSafeJsonStringify(JSON_LD) }}
      />
      <Navbar />
      <main className="page-enter flex flex-1 flex-col overflow-x-clip">
        <div className="relative mx-auto w-full max-w-6xl">
          <div aria-hidden className="landing-rail absolute inset-y-0 left-0" />
          <div
            aria-hidden
            className="landing-rail absolute inset-y-0 right-0"
          />
          <Hero />
          <Gallery />
          <HowItWorks />
          <Frameworks />
          <Agents />
          <Faq />
        </div>
        <Cta />
      </main>
    </>
  );
}
