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

export function projectReducer(
  project: LyricProject,
  action: ProjectAction,
): LyricProject {
  switch (action.type) {
    case "projectReplaced":
      return action.project;
    case "audioLinked":
      return { ...project, audioPath: action.path };
    case "metadataChanged":
      return {
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
    case "lineDeleted":
      return {
        ...project,
        lines: project.lines.filter((line) => line.id !== action.id),
      };
    case "lineMoved":
      return { ...project, lines: moveLine(project.lines, action) };
    case "lineTextChanged":
      return updateLine(project, action.id, (line) => ({
        ...line,
        text: action.text,
      }));
    case "lineTimeSet":
      return updateLine(project, action.id, (line) => ({
        ...line,
        startMs: action.startMs,
      }));
    case "lineNudged":
      return updateLine(project, action.id, (line) =>
        line.startMs === null
          ? line
          : { ...line, startMs: Math.max(0, line.startMs + action.deltaMs) },
      );
    case "lineTimeCleared":
      // An end time on its own would be meaningless, so it goes too.
      return updateLine(project, action.id, (line) => ({
        ...line,
        startMs: null,
        endMs: null,
      }));
  }
}

function updateLine(
  project: LyricProject,
  id: LineId,
  update: (line: LyricLine) => LyricLine,
): LyricProject {
  return {
    ...project,
    lines: project.lines.map((line) => (line.id === id ? update(line) : line)),
  };
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

export function lineAfter(lines: LyricLine[], id: LineId): LineId | null {
  const index = lines.findIndex((line) => line.id === id);
  return index === -1 ? null : (lines[index + 1]?.id ?? null);
}
