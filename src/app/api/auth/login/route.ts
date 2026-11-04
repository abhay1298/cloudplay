import { z } from "zod";
import { apiError, guard, isResponse, json, readJson } from "@/lib/api";
import { SESSION_COOKIE, SESSION_MAX_AGE, authEnabled, checkPassword, expectedSessionToken } from "@/lib/auth";

export const runtime = "nodejs";

const Body = z.object({ password: z.string().min(1).max(256) });

export async function POST(req: Request) {
  // Strict limit against password guessing: burst 5, then 1 attempt per 20 s.
  const blocked = guard(req, { bucket: "login", capacity: 5, refill: 0.05 });
  if (blocked) return blocked;
  if (!authEnabled()) return apiError(400, "Password login is not enabled on this server.");
  const body = await readJson(req, 1024);
  if (isResponse(body)) return body;
  const parsed = Body.safeParse(body);
  if (!parsed.success) return apiError(400, "Enter the password.");
  if (!(await checkPassword(parsed.data.password))) return apiError(401, "Wrong password.");

  const res = json({ ok: true });
  const secure = new URL(req.url).protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
  res.cookies.set(SESSION_COOKIE, (await expectedSessionToken())!, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
