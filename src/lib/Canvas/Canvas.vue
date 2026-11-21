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
  createCanvas,
  supportsHtmlInCanvas,
  type CanvasInstance,
  type CanvasOptions,
} from "./CanvasVanilla";

const props = withDefaults(
  defineProps<CanvasOptions & { fixed?: boolean }>(),
  { clip: undefined, interactive: undefined, fixed: false },
);

const slots = useSlots();
const sourceEl = ref<HTMLCanvasElement | null>(null);
const contentEl = ref<HTMLDivElement | null>(null);
const outputEl = ref<HTMLCanvasElement | null>(null);
const supported = ref(false);
const failed = ref(false);

const hasContent = computed(() => Boolean(slots.default));
const native = computed(
  () =>
    supported.value &&
    !failed.value &&
    hasContent.value &&
    props.layer === "page",
);
const behind = computed(
  () => props.layer === undefined || props.layer === "background",
);
const insetX = computed(() =>
  props.layer === "foreground" ? 0 : Math.max(props.insetX ?? 0, 0),
);
const insetY = computed(() =>
  props.layer === "foreground" ? 0 : Math.max(props.insetY ?? 0, 0),
);
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
const contentStyle = computed(() => ({
  position: "relative" as const,
  width: "100%",
  height: "100%",
  overflow: "auto" as const,
  boxSizing: "border-box" as const,
  padding:
    insetX.value || insetY.value ? `${insetY.value}px ${insetX.value}px` : undefined,
}));
const outputStyle = computed(() => ({
  position: "absolute" as const,
  inset: "0",
  width: "100%",
  height: "100%",
  pointerEvents: "none" as const,
  zIndex: behind.value && hasContent.value ? "-1" : undefined,
}));

let instance: CanvasInstance | null = null;
let disposed = false;
let ready = false;
let generation = 0;

function options(): CanvasOptions {
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
  instance = createCanvas(
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
      <div ref="contentEl" :style="contentStyle">
        <slot />
      </div>
    </canvas>
    <div v-else-if="hasContent" ref="contentEl" :style="contentStyle">
      <slot />
    </div>
    <canvas ref="outputEl" aria-hidden="true" :style="outputStyle" />
  </div>
</template>
