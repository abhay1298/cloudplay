import { z } from "zod";
import { apiError, guard, isResponse, json, readJson } from "@/lib/api";
import { insertConversion } from "@/lib/database";
import { SHA256_HEX, sanitizeText, urlSchema } from "@/lib/validation";
import { buildManualRecord } from "@/services/conversion/manual";

export const runtime = "nodejs";

const Body = z.object({
  sourceUrl: urlSchema,
  resultUrl: urlSchema,
  fileName: z.string().max(255).nullable().optional(),
  fileSizeBytes: z.number().int().nonnegative().max(1e13).nullable().optional(),
  originalSha256: z.string().regex(SHA256_HEX).nullable().optional(),
  copySha256: z.string().regex(SHA256_HEX).nullable().optional(),
  copySizeBytes: z.number().int().nonnegative().max(1e13).nullable().optional(),
});

export async function POST(req: Request) {
  const blocked = guard(req);
  if (blocked) return blocked;
  const body = await readJson(req);
  if (isResponse(body)) return body;
  const parsed = Body.safeParse(body);
  if (!parsed.success) return apiError(400, "Invalid manual transfer details.");
  const built = buildManualRecord({ ...parsed.data, fileName: sanitizeText(parsed.data.fileName, 255) });
  if (!built.ok) return apiError(400, built.error);
  insertConversion(built.record);
  return json({ record: built.record }, 201);
}
