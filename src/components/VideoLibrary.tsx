"use client";

import { Library, Loader2, Plus, Search } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { LibraryItem } from "@/types/video";
import type { ProviderId } from "@/types/provider";
import { api } from "@/lib/client";
import { detectProvider } from "@/services/providers/registry";
import { VideoCard } from "./VideoCard";
import { Button, EmptyState } from "./ui";
import { ErrorMessage } from "./ErrorMessage";

const FILTERS: Array<{ id: ProviderId | "all"; label: string }> = [
  { id: "all", label: "All videos" },
  { id: "diskwala", label: "Diskwala" },
  { id: "terabox", label: "TeraBox" },
  { id: "direct", label: "Direct files" },
];

export function VideoLibrary() {
  const [items, setItems] = useState<LibraryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ProviderId | "all">("all");
  const [sort, setSort] = useState<"added" | "watched">("added");
  const [search, setSearch] = useState("");
  const [newUrl, setNewUrl] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [addError, setAddError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const qs = new URLSearchParams({ sort });
    if (filter !== "all") qs.set("provider", filter);
    if (search.trim()) qs.set("search", search.trim());
    try {
      const { items } = await api<{ items: LibraryItem[] }>(`/api/library?${qs}`);
      setItems(items);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load library.");
    }
  }, [filter, sort, search]);

  useEffect(() => {
    const t = setTimeout(load, search ? 250 : 0);
    return () => clearTimeout(t);
  }, [load, search]);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    const d = detectProvider(newUrl);
    if (!d.ok) {
      setAddError(d.error);
      return;
    }
    try {
      await api("/api/library", { method: "POST", body: { url: d.match.normalizedUrl, title: newTitle.trim() || null } });
      setNewUrl("");
      setNewTitle("");
      setAddError(null);
      load();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Could not save.");
    }
  };

  const remove = async (id: string) => {
    await api(`/api/library/${id}`, { method: "DELETE" }).catch(() => undefined);
    load();
  };

  const continueWatching = (items ?? []).filter(
    (i) => i.provider === "direct" && i.positionSeconds && i.durationSeconds && i.positionSeconds / i.durationSeconds < 0.95,
  );

  return (
    <div className="space-y-8">
      <form onSubmit={add} className="card flex flex-col gap-2 p-4 sm:flex-row" aria-label="Save a link">
        <input
          value={newUrl}
          onChange={(e) => setNewUrl(e.target.value)}
          type="url"
          placeholder="Save a Diskwala, TeraBox or direct video link…"
          aria-label="Link to save"
          className="h-10 shrink-0 rounded-xl sm:flex-[2] border border-line bg-surface px-3 text-sm focus:border-accent focus:outline-none"
        />
        <input
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Title (optional)"
          aria-label="Title"
          maxLength={300}
          className="h-10 shrink-0 rounded-xl sm:flex-1 border border-line bg-surface px-3 text-sm focus:border-accent focus:outline-none"
        />
        <Button type="submit" disabled={!newUrl.trim()}>
          <Plus className="size-4" /> Save
        </Button>
      </form>
      {addError && <p className="-mt-6 text-sm text-danger">{addError}</p>}

      {continueWatching.length > 0 && filter === "all" && !search && (
        <section>
          <h2 className="mb-3 text-lg font-semibold">Continue watching</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {continueWatching.slice(0, 4).map((i) => (
              <VideoCard key={i.id} v={{ ...i, when: i.lastWatchedAt }} />
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
          <div role="tablist" aria-label="Filter by provider" className="flex gap-1 overflow-x-auto rounded-xl bg-surface-2 p-1">
            {FILTERS.map((f) => (
              <button
                key={f.id}
                role="tab"
                aria-selected={filter === f.id}
                onClick={() => setFilter(f.id)}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium whitespace-nowrap ${filter === f.id ? "bg-surface text-fg shadow" : "text-muted hover:text-fg"}`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex flex-1 gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search saved videos"
                aria-label="Search saved videos"
                className="h-10 w-full rounded-xl border border-line bg-surface pr-3 pl-9 text-sm focus:border-accent focus:outline-none"
              />
            </div>
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value as "added" | "watched")}
              aria-label="Sort"
              className="h-10 rounded-xl border border-line bg-surface px-3 text-sm"
            >
              <option value="added">Recently added</option>
              <option value="watched">Recently watched</option>
            </select>
          </div>
        </div>

        {error && <ErrorMessage message={error} onRetry={load} />}
        {!items && !error && (
          <div className="grid place-items-center py-16 text-muted">
            <Loader2 className="size-6 animate-spin" />
          </div>
        )}
        {items && items.length === 0 && (
          <EmptyState icon={<Library className="size-8" />} title={search || filter !== "all" ? "No matching videos" : "Your library is empty"}>
            Save links above, or use “Save to library” on the player page.
          </EmptyState>
        )}
        {items && items.length > 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((i) => (
              <VideoCard key={i.id} v={{ ...i, when: sort === "watched" ? i.lastWatchedAt : i.addedAt }} onRemove={() => remove(i.id)} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
