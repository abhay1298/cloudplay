"use client";

import { ArrowRightLeft, Clock, Loader2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { ConversionRecord } from "@/types/conversion";
import type { WatchEntry } from "@/types/video";
import { api } from "@/lib/client";
import { HistoryList } from "@/components/HistoryList";
import { VideoCard } from "@/components/VideoCard";
import { Button, EmptyState, PageHeader } from "@/components/ui";

export function HistoryView() {
  const [tab, setTab] = useState<"conversions" | "watch">("conversions");
  const [conv, setConv] = useState<ConversionRecord[] | null>(null);
  const [watch, setWatch] = useState<WatchEntry[] | null>(null);
  const [modeFilter, setModeFilter] = useState<"all" | "automatic" | "manual">("all");

  const load = useCallback(() => {
    api<{ items: ConversionRecord[] }>("/api/conversions").then((r) => setConv(r.items)).catch(() => setConv([]));
    api<{ items: WatchEntry[] }>("/api/watch").then((r) => setWatch(r.items)).catch(() => setWatch([]));
  }, []);
  useEffect(load, [load]);

  const del = async (id: string) => {
    await api(`/api/conversions/${id}`, { method: "DELETE" }).catch(() => undefined);
    load();
  };

  const shown = (conv ?? []).filter((c) => modeFilter === "all" || c.mode === modeFilter);

  return (
    <div>
      <PageHeader title="History" subtitle="Conversion attempts, manual transfers and watch history." />
      <div role="tablist" className="mb-6 flex gap-1 rounded-xl bg-surface-2 p-1 sm:w-fit">
        {(
          [
            ["conversions", "Conversions"],
            ["watch", "Watch history"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`flex-1 rounded-lg px-4 py-1.5 text-sm font-medium ${tab === id ? "bg-surface text-fg shadow" : "text-muted hover:text-fg"}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "conversions" && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <select
              value={modeFilter}
              onChange={(e) => setModeFilter(e.target.value as typeof modeFilter)}
              aria-label="Filter by type"
              className="h-10 rounded-xl border border-line bg-surface px-3 text-sm"
            >
              <option value="all">All entries</option>
              <option value="automatic">Automatic attempts</option>
              <option value="manual">Manual transfers</option>
            </select>
            {conv && conv.length > 0 && (
              <Button
                variant="ghost"
                className="ml-auto"
                onClick={async () => {
                  if (!confirm("Delete all conversion history?")) return;
                  await api("/api/conversions", { method: "DELETE" });
                  load();
                }}
              >
                <Trash2 className="size-4" /> Clear all
              </Button>
            )}
          </div>
          {!conv ? (
            <Loader2 className="mx-auto size-6 animate-spin text-muted" />
          ) : shown.length ? (
            <HistoryList items={shown} onDelete={del} />
          ) : (
            <EmptyState icon={<ArrowRightLeft className="size-8" />} title="No conversion history" />
          )}
        </>
      )}

      {tab === "watch" && (
        <>
          {watch && watch.length > 0 && (
            <div className="mb-4 flex">
              <Button
                variant="ghost"
                className="ml-auto"
                onClick={async () => {
                  if (!confirm("Clear watch history and saved playback positions?")) return;
                  await api("/api/watch", { method: "DELETE" });
                  load();
                }}
              >
                <Trash2 className="size-4" /> Clear watch history
              </Button>
            </div>
          )}
          {!watch ? (
            <Loader2 className="mx-auto size-6 animate-spin text-muted" />
          ) : watch.length ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {watch.map((w) => (
                <VideoCard key={w.url} v={{ ...w, when: w.updatedAt }} />
              ))}
            </div>
          ) : (
            <EmptyState icon={<Clock className="size-8" />} title="No watch history" />
          )}
        </>
      )}
    </div>
  );
}
