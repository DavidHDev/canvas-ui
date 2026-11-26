"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

import {
  createBubble,
  supportsHtmlInCanvas,
  type BubbleClick,
  type BubbleInstance,
  type BubbleOptions,
} from "./BubbleVanilla";

export interface BubbleProps extends BubbleOptions {
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

export function Bubble({
  children,
  fixed = false,
  className,
  style,
  ...options
}: BubbleProps) {
  const sourceRef = useRef<HTMLCanvasElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLCanvasElement>(null);
  const instanceRef = useRef<BubbleInstance | null>(null);
  const [initialOptions] = useState(options);
  const [failed, setFailed] = useState(false);

  const supported = useSyncExternalStore(
    emptySubscribe,
    supportsHtmlInCanvas,
    () => false,
  );
  const hasContent = children !== undefined && children !== null;
  const native = supported && !failed && hasContent;

  useEffect(() => {
    const output = outputRef.current;
    if (!output) return;
    instanceRef.current = createBubble(
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

export type { BubbleClick, BubbleInstance, BubbleOptions };

export default Bubble;
