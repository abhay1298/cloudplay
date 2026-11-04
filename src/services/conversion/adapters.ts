/**
 * Adapter contracts for the transfer engine. A real integration must implement these
 * against an OFFICIAL, documented API. No adapter may report success it did not achieve.
 */
export type SourceInspection =
  | { supported: true; fileName: string; sizeBytes?: number; contentType?: string }
  | { supported: false; reason: string };

export interface SourceDownload {
  body: AsyncIterable<Uint8Array>;
  sizeBytes?: number;
}

export interface SourceAdapter {
  readonly name: string;
  inspect(url: string, signal: AbortSignal): Promise<SourceInspection>;
  download(url: string, signal: AbortSignal): Promise<SourceDownload>;
}

export type DestinationReadiness =
  | { ready: true }
  | { ready: false; reason: string; kind: "unsupported" | "missing_credentials" };

export interface UploadMeta {
  fileName: string;
  sizeBytes: number;
  sha256: string;
  md5: string;
}

export interface UploadResult {
  remoteId: string;
  /** Size reported back by the destination, if it reports one. */
  remoteSizeBytes?: number;
  /** Checksum reported back by the destination, if any. */
  remoteChecksum?: { algorithm: "sha256" | "md5"; value: string };
}

export interface DestinationAdapter {
  readonly name: string;
  readiness(): DestinationReadiness;
  upload(
    filePath: string,
    meta: UploadMeta,
    onProgress: (sentBytes: number) => void,
    signal: AbortSignal,
  ): Promise<UploadResult>;
  /** Re-read the stored file's metadata from the destination for verification. */
  stat(remoteId: string, signal: AbortSignal): Promise<{ sizeBytes?: number; checksum?: UploadResult["remoteChecksum"] }>;
  createShareLink(remoteId: string, signal: AbortSignal): Promise<string>;
}

// ---------------------------------------------------------------------------
// Production adapters (honest: they report what is not supported)
// ---------------------------------------------------------------------------

export class DiskwalaSourceAdapter implements SourceAdapter {
  readonly name = "Diskwala";
  async inspect(): Promise<SourceInspection> {
    return {
      supported: false,
      reason:
        "Diskwala provides no official API or authorized download mechanism, so CloudPlay can't retrieve the original file automatically.",
    };
  }
  async download(): Promise<SourceDownload> {
    throw new Error("Diskwala download is not supported (no official API).");
  }
}

export class TeraBoxDestinationAdapter implements DestinationAdapter {
  readonly name = "TeraBox";
  readiness(): DestinationReadiness {
    if (!process.env.TERABOX_CLIENT_ID || !process.env.TERABOX_CLIENT_SECRET) {
      return {
        ready: false,
        kind: "missing_credentials",
        reason:
          "TeraBox Open Platform credentials (TERABOX_CLIENT_ID / TERABOX_CLIENT_SECRET) are not configured. Even with credentials, upload and share-link creation are not yet integrated (see TECHNICAL_FEASIBILITY.md).",
      };
    }
    return {
      ready: false,
      kind: "unsupported",
      reason:
        "TeraBox credentials are configured, but the upload adapter is not implemented. The full Open Platform parameter reference could not be verified, and the docs don't include a share-link creation endpoint.",
    };
  }
  async upload(): Promise<UploadResult> {
    throw new Error("TeraBox upload adapter is not implemented.");
  }
  async stat(): Promise<never> {
    throw new Error("TeraBox upload adapter is not implemented.");
  }
  async createShareLink(): Promise<string> {
    throw new Error("TeraBox share-link creation is not documented.");
  }
}
