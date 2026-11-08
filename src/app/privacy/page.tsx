import type { Metadata } from "next";
import Link from "next/link";

import { Footer } from "@/components/landing/footer";
import { Navbar } from "@/components/landing/navbar";

export const metadata: Metadata = {
  title: "Privacy",
  description:
    "What Canvas UI collects, what it does not, and how to have your data removed.",
  alternates: { canonical: "/privacy" },
};

const LAST_UPDATED = "August 14, 2026";

const CONTACT = "hello@canvasui.dev";

const linkClass =
  "text-foreground underline decoration-border underline-offset-4 transition-colors duration-150 hover:decoration-foreground";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-12">
      <h2 className="text-lg font-medium tracking-tight text-foreground">
        {title}
      </h2>
      <div className="mt-3 flex flex-col gap-3 text-[15px] leading-7 text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

function MailLink() {
  return (
    <a href={`mailto:${CONTACT}`} className={linkClass}>
      {CONTACT}
    </a>
  );
}

function ExternalLink({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={linkClass}>
      {children}
    </a>
  );
}

export default function PrivacyPage() {
  return (
    <>
      <Navbar />
      <main className="page-enter flex flex-1 flex-col">
        <div className="mx-auto w-full max-w-2xl px-5 pt-28 pb-24 sm:px-8 sm:pt-36">
          <h1 className="text-3xl font-medium tracking-tighter text-balance sm:text-4xl">
            Privacy policy
          </h1>
          <p className="mt-4 text-[15px] leading-7 text-muted-foreground">
            Canvas UI is a free, open source component library. This page
            explains exactly what the site collects and what it does not. Last
            updated {LAST_UPDATED}.
          </p>

          <div className="mt-10 rounded-[calc(var(--radius)+0.25rem+1px)] border border-border/60 bg-background p-1">
            <div className="rounded-[var(--radius)] border border-dashed border-border/70 bg-background p-4 sm:p-5">
              <h2 className="text-sm font-medium text-foreground">
                The short version
              </h2>
              <p className="mt-2 text-[15px] leading-7 text-muted-foreground">
                There are no tracking cookies, no advertising, and no analytics
                scripts running in your browser. Cloudflare records anonymous,
                aggregate traffic statistics from ordinary web requests. The
                only personal data collected is an email address, and only if
                you type one into the newsletter form. It is never sold or
                shared, and you can have it deleted at any time by emailing{" "}
                <MailLink />.
              </p>
            </div>
          </div>

          <Section title="What is collected">
            <p>
              <span className="text-foreground">Your email address</span>, if
              you submit the newsletter form. It is used to send occasional
              updates about Canvas UI. Nothing else is required, and no other
              field is stored.
            </p>
            <p>
              <span className="text-foreground">Abuse prevention data</span>.
              When you submit the form, your IP address is used to rate limit
              requests and to complete the anti-bot check. It is processed at
              the moment of the request and is not written to any database or
              logged by this site.
            </p>
            <p>
              <span className="text-foreground">Aggregate traffic data</span>.
              Cloudflare, which serves this site, reports totals such as page
              views, referring sites, and country-level location. This is
              derived from the ordinary web requests your browser already makes.
              Nothing is stored on your device for it, it is only ever seen as
              totals, and it is not linked to you or to any email address.
            </p>
          </Section>

          <Section title="What is not collected">
            <p>
              No analytics or measurement scripts of any kind run in your
              browser. There are no tracking cookies, no advertising pixels, no
              fingerprinting, no session recording, and no profiling. Fonts are
              served from this domain rather than a third party, and the pages
              you visit are not tied to your identity or used to build a profile
              of you.
            </p>
            <p>
              Your data is never sold, rented, or shared for anyone else&rsquo;s
              marketing.
            </p>
          </Section>

          <Section title="Data stored in your browser">
            <p>
              A few preferences are kept in your browser&rsquo;s local storage:
              your theme, your preferred package manager and framework for code
              snippets, and whether you have dismissed or completed the
              newsletter form. This stays on your device, is never sent to a
              server, and can be cleared at any time through your
              browser&rsquo;s site data settings.
            </p>
          </Section>

          <Section title="Services used">
            <p>
              <ExternalLink href="https://www.cloudflare.com/privacypolicy/">
                Cloudflare
              </ExternalLink>{" "}
              hosts the site, runs the form endpoint including the Turnstile
              anti-bot check, and provides the aggregate traffic statistics
              described above.
            </p>
            <p>
              <ExternalLink href="https://resend.com/legal/privacy-policy">
                Resend
              </ExternalLink>{" "}
              stores the newsletter list and delivers the emails. Their servers
              are in the United States, so submitting the form transfers your
              email address there.
            </p>
            <p>
              <ExternalLink href="https://docs.github.com/site-policy/privacy-policies/github-general-privacy-statement">
                GitHub
              </ExternalLink>{" "}
              serves the public star count, which your browser requests
              directly. Video embeds use YouTube&rsquo;s no-cookie domain and
              only load once you press play.
            </p>
          </Section>

          <Section title="How long it is kept">
            <p>
              Your email address is kept until you unsubscribe or ask for it to
              be removed, at which point it is deleted from the list. Every
              email includes an unsubscribe link.
            </p>
          </Section>

          <Section title="Your rights">
            <p>
              If you are in the EU or UK, the legal basis for holding your email
              address is your consent, given when you submit the form. You can
              withdraw it at any time.
            </p>
            <p>
              You have the right to access a copy of your data, correct it, have
              it deleted, or object to its use. Email <MailLink /> and it will
              be handled within 30 days. There is no account to log into and no
              identity check beyond the address itself.
            </p>
          </Section>

          <Section title="Changes">
            <p>
              If this policy changes in a way that affects what is collected,
              the date at the top of this page will be updated. The site is open
              source, so the full history of this page is public in the{" "}
              <ExternalLink href="https://github.com/DavidHDev/canvas-ui">
                repository
              </ExternalLink>
              .
            </p>
          </Section>

          <Section title="Contact">
            <p>
              Questions about any of this can go to <MailLink />.
            </p>
          </Section>

          <div className="mt-14 border-t border-border/60 pt-6">
            <Link
              href="/"
              className="text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground"
            >
              &larr; Back home
            </Link>
          </div>
        </div>

        <div className="mt-auto border-t border-border/60">
          <Footer />
        </div>
      </main>
    </>
  );
}
