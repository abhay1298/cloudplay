import { z } from "zod";
import { apiError, guard, isResponse, json, readJson } from "@/lib/api";
import { clearWatchHistory, getSettings, getWatchEntry, listRecentlyWatched, saveWatchProgress } from "@/lib/database";
import { sanitizeText, urlSchema } from "@/lib/validation";
import { detectProvider } from "@/services/providers/registry";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const blocked = guard(req, { bucket: "watch", capacity: 120, refill: 2 });
  if (blocked) return blocked;
  const url = new URL(req.url).searchParams.get("url");
  if (url) {
    const d = detectProvider(url);
    return json({ entry: d.ok ? getWatchEntry(d.match.normalizedUrl) : null });
  }
  return json({ items: listRecentlyWatched(24) });
}

const Body = z.object({
  url: urlSchema,
  positionSeconds: z.number().finite().nonnegative().max(1e7),
  durationSeconds: z.number().finite().nonnegative().max(1e7).nullable().optional(),
  title: z.string().max(300).nullable().optional(),
});

export async function POST(req: Request) {
  const blocked = guard(req, { bucket: "watch", capacity: 120, refill: 2 });
  if (blocked) return blocked;
  const body = await readJson(req);
  if (isResponse(body)) return body;
  const parsed = Body.safeParse(body);
  if (!parsed.success) return apiError(400, "Invalid progress update.");
  if (!getSettings().saveWatchHistory) return json({ ok: true, saved: false });
  const d = detectProvider(parsed.data.url);
  if (!d.ok || d.match.provider !== "direct") return apiError(400, "Progress is only tracked for playable links.");
  saveWatchProgress({
    url: d.match.normalizedUrl,
    provider: d.match.provider,
    title: sanitizeText(parsed.data.title),
    positionSeconds: parsed.data.positionSeconds,
    durationSeconds: parsed.data.durationSeconds ?? null,
  });
  return json({ ok: true, saved: true });
}

export async function DELETE(req: Request) {
  const blocked = guard(req);
  if (blocked) return blocked;
  clearWatchHistory();
  return json({ ok: true });
}
