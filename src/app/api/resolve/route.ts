import { z } from "zod";
import { apiError, guard, isResponse, json, readJson } from "@/lib/api";
import { urlSchema } from "@/lib/validation";
import { resolvePlayback } from "@/services/playback/resolve";

export const runtime = "nodejs";

const Body = z.object({ url: urlSchema });

export async function POST(req: Request) {
  const blocked = guard(req, { bucket: "resolve", capacity: 20, refill: 0.5 });
  if (blocked) return blocked;
  const body = await readJson(req);
  if (isResponse(body)) return body;
  const parsed = Body.safeParse(body);
  if (!parsed.success) return apiError(400, "A URL is required.");
  const result = await resolvePlayback(parsed.data.url);
  return json(result);
}
