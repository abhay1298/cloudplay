export type ProviderId = "diskwala" | "terabox" | "direct";

export type LinkType =
  | "share" // a provider sharing page (e.g. /s/1xxxx)
  | "app" // provider app deep link page
  | "direct-media" // a URL that points at a media file or HLS manifest
  | "unknown";

/** Result of identifying which provider a URL belongs to. */
export interface ProviderMatch {
  provider: ProviderId;
  linkType: LinkType;
  /** Provider-specific identifier extracted from the URL (share id, surl, file id). */
  shareId: string | null;
  /** The normalized original URL (never rewritten to another domain). */
  normalizedUrl: string;
  hostname: string;
}

export type CapabilityStatus = "supported" | "unsupported" | "requires-credentials" | "unverified";

export interface Capability {
  status: CapabilityStatus;
  reason: string;
}

export interface ProviderCapabilities {
  provider: ProviderId;
  displayName: string;
  inAppPlayback: Capability;
  officialApi: Capability;
  download: Capability;
  upload: Capability;
  shareLinkCreation: Capability;
  externalOpen: Capability;
}
