"use client";

import Link from "next/link";
import { ExternalLink, Film, Play, Trash2 } from "lucide-react";
import type { ProviderId } from "@/types/provider";
import { formatDuration, formatRelative, NOT_AVAILABLE } from "@/lib/format";
import { ProviderBadge } from "./ui";

export interface VideoCardData {
  url: string;
  provider: ProviderId;
  title: string | null;
  thumbnail?: string | null;
  durationSeconds: number | null;
  positionSeconds?: number | null;
  subtitle?: string;
  when?: string | null;
}

export function VideoCard({ v, onRemove }: { v: VideoCardData; onRemove?: () => void }) {
  const playable = v.provider === "direct";
  const href = `/player?url=${encodeURIComponent(v.url)}`;
  const progress = v.positionSeconds && v.durationSeconds ? Math.min(100, (v.positionSeconds / v.durationSeconds) * 100) : 0;
  let host = "";
  try {
    host = new URL(v.url).hostname;
  } catch {
    /* ignore */
  }
  return (
    <article className="card group overflow-hidden transition hover:-translate-y-0.5 hover:border-accent/40" data-testid="video-card">
      <Link href={href} className="relative block aspect-video bg-surface-2" aria-label={`Open ${v.title ?? v.url}`}>
        {v.thumbnail ? (
          // Thumbnails only ever come from the provider; never generated placeholders presented as real.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={v.thumbnail} alt="" className="size-full object-cover" referrerPolicy="no-referrer" loading="lazy" />
        ) : (
          <div className="hero-glow grid size-full place-items-center">
            <Film className="size-9 text-muted/60" aria-hidden />
            <span className="sr-only">Thumbnail {NOT_AVAILABLE}</span>
          </div>
        )}
        <span className="absolute top-2 left-2">
          <ProviderBadge provider={v.provider} />
        </span>
        {v.durationSeconds ? (
          <span className="absolute right-2 bottom-2 rounded bg-black/75 px-1.5 py-0.5 text-[11px] font-medium text-white tabular-nums">
            {formatDuration(v.durationSeconds)}
          </span>
        ) : null}
        <span className="absolute inset-0 grid place-items-center opacity-0 transition group-hover:opacity-100">
          <span className="brand-gradient grid size-12 place-items-center rounded-full shadow-xl">
            {playable ? <Play className="ml-0.5 size-5 fill-white text-white" /> : <ExternalLink className="size-5 text-white" />}
          </span>
        </span>
        {progress > 0 && (
          <span className="absolute inset-x-0 bottom-0 h-1 bg-white/20">
            <span className="brand-gradient block h-full" style={{ width: `${progress}%` }} />
          </span>
        )}
      </Link>
      <div className="flex items-start gap-2 p-3">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold" title={v.title ?? v.url}>
            {v.title ?? host ?? v.url}
          </h3>
          <p className="mt-0.5 truncate text-xs text-muted">
            {v.subtitle ?? host}
            {v.when ? ` · ${formatRelative(v.when)}` : ""}
          </p>
        </div>
        {onRemove && (
          <button onClick={onRemove} className="rounded-lg p-1.5 text-muted hover:bg-danger/15 hover:text-danger" aria-label={`Remove ${v.title ?? "video"}`}>
            <Trash2 className="size-4" />
          </button>
        )}
      </div>
    </article>
  );
}
