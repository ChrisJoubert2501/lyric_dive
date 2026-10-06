import { useEffect, useState } from "react";

/**
 * Polls `currentTime` every animation frame while playing, because the
 * `timeupdate` event only fires a few times per second, which is too coarse
 * for highlighting lyrics.
 */
export function usePlaybackPositionMs(audio: HTMLAudioElement | null): number {
  const [positionMs, setPositionMs] = useState(0);

  useEffect(() => {
    if (!audio) return;

    let frame = 0;
    const update = () => setPositionMs(Math.round(audio.currentTime * 1000));
    const tick = () => {
      update();
      frame = requestAnimationFrame(tick);
    };
    const start = () => {
      cancelAnimationFrame(frame);
      tick();
    };
    const stop = () => {
      cancelAnimationFrame(frame);
      update();
    };

    const listeners: [string, () => void][] = [
      ["play", start],
      ["pause", stop],
      ["ended", stop],
      ["seeked", update],
      ["emptied", update],
    ];
    for (const [event, listener] of listeners) {
      audio.addEventListener(event, listener);
    }

    return () => {
      cancelAnimationFrame(frame);
      for (const [event, listener] of listeners) {
        audio.removeEventListener(event, listener);
      }
    };
  }, [audio]);

  return positionMs;
}
