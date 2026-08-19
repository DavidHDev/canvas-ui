import type { MetadataRoute } from "next";

export const dynamic = "force-static";

const SITE_URL = "https://canvasui.dev";

const ROUTES: { path: string; priority: number }[] = [
  { path: "/", priority: 1 },
  { path: "/components", priority: 0.9 },
  { path: "/playground", priority: 0.8 },
  { path: "/celebrate", priority: 0.7 },
  { path: "/docs", priority: 0.9 },
  { path: "/docs/installation", priority: 0.9 },
  { path: "/docs/mcp", priority: 0.7 },
  { path: "/docs/components/ascii-object", priority: 0.8 },
  { path: "/docs/components/ascii-sweep", priority: 0.8 },
  { path: "/docs/components/asciify", priority: 0.8 },
  { path: "/docs/components/bend", priority: 0.8 },
  { path: "/docs/components/blaze", priority: 0.8 },
  { path: "/docs/components/bubble", priority: 0.8 },
  { path: "/docs/components/canvas", priority: 0.8 },
  { path: "/docs/components/cloth", priority: 0.8 },
  { path: "/docs/components/clouds", priority: 0.8 },
  { path: "/docs/components/decrypt-reveal", priority: 0.8 },
  { path: "/docs/components/dithered-object", priority: 0.8 },
  { path: "/docs/components/displacement", priority: 0.8 },
  { path: "/docs/components/droplets", priority: 0.8 },
  { path: "/docs/components/flame-wrap", priority: 0.8 },
  { path: "/docs/components/force-field", priority: 0.8 },
  { path: "/docs/components/frost", priority: 0.8 },
  { path: "/docs/components/glass", priority: 0.8 },
  { path: "/docs/components/glass-object", priority: 0.8 },
  { path: "/docs/components/glitch", priority: 0.8 },
  { path: "/docs/components/glyph-rain", priority: 0.8 },
  { path: "/docs/components/grid", priority: 0.8 },
  { path: "/docs/components/hex-float", priority: 0.8 },
  { path: "/docs/components/ink-object", priority: 0.8 },
  { path: "/docs/components/laser", priority: 0.8 },
  { path: "/docs/components/liquid", priority: 0.8 },
  { path: "/docs/components/magnify", priority: 0.8 },
  { path: "/docs/components/particle-object", priority: 0.8 },
  { path: "/docs/components/particle-reveal", priority: 0.8 },
  { path: "/docs/components/particle-scroll", priority: 0.8 },
  { path: "/docs/components/peel", priority: 0.8 },
  { path: "/docs/components/retro-dither", priority: 0.8 },
  { path: "/docs/components/ripple", priority: 0.8 },
  { path: "/docs/components/shatter", priority: 0.8 },
  { path: "/docs/components/liquid-object", priority: 0.8 },
  { path: "/docs/components/vhs", priority: 0.8 },
  { path: "/privacy", priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return ROUTES.map(({ path, priority }) => ({
    url: `${SITE_URL}${path === "/" ? "" : path}`,
    lastModified: new Date(),
    changeFrequency: "weekly",
    priority,
  }));
}
