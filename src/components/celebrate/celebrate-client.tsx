"use client";

import { Pipette } from "@/components/icons";
import { AnimatePresence } from "motion/react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { ColorPopover } from "@/components/demos/color-picker";
import { REPO } from "@/lib/github";
import {
  PRESETS,
  fetchStars,
  hexToRgb,
  parseRepo,
  repoSlug,
  type RepoRef,
} from "@/lib/celebrate";

import {
  downloadBlob,
  extensionFor,
  pickMimeType,
  recordCanvas,
} from "./record";
import { RUN_MS, StarStage, type StarStageHandle } from "./star-stage";

const emptySubscribe = () => () => {};

const PILL =
  "inline-flex h-10 shrink-0 cursor-pointer items-center justify-center rounded-full px-5 text-sm font-medium transition-[opacity,transform,background-color] duration-150 ease-out active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50";

export function CelebrateClient() {
  const stageRef = useRef<StarStageHandle>(null);

  const [input, setInput] = useState(REPO);
  const [repo, setRepo] = useState<RepoRef>(() => parseRepo(REPO)!);
  const [hex, setHex] = useState(PRESETS[0].hex);

  const [data, setData] = useState<{ slug: string; stars: number } | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const customRef = useRef<HTMLButtonElement>(null);
  const pickerId = useId();

  const mimeType = useSyncExternalStore(
    emptySubscribe,
    pickMimeType,
    () => null,
  );

  const slug = repoSlug(repo);
  const stars = data?.slug === slug ? data.stars : 0;
  const loading = data?.slug !== slug && !error;

  useEffect(() => {
    let cancelled = false;
    fetchStars(repo).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setData({ slug: repoSlug(repo), stars: result.stars });
        setError(null);
        stageRef.current?.restart();
      } else {
        setError(result.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [repo]);

  const load = () => {
    const parsed = parseRepo(input);
    if (!parsed) {
      setError("Enter a GitHub URL or owner/repo.");
      return;
    }
    setError(null);
    if (repoSlug(parsed) === slug) {
      stageRef.current?.restart();
      return;
    }
    setRepo(parsed);
  };

  const exportVideo = async () => {
    const stage = stageRef.current;
    const canvas = stage?.getOutputCanvas();
    if (!stage || !canvas || !mimeType) return;

    setExporting(true);
    setError(null);
    stage.restart();
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve)),
    );

    try {
      const blob = await recordCanvas(canvas, mimeType, RUN_MS);
      downloadBlob(
        blob,
        `${repo.owner}-${repo.name}-stars.${extensionFor(mimeType)}`,
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  };

  const isPreset = PRESETS.some(
    (preset) => preset.hex.toLowerCase() === hex.toLowerCase(),
  );
  const [r, g, b] = hexToRgb(hex);
  const onColor = (r * 299 + g * 587 + b * 114) / 1000 > 140 ? "#000" : "#fff";

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-5 pt-28 pb-24 sm:px-8 sm:pt-36">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-medium tracking-tight">
          Use Canvas UI to celebrate open source
        </h1>
        <p className="max-w-xl text-sm text-muted-foreground">
          Paste a GitHub repository and get a short animated video of its star
          count, rendered live with Blaze and FlameWrap. Nothing is uploaded.
          The video is recorded in your browser.
        </p>
      </header>

      <div className="aspect-[16/9] w-full overflow-hidden rounded-xl border border-border">
        <StarStage ref={stageRef} stars={stars} slug={slug} hex={hex} />
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="flex min-w-[280px] flex-1 items-center gap-2">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") load();
            }}
            placeholder="owner/repo or https://github.com/owner/repo"
            aria-label="GitHub repository"
            className="h-10 w-full min-w-0 max-w-sm rounded-full border border-border bg-transparent px-4 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring"
          />
          <button
            type="button"
            onClick={load}
            disabled={loading || exporting}
            className={`${PILL} border border-border text-foreground hover:bg-muted`}
          >
            {loading ? "Loading…" : "Load"}
          </button>
        </div>

        <div className="flex items-center gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              onClick={() => setHex(preset.hex)}
              aria-label={preset.label}
              aria-pressed={hex === preset.hex}
              className={`size-6 cursor-pointer rounded-full transition-transform duration-150 hover:scale-110 ${
                hex === preset.hex
                  ? "ring-2 ring-foreground ring-offset-2 ring-offset-background"
                  : ""
              }`}
              style={{ background: preset.hex }}
            />
          ))}
          <button
            ref={customRef}
            type="button"
            onClick={() => setPickerOpen((open) => !open)}
            aria-label="Custom colour"
            aria-haspopup="dialog"
            aria-expanded={pickerOpen}
            aria-pressed={!isPreset}
            title="Custom colour"
            className={`grid size-6 cursor-pointer place-items-center rounded-full border border-border text-muted-foreground transition-transform duration-150 hover:scale-110 ${
              isPreset
                ? "bg-muted"
                : "ring-2 ring-foreground ring-offset-2 ring-offset-background"
            }`}
            style={isPreset ? undefined : { background: hex, color: onColor }}
          >
            <Pipette className="size-3" />
          </button>
          <AnimatePresence>
            {pickerOpen && (
              <ColorPopover
                id={pickerId}
                anchorRef={customRef}
                value={hex}
                onValueChange={setHex}
                onClose={() => setPickerOpen(false)}
              />
            )}
          </AnimatePresence>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={() => stageRef.current?.restart()}
            disabled={exporting}
            className={`${PILL} border border-border text-foreground hover:bg-muted`}
          >
            Replay
          </button>
          <button
            type="button"
            onClick={exportVideo}
            disabled={exporting || loading || !mimeType}
            className={`${PILL} bg-foreground text-background hover:opacity-85`}
          >
            {exporting
              ? `Recording ${Math.round(RUN_MS / 1000)}s…`
              : `Export ${mimeType ? extensionFor(mimeType).toUpperCase() : "video"}`}
          </button>
        </div>
      </div>

      {error ? (
        <p role="status" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {!mimeType ? (
        <p className="text-xs text-muted-foreground">
          Video export isn&apos;t supported in this browser.
        </p>
      ) : null}
    </div>
  );
}
