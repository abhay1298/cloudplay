"use client";

import { CheckCircle2, CircleDashed, Copy, ExternalLink, Loader2, Ban, XCircle } from "lucide-react";
import { useState } from "react";
import type { ConversionRecord, ConversionStatus } from "@/types/conversion";
import { formatBytes, formatDate, NOT_AVAILABLE } from "@/lib/format";
import { Button, linkButton } from "./ui";

export const STATUS_LABEL: Record<ConversionStatus, string> = {
  waiting: "Waiting",
  validating: "Validating",
  resolving_source: "Resolving source",
  downloading: "Downloading",
  uploading: "Uploading",
  verifying: "Verifying",
  generating_share_link: "Generating share link",
  completed: "Completed",
  failed: "Failed",
  unsupported: "Unsupported",
};

const PIPELINE: ConversionStatus[] = [
  "validating",
  "resolving_source",
  "downloading",
  "uploading",
  "verifying",
  "generating_share_link",
  "completed",
];

export function StatusBadge({ status }: { status: ConversionStatus }) {
  const cls =
    status === "completed"
      ? "bg-success/15 text-success"
      : status === "failed"
        ? "bg-danger/15 text-danger"
        : status === "unsupported"
          ? "bg-warning/15 text-warning"
          : "bg-accent/15 text-accent";
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${cls}`}>{STATUS_LABEL[status]}</span>;
}

export function CopyButton({ text, label = "Copy link" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard blocked */
        }
      }}
    >
      <Copy className="size-4" aria-hidden /> {copied ? "Copied!" : label}
    </Button>
  );
}

export function ConversionCard({ rec }: { rec: ConversionRecord }) {
  const reached = new Set(rec.steps.map((s) => s.status));
  const terminal = rec.status === "completed" || rec.status === "failed" || rec.status === "unsupported";
  const pct = rec.progress != null ? Math.floor(rec.progress * 100) : null;

  return (
    <section className="card p-5" aria-live="polite" data-testid="conversion-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-semibold">Transfer status</h2>
        <StatusBadge status={rec.status} />
      </div>

      <ol className="mt-5 space-y-3">
        {PIPELINE.map((s) => {
          const step = [...rec.steps].reverse().find((x) => x.status === s);
          const isCurrent = rec.status === s && !terminal;
          const done = reached.has(s) && !isCurrent;
          const stoppedHere = terminal && rec.status !== "completed" && rec.steps.at(-2)?.status === s;
          return (
            <li key={s} className="flex gap-3">
              <span className="mt-0.5">
                {isCurrent ? (
                  <Loader2 className="size-5 animate-spin text-accent" aria-label="in progress" />
                ) : stoppedHere ? (
                  rec.status === "failed" ? <XCircle className="size-5 text-danger" aria-label="failed" /> : <Ban className="size-5 text-warning" aria-label="stopped" />
                ) : done ? (
                  <CheckCircle2 className="size-5 text-success" aria-label="done" />
                ) : (
                  <CircleDashed className="size-5 text-muted/50" aria-label="not reached" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-medium ${reached.has(s) ? "" : "text-muted/60"}`}>{STATUS_LABEL[s]}</p>
                {step && <p className="text-xs text-muted">{step.detail}</p>}
                {isCurrent && (s === "downloading" || s === "uploading") && (
                  <div className="mt-2">
                    {pct != null ? (
                      <div className="h-2 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                        <div className="brand-gradient h-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    ) : (
                      <p className="text-xs text-muted">Size unknown. Progress can't be measured.</p>
                    )}
                  </div>
                )}
              </div>
            </li>
          );
        })}
      </ol>

      {(rec.status === "failed" || rec.status === "unsupported") && rec.error && (
        <div className={`mt-5 rounded-xl p-4 text-sm ${rec.status === "failed" ? "bg-danger/10" : "bg-warning/10"}`}>
          <p className="font-semibold">{rec.status === "failed" ? "Transfer failed" : "Automatic transfer unavailable"}</p>
          <p className="mt-1 text-muted">{rec.error}</p>
        </div>
      )}

      <dl className="mt-5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-muted">Original link</dt>
        <dd className="truncate">{rec.sourceUrl}</dd>
        <dt className="text-muted">File name</dt>
        <dd>{rec.fileName ?? NOT_AVAILABLE}</dd>
        <dt className="text-muted">File size</dt>
        <dd>{formatBytes(rec.fileSizeBytes)}</dd>
        <dt className="text-muted">Started</dt>
        <dd>{formatDate(rec.createdAt)}</dd>
      </dl>

      {rec.verification && (
        <div className="mt-4 rounded-xl bg-surface-2 p-3 text-xs text-muted">
          <p className="mb-1 font-semibold text-fg">Verification</p>
          <ul className="list-disc space-y-0.5 pl-4">
            {rec.verification.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </div>
      )}

      {rec.status === "completed" && rec.resultUrl && (
        <div className="mt-5 flex flex-wrap gap-2">
          <CopyButton text={rec.resultUrl} />
          <a href={rec.resultUrl} target="_blank" rel="noopener noreferrer nofollow" className={linkButton.secondary}>
            <ExternalLink className="size-4" /> Open TeraBox link
          </a>
        </div>
      )}
    </section>
  );
}
