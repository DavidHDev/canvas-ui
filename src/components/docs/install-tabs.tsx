"use client";

import { CopyButton } from "@/components/docs/copy-button";
import { ChoiceSelect } from "@/components/docs/choice-select";
import { usePreference } from "@/hooks/use-preference";

const MANAGERS = [
  { id: "npm", label: "npm", run: "npx" },
  { id: "pnpm", label: "pnpm", run: "pnpm dlx" },
  { id: "yarn", label: "yarn", run: "yarn dlx" },
  { id: "bun", label: "bun", run: "bunx --bun" },
] as const;

const FRAMEWORKS = [
  { id: "react", label: "React" },
  { id: "vue", label: "Vue" },
  { id: "svelte", label: "Svelte" },
  { id: "solid", label: "Solid" },
  { id: "preact", label: "Preact" },
  { id: "angular", label: "Angular" },
  { id: "vanilla", label: "Vanilla" },
] as const;

export const MANAGER_IDS = MANAGERS.map((manager) => manager.id);
export const FRAMEWORK_IDS = FRAMEWORKS.map((framework) => framework.id);

export function buildInstallCommand(
  managerId: string,
  item: string,
  frameworkId: string,
) {
  const manager = MANAGERS.find((m) => m.id === managerId) ?? MANAGERS[0];
  return `${manager.run} shadcn@latest add @canvas-ui/${item}-${frameworkId}`;
}

export function InstallTabs({ item }: { item: string }) {
  const [managerId, setManagerId] = usePreference("pm", "npm", MANAGER_IDS);
  const [frameworkId, setFrameworkId] = usePreference(
    "framework",
    "react",
    FRAMEWORK_IDS,
  );

  const manager = MANAGERS.find((m) => m.id === managerId) ?? MANAGERS[0];
  const fullCommand = buildInstallCommand(manager.id, item, frameworkId);

  return (
    <div className="overflow-hidden rounded-xl border border-border/60">
      <div className="flex items-center justify-between gap-2 border-b border-border/60 bg-muted/40 px-2">
        <ChoiceSelect
          label="Package manager"
          variant="tabs"
          options={MANAGERS}
          value={manager.id}
          onValueChange={setManagerId}
        />
        <ChoiceSelect
          label="Framework"
          options={FRAMEWORKS}
          value={frameworkId}
          onValueChange={setFrameworkId}
          align="end"
        />
      </div>
      <div className="flex items-center justify-between gap-3 py-1.5 pr-1.5 pl-4">
        <code className="overflow-x-auto text-[13px] whitespace-nowrap text-foreground/90">
          {fullCommand}
        </code>
        <CopyButton text={fullCommand} />
      </div>
    </div>
  );
}
