import { apiError, guard, json } from "@/lib/api";
import { deleteConversion, getConversion } from "@/lib/database";

export const runtime = "nodejs";
const ID = /^[0-9a-f-]{36}$/;

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const blocked = guard(req, { bucket: "conv-read", capacity: 120, refill: 4 });
  if (blocked) return blocked;
  const { id } = await ctx.params;
  if (!ID.test(id)) return apiError(400, "Invalid id.");
  const rec = getConversion(id);
  return rec ? json({ record: rec }) : apiError(404, "Not found.");
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const blocked = guard(req);
  if (blocked) return blocked;
  const { id } = await ctx.params;
  if (!ID.test(id)) return apiError(400, "Invalid id.");
  return deleteConversion(id) ? json({ ok: true }) : apiError(404, "Not found.");
}
