"use client";

import { CopyButton } from "@/components/docs/copy-button";
import { ChoiceSelect } from "@/components/docs/choice-select";
import {
  RENDERERS,
  registrySuffix,
  resolveFramework,
  useRenderer,
  type RendererId,
} from "@/components/docs/renderer";
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
  { id: "vanilla", label: "Vanilla" },
] as const;

export const MANAGER_IDS = MANAGERS.map((manager) => manager.id);
export const FRAMEWORK_IDS = FRAMEWORKS.map((framework) => framework.id);

export function buildInstallCommand(
  managerId: string,
  item: string,
  frameworkId: string,
  renderer: RendererId = "webgl",
) {
  const manager = MANAGERS.find((m) => m.id === managerId) ?? MANAGERS[0];
  return `${manager.run} shadcn@latest add @canvas-ui/${item}-${frameworkId}${registrySuffix(renderer)}`;
}

export function InstallTabs({
  item,
  hasWebGPU = false,
}: {
  item: string;
  /** Whether this component ships a WebGPU (vgpu) build. */
  hasWebGPU?: boolean;
}) {
  const [managerId, setManagerId] = usePreference("pm", "npm", MANAGER_IDS);
  const [storedFramework, setFrameworkId] = usePreference(
    "framework",
    "react",
    FRAMEWORK_IDS,
  );
  const [renderer, setRenderer] = useRenderer(hasWebGPU);

  const manager = MANAGERS.find((m) => m.id === managerId) ?? MANAGERS[0];
  const frameworkId = resolveFramework(
    storedFramework,
    renderer,
  ) as (typeof FRAMEWORKS)[number]["id"];
  const frameworks = FRAMEWORKS;
  const fullCommand = buildInstallCommand(
    manager.id,
    item,
    frameworkId,
    renderer,
  );

  return (
    <div className="rounded-[calc(var(--radius)+0.25rem+1px)] border border-border/60 bg-background p-1">
      <div className="flex h-8 items-center justify-between gap-2">
        <ChoiceSelect
          label="Package manager"
          options={MANAGERS}
          value={manager.id}
          onValueChange={setManagerId}
        />
        <div className="flex min-w-0 items-center gap-1">
          {hasWebGPU ? (
            <ChoiceSelect
              label="Renderer"
              options={RENDERERS}
              value={renderer}
              onValueChange={setRenderer}
              align="end"
            />
          ) : null}
          <ChoiceSelect
            label="Framework"
            options={frameworks}
            value={frameworkId}
            onValueChange={setFrameworkId}
            align="end"
          />
        </div>
      </div>
      <div className="mt-1 flex items-center justify-between gap-3 overflow-hidden rounded-lg border border-dashed border-border/70 bg-muted/40 py-1.5 pr-1.5 pl-4">
        <code className="overflow-x-auto text-[13px] whitespace-nowrap text-foreground/90">
          {fullCommand}
        </code>
        <CopyButton text={fullCommand} />
      </div>
    </div>
  );
}

/** Contextual note under the install command, driven by the renderer choice. */
export function InstallNote({ hasWebGPU = false }: { hasWebGPU?: boolean }) {
  const [renderer] = useRenderer(hasWebGPU);
  if (renderer === "webgpu") {
    return (
      <p className="mt-2 text-[13px] text-muted-foreground">
        WebGPU build: same component, same props, rendered through{" "}
        <a
          href="https://vgpu.sh"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-4 hover:text-foreground"
        >
          vgpu
        </a>{" "}
        with WGSL shaders. Adds the <code>vgpu</code> dependency and needs a
        browser with WebGPU. Without it the component shows your content
        unchanged. Or copy the source below into your project.
      </p>
    );
  }
  return (
    <p className="mt-2 text-[13px] text-muted-foreground">
      Or copy the source below into your project.
      {hasWebGPU
        ? " Prefer WGSL? Switch the renderer above to the WebGPU build."
        : ""}
    </p>
  );
}
