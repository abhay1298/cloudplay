/**
 * Optional single-password login (APP_PASSWORD).
 * Edge-compatible (Web Crypto only) so it can run in middleware.
 *
 * The session cookie holds HMAC-SHA256(APP_PASSWORD, "cloudplay-session-v1"). Changing
 * APP_PASSWORD invalidates every session. The password itself is never stored.
 */
export const SESSION_COOKIE = "cp_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 365; // 1 year, so the iPhone app stays signed in

export function authEnabled(): boolean {
  return !!process.env.APP_PASSWORD;
}

const enc = new TextEncoder();

async function hmacHex(key: string, msg: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(msg)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const len = Math.max(a.length, b.length);
  let diff = a.length ^ b.length;
  for (let i = 0; i < len; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

export async function expectedSessionToken(): Promise<string | null> {
  const pw = process.env.APP_PASSWORD;
  return pw ? hmacHex(pw, "cloudplay-session-v1") : null;
}

export async function isValidSession(token: string | undefined | null): Promise<boolean> {
  const expected = await expectedSessionToken();
  if (!expected) return true; // auth disabled
  return !!token && safeEqual(token, expected);
}

/** Compare a submitted password with APP_PASSWORD without leaking timing on content. */
export async function checkPassword(submitted: string): Promise<boolean> {
  const pw = process.env.APP_PASSWORD;
  if (!pw) return false;
  // Compare HMACs (fixed length) rather than raw strings.
  const [a, b] = await Promise.all([hmacHex("cp-compare", submitted), hmacHex("cp-compare", pw)]);
  return safeEqual(a, b);
}

/** Paths reachable without signing in. */
export function isPublicPath(pathname: string): boolean {
  return (
    pathname === "/login" ||
    pathname === "/api/auth/login" ||
    pathname === "/manifest.webmanifest" ||
    pathname === "/sw.js" ||
    pathname === "/offline.html" ||
    pathname === "/icon.svg" ||
    pathname === "/favicon.ico" ||
    pathname.startsWith("/icons/") ||
    pathname.startsWith("/_next/")
  );
}

/** Only allow same-site relative redirect targets after login. */
export function safeNextPath(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  return next;
}
