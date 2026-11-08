import type { Metadata } from "next";

import { CodeBlock } from "@/components/docs/code-block";
import { CodeTabs, type CodeVariant } from "@/components/docs/code-tabs";
import { CopyButton } from "@/components/docs/copy-button";
import { highlight } from "@/components/docs/highlight";
import { InstallTabs } from "@/components/docs/install-tabs";
import { LinkCards } from "@/components/docs/link-cards";
import { Footer } from "@/components/landing/footer";

export const metadata: Metadata = {
  title: "Installation",
  description:
    "Install Canvas UI components with the shadcn CLI or copy the source directly into your project.",
  alternates: { canonical: "/docs/installation" },
};

const USAGE = [
  {
    id: "react",
    label: "React",
    fileName: "page.tsx",
    lang: "tsx",
    source: `import { Liquid } from "@/components/canvasui/Liquid";

export default function Page() {
  return (
    <Liquid rainbow style={{ height: 480 }}>
      <YourContent />
    </Liquid>
  );
}`,
  },
  {
    id: "vue",
    label: "Vue",
    fileName: "App.vue",
    lang: "vue",
    source: `<script setup lang="ts">
import Liquid from "@/components/canvasui/Liquid.vue";
</script>

<template>
  <Liquid rainbow style="height: 480px">
    <YourContent />
  </Liquid>
</template>`,
  },
  {
    id: "svelte",
    label: "Svelte",
    fileName: "+page.svelte",
    lang: "svelte",
    source: `<script lang="ts">
  import Liquid from "$lib/components/canvasui/Liquid.svelte";
</script>

<Liquid rainbow>
  <YourContent />
</Liquid>`,
  },
  {
    id: "solid",
    label: "Solid",
    fileName: "App.tsx",
    lang: "tsx",
    source: `import { Liquid } from "@/components/canvasui/Liquid";

export default function App() {
  return (
    <Liquid rainbow style={{ height: "480px" }}>
      <YourContent />
    </Liquid>
  );
}`,
  },
  {
    id: "preact",
    label: "Preact",
    fileName: "App.tsx",
    lang: "tsx",
    source: `import { Liquid } from "@/components/canvasui/Liquid";

export default function App() {
  return (
    <Liquid rainbow style={{ height: "480px" }}>
      <YourContent />
    </Liquid>
  );
}`,
  },
  {
    id: "vanilla",
    label: "Vanilla",
    fileName: "main.ts",
    lang: "typescript",
    source: `import { createLiquid } from "@/components/canvasui/LiquidVanilla";

const liquid = createLiquid(
  {
    source: document.querySelector<HTMLCanvasElement>("#source")!,
    content: document.querySelector<HTMLDivElement>("#content")!,
    output: document.querySelector<HTMLCanvasElement>("#output")!,
  },
  { rainbow: true },
);

liquid?.setOptions({ radius: 0.4 });
// Call liquid?.destroy() when removing the component from the page.`,
  },
] as const;

const PAGE_MARKDOWN = `# Installation

Install any component with the shadcn CLI, or copy the source straight from its docs page. Either way, the code ends up in your project.

## Requirements

Some components are built on the html-in-canvas API, which ships in Chrome 157 and later. Each component page tells you if it applies. In browsers without support, components fall back automatically: your content renders as regular HTML and no errors are thrown.

Older versions of Chrome can turn the API on with the canvas-draw-element flag. Paste this into your address bar, enable the flag, and restart:

\`\`\`
chrome://flags/#canvas-draw-element
\`\`\`

To cover visitors who haven't updated yet, register your domain for Chrome's [origin trial](https://developer.chrome.com/blog/html-in-canvas-origin-trial), which runs through Chrome 160, and serve the token via a meta tag or HTTP header. Tokens are bound to a specific domain, so register your own. Chrome 157 and later need neither the flag nor a token.

Inside an html-in-canvas effect, the browser leaves out anything that could leak private data, such as cross-origin images and iframes that aren't CORS-enabled, visited-link styling, spelling markers, and system colors. Load images from your own origin, or from a CORS-enabled host with \`crossOrigin="anonymous"\`.

Beyond that, TypeScript is recommended, since every file ships as typed source. React components target React 19, Solid components target Solid 1.9, Preact components target Preact 10, Vue components target Vue 3.5, and Svelte components target Svelte 5. Any dependencies a component needs are installed by the CLI and listed on its docs page.

Renderers: every effect has a WebGL build and a WebGPU build where available. WebGL is the default. WebGPU builds use vgpu, WGSL shaders, and the -webgpu registry suffix. Read the rendering guide: https://canvasui.dev/docs/rendering

Android compatibility: native HTML capture stays disabled on Android as a precaution after a Chrome renderer crash report, even in Chrome 157 or with the flag enabled. Content stays in the regular DOM; effects with an overlay fallback can still animate, while capture-only effects show plain HTML. This is a compatibility mitigation, not a confirmed fix for the underlying browser crash.

## Install with the CLI

Every component has a registry entry per framework and per renderer: six WebGL entries and six WebGPU entries. Pick your package manager, renderer, and framework below, and the docs remember your choices everywhere.

\`\`\`sh
npx shadcn@latest add @canvas-ui/liquid-react
\`\`\`

The renderer selector switches the command between the WebGL item and the WebGPU item. WebGPU registry names add -webgpu after the framework, for example @canvas-ui/liquid-react-webgpu.

The CLI drops the file into components/canvasui/ in your project (Svelte: src/lib/components/canvasui/, so the \`$lib\` import resolves). If you have not used shadcn before, run \`npx shadcn@latest init\` first.

## Install manually

Open the component page, switch the code block to your framework and renderer, copy the file into your project, and import it.

## Use it

Wrap the part of your interface the effect should run over. Props are optional and can be changed live.

\`\`\`tsx
${USAGE[0].source}
\`\`\`

For vanilla WebGPU, import from LiquidWebGPU.ts instead of LiquidVanilla.ts. The createLiquid call is the same.

### Vanilla element setup

For html-in-canvas effects, \`source\` is the canvas that contains your HTML, \`content\` is the element inside that canvas to capture, and \`output\` is the separate canvas that displays the effect. Put \`id="content"\` on the inner element, not the outer container. You don't need to opt the canvas in yourself: the engine sets \`content="drawable"\` on \`source\` and \`drawable\` on \`content\` at runtime (or the older \`layoutsubtree\` before Chrome 155). Vanilla callers must move the content into the regular DOM when html-in-canvas is unavailable or initialization returns null; framework wrappers handle this for you. See the complete HTML and TypeScript example: https://canvasui.dev/docs/components/flame-wrap#vanilla-setup

## Next steps

- Read the rendering guide: https://canvasui.dev/docs/rendering
- Try Liquid, the first component: https://canvasui.dev/docs/components/liquid
- Set up the MCP server: https://canvasui.dev/docs/mcp
`;

export default async function InstallationPage() {
  const usageVariants: CodeVariant[] = await Promise.all(
    USAGE.map(async (entry) => ({
      id: entry.id,
      label: entry.label,
      fileName: entry.fileName,
      source: entry.source,
      html: await highlight(entry.source, entry.lang),
    })),
  );

  return (
    <article className="page-enter mx-auto w-full max-w-3xl">
      <div className="typeset typeset-docs">
        <div className="flex items-start justify-between gap-4">
          <h1>Installation</h1>
          <CopyButton
            text={PAGE_MARKDOWN}
            label="Copy as Markdown"
            className="mt-1 shrink-0 border border-border/70 px-3"
          />
        </div>
        <p className="max-w-xl text-muted-foreground">
          Install any component with the shadcn CLI, or copy the source straight
          from its docs page. Either way, the code ends up in your project.
        </p>

        <h2 id="requirements" className="scroll-mt-24">Requirements</h2>
        <p>
          Some components are built on the html-in-canvas API, which ships in
          Chrome 157 and later. Each component page tells you if it applies.
          In browsers without support, components fall back automatically:
          your content renders as regular HTML and no errors are thrown.
        </p>
        <p>
          Older versions of Chrome can turn the API on with the
          canvas-draw-element flag. Paste this into your address bar, enable
          the flag, and restart:
        </p>
        <div className="my-6">
          <CodeBlock source="chrome://flags/#canvas-draw-element" />
        </div>
        <p>
          To cover visitors who haven&apos;t updated yet, register your domain
          for Chrome&apos;s{" "}
          <a
            href="https://developer.chrome.com/blog/html-in-canvas-origin-trial"
            target="_blank"
            rel="noreferrer"
          >
            origin trial
          </a>
          , which runs through Chrome 160, and serve the token via a meta tag
          or HTTP header. Tokens are bound to a specific domain, so register
          your own. Chrome 157 and later need neither the flag nor a token.
        </p>
        <p>
          Inside an html-in-canvas effect, the browser leaves out anything that
          could leak private data, such as cross-origin images and iframes that
          aren&apos;t CORS-enabled, visited-link styling, spelling markers, and
          system colors. Load images from your own origin, or from a
          CORS-enabled host with <code>crossOrigin=&quot;anonymous&quot;</code>.
        </p>
        <p>
          Beyond that, TypeScript is recommended, since every file ships as
          typed source. React components target React 19, Solid components
          target Solid 1.9, Preact components target Preact 10, Vue components
          target Vue 3.5, and Svelte components target Svelte 5. Any
          dependencies a component needs are installed by the CLI and listed on
          its docs page.
        </p>
        <p>
          Renderers: every effect has a WebGL build and a WebGPU build where
          available. WebGL is the default. WebGPU builds use <code>vgpu</code>,
          WGSL shaders, and the <code>-webgpu</code> registry suffix. Read the{" "}
          <a href="/docs/rendering">rendering guide</a>.
        </p>
        <p>
          On Android, native HTML capture stays disabled as a precaution after
          a Chrome renderer crash report, even in Chrome 157 or with the flag
          enabled. Content stays in the regular DOM;
          effects with an overlay fallback can still animate, while
          capture-only effects show plain HTML. This is a compatibility
          mitigation, not a confirmed fix for the underlying browser crash.
        </p>

        <h2>Install with the CLI</h2>
        <p>
          Every component has a registry entry per framework and per renderer:
          six WebGL entries and six WebGPU entries. Pick your package manager,
          renderer, and framework below, and the docs remember your choices
          everywhere.
        </p>
        <div className="not-typeset my-6">
          <InstallTabs item="liquid" hasWebGPU />
        </div>
        <p>
          The renderer selector switches the command between the WebGL item and
          the WebGPU item. WebGPU registry names add <code>-webgpu</code> after
          the framework, for example <code>@canvas-ui/liquid-react-webgpu</code>.
        </p>
        <p>
          The CLI drops the file into <code>components/canvasui/</code> in your
          project (Svelte: <code>src/lib/components/canvasui/</code>, so the{" "}
          <code>$lib</code> import resolves). If you have not used shadcn
          before, run <code>npx shadcn@latest init</code> first.
        </p>

        <h2>Install manually</h2>
        <p>
          Prefer not to use a CLI? Open the component page, switch the code
          block to your framework and renderer, copy the file into your project,
          and import it.
        </p>

        <h2>Use it</h2>
        <p>
          Wrap the part of your interface the effect should run over. Props are
          optional and can be changed live.
        </p>
        <div className="not-typeset my-6">
          <CodeTabs variants={usageVariants} />
        </div>
        <p>
          For vanilla WebGPU, import from <code>LiquidWebGPU.ts</code> instead
          of <code>LiquidVanilla.ts</code>. The <code>createLiquid</code> call is
          the same.
        </p>
        <h3>Vanilla element setup</h3>
        <p>
          For html-in-canvas effects, <code>source</code> is the canvas that
          contains your HTML, <code>content</code> is the element inside that
          canvas to capture, and <code>output</code> is the separate canvas that
          displays the effect. Put <code>id=&quot;content&quot;</code>{" "}
          on the inner element, not the outer container. You don&apos;t need to
          opt the
          canvas in yourself: the engine sets{" "}
          <code>content=&quot;drawable&quot;</code> on <code>source</code> and{" "}
          <code>drawable</code> on <code>content</code> at runtime (or the older{" "}
          <code>layoutsubtree</code> before Chrome 155).
        </p>
        <p>
          Vanilla callers must move the content into the regular DOM when
          html-in-canvas is unavailable or initialization returns <code>null</code>;
          framework wrappers handle this for you. See the{" "}
          <a href="/docs/components/flame-wrap#vanilla-setup">
            complete HTML and TypeScript example
          </a>.
        </p>

        <h2>Next steps</h2>
        <div className="mt-6">
          <LinkCards
            items={[
              {
                href: "/docs/rendering",
                title: "Rendering",
                description: "Choose WebGL or WebGPU for each component.",
              },
              {
                href: "/docs/components/liquid",
                title: "Liquid",
                description:
                  "A pointer-driven fluid simulation over live HTML.",
              },
              {
                href: "/docs/mcp",
                title: "MCP server",
                description:
                  "Let your AI assistant install components for you.",
              },
            ]}
          />
        </div>
      </div>

      <div className="mt-24">
        <Footer variant="docs" />
      </div>
    </article>
  );
}
