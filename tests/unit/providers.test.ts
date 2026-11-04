import { describe, expect, it } from "vitest";
import { detectProvider } from "@/services/providers/registry";
import { parseUserUrl } from "@/lib/validation";

describe("URL validation", () => {
  it("rejects non-URLs, bad schemes, credentials and control characters", () => {
    expect(parseUserUrl("not a url").ok).toBe(false);
    expect(parseUserUrl("").ok).toBe(false);
    expect(parseUserUrl(42).ok).toBe(false);
    expect(parseUserUrl("javascript:alert(1)").ok).toBe(false);
    expect(parseUserUrl("ftp://example.com/a.mp4").ok).toBe(false);
    expect(parseUserUrl("file:///etc/passwd").ok).toBe(false);
    expect(parseUserUrl("https://user:pass@example.com/a.mp4").ok).toBe(false);
    expect(parseUserUrl("https://example.com/a\n.mp4").ok).toBe(false);
    expect(parseUserUrl("https://example.com/" + "a".repeat(3000)).ok).toBe(false);
  });
});

describe("Diskwala link detection (test 1, 2)", () => {
  it("1. accepts a valid Diskwala app link", () => {
    const r = detectProvider("https://www.diskwala.com/app/66a1b2c3d4e5f6");
    expect(r.ok && r.match).toMatchObject({ provider: "diskwala", linkType: "app", shareId: "66a1b2c3d4e5f6" });
  });
  it("accepts the bare domain and trailing slash", () => {
    const r = detectProvider("https://diskwala.com/app/abc123xyz/");
    expect(r.ok && r.match.linkType).toBe("app");
  });
  it("2. flags an invalid Diskwala path as an unrecognized link format", () => {
    const r = detectProvider("https://www.diskwala.com/branding");
    expect(r.ok && r.match).toMatchObject({ provider: "diskwala", linkType: "unknown", shareId: null });
  });
  it("2. rejects look-alike domains instead of treating them as Diskwala", () => {
    for (const u of ["https://diskwaala.com/app/abc123", "https://playdiskwala.in/app/abc123", "https://diskwala.com.evil.io/app/abc123", "https://evildiskwala.com/app/abc123"]) {
      const r = detectProvider(u);
      expect(r.ok && r.match.provider === "diskwala").toBeFalsy();
    }
  });
});

describe("TeraBox link detection (test 3, 4)", () => {
  it("3. accepts /s/1… short share links on known domains", () => {
    for (const host of ["www.terabox.com", "terabox.com", "1024terabox.com", "www.terabox.app", "teraboxapp.com"]) {
      const r = detectProvider(`https://${host}/s/1AbCdEfGhIjK`);
      expect(r.ok && r.match).toMatchObject({ provider: "terabox", linkType: "share", shareId: "1AbCdEfGhIjK" });
    }
  });
  it("3. accepts ?surl= sharing links", () => {
    const r = detectProvider("https://www.terabox.app/sharing/link?surl=AbCdEfGhIjK");
    expect(r.ok && r.match).toMatchObject({ provider: "terabox", linkType: "share", shareId: "AbCdEfGhIjK" });
  });
  it("4. flags invalid TeraBox paths and rejects look-alike hosts", () => {
    const r = detectProvider("https://www.terabox.com/main?category=all");
    expect(r.ok && r.match.linkType).toBe("unknown");
    const s = detectProvider("https://www.terabox.com/sharing/link?surl=<script>");
    expect(s.ok && s.match.linkType).toBe("unknown");
    const evil = detectProvider("https://terabox.com.attacker.net/s/1abcdEFG");
    expect(evil.ok && evil.match.provider === "terabox").toBeFalsy();
  });
  it("never rewrites the original domain", () => {
    const r = detectProvider("https://1024terabox.com/s/1AbCdEfGhIjK");
    expect(r.ok && r.match.normalizedUrl).toBe("https://1024terabox.com/s/1AbCdEfGhIjK");
  });
});

describe("Unknown & direct URLs (test 5, 10)", () => {
  it("5. rejects an unknown non-media URL", () => {
    const r = detectProvider("https://example.com/watch?v=123");
    expect(r).toMatchObject({ ok: false, code: "UNKNOWN_PROVIDER" });
  });
  it("10. classifies media file URLs as direct", () => {
    for (const u of ["https://cdn.example.com/v/movie.mp4", "https://cdn.example.com/hls/master.m3u8?token=x", "https://cdn.example.com/a.webm"]) {
      const r = detectProvider(u);
      expect(r.ok && r.match).toMatchObject({ provider: "direct", linkType: "direct-media" });
    }
  });
});
