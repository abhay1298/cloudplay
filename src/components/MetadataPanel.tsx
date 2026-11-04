import type { VideoMetadata } from "@/types/video";
import type { ProviderId } from "@/types/provider";
import { NOT_AVAILABLE, formatBytes, formatDuration } from "@/lib/format";
import { ProviderBadge } from "./ui";

export function MetadataPanel({ provider, originalUrl, meta }: { provider: ProviderId; originalUrl?: string; meta: VideoMetadata }) {
  const rows: Array<[string, string]> = [
    ["Title", meta.title ?? NOT_AVAILABLE],
    ["File name", meta.fileName ?? NOT_AVAILABLE],
    ["Duration", formatDuration(meta.durationSeconds)],
    ["Resolution", meta.width && meta.height ? `${meta.width} × ${meta.height}` : NOT_AVAILABLE],
    ["Format", meta.format ?? NOT_AVAILABLE],
    ["File size", formatBytes(meta.fileSizeBytes)],
    ["Subtitles", meta.subtitles?.length ? meta.subtitles.join(", ") : NOT_AVAILABLE],
  ];
  return (
    <section className="card p-5" aria-labelledby="meta-heading">
      <div className="flex items-center justify-between gap-2">
        <h2 id="meta-heading" className="font-semibold">
          Video information
        </h2>
        <ProviderBadge provider={provider} />
      </div>
      <dl className="mt-4 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted">{k}</dt>
            <dd className={`min-w-0 break-words ${v === NOT_AVAILABLE ? "text-muted/70 italic" : ""}`}>{v}</dd>
          </div>
        ))}
        {originalUrl && (
          <div className="contents">
            <dt className="text-muted">Source</dt>
            <dd className="min-w-0 truncate">
              <a href={originalUrl} target="_blank" rel="noopener noreferrer nofollow" className="text-accent hover:underline" title={originalUrl}>
                {originalUrl}
              </a>
            </dd>
          </div>
        )}
      </dl>
      {meta.thumbnail === undefined && <p className="mt-4 text-xs text-muted">Thumbnail: {NOT_AVAILABLE}</p>}
    </section>
  );
}
