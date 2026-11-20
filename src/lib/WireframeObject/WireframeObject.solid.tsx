/** @jsxImportSource solid-js */

import {
  createEffect,
  onCleanup,
  onMount,
  splitProps,
  type JSX,
} from "solid-js";

import {
  createWireframeObject,
  type WireframeObjectInstance,
  type WireframeObjectOptions,
} from "./WireframeObjectVanilla";

export interface WireframeObjectProps extends WireframeObjectOptions {
  class?: string;
  style?: JSX.CSSProperties;
}

export function WireframeObject(props: WireframeObjectProps) {
  const [local, options] = splitProps(props, ["class", "style"]);
  let canvasEl!: HTMLCanvasElement;
  let instance: WireframeObjectInstance | null = null;

  onMount(() => {
    instance = createWireframeObject({ canvas: canvasEl }, { ...options });
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

export type { WireframeObjectInstance, WireframeObjectOptions };

export default WireframeObject;
