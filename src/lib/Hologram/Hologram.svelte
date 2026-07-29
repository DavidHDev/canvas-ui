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
    createHologram,
    supportsHtmlInCanvas,
    type HologramInstance,
    type HologramOptions,
  } from "./HologramVanilla";

  interface Props extends HologramOptions {
    class?: string;
    children?: import("svelte").Snippet;
  }

  let { class: className = "", children, ...options }: Props = $props();

  let sourceEl = $state<HTMLCanvasElement>()!;
  let contentEl = $state<HTMLDivElement>()!;
  let outputEl = $state<HTMLCanvasElement>()!;
  let native = $state(false);
  let instance: HologramInstance | null = null;

  onMount(() => {
    native = supportsHtmlInCanvas();
    let disposed = false;
    (async () => {
      await tick();
      if (disposed) return;
      if (!sourceEl || !contentEl || !outputEl) return;
      instance = createHologram(
        { source: sourceEl, content: contentEl, output: outputEl },
        options,
      );
      if (native && !instance) {
        native = false;
        await tick();
        if (disposed) return;
        if (!sourceEl || !contentEl || !outputEl) return;
        instance = createHologram(
          { source: sourceEl, content: contentEl, output: outputEl },
          options,
        );
      }
    })();
    return () => {
      disposed = true;
      instance?.destroy();
      instance = null;
    };
  });

  $effect(() => {
    instance?.setOptions({ ...options });
  });
</script>

<div class={className} style="position: relative;">
  <canvas
    bind:this={sourceEl}
    layoutsubtree="true"
    style={native
      ? "position: absolute; inset: 0; width: 100%; height: 100%;"
      : "display: none;"}
  >
    {#if native}
      <div
        bind:this={contentEl}
        style="position: relative; width: 100%; height: 100%; overflow: auto;"
      >
        {@render children?.()}
      </div>
    {/if}
  </canvas>
  {#if !native}
    <div
      bind:this={contentEl}
      style="position: relative; width: 100%; height: 100%; overflow: auto;"
    >
      {@render children?.()}
    </div>
  {/if}
  <canvas
    bind:this={outputEl}
    aria-hidden="true"
    style="position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none;"
  ></canvas>
</div>
