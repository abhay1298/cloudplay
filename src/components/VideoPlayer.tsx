"use client";

import { Loader2, Play, RotateCcw, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type Hls from "hls.js";
import type { MediaKind, QualityOption } from "@/types/video";
import { formatTime, srtToVtt } from "@/lib/format";
import { VideoControls, type TrackInfo } from "./VideoControls";

export interface MediaFacts {
  durationSeconds?: number;
  width?: number;
  height?: number;
}

export interface VideoPlayerProps {
  src: string;
  kind: MediaKind;
  title?: string;
  startAt?: number;
  defaultSpeed?: number;
  autoplay?: boolean;
  onProgress?: (positionSeconds: number, durationSeconds: number | null) => void;
  onMetadata?: (facts: MediaFacts) => void;
}

const MEDIA_ERRORS: Record<number, string> = {
  1: "Playback was aborted.",
  2: "A network error interrupted the video download.",
  3: "The video could not be decoded. The file may be corrupt or use an unsupported codec.",
  4: "This browser can't play this video. The format or codec is unsupported, or the link is no longer valid.",
};

function isTypingTarget(t: EventTarget | null) {
  const el = t as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return el.isContentEditable || tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}

export function VideoPlayer({ src, kind, title, startAt, defaultSpeed = 1, autoplay = false, onProgress, onMetadata }: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTap = useRef(0);
  const lastPointerType = useRef<string>("mouse");
  const lastSaved = useRef(0);
  const resumeTo = useRef<number | null>(startAt ?? null);
  const progressCb = useRef(onProgress);
  const metaCb = useRef(onMetadata);
  progressCb.current = onProgress;
  metaCb.current = onMetadata;

  const [reloadKey, setReloadKey] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedEnd, setBufferedEnd] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [speed, setSpeed] = useState(defaultSpeed);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [pipSupported, setPipSupported] = useState(false);
  const [volumeSettable, setVolumeSettable] = useState(true);
  const [visible, setVisible] = useState(true);
  const [qualities, setQualities] = useState<QualityOption[]>([]);
  const [quality, setQuality] = useState("auto");
  const [tracks, setTracks] = useState<TrackInfo[]>([]);
  const [activeTrack, setActiveTrack] = useState(-1);
  const [extraTracks, setExtraTracks] = useState<Array<{ label: string; url: string }>>([]);
  const [resumed, setResumed] = useState<number | null>(null);
  const [seekFlash, setSeekFlash] = useState<string | null>(null);

  // ---- source loading -------------------------------------------------------
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    let cancelled = false;
    setError(null);
    setLoading(true);
    setQualities([]);
    setQuality("auto");

    if (kind === "hls") {
      import("hls.js")
        .then(({ default: HlsCtor }) => {
          if (cancelled) return;
          if (HlsCtor.isSupported()) {
            const hls = new HlsCtor({ enableWorker: true });
            hlsRef.current = hls;
            hls.on(HlsCtor.Events.MANIFEST_PARSED, () => {
              const levels = hls.levels;
              if (levels.length > 1) {
                const opts = levels.map((l, i) => ({
                  id: String(i),
                  height: l.height || undefined,
                  label: l.height ? `${l.height >= 2160 ? "4K" : `${l.height}p`}` : `${Math.round(l.bitrate / 1000)} kbps`,
                }));
                const seen = new Map<string, number>();
                for (const o of opts) seen.set(o.label, (seen.get(o.label) ?? 0) + 1);
                setQualities(
                  opts
                    .map((o, i) => (seen.get(o.label)! > 1 ? { ...o, label: `${o.label} · ${Math.round(levels[i].bitrate / 1000)} kbps` } : o))
                    .sort((a, b) => (b.height ?? 0) - (a.height ?? 0)),
                );
              }
            });
            hls.on(HlsCtor.Events.ERROR, (_e, data) => {
              if (!data.fatal) return;
              if (data.type === HlsCtor.ErrorTypes.MEDIA_ERROR) {
                hls.recoverMediaError();
              } else {
                setLoading(false);
                setError(
                  data.type === HlsCtor.ErrorTypes.NETWORK_ERROR
                    ? "The HLS stream could not be loaded. The server may block cross-origin playback (CORS) or the link expired."
                    : "The HLS stream could not be played.",
                );
              }
            });
            hls.loadSource(src);
            hls.attachMedia(video);
          } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
            video.src = src;
          } else {
            setLoading(false);
            setError("This browser supports neither Media Source Extensions nor native HLS playback.");
          }
        })
        .catch(() => setError("Failed to load the HLS playback module."));
    } else {
      video.src = src;
    }
    return () => {
      cancelled = true;
      hlsRef.current?.destroy();
      hlsRef.current = null;
      video.removeAttribute("src");
      video.load();
    };
  }, [src, kind, reloadKey]);

  useEffect(() => {
    setPipSupported(typeof document !== "undefined" && "pictureInPictureEnabled" in document && document.pictureInPictureEnabled);
    // iOS ignores programmatic volume (hardware buttons only); hide the slider there instead of showing a dead control.
    const probe = document.createElement("video");
    probe.volume = 0.5;
    setVolumeSettable(probe.volume === 0.5);
    const onFs = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  // ---- progress persistence --------------------------------------------------
  const saveProgress = useCallback(() => {
    const v = videoRef.current;
    if (!v || !progressCb.current || !Number.isFinite(v.currentTime) || v.currentTime < 1) return;
    progressCb.current(v.currentTime, Number.isFinite(v.duration) ? v.duration : null);
    lastSaved.current = Date.now();
  }, []);

  useEffect(() => {
    const onHide = () => saveProgress();
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      saveProgress();
    };
  }, [saveProgress, src]);

  // ---- subtitle tracks -------------------------------------------------------
  const refreshTracks = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const list: TrackInfo[] = [];
    let active = -1;
    for (let i = 0; i < v.textTracks.length; i++) {
      const t = v.textTracks[i];
      if (t.kind !== "subtitles" && t.kind !== "captions") continue;
      list.push({ index: i, label: t.label || t.language || `Track ${list.length + 1}` });
      if (t.mode === "showing") active = i;
    }
    setTracks(list);
    setActiveTrack(active);
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const tl = v.textTracks;
    tl.addEventListener("addtrack", refreshTracks);
    tl.addEventListener("removetrack", refreshTracks);
    tl.addEventListener("change", refreshTracks);
    return () => {
      tl.removeEventListener("addtrack", refreshTracks);
      tl.removeEventListener("removetrack", refreshTracks);
      tl.removeEventListener("change", refreshTracks);
    };
  }, [refreshTracks]);

  useEffect(() => () => extraTracks.forEach((t) => URL.revokeObjectURL(t.url)), [extraTracks]);

  const selectTrack = useCallback((index: number) => {
    const v = videoRef.current;
    if (!v) return;
    for (let i = 0; i < v.textTracks.length; i++) v.textTracks[i].mode = i === index ? "showing" : "disabled";
    if (hlsRef.current) hlsRef.current.subtitleDisplay = index >= 0;
    setActiveTrack(index);
  }, []);

  const loadSubtitle = useCallback(
    async (file: File) => {
      if (file.size > 2 * 1024 * 1024) {
        setSeekFlash("Subtitle file too large");
        return;
      }
      const text = await file.text();
      const vtt = /\.srt$/i.test(file.name) ? srtToVtt(text) : text;
      if (!vtt.trimStart().startsWith("WEBVTT")) {
        setSeekFlash("Not a valid WebVTT/SRT file");
        return;
      }
      const url = URL.createObjectURL(new Blob([vtt], { type: "text/vtt" }));
      setExtraTracks((prev) => [...prev, { label: file.name.replace(/\.(srt|vtt)$/i, ""), url }]);
      setTimeout(() => {
        const v = videoRef.current;
        if (v && v.textTracks.length) selectTrack(v.textTracks.length - 1);
      }, 100);
    },
    [selectTrack],
  );

  // ---- actions --------------------------------------------------------------
  const flash = (msg: string) => {
    setSeekFlash(msg);
    setTimeout(() => setSeekFlash((m) => (m === msg ? null : m)), 700);
  };

  const showControls = useCallback(() => {
    setVisible(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      if (videoRef.current && !videoRef.current.paused) setVisible(false);
    }, 2800);
  }, []);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v || error) return;
    if (v.paused || v.ended) v.play().catch(() => undefined);
    else v.pause();
  }, [error]);

  const seekTo = useCallback((t: number) => {
    const v = videoRef.current;
    if (!v || !Number.isFinite(v.duration)) return;
    v.currentTime = Math.max(0, Math.min(t, v.duration));
    setCurrent(v.currentTime);
  }, []);

  const seekBy = useCallback(
    (d: number) => {
      const v = videoRef.current;
      if (!v) return;
      seekTo(v.currentTime + d);
      flash(`${d > 0 ? "+" : "−"}${Math.abs(d)}s`);
      showControls();
    },
    [seekTo, showControls],
  );

  const changeVolume = useCallback((val: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = Math.max(0, Math.min(1, val));
    v.muted = v.volume === 0;
  }, []);

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    if (!v.muted && v.volume === 0) v.volume = 0.5;
  }, []);

  const changeSpeed = useCallback((s: number) => {
    const v = videoRef.current;
    if (v) v.playbackRate = s;
    setSpeed(s);
  }, []);

  const toggleFullscreen = useCallback(() => {
    const c = containerRef.current;
    const v = videoRef.current as (HTMLVideoElement & { webkitEnterFullscreen?: () => void }) | null;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    else if (c?.requestFullscreen) c.requestFullscreen().catch(() => v?.webkitEnterFullscreen?.());
    else v?.webkitEnterFullscreen?.(); // iPhone Safari: only the <video> element can go fullscreen (native controls)
  }, []);

  const togglePip = useCallback(async () => {
    const v = videoRef.current;
    if (!v) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await v.requestPictureInPicture();
    } catch {
      flash("Picture-in-picture unavailable");
    }
  }, []);

  const changeQuality = useCallback((id: string) => {
    const hls = hlsRef.current;
    if (!hls) return;
    hls.currentLevel = id === "auto" ? -1 : Number(id);
    setQuality(id);
  }, []);

  const retry = useCallback(() => {
    const v = videoRef.current;
    if (v && v.currentTime > 0) resumeTo.current = v.currentTime;
    setReloadKey((k) => k + 1);
  }, []);

  // ---- keyboard shortcuts ----------------------------------------------------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
      const v = videoRef.current;
      if (!v) return;
      const k = e.key;
      const handled = () => {
        e.preventDefault();
        showControls();
      };
      if (k === " " || k === "k" || k === "K") {
        if (k === " " && (e.target as HTMLElement)?.tagName === "BUTTON") return;
        togglePlay();
        handled();
      } else if (k === "ArrowLeft" || k === "j" || k === "J") {
        seekBy(k === "ArrowLeft" ? -5 : -10);
        handled();
      } else if (k === "ArrowRight" || k === "l" || k === "L") {
        seekBy(k === "ArrowRight" ? 5 : 10);
        handled();
      } else if (k === "ArrowUp") {
        changeVolume(v.volume + 0.05);
        flash(`Volume ${Math.round(Math.min(1, v.volume) * 100)}%`);
        handled();
      } else if (k === "ArrowDown") {
        changeVolume(v.volume - 0.05);
        flash(`Volume ${Math.round(Math.max(0, v.volume) * 100)}%`);
        handled();
      } else if (k === "m" || k === "M") {
        toggleMute();
        handled();
      } else if (k === "f" || k === "F") {
        toggleFullscreen();
        handled();
      } else if (k === "p" || k === "P") {
        void togglePip();
        handled();
      } else if (k === "c" || k === "C") {
        if (tracks.length) selectTrack(activeTrack >= 0 ? -1 : tracks[0].index);
        handled();
      } else if (k === ">" || k === "<") {
        const speeds = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
        const i = speeds.indexOf(v.playbackRate);
        const next = speeds[Math.max(0, Math.min(speeds.length - 1, (i < 0 ? 2 : i) + (k === ">" ? 1 : -1)))];
        changeSpeed(next);
        flash(`${next}x`);
        handled();
      } else if (k === "Home") {
        seekTo(0);
        handled();
      } else if (k === "End") {
        seekTo(v.duration);
        handled();
      } else if (/^[0-9]$/.test(k) && Number.isFinite(v.duration)) {
        seekTo((v.duration * Number(k)) / 10);
        handled();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [togglePlay, seekBy, changeVolume, toggleMute, toggleFullscreen, togglePip, changeSpeed, seekTo, selectTrack, tracks, activeTrack, showControls]);

  // ---- surface interaction (mouse + touch) -----------------------------------
  const onSurfacePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse") return; // mouse handled by click / dblclick
    const now = Date.now();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    if (now - lastTap.current < 300) {
      if (tapTimer.current) clearTimeout(tapTimer.current);
      lastTap.current = 0;
      if (x < 0.35) seekBy(-10);
      else if (x > 0.65) seekBy(10);
      else togglePlay();
      return;
    }
    lastTap.current = now;
    tapTimer.current = setTimeout(() => {
      if (visible) setVisible(false);
      else showControls();
    }, 280);
  };

  return (
    <div
      ref={containerRef}
      className={`group/player relative aspect-video w-full overflow-hidden rounded-2xl bg-black shadow-2xl ring-1 ring-line select-none ${
        fullscreen ? "rounded-none" : ""
      } ${!visible && playing ? "cursor-none" : ""}`}
      onMouseMove={showControls}
      onMouseLeave={() => playing && setVisible(false)}
      data-testid="video-player"
    >
      <video
        ref={videoRef}
        className="absolute inset-0 size-full bg-black object-contain"
        playsInline
        preload="metadata"
        autoPlay={autoplay}
        aria-label={title ?? "Video"}
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          v.playbackRate = speed;
          setDuration(Number.isFinite(v.duration) ? v.duration : 0);
          metaCb.current?.({
            durationSeconds: Number.isFinite(v.duration) ? v.duration : undefined,
            width: v.videoWidth || undefined,
            height: v.videoHeight || undefined,
          });
          const r = resumeTo.current;
          if (r && r > 5 && Number.isFinite(v.duration) && r < v.duration - 10) {
            v.currentTime = r;
            if (startAt && r === startAt) setResumed(r);
          }
          resumeTo.current = null;
          refreshTracks();
        }}
        onDurationChange={(e) => Number.isFinite(e.currentTarget.duration) && setDuration(e.currentTarget.duration)}
        onTimeUpdate={(e) => {
          const v = e.currentTarget;
          setCurrent(v.currentTime);
          if (!v.paused && Date.now() - lastSaved.current > 5000) saveProgress();
        }}
        onProgress={(e) => {
          const b = e.currentTarget.buffered;
          if (b.length) setBufferedEnd(b.end(b.length - 1));
        }}
        onPlay={() => {
          setPlaying(true);
          showControls();
        }}
        onPause={() => {
          setPlaying(false);
          setVisible(true);
          saveProgress();
        }}
        onEnded={() => {
          setPlaying(false);
          setVisible(true);
          saveProgress();
        }}
        onWaiting={() => setLoading(true)}
        onSeeking={() => setLoading(true)}
        onCanPlay={() => setLoading(false)}
        onPlaying={() => setLoading(false)}
        onSeeked={() => setLoading(false)}
        onVolumeChange={(e) => {
          setVolume(e.currentTarget.volume);
          setMuted(e.currentTarget.muted);
        }}
        onRateChange={(e) => setSpeed(e.currentTarget.playbackRate)}
        onError={(e) => {
          if (kind === "hls" && hlsRef.current) return; // hls.js reports its own errors
          const code = e.currentTarget.error?.code ?? 0;
          setLoading(false);
          setError(MEDIA_ERRORS[code] ?? "The video failed to load.");
        }}
      >
        {extraTracks.map((t) => (
          <track key={t.url} kind="subtitles" label={t.label} src={t.url} />
        ))}
      </video>

      {/* interaction surface */}
      <div
        className="absolute inset-0 z-10"
        onPointerDown={(e) => {
          lastPointerType.current = e.pointerType;
        }}
        onClick={() => {
          // Touch/pen taps are handled in onPointerUp (tap = toggle controls, double-tap = seek).
          if (lastPointerType.current === "mouse") togglePlay();
        }}
        onDoubleClick={() => {
          if (lastPointerType.current === "mouse") toggleFullscreen();
        }}
        onPointerUp={onSurfacePointerUp}
        aria-hidden
      />

      {loading && !error && (
        <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center" role="status" aria-label="Loading video">
          <Loader2 className="size-12 animate-spin text-white/90" />
        </div>
      )}

      {!playing && !loading && !error && (
        <button
          onClick={togglePlay}
          className="brand-gradient absolute top-1/2 left-1/2 z-10 grid size-16 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full shadow-2xl transition hover:scale-105 sm:size-20"
          aria-label="Play video"
        >
          <Play className="ml-1 size-7 fill-white text-white sm:size-9" />
        </button>
      )}

      {seekFlash && (
        <div className="pointer-events-none absolute top-6 left-1/2 z-20 -translate-x-1/2 rounded-full bg-black/70 px-4 py-1.5 text-sm font-semibold text-white">
          {seekFlash}
        </div>
      )}

      {resumed !== null && !error && (
        <div className="absolute top-3 left-3 z-20 flex items-center gap-2 rounded-full bg-black/75 py-1 pr-1 pl-3 text-xs text-white">
          Resumed from {formatTime(resumed)}
          <button
            className="flex items-center gap-1 rounded-full bg-white/15 px-2 py-1 hover:bg-white/25"
            onClick={() => {
              seekTo(0);
              setResumed(null);
            }}
          >
            <RotateCcw className="size-3" /> Start over
          </button>
          <button aria-label="Dismiss" className="rounded-full p-1 hover:bg-white/15" onClick={() => setResumed(null)}>
            <X className="size-3" />
          </button>
        </div>
      )}

      {error && (
        <div className="absolute inset-0 z-30 grid place-items-center bg-black/85 p-6 text-center" role="alert">
          <div className="max-w-md">
            <p className="font-semibold text-white">Playback error</p>
            <p className="mt-2 text-sm text-white/70">{error}</p>
            <button
              onClick={retry}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white/15 px-4 py-2 text-sm font-semibold text-white hover:bg-white/25"
            >
              <RotateCcw className="size-4" /> Retry playback
            </button>
          </div>
        </div>
      )}

      {!error && (
        <VideoControls
          playing={playing}
          current={current}
          duration={duration}
          bufferedEnd={bufferedEnd}
          volume={volume}
          muted={muted}
          speed={speed}
          fullscreen={fullscreen}
          pipSupported={pipSupported}
          volumeSettable={volumeSettable}
          qualities={qualities}
          quality={quality}
          tracks={tracks}
          activeTrack={activeTrack}
          visible={visible || !playing}
          onTogglePlay={togglePlay}
          onSeek={seekTo}
          onVolume={changeVolume}
          onToggleMute={toggleMute}
          onSpeed={changeSpeed}
          onQuality={changeQuality}
          onTrack={selectTrack}
          onLoadSubtitle={loadSubtitle}
          onToggleFullscreen={toggleFullscreen}
          onTogglePip={togglePip}
        />
      )}
    </div>
  );
}
