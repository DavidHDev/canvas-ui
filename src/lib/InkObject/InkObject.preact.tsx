/** @jsxImportSource preact */

import { useEffect, useRef, useState } from "preact/hooks";
import type { JSX } from "preact";

import {
  createInkObject,
  type InkObjectInstance,
  type InkObjectOptions,
} from "./InkObjectVanilla";

export interface InkObjectProps extends InkObjectOptions {
  className?: string;
  style?: JSX.CSSProperties;
}

export function InkObject({
  className,
  style,
  ...options
}: InkObjectProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const instanceRef = useRef<InkObjectInstance | null>(null);
  const [initialOptions] = useState(options);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    instanceRef.current = createInkObject({ canvas }, initialOptions);
    return () => {
      instanceRef.current?.destroy();
      instanceRef.current = null;
    };
  }, [initialOptions]);

  useEffect(() => {
    instanceRef.current?.setOptions(options);
  });

  return (
    <div className={className} style={{ position: "relative", ...style }}>
      <canvas
        ref={canvasRef}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          display: "block",
          touchAction: "none",
        }}
      />
    </div>
  );
}

export type { InkObjectInstance, InkObjectOptions };

export default InkObject;
