import { guard, json } from "@/lib/api";
import { clearConversions, listConversions } from "@/lib/database";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const blocked = guard(req, { bucket: "conv-read", capacity: 120, refill: 4 });
  if (blocked) return blocked;
  return json({ items: listConversions() });
}

export async function DELETE(req: Request) {
  const blocked = guard(req);
  if (blocked) return blocked;
  clearConversions();
  return json({ ok: true });
}
