<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";

import {
  createAsciiObject,
  type AsciiObjectInstance,
  type AsciiObjectOptions,
} from "./AsciiObjectVanilla";

const props = withDefaults(defineProps<AsciiObjectOptions>(), {
  ascii: undefined,
  colored: undefined,
  invert: undefined,
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
  ) as AsciiObjectOptions;

const canvasEl = ref<HTMLCanvasElement | null>(null);

let instance: AsciiObjectInstance | null = null;

onMounted(() => {
  if (canvasEl.value) {
    instance = createAsciiObject({ canvas: canvasEl.value }, options());
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
