<script lang="ts">
  import { onMount } from "svelte";

  import {
    createChromeObject,
    type ChromeObjectInstance,
    type ChromeObjectOptions,
  } from "./ChromeObjectVanilla";

  interface Props extends ChromeObjectOptions {
    class?: string;
  }

  let { class: className = "", ...options }: Props = $props();

  let canvasEl = $state<HTMLCanvasElement>()!;
  let instance: ChromeObjectInstance | null = null;

  onMount(() => {
    instance = createChromeObject({ canvas: canvasEl }, options);
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
