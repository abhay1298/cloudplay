"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ConversionRecord } from "@/types/conversion";
import { TERMINAL_STATUSES } from "@/types/conversion";
import { api } from "@/lib/client";
import { LinkInput } from "@/components/LinkInput";
import { ConversionCard } from "@/components/ConversionCard";
import { ManualTransfer } from "@/components/ManualTransfer";
import { ErrorMessage } from "@/components/ErrorMessage";
import { CapabilityGrid } from "@/components/CapabilityGrid";
import { PageHeader } from "@/components/ui";

export function ConvertView() {
  const params = useSearchParams();
  const router = useRouter();
  const url = params.get("url");
  const [rec, setRec] = useState<ConversionRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef<string | null>(null);

  const start = useCallback(async (target: string) => {
    setError(null);
    setRec(null);
    try {
      const { record } = await api<{ record: ConversionRecord }>("/api/convert", { method: "POST", body: { url: target } });
      setRec(record);
      let current = record;
      while (!TERMINAL_STATUSES.includes(current.status)) {
        await new Promise((r) => setTimeout(r, 600));
        current = (await api<{ record: ConversionRecord }>(`/api/conversions/${record.id}`)).record;
        setRec(current);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start the transfer.");
    }
  }, []);

  useEffect(() => {
    if (url && started.current !== url) {
      started.current = url;
      void start(url);
    }
  }, [url, start]);

  const fallback = rec && (rec.status === "unsupported" || rec.status === "failed");

  return (
    <div>
      <PageHeader
        title="Diskwala → TeraBox"
        subtitle="Moves the original file without re-encoding, but only where both services officially allow it. Otherwise CloudPlay guides you through a verified manual transfer."
      />
      <div className="mb-8">
        <LinkInput
          key={url ?? "none"}
          initial={url ?? ""}
          actions={["convert"]}
          onConvert={(u) => {
            if (u === url) {
              started.current = u;
              void start(u);
            } else router.push(`/convert?url=${encodeURIComponent(u)}`);
          }}
        />
      </div>

      {error && (
        <div className="mb-6">
          <ErrorMessage title="Transfer not started" message={error} />
        </div>
      )}

      {rec && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,420px)_1fr]">
          <ConversionCard rec={rec} />
          {fallback && <ManualTransfer sourceUrl={rec.sourceUrl} reason={rec.error} />}
        </div>
      )}

      {!rec && !error && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">What each service allows</h2>
          <CapabilityGrid providers={["diskwala", "terabox"]} />
        </section>
      )}
    </div>
  );
}
