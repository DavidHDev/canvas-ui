<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";

import {
  createChromeObject,
  type ChromeObjectInstance,
  type ChromeObjectOptions,
} from "./ChromeObjectVanilla";

const props = withDefaults(defineProps<ChromeObjectOptions>(), {
  orbit: undefined,
  zoom: undefined,
  autoRotate: undefined,
});

const canvasEl = ref<HTMLCanvasElement | null>(null);

let instance: ChromeObjectInstance | null = null;

onMounted(() => {
  if (canvasEl.value) {
    instance = createChromeObject({ canvas: canvasEl.value }, props);
  }
});

onBeforeUnmount(() => {
  instance?.destroy();
  instance = null;
});

watch(
  () => ({ ...props }),
  (next) => instance?.setOptions(next),
  { deep: true },
);
</script>

<template>
  <div style="position: relative">
    <canvas
      ref="canvasEl"
      style="
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        display: block;
        touch-action: none;
      "
    />
  </div>
</template>
