/** @jsxImportSource preact */

import { useEffect, useRef, useState } from "preact/hooks";
import type { ComponentChildren, JSX } from "preact";

import {
  createMagnify,
  supportsHtmlInCanvas,
  type MagnifyInstance,
  type MagnifyOptions,
  type ZoomModifier,
} from "./MagnifyVanilla";

function useSyncExternalStore<T>(
  subscribe: (onStoreChange: () => void) => () => void,
  getSnapshot: () => T,
): T {
  const [value, setValue] = useState(getSnapshot);
  useEffect(() => {
    const unsubscribe = subscribe(() => setValue(getSnapshot()));
    return unsubscribe;
  }, [subscribe, getSnapshot]);
  return value;
}

export interface MagnifyProps extends MagnifyOptions {
  children: ComponentChildren;
  className?: string;
  style?: JSX.CSSProperties;
}

const emptySubscribe = () => () => {};

export function Magnify({
  children,
  className,
  style,
  ...options
}: MagnifyProps) {
  const sourceRef = useRef<HTMLCanvasElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLCanvasElement>(null);
  const instanceRef = useRef<MagnifyInstance | null>(null);
  const [initialOptions] = useState(options);
  const [failed, setFailed] = useState(false);

  const supported = useSyncExternalStore(emptySubscribe, supportsHtmlInCanvas);
  const native = supported && !failed;

  const sourceRefCallback = (el: HTMLCanvasElement | null) => {
    sourceRef.current = el;
    if (el) el.setAttribute("layoutsubtree", "true");
  };

  useEffect(() => {
    const source = sourceRef.current;
    const content = contentRef.current;
    const output = outputRef.current;
    if (!source || !content || !output) return;
    instanceRef.current = createMagnify(
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

export type { MagnifyInstance, MagnifyOptions, ZoomModifier };

export default Magnify;
