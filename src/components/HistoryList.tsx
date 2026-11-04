"use client";

import { ArrowRight, ExternalLink, Hand, Trash2, Zap } from "lucide-react";
import type { ConversionRecord } from "@/types/conversion";
import { formatBytes, formatDate, NOT_AVAILABLE } from "@/lib/format";
import { CopyButton, StatusBadge } from "./ConversionCard";
import { Button, linkButton } from "./ui";

export function HistoryList({ items, onDelete }: { items: ConversionRecord[]; onDelete?: (id: string) => void }) {
  return (
    <ul className="space-y-3">
      {items.map((r) => (
        <li key={r.id} className="card p-4" data-testid="history-item">
          <div className="flex flex-wrap items-center gap-2">
            {r.mode === "manual" ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] font-semibold text-sky-400">
                <Hand className="size-3" /> Manual transfer
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-violet-500/15 px-2 py-0.5 text-[11px] font-semibold text-violet-400">
                <Zap className="size-3" /> Automatic attempt
              </span>
            )}
            <StatusBadge status={r.status} />
            {r.verification?.checksumMatch === true && (
              <span className="rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-semibold text-success">SHA-256 verified</span>
            )}
            {r.verification?.checksumMatch === false && (
              <span className="rounded-full bg-danger/15 px-2 py-0.5 text-[11px] font-semibold text-danger">Checksum mismatch</span>
            )}
            <span className="ml-auto text-xs text-muted">{formatDate(r.createdAt)}</span>
          </div>
          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-[1fr_auto_1fr] sm:items-center">
            <div className="min-w-0">
              <p className="text-xs text-muted">Original (Diskwala)</p>
              <p className="truncate" title={r.sourceUrl}>
                {r.sourceUrl}
              </p>
            </div>
            <ArrowRight className="hidden size-4 text-muted sm:block" aria-hidden />
            <div className="min-w-0">
              <p className="text-xs text-muted">Result (TeraBox)</p>
              <p className={`truncate ${r.resultUrl ? "" : "text-muted/70 italic"}`} title={r.resultUrl ?? undefined}>
                {r.resultUrl ?? (r.status === "completed" ? NOT_AVAILABLE : "No link generated")}
              </p>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted">
            File: {r.fileName ?? NOT_AVAILABLE} · Size: {formatBytes(r.fileSizeBytes)}
            {r.error ? ` · ${r.error}` : ""}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {r.resultUrl && <CopyButton text={r.resultUrl} />}
            {r.resultUrl && (
              <a href={r.resultUrl} target="_blank" rel="noopener noreferrer nofollow" className={linkButton.secondary}>
                <ExternalLink className="size-4" /> Open link
              </a>
            )}
            {onDelete && (
              <Button variant="danger" onClick={() => onDelete(r.id)} aria-label="Delete entry">
                <Trash2 className="size-4" /> Delete
              </Button>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}
