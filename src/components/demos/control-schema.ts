export type ControlValue = string | number | boolean;

export type When = (values: Record<string, ControlValue>) => boolean;

export interface ControlLayout {
  group?: string;
  advanced?: boolean;
  when?: When;
}

export interface ScrubControl extends ControlLayout {
  kind: "scrub";
  label: string;
  defaultValue: number;
  min: number;
  max: number;
  step: number;
  decimals: number;
}

export interface ToggleControl extends ControlLayout {
  kind: "toggle";
  label: string;
  defaultValue: boolean;
}

export interface ColorControl extends ControlLayout {
  kind: "color";
  label: string;
  defaultValue: string;
  auto?: { label: string; swatch: string };
}

export interface RadioControl<V extends string = string> extends ControlLayout {
  kind: "radio";
  label: string;
  defaultValue: V;
  options: readonly { value: V; label: string }[];
}

export interface CustomControl<V extends ControlValue = ControlValue>
  extends ControlLayout {
  kind: "custom";
  defaultValue: V;
}

export type Control =
  | ScrubControl
  | ToggleControl
  | ColorControl
  | RadioControl
  | CustomControl;

export type ControlSchema = Record<string, Control>;

type Widen<V> = V extends string
  ? string
  : V extends number
    ? number
    : V extends boolean
      ? boolean
      : never;

export type ValueOf<C extends Control> = C extends ScrubControl
  ? number
  : C extends ToggleControl
    ? boolean
    : C extends RadioControl<infer V>
      ? V
      : C extends CustomControl<infer V>
        ? V
        : C extends ColorControl
          ? string
          : never;

export type SchemaValues<S extends ControlSchema> = {
  [K in keyof S]: ValueOf<S[K]>;
};

export interface DemoPreset<S extends ControlSchema = ControlSchema> {
  label: string;
  values: Partial<SchemaValues<S>>;
}

export function presets<S extends ControlSchema>(
  _schema: S,
  list: DemoPreset<S>[],
): DemoPreset<S>[] {
  return list;
}

export function scrub(
  label: string,
  defaultValue: number,
  range: {
    min: number;
    max: number;
    step: number;
    decimals?: number;
  } & ControlLayout,
): ScrubControl {
  return {
    kind: "scrub",
    label,
    defaultValue,
    min: range.min,
    max: range.max,
    step: range.step,
    decimals: range.decimals ?? 2,
    when: range.when,
    group: range.group,
    advanced: range.advanced,
  };
}

export function toggle(
  label: string,
  defaultValue: boolean,
  opts?: ControlLayout,
): ToggleControl {
  return { kind: "toggle", label, defaultValue, ...opts };
}

export function color(
  label: string,
  defaultValue: string,
  opts?: { auto?: { label: string; swatch?: string } } & ControlLayout,
): ColorControl {
  const { auto, ...layout } = opts ?? {};
  return {
    kind: "color",
    label,
    defaultValue,
    auto: auto && {
      label: auto.label,
      swatch: auto.swatch ?? "#ffffff",
    },
    ...layout,
  };
}

export function radio<const V extends string>(
  label: string,
  defaultValue: NoInfer<V>,
  options: readonly { value: V; label: string }[],
  opts?: ControlLayout,
): RadioControl<V> {
  return { kind: "radio", label, defaultValue, options, ...opts };
}

export function custom<V extends ControlValue>(
  defaultValue: V,
  opts?: ControlLayout,
): CustomControl<Widen<V>> {
  return {
    kind: "custom",
    defaultValue: defaultValue as ControlValue as Widen<V>,
    ...opts,
  };
}

export function withDefaults<S extends ControlSchema>(
  schema: S,
  defaults: Partial<SchemaValues<S>>,
): S {
  const next = { ...schema };
  for (const [key, value] of Object.entries(defaults)) {
    if (value === undefined || !(key in next)) continue;
    next[key as keyof S] = { ...next[key], defaultValue: value } as S[keyof S];
  }
  return next;
}

export function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.replace("#", "").slice(0, 6), 16);
  return [
    Math.round((((value >> 16) & 255) / 255) * 1000) / 1000,
    Math.round((((value >> 8) & 255) / 255) * 1000) / 1000,
    Math.round(((value & 255) / 255) * 1000) / 1000,
  ];
}
