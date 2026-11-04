"use client";

import {
  Captions,
  CaptionsOff,
  Check,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  Settings2,
  Upload,
  Volume1,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { QualityOption } from "@/types/video";
import { PLAYBACK_SPEEDS, formatTime } from "@/lib/format";

export interface TrackInfo {
  index: number;
  label: string;
}

export interface ControlsProps {
  playing: boolean;
  current: number;
  duration: number;
  bufferedEnd: number;
  volume: number;
  muted: boolean;
  speed: number;
  fullscreen: boolean;
  pipSupported: boolean;
  volumeSettable: boolean;
  qualities: QualityOption[];
  quality: string;
  tracks: TrackInfo[];
  activeTrack: number;
  visible: boolean;
  onTogglePlay(): void;
  onSeek(t: number): void;
  onVolume(v: number): void;
  onToggleMute(): void;
  onSpeed(s: number): void;
  onQuality(id: string): void;
  onTrack(index: number): void;
  onLoadSubtitle(file: File): void;
  onToggleFullscreen(): void;
  onTogglePip(): void;
}

const iconBtn =
  "grid size-10 place-items-center rounded-lg text-white/90 transition hover:bg-white/10 hover:text-white focus-visible:outline-2";

export function VideoControls(p: ControlsProps) {
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [menu]);

  const pct = p.duration > 0 ? (p.current / p.duration) * 100 : 0;
  const bufPct = p.duration > 0 ? (p.bufferedEnd / p.duration) * 100 : 0;
  const VolIcon =
    p.muted || p.volume === 0 ? VolumeX : p.volume < 0.5 ? Volume1 : Volume2;

  return (
    <div
      className={`absolute inset-x-0 bottom-0 z-20 bg-gradient-to-t from-black/85 via-black/50 to-transparent px-2 pt-10 pb-1.5 transition-opacity duration-200 sm:px-4 ${
        p.visible || menu ? "opacity-100" : "pointer-events-none opacity-0"
      }`}
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-2 px-1">
        <input
          type="range"
          className="cp-range w-full"
          aria-label="Seek"
          min={0}
          max={p.duration || 0}
          step={0.1}
          value={Math.min(p.current, p.duration || 0)}
          disabled={!p.duration}
          onChange={(e) => p.onSeek(Number(e.target.value))}
          style={{
            ["--fill" as string]: `${pct}%`,
            ["--buffer" as string]: `${bufPct}%`,
          }}
          aria-valuetext={`${formatTime(p.current)} of ${formatTime(p.duration)}`}
        />
      </div>
      <div className="flex items-center gap-0.5 text-white sm:gap-1">
        <button
          className={iconBtn}
          onClick={p.onTogglePlay}
          aria-label={p.playing ? "Pause (k)" : "Play (k)"}
        >
          {p.playing ? (
            <Pause className="size-5 fill-current" />
          ) : (
            <Play className="size-5 fill-current" />
          )}
        </button>
        <div className="group flex items-center">
          <button
            className={iconBtn}
            onClick={p.onToggleMute}
            aria-label={p.muted ? "Unmute (m)" : "Mute (m)"}
          >
            <VolIcon className="size-5" />
          </button>
          {p.volumeSettable && (
            <input
              type="range"
              className="cp-range hidden w-0 opacity-0 transition-all duration-200 group-focus-within:w-20 group-focus-within:opacity-100 group-hover:w-20 group-hover:opacity-100 sm:block"
              aria-label="Volume"
              min={0}
              max={1}
              step={0.05}
              value={p.muted ? 0 : p.volume}
              onChange={(e) => p.onVolume(Number(e.target.value))}
              style={{
                ["--fill" as string]: `${(p.muted ? 0 : p.volume) * 100}%`,
              }}
            />
          )}
        </div>
        <span
          className="ml-1 text-xs tabular-nums text-white/85 sm:text-[13px]"
          aria-live="off"
        >
          {formatTime(p.current)} / {formatTime(p.duration)}
        </span>
        <div className="ml-auto flex items-center gap-0.5">
          {p.tracks.length > 0 && (
            <button
              className={iconBtn}
              aria-label={
                p.activeTrack >= 0
                  ? "Turn subtitles off (c)"
                  : "Turn subtitles on (c)"
              }
              aria-pressed={p.activeTrack >= 0}
              onClick={() =>
                p.onTrack(p.activeTrack >= 0 ? -1 : p.tracks[0].index)
              }
            >
              {p.activeTrack >= 0 ? (
                <Captions className="size-5" />
              ) : (
                <CaptionsOff className="size-5" />
              )}
            </button>
          )}
          <div className="relative" ref={menuRef}>
            <button
              className={iconBtn}
              aria-label="Playback settings"
              aria-expanded={menu}
              onClick={() => setMenu((m) => !m)}
            >
              <Settings2 className="size-5" />
            </button>
            {menu && (
              <div
                role="menu"
                className="absolute right-0 bottom-12 max-h-[min(70vh,26rem)] w-60 overflow-y-auto rounded-xl border border-white/10 bg-neutral-950/95 p-2 text-sm text-white shadow-2xl backdrop-blur"
              >
                <MenuSection title="Speed">
                  <div className="grid grid-cols-4 gap-1">
                    {PLAYBACK_SPEEDS.map((s) => (
                      <button
                        key={s}
                        role="menuitemradio"
                        aria-checked={p.speed === s}
                        onClick={() => p.onSpeed(s)}
                        className={`rounded-md px-1 py-1.5 text-xs font-medium ${p.speed === s ? "brand-gradient" : "bg-white/5 hover:bg-white/10"}`}
                      >
                        {s}x
                      </button>
                    ))}
                  </div>
                </MenuSection>
                {p.qualities.length > 1 && (
                  <MenuSection title="Quality">
                    {[{ id: "auto", label: "Auto" }, ...p.qualities].map(
                      (q) => (
                        <MenuItem
                          key={q.id}
                          checked={p.quality === q.id}
                          onClick={() => p.onQuality(q.id)}
                        >
                          {q.label}
                        </MenuItem>
                      ),
                    )}
                  </MenuSection>
                )}
                <MenuSection title="Subtitles">
                  {p.tracks.length > 0 && (
                    <>
                      <MenuItem
                        checked={p.activeTrack < 0}
                        onClick={() => p.onTrack(-1)}
                      >
                        Off
                      </MenuItem>
                      {p.tracks.map((t) => (
                        <MenuItem
                          key={t.index}
                          checked={p.activeTrack === t.index}
                          onClick={() => p.onTrack(t.index)}
                        >
                          {t.label}
                        </MenuItem>
                      ))}
                    </>
                  )}
                  {p.tracks.length === 0 && (
                    <p className="px-2 py-1 text-xs text-white/60">
                      None provided by this source.
                    </p>
                  )}
                  <button
                    className="mt-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-white/10"
                    onClick={() => fileRef.current?.click()}
                  >
                    <Upload className="size-3.5" /> Load subtitle file (.vtt /
                    .srt)
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".vtt,.srt,text/vtt"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) p.onLoadSubtitle(f);
                      e.target.value = "";
                    }}
                  />
                </MenuSection>
              </div>
            )}
          </div>
          {p.pipSupported && (
            <button
              className={iconBtn}
              aria-label="Picture-in-picture (p)"
              onClick={p.onTogglePip}
            >
              <PictureInPicture2 className="size-5" />
            </button>
          )}
          <button
            className={iconBtn}
            aria-label={p.fullscreen ? "Exit fullscreen (f)" : "Fullscreen (f)"}
            onClick={p.onToggleFullscreen}
          >
            {p.fullscreen ? (
              <Minimize className="size-5" />
            ) : (
              <Maximize className="size-5" />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

function MenuSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="border-b border-white/10 px-1 py-2 last:border-0">
      <p className="mb-1.5 px-1 text-[11px] font-semibold tracking-wider text-white/50 uppercase">
        {title}
      </p>
      {children}
    </div>
  );
}

function MenuItem({
  checked,
  onClick,
  children,
}: {
  checked: boolean;
  onClick(): void;
  children: React.ReactNode;
}) {
  return (
    <button
      role="menuitemradio"
      aria-checked={checked}
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs hover:bg-white/10"
    >
      {children}
      {checked && <Check className="size-3.5 text-violet-300" />}
    </button>
  );
}
