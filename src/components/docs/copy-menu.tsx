"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { play } from "cuelume";
import {
  Check,
  ChevronDown,
  FileText,
  Sparkles,
  SquareCode,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type SVGProps,
} from "react";

import type { ApiProp } from "@/components/docs/api-reference";
import type { CodeVariant } from "@/components/docs/code-tabs";
import {
  buildConfiguredJsx,
  getDemoSnippet,
} from "@/components/demos/snippet-store";
import {
  buildInstallCommand,
  FRAMEWORK_IDS,
  MANAGER_IDS,
} from "@/components/docs/install-tabs";
import { usePreference } from "@/hooks/use-preference";
import { cn } from "@/lib/utils";

const SITE_URL = "https://canvasui.dev";

interface CopyMenuProps {
  title: string;
  description: string;
  installItem: string;
  variants: CodeVariant[];
  apiReference?: ApiProp[];
  dependencies?: string[];
  devDependencies?: string[];
  demoSource?: string | null;
}

const LANG_BY_ID: Record<string, string> = {
  react: "tsx",
  solid: "tsx",
  preact: "tsx",
  lit: "ts",
  vue: "vue",
  svelte: "svelte",
  vanilla: "ts",
};

const DEP_COMMANDS: Record<string, { install: string; dev: string }> = {
  npm: { install: "npm install", dev: "npm install -D" },
  pnpm: { install: "pnpm add", dev: "pnpm add -D" },
  yarn: { install: "yarn add", dev: "yarn add -D" },
  bun: { install: "bun add", dev: "bun add -d" },
};

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>;

function OpenAiIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.073zM13.2599 22.4301a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6455zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.8956zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997z" />
    </svg>
  );
}

function V0Icon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="M14.066 6.028v2.22h5.729q.075-.001.148.005l-5.853 5.752a2 2 0 0 1-.024-.309V8.247h-2.353v5.45c0 2.322 1.935 4.222 4.258 4.222h5.675v-2.22h-5.675q-.03 0-.059-.003l5.729-5.629q.006.082.006.166v5.465H24v-5.465a4.204 4.204 0 0 0-4.205-4.205zM0 8.245l8.28 9.266c.839.94 2.396.346 2.396-.914V8.245H8.19v5.44l-4.86-5.44Z" />
    </svg>
  );
}

function ClaudeIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden {...props}>
      <path d="m4.7144 15.9555 4.7174-2.6471.079-.2307-.079-.1275h-.2307l-.7893-.0486-2.6956-.0729-2.3375-.0971-2.2646-.1214-.5707-.1215-.5343-.7042.0546-.3522.4797-.3218.686.0608 1.5179.1032 2.2767.1578 1.6514.0972 2.4468.255h.3886l.0546-.1579-.1336-.0971-.1032-.0972L6.973 9.8356l-2.55-1.6879-1.3356-.9714-.7225-.4918-.3643-.4614-.1578-1.0078.6557-.7225.8803.0607.2246.0607.8925.686 1.9064 1.4754 2.4893 1.8336.3643.3035.1457-.1032.0182-.0728-.164-.2733-1.3539-2.4467-1.445-2.4893-.6435-1.032-.17-.6194c-.0607-.255-.1032-.4674-.1032-.7285L6.287.1335 6.6997 0l.9957.1336.419.3642.6192 1.4147 1.0018 2.2282 1.5543 3.0296.4553.8985.2429.8318.091.255h.1579v-.1457l.1275-1.706.2368-2.0947.2307-2.6957.0789-.7589.3764-.9107.7468-.4918.5828.2793.4797.686-.0668.4433-.2853 1.8517-.5586 2.9021-.3643 1.9429h.2125l.2429-.2429.9835-1.3053 1.6514-2.0643.7286-.8196.85-.9046.5464-.4311h1.0321l.759 1.1293-.34 1.1657-1.0625 1.3478-.8804 1.1414-1.2628 1.7-.7893 1.36.0729.1093.1882-.0183 2.8535-.607 1.5421-.2794 1.8396-.3157.8318.3886.091.3946-.3278.8075-1.967.4857-2.3072.4614-3.4364.8136-.0425.0304.0486.0607 1.5482.1457.6618.0364h1.621l3.0175.2247.7892.522.4736.6376-.079.4857-1.2142.6193-1.6393-.3886-3.825-.9107-1.3113-.3279h-.1822v.1093l1.0929 1.0686 2.0035 1.8092 2.5075 2.3314.1275.5768-.3218.4554-.34-.0486-2.2039-1.6575-.85-.7468-1.9246-1.621h-.1275v.17l.4432.6496 2.3436 3.5214.1214 1.0807-.17.3521-.6071.2125-.6679-.1214-1.3721-1.9246L14.38 17.959l-1.1414-1.9428-.1397.079-.674 7.2552-.3156.3703-.7286.2793-.6071-.4614-.3218-.7468.3218-1.4753.3886-1.9246.3157-1.53.2853-1.9004.17-.6314-.0121-.0425-.1397.0182-1.4328 1.9672-2.1796 2.9446-1.7243 1.8456-.4128.164-.7164-.3704.0667-.6618.4008-.5889 2.386-3.0357 1.4389-1.882.929-1.0868-.0062-.1579h-.0546l-6.3385 4.1164-1.1293.1457-.4857-.4554.0608-.7467.2307-.2429 1.9064-1.3114Z" />
    </svg>
  );
}

function buildDependencyLines(
  managerId: string,
  dependencies: string[],
  devDependencies: string[],
) {
  const commands = DEP_COMMANDS[managerId] ?? DEP_COMMANDS.npm;
  const lines: string[] = [];
  if (dependencies.length > 0) {
    lines.push(`${commands.install} ${dependencies.join(" ")}`);
  }
  if (devDependencies.length > 0) {
    lines.push(`${commands.dev} ${devDependencies.join(" ")}`);
  }
  return lines;
}

function buildPropsTable(apiReference?: ApiProp[]) {
  if (!apiReference || apiReference.length === 0) return [];
  return [
    "## Props",
    "",
    "| Property | Type | Default | Description |",
    "| --- | --- | --- | --- |",
    ...apiReference.map(
      (prop) =>
        `| ${prop.name} | ${prop.type} | ${prop.defaultValue ?? ""} | ${prop.description} |`,
    ),
    "",
  ];
}

export function CopyMenu({
  title,
  description,
  installItem,
  variants,
  apiReference,
  dependencies = [],
  devDependencies = [],
  demoSource,
}: CopyMenuProps) {
  const shouldReduceMotion = useReducedMotion();
  const [managerId] = usePreference("pm", "npm", MANAGER_IDS);
  const [frameworkId] = usePreference("framework", "react", FRAMEWORK_IDS);
  const [open, setOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const variant =
    variants.find((entry) => entry.id === frameworkId) ?? variants[0];
  const depLines = buildDependencyLines(
    managerId,
    dependencies,
    devDependencies,
  );
  const docsUrl = `${SITE_URL}/docs/components/${installItem}`;

  const configuredCode = () => {
    const snippet = getDemoSnippet();
    if (!snippet) return null;
    return [
      `import { ${snippet.component} } from "@/components/canvasui/${snippet.component}";`,
      "",
      buildConfiguredJsx(snippet.component, snippet.props),
      "",
    ].join("\n");
  };

  const buildConfiguredSection = () => {
    const code = configuredCode();
    if (!code) return [];
    return [
      "## Current configuration",
      "",
      "The component as configured right now in the docs demo (React syntax; prop values apply to every framework):",
      "",
      "```tsx",
      code.trimEnd(),
      "```",
      "",
    ];
  };

  const buildPrompt = () =>
    [
      `# Canvas UI: ${title} (${variant.label})`,
      "",
      description,
      "",
      "## Install",
      "",
      "```sh",
      buildInstallCommand(managerId, installItem, frameworkId),
      "```",
      "",
      `Or copy the standalone source below into your project as ${variant.fileName}.`,
      "",
      ...(depLines.length > 0
        ? [
            "## Dependencies",
            "",
            "The install command above adds these automatically. When copying the source by hand, install them first:",
            "",
            "```sh",
            ...depLines,
            "```",
            "",
          ]
        : []),
      ...buildConfiguredSection(),
      ...buildPropsTable(apiReference),
      `## ${variant.fileName}`,
      "",
      "```" + (LANG_BY_ID[variant.id] ?? "ts"),
      variant.source.trimEnd(),
      "```",
      "",
    ].join("\n");

  const buildPageMarkdown = () =>
    [
      `# ${title}`,
      "",
      description,
      "",
      docsUrl,
      "",
      "## Install",
      "",
      "```sh",
      buildInstallCommand(managerId, installItem, frameworkId),
      "```",
      "",
      ...(depLines.length > 0
        ? ["## Dependencies", "", "```sh", ...depLines, "```", ""]
        : []),
      "## Code",
      "",
      ...variants.flatMap((entry) => [
        `### ${entry.fileName}`,
        "",
        "```" + (LANG_BY_ID[entry.id] ?? "ts"),
        entry.source.trimEnd(),
        "```",
        "",
      ]),
      ...buildPropsTable(apiReference),
    ].join("\n");

  const aiPrompt = `I'm looking at the ${title} component from Canvas UI: ${docsUrl}. Help me add it to my project and adjust it to my use case. Install command: ${buildInstallCommand(managerId, installItem, frameworkId)}`;

  const copyText = async (id: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedId(id);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setCopiedId(null);
      setOpen(false);
    }, 900);
  };

  const items: {
    id: string;
    label: string;
    icon: IconComponent;
    action: { copy: () => string } | { open: string };
  }[] = [
    {
      id: "prompt",
      label: "Copy prompt",
      icon: Sparkles,
      action: { copy: buildPrompt },
    },
    {
      id: "configured",
      label: "Copy configured code",
      icon: SquareCode as IconComponent,
      action: {
        copy: () =>
          configuredCode() ??
          `import { ${title.replaceAll(" ", "")} } from "@/components/canvasui/${title.replaceAll(" ", "")}";`,
      },
    },
    {
      id: "markdown",
      label: "Copy page as markdown",
      icon: FileText,
      action: { copy: buildPageMarkdown },
    },
    ...(demoSource
      ? [
          {
            id: "demo",
            label: "Copy demo source",
            icon: SquareCode as IconComponent,
            action: { copy: () => demoSource },
          },
        ]
      : []),
    {
      id: "chatgpt",
      label: "Open in ChatGPT",
      icon: OpenAiIcon,
      action: {
        open: `https://chatgpt.com/?q=${encodeURIComponent(aiPrompt)}`,
      },
    },
    {
      id: "v0",
      label: "Open in v0",
      icon: V0Icon,
      action: {
        open: `https://v0.dev/chat/api/open?url=${encodeURIComponent(`${SITE_URL}/r/${installItem}-react.json`)}`,
      },
    },
    {
      id: "claude",
      label: "Open in Claude",
      icon: ClaudeIcon,
      action: {
        open: `https://claude.ai/new?q=${encodeURIComponent(aiPrompt)}`,
      },
    },
  ];

  const handleSelect = (item: (typeof items)[number]) => {
    if ("copy" in item.action) {
      void copyText(item.id, item.action.copy());
    } else {
      window.open(item.action.open, "_blank", "noopener,noreferrer");
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border/70 px-3 text-[13px] text-muted-foreground transition-[color,transform] duration-150 ease-out hover:text-foreground active:scale-95 motion-reduce:transition-none"
      >
        Copy for AI
        <ChevronDown
          aria-hidden
          className={cn(
            "size-3.5 transition-transform duration-150 ease-out motion-reduce:transition-none",
            open && "rotate-180",
          )}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="menu"
            aria-label="Copy for AI"
            initial={
              shouldReduceMotion
                ? { opacity: 0 }
                : { opacity: 0, y: -4, scale: 0.98 }
            }
            animate={
              shouldReduceMotion
                ? { opacity: 1 }
                : { opacity: 1, y: 0, scale: 1 }
            }
            exit={
              shouldReduceMotion
                ? { opacity: 0 }
                : { opacity: 0, y: -4, scale: 0.98 }
            }
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute right-0 top-full z-40 mt-2 w-56 origin-top-right rounded-xl border border-border/70 bg-background p-1 shadow-lg"
          >
            {items.map((item) => {
              const copied = "copy" in item.action && copiedId === item.id;
              const Icon = copied ? Check : item.icon;
              return (
                <button
                  key={item.id}
                  role="menuitem"
                  type="button"
                  onClick={() => { handleSelect(item); play('bloom'); }}
                  className="flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] text-muted-foreground transition-colors duration-100 hover:bg-muted/60 hover:text-foreground"
                >
                  <Icon aria-hidden className="size-4 shrink-0" />
                  {copied ? "Copied" : item.label}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
