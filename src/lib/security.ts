import dns from "node:dns";
import net from "node:net";
import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";

// ---------------------------------------------------------------------------
// IP classification (SSRF protection)
// ---------------------------------------------------------------------------

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, o) => (acc << 8) + Number(o), 0) >>> 0;
}

const BLOCKED_V4: Array<[string, number]> = [
  ["0.0.0.0", 8], // "this" network
  ["10.0.0.0", 8], // private
  ["100.64.0.0", 10], // CGNAT
  ["127.0.0.0", 8], // loopback
  ["169.254.0.0", 16], // link-local / cloud metadata
  ["172.16.0.0", 12], // private
  ["192.0.0.0", 24], // IETF protocol assignments
  ["192.0.2.0", 24], // TEST-NET-1
  ["192.88.99.0", 24], // 6to4 relay
  ["192.168.0.0", 16], // private
  ["198.18.0.0", 15], // benchmarking
  ["198.51.100.0", 24], // TEST-NET-2
  ["203.0.113.0", 24], // TEST-NET-3
  ["224.0.0.0", 4], // multicast
  ["240.0.0.0", 4], // reserved + broadcast
];

export function isBlockedIPv4(ip: string): boolean {
  const n = ipv4ToInt(ip);
  return BLOCKED_V4.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (n & mask) === (ipv4ToInt(base) & mask);
  });
}

/** Expand an IPv6 address into 8 16-bit groups. Returns null if not parseable. */
function expandIPv6(ip: string): number[] | null {
  let addr = ip.toLowerCase().replace(/^\[|\]$/g, "");
  const zone = addr.indexOf("%");
  if (zone !== -1) addr = addr.slice(0, zone);
  // Embedded IPv4 tail (e.g. ::ffff:127.0.0.1)
  const v4 = /(\d+\.\d+\.\d+\.\d+)$/.exec(addr);
  if (v4) {
    if (!net.isIPv4(v4[1])) return null;
    const n = ipv4ToInt(v4[1]);
    addr = addr.slice(0, -v4[1].length) + ((n >>> 16).toString(16) + ":" + (n & 0xffff).toString(16));
  }
  const halves = addr.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0;
  const groups = [...head, ...Array(Math.max(fill, 0)).fill("0"), ...tail];
  if (groups.length !== 8) return null;
  const nums = groups.map((g) => parseInt(g, 16));
  return nums.some((x) => Number.isNaN(x) || x < 0 || x > 0xffff) ? null : nums;
}

export function isBlockedIPv6(ip: string): boolean {
  const g = expandIPv6(ip);
  if (!g) return true; // unparseable => block
  const allZeroPrefix = g.slice(0, 5).every((x) => x === 0);
  // ::ffff:a.b.c.d (IPv4-mapped) and ::a.b.c.d (IPv4-compatible): check embedded v4
  if (allZeroPrefix && (g[5] === 0xffff || g[5] === 0)) {
    if (g[5] === 0 && g[6] === 0 && (g[7] === 0 || g[7] === 1)) return true; // :: and ::1
    const v4 = `${g[6] >> 8}.${g[6] & 0xff}.${g[7] >> 8}.${g[7] & 0xff}`;
    return isBlockedIPv4(v4);
  }
  if (g[0] === 0x64 && g[1] === 0xff9b) {
    // NAT64 well-known prefix 64:ff9b::/96 embeds an IPv4 address
    const v4 = `${g[6] >> 8}.${g[6] & 0xff}.${g[7] >> 8}.${g[7] & 0xff}`;
    return isBlockedIPv4(v4);
  }
  if (g[0] === 0x2002) {
    // 6to4 embeds IPv4 in groups 1-2
    const v4 = `${g[1] >> 8}.${g[1] & 0xff}.${g[2] >> 8}.${g[2] & 0xff}`;
    return isBlockedIPv4(v4);
  }
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((g[0] & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  if ((g[0] & 0xffc0) === 0xfec0) return true; // fec0::/10 site-local (deprecated)
  if ((g[0] & 0xff00) === 0xff00) return true; // multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentation
  if (g[0] === 0x2001 && g[1] < 0x0200) return true; // 2001::/23 IETF special purpose (incl. Teredo)
  if (g[0] === 0x0100 && g[1] === 0 && g[2] === 0 && g[3] === 0) return true; // discard-only
  return false;
}

export function isBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) return isBlockedIPv4(ip);
  if (net.isIPv6(ip)) return isBlockedIPv6(ip);
  return true;
}

const BLOCKED_HOSTNAMES = ["localhost", "localhost.localdomain", "ip6-localhost", "ip6-loopback"];
const BLOCKED_SUFFIXES = [".localhost", ".local", ".internal", ".intranet", ".lan", ".home.arpa", ".corp"];

/**
 * Hostname-level check performed before any DNS resolution.
 * Note: the WHATWG URL parser already normalizes numeric forms like "2130706433",
 * "0x7f.1" and "127.1" to dotted-quad, so those are caught by the IP check.
 */
export function checkHostname(hostname: string): { ok: true } | { ok: false; reason: string } {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!h) return { ok: false, reason: "Empty hostname." };
  if (BLOCKED_HOSTNAMES.includes(h) || BLOCKED_SUFFIXES.some((s) => h.endsWith(s))) {
    return { ok: false, reason: "Local and internal hostnames are not allowed." };
  }
  if (net.isIP(h)) {
    return isBlockedIp(h)
      ? { ok: false, reason: "Private, loopback, link-local and reserved IP addresses are not allowed." }
      : { ok: true };
  }
  if (!h.includes(".")) return { ok: false, reason: "Single-label hostnames are not allowed." };
  return { ok: true };
}

export class BlockedDestinationError extends Error {
  readonly code = "BLOCKED_DESTINATION";
}

export type DnsLookupAll = (
  hostname: string,
) => Promise<Array<{ address: string; family: number }>>;

const defaultLookupAll: DnsLookupAll = (hostname) => dns.promises.lookup(hostname, { all: true, verbatim: true });

/**
 * Resolve a hostname and refuse if ANY resolved address is non-public.
 * Returns the address to connect to. The caller must connect to exactly that address
 * (see pinnedLookup) so a second DNS answer cannot redirect the socket (DNS rebinding).
 */
export async function resolvePublicAddress(
  hostname: string,
  lookupAll: DnsLookupAll = defaultLookupAll,
  isBlocked: (ip: string) => boolean = isBlockedIp,
): Promise<{ address: string; family: number }> {
  const bare = hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(bare)) {
    if (isBlocked(bare)) throw new BlockedDestinationError("Private, loopback, link-local and reserved IP addresses are not allowed.");
    return { address: bare, family: net.isIP(bare) };
  }
  const pre = checkHostname(hostname);
  if (!pre.ok) throw new BlockedDestinationError(pre.reason);
  const addrs = await lookupAll(bare);
  if (!addrs.length) throw new BlockedDestinationError("Hostname did not resolve.");
  const bad = addrs.find((a) => isBlocked(a.address));
  if (bad) throw new BlockedDestinationError("Hostname resolves to a private or reserved network address.");
  return addrs[0];
}

function pinnedLookup(address: string, family: number): LookupFunction {
  return ((_host: string, options: { all?: boolean }, cb: (...args: unknown[]) => void) => {
    if (options && options.all) cb(null, [{ address, family }]);
    else cb(null, address, family);
  }) as unknown as LookupFunction;
}

// ---------------------------------------------------------------------------
// Safe outbound request (used only for probing direct media URLs)
// ---------------------------------------------------------------------------

export interface SafeResponse {
  status: number;
  headers: Record<string, string | undefined>;
  finalUrl: string;
  /** First bytes of the body (capped by maxBodyBytes). */
  body: Buffer;
}

export interface SafeRequestOptions {
  method?: "HEAD" | "GET";
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxRedirects?: number;
  maxBodyBytes?: number;
  lookupAll?: DnsLookupAll;
  /** Allow http in addition to https. Production: https only unless ALLOW_HTTP_MEDIA=true. */
  allowHttp?: boolean;
  /**
   * TEST HOOKS ONLY. Not reachable from any API route. Let unit tests point the
   * client at a local test server while still exercising the blocking logic.
   */
  addressPolicy?: (ip: string) => boolean;
  allowedPorts?: number[];
}

export class UpstreamTimeoutError extends Error {
  readonly code = "TIMEOUT";
}

export async function safeRequest(rawUrl: string, opts: SafeRequestOptions = {}): Promise<SafeResponse> {
  const {
    method = "HEAD",
    headers = {},
    timeoutMs = 8000,
    maxRedirects = 3,
    maxBodyBytes = 64 * 1024,
    lookupAll = defaultLookupAll,
    allowHttp = process.env.ALLOW_HTTP_MEDIA === "true",
    addressPolicy = isBlockedIp,
    allowedPorts = [80, 443, 8080, 8443],
  } = opts;

  let current = new URL(rawUrl);
  const deadline = Date.now() + timeoutMs;

  for (let hop = 0; hop <= maxRedirects; hop++) {
    if (current.protocol !== "https:" && !(allowHttp && current.protocol === "http:")) {
      throw new BlockedDestinationError("Only HTTPS media URLs are allowed.");
    }
    if (current.username || current.password) throw new BlockedDestinationError("Credentials in URL are not allowed.");
    const port = current.port ? Number(current.port) : current.protocol === "https:" ? 443 : 80;
    if (!allowedPorts.includes(port)) throw new BlockedDestinationError("Non-standard ports are not allowed.");

    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new UpstreamTimeoutError("The media server did not respond in time.");
    const { address, family } = await resolvePublicAddress(current.hostname, lookupAll, addressPolicy);

    const res = await new Promise<SafeResponse>((resolve, reject) => {
      const lib = current.protocol === "https:" ? https : http;
      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      };
      const req = lib.request(
        current,
        {
          method,
          headers: { "user-agent": "CloudPlay/1.0 (+media-probe)", accept: "*/*", ...headers },
          lookup: pinnedLookup(address, family),
        },
        (r) => {
          const headersObj = Object.fromEntries(
            Object.entries(r.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(", ") : v]),
          );
          const make = (body: Buffer): SafeResponse => ({ status: r.statusCode ?? 0, headers: headersObj, finalUrl: current.toString(), body });
          if (maxBodyBytes <= 0 || method === "HEAD") {
            // Headers are all we need: never download the media body.
            finish(() => resolve(make(Buffer.alloc(0))));
            r.destroy();
            return;
          }
          const chunks: Buffer[] = [];
          let size = 0;
          const done = () => finish(() => resolve(make(Buffer.concat(chunks).subarray(0, maxBodyBytes))));
          r.on("data", (c: Buffer) => {
            if (size >= maxBodyBytes) return;
            chunks.push(c);
            size += c.length;
            if (size >= maxBodyBytes) {
              done();
              r.destroy();
            }
          });
          r.on("end", done);
          r.on("close", done);
          r.on("error", (e) => finish(() => reject(e)));
        },
      );
      // Hard deadline for the whole exchange (connect + headers + body), not just socket idle time.
      const timer = setTimeout(() => {
        finish(() => reject(new UpstreamTimeoutError("The media server did not respond in time.")));
        req.destroy();
      }, remaining);
      req.on("error", (e) => finish(() => reject(e)));
      req.end();
    });

    if (res.status >= 300 && res.status < 400 && res.headers.location) {
      // Each redirect hop is re-validated (protocol, port, DNS) before it is followed.
      current = new URL(res.headers.location, current);
      continue;
    }
    return res;
  }
  throw new BlockedDestinationError("Too many redirects.");
}

// ---------------------------------------------------------------------------
// Rate limiting & request guards for API routes
// ---------------------------------------------------------------------------

interface Bucket {
  tokens: number;
  updated: number;
}
const buckets = new Map<string, Bucket>();

/** Token-bucket limiter. In-memory: suitable for a single-instance deployment. */
export function rateLimit(key: string, capacity = 30, refillPerSecond = 0.5, now = Date.now()): boolean {
  const b = buckets.get(key) ?? { tokens: capacity, updated: now };
  b.tokens = Math.min(capacity, b.tokens + ((now - b.updated) / 1000) * refillPerSecond);
  b.updated = now;
  if (b.tokens < 1) {
    buckets.set(key, b);
    return false;
  }
  b.tokens -= 1;
  buckets.set(key, b);
  if (buckets.size > 10_000) {
    for (const [k, v] of buckets) if (now - v.updated > 600_000) buckets.delete(k);
  }
  return true;
}

export function resetRateLimits() {
  buckets.clear();
}

export function clientKey(req: Request): string {
  if (process.env.TRUST_PROXY === "true") {
    const fwd = req.headers.get("x-forwarded-for");
    if (fwd) return fwd.split(",")[0].trim();
  }
  return req.headers.get("x-real-ip") ?? "local";
}

/**
 * CSRF protection for state-changing requests: browsers always send Origin on
 * cross-site POST/PUT/PATCH/DELETE, so require it to match the Host. Non-browser
 * clients may instead present API_TOKEN as a bearer token (if configured).
 */
export function checkSameOrigin(req: Request): boolean {
  const token = process.env.API_TOKEN;
  const auth = req.headers.get("authorization");
  if (token && auth === `Bearer ${token}`) return true;
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") && process.env.TRUST_PROXY === "true"
    ? req.headers.get("x-forwarded-host")
    : req.headers.get("host");
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
