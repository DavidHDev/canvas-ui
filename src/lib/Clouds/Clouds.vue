<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  useSlots,
  watch,
} from "vue";

import {
  createClouds,
  supportsHtmlInCanvas,
  type CloudsInstance,
  type CloudsOptions,
} from "./CloudsVanilla";

const props = withDefaults(defineProps<CloudsOptions & { fixed?: boolean }>(), {
  fixed: false,
});

const slots = useSlots();
const sourceEl = ref<HTMLCanvasElement | null>(null);
const contentEl = ref<HTMLDivElement | null>(null);
const outputEl = ref<HTMLCanvasElement | null>(null);
const supported = ref(false);
const failed = ref(false);

const hasContent = computed(() => Boolean(slots.default));
const layer = computed(() => props.layer ?? "page");
const native = computed(
  () =>
    supported.value && !failed.value && hasContent.value && layer.value === "page",
);
const behind = computed(() => layer.value === "background");
const rootStyle = computed(() =>
  props.fixed
    ? {
        position: "fixed" as const,
        inset: "0",
        zIndex: behind.value ? "-1" : "50",
        pointerEvents: hasContent.value ? undefined : ("none" as const),
        isolation: "isolate" as const,
      }
    : { position: "relative" as const, isolation: "isolate" as const },
);
const outputStyle = computed(() => ({
  position: "absolute" as const,
  inset: "0",
  width: "100%",
  height: "100%",
  pointerEvents: "none" as const,
  zIndex: behind.value && hasContent.value ? "-1" : undefined,
}));

let instance: CloudsInstance | null = null;
let disposed = false;
let ready = false;
let generation = 0;

function options(): CloudsOptions {
  const { fixed, ...rest } = props;
  void fixed;
  return rest;
}

async function mount() {
  const id = ++generation;
  instance?.destroy();
  instance = null;
  await nextTick();
  if (disposed || id !== generation || !outputEl.value) return;
  instance = createClouds(
    {
      source: native.value ? sourceEl.value : null,
      content: contentEl.value,
      output: outputEl.value,
    },
    options(),
  );
  if (native.value && !instance) failed.value = true;
}

onMounted(() => {
  supported.value = supportsHtmlInCanvas();
  ready = true;
  void mount();
});

watch(native, () => {
  if (ready) void mount();
});

onBeforeUnmount(() => {
  disposed = true;
  instance?.destroy();
  instance = null;
});

watch(
  () => ({ ...props }),
  () => instance?.setOptions(options()),
  { deep: true },
);
</script>

<template>
  <div :style="rootStyle">
    <canvas
      v-if="native"
      ref="sourceEl"
      layoutsubtree="true"
      style="position: absolute; inset: 0; width: 100%; height: 100%"
    >
      <div
        ref="contentEl"
        style="position: relative; width: 100%; height: 100%; overflow: auto"
      >
        <slot />
      </div>
    </canvas>
    <div
      v-else-if="hasContent"
      ref="contentEl"
      style="position: relative; width: 100%; height: 100%; overflow: auto"
    >
      <slot />
    </div>
    <canvas ref="outputEl" aria-hidden="true" :style="outputStyle" />
  </div>
</template>
