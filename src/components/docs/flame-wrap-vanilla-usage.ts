// Shared with the browser smoke test so it runs the exact copyable example.
export const FLAME_WRAP_VANILLA_HTML = `<div style="position: relative; width: 300px; height: 336px; margin: 295px 40px 40px;">
  <canvas id="source" style="position: absolute; inset: 0; width: 100%; height: 100%;">
    <!-- #content belongs inside #source, on the element to capture. -->
    <div id="content" style="position: relative; width: 100%; height: 100%; overflow: auto;">
      <article style="box-sizing: border-box; width: 100%; height: 100%; padding: 32px; border-radius: 40px; background: #182033; color: white;">
        <h2>Ember Blackwood</h2>
        <p>Building things that burn bright.</p>
        <button type="button">Follow</button>
      </article>
    </div>
  </canvas>
  <canvas id="output" aria-hidden="true" style="position: absolute; top: -295px; right: -40px; bottom: -40px; left: -40px; width: calc(100% + 80px); height: calc(100% + 335px); pointer-events: none;"></canvas>
</div>

<script type="module" src="/src/main.ts"></script>`;

export const FLAME_WRAP_VANILLA_TS = `import {
  createFlameWrap,
  supportsHtmlInCanvas,
} from "@/components/canvasui/FlameWrapVanilla";

const source = document.querySelector<HTMLCanvasElement>("#source")!;
const content = document.querySelector<HTMLDivElement>("#content")!;
const output = document.querySelector<HTMLCanvasElement>("#output")!;

function showHtml() {
  source.after(content);
  source.style.display = "none";
}

// Without html-in-canvas, keep the content visible beneath the flame overlay.
if (!supportsHtmlInCanvas()) showHtml();

const flameWrap = createFlameWrap({ source, content, output });

// A browser without a usable GPU context should still show the content.
if (!flameWrap) {
  showHtml();
  output.style.display = "none";
}

// Later, update options with flameWrap?.setOptions({ intensity: 0.8 }).
// Call flameWrap?.destroy() when removing the component from the page.`;

export const FLAME_WRAP_VANILLA_MARKDOWN = `## Vanilla setup

Pass three elements to createFlameWrap: the source canvas, the content element inside it, and the output canvas. Put id="content" on the first div inside canvas#source. Pointing it at the outer container leaves the flames visible but prevents the HTML from being captured. Framework wrappers create this structure for you.

### index.html (inside body)

\`\`\`html
${FLAME_WRAP_VANILLA_HTML}
\`\`\`

This example uses the default flame height, spread, and corner radius. Keep room around the container for the flames; update the output canvas offsets if you increase their reach. Load this script after the markup. It keeps the HTML visible when html-in-canvas or the GPU context is unavailable.

### src/main.ts

\`\`\`ts
${FLAME_WRAP_VANILLA_TS}
\`\`\`

For the WebGPU build, change the import to @/components/canvasui/FlameWrapWebGPU. The markup and initialization stay the same. Enable the html-in-canvas flag or origin trial described in the installation requirements to capture and distort the content: https://canvasui.dev/docs/installation#requirements
`;
