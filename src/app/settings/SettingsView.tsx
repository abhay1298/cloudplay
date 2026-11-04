"use client";

import { Check, Loader2, LogOut, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import type { AppSettings } from "@/lib/database";
import { api } from "@/lib/client";
import { PLAYBACK_SPEEDS } from "@/lib/format";
import { Button, PageHeader, StatusPill } from "@/components/ui";
import type { ProviderCapabilities, ProviderId } from "@/types/provider";

interface Caps {
  authEnabled: boolean;
  providers: Record<ProviderId, ProviderCapabilities>;
  automaticConversion: { available: boolean; reason: string; credentialsConfigured: boolean };
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2 border-b border-line py-4 last:border-0 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="text-xs text-muted">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition ${checked ? "brand-gradient" : "bg-line"}`}
    >
      <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

export function SettingsView() {
  const [s, setS] = useState<AppSettings | null>(null);
  const [caps, setCaps] = useState<Caps | null>(null);
  const [savedAt, setSavedAt] = useState(0);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    api<{ settings: AppSettings }>("/api/settings").then((r) => setS(r.settings));
    api<Caps>("/api/capabilities").then(setCaps).catch(() => undefined);
  }, []);

  const update = async (patch: Partial<AppSettings>) => {
    setS((prev) => (prev ? { ...prev, ...patch } : prev));
    const { settings } = await api<{ settings: AppSettings }>("/api/settings", { method: "PUT", body: patch });
    setS(settings);
    setSavedAt(Date.now());
    if (patch.theme) {
      const root = document.documentElement;
      if (patch.theme === "system") root.removeAttribute("data-theme");
      else root.dataset.theme = patch.theme;
    }
  };

  if (!s) return <Loader2 className="mx-auto mt-20 size-6 animate-spin text-muted" />;

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Settings"
        actions={
          savedAt > 0 ? (
            <span className="flex items-center gap-1 text-xs text-success">
              <Check className="size-3.5" /> Saved
            </span>
          ) : undefined
        }
      />

      <section className="card mb-6 px-5">
        <h2 className="pt-5 font-semibold">Appearance</h2>
        <Row label="Theme">
          <select value={s.theme} onChange={(e) => update({ theme: e.target.value as AppSettings["theme"] })} className="h-10 rounded-xl border border-line bg-surface px-3 text-sm" aria-label="Theme">
            <option value="dark">Dark</option>
            <option value="light">Light</option>
            <option value="system">System</option>
          </select>
        </Row>
      </section>

      <section className="card mb-6 px-5">
        <h2 className="pt-5 font-semibold">Playback</h2>
        <Row label="Default playback speed">
          <select
            value={s.defaultSpeed}
            onChange={(e) => update({ defaultSpeed: Number(e.target.value) })}
            className="h-10 rounded-xl border border-line bg-surface px-3 text-sm"
            aria-label="Default playback speed"
          >
            {PLAYBACK_SPEEDS.map((x) => (
              <option key={x} value={x}>
                {x}x
              </option>
            ))}
          </select>
        </Row>
        <Row label="Autoplay" hint="Start playing as soon as a video loads. Browsers may block autoplay with sound.">
          <Toggle label="Autoplay" checked={s.autoplay} onChange={(v) => update({ autoplay: v })} />
        </Row>
        <Row label="Resume playback" hint="Continue from where you left off.">
          <Toggle label="Resume playback" checked={s.resumePlayback} onChange={(v) => update({ resumePlayback: v })} />
        </Row>
      </section>

      <section className="card mb-6 px-5">
        <h2 className="pt-5 font-semibold">Privacy &amp; history</h2>
        <Row label="Save watch history" hint="Stores the link, title and position of videos you play. Turn off to stop recording.">
          <Toggle label="Save watch history" checked={s.saveWatchHistory} onChange={(v) => update({ saveWatchHistory: v })} />
        </Row>
        <Row label="Clear watch history">
          <Button
            variant="danger"
            onClick={async () => {
              await api("/api/watch", { method: "DELETE" });
              setMsg("Watch history cleared.");
            }}
          >
            <Trash2 className="size-4" /> Clear
          </Button>
        </Row>
        <Row label="Clear conversion history">
          <Button
            variant="danger"
            onClick={async () => {
              await api("/api/conversions", { method: "DELETE" });
              setMsg("Conversion history cleared.");
            }}
          >
            <Trash2 className="size-4" /> Clear
          </Button>
        </Row>
        {msg && <p className="pb-4 text-sm text-success">{msg}</p>}
        <p className="pb-5 text-xs text-muted">
          CloudPlay never stores passwords, cookies or provider tokens. Local files you play or fingerprint never leave your device.
        </p>
      </section>

      {caps?.authEnabled && (
        <section className="card mb-6 px-5">
          <h2 className="pt-5 font-semibold">Account</h2>
          <Row label="Sign out" hint="This device will need the password again.">
            <Button
              variant="secondary"
              onClick={async () => {
                await api("/api/auth/logout", { method: "POST" });
                window.location.assign("/login");
              }}
            >
              <LogOut className="size-4" /> Sign out
            </Button>
          </Row>
        </section>
      )}

      <section className="card px-5 pb-5">
        <h2 className="pt-5 font-semibold">Integrations</h2>
        {caps ? (
          <ul className="mt-3 space-y-3 text-sm">
            <li className="flex items-start justify-between gap-4">
              <div>
                <p className="font-medium">TeraBox Open Platform</p>
                <p className="text-xs text-muted">{caps.providers.terabox.officialApi.reason}</p>
              </div>
              <StatusPill status={caps.automaticConversion.credentialsConfigured ? "unverified" : "requires-credentials"} />
            </li>
            <li className="flex items-start justify-between gap-4">
              <div>
                <p className="font-medium">Diskwala API</p>
                <p className="text-xs text-muted">{caps.providers.diskwala.officialApi.reason}</p>
              </div>
              <StatusPill status={caps.providers.diskwala.officialApi.status} />
            </li>
            <li className="flex items-start justify-between gap-4">
              <div>
                <p className="font-medium">Automatic Diskwala → TeraBox transfer</p>
                <p className="text-xs text-muted">{caps.automaticConversion.reason}</p>
              </div>
              <StatusPill status="unsupported" />
            </li>
          </ul>
        ) : (
          <Loader2 className="mt-3 size-5 animate-spin text-muted" />
        )}
      </section>
    </div>
  );
}
