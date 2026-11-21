"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";

import { Canvas } from "@/components/docs/live/Canvas";
import { photoUrl } from "@/lib/demo-photo";

export function CanvasPrint() {
  const { resolvedTheme } = useTheme();
  const tone = resolvedTheme === "dark" ? "dark" : "light";
  const frameRef = useRef<HTMLElement>(null);
  const [nested, setNested] = useState(false);

  useLayoutEffect(() => {
    setNested(Boolean(frameRef.current?.closest("canvas[layoutsubtree]")));
  }, []);

  const src = photoUrl(1, tone, 1600);
  return (
    <figure ref={frameRef} className="frame mt-8">
      {nested ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          crossOrigin="anonymous"
          className="aspect-[16/9] w-full rounded-control object-cover"
        />
      ) : (
        <Canvas
          key={tone}
          src={src}
          preset="paper"
          folds={1}
          foldColumns={4}
          foldRows={2}
          roughness={0.45}
          fiber={0.4}
          wrinkles={0.1}
          distortion={0.15}
          className="aspect-[16/9] w-full overflow-hidden rounded-control"
        />
      )}
    </figure>
  );
}
