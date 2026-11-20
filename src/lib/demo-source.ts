import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const SRC_ROOT = path.join(process.cwd(), "src");

function srcPath(file: string) {
  return path.join(SRC_ROOT, file.replace(/^src\//, ""));
}
const SITE_URL = "https://canvasui.dev";
const CORS_ASSET = /^\/(?:assets\/models\/|logo-icon\.svg$)/;

const KIT_FILE = "src/demos/standalone-kit.tsx";
const KIT_MODULES = new Set([
  "@/components/demos/demo-controls",
  "@/components/demos/demo-stage",
  "@/components/demos/demo-surface",
  "@/hooks/use-demo-controls",
]);

const SECTION_NOTES: Record<string, string> = {
  "src/components/demos/control-schema.ts": "control definitions",
  "src/lib/utils.ts": "class name helper (same as shadcn/ui's)",
  "src/components/ui/segmented-control.tsx": "segmented control",
  [KIT_FILE]: "stand-ins for the docs control panel and stage",
  "src/demos/scenes.tsx": "the HTML the effect runs on",
  "src/demos/object-kit.tsx": "model picker, load status and shared object controls",
};

const CLASS_MAP: Record<string, string> = {
  frame: "rounded-[18px] bg-muted/45 p-2",
  "frame-inset": "rounded-[10px] bg-background",
  "frame-bar": "flex h-8 items-center justify-between gap-2",
  "surface-floating": "border border-border bg-background/75 shadow-lg backdrop-blur-xl",
  pressable: "active:scale-[0.97]",
  "segmented-indicator": "transition-[transform,width,opacity] duration-300 ease-out",
  chip:
    "inline-flex h-6 items-center gap-1.5 rounded-full border border-border px-2.5 text-xs text-muted-foreground",
  "rounded-control": "rounded-[10px]",
  "rounded-bar": "rounded-[14px]",
  "rounded-frame": "rounded-[18px]",
  "rounded-panel": "rounded-[19px]",
  "bg-border-strong": "bg-foreground/20",
  "border-border-strong": "border-foreground/20",
  "hover:border-border-strong": "hover:border-foreground/20",
  "border-border-subtle": "border-foreground/10",
  "bg-surface-inset": "bg-muted/40",
  "hover:bg-[var(--surface-hover)]": "hover:bg-foreground/5",
  "shadow-[var(--shadow-float)]": "shadow-lg",
};

type Resolved = { kind: "external"; spec: string } | { kind: "bundle"; file: string };

function resolveModule(spec: string): Resolved {
  if (KIT_MODULES.has(spec)) return { kind: "bundle", file: KIT_FILE };
  const live = /^@\/components\/docs\/live\/(\w+)$/.exec(spec);
  if (live) return { kind: "external", spec: `@/components/canvasui/${live[1]}` };
  const engine = /^@\/lib\/(\w+)\/\1(?:Vanilla|WebGPU)$/.exec(spec);
  if (engine) return { kind: "external", spec: `@/components/canvasui/${engine[1]}` };
  const ui = /^@\/components\/ui\/([\w-]+)$/.exec(spec);
  if (ui && ui[1] !== "segmented-control") return { kind: "external", spec };
  if (spec.startsWith("@/")) {
    const base = path.join("src", spec.slice(2));
    for (const ext of [".tsx", ".ts"]) {
      if (fs.existsSync(srcPath(base + ext))) return { kind: "bundle", file: base + ext };
    }
    throw new Error(`demo-source: cannot resolve ${spec}`);
  }
  return { kind: "external", spec };
}

interface ImportBinding {
  module: Resolved;
  imported: string;
  typeOnly: boolean;
}

interface TopLevel {
  node: ts.Statement;
  names: string[];
  refs: Set<string>;
}

interface ModuleInfo {
  file: string;
  sourceFile: ts.SourceFile;
  imports: Map<string, ImportBinding>;
  statements: TopLevel[];
  byName: Map<string, TopLevel>;
}

const moduleCache = new Map<string, ModuleInfo>();

function bindingNames(name: ts.BindingName, out: string[]) {
  if (ts.isIdentifier(name)) out.push(name.text);
  else for (const element of name.elements) {
    if (ts.isBindingElement(element)) bindingNames(element.name, out);
  }
}

function declaredNames(node: ts.Statement): string[] {
  if (
    (ts.isFunctionDeclaration(node) ||
      ts.isClassDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isEnumDeclaration(node)) &&
    node.name
  ) {
    return [node.name.text];
  }
  if (ts.isVariableStatement(node)) {
    const names: string[] = [];
    for (const decl of node.declarationList.declarations) bindingNames(decl.name, names);
    return names;
  }
  return [];
}

function referencedNames(node: ts.Node): Set<string> {
  const refs = new Set<string>();
  const visit = (child: ts.Node) => {
    if (ts.isIdentifier(child)) {
      const parent = child.parent;
      const isKey =
        (ts.isPropertyAccessExpression(parent) && parent.name === child) ||
        (ts.isQualifiedName(parent) && parent.right === child) ||
        (ts.isPropertyAssignment(parent) && parent.name === child) ||
        (ts.isPropertySignature(parent) && parent.name === child) ||
        (ts.isMethodSignature(parent) && parent.name === child) ||
        (ts.isBindingElement(parent) && parent.propertyName === child) ||
        ts.isJsxAttribute(parent);
      if (!isKey) refs.add(child.text);
    }
    ts.forEachChild(child, visit);
  };
  ts.forEachChild(node, visit);
  return refs;
}

function loadModule(file: string): ModuleInfo {
  const cached = moduleCache.get(file);
  if (cached) return cached;
  const text = fs.readFileSync(srcPath(file), "utf8");
  const sourceFile = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );
  const imports = new Map<string, ImportBinding>();
  const statements: TopLevel[] = [];
  const byName = new Map<string, TopLevel>();

  for (const node of sourceFile.statements) {
    if (ts.isImportDeclaration(node)) {
      const spec = (node.moduleSpecifier as ts.StringLiteral).text;
      const clause = node.importClause;
      if (!clause) continue;
      const mod = resolveModule(spec);
      if (clause.name || (clause.namedBindings && ts.isNamespaceImport(clause.namedBindings))) {
        throw new Error(`demo-source: ${file} uses a default or namespace import from ${spec}`);
      }
      for (const element of (clause.namedBindings as ts.NamedImports | undefined)?.elements ?? []) {
        const imported = (element.propertyName ?? element.name).text;
        if (mod.kind === "bundle" && imported !== element.name.text) {
          throw new Error(`demo-source: ${file} renames ${imported} from ${spec}`);
        }
        imports.set(element.name.text, {
          module: mod,
          imported,
          typeOnly: clause.isTypeOnly || element.isTypeOnly,
        });
      }
      continue;
    }
    if (ts.isExpressionStatement(node) && ts.isStringLiteral(node.expression)) continue;
    const entry: TopLevel = { node, names: declaredNames(node), refs: referencedNames(node) };
    statements.push(entry);
    for (const name of entry.names) byName.set(name, entry);
  }

  const info = { file, sourceFile, imports, statements, byName };
  moduleCache.set(file, info);
  return info;
}

interface ExternalImport {
  values: Set<string>;
  types: Set<string>;
  aliases: Map<string, string>;
}

function isExported(node: ts.Statement) {
  return (ts.getModifiers(node as ts.HasModifiers) ?? []).some(
    (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
  );
}

function statementText(mod: ModuleInfo, node: ts.Statement, keepExport: boolean) {
  const full = mod.sourceFile.getFullText();
  let text = full.slice(node.getFullStart(), node.getEnd());
  if (!keepExport && isExported(node)) {
    const keyword = (ts.getModifiers(node as ts.HasModifiers) ?? []).find(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    )!;
    const start = keyword.getStart() - node.getFullStart();
    const end = keyword.getEnd() - node.getFullStart();
    text = text.slice(0, start) + text.slice(end).replace(/^\s+/, "");
  }
  return text.replace(/^\s*\n/, "").trimEnd();
}

function mapClasses(code: string, file: string) {
  const sourceFile = ts.createSourceFile(
    file,
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const edits: { start: number; end: number; text: string }[] = [];
  const rewrite = (start: number, end: number) => {
    let changed = false;
    const next = code
      .slice(start, end)
      .split(/(\s+)/)
      .map((token) => {
        const mapped = CLASS_MAP[token];
        if (mapped === undefined) return token;
        changed = true;
        return mapped;
      })
      .join("");
    if (changed) edits.push({ start, end, text: next });
  };
  const visitClassExpression = (node: ts.Node) => {
    const start = node.getStart();
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      rewrite(start + 1, node.getEnd() - 1);
    } else if (ts.isTemplateHead(node) || ts.isTemplateMiddle(node)) {
      rewrite(start + 1, node.getEnd() - 2);
    } else if (ts.isTemplateTail(node)) {
      rewrite(start + 1, node.getEnd() - 1);
    }
    ts.forEachChild(node, visitClassExpression);
  };
  const visit = (node: ts.Node) => {
    if (ts.isJsxAttribute(node) && node.name.getText() === "className" && node.initializer) {
      visitClassExpression(node.initializer);
      return;
    }
    const callee = ts.isCallExpression(node) ? node.expression : null;
    if (callee && ts.isIdentifier(callee) && callee.text === "cn") {
      for (const arg of (node as ts.CallExpression).arguments) visitClassExpression(arg);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  for (const edit of edits.sort((a, b) => b.start - a.start)) {
    code = code.slice(0, edit.start) + edit.text + code.slice(edit.end);
  }
  return code;
}

function toPascal(slug: string) {
  return slug
    .split("-")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join("");
}

function header(lines: string[]) {
  return ["/**", ...lines.map((line) => (line ? ` * ${line}` : " *")), " */"].join("\n");
}

function sectionRule(title: string) {
  const text = `// ── ${title} `;
  return text + "─".repeat(Math.max(4, 78 - text.length));
}

export function getDemoSource(component: string, title?: string): string | null {
  const demoFile = `src/demos/${component}-demo.tsx`;
  if (!fs.existsSync(srcPath(demoFile))) return null;

  const needed = new Map<string, Set<string>>();
  const externals = new Map<string, ExternalImport>();
  const order: string[] = [];
  const visited = new Set<string>();

  const need = (file: string, name: string) => {
    let names = needed.get(file);
    if (!names) needed.set(file, (names = new Set()));
    if (names.has(name)) return;
    names.add(name);
    const mod = loadModule(file);
    const entry = mod.byName.get(name);
    if (!entry) throw new Error(`demo-source: ${file} has no top-level ${name}`);
    for (const sibling of entry.names) names.add(sibling);
    collect(mod, entry);
  };

  const collect = (mod: ModuleInfo, entry: TopLevel) => {
    for (const ref of entry.refs) {
      const local = mod.byName.get(ref);
      if (local && local !== entry) need(mod.file, ref);
      const binding = mod.imports.get(ref);
      if (!binding) continue;
      if (binding.module.kind === "bundle") {
        need(binding.module.file, binding.imported);
      } else {
        let external = externals.get(binding.module.spec);
        if (!external) {
          external = { values: new Set(), types: new Set(), aliases: new Map() };
          externals.set(binding.module.spec, external);
        }
        if (binding.imported !== ref) external.aliases.set(ref, binding.imported);
        (binding.typeOnly ? external.types : external.values).add(ref);
      }
    }
  };

  const visit = (file: string) => {
    if (visited.has(file)) return;
    visited.add(file);
    for (const binding of loadModule(file).imports.values()) {
      if (binding.module.kind === "bundle" && needed.has(binding.module.file)) {
        visit(binding.module.file);
      }
    }
    order.push(file);
  };

  const demo = loadModule(demoFile);
  const demoStatements = demo.statements.filter(
    (entry) => !(ts.isExportDeclaration(entry.node) && !entry.node.moduleSpecifier),
  );
  for (const entry of demoStatements) collect(demo, entry);
  needed.set(demoFile, new Set(demoStatements.flatMap((entry) => entry.names)));
  visit(demoFile);

  const owners = new Map<string, string>();
  for (const [spec, external] of externals) {
    for (const name of [...external.values, ...external.types]) owners.set(name, spec);
  }
  for (const file of order) {
    for (const name of needed.get(file) ?? []) {
      const owner = owners.get(name);
      if (owner && owner !== file) {
        throw new Error(`demo-source: ${component} defines ${name} in both ${owner} and ${file}`);
      }
      owners.set(name, file);
    }
  }

  const importLines = [...externals.entries()]
    .sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b))
    .map(([spec, external]) => {
      const typeOnly = external.values.size === 0;
      const alias = (name: string) => {
        const imported = external.aliases.get(name);
        return imported ? `${imported} as ${name}` : name;
      };
      const byName = (a: string, b: string) => a.localeCompare(b);
      const values = [...external.values].sort(byName).map(alias);
      const types = [...external.types]
        .filter((name) => !external.values.has(name))
        .sort(byName)
        .map((name) => (typeOnly ? alias(name) : `type ${alias(name)}`));
      const specifiers = [...values, ...types];
      const keyword = typeOnly ? "import type" : "import";
      const line = `${keyword} { ${specifiers.join(", ")} } from "${spec}";`;
      if (line.length <= 90) return line;
      const list = specifiers.map((item) => `  ${item},`).join("\n");
      return `${keyword} {\n${list}\n} from "${spec}";`;
    });

  const name =
    [...externals.keys()]
      .map((spec) => /^@\/components\/canvasui\/(\w+)$/.exec(spec)?.[1])
      .find((base) => base !== undefined) ?? toPascal(component);
  const exportName =
    demoStatements
      .map((entry) => entry.node)
      .find(
        (node): node is ts.FunctionDeclaration =>
          ts.isFunctionDeclaration(node) && isExported(node) && /Demo$/.test(node.name?.text ?? ""),
      )?.name?.text ?? `${name}Demo`;
  const packages = [
    ...new Set(
      [...externals.keys()]
        .filter((spec) => !spec.startsWith("@/") && spec !== "react" && spec !== "react-dom")
        .map((spec) => spec.split("/").slice(0, spec.startsWith("@") ? 2 : 1).join("/")),
    ),
  ];
  const shadcnUi = [...externals.keys()]
    .map((spec) => /^@\/components\/ui\/([\w-]+)$/.exec(spec)?.[1])
    .filter((item): item is string => item !== undefined)
    .sort();
  const inlined = order.filter((file) => file !== demoFile);
  const docsUrl = `${SITE_URL}/docs/components/${component}`;

  const sections = order.map((file) => {
    const mod = loadModule(file);
    const isDemo = file === demoFile;
    const names = needed.get(file)!;
    const kept = isDemo
      ? demoStatements
      : mod.statements.filter((entry) => entry.names.some((n) => names.has(n)));
    const body = kept.map((entry) => statementText(mod, entry.node, isDemo)).join("\n\n");
    const heading = isDemo
      ? `The demo (${file.replace(/^src\//, "")})`
      : `From ${file.replace(/^src\//, "")}`;
    return `${sectionRule(heading)}\n\n${body}`;
  });

  const assets = [
    ...new Set(
      [
        ...sections
          .join("\n\n")
          .matchAll(/"(\/[\w./-]+\.(?:glb|gltf|svg|png|jpe?g|webp|gif|mp4|webm))"/g),
      ].map((match) => match[1]),
    ),
  ];
  const remote = assets.filter((asset) => CORS_ASSET.test(asset));
  const local = assets.filter((asset) => !CORS_ASSET.test(asset));
  const body = remote.reduce(
    (text, asset) => text.replaceAll(`"${asset}"`, `"${SITE_URL}${asset}"`),
    sections.join("\n\n"),
  );
  const width = Math.max(...inlined.map((file) => file.length)) - "src/".length;
  const steps = [
    [
      `Install the component (it lands in components/canvasui/${name}.tsx):`,
      `  npx shadcn@latest add @canvas-ui/${component}-react`,
    ],
    ...(packages.length > 0
      ? [[`Install what this file imports: npm install ${packages.join(" ")}`]]
      : []),
    ...(shadcnUi.length > 0
      ? [[`Add the shadcn/ui components it uses: npx shadcn@latest add ${shadcnUi.join(" ")}`]]
      : []),
    ...(remote.length > 0
      ? [
          [
            "The sample models load from canvasui.dev. To use your own .glb, .svg",
            "or image, change the src values in the demo below.",
          ],
        ]
      : []),
    ...(local.length > 0
      ? [
          [
            "Save these sample files into public/ at the same paths:",
            ...local.map((asset) => `  ${SITE_URL}${asset}`),
          ],
        ]
      : []),
    [
      `Render <${exportName} /> inside a positioned box with a height, e.g.`,
      `  <div className="relative h-[480px] overflow-hidden"><${exportName} /></div>`,
    ],
  ];

  const intro = header([
    `Canvas UI · ${title ?? name} demo`,
    docsUrl,
    "",
    "The live demo from the docs as one self-contained file. Shared pieces from",
    "the docs site come first, trimmed to what the demo uses:",
    ...inlined.map((file) => {
      const note = SECTION_NOTES[file] ?? "shared helpers";
      return `  ${file.replace(/^src\//, "").padEnd(width)}  ${note}`;
    }),
    "The demo itself is the last section.",
    "",
    ...steps.flatMap((lines, index) => [
      `${index + 1}. ${lines[0]}`,
      ...lines.slice(1).map((line) => `   ${line}`),
    ]),
    "",
    "Styling is Tailwind CSS v4 with shadcn/ui theme tokens (bg-background,",
    "text-muted-foreground, border-border). The control panel is a minimal",
    "stand-in for the one on the docs site: values live in React state.",
  ]);

  const code = [`"use client";`, "", intro, "", ...importLines, "", body, ""].join("\n");
  return mapClasses(code, `${component}-demo.tsx`);
}

function rank(spec: string) {
  if (spec === "react" || spec === "react-dom") return 0;
  if (!spec.startsWith("@/")) return 1;
  return 2;
}
