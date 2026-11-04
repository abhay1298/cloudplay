import { apiError, guard, json } from "@/lib/api";
import { removeLibraryItem } from "@/lib/database";

export const runtime = "nodejs";

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const blocked = guard(req);
  if (blocked) return blocked;
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return apiError(400, "Invalid id.");
  return removeLibraryItem(id) ? json({ ok: true }) : apiError(404, "Not found.");
}
