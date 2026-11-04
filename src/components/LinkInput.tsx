"use client";

import { ArrowRightLeft, Link2, Play, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { detectProvider } from "@/services/providers/registry";
import { Button, ProviderBadge } from "./ui";

export function LinkInput({
  initial = "",
  actions = ["play", "convert"],
  onPlay,
  onConvert,
  autoFocus,
}: {
  initial?: string;
  actions?: Array<"play" | "convert">;
  onPlay?: (url: string) => void;
  onConvert?: (url: string) => void;
  autoFocus?: boolean;
}) {
  const router = useRouter();
  const [value, setValue] = useState(initial);
  const [touched, setTouched] = useState(false);
  const detected = useMemo(() => (value.trim() ? detectProvider(value) : null), [value]);

  const play = () => {
    setTouched(true);
    if (!detected?.ok) return;
    const url = detected.match.normalizedUrl;
    if (onPlay) onPlay(url);
    else router.push(`/player?url=${encodeURIComponent(url)}`);
  };
  const convert = () => {
    setTouched(true);
    if (!detected?.ok) return;
    const url = detected.match.normalizedUrl;
    if (onConvert) onConvert(url);
    else router.push(`/convert?url=${encodeURIComponent(url)}`);
  };

  const showError = touched && detected && !detected.ok;
  const canConvert = detected?.ok && detected.match.provider === "diskwala";

  return (
    <form
      className="w-full"
      onSubmit={(e) => {
        e.preventDefault();
        if (actions[0] === "convert") convert();
        else play();
      }}
    >
      <label htmlFor="link-input" className="sr-only">
        Paste a Diskwala, TeraBox or direct video link
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Link2 className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted" aria-hidden />
          <input
            id="link-input"
            type="url"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            autoFocus={autoFocus}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={() => value && setTouched(true)}
            placeholder="Paste a Diskwala, TeraBox or direct video link…"
            aria-invalid={showError ? true : undefined}
            aria-describedby="link-input-hint"
            className="h-12 w-full rounded-xl border border-line bg-surface pr-10 pl-11 text-[15px] text-fg placeholder:text-muted/70 focus:border-accent focus:outline-none"
          />
          {value && (
            <button
              type="button"
              onClick={() => {
                setValue("");
                setTouched(false);
              }}
              className="absolute top-1/2 right-2 -translate-y-1/2 rounded-md p-1.5 text-muted hover:text-fg"
              aria-label="Clear link"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        <div className="flex gap-2">
          {actions.includes("play") && (
            <Button type={actions[0] === "play" ? "submit" : "button"} onClick={actions[0] === "play" ? undefined : play} className="h-12 flex-1 sm:flex-none" variant={actions[0] === "play" ? "primary" : "secondary"}>
              <Play className="size-4" aria-hidden /> Play Video
            </Button>
          )}
          {actions.includes("convert") && (
            <Button
              type={actions[0] === "convert" ? "submit" : "button"}
              onClick={actions[0] === "convert" ? undefined : convert}
              className="h-12 flex-1 sm:flex-none"
              variant={actions[0] === "convert" ? "primary" : "secondary"}
              title={detected?.ok && !canConvert ? "Conversion accepts Diskwala links" : undefined}
              disabled={!!detected?.ok && !canConvert}
            >
              <ArrowRightLeft className="size-4" aria-hidden /> Convert Link
            </Button>
          )}
        </div>
      </div>
      <div id="link-input-hint" className="mt-2 min-h-5 text-xs" aria-live="polite">
        {detected?.ok && (
          <span className="flex flex-wrap items-center gap-2 text-muted">
            Detected <ProviderBadge provider={detected.match.provider} />
            {detected.match.linkType === "unknown" && <span className="text-warning">Unrecognized link format for this provider.</span>}
            {detected.match.shareId && <span className="font-mono">id: {detected.match.shareId}</span>}
          </span>
        )}
        {showError && <span className="text-danger">{detected.error}</span>}
      </div>
    </form>
  );
}
