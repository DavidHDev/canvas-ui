/** @jsxImportSource preact */

import { useEffect, useRef, useState } from "preact/hooks";
import type { JSX } from "preact";

import {
  createWireframeObject,
  type WireframeObjectInstance,
  type WireframeObjectOptions,
} from "./WireframeObjectVanilla";

export interface WireframeObjectProps extends WireframeObjectOptions {
  className?: string;
  style?: JSX.CSSProperties;
}

export function WireframeObject({
  className,
  style,
  ...options
}: WireframeObjectProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const instanceRef = useRef<WireframeObjectInstance | null>(null);
  const [initialOptions] = useState(options);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    instanceRef.current = createWireframeObject({ canvas }, initialOptions);
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

export type { WireframeObjectInstance, WireframeObjectOptions };

export default WireframeObject;
