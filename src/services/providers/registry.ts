import type { ProviderCapabilities, ProviderId, ProviderMatch } from "@/types/provider";
import { canonicalHostname, hostMatches, parseUserUrl } from "@/lib/validation";
import { DISKWALA_CAPABILITIES, DISKWALA_LOOKALIKES, matchDiskwala } from "@/services/diskwala";
import { TERABOX_CAPABILITIES, matchTerabox } from "@/services/terabox";

/** File extensions browsers can generally play natively or via hls.js. */
export const PLAYABLE_EXTENSIONS = ["mp4", "m4v", "webm", "ogv", "ogg", "mov", "m3u8"] as const;
/** Containers that browsers generally cannot play; reported as unsupported formats. */
export const UNPLAYABLE_EXTENSIONS = ["mkv", "avi", "flv", "wmv", "mpg", "mpeg", "3gp", "ts", "rmvb"] as const;

export function fileExtension(url: URL): string | null {
  const last = url.pathname.split("/").pop() ?? "";
  const dot = last.lastIndexOf(".");
  if (dot <= 0 || dot === last.length - 1) return null;
  return last.slice(dot + 1).toLowerCase();
}

export function fileNameFromUrl(url: URL): string | null {
  const last = url.pathname.split("/").pop();
  if (!last) return null;
  try {
    return decodeURIComponent(last).slice(0, 255) || null;
  } catch {
    return last.slice(0, 255);
  }
}

export type DetectResult =
  | { ok: true; match: ProviderMatch }
  | { ok: false; error: string; code: "INVALID_URL" | "UNKNOWN_PROVIDER" | "LOOKALIKE_DOMAIN" };

/**
 * Identify the provider for a user-submitted URL.
 * Provider links are matched against explicit domain allowlists. Anything else is a
 * candidate "direct" media URL only if its path has a media file extension.
 */
export function detectProvider(input: unknown): DetectResult {
  const parsed = parseUserUrl(input);
  if (!parsed.ok) return { ok: false, error: parsed.error, code: "INVALID_URL" };
  const url = parsed.url;
  const host = canonicalHostname(url);

  if (hostMatches(host, DISKWALA_LOOKALIKES)) {
    return {
      ok: false,
      code: "LOOKALIKE_DOMAIN",
      error: `${host} is a third-party site, not Diskwala. CloudPlay only accepts links on diskwala.com.`,
    };
  }

  const match = matchDiskwala(url) ?? matchTerabox(url);
  if (match) return { ok: true, match };

  const ext = fileExtension(url);
  if (ext && ([...PLAYABLE_EXTENSIONS, ...UNPLAYABLE_EXTENSIONS] as string[]).includes(ext)) {
    return {
      ok: true,
      match: { provider: "direct", linkType: "direct-media", shareId: null, normalizedUrl: url.toString(), hostname: host },
    };
  }
  return {
    ok: false,
    code: "UNKNOWN_PROVIDER",
    error:
      "This link isn't from Diskwala or TeraBox, and it doesn't look like a direct video file (.mp4, .webm, .m3u8 …).",
  };
}

export const DIRECT_CAPABILITIES: ProviderCapabilities = {
  provider: "direct",
  displayName: "Direct file",
  inAppPlayback: { status: "supported", reason: "Browser-supported formats (MP4/H.264, WebM, Ogg) and HLS via hls.js." },
  officialApi: { status: "supported", reason: "Plain HTTPS. No provider API involved." },
  download: { status: "supported", reason: "The browser streams the file directly from its host." },
  upload: { status: "unsupported", reason: "Not applicable." },
  shareLinkCreation: { status: "unsupported", reason: "Not applicable." },
  externalOpen: { status: "supported", reason: "Opens the original URL." },
};

export const CAPABILITIES: Record<ProviderId, ProviderCapabilities> = {
  diskwala: DISKWALA_CAPABILITIES,
  terabox: TERABOX_CAPABILITIES,
  direct: DIRECT_CAPABILITIES,
};

export function providerName(id: ProviderId): string {
  return CAPABILITIES[id].displayName;
}
