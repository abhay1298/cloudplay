import http from "node:http";
import type { AddressInfo } from "node:net";

/**
 * A REAL local HTTP server used to exercise the media probe end-to-end over TCP.
 * It stands in for an arbitrary third-party media host. It does NOT emulate Diskwala or TeraBox.
 */
export async function startTestServer(handler: http.RequestListener) {
  const server = http.createServer(handler);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  return {
    port,
    url: (path: string, host = "media.test") => `http://${host}:${port}${path}`,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

/** DNS stub: maps test hostnames to addresses. */
export function fakeDns(map: Record<string, string>) {
  return async (hostname: string) => {
    const a = map[hostname];
    if (!a) throw Object.assign(new Error("ENOTFOUND"), { code: "ENOTFOUND" });
    return [{ address: a, family: a.includes(":") ? 6 : 4 }];
  };
}

/** Policy that treats 127.0.0.1 (our test server) as "public" but still blocks every other private range. */
export async function testPolicy(ip: string) {
  const { isBlockedIp } = await import("@/lib/security");
  return ip === "127.0.0.1" ? false : isBlockedIp(ip);
}
