import crypto from "node:crypto";
import type { ConversionRecord, VerificationReport } from "@/types/conversion";
import { detectProvider } from "@/services/providers/registry";

export interface ManualInput {
  sourceUrl: string;
  resultUrl: string;
  fileName?: string | null;
  fileSizeBytes?: number | null;
  originalSha256?: string | null;
  copySha256?: string | null;
  copySizeBytes?: number | null;
}

/**
 * Build a record for a transfer the USER performed through the official apps.
 * CloudPlay did not move any bytes; the record says so. Optional checksums are
 * computed in the user's browser from local files and compared here.
 */
export function buildManualRecord(input: ManualInput): { ok: true; record: ConversionRecord } | { ok: false; error: string } {
  const src = detectProvider(input.sourceUrl);
  if (!src.ok || src.match.provider !== "diskwala") return { ok: false, error: "Original link must be a Diskwala link." };
  const dst = detectProvider(input.resultUrl);
  if (!dst.ok || dst.match.provider !== "terabox" || dst.match.linkType !== "share") {
    return { ok: false, error: "Resulting link must be a TeraBox sharing link (e.g. https://www.terabox.com/s/1…)." };
  }

  const notes: string[] = ["Manual transfer: the file was moved by the user through Diskwala and TeraBox. CloudPlay did not transfer it."];
  let checksumMatch: boolean | null = null;
  let sizeMatch: boolean | null = null;
  if (input.originalSha256 && input.copySha256) {
    checksumMatch = input.originalSha256 === input.copySha256;
    notes.push(
      checksumMatch
        ? "SHA-256 of the original download matches the SHA-256 of the copy re-downloaded from TeraBox."
        : "SHA-256 MISMATCH: the copy re-downloaded from TeraBox differs from the original download.",
    );
  } else {
    notes.push("Checksums were not compared. Hash both the original and a copy re-downloaded from TeraBox to verify integrity.");
  }
  if (input.fileSizeBytes != null && input.copySizeBytes != null) sizeMatch = input.fileSizeBytes === input.copySizeBytes;

  const verification: VerificationReport = {
    sizeMatch,
    checksumMatch,
    sourceSha256: input.originalSha256 ?? null,
    destinationChecksum: input.copySha256 ? `sha256:${input.copySha256}` : null,
    notes,
  };
  const at = new Date().toISOString();
  return {
    ok: true,
    record: {
      id: crypto.randomUUID(),
      mode: "manual",
      status: "completed",
      sourceUrl: src.match.normalizedUrl,
      resultUrl: dst.match.normalizedUrl,
      fileName: input.fileName ?? null,
      fileSizeBytes: input.fileSizeBytes ?? null,
      progress: null,
      error: null,
      verification,
      steps: [{ status: "completed", at, detail: "Manual transfer recorded by the user." }],
      createdAt: at,
      updatedAt: at,
    },
  };
}
