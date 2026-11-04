import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { parseHlsVariants, resolvePlayback } from "@/services/playback/resolve";
import { isBlockedIp } from "@/lib/security";
import { fakeDns, startTestServer } from "./helpers";

// These tests run the real resolver over real TCP against a local server that plays the
// part of an arbitrary third-party media host. No provider (Diskwala/TeraBox) is emulated.
let srv: Awaited<ReturnType<typeof startTestServer>>;
const MP4_HEAD = Buffer.from("000000206674797069736f6d", "hex");

beforeAll(async () => {
  srv = await startTestServer((req, res) => {
    const url = req.url ?? "";
    if (url.startsWith("/video.mp4")) {
      res.writeHead(206, { "content-type": "video/mp4", "content-range": "bytes 0-0/1048576", "content-length": "1" });
      return res.end(MP4_HEAD.subarray(0, 1));
    }
    if (url.startsWith("/octet.webm")) {
      res.writeHead(200, { "content-type": "application/octet-stream", "content-length": "5000" });
      return res.end(Buffer.alloc(10));
    }
    if (url.startsWith("/master.m3u8")) {
      res.writeHead(200, { "content-type": "application/vnd.apple.mpegurl" });
      return res.end(
        "#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=640x360\nlow.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080\nhigh.m3u8\n",
      );
    }
    if (url.startsWith("/expired.mp4")) {
      res.writeHead(410);
      return res.end();
    }
    if (url.startsWith("/missing.mp4")) {
      res.writeHead(404);
      return res.end();
    }
    if (url.startsWith("/private.mp4")) {
      res.writeHead(403);
      return res.end();
    }
    if (url.startsWith("/password.mp4")) {
      res.writeHead(401, { "www-authenticate": 'Basic realm="x"' });
      return res.end();
    }
    if (url.startsWith("/page.mp4")) {
      res.writeHead(200, { "content-type": "text/html" });
      return res.end("<html>not a video</html>");
    }
    if (url.startsWith("/disguised.mp4")) {
      res.writeHead(200, { "content-type": "video/x-matroska" });
      return res.end("x");
    }
    if (url.startsWith("/slow.mp4")) return; // never respond
    res.writeHead(500);
    res.end();
  });
});
afterAll(() => srv.close());

const opts = () => ({
  allowHttp: true,
  allowedPorts: [srv.port],
  lookupAll: fakeDns({ "media.test": "127.0.0.1", "lan.test": "192.168.0.10" }),
  addressPolicy: (ip: string) => (ip === "127.0.0.1" ? false : isBlockedIp(ip)),
});

describe("Playback resolution", () => {
  it("11. resolves a supported MP4 with size from Content-Range", async () => {
    const r = await resolvePlayback(srv.url("/video.mp4"), opts());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.kind).toBe("progressive");
      expect(r.src).toBe(srv.url("/video.mp4"));
      expect(r.metadata).toMatchObject({ fileName: "video.mp4", fileSizeBytes: 1048576, format: "video/mp4" });
    }
  });
  it("accepts generic octet-stream when the extension is playable", async () => {
    const r = await resolvePlayback(srv.url("/octet.webm"), opts());
    expect(r.ok && r.kind).toBe("progressive");
  });
  it("11. resolves HLS and reports only the resolutions the manifest declares", async () => {
    const r = await resolvePlayback(srv.url("/master.m3u8"), opts());
    expect(r.ok && r.kind).toBe("hls");
    if (r.ok) expect(r.metadata).toMatchObject({ width: 1920, height: 1080, format: "HLS (m3u8)" });
  });
  it("6. reports an expired link (HTTP 410)", async () => {
    const r = await resolvePlayback(srv.url("/expired.mp4"), opts());
    expect(r).toMatchObject({ ok: false, code: "EXPIRED" });
  });
  it("reports a missing file (HTTP 404)", async () => {
    expect(await resolvePlayback(srv.url("/missing.mp4"), opts())).toMatchObject({ ok: false, code: "NOT_FOUND" });
  });
  it("8. reports a private video (HTTP 403) without trying to bypass it", async () => {
    expect(await resolvePlayback(srv.url("/private.mp4"), opts())).toMatchObject({ ok: false, code: "ACCESS_DENIED" });
  });
  it("9. reports password-protected media (HTTP 401) and never sends credentials", async () => {
    expect(await resolvePlayback(srv.url("/password.mp4"), opts())).toMatchObject({ ok: false, code: "ACCESS_DENIED" });
    expect(await resolvePlayback("https://user:secret@cdn.example.com/a.mp4")).toMatchObject({ ok: false, code: "INVALID_URL" });
  });
  it("9. password-protected TeraBox shares are not unlocked; user is sent to TeraBox", async () => {
    const r = await resolvePlayback("https://www.terabox.com/sharing/link?surl=AbCdEfGh&pwd=1234");
    expect(r).toMatchObject({ ok: false, code: "UNSUPPORTED_PROVIDER_PLAYBACK", provider: "terabox" });
    if (!r.ok) expect(r.externalUrl).toContain("terabox.com");
  });
  it("12. rejects unsupported formats by extension and by content type", async () => {
    expect(await resolvePlayback("https://cdn.example.com/movie.mkv")).toMatchObject({ ok: false, code: "UNSUPPORTED_FORMAT" });
    expect(await resolvePlayback(srv.url("/disguised.mp4"), opts())).toMatchObject({ ok: false, code: "UNSUPPORTED_FORMAT" });
  });
  it("does not treat a web page as a video", async () => {
    expect(await resolvePlayback(srv.url("/page.mp4"), opts())).toMatchObject({ ok: false, code: "NOT_MEDIA" });
  });
  it("18. times out on an unresponsive server", async () => {
    const r = await resolvePlayback(srv.url("/slow.mp4"), { ...opts(), timeoutMs: 300 });
    expect(r).toMatchObject({ ok: false, code: "TIMEOUT" });
  }, 5000);
  it("19. refuses media hosts resolving to private networks", async () => {
    expect(await resolvePlayback(srv.url("/video.mp4", "lan.test"), opts())).toMatchObject({ ok: false, code: "BLOCKED_DESTINATION" });
    expect(await resolvePlayback("https://localhost/a.mp4")).toMatchObject({ ok: false, code: "BLOCKED_DESTINATION" });
    expect(await resolvePlayback("https://169.254.169.254/latest/meta-data/a.mp4")).toMatchObject({ ok: false, code: "BLOCKED_DESTINATION" });
  });
  it("Diskwala links are never resolved to a playable source", async () => {
    const r = await resolvePlayback("https://www.diskwala.com/app/abc123xyz");
    expect(r).toMatchObject({ ok: false, code: "UNSUPPORTED_PROVIDER_PLAYBACK", provider: "diskwala" });
    if (!r.ok) expect(r.externalUrl).toBe("https://www.diskwala.com/app/abc123xyz");
  });
  it("7. unsupported provider link formats are reported", async () => {
    expect(await resolvePlayback("https://www.terabox.com/main")).toMatchObject({ ok: false, code: "UNSUPPORTED_FORMAT" });
  });
  it("5. unknown URLs are rejected", async () => {
    expect(await resolvePlayback("https://example.com/")).toMatchObject({ ok: false, code: "UNKNOWN_PROVIDER" });
  });
});

describe("HLS manifest parsing", () => {
  it("returns no variants for a media playlist", () => {
    expect(parseHlsVariants("#EXTM3U\n#EXTINF:10,\nseg0.ts\n")).toEqual([]);
    expect(parseHlsVariants("not a manifest")).toEqual([]);
  });
});
