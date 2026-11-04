/**
 * MOCKED ADAPTER TESTS.
 *
 * These tests exercise CloudPlay's real transfer ENGINE (streaming, hashing, temp-file
 * handling, verification, state machine) using in-memory MOCK source/destination
 * adapters. They prove the engine logic. They do NOT prove compatibility with Diskwala
 * or TeraBox, which have no integrated APIs (see TECHNICAL_FEASIBILITY.md).
 */
import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { newConversionRecord, runConversion, safeTempName } from "@/services/conversion/engine";
import {
  DiskwalaSourceAdapter, TeraBoxDestinationAdapter,
  type DestinationAdapter, type SourceAdapter, type UploadResult,
} from "@/services/conversion/adapters";
import type { ConversionRecord } from "@/types/conversion";

const PAYLOAD = crypto.randomBytes(3 * 1024 * 1024 + 123); // 3 MiB + odd tail
const SHA = crypto.createHash("sha256").update(PAYLOAD).digest("hex");

async function* chunks(buf: Buffer, size = 64 * 1024) {
  for (let i = 0; i < buf.length; i += size) yield buf.subarray(i, i + size);
}

class MockSource implements SourceAdapter {
  name = "MockSource";
  constructor(private data: Buffer, private declared: number | null = data.length, private truncateTo?: number) {}
  get declaredSize() {
    return this.declared ?? undefined;
  }
  async inspect() {
    return { supported: true as const, fileName: "Original Movie (2024).mp4", sizeBytes: this.declaredSize };
  }
  async download() {
    const body = this.truncateTo !== undefined ? this.data.subarray(0, this.truncateTo) : this.data;
    return { body: chunks(body), sizeBytes: this.declaredSize };
  }
}

/** Stores uploads in a temp "remote" folder and reports what it actually stored. */
class MockDestination implements DestinationAdapter {
  name = "MockDestination";
  stored = new Map<string, Buffer>();
  sawTempFile: string | null = null;
  constructor(private behavior: { failUpload?: boolean; corrupt?: boolean; noChecksum?: boolean; ready?: boolean } = {}) {}
  readiness() {
    return this.behavior.ready === false
      ? { ready: false as const, kind: "missing_credentials" as const, reason: "Missing MOCK credentials." }
      : { ready: true as const };
  }
  async upload(filePath: string, _meta: unknown, onProgress: (n: number) => void): Promise<UploadResult> {
    this.sawTempFile = filePath;
    if (this.behavior.failUpload) throw new Error("Upload rejected by destination (HTTP 507).");
    let data = await fsp.readFile(filePath);
    onProgress(data.length / 2);
    if (this.behavior.corrupt) data = Buffer.concat([data.subarray(0, data.length - 1), Buffer.from([data[data.length - 1] ^ 0xff])]);
    const id = crypto.randomUUID();
    this.stored.set(id, data);
    onProgress(data.length);
    return { remoteId: id };
  }
  async stat(id: string) {
    const d = this.stored.get(id)!;
    return {
      sizeBytes: d.length,
      checksum: this.behavior.noChecksum ? undefined : { algorithm: "sha256" as const, value: crypto.createHash("sha256").update(d).digest("hex") },
    };
  }
  async createShareLink(id: string) {
    return `https://share.mock.invalid/${id}`;
  }
}

let tmpRoot: string;
beforeEach(async () => {
  tmpRoot = await fsp.mkdtemp(path.join(os.tmpdir(), "cp-test-"));
});
afterEach(async () => {
  await fsp.rm(tmpRoot, { recursive: true, force: true });
});

function run(source: SourceAdapter, destination: DestinationAdapter, extra: { maxBytes?: number } = {}) {
  const updates: ConversionRecord[] = [];
  const rec = newConversionRecord("https://www.diskwala.com/app/abc123xyz");
  return runConversion(rec, { source, destination, tmpRoot, onUpdate: (r) => updates.push(r), ...extra }).then((final) => ({ final, updates }));
}

describe("[MOCKED] transfer engine", () => {
  it("14/15. completes an authorized transfer, preserves bytes, and verifies SHA-256", async () => {
    const dest = new MockDestination();
    const { final, updates } = await run(new MockSource(PAYLOAD), dest);
    expect(final.status).toBe("completed");
    expect(final.resultUrl).toMatch(/^https:\/\/share\.mock\.invalid\//);
    expect(final.fileName).toBe("Original Movie (2024).mp4");
    expect(final.fileSizeBytes).toBe(PAYLOAD.length);
    expect(final.verification).toMatchObject({ sizeMatch: true, checksumMatch: true, sourceSha256: SHA });
    // Destination received byte-identical data (no transcoding / modification).
    const stored = [...dest.stored.values()][0];
    expect(stored.equals(PAYLOAD)).toBe(true);
    // Every pipeline state was actually entered, in order.
    expect(final.steps.map((s) => s.status)).toEqual([
      "waiting", "validating", "resolving_source", "downloading", "uploading", "verifying", "generating_share_link", "completed",
    ]);
    // Progress never reports 100% before completion.
    for (const u of updates) if (u.status !== "completed" && u.progress != null) expect(u.progress).toBeLessThan(1);
  });

  it("15. reports when the destination exposes no checksum instead of claiming integrity", async () => {
    const { final } = await run(new MockSource(PAYLOAD), new MockDestination({ noChecksum: true }));
    expect(final.status).toBe("completed");
    expect(final.verification?.checksumMatch).toBeNull();
    expect(final.verification?.notes.join(" ")).toMatch(/did not report a checksum/);
  });

  it("15. fails verification when stored bytes differ", async () => {
    const { final } = await run(new MockSource(PAYLOAD), new MockDestination({ corrupt: true }));
    expect(final.status).toBe("failed");
    expect(final.resultUrl).toBeNull();
    expect(final.error).toMatch(/Verification failed/);
    expect(final.verification?.checksumMatch).toBe(false);
  });

  it("16. fails cleanly when the destination upload fails", async () => {
    const { final } = await run(new MockSource(PAYLOAD), new MockDestination({ failUpload: true }));
    expect(final.status).toBe("failed");
    expect(final.error).toMatch(/HTTP 507/);
    expect(final.resultUrl).toBeNull();
  });

  it("13. fails when the download is truncated", async () => {
    const { final } = await run(new MockSource(PAYLOAD, PAYLOAD.length, 1000), new MockDestination());
    expect(final.status).toBe("failed");
    expect(final.error).toMatch(/incomplete/);
  });

  it("enforces the transfer size limit (declared size and streamed size)", async () => {
    const declared = await run(new MockSource(PAYLOAD), new MockDestination(), { maxBytes: 1024 });
    expect(declared.final.status).toBe("failed");
    expect(declared.final.error).toMatch(/size limit/);
    const streamed = await run(new MockSource(PAYLOAD, null), new MockDestination(), { maxBytes: 1024 });
    expect(streamed.final.status).toBe("failed");
    expect(streamed.final.error).toMatch(/size limit/);
    expect(streamed.final.steps.map((s) => s.status)).toContain("downloading");
  });

  it("reports unknown progress (null) when the size is unknown instead of inventing a percentage", async () => {
    const { final, updates } = await run(new MockSource(PAYLOAD, null), new MockDestination());
    expect(final.status).toBe("completed");
    expect(updates.filter((u) => u.status === "downloading").every((u) => u.progress === 0 || u.progress === null)).toBe(true);
  });

  it("17. stops before downloading when destination credentials are missing", async () => {
    const dest = new MockDestination({ ready: false });
    const { final } = await run(new MockSource(PAYLOAD), dest);
    expect(final.status).toBe("unsupported");
    expect(final.steps.map((s) => s.status)).not.toContain("downloading");
    expect(dest.sawTempFile).toBeNull();
  });

  it("deletes temporary files after success and after failure", async () => {
    const ok = new MockDestination();
    await run(new MockSource(PAYLOAD), ok);
    expect(fs.existsSync(ok.sawTempFile!)).toBe(false);
    const bad = new MockDestination({ failUpload: true });
    await run(new MockSource(PAYLOAD), bad);
    expect(fs.existsSync(bad.sawTempFile!)).toBe(false);
    expect(await fsp.readdir(tmpRoot)).toEqual([]);
  });

  it("sanitizes temp file names (no path traversal)", () => {
    expect(safeTempName("../../etc/passwd")).toBe("passwd");
    expect(safeTempName("..")).not.toContain("/");
    expect(safeTempName("a/b\\c<>.mp4")).not.toMatch(/[/<>]/);
  });
});

describe("Production adapters (real, not mocked)", () => {
  it("Diskwala source reports unsupported (no official API)", async () => {
    const r = await new DiskwalaSourceAdapter().inspect();
    expect(r.supported).toBe(false);
  });

  it("13. a Diskwala→TeraBox conversion ends as 'unsupported', never 'completed'", async () => {
    const rec = newConversionRecord("https://www.diskwala.com/app/abc123xyz");
    const final = await runConversion(rec, { source: new DiskwalaSourceAdapter(), destination: new TeraBoxDestinationAdapter(), onUpdate: () => {} });
    expect(final.status).toBe("unsupported");
    expect(final.resultUrl).toBeNull();
    expect(final.progress).toBeNull();
  });

  it("17. TeraBox destination reports missing API credentials", () => {
    const saved = { id: process.env.TERABOX_CLIENT_ID, secret: process.env.TERABOX_CLIENT_SECRET };
    delete process.env.TERABOX_CLIENT_ID;
    delete process.env.TERABOX_CLIENT_SECRET;
    const r = new TeraBoxDestinationAdapter().readiness();
    expect(r).toMatchObject({ ready: false, kind: "missing_credentials" });
    process.env.TERABOX_CLIENT_ID = "x";
    process.env.TERABOX_CLIENT_SECRET = "y";
    expect(new TeraBoxDestinationAdapter().readiness()).toMatchObject({ ready: false, kind: "unsupported" });
    if (saved.id === undefined) delete process.env.TERABOX_CLIENT_ID;
    else process.env.TERABOX_CLIENT_ID = saved.id;
    if (saved.secret === undefined) delete process.env.TERABOX_CLIENT_SECRET;
    else process.env.TERABOX_CLIENT_SECRET = saved.secret;
  });
});
