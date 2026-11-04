"use client";

import { Share, SquarePlus, X } from "lucide-react";
import { useEffect, useState } from "react";

const DISMISS_KEY = "cloudplay:ios-install-dismissed";

function isIos() {
  const ua = navigator.userAgent;
  // iPadOS 13+ reports itself as a Mac; detect it via touch support.
  return /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  // The native iOS shell (Capacitor) appends "CloudPlayiOS" to its user agent.
  if (navigator.userAgent.includes("CloudPlayiOS")) return true;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isSafari() {
  const ua = navigator.userAgent;
  // Only Safari can "Add to Home Screen" as a web app on older iOS; other iOS browsers carry CriOS/FxiOS/EdgiOS.
  return /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}

/** Registers the service worker and shows a one-time "Add to Home Screen" hint in iOS Safari. */
export function PwaSupport() {
  const [showHint, setShowHint] = useState(false);

  useEffect(() => {
    if ("serviceWorker" in navigator && window.isSecureContext) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    }
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      /* storage unavailable */
    }
    if (isIos() && isSafari() && !isStandalone() && !dismissed) setShowHint(true);
  }, []);

  if (!showHint) return null;
  const dismiss = () => {
    setShowHint(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  return (
    <div
      role="dialog"
      aria-label="Install CloudPlay"
      data-testid="ios-install-hint"
      className="fixed inset-x-3 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-40 rounded-2xl border border-line bg-elev/95 p-4 shadow-2xl backdrop-blur lg:inset-x-auto lg:right-6 lg:bottom-6 lg:w-96"
    >
      <button onClick={dismiss} aria-label="Dismiss" className="absolute top-2 right-2 rounded-lg p-1.5 text-muted hover:text-fg">
        <X className="size-4" />
      </button>
      <div className="flex gap-3 pr-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" className="size-12 shrink-0 rounded-xl" />
        <div className="text-sm">
          <p className="font-semibold">Install CloudPlay on your iPhone</p>
          <p className="mt-1 text-muted">
            Tap <Share className="inline size-4 align-text-bottom text-accent-2" aria-label="Share" /> <b className="text-fg">Share</b>, then{" "}
            <SquarePlus className="inline size-4 align-text-bottom text-accent-2" aria-hidden /> <b className="text-fg">Add to Home Screen</b>.
          </p>
        </div>
      </div>
    </div>
  );
}
