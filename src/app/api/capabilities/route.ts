import { guard, json } from "@/lib/api";
import { CAPABILITIES } from "@/services/providers/registry";
import { TeraBoxDestinationAdapter } from "@/services/conversion/adapters";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const blocked = guard(req);
  if (blocked) return blocked;
  const tb = new TeraBoxDestinationAdapter().readiness();
  return json({
    providers: CAPABILITIES,
    automaticConversion: { available: false, reason: tb.ready ? "" : tb.reason, credentialsConfigured: tb.ready || tb.kind !== "missing_credentials" },
  });
}
