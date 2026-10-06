import type { LineId, LyricLine, LyricProject } from "./model";

export type ProjectAction =
  | { type: "audioLinked"; path: string }
  | { type: "linesReplaced"; lines: LyricLine[] }
  | { type: "lineStamped"; id: LineId; startMs: number };

export function projectReducer(
  project: LyricProject,
  action: ProjectAction,
): LyricProject {
  switch (action.type) {
    case "audioLinked":
      return { ...project, audioPath: action.path };
    case "linesReplaced":
      return { ...project, lines: action.lines };
    case "lineStamped":
      return {
        ...project,
        lines: project.lines.map((line) =>
          line.id === action.id ? { ...line, startMs: action.startMs } : line,
        ),
      };
  }
}

export function lineAfter(lines: LyricLine[], id: LineId): LineId | null {
  const index = lines.findIndex((line) => line.id === id);
  return index === -1 ? null : (lines[index + 1]?.id ?? null);
}
