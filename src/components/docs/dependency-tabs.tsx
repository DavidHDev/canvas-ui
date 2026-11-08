"use client";

import { ChoiceSelect } from "@/components/docs/choice-select";
import { CopyButton } from "@/components/docs/copy-button";
import { useRenderer } from "@/components/docs/renderer";
import { usePreference } from "@/hooks/use-preference";

const MANAGERS = [
  { id: "npm", label: "npm", install: "npm install", dev: "npm install -D" },
  { id: "pnpm", label: "pnpm", install: "pnpm add", dev: "pnpm add -D" },
  { id: "yarn", label: "yarn", install: "yarn add", dev: "yarn add -D" },
  { id: "bun", label: "bun", install: "bun add", dev: "bun add -d" },
] as const;

const MANAGER_IDS = MANAGERS.map((manager) => manager.id);

export function DependencyTabs({
  dependencies: webglDependencies,
  devDependencies: webglDevDependencies,
  webgpuDependencies,
  webgpuDevDependencies,
}: {
  dependencies: string[];
  devDependencies: string[];
  /** Dependencies of the WebGPU build; omit when the component has none. */
  webgpuDependencies?: string[];
  webgpuDevDependencies?: string[];
}) {
  const [managerId, setManagerId] = usePreference("pm", "npm", MANAGER_IDS);
  const manager = MANAGERS.find((m) => m.id === managerId) ?? MANAGERS[0];
  const [renderer] = useRenderer(webgpuDependencies !== undefined);
  const dependencies =
    renderer === "webgpu" ? (webgpuDependencies ?? []) : webglDependencies;
  const devDependencies =
    renderer === "webgpu"
      ? (webgpuDevDependencies ?? [])
      : webglDevDependencies;

  const commands: string[] = [];
  if (dependencies.length > 0) {
    commands.push(`${manager.install} ${dependencies.join(" ")}`);
  }
  if (devDependencies.length > 0) {
    commands.push(`${manager.dev} ${devDependencies.join(" ")}`);
  }
  if (commands.length === 0) {
    commands.push("# No dependencies for the WebGL build.");
  }

  return (
    <div className="rounded-[calc(var(--radius)+0.25rem+1px)] border border-border/60 bg-background p-1">
      <div className="flex h-8 items-center">
        <ChoiceSelect
          label="Package manager"
          options={MANAGERS}
          value={manager.id}
          onValueChange={setManagerId}
        />
      </div>
      <div className="mt-1 flex items-center justify-between gap-3 overflow-hidden rounded-lg border border-dashed border-border/70 bg-muted/40 py-1.5 pr-1.5 pl-4">
        <code className="overflow-x-auto text-[13px] whitespace-pre text-foreground/90">
          {commands.join("\n")}
        </code>
        <CopyButton text={commands.join("\n")} />
      </div>
    </div>
  );
}
