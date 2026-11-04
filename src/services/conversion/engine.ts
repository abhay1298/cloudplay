import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import type { ConversionRecord, ConversionStatus, VerificationReport } from "@/types/conversion";
import type { DestinationAdapter, SourceAdapter } from "./adapters";

export const DEFAULT_MAX_TRANSFER_BYTES = 4 * 1024 ** 3; // 4 GiB

export interface EngineOptions {
  source: SourceAdapter;
  destination: DestinationAdapter;
  /** Called after every state change / progress update (persist, notify). */
  onUpdate: (rec: ConversionRecord) => void;
  maxBytes?: number;
  tmpRoot?: string;
  signal?: AbortSignal;
}

function ts() {
  return new Date().toISOString();
}

/** Create a new record in the "waiting" state. */
export function newConversionRecord(sourceUrl: string, mode: ConversionRecord["mode"] = "automatic"): ConversionRecord {
  const at = ts();
  return {
    id: crypto.randomUUID(),
    mode,
    status: "waiting",
    sourceUrl,
    resultUrl: null,
    fileName: null,
    fileSizeBytes: null,
    progress: null,
    error: null,
    verification: null,
    steps: [{ status: "waiting", at, detail: "Queued." }],
    createdAt: at,
    updatedAt: at,
  };
}

/** Make a file name safe for the local temp directory (never used as a remote path). */
export function safeTempName(name: string): string {
  const base = path.basename(name).replace(/[^A-Za-z0-9._ -]/g, "_").replace(/^\.+/, "_");
  return (base || "file").slice(0, 200);
}

/**
 * Real transfer pipeline. Every status corresponds to an actual operation:
 *   validating -> resolving_source -> downloading -> uploading -> verifying -> generating_share_link -> completed
 * The original bytes are streamed to a private temp file unmodified (no transcoding),
 * hashed (SHA-256 + MD5) on the way, uploaded, verified against what the destination
 * reports, and the temp directory is always removed.
 */
export async function runConversion(rec: ConversionRecord, opts: EngineOptions): Promise<ConversionRecord> {
  const { source, destination, onUpdate } = opts;
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_TRANSFER_BYTES;
  const controller = new AbortController();
  opts.signal?.addEventListener("abort", () => controller.abort(opts.signal?.reason));
  const signal = controller.signal;

  const set = (status: ConversionStatus, detail: string, extra: Partial<ConversionRecord> = {}) => {
    Object.assign(rec, extra, { status, updatedAt: ts() });
    rec.steps = [...rec.steps, { status, at: rec.updatedAt, detail }];
    onUpdate({ ...rec });
  };
  let lastEmit = 0;
  const progress = (p: number | null) => {
    rec.progress = p;
    const t = Date.now();
    if (t - lastEmit > 250) {
      lastEmit = t;
      rec.updatedAt = ts();
      onUpdate({ ...rec });
    }
  };

  let tmpDir: string | null = null;
  try {
    set("validating", "Validating the source link.");

    set("resolving_source", `Asking ${source.name} for the original file.`);
    const inspection = await source.inspect(rec.sourceUrl, signal);
    if (!inspection.supported) {
      set("unsupported", inspection.reason, { error: inspection.reason, progress: null });
      return rec;
    }
    if (inspection.sizeBytes !== undefined && inspection.sizeBytes > maxBytes) {
      throw new Error(`File is larger than the transfer size limit (${maxBytes} bytes).`);
    }
    rec.fileName = inspection.fileName;
    rec.fileSizeBytes = inspection.sizeBytes ?? null;

    const ready = destination.readiness();
    if (!ready.ready) {
      set("unsupported", ready.reason, { error: ready.reason });
      return rec;
    }

    // ---- downloading -------------------------------------------------------
    set("downloading", `Downloading "${inspection.fileName}" from ${source.name} (unmodified).`, { progress: 0 });
    tmpDir = await fsp.mkdtemp(path.join(opts.tmpRoot ?? os.tmpdir(), "cloudplay-"));
    await fsp.chmod(tmpDir, 0o700);
    const tmpFile = path.join(tmpDir, safeTempName(inspection.fileName));
    const dl = await source.download(rec.sourceUrl, signal);
    const expected = dl.sizeBytes ?? inspection.sizeBytes;
    const sha = crypto.createHash("sha256");
    const md5 = crypto.createHash("md5");
    let received = 0;
    const out = fs.createWriteStream(tmpFile, { mode: 0o600 });
    try {
      for await (const chunk of dl.body) {
        if (signal.aborted) throw new Error("Transfer cancelled.");
        received += chunk.length;
        if (received > maxBytes) throw new Error("Download exceeded the transfer size limit.");
        sha.update(chunk);
        md5.update(chunk);
        if (!out.write(chunk)) await new Promise<void>((r) => out.once("drain", () => r()));
        progress(expected ? Math.min(received / expected, 0.999) : null);
      }
    } finally {
      await new Promise<void>((resolve, reject) => {
        out.once("error", reject);
        out.end(() => resolve());
      });
    }
    if (expected !== undefined && received !== expected) {
      throw new Error(`Download incomplete: received ${received} of ${expected} bytes.`);
    }
    const sourceSha256 = sha.digest("hex");
    const sourceMd5 = md5.digest("hex");
    rec.fileSizeBytes = received;

    // ---- uploading ---------------------------------------------------------
    set("uploading", `Uploading to ${destination.name}.`, { progress: 0 });
    const uploaded = await destination.upload(
      tmpFile,
      { fileName: inspection.fileName, sizeBytes: received, sha256: sourceSha256, md5: sourceMd5 },
      (sent) => progress(received ? Math.min(sent / received, 0.999) : null),
      signal,
    );

    // ---- verifying ---------------------------------------------------------
    set("verifying", `Comparing the stored file on ${destination.name} with the original.`, { progress: null });
    const remote = await destination.stat(uploaded.remoteId, signal);
    const remoteSize = remote.sizeBytes ?? uploaded.remoteSizeBytes;
    const remoteSum = remote.checksum ?? uploaded.remoteChecksum;
    const report: VerificationReport = {
      sizeMatch: remoteSize === undefined ? null : remoteSize === received,
      checksumMatch: null,
      sourceSha256,
      destinationChecksum: remoteSum ? `${remoteSum.algorithm}:${remoteSum.value}` : null,
      notes: [],
    };
    if (remoteSize === undefined) report.notes.push(`${destination.name} did not report a file size, so size could not be verified.`);
    if (remoteSum) {
      const local = remoteSum.algorithm === "sha256" ? sourceSha256 : sourceMd5;
      report.checksumMatch = remoteSum.value.toLowerCase() === local;
      if (remoteSum.algorithm === "md5") report.notes.push("Destination reports MD5 only; compared against the MD5 of the downloaded original.");
    } else {
      report.notes.push(`${destination.name} did not report a checksum, so byte-level integrity could not be verified.`);
    }
    rec.verification = report;
    if (report.sizeMatch === false || report.checksumMatch === false) {
      throw new Error("Verification failed: the stored file does not match the original.");
    }

    // ---- share link --------------------------------------------------------
    set("generating_share_link", `Requesting a share link from ${destination.name}.`);
    const shareUrl = await destination.createShareLink(uploaded.remoteId, signal);
    set("completed", "Transfer complete.", { resultUrl: shareUrl, progress: 1 });
    return rec;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    set("failed", message, { error: message, progress: null });
    return rec;
  } finally {
    if (tmpDir) await fsp.rm(tmpDir, { recursive: true, force: true }).catch(() => undefined);
  }
}
