import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { BlockedDestinationError, checkHostname, isBlockedIp, rateLimit, resetRateLimits, resolvePublicAddress, safeRequest } from "@/lib/security";
import { parseUserUrl } from "@/lib/validation";
import { fakeDns, startTestServer, testPolicy } from "./helpers";

describe("19. SSRF protection: IP classification", () => {
  const blocked = [
    "127.0.0.1", "127.255.255.254", "10.0.0.1", "172.16.0.1", "172.31.255.255", "192.168.1.1",
    "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "255.255.255.255", "198.18.0.1",
    "::1", "::", "fe80::1", "fc00::1", "fd12:3456::1", "::ffff:127.0.0.1", "::ffff:10.0.0.1",
    "::ffff:7f00:1", "64:ff9b::a9fe:a9fe", "2002:7f00:0001::", "ff02::1", "2001:db8::1",
  ];
  it.each(blocked)("blocks %s", (ip) => expect(isBlockedIp(ip)).toBe(true));
  const allowed = ["8.8.8.8", "1.1.1.1", "93.184.216.34", "2606:4700:4700::1111", "2a00:1450:4001::200e", "172.32.0.1"];
  it.each(allowed)("allows public %s", (ip) => expect(isBlockedIp(ip)).toBe(false));
});

describe("19. SSRF protection: hostnames and alternate encodings", () => {
  it("blocks localhost-like and internal names", () => {
    for (const h of ["localhost", "LOCALHOST.", "foo.localhost", "printer.local", "db.internal", "intranet", "router.home.arpa"]) {
      expect(checkHostname(h).ok).toBe(false);
    }
  });
  it("URL parser normalizes decimal / hex / short IPv4 forms which are then blocked", () => {
    for (const raw of ["http://2130706433/a.mp4", "http://0x7f000001/a.mp4", "http://127.1/a.mp4", "http://0177.0.0.1/a.mp4", "http://[::ffff:127.0.0.1]/a.mp4"]) {
      const p = parseUserUrl(raw);
      expect(p.ok).toBe(true);
      if (p.ok) expect(checkHostname(p.url.hostname).ok).toBe(false);
    }
  });
  it("rejects hostnames whose DNS answers include ANY private address (rebinding)", async () => {
    const lookup = async () => [
      { address: "93.184.216.34", family: 4 },
      { address: "127.0.0.1", family: 4 },
    ];
    await expect(resolvePublicAddress("rebind.example.com", lookup)).rejects.toBeInstanceOf(BlockedDestinationError);
  });
  it("rejects cloud metadata endpoint via DNS", async () => {
    await expect(resolvePublicAddress("metadata.example.com", fakeDns({ "metadata.example.com": "169.254.169.254" }))).rejects.toThrow(
      /private or reserved/,
    );
  });
});

describe("19. SSRF protection: safeRequest against a real local server", () => {
  let srv: Awaited<ReturnType<typeof startTestServer>>;
  beforeAll(async () => {
    srv = await startTestServer((req, res) => {
      if (req.url === "/redirect-internal") {
        res.writeHead(302, { location: `http://internal.test:${srv.port}/secret` });
        return res.end();
      }
      if (req.url === "/redirect-ftp") {
        res.writeHead(302, { location: "ftp://media.test/x" });
        return res.end();
      }
      if (req.url === "/loop") {
        res.writeHead(302, { location: "/loop" });
        return res.end();
      }
      res.writeHead(200, { "content-type": "text/plain" });
      res.end("ok");
    });
  });
  afterAll(() => srv.close());

  const base = () => ({
    allowHttp: true,
    allowedPorts: [srv.port],
    lookupAll: fakeDns({ "media.test": "127.0.0.1", "internal.test": "10.0.0.7" }),
    addressPolicy: (ip: string) => (ip === "127.0.0.1" ? false : isBlockedIp(ip)),
  });

  it("connects to an allowed host", async () => {
    const r = await safeRequest(srv.url("/ok"), { ...base(), method: "GET" });
    expect(r.status).toBe(200);
  });
  it("re-validates redirect targets and blocks redirects into private networks", async () => {
    await expect(safeRequest(srv.url("/redirect-internal"), base())).rejects.toBeInstanceOf(BlockedDestinationError);
  });
  it("blocks redirects to non-http schemes", async () => {
    await expect(safeRequest(srv.url("/redirect-ftp"), base())).rejects.toBeInstanceOf(BlockedDestinationError);
  });
  it("caps redirect chains", async () => {
    await expect(safeRequest(srv.url("/loop"), base())).rejects.toThrow(/Too many redirects/);
  });
  it("blocks the real loopback when the production policy is used", async () => {
    await expect(safeRequest(`http://127.0.0.1:${srv.port}/ok`, { allowHttp: true, allowedPorts: [srv.port] })).rejects.toBeInstanceOf(
      BlockedDestinationError,
    );
  });
  it("blocks plain http and non-standard ports by default", async () => {
    await expect(safeRequest("http://example.com/a.mp4")).rejects.toThrow(/Only HTTPS/);
    await expect(safeRequest("https://example.com:6379/a.mp4")).rejects.toThrow(/Non-standard ports/);
  });
  it("testPolicy helper only whitelists 127.0.0.1", async () => {
    expect(await testPolicy("127.0.0.1")).toBe(false);
    expect(await testPolicy("10.0.0.1")).toBe(true);
  });
});

describe("Rate limiting", () => {
  it("allows a burst up to capacity then refuses, and refills over time", () => {
    resetRateLimits();
    const t = 1_000_000;
    for (let i = 0; i < 5; i++) expect(rateLimit("k", 5, 1, t)).toBe(true);
    expect(rateLimit("k", 5, 1, t)).toBe(false);
    expect(rateLimit("k", 5, 1, t + 1500)).toBe(true);
  });
});
