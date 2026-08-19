/** @jsxImportSource solid-js */

import {
  children,
  createEffect,
  createSignal,
  onCleanup,
  onMount,
  splitProps,
  untrack,
  type JSX,
} from "solid-js";

import {
  createAsciiSweep,
  supportsHtmlInCanvas,
  type AsciiSweepBlend,
  type AsciiSweepCharset,
  type AsciiSweepInstance,
  type AsciiSweepOptions,
} from "./AsciiSweepVanilla";

declare module "solid-js" {
  namespace JSX {
    interface ExplicitAttributes {
      layoutsubtree: string;
    }
  }
}

export interface AsciiSweepProps extends AsciiSweepOptions {
  /** The first panel. */
  children: JSX.Element;
  /** The second panel, swapped in when index is 1. */
  alternate?: JSX.Element;
  /** Which panel to show. Changing it sweeps to that panel. */
  index?: number;
  /** Flip the sweep 180 degrees when sweeping back to the first panel. */
  directional?: boolean;
  class?: string;
  style?: JSX.CSSProperties;
}

const panelStyle: JSX.CSSProperties = {
  position: "absolute",
  inset: "0",
  width: "100%",
  height: "100%",
  overflow: "auto",
};

export function AsciiSweep(props: AsciiSweepProps) {
  const [local, options] = splitProps(props, [
    "children",
    "alternate",
    "index",
    "directional",
    "class",
    "style",
  ]);
  const first = children(() => local.children);
  const second = children(() => local.alternate);
  const [mounted, setMounted] = createSignal(false);
  const [supported, setSupported] = createSignal(false);
  const [failed, setFailed] = createSignal(false);
  const [ready, setReady] = createSignal(false);
  const native = () => supported() && !failed();

  // Before the engine runs, the panels would paint stacked on top of each
  // other. Hide all but the starting one so the first frame is clean. Once the
  // engine is ready it owns stacking, and this stops being rendered.
  const layerStyle = (slot: 0 | 1): JSX.CSSProperties =>
    ready() || slot === ((local.index ?? 0) >= 1 ? 1 : 0)
      ? panelStyle
      : { ...panelStyle, visibility: "hidden" };

  let sourceAEl!: HTMLCanvasElement;
  let sourceBEl!: HTMLCanvasElement;
  let outputEl!: HTMLCanvasElement;
  let instance: AsciiSweepInstance | null = null;
  const [contentAEl, setContentAEl] = createSignal<HTMLDivElement>();
  const [contentBEl, setContentBEl] = createSignal<HTMLDivElement>();

  onMount(() => {
    setSupported(supportsHtmlInCanvas());
    setMounted(true);
  });

  createEffect(() => {
    const contentA = contentAEl();
    const contentB = contentBEl();
    if (!mounted() || !contentA || !contentB) return;
    const useNative = native();
    const initialOptions = untrack(() => ({ ...options }));
    const next = createAsciiSweep(
      {
        slots: [
          { source: sourceAEl, content: contentA },
          { source: sourceBEl, content: contentB },
        ],
        output: outputEl,
      },
      initialOptions,
    );
    instance = next;
    if (useNative && !next) setFailed(true);
    if (next) {
      setReady(true);
      // Re-capture once every panel is visible, so the panel that started
      // hidden is not baked into the textures as blank.
      queueMicrotask(() => next.capture());
    }
    onCleanup(() => {
      next?.destroy();
      if (instance === next) instance = null;
      setReady(false);
    });
  });

  createEffect(() => {
    instance?.setOptions({ ...options });
  });

  createEffect(() => {
    const slot = (local.index ?? 0) >= 1 ? 1 : 0;
    const directional = local.directional ?? true;
    const base = untrack(() => options.angle ?? 0);
    if (!instance || instance.current() === slot) return;
    instance.sweep(slot, {
      angle: directional && slot === 0 ? base + 180 : base,
    });
  });

  return (
    <div class={local.class} style={{ position: "relative", ...local.style }}>
      <canvas
        ref={sourceAEl}
        attr:layoutsubtree="true"
        style={native() ? layerStyle(0) : { display: "none" }}
      >
        {native() ? (
          <div
            ref={setContentAEl}
            style={{
              position: "relative",
              width: "100%",
              height: "100%",
              overflow: "auto",
            }}
          >
            {first()}
          </div>
        ) : null}
      </canvas>
      <canvas
        ref={sourceBEl}
        attr:layoutsubtree="true"
        style={native() ? layerStyle(1) : { display: "none" }}
      >
        {native() ? (
          <div
            ref={setContentBEl}
            style={{
              position: "relative",
              width: "100%",
              height: "100%",
              overflow: "auto",
            }}
          >
            {second()}
          </div>
        ) : null}
      </canvas>
      {!native() ? (
        <>
          <div ref={setContentAEl} style={layerStyle(0)}>
            {first()}
          </div>
          <div ref={setContentBEl} style={layerStyle(1)}>
            {second()}
          </div>
        </>
      ) : null}
      <canvas
        ref={outputEl}
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: "0",
          width: "100%",
          height: "100%",
          "z-index": "1",
          "pointer-events": "none",
        }}
      />
    </div>
  );
}

export type {
  AsciiSweepBlend,
  AsciiSweepCharset,
  AsciiSweepInstance,
  AsciiSweepOptions,
};

export default AsciiSweep;
