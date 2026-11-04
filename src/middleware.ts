import { NextResponse, type NextRequest } from "next/server";

/**
 * Per-request nonce-based Content Security Policy plus standard security headers.
 * media-src / connect-src allow https: because users play direct media from arbitrary
 * HTTPS hosts IN THEIR OWN BROWSER. The server itself never fetches those bytes.
 */
export function middleware(req: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const dev = process.env.NODE_ENV !== "production";
  const https = req.nextUrl.protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
  const httpMedia = process.env.ALLOW_HTTP_MEDIA === "true" ? " http:" : "";

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
    "frame-ancestors 'none'",
    ...(https ? ["upgrade-insecure-requests"] : []),
  ].join("; ");

  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set("content-security-policy", csp);
  res.headers.set("x-content-type-options", "nosniff");
  res.headers.set("x-frame-options", "DENY");
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
