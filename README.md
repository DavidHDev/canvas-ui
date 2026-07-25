<a href="https://canvasui.dev">
  <img src=".github/readme.gif" alt="Canvas UI" width="100%" />
</a>

# Canvas UI

An open source library of creative, framework-agnostic components drawn on canvas. Fluid simulations, shader effects, and 3D scenes that run over your live, fully interactive interface.

**[canvasui.dev](https://canvasui.dev)** · [Docs](https://canvasui.dev/docs) · [Components](https://canvasui.dev/components)

## What makes it different

Most of the library is built on the experimental [html-in-canvas](https://chromestatus.com/feature/5162535032373248) API, which lets WebGL effects read and redraw your live DOM. Text stays selectable, links stay clickable, and the whole page becomes a texture that fire, fluid, and glass can distort in real time.

Where html-in-canvas is not supported, components degrade gracefully to pure WebGL overlays, so every visitor gets a working page.

- **25 components** and counting: Liquid, Blaze, Glass, Shatter, VHS, Particle Reveal, and more
- **Framework agnostic**: React, Solid, Preact, Lit, Vue, Svelte, and vanilla JS builds for every component
- **Copy, do not install**: components ship as source through a shadcn-compatible registry
- **Zero config**: each component is self-contained with sensible defaults and typed props
- **MCP ready**: point the shadcn MCP server at the registry and let your AI assistant install components

## Quick start

Add a component with the shadcn CLI (run `npx shadcn@latest init` first if you have not used it before):

```bash
npx shadcn@latest add @canvas-ui/liquid-react
```

Swap `liquid` for any component and `react` for `solid`, `preact`, `lit`, `vue`, `svelte`, or `vanilla`. The source lands in `components/canvasui/` in your project, yours to edit.

See the [installation guide](https://canvasui.dev/docs/installation) for manual setup and framework notes.

## Browser support

The full html-in-canvas experience currently requires Chrome or Edge 140+ with the `chrome://flags/#canvas-draw-element` flag enabled (for production sites, an [origin trial](https://canvasui.dev/docs/installation) token is available). Everywhere else, components automatically fall back to WebGL overlay rendering. Details in the [docs](https://canvasui.dev/docs).

## Development

This repo contains the library source (`src/lib`), the documentation site (Next.js 16, Tailwind v4, deployed to Cloudflare Workers), and the registry build.

```bash
npm install
npm run dev        # builds the registry, then starts next dev
npm run build      # production build
npm run deploy     # build and deploy to Cloudflare
```

## Contributing

Issues and pull requests are welcome. See [CONTRIBUTING.md](.github/CONTRIBUTING.md) to get started.

## License

[MIT + Commons Clause](LICENSE.md). Free to use in your own projects, commercial or not. The Commons Clause only restricts selling the library itself.
