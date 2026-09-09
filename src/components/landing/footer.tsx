import Image from "next/image";
import Link from "next/link";

import { REPO } from "@/lib/github";

const columns = [
  {
    title: "Navigate",
    links: [
      { href: "/docs", label: "Docs" },
      { href: "/components", label: "Components" },
      { href: "/docs/installation", label: "Installation" },
    ],
  },
  {
    title: "From The Creator",
    social: true,
    links: [
      {
        href: "https://pro.reactbits.dev",
        label: "pro.reactbits.dev",
        external: true,
      },
      { href: "https://reactbits.dev", label: "reactbits.dev", external: true },
    ],
  },
];

const socials = [
  {
    href: "https://x.com/davidhaz",
    label: "David Haz on X",
    icon: (
      <svg aria-hidden viewBox="0 0 24 24" className="size-4 fill-current">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644Z" />
      </svg>
    ),
  },
  {
    href: `https://github.com/${REPO}`,
    label: "Canvas UI on GitHub",
    icon: (
      <svg aria-hidden viewBox="0 0 16 16" className="size-4 fill-current">
        <path d="M8 0c4.42 0 8 3.58 8 8a8.01 8.01 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A8.01 8.01 0 0 1 0 8c0-4.42 3.58-8 8-8Z" />
      </svg>
    ),
  },
];

export function Footer({
  variant = "landing",
}: {
  variant?: "landing" | "docs";
}) {
  return (
    <footer className="mt-auto">
      <div
        className={
          variant === "docs"
            ? "w-full"
            : "mx-auto w-full max-w-6xl px-5 sm:px-8"
        }
      >
        <div className="grid grid-cols-1 gap-12 pt-14 pb-16 sm:grid-cols-[1fr_auto_auto] sm:gap-20">
          <div className="flex flex-col items-start">
            <Link
              href="/"
              aria-label="Canvas UI home"
              className="transition-opacity duration-150 hover:opacity-70"
            >
              <Image
                src="/logo.svg"
                alt="Canvas UI"
                width={112}
                height={23}
                className="invert dark:invert-0"
              />
            </Link>
            <p className="mt-5 max-w-56 text-sm leading-6 text-muted-foreground">
              Tasteful html-in-canvas components. Framework agnostic, creative
              by nature.
            </p>
          </div>

          {columns.map((column) => (
            <nav key={column.title} aria-label={column.title}>
              <h3 className="text-sm font-medium text-foreground">
                {column.title}
              </h3>
              <ul className="mt-4 flex flex-col gap-3">
                {column.links.map((link) => (
                  <li key={link.href}>
                    {"external" in link && link.external ? (
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground"
                      >
                        {link.label}
                      </a>
                    ) : (
                      <Link
                        href={link.href}
                        className="text-sm text-muted-foreground transition-colors duration-150 hover:text-foreground"
                      >
                        {link.label}
                      </Link>
                    )}
                  </li>
                ))}
              </ul>
              {"social" in column && column.social && (
                <div className="mt-5 flex items-center gap-4">
                  {socials.map((social) => (
                    <a
                      key={social.href}
                      href={social.href}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={social.label}
                      className="text-muted-foreground transition-colors duration-150 hover:text-foreground"
                    >
                      {social.icon}
                    </a>
                  ))}
                </div>
              )}
            </nav>
          ))}
        </div>

        <div className="flex items-center justify-between py-6">
          <p className="text-[13px] text-muted-foreground">
            © {new Date().getFullYear()} Canvas UI. Built by{" "}
            <a
              href="https://github.com/DavidHDev"
              target="_blank"
              rel="noreferrer"
              className="text-foreground underline underline-offset-4 decoration-border transition-colors duration-150 hover:decoration-foreground"
            >
              David Haz
            </a>
            .
          </p>
          <Link
            href="/privacy"
            className="text-[13px] text-muted-foreground transition-colors duration-150 hover:text-foreground"
          >
            Privacy
          </Link>
        </div>
      </div>
    </footer>
  );
}
