<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

import {
  createParticleScroll,
  supportsHtmlInCanvas,
  type ParticleScrollInstance,
  type ParticleScrollOptions,
} from "./ParticleScrollVanilla";

const props = defineProps<ParticleScrollOptions>();

// Vue hands the engine every declared prop, unset ones included, and casts
// unset booleans to false. The engine spreads options over its DEFAULTS, so
// pass only what was actually set and let it keep its own defaults.
const options = () =>
  Object.fromEntries(
    Object.entries(props).filter(([, value]) => value !== undefined),
  ) as ParticleScrollOptions;

const sourceEl = ref<HTMLCanvasElement | null>(null);
const contentEl = ref<HTMLDivElement | null>(null);
const outputEl = ref<HTMLCanvasElement | null>(null);
const native = ref(false);

let instance: ParticleScrollInstance | null = null;
let disposed = false;

onMounted(async () => {
  native.value = supportsHtmlInCanvas();
  await nextTick();
  if (disposed) return;
  if (sourceEl.value && contentEl.value && outputEl.value) {
    instance = createParticleScroll(
      {
        source: sourceEl.value,
        content: contentEl.value,
        output: outputEl.value,
      },
      options(),
    );
    if (native.value && !instance) {
      native.value = false;
      await nextTick();
      if (disposed) return;
      if (sourceEl.value && contentEl.value && outputEl.value) {
        instance = createParticleScroll(
          {
            source: sourceEl.value,
            content: contentEl.value,
            output: outputEl.value,
          },
          options(),
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
  () => options(),
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
      :style="{ display: native ? 'block' : 'none' }"
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
