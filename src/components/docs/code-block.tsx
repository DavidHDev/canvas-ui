import { CopyButton } from "@/components/docs/copy-button";

export function CodeBlock({
  html,
  source,
  fileName,
}: {
  html?: string;
  source: string;
  fileName?: string;
}) {
  if (!html) {
    return (
      <div className="not-typeset frame">
        <div className="frame-inset flex items-center justify-between gap-3 overflow-hidden py-1.5 pr-1.5 pl-4">
          <code className="font-mono text-[13px] break-all whitespace-pre-wrap text-foreground/90">
            {source}
          </code>
          <CopyButton text={source} />
        </div>
      </div>
    );
  }

  return (
    <div className="not-typeset frame">
      <div className="frame-bar pl-3">
        <span className="text-[12px] text-muted-foreground">
          {fileName ?? ""}
        </span>
        <CopyButton text={source} />
      </div>
      <div
        className="docs-code frame-inset max-h-[480px] overflow-y-auto text-[13px] leading-6"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
