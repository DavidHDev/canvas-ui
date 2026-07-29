export interface ComponentEntry {
  href: string;
  name: string;
  description: string;
  /** Looping preview video shown in the showcase cards. */
  video: string;
}

export const LIGHT_VIDEOS = new Set([
  "/assets/videos/frost.webm",
  "/assets/videos/glitch.webm",
  "/assets/videos/hex-float.webm",
  "/assets/videos/ripple.webm",
]);

export const isLightVideo = (src: string) => LIGHT_VIDEOS.has(src);

export const COMPONENTS: ComponentEntry[] = [
  {
    href: "/docs/components/asciify",
    name: "Asciify",
    description:
      "A soft lens that follows your cursor and redraws the live HTML beneath it as ascii characters.",
    video: "/assets/videos/asciify.webm",
  },
  {
    href: "/docs/components/bend",
    name: "Bend",
    description:
      "Folds the top and bottom of your live HTML over straight virtual edges, like scrolling on the face of a cube.",
    video: "/assets/videos/bend.webm",
  },
  {
    href: "/docs/components/blaze",
    name: "Blaze",
    description:
      "Fire sparks, smoke, and heat distortion rising over your live HTML.",
    video: "/assets/videos/blaze.webm",
  },
  {
    href: "/docs/components/bubble",
    name: "Bubble",
    description:
      "A glassy droplet that trails the cursor as blending metaballs and refracts the live page beneath it.",
    video: "/assets/videos/bubble.webm",
  },
  {
    href: "/docs/components/cloth",
    name: "Cloth",
    description:
      "Hangs your live HTML on fabric rippling in the wind. Cursor strokes send waves across the cloth.",
    video: "/assets/videos/cloth.webm",
  },
  {
    href: "/docs/components/clouds",
    name: "Clouds",
    description:
      "Theme-aware mist that blurs and refracts your live HTML, parted by cursor wind.",
    video: "/assets/videos/clouds.webm",
  },
  {
    href: "/docs/components/dithered-object",
    name: "Dithered Object",
    description:
      "Any GLB/glTF model, SVG, or image floating in a studio scene, rendered through a 1-bit dither.",
    video: "/assets/videos/dithered-object.webm",
  },
  {
    href: "/docs/components/droplets",
    name: "Droplets",
    description:
      "Rain droplets that run down the screen and refract your live HTML.",
    video: "/assets/videos/droplets.webm",
  },
  {
    href: "/docs/components/frost",
    name: "Frost",
    description:
      "A frozen pane of ice over your live HTML that melts under the cursor and refreezes.",
    video: "/assets/videos/frost.webm",
  },
  {
    href: "/docs/components/glass",
    name: "Glass",
    description:
      "A cursor-following glass lens that refracts your live HTML and zooms in on targets like a crystal ball.",
    video: "/assets/videos/glass.webm",
  },
  {
    href: "/docs/components/hologram",
    name: "Hologram",
    description:
      "A sci-fi holographic overlay with vertical scanlines, chromatic RGB fringing, phase shifting wave distortion, and a cyan/blue tint.",
    video: "/assets/videos/hologram.webm",
  },
  {
    href: "/docs/components/glass-object",
    name: "Glass Object",
    description:
      "Turns any 3D model, SVG, or image into floating liquid glass with real refraction, dispersion, and frost.",
    video: "/assets/videos/glass-object.webm",
  },
  {
    href: "/docs/components/glitch",
    name: "Glitch",
    description:
      "Broadcast glitch bursts that tear your live HTML into shifted slices with RGB splits and corrupted blocks.",
    video: "/assets/videos/glitch.webm",
  },
  {
    href: "/docs/components/grid",
    name: "Grid",
    description:
      "3D tiles that ripple in staggered waves around the cursor over your live HTML.",
    video: "/assets/videos/grid.webm",
  },
  {
    href: "/docs/components/hex-float",
    name: "Hex Float",
    description:
      "Your live HTML on shiny floating hex tiles with perspective tilt and cursor lift.",
    video: "/assets/videos/hex-float.webm",
  },
  {
    href: "/docs/components/laser",
    name: "Laser",
    description:
      "A laser beam near the bottom of the viewport that reveals your live HTML from behind it on scroll.",
    video: "/assets/videos/laser.webm",
  },
  {
    href: "/docs/components/liquid",
    name: "Liquid",
    description:
      "A pointer-driven WebGL fluid simulation that runs over your live HTML.",
    video: "/assets/videos/liquid.webm",
  },
  {
    href: "/docs/components/magnify",
    name: "Magnify",
    description:
      "A sci-fi scanner lens that magnifies your live HTML inside a HUD reticle, with click ripples that bend the page.",
    video: "/assets/videos/magnify.webm",
  },
  {
    href: "/docs/components/particle-object",
    name: "Particle Object",
    description:
      "Rebuilds any 3D model, SVG, or image as particles that scatter around the cursor and spring back into shape.",
    video: "/assets/videos/particle-object.webm",
  },
  {
    href: "/docs/components/particle-reveal",
    name: "Particle Reveal",
    description:
      "Renders your live HTML as fine readable particles that merge into the crisp UI around the cursor.",
    video: "/assets/videos/particle-reveal.webm",
  },
  {
    href: "/docs/components/particle-scroll",
    name: "Particle Scroll",
    description:
      "Dissolves your live HTML below a chosen line into fine sand particles that reassemble on scroll.",
    video: "/assets/videos/particle-scroll.webm",
  },
  {
    href: "/docs/components/peel",
    name: "Peel",
    description:
      "Peels your live HTML back from a chosen edge on hover, revealing a second layer underneath.",
    video: "/assets/videos/peel.webm",
  },
  {
    href: "/docs/components/retro-dither",
    name: "Retro Dither",
    description:
      "A retro dither lens that pixelates your live HTML around the cursor.",
    video: "/assets/videos/retro-dither.webm",
  },
  {
    href: "/docs/components/ripple",
    name: "Ripple",
    description:
      "Water ripples that spread from every click and refract your live HTML like a pond surface.",
    video: "/assets/videos/ripple.webm",
  },
  {
    href: "/docs/components/shatter",
    name: "Shatter",
    description:
      "Breaks your live HTML into 3D glass shards that lift, float, and refract around the cursor, with perspective and soft shadows.",
    video: "/assets/videos/shatter.webm",
  },
  {
    href: "/docs/components/vhs",
    name: "VHS",
    description:
      "Worn tape playback with wave, head-switching noise, chroma bleed, and grain over your live HTML.",
    video: "/assets/videos/vhs.webm",
  },
];
