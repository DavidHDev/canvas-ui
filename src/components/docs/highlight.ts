import {
  codeToHtml,
  type BundledLanguage,
  type ShikiTransformer,
  type ThemeRegistration,
} from "shiki";

type Palette = {
  base: string;
  strong: string;
  muted: string;
  faint: string;
  bg: string;
};

function monochrome(name: string, colors: Palette): ThemeRegistration {
  const { base, strong, muted, faint, bg } = colors;
  return {
    name,
    type: name.endsWith("dark") ? "dark" : "light",
    colors: {
      "editor.background": bg,
      "editor.foreground": base,
    },
    settings: [
      { settings: { foreground: base } },
      {
        scope: ["comment", "punctuation.definition.comment"],
        settings: { foreground: faint },
      },
      {
        scope: [
          "string",
          "string.template",
          "punctuation.definition.string",
          "constant.numeric",
          "constant.language",
          "constant.character",
        ],
        settings: { foreground: muted },
      },
      {
        scope: [
          "keyword",
          "storage.type",
          "storage.modifier",
          "keyword.control",
          "keyword.operator.new",
          "keyword.operator.expression",
        ],
        settings: { foreground: strong },
      },
      {
        scope: [
          "entity.name.function",
          "entity.name.type",
          "entity.name.class",
          "entity.name.tag",
          "support.function",
          "support.class",
          "support.type",
        ],
        settings: { foreground: strong },
      },
      {
        scope: [
          "punctuation",
          "meta.brace",
          "keyword.operator",
          "punctuation.definition.tag",
        ],
        settings: { foreground: muted },
      },
      {
        scope: [
          "variable",
          "variable.parameter",
          "entity.other.attribute-name",
          "support.variable",
        ],
        settings: { foreground: base },
      },
    ],
  };
}

const LIGHT: Palette = {
  base: "#404040",
  strong: "#0a0a0a",
  muted: "#737373",
  faint: "#a3a3a3",
  bg: "#ffffff",
};

const DARK: Palette = {
  base: "#b3b3b3",
  strong: "#fafafa",
  muted: "#8a8a8a",
  faint: "#595959",
  bg: "#0a0a0a",
};

const monoLight = monochrome("canvas-mono-light", LIGHT);
const monoDark = monochrome("canvas-mono-dark", DARK);

const TOKEN_CLASS: Record<string, string> = {
  [LIGHT.strong]: "s",
  [LIGHT.muted]: "m",
  [LIGHT.faint]: "f",
};

type CodeChild = Parameters<NonNullable<ShikiTransformer["code"]>>[0]["children"][number];

const compactTokens: ShikiTransformer = {
  code(node) {
    const out: CodeChild[] = [];
    const push = (child: CodeChild) => {
      const last = out[out.length - 1];
      if (child.type === "text" && last?.type === "text") {
        last.value += child.value;
        return;
      }
      if (
        child.type === "element" &&
        last?.type === "element" &&
        String(last.properties.className) === String(child.properties.className)
      ) {
        last.children.push(...child.children);
        return;
      }
      out.push(child);
    };

    for (const line of node.children) {
      if (line.type !== "element") {
        push(line);
        continue;
      }
      for (const token of line.children) {
        if (token.type !== "element") {
          push(token);
          continue;
        }
        const light = /--shiki-light:\s*(#[0-9a-f]+)/i
          .exec(String(token.properties.style ?? ""))?.[1]
          .toLowerCase();
        const className = light ? TOKEN_CLASS[light] : undefined;
        if (!className) {
          token.children.forEach(push);
          continue;
        }
        push({
          type: "element",
          tagName: "span",
          properties: { className: [className] },
          children: [...token.children],
        });
      }
    }
    node.children = out;
  },
};

export async function highlight(source: string, lang: BundledLanguage) {
  return codeToHtml(source, {
    lang,
    themes: {
      light: monoLight,
      dark: monoDark,
    },
    defaultColor: false,
    transformers: [compactTokens],
  });
}
