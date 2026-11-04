import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import type { LibraryItem, WatchEntry } from "@/types/video";
import type { ConversionRecord, ConversionStatus } from "@/types/conversion";
import type { ProviderId } from "@/types/provider";

// Load node:sqlite lazily via process.getBuiltinModule so bundlers leave it alone.
function loadSqlite(): typeof import("node:sqlite") {
  return process.getBuiltinModule("node:sqlite") as typeof import("node:sqlite");
}

let db: DatabaseSyncType | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS library_items (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL,
  title TEXT,
  thumbnail TEXT,
  duration_seconds REAL,
  added_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS watch_entries (
  url TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  title TEXT,
  position_seconds REAL NOT NULL DEFAULT 0,
  duration_seconds REAL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS conversions (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL,
  status TEXT NOT NULL,
  source_url TEXT NOT NULL,
  result_url TEXT,
  file_name TEXT,
  file_size_bytes INTEGER,
  progress REAL,
  error TEXT,
  verification TEXT,
  steps TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_watch_updated ON watch_entries(updated_at);
CREATE INDEX IF NOT EXISTS idx_conv_created ON conversions(created_at);
`;

export function getDb(): DatabaseSyncType {
  if (db) return db;
  const file = process.env.DATABASE_PATH ?? path.join(process.cwd(), "data", "cloudplay.db");
  if (file !== ":memory:") fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true, mode: 0o700 });
  const { DatabaseSync } = loadSqlite();
  db = new DatabaseSync(file);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
  db.exec(SCHEMA);
  return db;
}

/** Test helper: close and forget the current connection. */
export function closeDb() {
  db?.close();
  db = null;
}

const now = () => new Date().toISOString();
type Row = Record<string, unknown>;

// ---------------------------------------------------------------------------
// Library
// ---------------------------------------------------------------------------

function toLibraryItem(r: Row): LibraryItem {
  return {
    id: r.id as string,
    url: r.url as string,
    provider: r.provider as ProviderId,
    title: (r.title as string) ?? null,
    thumbnail: (r.thumbnail as string) ?? null,
    durationSeconds: (r.duration_seconds as number) ?? (r.w_duration as number) ?? null,
    addedAt: r.added_at as string,
    lastWatchedAt: (r.updated_at as string) ?? null,
    positionSeconds: (r.position_seconds as number) ?? null,
  };
}

export interface LibraryQuery {
  provider?: ProviderId;
  search?: string;
  sort?: "added" | "watched";
}

export function listLibrary(q: LibraryQuery = {}): LibraryItem[] {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (q.provider) {
    where.push("l.provider = ?");
    params.push(q.provider);
  }
  if (q.search) {
    where.push("(l.title LIKE ? ESCAPE '\\' OR l.url LIKE ? ESCAPE '\\')");
    const like = `%${q.search.replace(/[\\%_]/g, (c) => "\\" + c)}%`;
    params.push(like, like);
  }
  const order = q.sort === "watched" ? "w.updated_at IS NULL, w.updated_at DESC, l.added_at DESC" : "l.added_at DESC";
  const sql = `SELECT l.*, w.position_seconds, w.updated_at, w.duration_seconds AS w_duration
    FROM library_items l LEFT JOIN watch_entries w ON w.url = l.url
    ${where.length ? "WHERE " + where.join(" AND ") : ""} ORDER BY ${order} LIMIT 500`;
  return (getDb().prepare(sql).all(...params) as Row[]).map(toLibraryItem);
}

export function addLibraryItem(input: {
  url: string;
  provider: ProviderId;
  title?: string | null;
  thumbnail?: string | null;
  durationSeconds?: number | null;
}): LibraryItem {
  const d = getDb();
  const existing = d.prepare("SELECT id FROM library_items WHERE url = ?").get(input.url) as Row | undefined;
  if (existing) {
    d.prepare("UPDATE library_items SET title = COALESCE(?, title), duration_seconds = COALESCE(?, duration_seconds) WHERE id = ?")
      .run(input.title ?? null, input.durationSeconds ?? null, existing.id as string);
    return getLibraryItem(existing.id as string)!;
  }
  const id = crypto.randomUUID();
  d.prepare(
    "INSERT INTO library_items (id, url, provider, title, thumbnail, duration_seconds, added_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
  ).run(id, input.url, input.provider, input.title ?? null, input.thumbnail ?? null, input.durationSeconds ?? null, now());
  return getLibraryItem(id)!;
}

export function getLibraryItem(id: string): LibraryItem | null {
  const r = getDb()
    .prepare(
      `SELECT l.*, w.position_seconds, w.updated_at, w.duration_seconds AS w_duration
       FROM library_items l LEFT JOIN watch_entries w ON w.url = l.url WHERE l.id = ?`,
    )
    .get(id) as Row | undefined;
  return r ? toLibraryItem(r) : null;
}

export function removeLibraryItem(id: string): boolean {
  return Number(getDb().prepare("DELETE FROM library_items WHERE id = ?").run(id).changes) > 0;
}

// ---------------------------------------------------------------------------
// Watch progress / history
// ---------------------------------------------------------------------------

export function saveWatchProgress(e: Omit<WatchEntry, "updatedAt">): void {
  getDb()
    .prepare(
      `INSERT INTO watch_entries (url, provider, title, position_seconds, duration_seconds, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(url) DO UPDATE SET position_seconds = excluded.position_seconds,
         duration_seconds = COALESCE(excluded.duration_seconds, duration_seconds),
         title = COALESCE(excluded.title, title), updated_at = excluded.updated_at`,
    )
    .run(e.url, e.provider, e.title, e.positionSeconds, e.durationSeconds, now());
}

export function getWatchEntry(url: string): WatchEntry | null {
  const r = getDb().prepare("SELECT * FROM watch_entries WHERE url = ?").get(url) as Row | undefined;
  return r ? toWatch(r) : null;
}

function toWatch(r: Row): WatchEntry {
  return {
    url: r.url as string,
    provider: r.provider as ProviderId,
    title: (r.title as string) ?? null,
    positionSeconds: r.position_seconds as number,
    durationSeconds: (r.duration_seconds as number) ?? null,
    updatedAt: r.updated_at as string,
  };
}

export function listRecentlyWatched(limit = 12): WatchEntry[] {
  return (getDb().prepare("SELECT * FROM watch_entries ORDER BY updated_at DESC LIMIT ?").all(limit) as Row[]).map(toWatch);
}

export function clearWatchHistory(): void {
  getDb().exec("DELETE FROM watch_entries");
}

// ---------------------------------------------------------------------------
// Conversions
// ---------------------------------------------------------------------------

function toConversion(r: Row): ConversionRecord {
  return {
    id: r.id as string,
    mode: r.mode as ConversionRecord["mode"],
    status: r.status as ConversionStatus,
    sourceUrl: r.source_url as string,
    resultUrl: (r.result_url as string) ?? null,
    fileName: (r.file_name as string) ?? null,
    fileSizeBytes: (r.file_size_bytes as number) ?? null,
    progress: (r.progress as number) ?? null,
    error: (r.error as string) ?? null,
    verification: r.verification ? JSON.parse(r.verification as string) : null,
    steps: JSON.parse((r.steps as string) || "[]"),
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export function insertConversion(rec: ConversionRecord): void {
  getDb()
    .prepare(
      `INSERT INTO conversions (id, mode, status, source_url, result_url, file_name, file_size_bytes, progress, error, verification, steps, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      rec.id, rec.mode, rec.status, rec.sourceUrl, rec.resultUrl, rec.fileName, rec.fileSizeBytes, rec.progress,
      rec.error, rec.verification ? JSON.stringify(rec.verification) : null, JSON.stringify(rec.steps),
      rec.createdAt, rec.updatedAt,
    );
}

export function updateConversion(rec: ConversionRecord): void {
  getDb()
    .prepare(
      `UPDATE conversions SET status = ?, result_url = ?, file_name = ?, file_size_bytes = ?, progress = ?, error = ?,
       verification = ?, steps = ?, updated_at = ? WHERE id = ?`,
    )
    .run(
      rec.status, rec.resultUrl, rec.fileName, rec.fileSizeBytes, rec.progress, rec.error,
      rec.verification ? JSON.stringify(rec.verification) : null, JSON.stringify(rec.steps), rec.updatedAt, rec.id,
    );
}

export function getConversion(id: string): ConversionRecord | null {
  const r = getDb().prepare("SELECT * FROM conversions WHERE id = ?").get(id) as Row | undefined;
  return r ? toConversion(r) : null;
}

export function listConversions(limit = 200): ConversionRecord[] {
  return (getDb().prepare("SELECT * FROM conversions ORDER BY created_at DESC LIMIT ?").all(limit) as Row[]).map(toConversion);
}

export function deleteConversion(id: string): boolean {
  return Number(getDb().prepare("DELETE FROM conversions WHERE id = ?").run(id).changes) > 0;
}

export function clearConversions(): void {
  getDb().exec("DELETE FROM conversions");
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export interface AppSettings {
  theme: "dark" | "light" | "system";
  defaultSpeed: number;
  autoplay: boolean;
  resumePlayback: boolean;
  saveWatchHistory: boolean;
}

export const DEFAULT_SETTINGS: AppSettings = {
  theme: "dark",
  defaultSpeed: 1,
  autoplay: false,
  resumePlayback: true,
  saveWatchHistory: true,
};

export function getSettings(): AppSettings {
  const rows = getDb().prepare("SELECT key, value FROM settings").all() as Row[];
  const out: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    if ((r.key as string) in DEFAULT_SETTINGS) out[r.key as string] = JSON.parse(r.value as string);
  }
  return out as unknown as AppSettings;
}

export function saveSettings(patch: Partial<AppSettings>): AppSettings {
  const stmt = getDb().prepare("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
  for (const [k, v] of Object.entries(patch)) {
    if (k in DEFAULT_SETTINGS && v !== undefined) stmt.run(k, JSON.stringify(v));
  }
  return getSettings();
}
