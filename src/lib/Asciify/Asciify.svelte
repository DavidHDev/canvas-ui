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
    createAsciify,
    supportsHtmlInCanvas,
    type AsciifyInstance,
    type AsciifyOptions,
  } from "./AsciifyVanilla";

  interface Props extends AsciifyOptions {
    class?: string;
    fixed?: boolean;
    children?: import("svelte").Snippet;
  }

  let {
    class: className = "",
    fixed = false,
    children,
    ...options
  }: Props = $props();

  let sourceEl = $state<HTMLCanvasElement | null>(null);
  let contentEl = $state<HTMLDivElement | null>(null);
  let outputEl = $state<HTMLCanvasElement>()!;
  let supported = $state(false);
  let failed = $state(false);
  let mounted = $state(false);
  let instance: AsciifyInstance | null = null;

  const native = $derived(
    supported && !failed && Boolean(children) && options.source === "page",
  );
  const rootStyle = $derived(
    fixed
      ? `position: fixed; inset: 0; z-index: 50;${children ? "" : " pointer-events: none;"}`
      : "position: relative;",
  );

  onMount(() => {
    supported = supportsHtmlInCanvas();
    mounted = true;
  });

  $effect(() => {
    if (!mounted) return;
    const useNative = native;
    let disposed = false;
    (async () => {
      await tick();
      if (disposed || !outputEl) return;
      instance = createAsciify(
        {
          source: useNative ? sourceEl : null,
          content: contentEl,
          output: outputEl,
        },
        options,
      );
      if (useNative && !instance) failed = true;
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

<div class={className} style={rootStyle}>
  {#if native}
    <canvas
      bind:this={sourceEl}
      layoutsubtree="true"
      style="position: absolute; inset: 0; width: 100%; height: 100%;"
    >
      <div
        bind:this={contentEl}
        style="position: relative; width: 100%; height: 100%; overflow: auto;"
      >
        {@render children?.()}
      </div>
    </canvas>
  {:else if children}
    <div
      bind:this={contentEl}
      style="position: relative; width: 100%; height: 100%; overflow: auto;"
    >
      {@render children()}
    </div>
  {/if}
  <canvas
    bind:this={outputEl}
    aria-hidden="true"
    style="position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none;"
  ></canvas>
</div>
