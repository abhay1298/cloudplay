import type { ConversionRecord } from "@/types/conversion";
import { insertConversion, updateConversion } from "@/lib/database";
import { detectProvider } from "@/services/providers/registry";
import { newConversionRecord, runConversion } from "./engine";
import { DiskwalaSourceAdapter, TeraBoxDestinationAdapter } from "./adapters";

const running = new Set<string>();

export type StartResult = { ok: true; record: ConversionRecord } | { ok: false; error: string };

/** Validate a Diskwala link, persist a job, and run the engine in the background. */
export function startDiskwalaToTeraBox(input: unknown): StartResult {
  const detected = detectProvider(input);
  if (!detected.ok) return { ok: false, error: detected.error };
  if (detected.match.provider !== "diskwala") {
    return { ok: false, error: "Conversion accepts Diskwala sharing links only." };
  }
  if (detected.match.linkType === "unknown") {
    return { ok: false, error: "This is a diskwala.com address, but not a recognized Diskwala sharing link (expected /app/<id>)." };
  }
  if (running.size >= Number(process.env.MAX_CONCURRENT_TRANSFERS ?? 2)) {
    return { ok: false, error: "Too many transfers are running. Try again shortly." };
  }
  const rec = newConversionRecord(detected.match.normalizedUrl, "automatic");
  insertConversion(rec);
  running.add(rec.id);
  void runConversion(rec, {
    source: new DiskwalaSourceAdapter(),
    destination: new TeraBoxDestinationAdapter(),
    onUpdate: (r) => updateConversion(r),
    maxBytes: Number(process.env.MAX_TRANSFER_BYTES ?? 4 * 1024 ** 3),
    tmpRoot: process.env.TRANSFER_TMP_DIR || undefined,
  }).finally(() => running.delete(rec.id));
  return { ok: true, record: rec };
}
