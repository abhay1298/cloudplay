import { z } from "zod";
import { apiError, guard, isResponse, json, readJson } from "@/lib/api";
import { addLibraryItem, listLibrary } from "@/lib/database";
import { sanitizeText, urlSchema } from "@/lib/validation";
import { detectProvider } from "@/services/providers/registry";

export const runtime = "nodejs";

const Providers = z.enum(["diskwala", "terabox", "direct"]);

export async function GET(req: Request) {
  const blocked = guard(req);
  if (blocked) return blocked;
  const sp = new URL(req.url).searchParams;
  const provider = Providers.safeParse(sp.get("provider"));
  const sort = sp.get("sort") === "watched" ? "watched" : "added";
  const search = sanitizeText(sp.get("search"), 100) ?? undefined;
  return json({ items: listLibrary({ provider: provider.success ? provider.data : undefined, search, sort }) });
}

const Body = z.object({
  url: urlSchema,
  title: z.string().max(300).optional().nullable(),
  durationSeconds: z.number().finite().nonnegative().max(1e7).optional().nullable(),
});

export async function POST(req: Request) {
  const blocked = guard(req);
  if (blocked) return blocked;
  const body = await readJson(req);
  if (isResponse(body)) return body;
  const parsed = Body.safeParse(body);
  if (!parsed.success) return apiError(400, "Invalid library item.");
  const detected = detectProvider(parsed.data.url);
  if (!detected.ok) return apiError(400, detected.error);
  const item = addLibraryItem({
    url: detected.match.normalizedUrl,
    provider: detected.match.provider,
    title: sanitizeText(parsed.data.title),
    durationSeconds: parsed.data.durationSeconds ?? null,
  });
  return json({ item }, 201);
}
