export type ComponentCategory = "live-html" | "universal";

export interface ComponentEntry {
  href: string;
  name: string;
  description: string;
  video: string;
  category: ComponentCategory;
  isNew?: boolean;
}

export const CATEGORIES: readonly ComponentCategory[] = ["live-html", "universal"];

export const CATEGORY_META: Record<
  ComponentCategory,
  { label: string; description: string }
> = {
  "live-html": {
    label: "Live HTML",
    description:
      "Effects that draw your real, interactive HTML into the canvas, in full in Chrome 157 and later and as a simpler fallback elsewhere.",
  },
  universal: {
    label: "Universal",
    description:
      "Effects that render their own scene and look the same in every modern browser, with no html-in-canvas needed.",
  },
};

export const LIGHT_VIDEOS = new Set([
  "/assets/videos/ascii-object.webm",
  "/assets/videos/canvas.webm",
  "/assets/videos/decrypt-reveal.webm",
  "/assets/videos/displacement.webm",
  "/assets/videos/flame-wrap.webm",
  "/assets/videos/force-field.webm",
  "/assets/videos/frost.webm",
  "/assets/videos/glitch.webm",
  "/assets/videos/glyph-rain.webm",
  "/assets/videos/hex-float.webm",
  "/assets/videos/ink-object.webm",
  "/assets/videos/liquid-object.webm",
  "/assets/videos/ripple.webm",
]);

export const isLightVideo = (src: string) => LIGHT_VIDEOS.has(src);

export const COMPONENTS: ComponentEntry[] = [
  {
    href: "/docs/components/ascii-object",
    name: "ASCII Object",
    description:
      "A 3D model, SVG, or image drawn in ASCII characters that follow its edges. Drag to orbit it.",
    video: "/assets/videos/ascii-object.webm",
    category: "universal",
    isNew: true,
  },
  {
    href: "/docs/components/ascii-sweep",
    name: "ASCII Sweep",
    description:
      "A glowing band of ASCII characters sweeps across your text and swaps it for the next panel.",
    video: "/assets/videos/ascii-sweep.webm",
    category: "live-html",
    isNew: true,
  },
  {
    href: "/docs/components/asciify",
    name: "Asciify",
    description:
      "A soft lens follows the cursor and redraws the page beneath it as ASCII characters.",
    video: "/assets/videos/asciify.webm",
    category: "live-html",
  },
  {
    href: "/docs/components/bend",
    name: "Bend",
    description:
      "The top and bottom of the page fold away over hard edges as you scroll, like the faces of a cube.",
    video: "/assets/videos/bend.webm",
    category: "live-html",
  },
  {
    href: "/docs/components/blaze",
    name: "Blaze",
    description:
      "Sparks, smoke, and heat haze rise from the bottom of the page and warp the content above them.",
    video: "/assets/videos/blaze.webm",
    category: "live-html",
  },
  {
    href: "/docs/components/bubble",
    name: "Bubble",
    description:
      "A glassy droplet trails the cursor in blending blobs and refracts the page beneath it.",
    video: "/assets/videos/bubble.webm",
    category: "live-html",
  },
  {
    href: "/docs/components/canvas",
    name: "Canvas",
    description:
      "The page painted onto woven canvas. The cursor drags ridges of wet paint across the weave.",
    video: "/assets/videos/canvas.webm",
    category: "live-html",
    isNew: true,
  },
  {
    href: "/docs/components/chrome-object",
    name: "Chrome Object",
    description:
      "A 3D model, SVG, or image cast in liquid chrome, with studio reflections that ripple across it.",
    video: "/assets/videos/chrome-object.webm",
    category: "universal",
    isNew: true,
  },
  {
    href: "/docs/components/cloth",
    name: "Cloth",
    description:
      "The page hangs on fabric that ripples in the wind. Cursor strokes send waves through it.",
    video: "/assets/videos/cloth.webm",
    category: "live-html",
  },
  {
    href: "/docs/components/clouds",
    name: "Clouds",
    description:
      "Mist drifts over the page and softly blurs what it covers. Moving the cursor parts it.",
    video: "/assets/videos/clouds.webm",
    category: "live-html",
  },
  {
    href: "/docs/components/decrypt-reveal",
    name: "Decrypt Reveal",
    description:
      "The page shows as ASCII cipher text and decodes into the real UI around the cursor.",
    video: "/assets/videos/decrypt-reveal.webm",
    category: "live-html",
    isNew: true,
  },
  {
    href: "/docs/components/displacement",
    name: "Displacement",
    description:
      "A grid warps the page away from the cursor, with color fringing and grain where it bends.",
    video: "/assets/videos/displacement.webm",
    category: "live-html",
    isNew: true,
  },
  {
    href: "/docs/components/dithered-object",
    name: "Dithered Object",
    description:
      "A 3D model, SVG, or image rendered through a 1-bit dither pattern. Drag to orbit it.",
    video: "/assets/videos/dithered-object.webm",
    category: "universal",
  },
  {
    href: "/docs/components/droplets",
    name: "Droplets",
    description:
      "Raindrops run down the screen and refract the page behind them. The cursor wipes them aside.",
    video: "/assets/videos/droplets.webm",
    category: "live-html",
  },
  {
    href: "/docs/components/flame-wrap",
    name: "Flame Wrap",
    description:
      "A border of fire wraps any element, with molten edges, flying sparks, and heat shimmer.",
    video: "/assets/videos/flame-wrap.webm",
    category: "live-html",
    isNew: true,
  },
  {
    href: "/docs/components/force-field",
    name: "Force Field",
    description:
      "An energy shield covers the page. Clicks set off shockwaves that bend the content beneath.",
    video: "/assets/videos/force-field.webm",
    category: "live-html",
    isNew: true,
  },
  {
    href: "/docs/components/frost",
    name: "Frost",
    description:
      "A pane of ice covers the page. The cursor melts a clear patch that slowly freezes over again.",
    video: "/assets/videos/frost.webm",
    category: "live-html",
  },
  {
    href: "/docs/components/glass",
    name: "Glass",
    description:
      "A glass lens follows the cursor, refracting the page and zooming in on marked targets.",
    video: "/assets/videos/glass.webm",
    category: "live-html",
  },
  {
    href: "/docs/components/glass-object",
    name: "Glass Object",
    description:
      "A 3D model, SVG, or image turned into solid glass that bends and splits the light. Drag to orbit it.",
    video: "/assets/videos/glass-object.webm",
    category: "universal",
  },
  {
    href: "/docs/components/glitch",
    name: "Glitch",
    description:
      "Broadcast glitch bursts tear the page into shifted slices with RGB splits, then settle back.",
    video: "/assets/videos/glitch.webm",
    category: "live-html",
  },
  {
    href: "/docs/components/glyph-rain",
    name: "Glyph Rain",
    description:
      "Streams of glyphs fall over the page and light it as they pass. Drops surge under the cursor.",
    video: "/assets/videos/glyph-rain.webm",
    category: "live-html",
    isNew: true,
  },
  {
    href: "/docs/components/grid",
    name: "Grid",
    description:
      "The page splits into 3D tiles that ripple in staggered waves around the cursor.",
    video: "/assets/videos/grid.webm",
    category: "live-html",
  },
  {
    href: "/docs/components/hex-float",
    name: "Hex Float",
    description:
      "The page laid on glossy hex tiles that lean back in perspective and lift toward the cursor.",
    video: "/assets/videos/hex-float.webm",
    category: "live-html",
  },
  {
    href: "/docs/components/ink-object",
    name: "Ink Object",
    description:
      "A 3D model, SVG, or image printed in rough ink strokes that wrap its form. Drag to orbit it.",
    video: "/assets/videos/ink-object.webm",
    category: "universal",
    isNew: true,
  },
  {
    href: "/docs/components/laser",
    name: "Laser",
    description:
      "A laser beam near the bottom of the screen hides what is below it and prints content in as you scroll.",
    video: "/assets/videos/laser.webm",
    category: "live-html",
  },
  {
    href: "/docs/components/liquid",
    name: "Liquid",
    description:
      "A fluid simulation trails the cursor, swirling color through the page and bending it.",
    video: "/assets/videos/liquid.webm",
    category: "live-html",
  },
  {
    href: "/docs/components/liquid-object",
    name: "Liquid Object",
    description:
      "A 3D model, SVG, or image behind liquid that swirls under the cursor and splits the light into color.",
    video: "/assets/videos/liquid-object.webm",
    category: "universal",
    isNew: true,
  },
  {
    href: "/docs/components/magnify",
    name: "Magnify",
    description:
      "A scanner lens follows the cursor and magnifies the page inside a HUD reticle. Clicks send ripples.",
    video: "/assets/videos/magnify.webm",
    category: "live-html",
  },
  {
    href: "/docs/components/particle-object",
    name: "Particle Object",
    description:
      "A 3D model, SVG, or image built from particles that scatter from the cursor and spring back.",
    video: "/assets/videos/particle-object.webm",
    category: "universal",
  },
  {
    href: "/docs/components/particle-reveal",
    name: "Particle Reveal",
    description:
      "The page dissolves into fine particles that merge back into the real UI around the cursor.",
    video: "/assets/videos/particle-reveal.webm",
    category: "live-html",
  },
  {
    href: "/docs/components/particle-scroll",
    name: "Particle Scroll",
    description:
      "Content below a set line breaks into fine sand that reassembles as you scroll.",
    video: "/assets/videos/particle-scroll.webm",
    category: "live-html",
  },
  {
    href: "/docs/components/peel",
    name: "Peel",
    description:
      "Hovering near an edge peels the page back to reveal a second layer underneath.",
    video: "/assets/videos/peel.webm",
    category: "live-html",
  },
  {
    href: "/docs/components/retro-dither",
    name: "Retro Dither",
    description:
      "A lens follows the cursor and pixelates the page beneath it into a retro dither.",
    video: "/assets/videos/retro-dither.webm",
    category: "live-html",
  },
  {
    href: "/docs/components/ripple",
    name: "Ripple",
    description:
      "Clicks send water ripples across the page that refract it like a pond surface.",
    video: "/assets/videos/ripple.webm",
    category: "live-html",
  },
  {
    href: "/docs/components/shatter",
    name: "Shatter",
    description:
      "The page breaks into 3D glass shards that lift, tilt, and refract around the cursor.",
    video: "/assets/videos/shatter.webm",
    category: "live-html",
  },
  {
    href: "/docs/components/topographic-object",
    name: "Topographic Object",
    description:
      "A 3D model, SVG, or image drawn as contour lines at even height steps, like a survey map.",
    video: "/assets/videos/topographic-object.webm",
    category: "universal",
    isNew: true,
  },
  {
    href: "/docs/components/vhs",
    name: "VHS",
    description:
      "The page plays back like worn VHS tape, with wobble, head-switching noise, and color bleed.",
    video: "/assets/videos/vhs.webm",
    category: "live-html",
  },
  {
    href: "/docs/components/wireframe-object",
    name: "Wireframe Object",
    description:
      "A 3D model, SVG, or image drawn as clean edge lines, with hidden lines removed and glowing nodes.",
    video: "/assets/videos/wireframe-object.webm",
    category: "universal",
    isNew: true,
  },
];
