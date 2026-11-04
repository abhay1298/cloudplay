import { z } from "zod";
import { apiError, guard, isResponse, json, readJson } from "@/lib/api";
import { getSettings, saveSettings } from "@/lib/database";
import { PLAYBACK_SPEEDS } from "@/lib/format";

export const runtime = "nodejs";

const Patch = z
  .object({
    theme: z.enum(["dark", "light", "system"]),
    defaultSpeed: z.number().refine((n) => PLAYBACK_SPEEDS.includes(n as (typeof PLAYBACK_SPEEDS)[number]), "Unsupported speed"),
    autoplay: z.boolean(),
    resumePlayback: z.boolean(),
    saveWatchHistory: z.boolean(),
  })
  .partial()
  .strict();

export async function GET(req: Request) {
  const blocked = guard(req);
  if (blocked) return blocked;
  return json({ settings: getSettings() });
}

export async function PUT(req: Request) {
  const blocked = guard(req);
  if (blocked) return blocked;
  const body = await readJson(req);
  if (isResponse(body)) return body;
  const parsed = Patch.safeParse(body);
  if (!parsed.success) return apiError(400, "Invalid settings.");
  return json({ settings: saveSettings(parsed.data) });
}
