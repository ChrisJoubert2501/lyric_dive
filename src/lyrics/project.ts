import { undoable } from "../history";
import type { LineId, LyricLine, LyricProject, SongMetadata } from "./model";

export type ProjectAction =
  | { type: "projectReplaced"; project: LyricProject }
  | { type: "audioLinked"; path: string }
  | { type: "metadataChanged"; field: keyof SongMetadata; value: string }
  | { type: "linesReplaced"; lines: LyricLine[] }
  | {
      type: "lyricsImported";
      lines: LyricLine[];
      metadata: Partial<SongMetadata>;
    }
  | { type: "lineInserted"; line: LyricLine; index: number }
  | { type: "lineDeleted"; id: LineId }
  | { type: "lineMoved"; id: LineId; offset: -1 | 1 }
  | { type: "lineTextChanged"; id: LineId; text: string }
  | { type: "lineTimeSet"; id: LineId; startMs: number }
  | { type: "lineNudged"; id: LineId; deltaMs: number }
  | { type: "lineTimeCleared"; id: LineId };

/**
 * Returns the same project object when an action changes nothing, so that
 * the undo history does not record steps that undo nothing.
 */
export function projectReducer(
  project: LyricProject,
  action: ProjectAction,
): LyricProject {
  switch (action.type) {
    case "projectReplaced":
      return action.project;
    case "audioLinked":
      return project.audioPath === action.path
        ? project
        : { ...project, audioPath: action.path };
    case "metadataChanged":
      return project.metadata[action.field] === action.value
        ? project
        : {
            ...project,
            metadata: { ...project.metadata, [action.field]: action.value },
          };
    case "linesReplaced":
      return { ...project, lines: action.lines };
    case "lyricsImported":
      return {
        ...project,
        lines: action.lines,
        metadata: { ...project.metadata, ...action.metadata },
      };
    case "lineInserted":
      return {
        ...project,
        lines: [
          ...project.lines.slice(0, action.index),
          action.line,
          ...project.lines.slice(action.index),
        ],
      };
    case "lineDeleted": {
      const lines = project.lines.filter((line) => line.id !== action.id);
      return lines.length === project.lines.length
        ? project
        : { ...project, lines };
    }
    case "lineMoved": {
      const lines = moveLine(project.lines, action);
      return lines === project.lines ? project : { ...project, lines };
    }
    case "lineTextChanged":
      return updateLine(project, action.id, () => ({ text: action.text }));
    case "lineTimeSet":
      return updateLine(project, action.id, () => ({
        startMs: action.startMs,
      }));
    case "lineNudged":
      return updateLine(project, action.id, (line) =>
        line.startMs === null
          ? {}
          : { startMs: Math.max(0, line.startMs + action.deltaMs) },
      );
    case "lineTimeCleared":
      // An end time on its own would be meaningless, so it goes too.
      return updateLine(project, action.id, () => ({
        startMs: null,
        endMs: null,
      }));
  }
}

function updateLine(
  project: LyricProject,
  id: LineId,
  changes: (line: LyricLine) => Partial<LyricLine>,
): LyricProject {
  let changed = false;
  const lines = project.lines.map((line) => {
    if (line.id !== id) return line;
    const patch = changes(line);
    const keys = Object.keys(patch) as (keyof LyricLine)[];
    if (keys.every((key) => line[key] === patch[key])) return line;
    changed = true;
    return { ...line, ...patch };
  });
  return changed ? { ...project, lines } : project;
}

function moveLine(
  lines: LyricLine[],
  { id, offset }: { id: LineId; offset: -1 | 1 },
): LyricLine[] {
  const from = lines.findIndex((line) => line.id === id);
  const to = from + offset;
  if (from === -1 || to < 0 || to >= lines.length) return lines;

  const moved = [...lines];
  [moved[from], moved[to]] = [moved[to], moved[from]];
  return moved;
}

export const projectHistoryReducer = undoable(projectReducer, {
  resets: (action) => action.type === "projectReplaced",
  // The player has the newly linked file loaded, so undo must not bring back
  // a path that no longer matches it.
  appliesToAll: (action) => action.type === "audioLinked",
  mergeKey: (action) => {
    switch (action.type) {
      case "metadataChanged":
        return `metadata:${action.field}`;
      case "lineNudged":
        return `nudge:${action.id}`;
      default:
        return null;
    }
  },
});

export function lineAfter(lines: LyricLine[], id: LineId): LineId | null {
  const index = lines.findIndex((line) => line.id === id);
  return index === -1 ? null : (lines[index + 1]?.id ?? null);
}
