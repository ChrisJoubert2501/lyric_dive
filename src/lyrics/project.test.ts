import { describe, expect, it } from "vitest";
import { createLine, createProject } from "./model";
import { lineAfter, projectReducer } from "./project";

describe("projectReducer", () => {
  it("links the audio file", () => {
    const project = projectReducer(createProject(), {
      type: "audioLinked",
      path: "/music/song.mp3",
    });

    expect(project.audioPath).toBe("/music/song.mp3");
  });

  it("replaces the lines", () => {
    const lines = [createLine("one"), createLine("two")];
    const project = projectReducer(createProject(), {
      type: "linesReplaced",
      lines,
    });

    expect(project.lines).toBe(lines);
  });

  it("stamps only the given line, without mutating the original", () => {
    const first = createLine("first");
    const second = createLine("second", 2000);
    const original = { ...createProject(), lines: [first, second] };

    const project = projectReducer(original, {
      type: "lineStamped",
      id: first.id,
      startMs: 1234,
    });

    expect(project.lines[0]).toEqual({ ...first, startMs: 1234 });
    expect(project.lines[1]).toBe(second);
    expect(first.startMs).toBeNull();
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
