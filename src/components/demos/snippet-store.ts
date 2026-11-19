export interface DemoSnippet {
  component: string;
  props: Record<string, unknown>;
}

let current: DemoSnippet | null = null;

export function publishDemoSnippet(snippet: DemoSnippet | null) {
  current = snippet;
}

export function getDemoSnippet(): DemoSnippet | null {
  return current;
}

const fmtNum = (n: number) => String(Math.round(n * 10000) / 10000);

function fmtJsxProp(key: string, value: unknown): string | null {
  if (value === undefined || value === null || typeof value === "function") {
    return null;
  }
  if (typeof value === "string") return `${key}=${JSON.stringify(value)}`;
  if (typeof value === "boolean") return value ? key : `${key}={false}`;
  if (typeof value === "number") return `${key}={${fmtNum(value)}}`;
  if (Array.isArray(value)) {
    const items = value.map((item) =>
      typeof item === "number" ? fmtNum(item) : JSON.stringify(item),
    );
    return `${key}={[${items.join(", ")}]}`;
  }
  return `${key}={${JSON.stringify(value)}}`;
}

export function buildConfiguredJsx(
  component: string,
  props: Record<string, unknown>,
) {
  const lines = Object.entries(props)
    .map(([key, value]) => fmtJsxProp(key, value))
    .filter((line): line is string => line !== null)
    .map((line) => `  ${line}`);
  return [
    `<${component}`,
    ...lines,
    `>`,
    `  {/* your content */}`,
    `</${component}>`,
  ].join("\n");
}
