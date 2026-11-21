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
  createAsciify,
  supportsHtmlInCanvas,
  type AsciifyClick,
  type AsciifyInstance,
  type AsciifyOptions,
  type AsciifySource,
} from "./AsciifyVanilla";

declare module "solid-js" {
  namespace JSX {
    interface ExplicitAttributes {
      layoutsubtree: string;
    }
  }
}

export interface AsciifyProps extends AsciifyOptions {
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

const scroll = {
  position: "relative",
  width: "100%",
  height: "100%",
  overflow: "auto",
} as const;

export function Asciify(props: AsciifyProps) {
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
  const native = () =>
    supported() && !failed() && hasContent() && options.source === "page";

  let outputEl!: HTMLCanvasElement;
  let instance: AsciifyInstance | null = null;
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
    const next = createAsciify(
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
              "z-index": "50",
              "pointer-events": hasContent() ? undefined : "none",
              ...local.style,
            }
          : { position: "relative", ...local.style }
      }
    >
      {native() ? (
        <canvas ref={setSourceEl} attr:layoutsubtree="true" style={fill}>
          <div ref={setContentEl} style={scroll}>
            {content()}
          </div>
        </canvas>
      ) : hasContent() ? (
        <div ref={setContentEl} style={scroll}>
          {content()}
        </div>
      ) : null}
      <canvas
        ref={outputEl}
        aria-hidden="true"
        style={{ ...fill, "pointer-events": "none" }}
      />
    </div>
  );
}

export type { AsciifyClick, AsciifyInstance, AsciifyOptions, AsciifySource };

export default Asciify;
