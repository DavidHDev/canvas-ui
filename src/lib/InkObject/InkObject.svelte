<script lang="ts">
  import { onMount } from "svelte";

  import {
    createInkObject,
    type InkObjectInstance,
    type InkObjectOptions,
  } from "./InkObjectVanilla";

  interface Props extends InkObjectOptions {
    class?: string;
  }

  let { class: className = "", ...options }: Props = $props();

  let canvasEl = $state<HTMLCanvasElement>()!;
  let instance: InkObjectInstance | null = null;

  onMount(() => {
    instance = createInkObject({ canvas: canvasEl }, options);
    return () => {
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
    bind:this={canvasEl}
    style="position: absolute; inset: 0; width: 100%; height: 100%; display: block; touch-action: none;"
  ></canvas>
</div>
