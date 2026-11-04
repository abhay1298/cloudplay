export type ConversionStatus =
  | "waiting"
  | "validating"
  | "resolving_source"
  | "downloading"
  | "uploading"
  | "verifying"
  | "generating_share_link"
  | "completed"
  | "failed"
  | "unsupported";

export const TERMINAL_STATUSES: ConversionStatus[] = ["completed", "failed", "unsupported"];

export type ConversionMode = "automatic" | "manual";

export interface ConversionStep {
  status: ConversionStatus;
  at: string;
  detail: string;
}

export interface VerificationReport {
  sizeMatch: boolean | null;
  checksumMatch: boolean | null;
  sourceSha256: string | null;
  destinationChecksum: string | null;
  /** Human-readable notes, including what could NOT be verified. */
  notes: string[];
}

export interface ConversionRecord {
  id: string;
  mode: ConversionMode;
  status: ConversionStatus;
  sourceUrl: string;
  resultUrl: string | null;
  fileName: string | null;
  fileSizeBytes: number | null;
  /** 0..1 progress of the current byte-transfer phase, null when not measurable. */
  progress: number | null;
  error: string | null;
  verification: VerificationReport | null;
  steps: ConversionStep[];
  createdAt: string;
  updatedAt: string;
}
