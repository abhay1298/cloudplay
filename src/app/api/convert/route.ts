import { z } from "zod";
import { apiError, guard, isResponse, json, readJson } from "@/lib/api";
import { urlSchema } from "@/lib/validation";
import { startDiskwalaToTeraBox } from "@/services/conversion/jobs";

export const runtime = "nodejs";

const Body = z.object({ url: urlSchema });

export async function POST(req: Request) {
  const blocked = guard(req, { bucket: "convert", capacity: 10, refill: 0.2 });
  if (blocked) return blocked;
  const body = await readJson(req);
  if (isResponse(body)) return body;
  const parsed = Body.safeParse(body);
  if (!parsed.success) return apiError(400, "A Diskwala URL is required.");
  const started = startDiskwalaToTeraBox(parsed.data.url);
  if (!started.ok) return apiError(400, started.error);
  return json({ record: started.record }, 202);
}
