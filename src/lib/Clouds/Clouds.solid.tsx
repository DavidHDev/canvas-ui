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
  createClouds,
  supportsHtmlInCanvas,
  type CloudsInstance,
  type CloudsLayer,
  type CloudsOptions,
} from "./CloudsVanilla";

declare module "solid-js" {
  namespace JSX {
    interface ExplicitAttributes {
      layoutsubtree: string;
    }
  }
}

export interface CloudsProps extends CloudsOptions {
  children?: JSX.Element;
  fixed?: boolean;
  class?: string;
  style?: JSX.CSSProperties;
}

const fill = {
  position: "absolute",
  inset: "0",
  width: "100%",
  height: "100%",
} as const;

export function Clouds(props: CloudsProps) {
  const [local, options] = splitProps(props, [
    "children",
    "fixed",
    "class",
    "style",
  ]);
  const content = children(() => local.children);
  const [mounted, setMounted] = createSignal(false);
  const [supported, setSupported] = createSignal(false);
  const [failed, setFailed] = createSignal(false);
  const hasContent = () => {
    const resolved = content();
    if (Array.isArray(resolved)) return resolved.length > 0;
    return resolved !== undefined && resolved !== null;
  };
  const layer = () => options.layer ?? "page";
  const native = () =>
    supported() && !failed() && hasContent() && layer() === "page";
  const behind = () => layer() === "background";
  const contentStyle = (): JSX.CSSProperties => ({
    position: "relative",
    width: "100%",
    height: "100%",
    overflow: "auto",
  });

  let outputEl!: HTMLCanvasElement;
  let instance: CloudsInstance | null = null;
  const [sourceEl, setSourceEl] = createSignal<HTMLCanvasElement>();
  const [contentEl, setContentEl] = createSignal<HTMLDivElement>();

  onMount(() => {
    setSupported(supportsHtmlInCanvas());
    setMounted(true);
  });

  createEffect(() => {
    if (!mounted()) return;
    const useNative = native();
    const source = sourceEl();
    const contentRoot = contentEl();
    if (useNative && (!source || !contentRoot)) return;
    if (!useNative && hasContent() && !contentRoot) return;
    const initialOptions = untrack(() => ({ ...options }));
    const next = createClouds(
      {
        source: useNative ? source : null,
        content: contentRoot ?? null,
        output: outputEl,
      },
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
    <div
      class={local.class}
      style={
        local.fixed
          ? {
              position: "fixed",
              inset: "0",
              "z-index": behind() ? "-1" : "50",
              "pointer-events": hasContent() ? undefined : "none",
              isolation: "isolate",
              ...local.style,
            }
          : { position: "relative", isolation: "isolate", ...local.style }
      }
    >
      {native() ? (
        <canvas ref={setSourceEl} attr:layoutsubtree="true" style={fill}>
          <div ref={setContentEl} style={contentStyle()}>
            {content()}
          </div>
        </canvas>
      ) : hasContent() ? (
        <div ref={setContentEl} style={contentStyle()}>
          {content()}
        </div>
      ) : null}
      <canvas
        ref={outputEl}
        aria-hidden="true"
        style={{
          ...fill,
          "pointer-events": "none",
          "z-index": behind() && hasContent() ? "-1" : undefined,
        }}
      />
    </div>
  );
}

export type { CloudsInstance, CloudsLayer, CloudsOptions };

export default Clouds;
