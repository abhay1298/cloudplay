"use client";

import { useCallback, useRef, useState } from "react";

export interface LocalFileFacts {
  name: string;
  sizeBytes: number;
  type: string;
  sha256: string | null;
  durationSeconds?: number;
  width?: number;
  height?: number;
}

const CHUNK = 8 * 1024 * 1024;

/** Read media facts from a local File using the browser's own decoder. Nothing is uploaded. */
export function probeLocalMedia(file: File): Promise<Pick<LocalFileFacts, "durationSeconds" | "width" | "height">> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v = document.createElement("video");
    const done = (r: Pick<LocalFileFacts, "durationSeconds" | "width" | "height">) => {
      URL.revokeObjectURL(url);
      v.removeAttribute("src");
      resolve(r);
    };
    const timer = setTimeout(() => done({}), 8000);
    v.preload = "metadata";
    v.onloadedmetadata = () => {
      clearTimeout(timer);
      done({
        durationSeconds: Number.isFinite(v.duration) ? v.duration : undefined,
        width: v.videoWidth || undefined,
        height: v.videoHeight || undefined,
      });
    };
    v.onerror = () => {
      clearTimeout(timer);
      done({});
    };
    v.src = url;
  });
}

/** Incremental SHA-256 of a local file (streams 8 MiB slices; works for multi-GB files). */
export function useFileInspector() {
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cancelled = useRef(false);

  const inspect = useCallback(async (file: File): Promise<LocalFileFacts | null> => {
    cancelled.current = false;
    setError(null);
    setProgress(0);
    try {
      const { createSHA256 } = await import("hash-wasm");
      const hasher = await createSHA256();
      hasher.init();
      for (let off = 0; off < file.size; off += CHUNK) {
        if (cancelled.current) {
          setProgress(null);
          return null;
        }
        const buf = new Uint8Array(await file.slice(off, off + CHUNK).arrayBuffer());
        hasher.update(buf);
        setProgress(Math.min(off + CHUNK, file.size) / file.size);
      }
      const sha256 = hasher.digest("hex");
      const media = await probeLocalMedia(file);
      setProgress(null);
      return { name: file.name, sizeBytes: file.size, type: file.type, sha256, ...media };
    } catch (e) {
      setProgress(null);
      setError(e instanceof Error ? e.message : "Could not read the file.");
      return null;
    }
  }, []);

  const cancel = useCallback(() => {
    cancelled.current = true;
  }, []);

  return { inspect, cancel, progress, error };
}
