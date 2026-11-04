# Security

## Threat model

CloudPlay is a **single-user, self-hosted** web app. It accepts URLs from the user, probes **direct media URLs** from the server, stores links and history in SQLite, and serves a browser UI. There are no user accounts. A public deployment **must** sit behind an authenticating reverse proxy (see README → Deployment).

## Controls

### URL validation and provider allowlists
- `src/lib/validation.ts`: http/https only, at most 2048 chars, no whitespace or control characters, **no embedded credentials** (`user:pass@`).
- Provider recognition uses explicit domain allowlists (`DISKWALA_DOMAINS`, `TERABOX_SHARE_DOMAINS`). Suffix tricks such as `terabox.com.attacker.net` are rejected, and known look-alikes (`diskwaala.com`, `playdiskwala.in`) are refused outright.
- The server **never fetches Diskwala or TeraBox**. There's no arbitrary "fetch this URL" endpoint.

### SSRF protection (`src/lib/security.ts`)
The only outbound request is `safeRequest`, used by `/api/resolve` to probe direct media URLs:
- **HTTPS only**. Set `ALLOW_HTTP_MEDIA=true` to allow http.
- **Ports 80/443/8080/8443 only.**
- **Hostname blocklist:** `localhost`, `*.localhost`, `*.local`, `*.internal`, `*.lan`, `*.home.arpa`, `*.corp`, single-label names.
- **IP blocklist (IPv4 and IPv6):** loopback, RFC1918, CGNAT, link-local (cloud metadata `169.254.169.254`), multicast, reserved, documentation and benchmarking ranges, `::`, `::1`, ULA `fc00::/7`, `fe80::/10`, IPv4-mapped and compatible, NAT64 `64:ff9b::/96`, 6to4 `2002::/16`, and Teredo/`2001::/23`. Alternate IPv4 encodings (`2130706433`, `0x7f.1`, `127.1`, octal) are normalized by the WHATWG URL parser and then blocked.
- **DNS rebinding:** each hostname is resolved once, rejected if **any** answer is private, and the socket is **pinned** to the vetted address through a custom `lookup`, so a second DNS answer can't redirect the connection.
- **Redirects are followed manually** (at most 3). Every hop is re-validated for scheme, port, DNS and IP.
- **Hard deadline** (8 s) for the whole exchange, plus body caps: 0 bytes for progressive media (headers only) and 256 KiB for HLS manifests.

### API protection (`src/lib/api.ts`)
- **CSRF:** state-changing requests must carry an `Origin` that matches `Host`, or `Authorization: Bearer $API_TOKEN` if you configure one. No CORS headers are ever emitted.
- **Rate limiting:** in-memory token bucket per client (per instance). Behind a proxy, set `TRUST_PROXY=true` so `X-Forwarded-For` is used.
- **Input validation:** zod schemas on every body; JSON bodies limited to 16 KiB; `Content-Type: application/json` required. Ids must be UUIDs.
- **SQL:** parameterized statements only. `LIKE` wildcards are escaped.

### HTTP security headers (`src/middleware.ts`)
- Per-request **nonce-based CSP** with `strict-dynamic`, `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'` and `form-action 'self'`. `media-src`, `connect-src` and `img-src` allow `https:` because users stream direct media **in their own browser**. `wasm-unsafe-eval` is needed for the in-browser SHA-256 (hash-wasm).
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, a restrictive `Permissions-Policy`, and `COOP: same-origin`.
- When served over HTTPS: `Strict-Transport-Security` and `upgrade-insecure-requests`.
- External links use `rel="noopener noreferrer nofollow"`.

### Data minimization
- Stored: link URL, provider, optional title, duration, playback position, conversion records (URLs, file name and size, SHA-256 hex digests), settings.
- **Never stored:** passwords, cookies, provider tokens, or file contents. Local files that are played or fingerprinted stay in the browser.
- History can be cleared, or watch history disabled, in **Settings**.

### Temporary files (transfer engine)
- Created with `mkdtemp` (`0700`) and files written `0600`; names are sanitized (`safeTempName`).
- Size-capped (`MAX_TRANSFER_BYTES`, default 4 GiB), and always removed in `finally`, on success and on failure (tested).
- Concurrency capped (`MAX_CONCURRENT_TRANSFERS`).

### Secrets
- `.env` is git-ignored. TeraBox credentials (when an adapter exists) must only be read server-side. Nothing secret is exposed through `NEXT_PUBLIC_*`.

## Known gaps / production hardening checklist
- No built-in authentication. Put the app behind a reverse proxy with auth (OAuth2 proxy, Cloudflare Access, basic auth over TLS).
- Rate limits are per process and in memory. Use a shared store (Redis) for multi-instance deployments.
- The CSP allows `https:` media and connect sources by design. Narrow it if you only use known hosts.
- `node:sqlite` is marked experimental in Node 22. Pin your Node version.
- `npm audit` (2026-11-04) flags the copy of PostCSS bundled inside Next.js 15.5. It's used only at build time on this project's own CSS, so exposure is low. The fix is upgrading to Next.js 16, a major version that hasn't been tested with CloudPlay yet.

## Legal
Respect Diskwala's and TeraBox's terms and copyright law. CloudPlay doesn't circumvent access controls, and users are responsible for having the rights to copy any file they transfer manually.

## Reporting
Report vulnerabilities privately to the repository owner instead of opening a public issue.
