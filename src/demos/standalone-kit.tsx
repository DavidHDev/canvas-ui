"use client";

import {
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";

import type {
  Control,
  ControlSchema,
  ControlValue,
  DemoPreset,
  SchemaValues,
} from "@/components/demos/control-schema";

export interface DemoControlsHandle<S extends ControlSchema = ControlSchema> {
  schema: S;
  values: SchemaValues<S>;
  setValue<K extends keyof S & string>(key: K, value: SchemaValues<S>[K]): void;
  apply(values: Partial<SchemaValues<S>>): void;
  reset(): void;
  isDefault: boolean;
}

type ValueMap = Record<string, ControlValue>;

function defaultsOf(schema: ControlSchema): ValueMap {
  return Object.fromEntries(
    Object.entries(schema).map(([key, control]) => [key, control.defaultValue]),
  );
}

export function useDemoScrollbarGutter() {
  return (element: HTMLElement | null) => void element;
}

export function useDemoControls<S extends ControlSchema>(schema: S): DemoControlsHandle<S> {
  const [values, setValues] = useState<ValueMap>(() => defaultsOf(schema));

  return useMemo(() => {
    const apply = (preset: Partial<ValueMap>) =>
      setValues((prev) => {
        const next: ValueMap = { ...defaultsOf(schema) };
        for (const [key, control] of Object.entries(schema)) {
          const value = preset[key];
          if (value !== undefined) next[key] = value;
          else if (control.kind === "custom") next[key] = prev[key];
        }
        return next;
      });
    return {
      schema,
      values: values as SchemaValues<S>,
      setValue: (key: string, value: ControlValue) =>
        setValues((prev) => ({ ...prev, [key]: value })),
      apply,
      reset: () => setValues(defaultsOf(schema)),
      isDefault: Object.entries(schema).every(
        ([key, control]) => values[key] === control.defaultValue,
      ),
    } as DemoControlsHandle<S>;
  }, [schema, values]);
}

const ROW =
  "flex h-8 w-full items-center justify-between gap-3 rounded-lg bg-muted/60 px-3 text-[12.5px] font-medium";

export interface DemoControlsProps<S extends ControlSchema> {
  title: string;
  controls: DemoControlsHandle<S>;
  rows?: Partial<Record<keyof S & string, ReactNode>>;
  presets?: DemoPreset<S>[];
  onReset?: () => void;
  portal?: boolean;
  snippet?: { component: string; props: Record<string, unknown> };
}

export function DemoControls<S extends ControlSchema>({
  title,
  controls,
  rows,
  presets,
  onReset,
}: DemoControlsProps<S>) {
  const [open, setOpen] = useState(false);
  const schema = controls.schema as ControlSchema;
  const values = controls.values as ValueMap;
  const set = controls.setValue as (key: string, value: ControlValue) => void;
  const custom = rows as Partial<Record<string, ReactNode>> | undefined;
  const looks: DemoPreset<S>[] = [{ label: "Default", values: {} }, ...(presets ?? [])];

  const visible = Object.keys(schema).filter((key) => {
    const control = schema[key];
    if (control.when && !control.when(values)) return false;
    return control.kind !== "custom" || custom?.[key] !== undefined;
  });

  const isActive = (preset: DemoPreset<S>) =>
    Object.entries(schema).every(([key, control]) => {
      const target = (preset.values as Partial<ValueMap>)[key];
      if (control.kind === "custom" && target === undefined) return true;
      return values[key] === (target ?? control.defaultValue);
    });

  return (
    <div className="fixed right-4 bottom-4 z-50 flex flex-col items-end gap-2 text-foreground">
      {open ? (
        <div
          role="group"
          aria-label={title}
          className="flex max-h-[min(70vh,560px)] w-[min(20rem,calc(100vw-2rem))] flex-col gap-3 overflow-y-auto rounded-2xl border border-border bg-background/90 p-3 shadow-lg backdrop-blur-xl"
        >
          {looks.length > 1 ? (
            <div className="flex flex-wrap gap-1">
              {looks.map((preset) => {
                const active = isActive(preset);
                return (
                  <button
                    key={preset.label}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      controls.apply(preset.values);
                      onReset?.();
                    }}
                    className={`h-7 cursor-pointer rounded-md px-3 text-[12.5px] font-medium transition-colors ${
                      active
                        ? "bg-foreground text-background"
                        : "bg-muted/60 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
          ) : null}
          <div className="flex flex-col gap-1.5">
            {visible.map((key) => (
              <Fragment key={key}>
                {custom?.[key] ?? (
                  <ControlRow
                    control={schema[key]}
                    value={values[key]}
                    onChange={(next) => set(key, next)}
                  />
                )}
              </Fragment>
            ))}
          </div>
          <button
            type="button"
            disabled={controls.isDefault}
            onClick={() => {
              controls.reset();
              onReset?.();
            }}
            className="h-8 cursor-pointer rounded-[10px] text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            Reset
          </button>
        </div>
      ) : null}
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="h-10 cursor-pointer rounded-[10px] border border-border bg-background/90 px-4 text-[13px] font-medium shadow-sm backdrop-blur-xl transition-transform active:scale-[0.97]"
      >
        {open ? "Close" : "Controls"}
      </button>
    </div>
  );
}

function ControlRow({
  control,
  value,
  onChange,
}: {
  control: Control;
  value: ControlValue;
  onChange: (value: ControlValue) => void;
}) {
  switch (control.kind) {
    case "scrub":
      return (
        <label className="flex flex-col gap-1 rounded-lg bg-muted/60 px-3 py-2 text-[12.5px] font-medium">
          <span className="flex justify-between gap-3">
            {control.label}
            <span className="text-muted-foreground tabular-nums">
              {(value as number).toFixed(control.decimals)}
            </span>
          </span>
          <input
            type="range"
            min={control.min}
            max={control.max}
            step={control.step}
            value={value as number}
            onChange={(event) => onChange(Number(event.target.value))}
            className="w-full accent-foreground"
          />
        </label>
      );
    case "toggle":
      return (
        <label className={`${ROW} cursor-pointer`}>
          {control.label}
          <input
            type="checkbox"
            checked={value as boolean}
            onChange={(event) => onChange(event.target.checked)}
            className="size-4 accent-foreground"
          />
        </label>
      );
    case "radio":
      return (
        <div className="flex flex-col gap-1">
          <span className="px-1 text-[12px] font-medium text-foreground/80">{control.label}</span>
          <div className="flex gap-1 rounded-lg bg-muted/60 p-1">
            {control.options.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={option.value === value}
                onClick={() => onChange(option.value)}
                className={`h-7 flex-1 cursor-pointer rounded-md text-[12.5px] font-medium transition-colors ${
                  option.value === value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      );
    case "color": {
      const auto = control.auto !== undefined && value === control.defaultValue;
      return (
        <ColorRow
          label={control.label}
          value={auto && control.auto ? control.auto.swatch : (value as string)}
          displayValue={auto && control.auto ? control.auto.label : undefined}
          onValueChange={onChange}
          onReset={
            value !== control.defaultValue ? () => onChange(control.defaultValue) : undefined
          }
        />
      );
    }
    case "custom":
      return null;
  }
}

const HEX = /^#[0-9a-f]{6}$/i;

export function ColorRow({
  label,
  value,
  onValueChange,
  displayValue,
  onReset,
}: {
  label: string;
  value: string;
  onValueChange: (value: string) => void;
  displayValue?: string;
  onReset?: () => void;
}) {
  return (
    <div className={ROW}>
      {label}
      <span className="flex items-center gap-2 text-muted-foreground">
        {onReset ? (
          <button
            type="button"
            onClick={onReset}
            aria-label={`Reset ${label}`}
            className="cursor-pointer text-[11px] hover:text-foreground"
          >
            Reset
          </button>
        ) : null}
        <span className="tabular-nums">{displayValue ?? value}</span>
        <span
          className="relative size-4.5 overflow-hidden rounded-[5px] border border-foreground/20"
          style={{ background: value }}
        >
          <input
            type="color"
            aria-label={`${label} color`}
            value={HEX.test(value) ? value : "#ffffff"}
            onChange={(event) => onValueChange(event.target.value)}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
        </span>
      </span>
    </div>
  );
}

export type GhostPath = (t: number) => [number, number];

export type HintGesture = "move" | "click" | "scroll" | "drag";

const HINTS: Record<HintGesture, [string, string]> = {
  move: ["Move your cursor", "Drag across"],
  click: ["Click anywhere", "Tap anywhere"],
  scroll: ["Scroll inside", "Swipe up inside"],
  drag: ["Drag to rotate", "Drag to rotate"],
};

export interface StageHintProps {
  gesture?: HintGesture;
  label?: string;
  touchLabel?: string;
  autopilot?: boolean;
  path?: GhostPath;
}

const COARSE_QUERY = "(hover: none), (pointer: coarse)";

function subscribeCoarse(callback: () => void) {
  const query = window.matchMedia(COARSE_QUERY);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

export function StageHint({ gesture = "move", label, touchLabel }: StageHintProps) {
  const [done, setDone] = useState(false);
  const coarse = useSyncExternalStore(
    subscribeCoarse,
    () => window.matchMedia(COARSE_QUERY).matches,
    () => false,
  );

  useEffect(() => {
    if (done) return;
    let travelled = 0;
    let last: { x: number; y: number } | null = null;
    const finish = () => setDone(true);
    const onMove = (event: PointerEvent) => {
      if (last) travelled += Math.hypot(event.clientX - last.x, event.clientY - last.y);
      last = { x: event.clientX, y: event.clientY };
      if (travelled > 48) finish();
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerdown", finish, { passive: true });
    window.addEventListener("wheel", finish, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerdown", finish);
      window.removeEventListener("wheel", finish);
    };
  }, [done]);

  const [mouseText, touchText] = HINTS[gesture];
  const text = coarse ? (touchLabel ?? label ?? touchText) : (label ?? mouseText);

  return (
    <div
      aria-hidden={done}
      className={`pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center px-3 transition-opacity duration-300 ${
        done ? "opacity-0" : "opacity-100"
      }`}
    >
      <span className="max-w-full truncate rounded-[10px] border border-border bg-background/80 px-3 py-1.5 text-[12px] font-medium text-muted-foreground backdrop-blur-xl">
        {text}
      </span>
    </div>
  );
}

export function StageTabs<T extends string>({
  label,
  options,
  value,
  onValueChange,
  position = "top",
}: {
  label: string;
  options: readonly { id: T; label: string }[];
  value: T;
  onValueChange: (value: T) => void;
  position?: "top" | "bottom";
}) {
  return (
    <div
      className={`pointer-events-none absolute inset-x-0 z-20 flex justify-center px-3 ${
        position === "top" ? "top-3" : "bottom-3"
      }`}
    >
      <div
        role="group"
        aria-label={label}
        className="pointer-events-auto flex gap-1 rounded-[15px] border border-border bg-background/90 p-1 shadow-sm backdrop-blur-xl"
      >
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            aria-pressed={option.id === value}
            onClick={() => onValueChange(option.id)}
            className={`h-8 cursor-pointer rounded-[10px] px-3.5 text-[13px] font-medium whitespace-nowrap transition-colors ${
              option.id === value
                ? "bg-muted text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function useStageAutoplay(tick: () => void, interval: number, enabled = true) {
  const tickRef = useRef(tick);
  useEffect(() => {
    tickRef.current = tick;
  });
  useEffect(() => {
    if (!enabled || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => {
      if (!document.hidden) tickRef.current();
    }, interval);
    return () => clearInterval(timer);
  }, [enabled, interval]);
}

export interface DemoProps {
  children?: ReactNode;
}

export interface DemoSurface {
  page: boolean;
  props: { className: string; style: CSSProperties; children: ReactNode };
}

export function PageDemoContent({ children }: { children: ReactNode }) {
  return <div className="min-h-full bg-background">{children}</div>;
}

export function useDemoSurface(children: ReactNode | undefined, scene: ReactNode): DemoSurface {
  const page = children !== undefined && children !== null;
  return page
    ? {
        page,
        props: {
          className: "inset-0 z-30",
          style: { position: "fixed" },
          children: <div className="min-h-full bg-background">{children}</div>,
        },
      }
    : {
        page,
        props: { className: "inset-0", style: { position: "absolute" }, children: scene },
      };
}
