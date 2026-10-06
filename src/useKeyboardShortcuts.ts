import { useEffect, useEffectEvent } from "react";

export interface Shortcut {
  run: () => void;
  /** Whether holding the key down runs the shortcut repeatedly. */
  repeat?: boolean;
  /**
   * Whether the shortcut also works while typing in a text field. Off by
   * default, so that the field keeps its own behaviour for the key, e.g.
   * Space typing a space or Ctrl+Z undoing the typing.
   */
  inTextFields?: boolean;
}

/** Keyed by `shortcutName`, e.g. `" "`, `"Enter"` or `"Ctrl+s"`. */
export type Shortcuts = Partial<Record<string, Shortcut>>;

type KeyState = Pick<
  KeyboardEvent,
  "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey"
>;

export function useKeyboardShortcuts(shortcuts: Shortcuts) {
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const shortcut = shortcuts[shortcutName(event)];
    if (!shortcut) return;
    if (!shortcut.inTextFields && isTextEntry(event.target)) return;

    // Stops a focused button from also being clicked, e.g. Enter pausing
    // playback because the Play button still has focus.
    event.preventDefault();
    if (!event.repeat || shortcut.repeat) shortcut.run();
  });

  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

/**
 * Cmd on macOS counts as Ctrl. Shift only counts together with Ctrl or Alt:
 * on its own it just changes the character a key types.
 */
export function shortcutName(event: KeyState): string {
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey && parts.length > 0) parts.push("Shift");
  parts.push(event.key.length === 1 ? event.key.toLowerCase() : event.key);
  return parts.join("+");
}

function isTextEntry(target: EventTarget | null): boolean {
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLInputElement) return target.type !== "range";
  return target instanceof HTMLElement && target.isContentEditable;
}
