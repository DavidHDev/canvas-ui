<div align="center">

<a href="https://canvasui.dev">
  <img src=".github/readme.gif" alt="Canvas UI" width="100%" />
</a>

<br />
<br />

<p>
  <b>An open source library of creative, framework-agnostic components drawn on canvas.</b><br />
  Fluid simulations, shader effects, and 3D scenes that run over your live, fully interactive interface.
</p>

<p>
  <a href="https://canvasui.dev"><b>canvasui.dev</b></a> ·
  <a href="https://canvasui.dev/docs">Docs</a> ·
  <a href="https://canvasui.dev/components">Components</a> ·
  <a href="https://canvasui.dev/playground">Playground</a> ·
  <a href="https://canvasui.dev/docs/installation">Installation</a>
</p>

<p>
  <a href="https://github.com/DavidHDev/canvas-ui/stargazers"><picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/github/stars/DavidHDev/canvas-ui.svg?variant=secondary&size=sm&mode=dark" /><img alt="GitHub stars" src="https://shieldcn.dev/github/stars/DavidHDev/canvas-ui.svg?variant=secondary&size=sm&mode=light" /></picture></a>
  <a href="https://github.com/DavidHDev/canvas-ui/actions/workflows/ci.yml"><picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/github/ci/DavidHDev/canvas-ui.svg?variant=secondary&size=sm&mode=dark" /><img alt="CI status" src="https://shieldcn.dev/github/ci/DavidHDev/canvas-ui.svg?variant=secondary&size=sm&mode=light" /></picture></a>
  <a href="https://canvasui.dev/components"><picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/badge/components-33.svg?variant=secondary&size=sm&logo=shadcnui&mode=dark" /><img alt="33 components" src="https://shieldcn.dev/badge/components-33.svg?variant=secondary&size=sm&logo=shadcnui&mode=light" /></picture></a>
  <a href="LICENSE.md"><picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/badge/license-MIT_+_Commons_Clause.svg?variant=secondary&size=sm&logo=opensourceinitiative&mode=dark" /><img alt="License: MIT + Commons Clause" src="https://shieldcn.dev/badge/license-MIT_+_Commons_Clause.svg?variant=secondary&size=sm&logo=opensourceinitiative&mode=light" /></picture></a>
</p>

<p>
  <picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/badge/React.svg?variant=secondary&size=sm&logo=react&logoColor=61DAFB&mode=dark" /><img alt="React" src="https://shieldcn.dev/badge/React.svg?variant=secondary&size=sm&logo=react&logoColor=61DAFB&mode=light" /></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/badge/Vue.svg?variant=secondary&size=sm&logo=vuedotjs&logoColor=4FC08D&mode=dark" /><img alt="Vue" src="https://shieldcn.dev/badge/Vue.svg?variant=secondary&size=sm&logo=vuedotjs&logoColor=4FC08D&mode=light" /></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/badge/Svelte.svg?variant=secondary&size=sm&logo=svelte&logoColor=FF3E00&mode=dark" /><img alt="Svelte" src="https://shieldcn.dev/badge/Svelte.svg?variant=secondary&size=sm&logo=svelte&logoColor=FF3E00&mode=light" /></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/badge/Solid.svg?variant=secondary&size=sm&logo=solid&logoColor=4F88C6&mode=dark" /><img alt="Solid" src="https://shieldcn.dev/badge/Solid.svg?variant=secondary&size=sm&logo=solid&logoColor=4F88C6&mode=light" /></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/badge/Preact.svg?variant=secondary&size=sm&logo=preact&logoColor=673AB8&mode=dark" /><img alt="Preact" src="https://shieldcn.dev/badge/Preact.svg?variant=secondary&size=sm&logo=preact&logoColor=673AB8&mode=light" /></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/badge/Angular.svg?variant=secondary&size=sm&logo=angular&logoColor=DD0031&mode=dark" /><img alt="Angular" src="https://shieldcn.dev/badge/Angular.svg?variant=secondary&size=sm&logo=angular&logoColor=DD0031&mode=light" /></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/badge/TypeScript.svg?variant=secondary&size=sm&logo=typescript&logoColor=3178C6&mode=dark" /><img alt="TypeScript" src="https://shieldcn.dev/badge/TypeScript.svg?variant=secondary&size=sm&logo=typescript&logoColor=3178C6&mode=light" /></picture>
</p>

</div>

## What makes it different

Most components use the experimental [HTML-in-canvas](https://chromestatus.com/feature/5172548013916160) API to read and redraw your live DOM. Text stays selectable, links stay clickable, and the page becomes a texture that fire, fluid, and glass distort in real time.

Where it is not supported, components fall back to WebGL overlays, so every visitor gets a working page.

<table>
<tr>
<td align="center">🎨</td>
<td><b>33 components</b> and counting: Liquid, Glass, Shatter, Force Field, Decrypt Reveal, and more</td>
</tr>
<tr>
<td align="center">🧩</td>
<td><b>Framework agnostic</b>: every component ships for React, Solid, Preact, Vue, Svelte, Angular, and vanilla</td>
</tr>
<tr>
<td align="center">📋</td>
<td><b>Copy, do not install</b>: source lands in your repo via a shadcn-compatible registry</td>
</tr>
<tr>
<td align="center">⚡</td>
<td><b>Zero config</b>: self-contained, with sensible defaults and typed props</td>
</tr>
<tr>
<td align="center">🤖</td>
<td><b>MCP ready</b>: let your AI assistant find and install components for you</td>
</tr>
</table>

## Quick start

Add a component with the shadcn CLI (run `npx shadcn@latest init` first if you have not):

```bash
npx shadcn@latest add @canvas-ui/liquid-react
```

Swap `liquid` for any component, `react` for `solid`, `preact`, `vue`, `svelte`, `angular`, or `vanilla`. Source lands in `components/canvasui/`, yours to edit.

```tsx
import { Liquid } from "@/components/canvasui/Liquid";

export default function Page() {
  return (
    <Liquid>
      <YourEntirePage />
    </Liquid>
  );
}
```

Most components wrap your content. The subtree stays live and interactive; the effect runs on top.

See the [installation guide](https://canvasui.dev/docs/installation) for manual setup.

## Components

Every component ships for all six targets. Compare them in the [playground](https://canvasui.dev/playground).

<details open>
<summary><b>🌊 Fluid &amp; motion</b></summary>

| Component                                                 | What it does                         | Component                                                             | What it does                           |
| --------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------- | -------------------------------------- |
| [**Liquid**](https://canvasui.dev/docs/components/liquid) | Pointer-driven fluid simulation      | [**Ripple**](https://canvasui.dev/docs/components/ripple)             | Water ripples from every click         |
| [**Cloth**](https://canvasui.dev/docs/components/cloth)   | Fabric rippling in the wind          | [**Droplets**](https://canvasui.dev/docs/components/droplets)         | Rain running down the screen           |
| [**Bubble**](https://canvasui.dev/docs/components/bubble) | Metaball droplet trailing the cursor | [**Displacement**](https://canvasui.dev/docs/components/displacement) | Grid that ripples away from the cursor |

</details>

<details open>
<summary><b>🔥 Fire &amp; energy</b></summary>

| Component                                                           | What it does                        | Component                                                         | What it does                        |
| ------------------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------- | ----------------------------------- |
| [**Blaze**](https://canvasui.dev/docs/components/blaze)             | Sparks, smoke, and heat distortion  | [**Flame Wrap**](https://canvasui.dev/docs/components/flame-wrap) | Border of fire around any element   |
| [**Force Field**](https://canvasui.dev/docs/components/force-field) | Energy shield with click shockwaves | [**Laser**](https://canvasui.dev/docs/components/laser)           | Beam that reveals content on scroll |

</details>

<details open>
<summary><b>💎 Glass &amp; optics</b></summary>

| Component                                                   | What it does                              | Component                                                 | What it does                                  |
| ----------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------- | --------------------------------------------- |
| [**Glass**](https://canvasui.dev/docs/components/glass)     | Crystal-ball lens that follows the cursor | [**Frost**](https://canvasui.dev/docs/components/frost)   | Ice that melts under the cursor and refreezes |
| [**Magnify**](https://canvasui.dev/docs/components/magnify) | Sci-fi scanner lens with a HUD reticle    | [**Bend**](https://canvasui.dev/docs/components/bend)     | Folds the page like the face of a cube        |
| [**Peel**](https://canvasui.dev/docs/components/peel)       | Peels back to reveal a second layer       | [**Clouds**](https://canvasui.dev/docs/components/clouds) | Mist parted by cursor wind                    |

</details>

<details open>
<summary><b>📼 Retro &amp; glitch</b></summary>

| Component                                                                 | What it does                            | Component                                                         | What it does                          |
| ------------------------------------------------------------------------- | --------------------------------------- | ----------------------------------------------------------------- | ------------------------------------- |
| [**VHS**](https://canvasui.dev/docs/components/vhs)                       | Worn tape wave, chroma bleed, and grain | [**Glitch**](https://canvasui.dev/docs/components/glitch)         | Broadcast tearing with RGB splits     |
| [**Retro Dither**](https://canvasui.dev/docs/components/retro-dither)     | Dither lens that pixelates the page     | [**Asciify**](https://canvasui.dev/docs/components/asciify)       | ASCII lens that follows the cursor    |
| [**Decrypt Reveal**](https://canvasui.dev/docs/components/decrypt-reveal) | Cipher text decrypting at the cursor    | [**Glyph Rain**](https://canvasui.dev/docs/components/glyph-rain) | Falling glyphs that light up the page |

</details>

<details open>
<summary><b>✨ Particles &amp; structure</b></summary>

| Component                                                                   | What it does                          | Component                                                                   | What it does                           |
| --------------------------------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------- |
| [**Particle Reveal**](https://canvasui.dev/docs/components/particle-reveal) | Particles merging into crisp UI       | [**Particle Scroll**](https://canvasui.dev/docs/components/particle-scroll) | Sand that reassembles on scroll        |
| [**Shatter**](https://canvasui.dev/docs/components/shatter)                 | 3D glass shards that lift and refract | [**Grid**](https://canvasui.dev/docs/components/grid)                       | 3D tiles rippling around the cursor    |
| [**Hex Float**](https://canvasui.dev/docs/components/hex-float)             | Floating hex tiles with cursor lift   | [**Canvas**](https://canvasui.dev/docs/components/canvas)                   | Woven canvas you drag wet paint across |

</details>

<details open>
<summary><b>🧊 3D effects</b>: no flag needed, these work everywhere</summary>

Point these at a GLB/glTF model, SVG, or image to render it as a 3D scene.

| Component                                                                   | What it does                           | Component                                                                   | What it does                      |
| --------------------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------- | --------------------------------- |
| [**ASCII Object**](https://canvasui.dev/docs/components/ascii-object)       | Redrawn as shape-matched ASCII         | [**Glass Object**](https://canvasui.dev/docs/components/glass-object)       | Liquid glass with real dispersion |
| [**Particle Object**](https://canvasui.dev/docs/components/particle-object) | Particles that scatter and spring back | [**Dithered Object**](https://canvasui.dev/docs/components/dithered-object) | Rendered through a 1-bit dither   |
| [**Liquid Object**](https://canvasui.dev/docs/components/liquid-object)     | Dragged through swirling liquid        |                                                                             |                                   |

</details>

## Browser support

| Browser                                                                        | HTML-in-canvas components | 3D effect components |
| ------------------------------------------------------------------------------ | :-----------------------: | :------------------: |
| Chrome with the [flag or origin trial](https://canvasui.dev/docs/installation) |      ✅ Full effect       |    ✅ Full effect    |
| Everything else                                                                | ⚠️ WebGL overlay fallback |    ✅ Full effect    |

Html-in-canvas needs Chrome with the `chrome://flags/#canvas-draw-element` flag. An [origin trial](https://canvasui.dev/docs/installation) token lifts that for your visitors. That is how canvasui.dev runs in a plain Chrome install. Details in the [docs](https://canvasui.dev/docs).

## Use with AI

The registry is [MCP](https://canvasui.dev/docs/mcp) ready, so your assistant can browse and install components:

```bash
npx shadcn@latest mcp init --client claude
```

Works with Claude Code, Cursor, VS Code, Codex, and OpenCode. Then just ask: _"add the Liquid component from Canvas UI"_.

## Development

This repo holds the library source, the docs site (Next.js 16, Tailwind v4, on Cloudflare Workers), and the registry build.

```bash
npm install
npm run dev        # builds the registry, then starts next dev
npm run build      # production build
npm run deploy     # build and deploy to Cloudflare
```

| Path                         | What lives here                                         |
| ---------------------------- | ------------------------------------------------------- |
| `src/lib/<Component>/`       | The engine (`*Vanilla.ts`) plus five framework wrappers |
| `src/demos/`                 | Interactive demo and controls for each component        |
| `src/app/`                   | Documentation site routes                               |
| `scripts/build-registry.mts` | Generates `public/r/*.json` for the shadcn CLI          |

Each component is one engine in plain TypeScript and WebGL, with thin framework wrappers. Nothing depends on anything else, and the engine defines its own props.

## Contributing

Issues and pull requests welcome. See [CONTRIBUTING.md](.github/CONTRIBUTING.md).

## License

[MIT + Commons Clause](LICENSE.md). Free in your own projects, commercial or not. The Commons Clause only restricts selling the library itself.

<div align="center">
<br />
<sub>Built by <a href="https://github.com/DavidHDev">David Haz</a> · <a href="https://x.com/davidhdev">@davidhdev</a></sub>
<br /><br />
<a href="https://canvasui.dev"><b>canvasui.dev</b></a>

</div>
