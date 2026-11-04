"use client";

import { ArrowRightLeft, BookmarkCheck, BookmarkPlus, FolderOpen, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PlaybackResolution, VideoMetadata, WatchEntry } from "@/types/video";
import type { AppSettings } from "@/lib/database";
import { api } from "@/lib/client";
import { LinkInput } from "@/components/LinkInput";
import { VideoPlayer, type MediaFacts } from "@/components/VideoPlayer";
import { MetadataPanel } from "@/components/MetadataPanel";
import { ErrorMessage } from "@/components/ErrorMessage";
import { VideoCard } from "@/components/VideoCard";
import { Button, PageHeader, linkButton } from "@/components/ui";
import { CAPABILITIES } from "@/services/providers/registry";

type Loaded =
  | { state: "idle" }
  | { state: "resolving"; url: string }
  | { state: "error"; res: Extract<PlaybackResolution, { ok: false }> }
  | { state: "ready"; src: string; kind: "progressive" | "hls"; originalUrl?: string; meta: VideoMetadata; local: boolean; startAt?: number };

const SETTINGS_FALLBACK: AppSettings = { theme: "dark", defaultSpeed: 1, autoplay: false, resumePlayback: true, saveWatchHistory: true };

export function PlayerView() {
  const params = useSearchParams();
  const router = useRouter();
  const url = params.get("url");
  const [loaded, setLoaded] = useState<Loaded>({ state: "idle" });
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [facts, setFacts] = useState<MediaFacts>({});
  const [saved, setSaved] = useState(false);
  const [recent, setRecent] = useState<WatchEntry[]>([]);
  const objectUrl = useRef<string | null>(null);

  useEffect(() => {
    api<{ settings: AppSettings }>("/api/settings")
      .then((r) => setSettings(r.settings))
      .catch(() => setSettings(SETTINGS_FALLBACK));
    api<{ items: WatchEntry[] }>("/api/watch")
      .then((r) => setRecent(r.items))
      .catch(() => undefined);
  }, []);

  const resolve = useCallback(
    async (target: string) => {
      setLoaded({ state: "resolving", url: target });
      setFacts({});
      setSaved(false);
      try {
        const res = await api<PlaybackResolution>("/api/resolve", { method: "POST", body: { url: target } });
        if (!res.ok) {
          setLoaded({ state: "error", res });
          return;
        }
        let startAt: number | undefined;
        if (settings?.resumePlayback !== false) {
          const w = await api<{ entry: WatchEntry | null }>(`/api/watch?url=${encodeURIComponent(res.src)}`).catch(() => ({ entry: null }));
          startAt = w.entry?.positionSeconds;
        }
        setLoaded({ state: "ready", src: res.src, kind: res.kind, originalUrl: res.match.normalizedUrl, meta: res.metadata, local: false, startAt });
      } catch (e) {
        setLoaded({
          state: "error",
          res: { ok: false, match: null, code: "UPSTREAM_ERROR", message: e instanceof Error ? e.message : "Could not resolve the link." },
        });
      }
    },
    [settings?.resumePlayback],
  );

  useEffect(() => {
    if (!settings) return;
    if (url) void resolve(url);
    else if (!objectUrl.current) setLoaded({ state: "idle" });
  }, [url, settings, resolve]);

  useEffect(() => () => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
  }, []);

  const playLocal = (file: File) => {
    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    objectUrl.current = URL.createObjectURL(file);
    if (url) router.replace("/player");
    setFacts({});
    setLoaded({
      state: "ready",
      src: objectUrl.current,
      kind: "progressive",
      local: true,
      meta: { title: file.name, fileName: file.name, fileSizeBytes: file.size, format: file.type || undefined, contentType: file.type || undefined },
    });
  };

  const onProgress = useCallback(
    (pos: number, dur: number | null) => {
      if (loaded.state !== "ready" || loaded.local || !loaded.originalUrl || settings?.saveWatchHistory === false) return;
      void api("/api/watch", {
        method: "POST",
        keepalive: true,
        body: { url: loaded.originalUrl, positionSeconds: pos, durationSeconds: dur, title: loaded.meta.title ?? null },
      }).catch(() => undefined);
    },
    [loaded, settings?.saveWatchHistory],
  );

  const saveToLibrary = async (target: string, title?: string | null, durationSeconds?: number | null) => {
    await api("/api/library", { method: "POST", body: { url: target, title: title ?? null, durationSeconds: durationSeconds ?? null } });
    setSaved(true);
  };

  const meta: VideoMetadata | null =
    loaded.state === "ready"
      ? {
          ...loaded.meta,
          durationSeconds: facts.durationSeconds ?? loaded.meta.durationSeconds,
          width: facts.width ?? loaded.meta.width,
          height: facts.height ?? loaded.meta.height,
        }
      : null;

  return (
    <div>
      <PageHeader title="Universal Player" subtitle="Plays direct video links (MP4, WebM, Ogg, HLS) and files on your device. Diskwala and TeraBox links open in their own apps." />
      <div className="mb-6">
        <LinkInput key={url ?? "none"} initial={url ?? ""} actions={["play"]} onPlay={(u) => router.push(`/player?url=${encodeURIComponent(u)}`)} />
        <label className="mt-1 inline-flex cursor-pointer items-center gap-2 text-sm text-muted hover:text-fg">
          <FolderOpen className="size-4" /> Or play a video file from this device
          <input
            type="file"
            accept="video/*,audio/*,.mkv,.mov,.m4v"
            className="sr-only"
            data-testid="local-file-input"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) playLocal(f);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      {loaded.state === "resolving" && (
        <div className="grid aspect-video place-items-center rounded-2xl bg-surface ring-1 ring-line" role="status">
          <span className="flex items-center gap-2 text-muted">
            <Loader2 className="size-5 animate-spin" /> Checking link…
          </span>
        </div>
      )}

      {loaded.state === "error" && (
        <div className="space-y-4">
          <ErrorMessage
            title={loaded.res.code === "UNSUPPORTED_PROVIDER_PLAYBACK" ? `In-app playback isn't available for ${loaded.res.provider ? CAPABILITIES[loaded.res.provider].displayName : "this provider"}` : "This link can't be played"}
            message={loaded.res.message}
            externalUrl={loaded.res.externalUrl}
            externalLabel={loaded.res.provider && loaded.res.provider !== "direct" ? `Open in ${CAPABILITIES[loaded.res.provider].displayName}` : "Open original link"}
            onRetry={url && ["TIMEOUT", "UPSTREAM_ERROR"].includes(loaded.res.code) ? () => resolve(url) : undefined}
          >
            {loaded.res.provider === "diskwala" && loaded.res.externalUrl && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Link href={`/convert?url=${encodeURIComponent(loaded.res.externalUrl)}`} className={linkButton.secondary}>
                  <ArrowRightLeft className="size-4" /> Transfer to TeraBox
                </Link>
              </div>
            )}
          </ErrorMessage>
          {loaded.res.match && loaded.res.provider && loaded.res.provider !== "direct" && (
            <Button variant="secondary" disabled={saved} onClick={() => saveToLibrary(loaded.res.match!.normalizedUrl)}>
              {saved ? <BookmarkCheck className="size-4" /> : <BookmarkPlus className="size-4" />} {saved ? "Saved to library" : "Save link to library"}
            </Button>
          )}
        </div>
      )}

      {loaded.state === "ready" && settings && meta && (
        <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
          <div className="min-w-0">
            <VideoPlayer
              key={loaded.src}
              src={loaded.src}
              kind={loaded.kind}
              title={meta.title}
              startAt={loaded.startAt}
              defaultSpeed={settings.defaultSpeed}
              autoplay={settings.autoplay}
              onProgress={onProgress}
              onMetadata={setFacts}
            />
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <h2 className="min-w-0 flex-1 truncate text-lg font-semibold" title={meta.title}>
                {meta.title ?? "Untitled video"}
              </h2>
              {!loaded.local && loaded.originalUrl && (
                <Button variant="secondary" disabled={saved} onClick={() => saveToLibrary(loaded.originalUrl!, meta.title, meta.durationSeconds)}>
                  {saved ? <BookmarkCheck className="size-4" /> : <BookmarkPlus className="size-4" />} {saved ? "Saved" : "Save to library"}
                </Button>
              )}
            </div>
            {loaded.local && <p className="mt-1 text-xs text-muted">Local file: played from your device and never uploaded. Progress isn&apos;t saved for local files.</p>}
            <p className="mt-3 hidden text-xs text-muted sm:block">
              Shortcuts: <kbd>Space</kbd>/<kbd>K</kbd> play · <kbd>J</kbd>/<kbd>L</kbd> ±10s · <kbd>←</kbd>/<kbd>→</kbd> ±5s · <kbd>↑</kbd>/<kbd>↓</kbd> volume ·{" "}
              <kbd>M</kbd> mute · <kbd>F</kbd> fullscreen · <kbd>P</kbd> picture-in-picture · <kbd>C</kbd> subtitles · <kbd>&lt;</kbd>/<kbd>&gt;</kbd> speed ·{" "}
              <kbd>0-9</kbd> jump
            </p>
          </div>
          <MetadataPanel provider="direct" originalUrl={loaded.local ? undefined : loaded.originalUrl} meta={meta} />
        </div>
      )}

      {loaded.state === "idle" && (
        <div className="grid aspect-video max-h-[420px] w-full place-items-center rounded-2xl bg-surface ring-1 ring-line">
          <p className="px-6 text-center text-sm text-muted">Paste a link above or choose a file to start playing.</p>
        </div>
      )}

      {recent.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 text-lg font-semibold">Recently watched</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {recent.slice(0, 8).map((w) => (
              <VideoCard key={w.url} v={{ ...w, when: w.updatedAt }} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
