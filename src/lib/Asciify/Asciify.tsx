"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import {
  createAsciify,
  supportsHtmlInCanvas,
  type AsciifyClick,
  type AsciifyInstance,
  type AsciifyOptions,
  type AsciifySource,
} from "./AsciifyVanilla";

export interface AsciifyProps extends AsciifyOptions {
  children?: ReactNode;
  fixed?: boolean;
  className?: string;
  style?: React.CSSProperties;
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
  const sourceRef = useRef<HTMLCanvasElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLCanvasElement>(null);
  const instanceRef = useRef<AsciifyInstance | null>(null);
  const [initialOptions] = useState(options);
  const [failed, setFailed] = useState(false);

  const supported = useSyncExternalStore(
    emptySubscribe,
    supportsHtmlInCanvas,
    () => false,
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
        <canvas
          ref={sourceRef}
          // @ts-expect-error experimental html-in-canvas attribute
          layoutsubtree="true"
          suppressHydrationWarning
          style={fill}
        >
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
