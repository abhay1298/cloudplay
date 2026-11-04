import type { ProviderCapabilities, ProviderMatch } from "@/types/provider";
import { canonicalHostname, hostMatches } from "@/lib/validation";

/**
 * Diskwala integration.
 *
 * RESEARCH RESULT (see TECHNICAL_FEASIBILITY.md): no official public API, embed
 * mechanism, or authorized download/export endpoint for Diskwala could be verified.
 * This module therefore only *recognizes* Diskwala links. It never fetches Diskwala
 * pages and never attempts to extract media URLs.
 */
export const DISKWALA_DOMAINS = ["diskwala.com"] as const;

/** Look-alike domains seen in research that are NOT Diskwala and must not be treated as such. */
export const DISKWALA_LOOKALIKES = ["diskwaala.com", "playdiskwala.in"] as const;

// Reported by third-party pages (unverified by official docs): https://www.diskwala.com/app/<FILE_ID>
const APP_PATH = /^\/app\/([A-Za-z0-9_-]{4,128})\/?$/;

export function matchDiskwala(url: URL): ProviderMatch | null {
  const host = canonicalHostname(url);
  if (!hostMatches(host, DISKWALA_DOMAINS)) return null;
  const m = APP_PATH.exec(url.pathname);
  return {
    provider: "diskwala",
    linkType: m ? "app" : "unknown",
    shareId: m ? m[1] : null,
    normalizedUrl: url.toString(),
    hostname: host,
  };
}

export const DISKWALA_CAPABILITIES: ProviderCapabilities = {
  provider: "diskwala",
  displayName: "Diskwala",
  inAppPlayback: {
    status: "unsupported",
    reason:
      "Diskwala does not publish an API or embed mechanism for playing shared videos in third-party apps. Shared content is opened in the Diskwala app or website.",
  },
  officialApi: {
    status: "unsupported",
    reason: "No official public developer API could be found or verified.",
  },
  download: {
    status: "unsupported",
    reason:
      "No documented download/export API. Whether a viewer can download a file depends on the Diskwala app and the uploader; CloudPlay cannot do it on your behalf.",
  },
  upload: { status: "unsupported", reason: "No documented upload API." },
  shareLinkCreation: { status: "unsupported", reason: "No documented API." },
  externalOpen: { status: "supported", reason: "The original link can always be opened in Diskwala." },
};
