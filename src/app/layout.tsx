import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import "./globals.css";

import { ThemeFavicon } from "@/components/common/theme-favicon";
import { ThemeProvider } from "@/components/common/theme-provider";
import { UrlStateProvider } from "@/components/common/url-state-provider";

const SITE_URL = "https://canvasui.dev";
const DESCRIPTION =
  "An open source component library of creative html-in-canvas and WebGL effects for React, Solid, Preact, Vue, Svelte, Angular, and vanilla JS. Creative effects running over live HTML.";

const ORIGIN_TRIAL_TOKEN =
  process.env.NEXT_PUBLIC_HTML_IN_CANVAS_OT_TOKEN ?? "";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Canvas UI: Creative Canvas and WebGL Component Library",
    template: "%s | Canvas UI",
  },
  description: DESCRIPTION,
  applicationName: "Canvas UI",
  authors: [{ name: "David Haz", url: "https://github.com/DavidHDev" }],
  creator: "David Haz",
  keywords: [
    "component library",
    "react component library",
    "vue component library",
    "svelte component library",
    "webgl component library",
    "canvas components",
    "ui components",
    "canvas",
    "webgl",
    "html-in-canvas",
    "creative ui",
    "shader effects",
    "web animations",
    "react",
    "vue",
    "svelte",
    "shadcn registry",
  ],
  openGraph: {
    type: "website",
    url: SITE_URL,
    siteName: "Canvas UI",
    locale: "en_US",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Canvas UI" }],
  },
  twitter: {
    card: "summary_large_image",
    site: "@davidhdev",
    creator: "@davidhdev",
    images: ["/og.png"],
  },
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180" }],
  },
  manifest: "/site.webmanifest",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable} h-full antialiased`}
    >
      {ORIGIN_TRIAL_TOKEN ? (
        <head>
          <meta httpEquiv="origin-trial" content={ORIGIN_TRIAL_TOKEN} />
        </head>
      ) : null}
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <ThemeProvider>
          <ThemeFavicon />
          <UrlStateProvider>{children}</UrlStateProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
