<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";

import {
  createFlameWrap,
  supportsHtmlInCanvas,
  type FlameWrapInstance,
  type FlameWrapOptions,
} from "./FlameWrapVanilla";

const props = defineProps<FlameWrapOptions>();

// Vue hands the engine every declared prop, unset ones included, and casts
// unset booleans to false. The engine spreads options over its DEFAULTS, so
// pass only what was actually set and let it keep its own defaults.
const options = () =>
  Object.fromEntries(
    Object.entries(props).filter(([, value]) => value !== undefined),
  ) as FlameWrapOptions;

const sourceEl = ref<HTMLCanvasElement | null>(null);
const contentEl = ref<HTMLDivElement | null>(null);
const outputEl = ref<HTMLCanvasElement | null>(null);
const native = ref(false);

const outputStyle = computed(() => {
  const reach = Math.round(Math.max(props.height ?? 170, 24) * 1.5) + 40;
  const glow = Math.round(Math.max(props.spread ?? 8, 8) * 3) + 16;
  return {
    position: "absolute" as const,
    top: `${-reach}px`,
    right: `${-glow}px`,
    bottom: `${-glow}px`,
    left: `${-glow}px`,
    width: `calc(100% + ${glow * 2}px)`,
    height: `calc(100% + ${reach + glow}px)`,
    pointerEvents: "none" as const,
  };
});

let instance: FlameWrapInstance | null = null;
let disposed = false;

onMounted(async () => {
  native.value = supportsHtmlInCanvas();
  await nextTick();
  if (disposed) return;
  if (sourceEl.value && contentEl.value && outputEl.value) {
    instance = createFlameWrap(
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
        instance = createFlameWrap(
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
    <canvas ref="outputEl" aria-hidden="true" :style="outputStyle" />
  </div>
</template>
