/** @jsxImportSource solid-js */

import {
  createEffect,
  createSignal,
  children,
  onCleanup,
  onMount,
  splitProps,
  untrack,
  type JSX,
} from "solid-js";

import {
  createHologram,
  supportsHtmlInCanvas,
  type HologramInstance,
  type HologramOptions,
} from "./HologramVanilla";

declare module "solid-js" {
  namespace JSX {
    interface ExplicitAttributes {
      layoutsubtree: string;
    }
  }
}

export interface HologramProps extends HologramOptions {
  children: JSX.Element;
  class?: string;
  style?: JSX.CSSProperties;
}

export function Hologram(props: HologramProps) {
  const [local, options] = splitProps(props, ["children", "class", "style"]);
  const content = children(() => local.children);
  const [mounted, setMounted] = createSignal(false);
  const [supported, setSupported] = createSignal(false);
  const [failed, setFailed] = createSignal(false);
  const native = () => supported() && !failed();

  let sourceEl!: HTMLCanvasElement;
  let outputEl!: HTMLCanvasElement;
  let instance: HologramInstance | null = null;
  const [contentEl, setContentEl] = createSignal<HTMLDivElement>();

  onMount(() => {
    setSupported(supportsHtmlInCanvas());
    setMounted(true);
  });

  createEffect(() => {
    const contentRoot = contentEl();
    if (!mounted() || !contentRoot) return;
    const useNative = native();
    const initialOptions = untrack(() => ({ ...options }));
    const next = createHologram(
      { source: sourceEl, content: contentRoot, output: outputEl },
      initialOptions,
    );
    instance = next;
    if (useNative && !next) setFailed(true);
    onCleanup(() => {
      next?.destroy();
      if (instance === next) instance = null;
    });
  });

  createEffect(() => {
    instance?.setOptions({ ...options });
  });

  return (
    <div class={local.class} style={{ position: "relative", ...local.style }}>
      <canvas
        ref={sourceEl}
        attr:layoutsubtree="true"
        style={
          native()
            ? {
                position: "absolute",
                inset: "0",
                width: "100%",
                height: "100%",
              }
            : { display: "none" }
        }
      >
        {native() ? (
          <div
            ref={setContentEl}
            style={{
              position: "relative",
              width: "100%",
              height: "100%",
              overflow: "auto",
            }}
          >
            {content()}
          </div>
        ) : null}
      </canvas>
      {!native() ? (
        <div
          ref={setContentEl}
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            overflow: "auto",
          }}
        >
          {content()}
        </div>
      ) : null}
      <canvas
        ref={outputEl}
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: "0",
          width: "100%",
          height: "100%",
          "pointer-events": "none",
        }}
      />
    </div>
  );
}

export type { HologramInstance, HologramOptions };

export default Hologram;
