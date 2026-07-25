# Contributing to Canvas UI

Thanks for your interest in contributing. Issues, bug reports, and pull requests are all welcome.

## Repo layout

- `src/lib/` is the library itself. Each component has one folder containing the framework wrappers (React `*.tsx`, Solid `*.solid.tsx`, Preact `*.preact.tsx`, Lit `*.lit.ts`, Vue `*.vue`, Svelte `*.svelte`, and vanilla `*.ts`) and a shared `*Vanilla.ts` engine where the canvas/WebGL logic lives.
- `src/app/` is the documentation site (Next.js 16, Tailwind v4), deployed to Cloudflare Workers.
- `src/components/demos/` holds the interactive demos shown in the docs.
- `scripts/build-registry.mts` generates the shadcn-compatible registry in `public/r/` from `src/lib`. It runs automatically before `dev` and `build`.

## Getting started

```bash
npm install
npm run dev
```

## Before you open a PR

1. Run the checks:

   ```bash
   npx tsc --noEmit
   npm run lint
   npm run build
   ```

2. If you touched a component in `src/lib`, verify its demo page still works in the docs, including the WebGL overlay fallback (the path taken when html-in-canvas is unavailable, which is what most browsers use today).
3. Keep changes focused. One component or one fix per PR is easiest to review.

## Component guidelines

- The vanilla engine owns all rendering logic. Framework wrappers should stay thin.
- Every component must work both with html-in-canvas (live DOM texture) and as a plain WebGL overlay fallback.
- WebGL canvases composite with premultiplied alpha. Shaders must output `rgb * alpha` and contexts use `premultipliedAlpha: true`. Never un-premultiply in a shader.
- Test in Safari as well as Chrome. Safari is the strictest about alpha compositing and video decoding.

## Reporting bugs

Please include your browser and version, whether the html-in-canvas flag is enabled, and steps to reproduce. A short screen recording helps a lot for visual glitches.
