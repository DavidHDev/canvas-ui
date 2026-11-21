"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import {
  createCanvas,
  supportsHtmlInCanvas,
  type CanvasFit,
  type CanvasInstance,
  type CanvasLayer,
  type CanvasOptions,
  type CanvasPreset,
} from "./CanvasVanilla";

export interface CanvasProps extends CanvasOptions {
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

export function Canvas({
  children,
  fixed = false,
  className,
  style,
  ...options
}: CanvasProps) {
  const sourceRef = useRef<HTMLCanvasElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLCanvasElement>(null);
  const instanceRef = useRef<CanvasInstance | null>(null);
  const [initialOptions] = useState(options);
  const [failed, setFailed] = useState(false);

  const supported = useSyncExternalStore(
    emptySubscribe,
    supportsHtmlInCanvas,
    () => false,
  );
  const hasContent = children !== undefined && children !== null;
  const native =
    supported && !failed && hasContent && options.layer === "page";
  const behind = options.layer === undefined || options.layer === "background";
  const padded = options.layer !== "foreground";
  const insetX = padded ? Math.max(options.insetX ?? 0, 0) : 0;
  const insetY = padded ? Math.max(options.insetY ?? 0, 0) : 0;

  useEffect(() => {
    const output = outputRef.current;
    if (!output) return;
    instanceRef.current = createCanvas(
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
        boxSizing: "border-box",
        padding: insetX || insetY ? `${insetY}px ${insetX}px` : undefined,
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
              zIndex: behind ? -1 : 50,
              pointerEvents: hasContent ? undefined : "none",
              isolation: "isolate",
              ...style,
            }
          : { position: "relative", isolation: "isolate", ...style }
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
        style={{
          ...fill,
          pointerEvents: "none",
          zIndex: behind && hasContent ? -1 : undefined,
        }}
      />
    </div>
  );
}

export type { CanvasFit, CanvasInstance, CanvasLayer, CanvasOptions, CanvasPreset };

export default Canvas;
