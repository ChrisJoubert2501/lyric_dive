import { useEffect, useEffectEvent } from "react";
import { SHORTCUTS, type ShortcutAction } from "./shortcuts";

// A clicked checkbox or slider keeps the focus, which would otherwise switch
// off every shortcut until the user clicks elsewhere.
const NON_TEXT_INPUTS = new Set([
  "button",
  "checkbox",
  "color",
  "file",
  "radio",
  "range",
  "reset",
  "submit",
]);

export type ShortcutHandlers = Partial<Record<ShortcutAction, () => void>>;

type KeyState = Pick<
  KeyboardEvent,
  "key" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey"
>;

const ACTIONS_BY_KEY = new Map(
  Object.entries(SHORTCUTS).flatMap(([action, { keys }]) =>
    keys.map((key) => [key, action as ShortcutAction] as const),
  ),
);

/** Runs the handlers for the shortcuts defined in `SHORTCUTS`. */
export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    const action = ACTIONS_BY_KEY.get(shortcutName(event));
    const run = action && handlers[action];
    if (!run) return;
    const { repeat, inTextFields } = SHORTCUTS[action];
    if (!inTextFields && isTextEntry(event.target)) return;
    // A modal dialog keeps its own keys, e.g. Escape closing it.
    if (event.target instanceof Element && event.target.closest("dialog")) {
      return;
    }

    // Stops a focused button from also being clicked, e.g. Enter pausing
    // playback because the Play button still has focus.
    event.preventDefault();
    if (!event.repeat || repeat) run();
  });

  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}

/**
 * Cmd on macOS counts as Ctrl. Shift does not count for a key that types a
 * character on its own, because it just changes the character, e.g. `?`.
 */
export function shortcutName(event: KeyState): string {
  const parts: string[] = [];
  if (event.ctrlKey || event.metaKey) parts.push("Ctrl");
  if (event.altKey) parts.push("Alt");
  const typesCharacter = event.key.length === 1;
  if (event.shiftKey && (parts.length > 0 || !typesCharacter)) {
    parts.push("Shift");
  }
  parts.push(typesCharacter ? event.key.toLowerCase() : event.key);
  return parts.join("+");
}

function isTextEntry(target: EventTarget | null): boolean {
  if (target instanceof HTMLTextAreaElement) return true;
  if (target instanceof HTMLInputElement) {
    return !NON_TEXT_INPUTS.has(target.type);
  }
  return target instanceof HTMLElement && target.isContentEditable;
}
