"use client";

import { CopyButton } from "@/components/docs/copy-button";
import { ChoiceSelect } from "@/components/docs/choice-select";
import {
  RENDERERS,
  resolveFramework,
  useRenderer,
} from "@/components/docs/renderer";
import { usePreference } from "@/hooks/use-preference";

export interface CodeVariant {
  id: string;
  label: string;
  fileName: string;
  source: string;
  html: string;
}

export function CodeTabs({
  variants,
  webgpuVariants = [],
}: {
  variants: CodeVariant[];
  webgpuVariants?: CodeVariant[];
}) {
  const hasWebGPU = webgpuVariants.length > 0;
  const [renderer, setRenderer] = useRenderer(hasWebGPU);
  const list = renderer === "webgpu" ? webgpuVariants : variants;
  const [storedId, setActiveId] = usePreference(
    "framework",
    variants[0]?.id ?? "react",
    variants.map((variant) => variant.id),
  );
  const activeId = resolveFramework(storedId, renderer);
  const active = list.find((v) => v.id === activeId) ?? list[0];

  if (!active) return null;

  return (
    <div className="frame">
      <div className="frame-bar">
        <div className="flex min-w-0 items-center gap-1">
          {hasWebGPU ? (
            <ChoiceSelect
              label="Renderer"
              options={RENDERERS}
              value={renderer}
              onValueChange={setRenderer}
            />
          ) : null}
          <ChoiceSelect
            label="Framework"
            options={list}
            value={active.id}
            onValueChange={setActiveId}
          />
        </div>
        <CopyButton text={active.source} />
      </div>
      <div className="frame-inset overflow-hidden">
        <div className="flex items-center justify-between px-4 pt-3 pb-1">
          <span className="text-[12px] text-muted-foreground">
            {active.fileName}
          </span>
          <span className="text-[12px] text-muted-foreground">
            {renderer === "webgpu" ? "WebGPU · WGSL" : "WebGL · GLSL"}
          </span>
        </div>
        <div
          key={`${renderer}-${active.id}`}
          className="docs-code framework-snippet-enter max-h-[480px] overflow-y-auto text-[13px] leading-6"
          dangerouslySetInnerHTML={{ __html: active.html }}
        />
      </div>
    </div>
  );
}
