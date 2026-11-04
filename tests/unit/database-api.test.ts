import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

let dir: string;
beforeAll(async () => {
  dir = await fsp.mkdtemp(path.join(os.tmpdir(), "cp-db-"));
  process.env.DATABASE_PATH = path.join(dir, "test.db");
});
afterAll(async () => {
  const { closeDb } = await import("@/lib/database");
  closeDb();
  await fsp.rm(dir, { recursive: true, force: true });
});
beforeEach(async () => {
  const { resetRateLimits } = await import("@/lib/security");
  resetRateLimits();
});

const ORIGIN = "http://localhost:3000";
function req(url: string, init: { method?: string; body?: unknown; origin?: string | null; headers?: Record<string, string> } = {}) {
  const headers: Record<string, string> = { host: "localhost:3000", ...init.headers };
  if (init.origin !== null) headers.origin = init.origin ?? ORIGIN;
  if (init.body !== undefined) headers["content-type"] = "application/json";
  return new Request(`${ORIGIN}${url}`, {
    method: init.method ?? "GET",
    headers,
    body: init.body !== undefined ? (typeof init.body === "string" ? init.body : JSON.stringify(init.body)) : undefined,
  });
}

describe("Library & watch progress (SQLite)", () => {
  it("adds, searches, filters, sorts and removes items", async () => {
    const db = await import("@/lib/database");
    const a = db.addLibraryItem({ url: "https://cdn.example.com/a.mp4", provider: "direct", title: "Alpha Trip" });
    db.addLibraryItem({ url: "https://www.terabox.com/s/1abcDEF", provider: "terabox", title: "Beta 100%_off" });
    db.addLibraryItem({ url: "https://www.diskwala.com/app/xyz123", provider: "diskwala", title: null });
    expect(db.listLibrary().length).toBe(3);
    expect(db.listLibrary({ provider: "terabox" }).map((i) => i.title)).toEqual(["Beta 100%_off"]);
    expect(db.listLibrary({ search: "alpha" }).length).toBe(1);
    expect(db.listLibrary({ search: "%" }).length).toBe(1); // LIKE wildcards are escaped
    db.saveWatchProgress({ url: a.url, provider: "direct", title: null, positionSeconds: 42, durationSeconds: 100 });
    const sorted = db.listLibrary({ sort: "watched" });
    expect(sorted[0]).toMatchObject({ url: a.url, positionSeconds: 42, durationSeconds: 100 });
    expect(db.getWatchEntry(a.url)?.positionSeconds).toBe(42);
    expect(db.removeLibraryItem(a.id)).toBe(true);
    expect(db.listLibrary().length).toBe(2);
  });
});

describe("API routes (handlers invoked directly)", () => {
  it("rejects cross-origin state-changing requests (CSRF)", async () => {
    const { POST } = await import("@/app/api/library/route");
    const res = await POST(req("/api/library", { method: "POST", body: { url: "https://cdn.example.com/x.mp4" }, origin: "https://evil.example" }));
    expect(res.status).toBe(403);
    const res2 = await POST(req("/api/library", { method: "POST", body: { url: "https://cdn.example.com/x.mp4" }, origin: null }));
    expect(res2.status).toBe(403);
  });

  it("validates bodies, content type and size", async () => {
    const { POST } = await import("@/app/api/resolve/route");
    expect((await POST(req("/api/resolve", { method: "POST", body: "{bad" }))).status).toBe(400);
    expect((await POST(req("/api/resolve", { method: "POST", body: { url: 5 } }))).status).toBe(400);
    expect((await POST(req("/api/resolve", { method: "POST", body: { url: "https://x.com/" + "a".repeat(20000) } }))).status).toBe(413);
    const noType = new Request(`${ORIGIN}/api/resolve`, { method: "POST", headers: { host: "localhost:3000", origin: ORIGIN }, body: "{}" });
    expect((await POST(noType)).status).toBe(415);
  });

  it("19. /api/resolve refuses SSRF targets", async () => {
    const { POST } = await import("@/app/api/resolve/route");
    for (const url of ["http://127.0.0.1/a.mp4", "https://localhost/a.mp4", "https://[::1]/a.mp4", "https://169.254.169.254/a.mp4", "https://10.1.2.3/a.m3u8"]) {
      const body = await (await POST(req("/api/resolve", { method: "POST", body: { url } }))).json();
      expect(body.ok).toBe(false);
      expect(["BLOCKED_DESTINATION"]).toContain(body.code);
    }
  });

  it("rate limits /api/resolve", async () => {
    const { POST } = await import("@/app/api/resolve/route");
    const statuses: number[] = [];
    for (let i = 0; i < 25; i++) statuses.push((await POST(req("/api/resolve", { method: "POST", body: { url: "https://www.diskwala.com/app/abc123" } }))).status);
    expect(statuses).toContain(429);
  });

  it("/api/convert creates a real job that ends 'unsupported' for Diskwala", async () => {
    const { POST } = await import("@/app/api/convert/route");
    const res = await POST(req("/api/convert", { method: "POST", body: { url: "https://www.diskwala.com/app/abc123xyz" } }));
    expect(res.status).toBe(202);
    const { record } = await res.json();
    const { getConversion } = await import("@/lib/database");
    let rec = getConversion(record.id)!;
    for (let i = 0; i < 50 && !["unsupported", "failed", "completed"].includes(rec.status); i++) {
      await new Promise((r) => setTimeout(r, 20));
      rec = getConversion(record.id)!;
    }
    expect(rec.status).toBe("unsupported");
    expect(rec.resultUrl).toBeNull();
    // Non-Diskwala input is refused
    const bad = await POST(req("/api/convert", { method: "POST", body: { url: "https://www.terabox.com/s/1abcdef" } }));
    expect(bad.status).toBe(400);
  });

  it("records manual transfers and compares client checksums", async () => {
    const { POST } = await import("@/app/api/conversions/manual/route");
    const sha = "a".repeat(64);
    const ok = await POST(
      req("/api/conversions/manual", {
        method: "POST",
        body: { sourceUrl: "https://www.diskwala.com/app/abc123xyz", resultUrl: "https://www.terabox.com/s/1ResultLink", originalSha256: sha, copySha256: sha, fileSizeBytes: 10, copySizeBytes: 10 },
      }),
    );
    expect(ok.status).toBe(201);
    const { record } = await ok.json();
    expect(record).toMatchObject({ mode: "manual", status: "completed", resultUrl: "https://www.terabox.com/s/1ResultLink" });
    expect(record.verification).toMatchObject({ checksumMatch: true, sizeMatch: true });

    const wrongDest = await POST(
      req("/api/conversions/manual", { method: "POST", body: { sourceUrl: "https://www.diskwala.com/app/abc123xyz", resultUrl: "https://evil.example/s/1abc" } }),
    );
    expect(wrongDest.status).toBe(400);
    const badSha = await POST(
      req("/api/conversions/manual", {
        method: "POST",
        body: { sourceUrl: "https://www.diskwala.com/app/abc123xyz", resultUrl: "https://www.terabox.com/s/1ResultLink", originalSha256: "zz" },
      }),
    );
    expect(badSha.status).toBe(400);
  });

  it("settings validate allowed values", async () => {
    const { PUT, GET } = await import("@/app/api/settings/route");
    expect((await PUT(req("/api/settings", { method: "PUT", body: { defaultSpeed: 1.5, theme: "light" } }))).status).toBe(200);
    expect((await PUT(req("/api/settings", { method: "PUT", body: { defaultSpeed: 3 } }))).status).toBe(400);
    expect((await PUT(req("/api/settings", { method: "PUT", body: { password: "x" } }))).status).toBe(400);
    const { settings } = await (await GET(req("/api/settings"))).json();
    expect(settings).toMatchObject({ defaultSpeed: 1.5, theme: "light" });
  });

  it("watch progress respects the privacy setting", async () => {
    const watch = await import("@/app/api/watch/route");
    const settings = await import("@/app/api/settings/route");
    await settings.PUT(req("/api/settings", { method: "PUT", body: { saveWatchHistory: false } }));
    const r = await (await watch.POST(req("/api/watch", { method: "POST", body: { url: "https://cdn.example.com/p.mp4", positionSeconds: 5 } }))).json();
    expect(r.saved).toBe(false);
    await settings.PUT(req("/api/settings", { method: "PUT", body: { saveWatchHistory: true } }));
    const r2 = await (await watch.POST(req("/api/watch", { method: "POST", body: { url: "https://cdn.example.com/p.mp4", positionSeconds: 5 } }))).json();
    expect(r2.saved).toBe(true);
  });
});
