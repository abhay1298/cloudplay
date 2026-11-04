import type { ProviderId, ProviderMatch } from "./provider";

export type MediaKind = "progressive" | "hls";

export interface QualityOption {
  id: string;
  label: string;
  height?: number;
}

/** Metadata actually obtained from the source. Undefined fields render as "Not available". */
export interface VideoMetadata {
  title?: string;
  fileName?: string;
  thumbnail?: string;
  durationSeconds?: number;
  width?: number;
  height?: number;
  format?: string;
  contentType?: string;
  fileSizeBytes?: number;
  subtitles?: string[];
}

export type PlaybackErrorCode =
  | "INVALID_URL"
  | "UNKNOWN_PROVIDER"
  | "BLOCKED_DESTINATION"
  | "UNSUPPORTED_PROVIDER_PLAYBACK"
  | "UNSUPPORTED_FORMAT"
  | "NOT_MEDIA"
  | "NOT_FOUND"
  | "ACCESS_DENIED"
  | "EXPIRED"
  | "TIMEOUT"
  | "UPSTREAM_ERROR"
  | "RATE_LIMITED";

export type PlaybackResolution =
  | {
      ok: true;
      match: ProviderMatch;
      kind: MediaKind;
      /** URL the browser will load. For direct media this is the user's original URL. */
      src: string;
      metadata: VideoMetadata;
    }
  | {
      ok: false;
      match: ProviderMatch | null;
      code: PlaybackErrorCode;
      message: string;
      /** Original link the user can open in the provider's own interface. */
      externalUrl?: string;
      provider?: ProviderId;
    };

export interface LibraryItem {
  id: string;
  url: string;
  provider: ProviderId;
  title: string | null;
  thumbnail: string | null;
  durationSeconds: number | null;
  addedAt: string;
  lastWatchedAt: string | null;
  positionSeconds: number | null;
}

export interface WatchEntry {
  url: string;
  provider: ProviderId;
  title: string | null;
  positionSeconds: number;
  durationSeconds: number | null;
  updatedAt: string;
}
