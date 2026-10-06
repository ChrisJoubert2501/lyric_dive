import { describe, expect, it } from "vitest";
import { createLine, createProject, type LyricLine } from "./model";
import { lineAfter, projectReducer, type ProjectAction } from "./project";

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
