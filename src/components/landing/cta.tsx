"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowRight } from "@/components/icons";

import { Footer } from "@/components/landing/footer";
import { Reveal } from "@/components/landing/reveal";

const Blaze = dynamic(() => import("@/lib/Blaze/Blaze").then((m) => m.Blaze), {
  ssr: false,
});

export function Cta() {
  return (
    <section aria-labelledby="cta-heading" className="px-2.5 pb-2.5">
      <Reveal>
        <div className="dark relative mx-auto min-h-[72rem] w-full overflow-hidden rounded-2xl bg-[#0a0a0a] sm:min-h-[52rem]">
          <Blaze
            style={{ position: "absolute", inset: 0 }}
            sparkColor={[0.45, 0.65, 1]}
            smokeColor={[0.2, 0.45, 1]}
            height={1}
            distortion={0.6}
            distortionScale={0.5}
            layers={4}
            sparkDensity={1.5}
            smoke={0.5}
            sparks={0.5}
            sparkSize={1.0}
            glow={1.5}
          >
            <div className="flex min-h-full flex-col bg-[#0a0a0a]">
              <div className="flex flex-1 flex-col items-center justify-center px-6 pt-28 pb-20 text-center sm:pt-36 sm:pb-24">
                <h2
                  id="cta-heading"
                  className="max-w-2xl text-3xl font-medium tracking-tighter text-balance text-white sm:text-5xl"
                >
                  Build in a new dimension.
                </h2>
                <p className="mt-4 max-w-md text-base leading-7 text-white/60 sm:text-balance">
                  Pick one of our components, run one command, and ship
                  something people remember.
                </p>
                <div className="mt-8 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:gap-6">
                  <Link
                    href="/docs"
                    className="group inline-flex h-11 items-center justify-center gap-2 rounded-control bg-white px-6 text-[15px] font-medium tracking-[-0.01em] text-black transition-[opacity,transform] duration-150 ease-out hover:opacity-85 active:scale-[0.98]"
                  >
                    Get started
                    <ArrowRight
                      aria-hidden
                      strokeWidth={2.25}
                      className="-mr-1.5 size-[15px] transition-transform duration-200 ease-out group-hover:translate-x-0.5 motion-reduce:transition-none"
                    />
                  </Link>
                  <Link
                    href="/components"
                    className="inline-flex h-11 items-center justify-center rounded-control bg-white/10 px-6 text-[15px] font-medium text-white transition-colors duration-150 hover:bg-white/10 active:scale-[0.98]"
                  >
                    Browse components
                  </Link>
                </div>
              </div>

              <Footer />
            </div>
          </Blaze>
        </div>
      </Reveal>
    </section>
  );
}
