import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, authEnabled, isPublicPath, isValidSession } from "@/lib/auth";

/**
 * Per-request nonce-based Content Security Policy plus standard security headers.
 * media-src / connect-src allow https: because users play direct media from arbitrary
 * HTTPS hosts IN THEIR OWN BROWSER. The server itself never fetches those bytes.
 */
export async function middleware(req: NextRequest) {
  // Optional password gate (APP_PASSWORD). Everything except the login page and static assets requires a session.
  if (authEnabled() && !isPublicPath(req.nextUrl.pathname) && !(await isValidSession(req.cookies.get(SESSION_COOKIE)?.value))) {
    if (req.nextUrl.pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Sign in required.", code: "UNAUTHENTICATED" }, { status: 401, headers: { "cache-control": "no-store" } });
    }
    // Build the redirect from the Host the client actually used (req.url can say "localhost" when self-hosted).
    const trust = process.env.TRUST_PROXY === "true";
    const host = (trust && req.headers.get("x-forwarded-host")) || req.headers.get("host") || req.nextUrl.host;
    const proto = (trust && req.headers.get("x-forwarded-proto")?.split(",")[0].trim()) || req.nextUrl.protocol.replace(":", "");
    const login = new URL(`${proto}://${host}/login`);
    const next = req.nextUrl.pathname + req.nextUrl.search;
    if (next !== "/") login.searchParams.set("next", next);
    return NextResponse.redirect(login, { headers: { "cache-control": "no-store" } });
  }

  const nonce = btoa(crypto.randomUUID());
  const dev = process.env.NODE_ENV !== "production";
  const https = req.nextUrl.protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
  const httpMedia = process.env.ALLOW_HTTP_MEDIA === "true" ? " http:" : "";
  const frameAncestors = process.env.FRAME_ANCESTORS?.replace(/[;,\r\n]/g, " ").trim() || "'none'";

  const csp = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${dev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: https:${httpMedia}`,
    `media-src 'self' blob: https:${httpMedia}`,
    `connect-src 'self' blob: https:${httpMedia}${dev ? " ws:" : ""}`,
    "worker-src 'self' blob:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    // Default: never embeddable (clickjacking protection). FRAME_ANCESTORS can allow specific embedders.
    `frame-ancestors ${frameAncestors}`,
    ...(https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("content-security-policy", csp);
  res.headers.set("x-content-type-options", "nosniff");
  if (frameAncestors === "'none'") res.headers.set("x-frame-options", "DENY");
  res.headers.set("referrer-policy", "no-referrer");
  res.headers.set("permissions-policy", "camera=(), microphone=(), geolocation=(), payment=()");
  res.headers.set("cross-origin-opener-policy", "same-origin");
  if (https) res.headers.set("strict-transport-security", "max-age=63072000; includeSubDomains");
  // API is same-origin only: no CORS headers are ever emitted.
  return res;
}

export const config = {
  matcher: [{ source: "/((?!_next/static|_next/image|favicon.ico|icon.svg|icons/).*)" }],
};
