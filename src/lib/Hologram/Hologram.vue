<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

import {
  createHologram,
  supportsHtmlInCanvas,
  type HologramInstance,
  type HologramOptions,
} from "./HologramVanilla";

const props = defineProps<HologramOptions>();

const sourceEl = ref<HTMLCanvasElement | null>(null);
const contentEl = ref<HTMLDivElement | null>(null);
const outputEl = ref<HTMLCanvasElement | null>(null);
const native = ref(false);

let instance: HologramInstance | null = null;
let disposed = false;

onMounted(async () => {
  native.value = supportsHtmlInCanvas();
  await nextTick();
  if (disposed) return;
  if (sourceEl.value && contentEl.value && outputEl.value) {
    instance = createHologram(
      {
        source: sourceEl.value,
        content: contentEl.value,
        output: outputEl.value,
      },
      props,
    );
    if (native.value && !instance) {
      native.value = false;
      await nextTick();
      if (disposed) return;
      if (sourceEl.value && contentEl.value && outputEl.value) {
        instance = createHologram(
          {
            source: sourceEl.value,
            content: contentEl.value,
            output: outputEl.value,
          },
          props,
        );
      }
    }
  }
});

onBeforeUnmount(() => {
  disposed = true;
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
      ref="sourceEl"
      layoutsubtree="true"
      :style="
        native
          ? 'position: absolute; inset: 0; width: 100%; height: 100%'
          : 'display: none'
      "
    >
      <div
        v-if="native"
        ref="contentEl"
        style="position: relative; width: 100%; height: 100%; overflow: auto"
      >
        <slot />
      </div>
    </canvas>
    <div
      v-if="!native"
      ref="contentEl"
      style="position: relative; width: 100%; height: 100%; overflow: auto"
    >
      <slot />
    </div>
    <canvas
      ref="outputEl"
      aria-hidden="true"
      style="
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
      "
    />
  </div>
</template>
