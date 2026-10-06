import { useEffect, useEffectEvent } from "react";

/** Keyed by `KeyboardEvent.key`, e.g. `" "` or `"Enter"`. */
export type Shortcuts = Partial<Record<string, () => void>>;

export function useKeyboardShortcuts(shortcuts: Shortcuts) {
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const shortcut = shortcuts[event.key];
    if (
      !shortcut ||
      event.ctrlKey ||
      event.altKey ||
      event.metaKey ||
      isTextEntry(event.target)
    ) {
      return;
    }
    // Stops a focused button from also being clicked, e.g. Enter pausing
    // playback because the Play button still has focus.
    event.preventDefault();
    if (!event.repeat) shortcut();
  });

  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

function isTextEntry(target: EventTarget | null): boolean {
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLInputElement) return target.type !== "range";
  return target instanceof HTMLElement && target.isContentEditable;
}
