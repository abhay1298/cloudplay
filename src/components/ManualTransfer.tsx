"use client";

import { CheckCircle2, ExternalLink, FileVideo, Fingerprint, Info, Loader2, Save, ShieldCheck, XCircle } from "lucide-react";
import { useMemo, useState } from "react";
import type { ConversionRecord } from "@/types/conversion";
import { api } from "@/lib/client";
import { formatBytes, formatDuration } from "@/lib/format";
import { detectProvider } from "@/services/providers/registry";
import { useFileInspector, type LocalFileFacts } from "./useFileInspector";
import { Button, linkButton } from "./ui";
import { CopyButton } from "./ConversionCard";

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <li className="relative pl-11">
      <span className="brand-gradient absolute top-0 left-0 grid size-7 place-items-center rounded-full text-xs font-bold text-white">{n}</span>
      <h3 className="font-semibold">{title}</h3>
      <div className="mt-1.5 text-sm text-muted">{children}</div>
    </li>
  );
}

function FileFingerprint({ label, onDone, facts }: { label: string; onDone: (f: LocalFileFacts) => void; facts: LocalFileFacts | null }) {
  const { inspect, cancel, progress, error } = useFileInspector();
  return (
    <div className="mt-3 rounded-xl border border-dashed border-line p-3">
      <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-fg">
        <FileVideo className="size-4 text-accent" />
        {label}
        <input
          type="file"
          className="sr-only"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (!f) return;
            const r = await inspect(f);
            if (r) onDone(r);
          }}
        />
      </label>
      <p className="mt-1 text-xs">Processed entirely in your browser. The file is never uploaded to CloudPlay.</p>
      {progress != null && (
        <div className="mt-2 flex items-center gap-2 text-xs">
          <Loader2 className="size-3.5 animate-spin" /> Hashing… {Math.floor(progress * 100)}%
          <button className="underline" onClick={cancel}>
            Cancel
          </button>
        </div>
      )}
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
      {facts && (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
          <dt>Name</dt>
          <dd className="truncate text-fg">{facts.name}</dd>
          <dt>Size</dt>
          <dd className="text-fg">
            {formatBytes(facts.sizeBytes)} ({facts.sizeBytes.toLocaleString()} bytes)
          </dd>
          <dt>Duration</dt>
          <dd className="text-fg">{formatDuration(facts.durationSeconds)}</dd>
          <dt>Resolution</dt>
          <dd className="text-fg">{facts.width && facts.height ? `${facts.width} × ${facts.height}` : "Not available"}</dd>
          <dt>SHA-256</dt>
          <dd className="font-mono break-all text-fg" data-testid="sha256">
            {facts.sha256}
          </dd>
        </dl>
      )}
    </div>
  );
}

export function ManualTransfer({ sourceUrl, reason, onSaved }: { sourceUrl: string; reason?: string | null; onSaved?: (r: ConversionRecord) => void }) {
  const [original, setOriginal] = useState<LocalFileFacts | null>(null);
  const [copy, setCopy] = useState<LocalFileFacts | null>(null);
  const [resultUrl, setResultUrl] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saved, setSaved] = useState<ConversionRecord | null>(null);

  const resultCheck = useMemo(() => {
    if (!resultUrl.trim()) return null;
    const d = detectProvider(resultUrl);
    if (!d.ok || d.match.provider !== "terabox" || d.match.linkType !== "share") return "This is not a TeraBox sharing link (expected e.g. https://www.terabox.com/s/1…).";
    return null;
  }, [resultUrl]);

  const match = original && copy ? original.sha256 === copy.sha256 && original.sizeBytes === copy.sizeBytes : null;

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const { record } = await api<{ record: ConversionRecord }>("/api/conversions/manual", {
        method: "POST",
        body: {
          sourceUrl,
          resultUrl: resultUrl.trim(),
          fileName: original?.name ?? null,
          fileSizeBytes: original?.sizeBytes ?? null,
          originalSha256: original?.sha256 ?? null,
          copySha256: copy?.sha256 ?? null,
          copySizeBytes: copy?.sizeBytes ?? null,
        },
      });
      setSaved(record);
      onSaved?.(record);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card p-5" aria-labelledby="manual-heading" data-testid="manual-transfer">
      <h2 id="manual-heading" className="text-lg font-semibold">
        Manual transfer
      </h2>
      <div className="mt-2 flex gap-2 rounded-xl bg-warning/10 p-3 text-sm">
        <Info className="mt-0.5 size-4 shrink-0 text-warning" />
        <p>
          <span className="font-semibold">Direct transfer is unavailable.</span>{" "}
          {reason ?? "Neither service exposes the official APIs needed to move the file automatically."} You can move it yourself with the
          official apps. CloudPlay helps you verify the file is unchanged and keeps a record. This is a manual transfer, not an automatic
          conversion.
        </p>
      </div>

      <ol className="mt-6 space-y-6">
        <Step n={1} title="Get the original file from Diskwala">
          Open the link in Diskwala. Download it only if Diskwala and the uploader allow it, and only if you have the rights to copy it. Download the
          original file; don&apos;t screen-record or re-encode it.
          <div className="mt-2">
            <a href={sourceUrl} target="_blank" rel="noopener noreferrer nofollow" className={linkButton.secondary}>
              <ExternalLink className="size-4" /> Open in Diskwala
            </a>
          </div>
        </Step>

        <Step n={2} title="Fingerprint the original (optional, recommended)">
          Records its exact size and SHA-256 checksum so you can prove the uploaded copy is identical.
          <FileFingerprint label="Select the downloaded original…" facts={original} onDone={setOriginal} />
        </Step>

        <Step n={3} title="Upload the unmodified file to TeraBox">
          Upload with the official TeraBox website or app, then create a share link there. Don&apos;t compress or convert the file.
          <div className="mt-2">
            <a href="https://www.terabox.com/" target="_blank" rel="noopener noreferrer" className={linkButton.secondary}>
              <ExternalLink className="size-4" /> Open TeraBox
            </a>
          </div>
        </Step>

        <Step n={4} title="Verify the stored copy (optional)">
          Download the file back from TeraBox and select it here. Matching SHA-256 checksums prove the bytes are identical.
          <FileFingerprint label="Select the copy downloaded from TeraBox…" facts={copy} onDone={setCopy} />
          {match !== null && (
            <p className={`mt-2 flex items-center gap-1.5 text-sm font-semibold ${match ? "text-success" : "text-danger"}`} data-testid="verify-result">
              {match ? <CheckCircle2 className="size-4" /> : <XCircle className="size-4" />}
              {match ? "Identical: size and SHA-256 match." : "Mismatch: the files differ."}
            </p>
          )}
          {!original && copy && <p className="mt-2 text-xs">Fingerprint the original in step 2 to compare.</p>}
        </Step>

        <Step n={5} title="Save the TeraBox share link">
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              type="url"
              value={resultUrl}
              onChange={(e) => setResultUrl(e.target.value)}
              placeholder="https://www.terabox.com/s/1…"
              aria-label="TeraBox share link"
              aria-invalid={resultCheck ? true : undefined}
              className="h-10 shrink-0 rounded-xl border border-line bg-surface px-3 text-sm text-fg sm:flex-1 focus:border-accent focus:outline-none"
            />
            <Button onClick={save} disabled={!resultUrl.trim() || !!resultCheck || saving || !!saved}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Save to history
            </Button>
          </div>
          {resultCheck && <p className="mt-1.5 text-xs text-danger">{resultCheck}</p>}
          {saveError && <p className="mt-1.5 text-xs text-danger">{saveError}</p>}
          {saved?.resultUrl && (
            <div className="mt-3 rounded-xl bg-success/10 p-3 text-sm text-fg">
              <p className="flex items-center gap-1.5 font-semibold">
                <ShieldCheck className="size-4 text-success" /> Saved as a manual transfer
                {saved.verification?.checksumMatch ? " (checksum verified)" : ""}.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <CopyButton text={saved.resultUrl} />
                <a href={saved.resultUrl} target="_blank" rel="noopener noreferrer nofollow" className={linkButton.secondary}>
                  <ExternalLink className="size-4" /> Open
                </a>
              </div>
            </div>
          )}
        </Step>
      </ol>
      <p className="mt-6 flex items-center gap-1.5 text-xs text-muted">
        <Fingerprint className="size-3.5" /> Checksums are computed locally with SHA-256. Only the hex digest is saved.
      </p>
    </section>
  );
}
