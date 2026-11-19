/** @jsxImportSource solid-js */

import {
  createEffect,
  onCleanup,
  onMount,
  splitProps,
  type JSX,
} from "solid-js";

import {
  createChromeObject,
  type ChromeObjectInstance,
  type ChromeObjectOptions,
} from "./ChromeObjectVanilla";

export interface ChromeObjectProps extends ChromeObjectOptions {
  class?: string;
  style?: JSX.CSSProperties;
}

export function ChromeObject(props: ChromeObjectProps) {
  const [local, options] = splitProps(props, ["class", "style"]);
  let canvasEl!: HTMLCanvasElement;
  let instance: ChromeObjectInstance | null = null;

  onMount(() => {
    instance = createChromeObject({ canvas: canvasEl }, { ...options });
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

export type { ChromeObjectInstance, ChromeObjectOptions };

export default ChromeObject;
