/** @jsxImportSource preact */

import { useEffect, useRef, useState, useCallback } from "preact/hooks";
import type { ComponentChildren, JSX } from "preact";

import {
  createAsciify,
  supportsHtmlInCanvas,
  type AsciifyClick,
  type AsciifyInstance,
  type AsciifyOptions,
  type AsciifySource,
} from "./AsciifyVanilla";

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

export interface AsciifyProps extends AsciifyOptions {
  children?: ComponentChildren;
  fixed?: boolean;
  className?: string;
  style?: JSX.CSSProperties;
}

const emptySubscribe = () => () => {};

const fill = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
} as const;

export function Asciify({
  children,
  fixed = false,
  className,
  style,
  ...options
}: AsciifyProps) {
  const sourceRef = useRef<HTMLCanvasElement | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLCanvasElement>(null);
  const instanceRef = useRef<AsciifyInstance | null>(null);
  const [initialOptions] = useState(options);
  const [failed, setFailed] = useState(false);

  const supported = useSyncExternalStore(
    emptySubscribe,
    supportsHtmlInCanvas,
  );
  const hasContent = children !== undefined && children !== null;
  const native =
    supported && !failed && hasContent && options.source === "page";

  useEffect(() => {
    const output = outputRef.current;
    if (!output) return;
    instanceRef.current = createAsciify(
      { source: sourceRef.current, content: contentRef.current, output },
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

  const sourceRefCallback = useCallback((el: HTMLCanvasElement | null) => {
    sourceRef.current = el;
    if (el) el.setAttribute("layoutsubtree", "true");
  }, []);

  const content = hasContent ? (
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
  ) : null;

  return (
    <div
      className={className}
      style={
        fixed
          ? {
              position: "fixed",
              inset: 0,
              zIndex: 50,
              pointerEvents: hasContent ? undefined : "none",
              ...style,
            }
          : { position: "relative", ...style }
      }
    >
      {native ? (
        <canvas ref={sourceRefCallback} style={fill}>
          {content}
        </canvas>
      ) : (
        content
      )}
      <canvas
        ref={outputRef}
        aria-hidden
        style={{ ...fill, pointerEvents: "none" }}
      />
    </div>
  );
}

export type { AsciifyClick, AsciifyInstance, AsciifyOptions, AsciifySource };

export default Asciify;
