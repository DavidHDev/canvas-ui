<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";

import {
  createWireframeObject,
  type WireframeObjectInstance,
  type WireframeObjectOptions,
} from "./WireframeObjectVanilla";

const props = withDefaults(defineProps<WireframeObjectOptions>(), {
  nodes: undefined,
  orbit: undefined,
  zoom: undefined,
  autoRotate: undefined,
});

const canvasEl = ref<HTMLCanvasElement | null>(null);

let instance: WireframeObjectInstance | null = null;

onMounted(() => {
  if (canvasEl.value) {
    instance = createWireframeObject({ canvas: canvasEl.value }, props);
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
