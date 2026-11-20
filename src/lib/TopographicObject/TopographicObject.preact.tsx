/** @jsxImportSource preact */

import { useEffect, useRef, useState } from "preact/hooks";
import type { JSX } from "preact";

import {
  createTopographicObject,
  type TopographicObjectInstance,
  type TopographicObjectOptions,
} from "./TopographicObjectVanilla";

export interface TopographicObjectProps extends TopographicObjectOptions {
  className?: string;
  style?: JSX.CSSProperties;
}

export function TopographicObject({
  className,
  style,
  ...options
}: TopographicObjectProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const instanceRef = useRef<TopographicObjectInstance | null>(null);
  const [initialOptions] = useState(options);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    instanceRef.current = createTopographicObject({ canvas }, initialOptions);
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

export type { TopographicObjectInstance, TopographicObjectOptions };

export default TopographicObject;
