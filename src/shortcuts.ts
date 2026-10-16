export const NUDGE_MS = 50;
export const SKIP_MS = 3000;

export const SHORTCUT_GROUPS = [
  "Playback",
  "Syncing",
  "Editing lines",
  "Project",
  "General",
] as const;

export interface ShortcutDefinition {
  group: (typeof SHORTCUT_GROUPS)[number];
  /** Named as by `shortcutName`, e.g. `" "`, `"Enter"` or `"Ctrl+s"`. */
  keys: string[];
  description: string;
  /** Whether holding the key down runs the shortcut repeatedly. */
  repeat?: boolean;
  /**
   * Whether the shortcut also works while typing in a text field. Off by
   * default, so that the field keeps its own behaviour for the key, e.g.
   * Space typing a space or Ctrl+Z undoing the typing.
   */
  inTextFields?: boolean;
}

const definitions = {
  togglePlayback: {
    group: "Playback",
    keys: [" "],
    description: "Play or pause",
  },
  skipBack: {
    group: "Playback",
    keys: ["Shift+ArrowLeft"],
    description: `Go back ${SKIP_MS / 1000} seconds`,
    repeat: true,
  },
  skipForward: {
    group: "Playback",
    keys: ["Shift+ArrowRight"],
    description: `Go forward ${SKIP_MS / 1000} seconds`,
    repeat: true,
  },
  seekToSelectedLine: {
    group: "Playback",
    keys: ["r"],
    description: "Go to the selected line's time",
  },

  stampSelectedLine: {
    group: "Syncing",
    keys: ["Enter"],
    description: "Stamp the selected line and select the next",
  },
  selectPreviousLine: {
    group: "Syncing",
    keys: ["ArrowUp"],
    description: "Select the previous line",
    repeat: true,
  },
  selectNextLine: {
    group: "Syncing",
    keys: ["ArrowDown"],
    description: "Select the next line",
    repeat: true,
  },
  nudgeEarlier: {
    group: "Syncing",
    keys: ["ArrowLeft"],
    description: `Move the selected line's time ${NUDGE_MS} ms earlier`,
    repeat: true,
  },
  nudgeLater: {
    group: "Syncing",
    keys: ["ArrowRight"],
    description: `Move the selected line's time ${NUDGE_MS} ms later`,
    repeat: true,
  },
  clearTime: {
    group: "Syncing",
    keys: ["Backspace"],
    description: "Clear the selected line's time",
  },
  toggleFollow: {
    group: "Syncing",
    keys: ["f"],
    description: "Follow the lyrics while playing, or stop following them",
  },

  editText: {
    group: "Editing lines",
    keys: ["e"],
    description: "Edit the selected line's text",
  },
  editTime: {
    group: "Editing lines",
    keys: ["t"],
    description: "Type the selected line's time",
  },
  insertLine: {
    group: "Editing lines",
    keys: ["i"],
    description: "Insert a line below the selected one",
  },
  moveLineUp: {
    group: "Editing lines",
    keys: ["Alt+ArrowUp"],
    description: "Move the selected line up",
    repeat: true,
  },
  moveLineDown: {
    group: "Editing lines",
    keys: ["Alt+ArrowDown"],
    description: "Move the selected line down",
    repeat: true,
  },
  deleteLine: {
    group: "Editing lines",
    keys: ["Delete"],
    description: "Delete the selected line",
  },
  submitLyrics: {
    group: "Editing lines",
    keys: ["Ctrl+Enter"],
    description: "Use the pasted lyrics",
    inTextFields: true,
  },
  undo: {
    group: "Editing lines",
    keys: ["Ctrl+z"],
    description: "Undo",
    repeat: true,
  },
  redo: {
    group: "Editing lines",
    keys: ["Ctrl+Shift+z", "Ctrl+y"],
    description: "Redo",
    repeat: true,
  },

  newProject: {
    group: "Project",
    keys: ["Ctrl+n"],
    description: "New project",
    inTextFields: true,
  },
  openProject: {
    group: "Project",
    keys: ["Ctrl+o"],
    description: "Open a project",
    inTextFields: true,
  },
  saveProject: {
    group: "Project",
    keys: ["Ctrl+s"],
    description: "Save",
    inTextFields: true,
  },
  saveProjectAs: {
    group: "Project",
    keys: ["Ctrl+Shift+s"],
    description: "Save as",
    inTextFields: true,
  },
  openAudio: {
    group: "Project",
    keys: ["Ctrl+Shift+o"],
    description: "Open an MP3",
    inTextFields: true,
  },
  importLrc: {
    group: "Project",
    keys: ["Ctrl+i"],
    description: "Import LRC",
    inTextFields: true,
  },
  exportLrc: {
    group: "Project",
    keys: ["Ctrl+e"],
    description: "Export LRC",
    inTextFields: true,
  },

  showShortcuts: {
    group: "General",
    keys: ["?"],
    description: "Show keyboard shortcuts",
  },
  leaveTextField: {
    group: "General",
    keys: ["Escape"],
    description: "Leave a text field, so that the shortcuts work again",
    inTextFields: true,
  },
} satisfies Record<string, ShortcutDefinition>;

export type ShortcutAction = keyof typeof definitions;

export const SHORTCUTS: Record<ShortcutAction, ShortcutDefinition> =
  definitions;

const KEY_LABELS: Record<string, string> = {
  " ": "Space",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
};

/** Formats a key named as by `shortcutName` for display, e.g. `Ctrl+S`. */
export function formatKey(key: string): string {
  return key
    .split("+")
    .map(
      (part) =>
        KEY_LABELS[part] ?? (part.length === 1 ? part.toUpperCase() : part),
    )
    .join("+");
}

/** All keys of an action, for a tooltip, e.g. `Ctrl+Shift+Z or Ctrl+Y`. */
export function shortcutLabel(action: ShortcutAction): string {
  return SHORTCUTS[action].keys.map(formatKey).join(" or ");
}
