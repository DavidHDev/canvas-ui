"use client";

import { useEffect, useRef, useState } from "react";

import {
  createChromeObject,
  type ChromeObjectInstance,
  type ChromeObjectOptions,
} from "./ChromeObjectVanilla";

export interface ChromeObjectProps extends ChromeObjectOptions {
  className?: string;
  style?: React.CSSProperties;
}

export function ChromeObject({
  className,
  style,
  ...options
}: ChromeObjectProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const instanceRef = useRef<ChromeObjectInstance | null>(null);
  const [initialOptions] = useState(options);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    instanceRef.current = createChromeObject({ canvas }, initialOptions);
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

export type { ChromeObjectInstance, ChromeObjectOptions };

export default ChromeObject;
