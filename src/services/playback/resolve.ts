import type { PlaybackResolution, VideoMetadata } from "@/types/video";
import type { ProviderMatch } from "@/types/provider";
import {
  detectProvider,
  fileExtension,
  fileNameFromUrl,
  PLAYABLE_EXTENSIONS,
  UNPLAYABLE_EXTENSIONS,
  CAPABILITIES,
} from "@/services/providers/registry";
import { BlockedDestinationError, safeRequest, UpstreamTimeoutError, type SafeRequestOptions } from "@/lib/security";

const HLS_TYPES = ["application/vnd.apple.mpegurl", "application/x-mpegurl", "audio/mpegurl", "audio/x-mpegurl"];
const PLAYABLE_TYPES = ["video/mp4", "video/webm", "video/ogg", "video/quicktime", "video/x-m4v", "audio/mp4"];
const UNPLAYABLE_TYPES = ["video/x-matroska", "video/x-msvideo", "video/x-flv", "video/x-ms-wmv", "video/mp2t", "video/3gpp"];

function parseTotalSize(headers: Record<string, string | undefined>): number | undefined {
  const range = headers["content-range"];
  if (range) {
    const m = /\/(\d+)$/.exec(range);
    if (m) return Number(m[1]);
  }
  const len = headers["content-length"];
  return len && /^\d+$/.test(len) ? Number(len) : undefined;
}

function fileNameFromDisposition(cd: string | undefined): string | undefined {
  if (!cd) return undefined;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(cd);
  if (star) {
    try {
      return decodeURIComponent(star[1]).slice(0, 255);
    } catch {
      /* fall through */
    }
  }
  const plain = /filename="?([^";]+)"?/i.exec(cd);
  return plain ? plain[1].slice(0, 255) : undefined;
}

/** Parse resolutions from an HLS master playlist (only what the manifest actually declares). */
export function parseHlsVariants(manifest: string): Array<{ height: number; width: number; bandwidth?: number }> {
  if (!manifest.startsWith("#EXTM3U")) return [];
  const out: Array<{ height: number; width: number; bandwidth?: number }> = [];
  for (const line of manifest.split(/\r?\n/)) {
    if (!line.startsWith("#EXT-X-STREAM-INF:")) continue;
    const res = /RESOLUTION=(\d+)x(\d+)/.exec(line);
    const bw = /BANDWIDTH=(\d+)/.exec(line);
    if (res) out.push({ width: Number(res[1]), height: Number(res[2]), bandwidth: bw ? Number(bw[1]) : undefined });
  }
  return out;
}

function providerUnsupported(match: ProviderMatch): PlaybackResolution {
  const caps = CAPABILITIES[match.provider];
  if (match.linkType === "unknown") {
    return {
      ok: false,
      match,
      provider: match.provider,
      code: "UNSUPPORTED_FORMAT",
      message: `This is a ${caps.displayName} address, but not a recognized sharing-link format.`,
      externalUrl: match.normalizedUrl,
    };
  }
  return {
    ok: false,
    match,
    provider: match.provider,
    code: "UNSUPPORTED_PROVIDER_PLAYBACK",
    message: caps.inAppPlayback.reason,
    externalUrl: match.normalizedUrl,
  };
}

export async function resolvePlayback(
  input: unknown,
  requestOptions: Partial<SafeRequestOptions> = {},
): Promise<PlaybackResolution> {
  const detected = detectProvider(input);
  if (!detected.ok) {
    return {
      ok: false,
      match: null,
      code: detected.code === "INVALID_URL" ? "INVALID_URL" : "UNKNOWN_PROVIDER",
      message: detected.error,
    };
  }
  const { match } = detected;
  if (match.provider !== "direct") return providerUnsupported(match);

  const url = new URL(match.normalizedUrl);
  const ext = fileExtension(url);
  if (ext && (UNPLAYABLE_EXTENSIONS as readonly string[]).includes(ext)) {
    return {
      ok: false,
      match,
      provider: "direct",
      code: "UNSUPPORTED_FORMAT",
      message: `.${ext} files can't be played reliably in web browsers. Supported: MP4 (H.264/AAC), WebM, Ogg, MOV (H.264) and HLS (.m3u8).`,
      externalUrl: match.normalizedUrl,
    };
  }

  // Probe the URL server-side (SSRF-guarded) to confirm it really is media and collect metadata.
  let res;
  try {
    const isHlsByExt = ext === "m3u8";
    res = await safeRequest(match.normalizedUrl, {
      method: "GET",
      headers: isHlsByExt ? {} : { range: "bytes=0-0" },
      maxBodyBytes: isHlsByExt ? 256 * 1024 : 0,
      ...requestOptions,
    });
  } catch (err) {
    if (err instanceof BlockedDestinationError) {
      return { ok: false, match, provider: "direct", code: "BLOCKED_DESTINATION", message: err.message };
    }
    if (err instanceof UpstreamTimeoutError) {
      return { ok: false, match, provider: "direct", code: "TIMEOUT", message: err.message, externalUrl: match.normalizedUrl };
    }
    return {
      ok: false,
      match,
      provider: "direct",
      code: "UPSTREAM_ERROR",
      message: "Could not reach the media server.",
      externalUrl: match.normalizedUrl,
    };
  }

  if (res.status === 404 || res.status === 410) {
    return {
      ok: false, match, provider: "direct", code: res.status === 410 ? "EXPIRED" : "NOT_FOUND",
      message: res.status === 410 ? "This link has expired." : "The file was not found (HTTP 404). The link may be expired or wrong.",
      externalUrl: match.normalizedUrl,
    };
  }
  if (res.status === 401 || res.status === 403) {
    return {
      ok: false, match, provider: "direct", code: "ACCESS_DENIED",
      message: `The server refused access (HTTP ${res.status}). The file may be private or the signed link may have expired.`,
      externalUrl: match.normalizedUrl,
    };
  }
  if (res.status >= 400) {
    return { ok: false, match, provider: "direct", code: "UPSTREAM_ERROR", message: `The media server returned HTTP ${res.status}.`, externalUrl: match.normalizedUrl };
  }

  const contentType = (res.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
  const bodyText = res.body.toString("utf8", 0, Math.min(res.body.length, 256 * 1024));
  const isHls = HLS_TYPES.includes(contentType) || bodyText.startsWith("#EXTM3U");
  const metadata: VideoMetadata = {
    fileName: fileNameFromDisposition(res.headers["content-disposition"]) ?? fileNameFromUrl(url) ?? undefined,
    contentType: contentType || undefined,
  };
  metadata.title = metadata.fileName;

  if (isHls) {
    const variants = parseHlsVariants(bodyText);
    metadata.format = "HLS (m3u8)";
    if (variants.length) {
      const best = variants.reduce((a, b) => (b.height > a.height ? b : a));
      metadata.width = best.width;
      metadata.height = best.height;
    }
    return { ok: true, match, kind: "hls", src: match.normalizedUrl, metadata };
  }

  if (UNPLAYABLE_TYPES.includes(contentType)) {
    return {
      ok: false, match, provider: "direct", code: "UNSUPPORTED_FORMAT",
      message: `The server reports ${contentType}, which web browsers can't play reliably.`,
      externalUrl: match.normalizedUrl,
    };
  }
  const extOk = !!ext && (PLAYABLE_EXTENSIONS as readonly string[]).includes(ext);
  const typeOk = PLAYABLE_TYPES.includes(contentType);
  const generic = !contentType || contentType === "application/octet-stream" || contentType === "binary/octet-stream";
  if (!typeOk && !(generic && extOk)) {
    return {
      ok: false, match, provider: "direct", code: "NOT_MEDIA",
      message: contentType.startsWith("text/html")
        ? "This URL returns a web page, not a video file."
        : `This URL does not return a playable video (content type: ${contentType || "unknown"}).`,
      externalUrl: match.normalizedUrl,
    };
  }
  metadata.fileSizeBytes = parseTotalSize(res.headers);
  metadata.format = typeOk ? contentType : ext ? ext.toUpperCase() : undefined;
  return { ok: true, match, kind: "progressive", src: match.normalizedUrl, metadata };
}
