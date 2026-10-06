import { describe, expect, it } from "vitest";
import { createLine, createProject, type LyricLine } from "./model";
import {
  lineAfter,
  projectHistoryReducer,
  projectReducer,
  type ProjectAction,
} from "./project";
import { createHistory } from "../history";

function apply(lines: LyricLine[], action: ProjectAction): LyricLine[] {
  return projectReducer({ ...createProject(), lines }, action).lines;
}

function texts(lines: LyricLine[]): string[] {
  return lines.map((line) => line.text);
}

describe("projectReducer", () => {
  it("replaces the whole project", () => {
    const next = createProject({ title: "Other" });

    expect(
      projectReducer(createProject(), {
        type: "projectReplaced",
        project: next,
      }),
    ).toBe(next);
  });

  it("changes one metadata field", () => {
    const project = projectReducer(createProject({ artist: "Band" }), {
      type: "metadataChanged",
      field: "title",
      value: "Song",
    });

    expect(project.metadata).toEqual({
      title: "Song",
      artist: "Band",
      album: "",
    });
  });

  it("links the audio file", () => {
    const project = projectReducer(createProject(), {
      type: "audioLinked",
      path: "/music/song.mp3",
    });

    expect(project.audioPath).toBe("/music/song.mp3");
  });

  it("replaces the lines", () => {
    const lines = [createLine("one"), createLine("two")];

    expect(apply([], { type: "linesReplaced", lines })).toBe(lines);
  });

  it("imports lines and overwrites only the metadata the import provides", () => {
    const lines = [createLine("imported", 1000)];
    const project = projectReducer(
      createProject({ title: "Old", album: "Kept" }),
      { type: "lyricsImported", lines, metadata: { title: "New" } },
    );

    expect(project.lines).toBe(lines);
    expect(project.metadata).toEqual({
      title: "New",
      artist: "",
      album: "Kept",
    });
  });

  it("stamps only the given line, without mutating the original", () => {
    const first = createLine("first");
    const second = createLine("second", 2000);

    const lines = apply([first, second], {
      type: "lineTimeSet",
      id: first.id,
      startMs: 1234,
    });

    expect(lines[0]).toEqual({ ...first, startMs: 1234 });
    expect(lines[1]).toBe(second);
    expect(first.startMs).toBeNull();
  });

  it("inserts a line at the given index", () => {
    const lines = [createLine("a"), createLine("c")];

    expect(
      texts(
        apply(lines, { type: "lineInserted", line: createLine("b"), index: 1 }),
      ),
    ).toEqual(["a", "b", "c"]);
    expect(
      texts(
        apply(lines, { type: "lineInserted", line: createLine("d"), index: 2 }),
      ),
    ).toEqual(["a", "c", "d"]);
  });

  it("deletes a line", () => {
    const lines = [createLine("a"), createLine("b")];

    expect(
      texts(apply(lines, { type: "lineDeleted", id: lines[0].id })),
    ).toEqual(["b"]);
  });

  it("moves a line up or down, and ignores moves past either end", () => {
    const lines = [createLine("a"), createLine("b"), createLine("c")];
    const [a, b, c] = lines;

    expect(
      texts(apply(lines, { type: "lineMoved", id: b.id, offset: -1 })),
    ).toEqual(["b", "a", "c"]);
    expect(
      texts(apply(lines, { type: "lineMoved", id: b.id, offset: 1 })),
    ).toEqual(["a", "c", "b"]);
    expect(apply(lines, { type: "lineMoved", id: a.id, offset: -1 })).toBe(
      lines,
    );
    expect(apply(lines, { type: "lineMoved", id: c.id, offset: 1 })).toBe(
      lines,
    );
  });

  it("changes a line's text and keeps its timing", () => {
    const line = createLine("typo", 1000);

    expect(
      apply([line], { type: "lineTextChanged", id: line.id, text: "fixed" }),
    ).toEqual([{ ...line, text: "fixed" }]);
  });

  it("nudges a timestamp, without going below zero or timing an untimed line", () => {
    const timed = createLine("timed", 1000);
    const untimed = createLine("untimed");
    const nudge = (line: LyricLine, deltaMs: number) =>
      apply([line], { type: "lineNudged", id: line.id, deltaMs })[0];

    expect(nudge(timed, 50).startMs).toBe(1050);
    expect(nudge(timed, -50).startMs).toBe(950);
    expect(nudge(timed, -5000).startMs).toBe(0);
    expect(nudge(untimed, 50).startMs).toBeNull();
  });

  it("clears both start and end time", () => {
    const line = { ...createLine("line", 1000), endMs: 3000 };

    const [cleared] = apply([line], { type: "lineTimeCleared", id: line.id });

    expect(cleared.startMs).toBeNull();
    expect(cleared.endMs).toBeNull();
  });
});

describe("projectReducer without changes", () => {
  const timed = createLine("timed", 1000);
  const untimed = createLine("untimed");
  const lines = [timed, untimed];
  const project = { ...createProject({ title: "Song" }), lines };

  it.each<[string, ProjectAction]>([
    [
      "unchanged text",
      { type: "lineTextChanged", id: timed.id, text: "timed" },
    ],
    ["the same time", { type: "lineTimeSet", id: timed.id, startMs: 1000 }],
    [
      "nudging an untimed line",
      { type: "lineNudged", id: untimed.id, deltaMs: 50 },
    ],
    ["clearing an untimed line", { type: "lineTimeCleared", id: untimed.id }],
    [
      "moving the first line up",
      { type: "lineMoved", id: timed.id, offset: -1 },
    ],
    ["deleting a missing line", { type: "lineDeleted", id: "missing" }],
    [
      "the same title",
      { type: "metadataChanged", field: "title", value: "Song" },
    ],
  ])("returns the same project for %s", (_, action) => {
    expect(projectReducer(project, action)).toBe(project);
  });
});

describe("projectHistoryReducer", () => {
  const line = createLine("line", 1000);
  const start = createHistory({ ...createProject(), lines: [line] });

  function run(actions: Parameters<typeof projectHistoryReducer>[1][]) {
    return actions.reduce(projectHistoryReducer, start);
  }

  it("undoes a whole run of nudges to one line in one step", () => {
    const nudge: ProjectAction = {
      type: "lineNudged",
      id: line.id,
      deltaMs: 50,
    };

    const history = run([nudge, nudge, nudge]);
    expect(history.present.lines[0].startMs).toBe(1150);
    expect(run([nudge, nudge, nudge, { type: "undo" }]).present).toBe(
      start.present,
    );
  });

  it("undoes typing in one metadata field in one step", () => {
    const typed = ["S", "So", "Son", "Song"].map((value): ProjectAction => ({
      type: "metadataChanged",
      field: "title",
      value,
    }));

    expect(run([...typed, { type: "undo" }]).present.metadata.title).toBe("");
  });

  it("keeps a relinked audio file through undo and redo", () => {
    const history = run([
      { type: "lineTimeCleared", id: line.id },
      { type: "audioLinked", path: "/music/moved.mp3" },
      { type: "undo" },
    ]);

    expect(history.present.lines[0].startMs).toBe(1000);
    expect(history.present.audioPath).toBe("/music/moved.mp3");
    expect(history.future[0].audioPath).toBe("/music/moved.mp3");
  });

  it("starts a new history when another project is opened", () => {
    const history = run([
      { type: "lineTimeCleared", id: line.id },
      { type: "projectReplaced", project: createProject() },
    ]);

    expect(history.past).toEqual([]);
  });
});

describe("lineAfter", () => {
  const lines = [createLine("a"), createLine("b")];

  it("returns the next line's ID", () => {
    expect(lineAfter(lines, lines[0].id)).toBe(lines[1].id);
  });

  it("returns null after the last line or for an unknown ID", () => {
    expect(lineAfter(lines, lines[1].id)).toBeNull();
    expect(lineAfter(lines, "missing")).toBeNull();
  });
});
