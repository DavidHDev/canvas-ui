<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";

import {
  createLiquidObject,
  type LiquidObjectInstance,
  type LiquidObjectOptions,
} from "./LiquidObjectVanilla";

const props = withDefaults(defineProps<LiquidObjectOptions>(), {
  orbit: undefined,
  zoom: undefined,
  autoRotate: undefined,
});

// Vue hands the engine every declared prop, unset ones included, and casts
// unset booleans to false. The engine spreads options over its DEFAULTS, so
// pass only what was actually set and let it keep its own defaults.
const options = () =>
  Object.fromEntries(
    Object.entries(props).filter(([, value]) => value !== undefined),
  ) as LiquidObjectOptions;

const canvasEl = ref<HTMLCanvasElement | null>(null);

let instance: LiquidObjectInstance | null = null;

onMounted(() => {
  if (canvasEl.value) {
    instance = createLiquidObject({ canvas: canvasEl.value }, options());
  }
});

onBeforeUnmount(() => {
  instance?.destroy();
  instance = null;
});

watch(
  () => options(),
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
