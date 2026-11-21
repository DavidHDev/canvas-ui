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
    createCanvas,
    supportsHtmlInCanvas,
    type CanvasInstance,
    type CanvasOptions,
  } from "./CanvasVanilla";

  interface Props extends CanvasOptions {
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
  let instance: CanvasInstance | null = null;

  const native = $derived(
    supported && !failed && Boolean(children) && options.layer === "page",
  );
  const behind = $derived(
    options.layer === undefined || options.layer === "background",
  );
  const insetX = $derived(
    options.layer === "foreground" ? 0 : Math.max(options.insetX ?? 0, 0),
  );
  const insetY = $derived(
    options.layer === "foreground" ? 0 : Math.max(options.insetY ?? 0, 0),
  );
  const rootStyle = $derived(
    fixed
      ? `position: fixed; inset: 0; z-index: ${behind ? -1 : 50}; isolation: isolate;${children ? "" : " pointer-events: none;"}`
      : "position: relative; isolation: isolate;",
  );
  const contentStyle = $derived(
    `position: relative; width: 100%; height: 100%; overflow: auto; box-sizing: border-box;${insetX || insetY ? ` padding: ${insetY}px ${insetX}px;` : ""}`,
  );
  const outputStyle = $derived(
    `position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none;${behind && children ? " z-index: -1;" : ""}`,
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
      instance = createCanvas(
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
      <div bind:this={contentEl} style={contentStyle}>
        {@render children?.()}
      </div>
    </canvas>
  {:else if children}
    <div bind:this={contentEl} style={contentStyle}>
      {@render children()}
    </div>
  {/if}
  <canvas bind:this={outputEl} aria-hidden="true" style={outputStyle}></canvas>
</div>
