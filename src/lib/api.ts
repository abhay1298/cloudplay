import { NextResponse } from "next/server";
import { checkSameOrigin, clientKey, rateLimit } from "./security";

export const MAX_JSON_BYTES = 16 * 1024;

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "cache-control": "no-store" } });
}

export function apiError(status: number, error: string, extra: Record<string, unknown> = {}) {
  return json({ error, ...extra }, status);
}

/**
 * Common guard for API routes: rate limiting + same-origin check for state-changing methods.
 * Returns a Response to short-circuit with, or null to continue.
 */
export function guard(req: Request, opts: { bucket?: string; capacity?: number; refill?: number } = {}): Response | null {
  const key = `${opts.bucket ?? "api"}:${clientKey(req)}`;
  if (!rateLimit(key, opts.capacity ?? 60, opts.refill ?? 1)) {
    return apiError(429, "Too many requests. Please slow down.", { code: "RATE_LIMITED" });
  }
  if (req.method !== "GET" && req.method !== "HEAD" && !checkSameOrigin(req)) {
    return apiError(403, "Cross-origin request rejected.");
  }
  return null;
}

/** Read a JSON body with a hard size limit. */
export async function readJson(req: Request, limit = MAX_JSON_BYTES): Promise<unknown | Response> {
  const ct = req.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) return apiError(415, "Expected application/json.");
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > limit) return apiError(413, "Request body too large.");
  const text = await req.text();
  if (Buffer.byteLength(text) > limit) return apiError(413, "Request body too large.");
  try {
    return JSON.parse(text);
  } catch {
    return apiError(400, "Malformed JSON.");
  }
}

export function isResponse(x: unknown): x is Response {
  return x instanceof Response;
}
