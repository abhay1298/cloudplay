import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { checkPassword, expectedSessionToken, isPublicPath, isValidSession, safeEqual, safeNextPath } from "@/lib/auth";
import { middleware } from "@/middleware";

afterEach(() => {
  delete process.env.APP_PASSWORD;
});

describe("password login helpers", () => {
  it("is disabled (open) when APP_PASSWORD is unset", async () => {
    expect(await isValidSession(undefined)).toBe(true);
    expect(await checkPassword("anything")).toBe(false);
  });

  it("accepts only the right password and the matching session token", async () => {
    process.env.APP_PASSWORD = "correct horse";
    expect(await checkPassword("correct horse")).toBe(true);
    expect(await checkPassword("correct hors")).toBe(false);
    const token = await expectedSessionToken();
    expect(token).toMatch(/^[a-f0-9]{64}$/);
    expect(await isValidSession(token)).toBe(true);
    expect(await isValidSession("abc")).toBe(false);
    expect(await isValidSession(undefined)).toBe(false);
    // Changing the password invalidates old sessions.
    process.env.APP_PASSWORD = "new password";
    expect(await isValidSession(token)).toBe(false);
  });

  it("safeEqual handles different lengths", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abcd")).toBe(false);
  });

  it("only allows same-site redirect targets after login (no open redirect)", () => {
    expect(safeNextPath("/library?x=1")).toBe("/library?x=1");
    for (const bad of ["https://evil.com", "//evil.com", "/\\evil.com", "javascript:alert(1)", null, ""]) expect(safeNextPath(bad)).toBe("/");
  });

  it("keeps the login page and static assets public, everything else private", () => {
    for (const p of ["/login", "/api/auth/login", "/manifest.webmanifest", "/sw.js", "/icons/icon-192.png", "/_next/static/x.js"]) expect(isPublicPath(p)).toBe(true);
    for (const p of ["/", "/library", "/api/library", "/api/resolve", "/api/auth/logout", "/loginx"]) expect(isPublicPath(p)).toBe(false);
  });
});

describe("middleware gate", () => {
  const req = (path: string, cookie?: string) =>
    new NextRequest(`https://cloudplay.example.com${path}`, { headers: { host: "cloudplay.example.com", ...(cookie ? { cookie } : {}) } });

  it("passes everything through when no password is configured", async () => {
    const res = await middleware(req("/library"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  });

  it("redirects pages and rejects API calls without a session", async () => {
    process.env.APP_PASSWORD = "pw";
    const page = await middleware(req("/library?sort=watched"));
    expect(page.status).toBe(307);
    expect(page.headers.get("location")).toBe("https://cloudplay.example.com/login?next=%2Flibrary%3Fsort%3Dwatched");
    const api = await middleware(req("/api/library"));
    expect(api.status).toBe(401);
    expect((await middleware(req("/login"))).status).toBe(200);
  });

  it("lets a valid session through", async () => {
    process.env.APP_PASSWORD = "pw";
    const token = await expectedSessionToken();
    expect((await middleware(req("/api/library", `cp_session=${token}`))).status).toBe(200);
    expect((await middleware(req("/api/library", "cp_session=forged"))).status).toBe(401);
  });
});
