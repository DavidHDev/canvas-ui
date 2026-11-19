<div align="center">

<a href="https://canvasui.dev">
  <img src=".github/readme.gif" alt="Canvas UI" width="100%" />
</a>

<br />
<br />

<p>
  <b>An open source library of creative, framework-agnostic components drawn on canvas.</b><br />
  Fluid simulations, shader effects, and 3D scenes, running over your live, fully interactive interface or drawn entirely on their own. WebGL or WebGPU via vgpu, your choice.
</p>

<p>
  <a href="https://canvasui.dev"><b>canvasui.dev</b></a> ·
  <a href="https://canvasui.dev/docs">Docs</a> ·
  <a href="https://canvasui.dev/components">Components</a> ·
  <a href="https://canvasui.dev/playground">Playground</a> ·
  <a href="https://canvasui.dev/docs/installation">Installation</a> ·
  <a href="https://canvasui.dev/docs/rendering">Rendering</a>
</p>

<p>
  <a href="https://github.com/DavidHDev/canvas-ui/stargazers"><picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/github/stars/DavidHDev/canvas-ui.svg?variant=secondary&size=sm&mode=dark" /><img alt="GitHub stars" src="https://shieldcn.dev/github/stars/DavidHDev/canvas-ui.svg?variant=secondary&size=sm&mode=light" /></picture></a>
  <a href="https://github.com/DavidHDev/canvas-ui/actions/workflows/ci.yml"><picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/github/ci/DavidHDev/canvas-ui.svg?variant=secondary&size=sm&mode=dark" /><img alt="CI status" src="https://shieldcn.dev/github/ci/DavidHDev/canvas-ui.svg?variant=secondary&size=sm&mode=light" /></picture></a>
  <a href="https://canvasui.dev/components"><picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/badge/components-38.svg?variant=secondary&size=sm&logo=shadcnui&mode=dark" /><img alt="38 components" src="https://shieldcn.dev/badge/components-38.svg?variant=secondary&size=sm&logo=shadcnui&mode=light" /></picture></a>
  <a href="LICENSE.md"><picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/badge/license-MIT_+_Commons_Clause.svg?variant=secondary&size=sm&logo=opensourceinitiative&mode=dark" /><img alt="License: MIT + Commons Clause" src="https://shieldcn.dev/badge/license-MIT_+_Commons_Clause.svg?variant=secondary&size=sm&logo=opensourceinitiative&mode=light" /></picture></a>
</p>

<p>
  <picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/badge/React.svg?variant=secondary&size=sm&logo=react&logoColor=61DAFB&mode=dark" /><img alt="React" src="https://shieldcn.dev/badge/React.svg?variant=secondary&size=sm&logo=react&logoColor=61DAFB&mode=light" /></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/badge/Vue.svg?variant=secondary&size=sm&logo=vuedotjs&logoColor=4FC08D&mode=dark" /><img alt="Vue" src="https://shieldcn.dev/badge/Vue.svg?variant=secondary&size=sm&logo=vuedotjs&logoColor=4FC08D&mode=light" /></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/badge/Svelte.svg?variant=secondary&size=sm&logo=svelte&logoColor=FF3E00&mode=dark" /><img alt="Svelte" src="https://shieldcn.dev/badge/Svelte.svg?variant=secondary&size=sm&logo=svelte&logoColor=FF3E00&mode=light" /></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/badge/Solid.svg?variant=secondary&size=sm&logo=solid&logoColor=4F88C6&mode=dark" /><img alt="Solid" src="https://shieldcn.dev/badge/Solid.svg?variant=secondary&size=sm&logo=solid&logoColor=4F88C6&mode=light" /></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/badge/Preact.svg?variant=secondary&size=sm&logo=preact&logoColor=673AB8&mode=dark" /><img alt="Preact" src="https://shieldcn.dev/badge/Preact.svg?variant=secondary&size=sm&logo=preact&logoColor=673AB8&mode=light" /></picture>
  <picture><source media="(prefers-color-scheme: dark)" srcset="https://shieldcn.dev/badge/TypeScript.svg?variant=secondary&size=sm&logo=typescript&logoColor=3178C6&mode=dark" /><img alt="TypeScript" src="https://shieldcn.dev/badge/TypeScript.svg?variant=secondary&size=sm&logo=typescript&logoColor=3178C6&mode=light" /></picture>
</p>

</div>

## What makes it different

Effects come in two categories:

- **Live HTML** effects use the [HTML-in-canvas](https://chromestatus.com/feature/5172548013916160) API, on by default in Chrome 157, to draw your real DOM into the canvas. Text stays selectable, links stay clickable, and the page becomes a texture that fire, fluid, and glass distort in real time. Where the API is missing, they fall back to a GPU overlay or plain HTML, so every visitor gets a working page.
- **Universal** effects draw their whole scene on the GPU instead of capturing the page, so they look and behave the same in every modern browser.

<table>
<tr>
<td align="center">🎨</td>
<td><b>38 components</b> and counting: Liquid, Glass, Shatter, Force Field, Chrome Object, and more</td>
</tr>
<tr>
<td align="center">🧩</td>
<td><b>Framework agnostic</b>: every component ships for React, Solid, Preact, Vue, Svelte, and vanilla, in both WebGL and WebGPU builds</td>
</tr>
<tr>
<td align="center">🖥️</td>
<td><b>Two renderers</b>: WebGL with GLSL, or WebGPU through vgpu with WGSL</td>
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

Swap `liquid` for any component, `react` for `solid`, `preact`, `vue`, `svelte`, or `vanilla`. Source lands in `components/canvasui/`, yours to edit.

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

Live HTML components wrap your content. The subtree stays live and interactive; the effect runs on top. Universal components draw their own scene, so there is nothing to wrap. The object renderers, for example, take a `src`:

```tsx
<ChromeObject src="/logo.svg" className="h-96" />
```

See the [installation guide](https://canvasui.dev/docs/installation) for manual setup.

## WebGL and WebGPU

Every effect ships in two renderer builds. The WebGL build is the default: raw WebGL2 and GLSL, zero dependencies except `three` for the object effects. The WebGPU build renders through [vgpu](https://vgpu.sh) with WGSL shaders, keeps the same props and public API, and installs with the `-webgpu` registry suffix:

```bash
npx shadcn@latest add @canvas-ui/liquid-react-webgpu
```

WebGPU builds ship for all six frameworks. They need a browser with WebGPU, Chrome/Edge 113+, Safari 26+ / iOS 26, or Firefox 141+. If WebGPU is missing, the wrapped content renders unchanged. Details in the [rendering guide](https://canvasui.dev/docs/rendering).

## Components

Every component ships for all six frameworks in both renderer builds. Compare them in the [playground](https://canvasui.dev/playground).

### Live HTML

These draw your real, interactive HTML into the canvas. The full effect needs HTML-in-canvas (Chrome 157 and later); other browsers get a working fallback.

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
| [**ASCII Sweep**](https://canvasui.dev/docs/components/ascii-sweep)         | Glowing ASCII band that swaps panels  |                                                                             |                                        |

</details>

### Universal

These draw their whole scene on the GPU, with no HTML-in-canvas needed, so they look the same in every modern browser. Object renderers are the first group, with more kinds of Universal effects on the way.

<details open>
<summary><b>🧊 Object renderers</b></summary>

Point any of them at a GLB/glTF model, SVG, or image.

| Component                                                                         | What it does                           | Component                                                                   | What it does                           |
| --------------------------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------- |
| [**Glass Object**](https://canvasui.dev/docs/components/glass-object)             | Solid glass with real dispersion       | [**Chrome Object**](https://canvasui.dev/docs/components/chrome-object)     | Liquid chrome with flowing reflections |
| [**Liquid Object**](https://canvasui.dev/docs/components/liquid-object)           | Dragged through swirling liquid        | [**Particle Object**](https://canvasui.dev/docs/components/particle-object) | Particles that scatter and spring back |
| [**ASCII Object**](https://canvasui.dev/docs/components/ascii-object)             | Redrawn as shape-matched ASCII         | [**Dithered Object**](https://canvasui.dev/docs/components/dithered-object) | Rendered through a 1-bit dither        |
| [**Ink Object**](https://canvasui.dev/docs/components/ink-object)                 | Printed in rough ink strokes           | [**Wireframe Object**](https://canvasui.dev/docs/components/wireframe-object) | Edge lines with hidden-line removal  |
| [**Topographic Object**](https://canvasui.dev/docs/components/topographic-object) | Contour lines like a survey map        |                                                                             |                                        |

</details>

## Browser support

| Browser              |                Live HTML                | Universal      |
| -------------------- | :-------------------------------------: | :------------: |
| Chrome 157 and later |             ✅ Full effect              | ✅ Full effect |
| Everything else      | ⚠️ Fallback: GPU overlay or plain HTML  | ✅ Full effect |

HTML-in-Canvas ships in Chrome 157. Older Chrome versions can turn it on with the `chrome://flags/#canvas-draw-element` flag, or with an [origin trial](https://canvasui.dev/docs/installation#requirements) token on your site. Android stays on the fallback for now. Details in the [docs](https://canvasui.dev/docs).

Chrome 150 and 155 changed the WebGL and WebGPU entry points: `texElementImage2D()` became `texElementSubImage2D()`, and `copyElementImageToTexture()` became `drawElementImageToTexture()`. Neither change requires a migration in Canvas UI. The HTML effects capture content with the 2D `drawElementImage()` API, then upload the canvas with standard `texImage2D()` (WebGL) or `copyExternalImageToTexture()` (WebGPU). Those upload methods keep their existing signatures. This also applies to the generated registry components for all six frameworks.

The [same updates](https://developer.chrome.com/blog/html-in-canvas-ot-changes) changed capture markup and hit testing. Canvas UI uses `content="drawable"` and `drawable` when the browser supports them and falls back to `layoutsubtree` on older versions. When `drawElementImage()` returns a transform (Chrome 154 to 156), Canvas UI forwards it to `updateElementGeometry()`; newer versions sync hit testing on their own. Either way, scrolling, clicks, and cursor effects keep working.

Both renderers follow pinch zoom through `visualViewport`, increasing capture and rendering resolution while preserving the HTML's position and interactions. The normal 2× device-pixel-ratio budget is multiplied by the zoom scale, subject to GPU limits, an 8192-pixel maximum dimension, and a 16-megapixel buffer budget. Particle Scroll uses plain HTML without a GPU overlay when HTML-in-Canvas is unavailable, including in Safari.

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
| `src/lib/<Component>/`       | WebGL and WebGPU engines plus framework wrappers        |
| `src/demos/`                 | Interactive demo and controls for each component        |
| `src/app/`                   | Documentation site routes                               |
| `scripts/build-registry.mts` | Generates `public/r/*.json` for the shadcn CLI          |

Each component is plain TypeScript with thin framework wrappers. WebGL builds use raw WebGL2 and GLSL. WebGPU builds use vgpu and WGSL. Nothing depends on another Canvas UI component, and each engine defines its own props.

## Contributing

Issues and pull requests welcome. See [CONTRIBUTING.md](.github/CONTRIBUTING.md).

## License

[MIT + Commons Clause](LICENSE.md). Free in your own projects, commercial or not. The Commons Clause only restricts selling the library itself.

<div align="center">
<br />
<sub>Built by <a href="https://github.com/DavidHDev">David Haz</a> · <a href="https://x.com/davidhaz">@davidhaz</a></sub>
<br /><br />
<a href="https://canvasui.dev"><b>canvasui.dev</b></a>

</div>
