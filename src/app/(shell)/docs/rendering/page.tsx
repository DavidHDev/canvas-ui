import type { Metadata } from "next";

import { CodeBlock } from "@/components/docs/code-block";
import { CopyButton } from "@/components/docs/copy-button";
import { highlight } from "@/components/docs/highlight";
import { InstallTabs } from "@/components/docs/install-tabs";
import { LinkCards } from "@/components/docs/link-cards";
import { Footer } from "@/components/landing/footer";

export const metadata: Metadata = {
  title: "Rendering: WebGL and WebGPU",
  description:
    "Choose between Canvas UI's WebGL and WebGPU renderer builds. Both ship the same effect and the same public API.",
  alternates: { canonical: "/docs/rendering" },
};

const INSTALL_COMMAND = "npx shadcn@latest add @canvas-ui/ripple-react-webgpu";
const WEBGPU_TYPES = `/// <reference types="@webgpu/types" />`;

const PAGE_MARKDOWN = `# Rendering

Every Canvas UI effect ships in two renderer builds: WebGL and WebGPU. They expose the same props, the same option types, and the same public API. Pick the renderer you want: the effect looks and moves the same.

## Choosing a renderer

WebGPU is a matter of taste, not a requirement. Pick WebGL for the widest browser support and zero dependencies. Pick WebGPU if you want WGSL, a WebGPU-native and compute-ready pipeline, or you are standardizing on WebGPU.

| | WebGL | WebGPU |
| --- | --- | --- |
| Shading language | GLSL | WGSL |
| Dependencies | None, except three for the object effects | vgpu, plus three for the object effects |
| Frameworks | React, Vue, Svelte, Solid, Preact, vanilla | React, Vue, Svelte, Solid, Preact, vanilla |
| Browser support | Widest support through WebGL2 | Chrome/Edge 113+, Safari 26+ / iOS 26, Firefox 141+ |
| Fallback behavior | Falls back to regular HTML when html-in-canvas is unavailable | Shows wrapped content unchanged when WebGPU is unavailable |
| Install suffix | None, for example \`@canvas-ui/ripple-react\` | \`-webgpu\`, for example \`@canvas-ui/ripple-react-webgpu\` |

## Install the WebGPU build

Use the renderer selector in the install block, or add the WebGPU registry item directly:

\`\`\`sh
${INSTALL_COMMAND}
\`\`\`

## TypeScript setup

The WebGPU build depends on \`@webgpu/types\`. The CLI adds it as a devDependency. If your TypeScript setup does not already include WebGPU types, add this to a \`.d.ts\` file:

\`\`\`ts
${WEBGPU_TYPES}
\`\`\`

## How it works

Each installed component is still a single source file. React files inline the engine in files like \`Ripple.tsx\`. Vanilla WebGPU files use names like \`RippleWebGPU.ts\`, while the WebGL vanilla files use \`RippleVanilla.ts\`.

The public shape stays the same: \`create<Base>()\`, \`<Base>Options\`, \`setOptions()\`, and \`destroy()\`. The WebGPU path shares one device per page, initializes lazily and asynchronously, and returns \`null\` synchronously when \`navigator.gpu\` or an adapter is missing so framework wrappers can fall back without throwing.

The renderer uses a premultiplied surface. The page is captured with html-in-canvas, uploaded as a texture, then sampled by WGSL shaders written as inline template strings. Mipmaps are generated in WebGPU wherever the matching WebGL build used them.

Both renderers capture the HTML the same way: through the 2D \`drawElementImage()\` API inside a \`<canvas content="drawable">\` (\`layoutsubtree\` before Chrome 155), then upload that canvas with \`texImage2D()\` (WebGL) or \`copyExternalImageToTexture()\` (WebGPU). They don't use html-in-canvas's direct texture methods, so Chrome renaming those to \`texElementSubImage2D()\` and \`drawElementImageToTexture()\` changed nothing here.

## Switching later

The API is identical, so switching renderers is usually replacing the installed file with the other build. The docs renderer selector remembers your WebGL or WebGPU choice across pages.

## Browser support

- WebGL build: any browser with WebGL2.
- WebGPU build: Chrome/Edge 113+, Safari 26+ / iOS 26, and Firefox 141+.
- If navigator.gpu is missing, or no adapter is available, the WebGPU component renders the wrapped content unchanged.
- HTML capture: Chrome 157 and later on desktop. Older Chrome can turn it on with the canvas-draw-element flag or an origin-trial token (see https://canvasui.dev/docs/installation#requirements). Without it, html-in-canvas effects fall back to regular HTML, and overlay effects keep running on top.
- On Android, both renderers skip native HTML capture after a Chrome renderer crash report. Content stays in the regular DOM, even in Chrome 157 or with the flag enabled. Effects with an overlay fallback may still animate; capture-only effects show plain HTML. This is a precautionary compatibility mitigation, not a confirmed fix for the browser crash.

## Pinch zoom

Both renderers increase capture and rendering resolution when you pinch to zoom. The HTML keeps its CSS size and position, so panning, clicks, and scrolling stay aligned.

The normal device-pixel-ratio budget is capped at 2×, then multiplied by the zoom scale. To keep large canvases within GPU limits, buffers are also capped at 8192 pixels per dimension and 16 megapixels in total, or the device's lower WebGL limit. Extreme zoom can reach this quality ceiling.

## What is the same / what differs

The look, motion, props, option types, and public API are the same. WebGPU needs a modern browser and adds \`vgpu\`. Both builds ship for all six frameworks, because the wrappers are shared and only the engine file differs.

## Next steps

- Read the installation guide: https://canvasui.dev/docs/installation
- Try Ripple: https://canvasui.dev/docs/components/ripple
`;

export default async function RenderingPage() {
  const typesHtml = await highlight(WEBGPU_TYPES, "typescript");

  return (
    <article className="page-enter mx-auto w-full max-w-3xl">
      <div className="typeset typeset-docs">
        <div className="flex items-start justify-between gap-4">
          <h1>Rendering</h1>
          <CopyButton
            text={PAGE_MARKDOWN}
            label="Copy as Markdown"
            className="mt-1 shrink-0 border border-border/70 px-3"
          />
        </div>
        <p className="max-w-xl text-muted-foreground">
          Every Canvas UI effect ships in two renderer builds: WebGL and WebGPU.
          They expose the same props, the same option types, and the same public
          API. Pick the renderer you want, the effect should look and move the
          same.
        </p>

        <h2>Choosing a renderer</h2>
        <p>
          WebGPU is a matter of taste, not a requirement. Pick WebGL for the
          widest browser support and zero dependencies. Pick WebGPU if you want
          WGSL, a WebGPU-native and compute-ready pipeline, or you are
          standardizing on WebGPU.
        </p>
        <table>
          <thead>
            <tr>
              <th />
              <th>WebGL</th>
              <th>WebGPU</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th>Shading language</th>
              <td>GLSL</td>
              <td>WGSL</td>
            </tr>
            <tr>
              <th>Dependencies</th>
              <td>None, except three for the object effects</td>
              <td>vgpu, plus three for the object effects</td>
            </tr>
            <tr>
              <th>Frameworks</th>
              <td>React, Vue, Svelte, Solid, Preact, vanilla</td>
              <td>React, Vue, Svelte, Solid, Preact, vanilla</td>
            </tr>
            <tr>
              <th>Browser support</th>
              <td>Widest support through WebGL2</td>
              <td>Chrome/Edge 113+, Safari 26+ / iOS 26, Firefox 141+</td>
            </tr>
            <tr>
              <th>Fallback behavior</th>
              <td>Falls back to regular HTML when html-in-canvas is unavailable</td>
              <td>Shows wrapped content unchanged when WebGPU is unavailable</td>
            </tr>
            <tr>
              <th>Install suffix</th>
              <td>None, for example @canvas-ui/ripple-react</td>
              <td>-webgpu, for example @canvas-ui/ripple-react-webgpu</td>
            </tr>
          </tbody>
        </table>

        <h2>Install the WebGPU build</h2>
        <p>
          Use the renderer selector in the install block, or add the WebGPU
          registry item directly:
        </p>
        <div className="not-typeset my-6">
          <InstallTabs item="ripple" hasWebGPU />
        </div>

        <h2>TypeScript setup</h2>
        <p>
          The WebGPU build depends on <code>@webgpu/types</code>. The CLI adds
          it as a devDependency. If your TypeScript setup does not already
          include WebGPU types, add this to a <code>.d.ts</code> file:
        </p>
        <div className="my-6">
          <CodeBlock
            html={typesHtml}
            source={WEBGPU_TYPES}
            fileName="webgpu.d.ts"
          />
        </div>

        <h2>How it works</h2>
        <p>
          Each installed component is still a single source file. React files
          inline the engine in files like <code>Ripple.tsx</code>. Vanilla WebGPU
          files use names like <code>RippleWebGPU.ts</code>, while the WebGL
          vanilla files use <code>RippleVanilla.ts</code>.
        </p>
        <p>
          The public shape stays the same: <code>create&lt;Base&gt;()</code>,{" "}
          <code>&lt;Base&gt;Options</code>, <code>setOptions()</code>, and{" "}
          <code>destroy()</code>. The WebGPU path shares one device per page,
          initializes lazily and asynchronously, and returns <code>null</code>{" "}
          synchronously when <code>navigator.gpu</code> or an adapter is missing
          so framework wrappers can fall back without throwing.
        </p>
        <p>
          The renderer uses a premultiplied surface. The page is captured with
          html-in-canvas, uploaded as a texture, then sampled by WGSL shaders
          written as inline template strings. Mipmaps are generated in WebGPU
          wherever the matching WebGL build used them.
        </p>
        <p>
          Both renderers capture the HTML the same way: through the 2D{" "}
          <code>drawElementImage()</code> API inside a{" "}
          <code>&lt;canvas content=&quot;drawable&quot;&gt;</code> (
          <code>layoutsubtree</code> before Chrome 155), then upload that canvas
          with <code>texImage2D()</code> (WebGL) or{" "}
          <code>copyExternalImageToTexture()</code>{" "}
          (WebGPU). They don&apos;t use
          html-in-canvas&apos;s direct texture methods, so Chrome renaming those
          to <code>texElementSubImage2D()</code> and{" "}
          <code>drawElementImageToTexture()</code> changed nothing here.
        </p>

        <h2>Switching later</h2>
        <p>
          The API is identical, so switching renderers is usually replacing the
          installed file with the other build. The docs renderer selector
          remembers your WebGL or WebGPU choice across pages.
        </p>

        <h2>Browser support</h2>
        <ul>
          <li>WebGL build: any browser with WebGL2.</li>
          <li>
            WebGPU build: Chrome/Edge 113+, Safari 26+ / iOS 26, and Firefox
            141+.
          </li>
          <li>
            If <code>navigator.gpu</code> is missing, or no adapter is available,
            the WebGPU component renders the wrapped content unchanged.
          </li>
          <li>
            HTML capture: Chrome 157 and later on desktop. Older Chrome can turn
            it on with the canvas-draw-element flag or an origin-trial token
            (see the{" "}
            <a href="/docs/installation#requirements">installation requirements</a>
            ). Without it, html-in-canvas effects fall back to regular HTML, and
            overlay effects keep running on top.
          </li>
          <li>
            On Android, both renderers skip native HTML capture after a Chrome
            renderer crash report. Content stays in the regular DOM, even in
            Chrome 157 or with the flag enabled. Effects with an overlay
            fallback may still animate; capture-only effects show plain HTML.
            This is a precautionary compatibility mitigation, not a confirmed
            fix for the browser crash.
          </li>
        </ul>

        <h2>Pinch zoom</h2>
        <p>
          Both renderers increase capture and rendering resolution when you pinch
          to zoom. The HTML keeps its CSS size and position, so panning, clicks,
          and scrolling stay aligned.
        </p>
        <p>
          The normal device-pixel-ratio budget is capped at 2×, then multiplied by
          the zoom scale. To keep large canvases within GPU limits, buffers are
          also capped at 8192 pixels per dimension and 16 megapixels in total, or
          the device&apos;s lower WebGL limit. Extreme zoom can reach this quality
          ceiling.
        </p>

        <h2>What is the same / what differs</h2>
        <p>
          The look, motion, props, option types, and public API are the same.
          WebGPU needs a modern browser and adds <code>vgpu</code>. Both builds
          ship for all six frameworks, because the wrappers are shared and only
          the engine file differs.
        </p>

        <h2>Next steps</h2>
        <div className="mt-6">
          <LinkCards
            items={[
              {
                href: "/docs/installation",
                title: "Installation",
                description: "Install from the CLI or copy the source manually.",
              },
              {
                href: "/docs/components/ripple",
                title: "Ripple",
                description: "Water ripples from every click over live HTML.",
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
