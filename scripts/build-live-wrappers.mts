import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const LIB_DIR = path.join(ROOT, "src/lib");
const OUT_DIR = path.join(ROOT, "src/components/docs/live");

type ImportName = {
  imported: string;
  local: string;
};

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function fail(file: string, message: string): never {
  throw new Error(`${path.relative(ROOT, file)}: ${message}`);
}

function parseImportNames(imports: string, file: string) {
  const typeNames: ImportName[] = [];
  const valueNames: ImportName[] = [];

  for (const raw of imports.split(",")) {
    const specifier = raw.trim();
    if (!specifier) continue;
    const isType = specifier.startsWith("type ");
    const name = isType ? specifier.slice("type ".length).trim() : specifier;
    const aliasParts = name.split(/\s+as\s+/);
    if (aliasParts.length > 2) fail(file, `Could not parse import: ${specifier}`);
    const imported = aliasParts[0]?.trim();
    const local = (aliasParts[1] ?? aliasParts[0])?.trim();
    if (!imported || !local) fail(file, `Could not parse import: ${specifier}`);
    (isType ? typeNames : valueNames).push({ imported, local });
  }

  return { typeNames, valueNames };
}

function findMatching(
  source: string,
  openIndex: number,
  openChar: string,
  closeChar: string,
) {
  let depth = 0;
  let quote: "'" | '"' | "`" | null = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = openIndex; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (lineComment) {
      if (char === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }
    if (char === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === "'" || char === '"' || char === "`") {
      quote = char;
      continue;
    }
    if (char === openChar) {
      depth += 1;
    } else if (char === closeChar) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  return -1;
}

function insertRendererSelection(
  source: string,
  file: string,
  base: string,
  hasSupportsHtmlInCanvas: boolean,
) {
  const functionAnchor = `export function ${base}`;
  const functionIndex = source.indexOf(functionAnchor);
  if (functionIndex === -1) fail(file, `Missing ${functionAnchor}`);
  const paramsOpen = source.indexOf("(", functionIndex);
  if (paramsOpen === -1) fail(file, `Missing ${base} parameter list`);
  const paramsClose = findMatching(source, paramsOpen, "(", ")");
  if (paramsClose === -1) fail(file, `Could not match ${base} parameter list`);
  const bodyOpen = source.indexOf("{", paramsClose);
  if (bodyOpen === -1) fail(file, `Missing ${base} function body`);

  const engineNames = [`create${base}`];
  if (hasSupportsHtmlInCanvas) engineNames.push("supportsHtmlInCanvas");
  const insertion = `\n  const renderer = useLiveRenderer();\n  const engine = renderer === "webgpu" ? WebGPU : WebGL;\n  const { ${engineNames.join(", ")} } = engine;\n`;
  return `${source.slice(0, bodyOpen + 1)}${insertion}${source.slice(bodyOpen + 1)}`;
}

function findComponentBody(source: string, file: string, base: string) {
  const functionAnchor = `export function ${base}`;
  const functionIndex = source.indexOf(functionAnchor);
  if (functionIndex === -1) fail(file, `Missing ${functionAnchor}`);
  const paramsOpen = source.indexOf("(", functionIndex);
  if (paramsOpen === -1) fail(file, `Missing ${base} parameter list`);
  const paramsClose = findMatching(source, paramsOpen, "(", ")");
  if (paramsClose === -1) fail(file, `Could not match ${base} parameter list`);
  const bodyOpen = source.indexOf("{", paramsClose);
  if (bodyOpen === -1) fail(file, `Missing ${base} function body`);
  const bodyClose = findMatching(source, bodyOpen, "{", "}");
  if (bodyClose === -1) fail(file, `Could not match ${base} function body`);
  return { bodyOpen, bodyClose };
}

function addRendererDependency(source: string, file: string, base: string) {
  const createName = `create${base}`;
  const effectPattern = new RegExp(
    `(useEffect\\(\\(\\) => \\{[\\s\\S]*?\\b${escapeRegExp(createName)}\\([\\s\\S]*?\\n\\s*\\}, \\[)([^\\]]*)(\\]\\);)`,
    "m",
  );
  const match = source.match(effectPattern);
  if (!match) fail(file, `Could not find useEffect that calls ${createName}`);
  const deps = match[2] ?? "";
  const depList = deps
    .split(",")
    .map((dep) => dep.trim())
    .filter(Boolean);
  for (const dep of ["renderer", createName]) {
    if (!depList.includes(dep)) depList.push(dep);
  }
  return source.replace(effectPattern, `$1${depList.join(", ")}$3`);
}

function ensureFragmentImport(source: string, file: string) {
  const multilineReactImport = /import\s*\{([^}]*)\}\s*from\s*"react";/m;
  const match = source.match(multilineReactImport);
  if (!match?.[1]) fail(file, "Missing React named import for Fragment wrapper");
  if (match[1].split(",").map((name) => name.trim()).includes("Fragment")) {
    return source;
  }
  return source.replace(multilineReactImport, (full, imports: string) => {
    if (full.includes("\n")) {
      return full.replace("{\n", "{\n  Fragment,\n");
    }
    return `import { Fragment, ${imports.trim()} } from "react";`;
  });
}

function addRendererKey(source: string, file: string, base: string) {
  const { bodyOpen, bodyClose } = findComponentBody(source, file, base);
  const body = source.slice(bodyOpen, bodyClose);
  const returnIndexInBody = body.lastIndexOf("\n  return (");
  if (returnIndexInBody === -1) {
    fail(file, "Could not find component JSX return");
  }
  const returnIndex = bodyOpen + returnIndexInBody + 1;
  const parenIndex = source.indexOf("(", returnIndex);
  if (parenIndex === -1 || parenIndex > bodyClose) {
    fail(file, "Could not find component return expression");
  }
  const returnClose = findMatching(source, parenIndex, "(", ")");
  if (returnClose === -1 || returnClose > bodyClose) {
    fail(file, "Could not match component return expression");
  }
  const jsxStart = source.slice(parenIndex + 1, returnClose).search(/\S/);
  if (jsxStart === -1) fail(file, "Component return expression is empty");
  const tagStart = parenIndex + 1 + jsxStart;
  if (source[tagStart] !== "<") {
    fail(file, "Component return expression does not start with JSX");
  }

  const tagMatch = source.slice(tagStart).match(/^<([A-Za-z][\w.]*)\b/);
  if (!tagMatch?.[1]) {
    fail(file, "Could not parse component root JSX tag");
  }

  const rootTag = tagMatch[1];
  if (rootTag === "div") {
    const openEnd = source.indexOf(">", tagStart);
    if (openEnd === -1 || openEnd > returnClose) {
      fail(file, "Could not find root div opening tag end");
    }
    const opening = source.slice(tagStart, openEnd);
    if (/\skey=/.test(opening)) return source;
    return `${source.slice(0, tagStart + "<div".length)} key={renderer}${source.slice(tagStart + "<div".length)}`;
  }

  if (rootTag === "canvas") {
    const wrapped = `${source.slice(0, tagStart)}<Fragment key={renderer}>\n      ${source.slice(tagStart, returnClose).trimEnd()}\n    </Fragment>${source.slice(returnClose)}`;
    return ensureFragmentImport(wrapped, file);
  }

  fail(file, `Unsupported component root JSX tag <${rootTag}>`);
}

function addFailedReset(source: string) {
  const failedLine = "  const [failed, setFailed] = useState(false);\n";
  const resetEffect = `\n  useEffect(() => {\n    // eslint-disable-next-line react-hooks/set-state-in-effect\n    setFailed(false);\n  }, [renderer]);\n`;
  if (!source.includes(failedLine) || source.includes("setFailed(false);\n  }, [renderer]);")) {
    return source;
  }
  return source.replace(failedLine, `${failedLine}${resetEffect}`);
}

function transformWrapper(file: string, base: string) {
  let source = fs.readFileSync(file, "utf8");
  if (!source.startsWith('"use client";\n')) {
    fail(file, 'Missing leading "use client"; directive');
  }

  const importPattern = new RegExp(
    `import\\s*\\{([^}]*)\\}\\s*from\\s*"\\./${escapeRegExp(base)}Vanilla";`,
    "m",
  );
  const importMatch = source.match(importPattern);
  if (!importMatch?.[1]) fail(file, `Missing ${base}Vanilla named import`);

  const { typeNames, valueNames } = parseImportNames(importMatch[1], file);
  const createName = `create${base}`;
  if (!valueNames.some((name) => name.local === createName && name.imported === createName)) {
    fail(file, `Missing ${createName} import`);
  }
  const hasSupportsHtmlInCanvas = valueNames.some(
    (name) =>
      name.local === "supportsHtmlInCanvas" &&
      name.imported === "supportsHtmlInCanvas",
  );

  const valueAliases = valueNames.filter(
    (name) => name.local !== createName && name.local !== "supportsHtmlInCanvas",
  );
  const aliases = [
    ...typeNames.map((name) => `type ${name.local} = WebGL.${name.imported};`),
    ...valueAliases.map((name) =>
      name.local === name.imported
        ? `const ${name.local} = WebGL.${name.imported};`
        : `const ${name.local} = WebGL.${name.imported};`,
    ),
  ];
  const replacement = [
    `import * as WebGL from "@/lib/${base}/${base}Vanilla";`,
    `import * as WebGPU from "@/lib/${base}/${base}WebGPU";`,
    `import { useLiveRenderer } from "@/components/docs/live-renderer";`,
    aliases.length > 0 ? `\n${aliases.join("\n")}` : "",
  ].join("\n");

  source = source.replace(importPattern, replacement);
  source = source.replace(
    '"use client";\n',
    `"use client";\n// Generated by scripts/build-live-wrappers.mts from src/lib/${base}/${base}.tsx. Do not edit.\n`,
  );
  source = insertRendererSelection(source, file, base, hasSupportsHtmlInCanvas);
  source = addFailedReset(source);
  source = addRendererDependency(source, file, base);
  source = addRendererKey(source, file, base);

  return source;
}

fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

const generated: string[] = [];

for (const entry of fs.readdirSync(LIB_DIR, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  const base = entry.name;
  const dir = path.join(LIB_DIR, base);
  const wrapper = path.join(dir, `${base}.tsx`);
  const webgpu = path.join(dir, `${base}WebGPU.ts`);
  if (!fs.existsSync(wrapper) || !fs.existsSync(webgpu)) continue;

  const output = transformWrapper(wrapper, base);
  fs.writeFileSync(path.join(OUT_DIR, `${base}.tsx`), output);
  generated.push(base);
}

if (generated.length === 0) {
  throw new Error("No live wrappers generated");
}

console.log(
  `Built ${generated.length} live wrappers into src/components/docs/live/: ${generated.join(", ")}`,
);
