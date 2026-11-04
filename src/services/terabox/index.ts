import type { ProviderCapabilities, ProviderMatch } from "@/types/provider";
import { canonicalHostname, hostMatches } from "@/lib/validation";

/**
 * TeraBox integration.
 *
 * RESEARCH RESULT (see TECHNICAL_FEASIBILITY.md):
 *  - An official "TeraBox Open Platform" exists (https://www.terabox.com/integrations/docs)
 *    with device-code OAuth (/oauth/gettoken, /oauth/tokeninfo) and user-authorized file
 *    APIs under /openapi/api/ (precreate, create, list, filemetas, download, streaming).
 *  - Access requires applying for an Open Platform app and approval.
 *  - No documented endpoint was found for (a) creating public share links, or
 *    (b) playing / resolving a *third party's* share link.
 *  - The full parameter reference could not be retrieved from this build environment,
 *    so no Open Platform calls are implemented. They would be guesses.
 *
 * Therefore this module recognizes TeraBox share links and offers "Open in TeraBox".
 */

/** terabox.com is the official domain (hosts the official docs). */
export const TERABOX_OFFICIAL_DOMAINS = ["terabox.com"] as const;

/**
 * Additional share-link domains observed in redirects and in several independent
 * third-party sources (urlscan redirect chain 1024terabox.com -> terabox.app; Netify;
 * public link lists). Recognized for identification only; never fetched by the server.
 */
export const TERABOX_SHARE_DOMAINS = [
  "terabox.com",
  "terabox.app",
  "1024terabox.com",
  "teraboxapp.com",
  "1024tera.com",
  "nephobox.com",
  "4funbox.com",
  "mirrobox.com",
] as const;

const SHORT_SHARE = /^\/s\/([A-Za-z0-9_-]{4,128})\/?$/;
const LONG_SHARE_PATHS = ["/sharing/link", "/wap/share/filelist", "/sharing/init"];
const SURL = /^[A-Za-z0-9_-]{4,128}$/;

export function matchTerabox(url: URL): ProviderMatch | null {
  const host = canonicalHostname(url);
  if (!hostMatches(host, TERABOX_SHARE_DOMAINS)) return null;
  const base = { provider: "terabox" as const, normalizedUrl: url.toString(), hostname: host };

  const short = SHORT_SHARE.exec(url.pathname);
  if (short) return { ...base, linkType: "share", shareId: short[1] };

  const path = url.pathname.replace(/\/$/, "");
  if (LONG_SHARE_PATHS.includes(path)) {
    const surl = url.searchParams.get("surl");
    if (surl && SURL.test(surl)) {
      // In ?surl= form the share id is shown without the leading "1" of the /s/1... form.
      return { ...base, linkType: "share", shareId: surl };
    }
  }
  return { ...base, linkType: "unknown", shareId: null };
}

export function isTeraboxShareLink(url: URL): boolean {
  const m = matchTerabox(url);
  return !!m && m.linkType === "share";
}

export const TERABOX_CAPABILITIES: ProviderCapabilities = {
  provider: "terabox",
  displayName: "TeraBox",
  inAppPlayback: {
    status: "unsupported",
    reason:
      "TeraBox's official Open Platform covers files in the authorized user's own account. It does not document resolving or streaming other people's share links. Share links open in TeraBox.",
  },
  officialApi: {
    status: "requires-credentials",
    reason:
      "TeraBox Open Platform exists but needs an approved app (client_id) and user OAuth. Parameter-level docs could not be verified from this environment, so it is not integrated yet.",
  },
  download: {
    status: "unverified",
    reason: "A user-authorized download endpoint is documented for own files only. Not integrated.",
  },
  upload: {
    status: "unverified",
    reason:
      "Documented upload flow: precreate -> superfile2 -> create, with per-chunk MD5 block_list. Not integrated because the full parameters are unverified.",
  },
  shareLinkCreation: {
    status: "unsupported",
    reason: "No share-link creation endpoint could be found in the official Open Platform documentation.",
  },
  externalOpen: { status: "supported", reason: "The original link can always be opened in TeraBox." },
};
