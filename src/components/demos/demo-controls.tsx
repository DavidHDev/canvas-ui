"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Check,
  ChevronRight,
  Code2,
  Link as LinkIcon,
  RotateCcw,
  SlidersHorizontal,
  X,
} from "@/components/icons";
import { play } from "cuelume";
import {
  Fragment,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";

import type {
  Control,
  ControlSchema,
  ControlValue,
  DemoPreset,
} from "@/components/demos/control-schema";
import { ColorRow } from "@/components/demos/color-picker";
import {
  DemoControlsTargetContext,
  useStage,
} from "@/components/demos/demo-context";
import {
  buildConfiguredJsx,
  publishDemoSnippet,
  type DemoSnippet,
} from "@/components/demos/snippet-store";
import { Scrubber } from "@/components/docs/scrubber";
import { EASE_OUT, DURATION } from "@/components/common/motion-tokens";
import { SegmentedRow } from "@/components/demos/segmented-row";
import type { DemoControlsHandle } from "@/hooks/use-demo-controls";
import { cn } from "@/lib/utils";

export { ColorRow, DemoControlsTargetContext };

const emptySubscribe = () => () => {};

export function useDemoScrollbarGutter() {
  const [contentEl, setContentEl] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const el = contentEl;
    if (!el) return;
    const root = document.documentElement;
    let scroller: HTMLElement | null = null;
    for (let node = el.parentElement; node; node = node.parentElement) {
      const overflow = getComputedStyle(node).overflowY;
      if (overflow === "auto" || overflow === "scroll") {
        scroller = node;
        break;
      }
    }
    const update = () => {
      if (!el.isConnected) return;
      const gutter = scroller
        ? scroller.offsetWidth - scroller.clientWidth
        : root.clientWidth - el.getBoundingClientRect().width;
      root.style.setProperty("--demo-sbw", `${Math.max(0, Math.round(gutter))}px`);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
      root.style.removeProperty("--demo-sbw");
    };
  }, [contentEl]);

  useEffect(() => {
    const el = contentEl;
    if (!el) return;
    const canvas = [
      ...document.querySelectorAll<HTMLCanvasElement>("canvas[layoutsubtree]"),
    ].find((node) => node.contains(el));
    const scroller = canvas?.firstElementChild;
    if (!(scroller instanceof HTMLElement)) return;

    const prevScrollbarWidth = scroller.style.scrollbarWidth;
    scroller.style.scrollbarWidth = "none";

    const thumb = document.createElement("div");
    thumb.setAttribute("aria-hidden", "true");
    thumb.className = "demo-overlay-thumb";
    document.body.appendChild(thumb);

    let hideTimer: ReturnType<typeof setTimeout> | null = null;

    const layout = () => {
      const max = scroller.scrollHeight - scroller.clientHeight;
      if (max <= 1) {
        thumb.style.opacity = "0";
        return false;
      }
      const trackTop = 8;
      const trackHeight = window.innerHeight - 16;
      const height = Math.max(
        36,
        (scroller.clientHeight / scroller.scrollHeight) * trackHeight,
      );
      const top =
        trackTop + (scroller.scrollTop / max) * (trackHeight - height);
      thumb.style.height = `${height}px`;
      thumb.style.transform = `translateY(${top}px)`;
      return true;
    };

    const show = () => {
      if (!layout()) return;
      thumb.style.opacity = "1";
      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        thumb.style.opacity = "0";
      }, 1000);
    };

    show();
    scroller.addEventListener("scroll", show, { passive: true });
    window.addEventListener("resize", show);
    const observer = new ResizeObserver(() => layout());
    observer.observe(el);
    observer.observe(scroller);

    return () => {
      scroller.removeEventListener("scroll", show);
      window.removeEventListener("resize", show);
      observer.disconnect();
      if (hideTimer) clearTimeout(hideTimer);
      thumb.remove();
      scroller.style.scrollbarWidth = prevScrollbarWidth;
    };
  }, [contentEl]);

  return setContentEl;
}

function ScrollFade({ children }: { children: ReactNode }) {
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const el = scrollEl;
    if (!el) return;
    const update = () => {
      const top = el.scrollTop > 4;
      const bottom = el.scrollHeight - el.clientHeight - el.scrollTop > 4;
      el.style.setProperty("--fade-top", top ? "1" : "0");
      el.style.setProperty("--fade-bottom", bottom ? "1" : "0");
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, [scrollEl]);

  return (
    <div
      ref={setScrollEl}
      className="demo-controls-scroll -mr-1.5 flex max-h-[min(60vh,480px)] flex-col overflow-y-auto pr-1.5"
    >
      {children}
    </div>
  );
}

function useCopied(duration = 1200) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const flash = () => {
    if (!mountedRef.current) return;
    play("bloom");
    setCopied(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setCopied(false), duration);
  };

  return [copied, flash] as const;
}

const ICON_BUTTON =
  "pressable inline-grid size-8 shrink-0 cursor-pointer place-items-center rounded-control text-muted-foreground transition-colors duration-150 ease-out hover:bg-muted/60 hover:text-foreground";

function SwapIcon({ done, icon }: { done: boolean; icon: ReactNode }) {
  return (
    <span aria-hidden className="relative inline-flex size-3.5">
      <span
        className={cn(
          "absolute inset-0 inline-flex transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none",
          done ? "scale-50 opacity-0" : "scale-100 opacity-100",
        )}
      >
        {icon}
      </span>
      <Check
        className={cn(
          "absolute inset-0 size-3.5 transition-[opacity,transform] duration-150 ease-out motion-reduce:transition-none",
          done ? "scale-100 opacity-100" : "scale-50 opacity-0",
        )}
      />
    </span>
  );
}

function ShareLinkButton() {
  const [copied, flash] = useCopied();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      flash();
    } catch {}
  };

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "Link copied" : "Copy a link to this configuration"}
      title="Copy a link to this exact configuration"
      className={ICON_BUTTON}
    >
      <SwapIcon done={copied} icon={<LinkIcon className="size-3.5" />} />
    </button>
  );
}

function CopyCodeButton({ snippet }: { snippet: DemoSnippet }) {
  const [copied, flash] = useCopied();

  const copy = async () => {
    const code = [
      `import { ${snippet.component} } from "@/components/canvasui/${snippet.component}";`,
      "",
      buildConfiguredJsx(snippet.component, snippet.props),
      "",
    ].join("\n");
    try {
      await navigator.clipboard.writeText(code);
      flash();
    } catch {}
  };

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={copied ? "Code copied" : "Copy code with these settings"}
      title="Copy the component with these settings"
      className={ICON_BUTTON}
    >
      <SwapIcon done={copied} icon={<Code2 className="size-3.5" />} />
    </button>
  );
}

export interface DemoControlsProps<S extends ControlSchema> {
  title: string;
  controls: DemoControlsHandle<S>;
  rows?: Partial<Record<keyof S & string, ReactNode>>;
  presets?: DemoPreset<S>[];
  onReset?: () => void;
  portal?: boolean;
  snippet?: DemoSnippet;
}

interface Group {
  name: string;
  keys: string[];
}

function groupKeys(schema: ControlSchema, keys: string[]): Group[] {
  const groups: Group[] = [];
  for (const key of keys) {
    const name = schema[key].group ?? "";
    let group = groups.find((entry) => entry.name === name);
    if (!group) {
      group = { name, keys: [] };
      groups.push(group);
    }
    group.keys.push(key);
  }
  return groups;
}

function ControlRow({
  name,
  def,
  value,
  set,
}: {
  name: string;
  def: Control;
  value: ControlValue;
  set: (key: string, value: ControlValue) => void;
}) {
  switch (def.kind) {
    case "scrub":
      return (
        <Scrubber
          label={def.label}
          min={def.min}
          max={def.max}
          step={def.step}
          decimals={def.decimals}
          value={value as number}
          onValueChange={(next) => set(name, next)}
        />
      );
    case "toggle":
      return (
        <SwitchRow
          label={def.label}
          checked={value as boolean}
          onCheckedChange={(next) => set(name, next)}
        />
      );
    case "radio":
      return (
        <RadioRow
          label={def.label}
          options={def.options}
          value={value as string}
          onValueChange={(next) => set(name, next)}
        />
      );
    case "color": {
      const color = value as string;
      const auto = def.auto !== undefined && color === def.defaultValue;
      return (
        <ColorRow
          label={def.label}
          value={auto && def.auto ? def.auto.swatch : color}
          displayValue={auto && def.auto ? def.auto.label : undefined}
          onValueChange={(next) => set(name, next)}
          onReset={
            color !== def.defaultValue
              ? () => set(name, def.defaultValue)
              : undefined
          }
        />
      );
    }
    case "custom":
      return null;
  }
}

function GroupGrid({
  groups,
  renderRow,
}: {
  groups: Group[];
  renderRow: (key: string) => ReactNode;
}) {
  if (groups.length === 0) return null;
  const titled = groups.length > 1 || groups[0].name !== "";

  if (!titled || groups.length === 1) {
    return (
      <div className="flex flex-col gap-1.5">
        {titled ? <GroupTitle>{groups[0].name}</GroupTitle> : null}
        <div className="grid grid-cols-1 gap-1.5 @md:grid-cols-2 @2xl:grid-cols-3">
          {groups[0].keys.map((key) => (
            <Fragment key={key}>{renderRow(key)}</Fragment>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-x-3 gap-y-4 @md:grid-cols-2",
        groups.length >= 3 && "@2xl:grid-cols-3",
      )}
    >
      {groups.map((group) => (
        <section
          key={group.name}
          aria-label={group.name || undefined}
          className="flex min-w-0 flex-col gap-1.5"
        >
          {group.name ? <GroupTitle>{group.name}</GroupTitle> : null}
          {group.keys.map((key) => (
            <Fragment key={key}>{renderRow(key)}</Fragment>
          ))}
        </section>
      ))}
    </div>
  );
}

function GroupTitle({ children }: { children: ReactNode }) {
  return (
    <h3 className="px-1 text-[11.5px] leading-5 font-medium text-muted-foreground">
      {children}
    </h3>
  );
}

function sameValue(a: unknown, b: unknown) {
  if (typeof a === "string" && typeof b === "string") {
    return a.toLowerCase() === b.toLowerCase();
  }
  if (typeof a === "number" && typeof b === "number") {
    return Math.abs(a - b) < 1e-6;
  }
  return a === b;
}

const CUSTOM = "__custom";

function PresetPicker<S extends ControlSchema>({
  controls,
  presets,
  onApply,
}: {
  controls: DemoControlsHandle<S>;
  presets: DemoPreset<S>[];
  onApply?: () => void;
}) {
  const values = controls.values as Record<string, ControlValue>;
  const schema = controls.schema;
  const all: DemoPreset<S>[] = [{ label: "Default", values: {} }, ...presets];
  const [custom, setCustom] = useState<{
    key: string;
    values: Record<string, ControlValue>;
  } | null>(null);

  const matches = (preset: DemoPreset<S>) =>
    Object.entries(schema).every(([key, def]) => {
      const target = (preset.values as Record<string, ControlValue>)[key];
      if (def.kind === "custom" && target === undefined) return true;
      return sameValue(values[key], target ?? def.defaultValue);
    });

  const active = all.findIndex(matches);
  if (active === -1) {
    const snapshot: Record<string, ControlValue> = {};
    for (const [key, def] of Object.entries(schema)) {
      if (def.kind !== "custom") snapshot[key] = values[key];
    }
    const key = JSON.stringify(snapshot);
    if (custom?.key !== key) setCustom({ key, values: snapshot });
  }

  const options = [
    ...all.map((preset, index) => ({ id: String(index), label: preset.label })),
    ...(custom ? [{ id: CUSTOM, label: "Custom" }] : []),
  ];

  return (
    <SegmentedRow
      label="Preset"
      overflow="select"
      options={options}
      value={active === -1 ? CUSTOM : String(active)}
      onValueChange={(id) => {
        if (id === CUSTOM) {
          if (custom) controls.apply(custom.values as SchemaValuesOf<S>);
        } else {
          controls.apply(all[Number(id)].values);
        }
        onApply?.();
      }}
      className="w-fit max-w-full"
    />
  );
}

type SchemaValuesOf<S extends ControlSchema> = DemoPreset<S>["values"];

function Advanced({
  count,
  children,
}: {
  count: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((prev) => !prev)}
          className="pressable -mx-1 flex h-7 cursor-pointer items-center gap-1.5 self-start rounded-control px-2 text-[12px] font-medium text-muted-foreground transition-colors duration-150 ease-out hover:bg-[var(--surface-hover)] hover:text-foreground"
        >
          <ChevronRight
            aria-hidden
            className={cn(
              "size-3.5 transition-transform duration-200 ease-out motion-reduce:transition-none",
              open && "rotate-90",
            )}
          />
          Advanced
          <span className="text-muted-foreground/70 tabular-nums">{count}</span>
        </button>
      </div>
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none"
        style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      >
        <div className="-m-1 min-h-0 overflow-hidden p-1" inert={!open}>
          <div
            className={cn(
              "pt-2 transition-opacity duration-200 ease-out motion-reduce:transition-none",
              open ? "opacity-100" : "opacity-0",
            )}
          >
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

function ControlsBody<S extends ControlSchema>({
  controls,
  rows,
  presets,
  onReset,
  snippet,
}: Omit<DemoControlsProps<S>, "title" | "portal">) {
  const set = controls.setValue as (key: string, value: ControlValue) => void;
  const values = controls.values as Record<string, ControlValue>;
  const schema = controls.schema as ControlSchema;

  const visible = Object.keys(schema).filter((key) => {
    const def = schema[key];
    if (def.when && !def.when(values)) return false;
    if (
      def.kind === "custom" &&
      rows?.[key as keyof S & string] === undefined
    ) {
      return false;
    }
    return true;
  });
  const primary = groupKeys(
    schema,
    visible.filter((key) => !schema[key].advanced),
  );
  const advancedKeys = visible.filter((key) => schema[key].advanced);
  const advanced = groupKeys(schema, advancedKeys);

  const renderRow = (key: string) => {
    const override = rows?.[key as keyof S & string];
    if (override !== undefined) return override;
    return (
      <ControlRow name={key} def={schema[key]} value={values[key]} set={set} />
    );
  };

  const handleReset = () => {
    controls.reset();
    onReset?.();
  };

  const hasPresets = presets !== undefined && presets.length > 0;

  const actions = (
    <div className="-mr-1 ml-auto flex items-center gap-0.5">
      {snippet ? <CopyCodeButton snippet={snippet} /> : null}
      <ShareLinkButton />
      <button
        type="button"
        onClick={handleReset}
        disabled={controls.isDefault}
        aria-label="Reset"
        className="pressable inline-flex h-8 cursor-pointer items-center justify-center gap-1.5 rounded-control px-2.5 text-[12.5px] font-medium text-muted-foreground transition-[color,background-color,opacity,transform] duration-150 ease-out hover:bg-muted/60 hover:text-foreground disabled:pointer-events-none disabled:opacity-40 @max-xs:w-8 @max-xs:px-0"
      >
        <RotateCcw aria-hidden className="size-3" />
        <span className="@max-xs:sr-only">Reset</span>
      </button>
    </div>
  );

  return (
    <div className="@container flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2">
        {hasPresets ? (
          <PresetPicker controls={controls} presets={presets} onApply={onReset} />
        ) : null}
        {actions}
      </div>

      <GroupGrid groups={primary} renderRow={renderRow} />

      {advancedKeys.length > 0 ? (
        <Advanced count={advancedKeys.length}>
          <GroupGrid groups={advanced} renderRow={renderRow} />
        </Advanced>
      ) : null}
    </div>
  );
}

export function DemoControls<S extends ControlSchema>({
  title,
  controls,
  rows,
  presets,
  onReset,
  portal = false,
  snippet,
}: DemoControlsProps<S>) {
  const shouldReduceMotion = useReducedMotion();
  const target = useContext(DemoControlsTargetContext);
  const stage = useStage();
  const [open, setOpen] = useState(false);
  const mounted = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false,
  );

  useEffect(() => {
    if (!snippet) return;
    publishDemoSnippet(snippet);
  }, [snippet]);

  useEffect(() => () => publishDemoSnippet(null), []);

  const body = (
    <ControlsBody
      controls={controls}
      rows={rows}
      presets={presets}
      onReset={onReset}
      snippet={snippet}
    />
  );

  if (target) return createPortal(body, target);
  if (stage) return null;

  if (portal && !mounted) return null;

  const widget = (
    <div className="fixed right-[calc(1rem+var(--demo-sbw,0px))] bottom-4 z-40 flex flex-col items-end gap-2">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={
              shouldReduceMotion
                ? { opacity: 0 }
                : { opacity: 0, y: 8, scale: 0.98 }
            }
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={
              shouldReduceMotion
                ? { opacity: 0, transition: { duration: DURATION.exit } }
                : {
                    opacity: 0,
                    y: 8,
                    scale: 0.98,
                    transition: { duration: DURATION.fast, ease: EASE_OUT },
                  }
            }
            transition={{ duration: DURATION.slow, ease: EASE_OUT }}
            style={{ transformOrigin: "bottom right" }}
            className="surface-panel w-[min(21rem,calc(100vw-2rem))] rounded-panel p-2"
          >
            <p className="sr-only">{title}</p>
            <ScrollFade>{body}</ScrollFade>
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        className="surface-floating pressable inline-flex h-10 cursor-pointer items-center gap-2 rounded-control px-4 text-[13px] font-medium"
      >
        {open ? (
          <X aria-hidden className="size-3.5" />
        ) : (
          <SlidersHorizontal aria-hidden className="size-3.5" />
        )}
        Controls
      </button>
    </div>
  );

  return portal ? createPortal(widget, document.body) : widget;
}

export function SwitchRow({
  label,
  checked,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onCheckedChange(!checked)}
      className="flex h-8 w-full shrink-0 cursor-pointer items-center justify-between rounded-control bg-muted/60 px-3 transition-colors duration-150 ease-out hover:bg-muted/80"
    >
      <span className="text-[12.5px] font-medium text-foreground/90">
        {label}
      </span>
      <span
        className={cn(
          "relative h-4.5 w-8 rounded-[6px] transition-colors duration-200 ease-out",
          checked ? "bg-foreground" : "bg-border-strong",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 left-0.5 size-3.5 rounded-[4px] bg-background shadow-sm transition-transform duration-200 ease-out",
            checked && "translate-x-3.5",
          )}
        />
      </span>
    </button>
  );
}

export function RadioRow<V extends string>({
  label,
  options,
  value,
  onValueChange,
}: {
  label: string;
  options: readonly { value: V; label: string }[];
  value: V;
  onValueChange: (value: V) => void;
}) {
  return (
    <SegmentedRow
      label={label}
      options={options.map((option) => ({
        id: option.value,
        label: option.label,
      }))}
      value={value}
      onValueChange={onValueChange}
      className="w-full shrink-0"
    />
  );
}
