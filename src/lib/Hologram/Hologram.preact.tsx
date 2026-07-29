/** @jsxImportSource preact */

import { useEffect, useRef, useState, useCallback } from "preact/hooks";
import type { ComponentChildren, JSX } from "preact";

import {
  createHologram,
  supportsHtmlInCanvas,
  type HologramInstance,
  type HologramOptions,
} from "./HologramVanilla";

export interface HologramProps extends HologramOptions {
  children: ComponentChildren;
  className?: string;
  style?: JSX.CSSProperties;
}

function useSyncExternalStore<T>(
  subscribe: (onStoreChange: () => void) => () => void,
  getSnapshot: () => T,
): T {
  const [value, setValue] = useState(getSnapshot);
  useEffect(() => {
    const unsubscribe = subscribe(() => setValue(getSnapshot()));
    return unsubscribe;
  }, []);
  return value;
}

const emptySubscribe = () => () => {};

export function Hologram({ children, className, style, ...options }: HologramProps) {
  const sourceRef = useRef<HTMLCanvasElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLCanvasElement>(null);
  const instanceRef = useRef<HologramInstance | null>(null);
  const [initialOptions] = useState(options);
  const [failed, setFailed] = useState(false);

  const supported = useSyncExternalStore(
    emptySubscribe,
    supportsHtmlInCanvas,
  );
  const native = supported && !failed;

  const sourceRefCallback = useCallback((el: HTMLCanvasElement | null) => {
    sourceRef.current = el;
    if (el) el.setAttribute("layoutsubtree", "true");
  }, []);

  useEffect(() => {
    const source = sourceRef.current;
    const content = contentRef.current;
    const output = outputRef.current;
    if (!source || !content || !output) return;
    instanceRef.current = createHologram(
      { source, content, output },
      initialOptions,
    );
    if (native && !instanceRef.current) setFailed(true);
    return () => {
      instanceRef.current?.destroy();
      instanceRef.current = null;
    };
  }, [initialOptions, native]);

  useEffect(() => {
    instanceRef.current?.setOptions(options);
  });

  return (
    <div className={className} style={{ position: "relative", ...style }}>
      <canvas
        ref={sourceRefCallback}
        style={
          native
            ? { position: "absolute", inset: 0, width: "100%", height: "100%" }
            : { display: "none" }
        }
      >
        {native ? (
          <div
            ref={contentRef}
            style={{
              position: "relative",
              width: "100%",
              height: "100%",
              overflow: "auto",
            }}
          >
            {children}
          </div>
        ) : null}
      </canvas>
      {!native ? (
        <div
          ref={contentRef}
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
            overflow: "auto",
          }}
        >
          {children}
        </div>
      ) : null}
      <canvas
        ref={outputRef}
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

export type { HologramInstance, HologramOptions };

export default Hologram;
