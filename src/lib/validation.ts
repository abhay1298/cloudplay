import { z } from "zod";

export const MAX_URL_LENGTH = 2048;

export type UrlValidationResult =
  | { ok: true; url: URL }
  | { ok: false; error: string };

/**
 * Syntactic validation of a user-supplied URL. This does NOT make the URL safe to
 * fetch from the server — see lib/security.ts for network-level checks.
 */
export function parseUserUrl(input: unknown): UrlValidationResult {
  if (typeof input !== "string") return { ok: false, error: "A URL is required." };
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: "A URL is required." };
  if (trimmed.length > MAX_URL_LENGTH) {
    return { ok: false, error: `URL is longer than ${MAX_URL_LENGTH} characters.` };
  }
  // Reject whitespace / control characters inside the URL (header-injection & spoofing vectors).
  // eslint-disable-next-line no-control-regex
  if (/[\s\u0000-\u001f\u007f]/.test(trimmed)) {
    return { ok: false, error: "URL contains whitespace or control characters." };
  }
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, error: "This is not a valid URL. Include https:// at the start." };
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return { ok: false, error: "Only http:// and https:// links are supported." };
  }
  if (url.username || url.password) {
    return { ok: false, error: "URLs containing embedded credentials are not accepted." };
  }
  if (!url.hostname) return { ok: false, error: "URL has no hostname." };
  return { ok: true, url };
}

/** Lower-cased hostname with any trailing dot removed ("Example.COM." -> "example.com"). */
export function canonicalHostname(url: URL): string {
  return url.hostname.toLowerCase().replace(/\.$/, "");
}

/** True when `hostname` equals one of `domains` or is a subdomain of one. */
export function hostMatches(hostname: string, domains: readonly string[]): boolean {
  return domains.some((d) => hostname === d || hostname.endsWith(`.${d}`));
}

/** Strip characters that have no place in a display string (control chars), and clamp length. */
export function sanitizeText(input: unknown, maxLength = 300): string | null {
  if (typeof input !== "string") return null;
  // eslint-disable-next-line no-control-regex
  const cleaned = input.replace(/[\u0000-\u001f\u007f]/g, "").trim();
  if (!cleaned) return null;
  return cleaned.slice(0, maxLength);
}

export const urlSchema = z.string().min(1).max(MAX_URL_LENGTH);

export const SHA256_HEX = /^[a-f0-9]{64}$/;
