/** @jsxImportSource solid-js */

import {
  createEffect,
  onCleanup,
  onMount,
  splitProps,
  type JSX,
} from "solid-js";

import {
  createInkObject,
  type InkObjectInstance,
  type InkObjectOptions,
} from "./InkObjectVanilla";

export interface InkObjectProps extends InkObjectOptions {
  class?: string;
  style?: JSX.CSSProperties;
}

export function InkObject(props: InkObjectProps) {
  const [local, options] = splitProps(props, ["class", "style"]);
  let canvasEl!: HTMLCanvasElement;
  let instance: InkObjectInstance | null = null;

  onMount(() => {
    instance = createInkObject({ canvas: canvasEl }, { ...options });
  });

  onCleanup(() => {
    instance?.destroy();
    instance = null;
  });

  createEffect(() => {
    instance?.setOptions({ ...options });
  });

  return (
    <div class={local.class} style={{ position: "relative", ...local.style }}>
      <canvas
        ref={canvasEl}
        style={{
          position: "absolute",
          inset: "0",
          width: "100%",
          height: "100%",
          display: "block",
          "touch-action": "none",
        }}
      />
    </div>
  );
}

export type { InkObjectInstance, InkObjectOptions };

export default InkObject;
