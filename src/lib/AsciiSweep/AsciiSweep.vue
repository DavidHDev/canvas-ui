<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";

import {
  createAsciiSweep,
  supportsHtmlInCanvas,
  type AsciiSweepInstance,
  type AsciiSweepOptions,
} from "./AsciiSweepVanilla";

interface Props extends AsciiSweepOptions {
  /** Which panel to show. Changing it sweeps to that panel. */
  index?: number;
  /** Flip the sweep 180 degrees when sweeping back to the first panel. */
  directional?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  index: 0,
  directional: true,
});

const PANEL_STYLE =
  "position: absolute; inset: 0; width: 100%; height: 100%; overflow: auto";

const sourceAEl = ref<HTMLCanvasElement | null>(null);
const sourceBEl = ref<HTMLCanvasElement | null>(null);
const contentAEl = ref<HTMLDivElement | null>(null);
const contentBEl = ref<HTMLDivElement | null>(null);
const outputEl = ref<HTMLCanvasElement | null>(null);
const native = ref(false);
const ready = ref(false);

// Before the engine runs, the panels would paint stacked on top of each other.
// Hide all but the starting one so the first frame is clean. Once the engine is
// ready it owns stacking, and this stops being rendered.
const layerStyle = (slot: 0 | 1) =>
  ready.value || slot === ((props.index ?? 0) >= 1 ? 1 : 0)
    ? PANEL_STYLE
    : `${PANEL_STYLE}; visibility: hidden`;

let instance: AsciiSweepInstance | null = null;
let disposed = false;

function create() {
  if (
    !sourceAEl.value ||
    !sourceBEl.value ||
    !contentAEl.value ||
    !contentBEl.value ||
    !outputEl.value
  ) {
    return null;
  }
  return createAsciiSweep(
    {
      slots: [
        { source: sourceAEl.value, content: contentAEl.value },
        { source: sourceBEl.value, content: contentBEl.value },
      ],
      output: outputEl.value,
    },
    props,
  );
}

onMounted(async () => {
  native.value = supportsHtmlInCanvas();
  await nextTick();
  if (disposed) return;
  instance = create();
  if (native.value && !instance) {
    native.value = false;
    await nextTick();
    if (disposed) return;
    instance = create();
  }
  if (instance) {
    ready.value = true;
    // Re-capture once every panel is visible, so the panel that started hidden
    // is not baked into the textures as blank.
    await nextTick();
    if (disposed) return;
    instance.capture();
  }
});

onBeforeUnmount(() => {
  disposed = true;
  ready.value = false;
  instance?.destroy();
  instance = null;
});

watch(
  () => ({ ...props }),
  (next) => instance?.setOptions(next),
  { deep: true },
);

watch(
  () => props.index,
  (value) => {
    const slot = (value ?? 0) >= 1 ? 1 : 0;
    if (!instance || instance.current() === slot) return;
    const base = props.angle ?? 0;
    instance.sweep(slot, {
      angle: props.directional && slot === 0 ? base + 180 : base,
    });
  },
);
</script>

<template>
  <div style="position: relative">
    <canvas
      ref="sourceAEl"
      layoutsubtree="true"
      :style="native ? layerStyle(0) : 'display: none'"
    >
      <div
        v-if="native"
        ref="contentAEl"
        style="position: relative; width: 100%; height: 100%; overflow: auto"
      >
        <slot />
      </div>
    </canvas>
    <canvas
      ref="sourceBEl"
      layoutsubtree="true"
      :style="native ? layerStyle(1) : 'display: none'"
    >
      <div
        v-if="native"
        ref="contentBEl"
        style="position: relative; width: 100%; height: 100%; overflow: auto"
      >
        <slot name="alternate" />
      </div>
    </canvas>
    <template v-if="!native">
      <div ref="contentAEl" :style="layerStyle(0)">
        <slot />
      </div>
      <div ref="contentBEl" :style="layerStyle(1)">
        <slot name="alternate" />
      </div>
    </template>
    <canvas
      ref="outputEl"
      aria-hidden="true"
      style="
        position: absolute;
        inset: 0;
        width: 100%;
        height: 100%;
        z-index: 1;
        pointer-events: none;
      "
    />
  </div>
</template>
