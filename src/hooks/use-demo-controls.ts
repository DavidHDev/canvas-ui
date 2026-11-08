"use client";

import {
  createParser,
  parseAsBoolean,
  parseAsStringLiteral,
  useQueryStates,
  type SingleParserBuilder,
} from "nuqs";
import {
  createContext,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type RefObject,
} from "react";

import type {
  Control,
  ControlSchema,
  ControlValue,
  SchemaValues,
} from "@/components/demos/control-schema";

const HEX_COLOR = /^#[0-9a-f]{6}$/i;
const TRANSIENT_URL = /^(?:blob|data):/i;

function isTransient(value: ControlValue) {
  return typeof value === "string" && TRANSIENT_URL.test(value);
}

const parseAsSharableString = createParser<string>({
  parse(query) {
    return TRANSIENT_URL.test(query) ? null : query;
  },
  serialize(value) {
    return value;
  },
});

function controlNumberParser(min = -Infinity, max = Infinity) {
  return createParser<number>({
    parse(query) {
      const value = query.trim() === "" ? NaN : Number(query);
      return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : null;
    },
    serialize(value) {
      return String(Number(value.toFixed(4)));
    },
  });
}

function colorParser(sentinel: string | undefined) {
  return createParser<string>({
    parse(query) {
      if (sentinel !== undefined && query === sentinel) return query;
      const value = `#${query}`;
      return HEX_COLOR.test(value) ? value.toLowerCase() : null;
    },
    serialize(value) {
      return value.startsWith("#") ? value.slice(1).toLowerCase() : value;
    },
  });
}

type ControlParser = SingleParserBuilder<ControlValue> & {
  readonly defaultValue: ControlValue;
};

function parserFor(control: Control) {
  switch (control.kind) {
    case "scrub":
      return controlNumberParser(control.min, control.max).withDefault(
        control.defaultValue,
      );
    case "toggle":
      return parseAsBoolean.withDefault(control.defaultValue);
    case "radio":
      return parseAsStringLiteral(
        control.options.map((option) => option.value),
      ).withDefault(control.defaultValue);
    case "color":
      return colorParser(
        control.auto !== undefined ? control.defaultValue : undefined,
      ).withDefault(control.defaultValue.toLowerCase());
    case "custom":
      return typeof control.defaultValue === "number"
        ? controlNumberParser().withDefault(control.defaultValue)
        : typeof control.defaultValue === "boolean"
          ? parseAsBoolean.withDefault(control.defaultValue)
          : parseAsSharableString.withDefault(control.defaultValue);
  }
}

function buildParsers(schema: ControlSchema): Record<string, ControlParser> {
  return Object.fromEntries(
    Object.entries(schema).map(([key, control]) => [key, parserFor(control)]),
  ) as Record<string, ControlParser>;
}

export interface DemoControlsHandle<S extends ControlSchema = ControlSchema> {
  schema: S;
  values: SchemaValues<S>;
  setValue<K extends keyof S & string>(key: K, value: SchemaValues<S>[K]): void;
  reset(): void;
  isDefault: boolean;
}

export const DemoControlsResetContext = createContext<RefObject<
  (() => void) | null
> | null>(null);

export function useDemoControls<S extends ControlSchema>(
  schema: S,
): DemoControlsHandle<S> {
  const [parsers] = useState(() => buildParsers(schema));
  const [state, setState] = useQueryStates(parsers, { history: "replace" });
  const [transient, setTransient] = useState<Record<string, ControlValue>>({});

  const values = useMemo(
    () =>
      (Object.keys(transient).length
        ? { ...state, ...transient }
        : state) as SchemaValues<S>,
    [state, transient],
  );

  const setValue = useCallback(
    (key: string, value: ControlValue) => {
      if (isTransient(value)) {
        setTransient((prev) => ({ ...prev, [key]: value }));
        void setState({ [key]: null });
        return;
      }
      setTransient((prev) => {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
      void setState({ [key]: value });
    },
    [setState],
  );

  const reset = useCallback(() => {
    setTransient({});
    void setState(null);
  }, [setState]);

  const resetRef = useContext(DemoControlsResetContext);
  useLayoutEffect(() => {
    if (!resetRef) return;
    resetRef.current = reset;
    return () => {
      resetRef.current = null;
    };
  }, [resetRef, reset]);

  const isDefault = useMemo(
    () =>
      Object.entries(schema).every(
        ([key, control]) => values[key] === control.defaultValue,
      ),
    [schema, values],
  );

  return useMemo(
    () => ({ schema, values, setValue, reset, isDefault }),
    [schema, values, setValue, reset, isDefault],
  );
}
