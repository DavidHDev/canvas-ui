"use client";

import {
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";

import {
  createAsciiSweep,
  supportsHtmlInCanvas,
  type AsciiSweepBlend,
  type AsciiSweepCharset,
  type AsciiSweepInstance,
  type AsciiSweepOptions,
} from "./AsciiSweepVanilla";

export interface AsciiSweepProps extends AsciiSweepOptions {
  /** The first panel. */
  children: ReactNode;
  /** The second panel, swapped in when index is 1. */
  alternate?: ReactNode;
  /** Which panel to show. Changing it sweeps to that panel. */
  index?: number;
  /** Flip the sweep 180 degrees when sweeping back to the first panel. */
  directional?: boolean;
  className?: string;
  style?: CSSProperties;
}

const emptySubscribe = () => () => {};

const panelStyle: CSSProperties = {
  position: "absolute",
  inset: 0,
  width: "100%",
  height: "100%",
  overflow: "auto",
};

export function AsciiSweep({
  children,
  alternate,
  index = 0,
  directional = true,
  className,
  style,
  ...options
}: AsciiSweepProps) {
  const sourceA = useRef<HTMLCanvasElement>(null);
  const sourceB = useRef<HTMLCanvasElement>(null);
  const contentA = useRef<HTMLDivElement>(null);
  const contentB = useRef<HTMLDivElement>(null);
  const outputRef = useRef<HTMLCanvasElement>(null);
  const instanceRef = useRef<AsciiSweepInstance | null>(null);

  const [initialOptions] = useState(options);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);

  const supported = useSyncExternalStore(
    emptySubscribe,
    supportsHtmlInCanvas,
    () => false,
  );
  const native = supported && !failed;

  useEffect(() => {
    const output = outputRef.current;
    if (
      !output ||
      !sourceA.current ||
      !sourceB.current ||
      !contentA.current ||
      !contentB.current
    ) {
      return;
    }
    instanceRef.current = createAsciiSweep(
      {
        slots: [
          { source: sourceA.current, content: contentA.current },
          { source: sourceB.current, content: contentB.current },
        ],
        output,
      },
      initialOptions,
    );
    if (native && !instanceRef.current) setFailed(true);
    if (instanceRef.current) setReady(true);
    return () => {
      instanceRef.current?.destroy();
      instanceRef.current = null;
      setReady(false);
    };
  }, [initialOptions, native]);

  // Both panels are hidden apart from the first until the engine has taken
  // over stacking. Re-capture once they are all visible, so the panel that
  // started hidden is not baked into the textures as blank.
  useEffect(() => {
    if (ready) instanceRef.current?.capture();
  }, [ready]);

  useEffect(() => {
    instanceRef.current?.setOptions(options);
  });

  useEffect(() => {
    const slot = index >= 1 ? 1 : 0;
    const instance = instanceRef.current;
    if (!instance || instance.current() === slot) return;
    const base = options.angle ?? 0;
    instance.sweep(slot, {
      angle: directional && slot === 0 ? base + 180 : base,
    });
  }, [index, directional, options.angle]);

  const panels = [children, alternate];
  const initialSlot = index >= 1 ? 1 : 0;

  // Before the engine runs, the panels would paint stacked on top of each
  // other. Hide all but the starting one so the first frame is clean. Once the
  // engine is ready it owns stacking, and this stops being rendered.
  const initialHidden = (slot: 0 | 1): CSSProperties =>
    ready || slot === initialSlot ? panelStyle : { ...panelStyle, visibility: "hidden" };

  return (
    <div className={className} style={{ position: "relative", ...style }}>
      {([0, 1] as const).map((slot) => (
        <canvas
          key={slot}
          ref={slot === 0 ? sourceA : sourceB}
          // @ts-expect-error experimental html-in-canvas attribute
          layoutsubtree="true"
          suppressHydrationWarning
          style={native ? initialHidden(slot) : { display: "none" }}
        >
          {native ? (
            <div
              ref={slot === 0 ? contentA : contentB}
              style={{
                position: "relative",
                width: "100%",
                height: "100%",
                overflow: "auto",
              }}
            >
              {panels[slot]}
            </div>
          ) : null}
        </canvas>
      ))}
      {!native
        ? ([0, 1] as const).map((slot) => (
            <div
              key={slot}
              ref={slot === 0 ? contentA : contentB}
              style={initialHidden(slot)}
            >
              {panels[slot]}
            </div>
          ))
        : null}
      <canvas
        ref={outputRef}
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          zIndex: 1,
          pointerEvents: "none",
        }}
      />
    </div>
  );
}

export type {
  AsciiSweepBlend,
  AsciiSweepCharset,
  AsciiSweepInstance,
  AsciiSweepOptions,
};

export default AsciiSweep;
