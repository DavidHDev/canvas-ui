<script module lang="ts">
  declare module "svelte/elements" {
    interface HTMLCanvasAttributes {
      layoutsubtree?: string;
    }
  }
</script>

<script lang="ts">
  import { onMount, tick } from "svelte";

  import {
    createAsciiSweep,
    supportsHtmlInCanvas,
    type AsciiSweepInstance,
    type AsciiSweepOptions,
  } from "./AsciiSweepVanilla";

  interface Props extends AsciiSweepOptions {
    class?: string;
    /** The first panel. */
    children?: import("svelte").Snippet;
    /** The second panel, swapped in when index is 1. */
    alternate?: import("svelte").Snippet;
    /** Which panel to show. Changing it sweeps to that panel. */
    index?: number;
    /** Flip the sweep 180 degrees when sweeping back to the first panel. */
    directional?: boolean;
  }

  let {
    class: className = "",
    children,
    alternate,
    index = 0,
    directional = true,
    ...options
  }: Props = $props();

  const PANEL_STYLE =
    "position: absolute; inset: 0; width: 100%; height: 100%; overflow: auto;";

  let sourceAEl = $state<HTMLCanvasElement>()!;
  let sourceBEl = $state<HTMLCanvasElement>()!;
  let contentAEl = $state<HTMLDivElement>()!;
  let contentBEl = $state<HTMLDivElement>()!;
  let outputEl = $state<HTMLCanvasElement>()!;
  let native = $state(false);
  let ready = $state(false);
  let instance: AsciiSweepInstance | null = null;

  // Before the engine runs, the panels would paint stacked on top of each
  // other. Hide all but the starting one so the first frame is clean. Once the
  // engine is ready it owns stacking, and this stops being rendered.
  const layerStyle = (slot: 0 | 1) =>
    ready || slot === (index >= 1 ? 1 : 0)
      ? PANEL_STYLE
      : `${PANEL_STYLE} visibility: hidden;`;

  function create() {
    if (!sourceAEl || !sourceBEl || !contentAEl || !contentBEl || !outputEl) {
      return null;
    }
    return createAsciiSweep(
      {
        slots: [
          { source: sourceAEl, content: contentAEl },
          { source: sourceBEl, content: contentBEl },
        ],
        output: outputEl,
      },
      options,
    );
  }

  onMount(() => {
    native = supportsHtmlInCanvas();
    let disposed = false;
    (async () => {
      await tick();
      if (disposed) return;
      instance = create();
      if (native && !instance) {
        native = false;
        await tick();
        if (disposed) return;
        instance = create();
      }
      if (instance) {
        ready = true;
        // Re-capture once every panel is visible, so the panel that started
        // hidden is not baked into the textures as blank.
        await tick();
        if (disposed) return;
        instance.capture();
      }
    })();
    return () => {
      disposed = true;
      ready = false;
      instance?.destroy();
      instance = null;
    };
  });

  $effect(() => {
    instance?.setOptions({ ...options });
  });

  $effect(() => {
    const slot = index >= 1 ? 1 : 0;
    if (!instance || instance.current() === slot) return;
    const base = options.angle ?? 0;
    instance.sweep(slot, {
      angle: directional && slot === 0 ? base + 180 : base,
    });
  });
</script>

<div class={className} style="position: relative;">
  <canvas
    bind:this={sourceAEl}
    layoutsubtree="true"
    style={native ? layerStyle(0) : "display: none;"}
  >
    {#if native}
      <div
        bind:this={contentAEl}
        style="position: relative; width: 100%; height: 100%; overflow: auto;"
      >
        {@render children?.()}
      </div>
    {/if}
  </canvas>
  <canvas
    bind:this={sourceBEl}
    layoutsubtree="true"
    style={native ? layerStyle(1) : "display: none;"}
  >
    {#if native}
      <div
        bind:this={contentBEl}
        style="position: relative; width: 100%; height: 100%; overflow: auto;"
      >
        {@render alternate?.()}
      </div>
    {/if}
  </canvas>
  {#if !native}
    <div bind:this={contentAEl} style={layerStyle(0)}>
      {@render children?.()}
    </div>
    <div bind:this={contentBEl} style={layerStyle(1)}>
      {@render alternate?.()}
    </div>
  {/if}
  <canvas
    bind:this={outputEl}
    aria-hidden="true"
    style="position: absolute; inset: 0; width: 100%; height: 100%; z-index: 1; pointer-events: none;"
  ></canvas>
</div>
