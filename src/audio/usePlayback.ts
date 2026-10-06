import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface PlaybackStatus {
  positionMs: number;
  durationMs: number;
  playing: boolean;
}

/**
 * Playback runs in Rust (ADR 0006). While playing, the position is polled
 * once per animation frame; Rust interpolates it between audio callbacks, so
 * the readout moves smoothly.
 */
export function usePlayback() {
  const [status, setStatus] = useState<PlaybackStatus | null>(null);
  const playing = status?.playing ?? false;

  useEffect(() => {
    if (!playing) return;

    let frame = 0;
    let cancelled = false;
    const tick = async () => {
      const next = await invoke<PlaybackStatus>("playback_status");
      if (cancelled) return;
      setStatus(next);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [playing]);

  const load = useCallback(async (path: string) => {
    setStatus(await invoke<PlaybackStatus>("load_audio", { path }));
  }, []);
  const unload = useCallback(async () => {
    await invoke("unload_audio");
    setStatus(null);
  }, []);
  const play = useCallback(async () => {
    setStatus(await invoke<PlaybackStatus>("play"));
  }, []);
  const pause = useCallback(async () => {
    setStatus(await invoke<PlaybackStatus>("pause"));
  }, []);
  const seek = useCallback(async (positionMs: number) => {
    setStatus(await invoke<PlaybackStatus>("seek", { positionMs }));
  }, []);
  const refresh = useCallback(async () => {
    const next = await invoke<PlaybackStatus>("playback_status");
    setStatus(next);
    return next;
  }, []);

  return { status, load, unload, play, pause, seek, refresh };
}
