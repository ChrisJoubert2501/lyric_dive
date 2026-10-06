import { describe, expect, it } from "vitest";
import {
  formatLrcTimestamp,
  linesOmittedFromLrc,
  parseLrc,
  parseLrcTimestamp,
  serializeLrc,
} from "./lrc";
import { createLine, createProject } from "./model";

const simplify = (lines: ReturnType<typeof parseLrc>["lines"]) =>
  lines.map(({ text, startMs, endMs }) => ({ text, startMs, endMs }));

describe("parseLrc", () => {
  it("reads metadata tags and timed lines", () => {
    const result = parseLrc(
      [
        "[ti:Song]",
        "[ar:Artist]",
        "[al:Album]",
        "[00:12.34]First",
        "[01:02.50]Second",
      ].join("\n"),
    );

    expect(result.metadata).toEqual({
      title: "Song",
      artist: "Artist",
      album: "Album",
    });
    expect(simplify(result.lines)).toEqual([
      { text: "First", startMs: 12_340, endMs: null },
      { text: "Second", startMs: 62_500, endMs: null },
    ]);
  });

  it("supports one, two or three fractional digits and missing fractions", () => {
    const result = parseLrc(
      "[00:01.5]a\n[00:02.25]b\n[00:03.125]c\n[00:04]d\n[00:05:50]e",
    );
    expect(result.lines.map((line) => line.startMs)).toEqual([
      1500, 2250, 3125, 4000, 5500,
    ]);
  });

  it("expands lines with multiple timestamps and sorts them by time", () => {
    const result = parseLrc("[00:30.00][00:10.00]Chorus\n[00:20.00]Verse");
    expect(result.lines.map((line) => [line.text, line.startMs])).toEqual([
      ["Chorus", 10_000],
      ["Verse", 20_000],
      ["Chorus", 30_000],
    ]);
  });

  it("gives every expanded line its own id", () => {
    const result = parseLrc("[00:10.00][00:30.00]Chorus");
    expect(new Set(result.lines.map((line) => line.id)).size).toBe(2);
  });

  it("applies a positive offset by moving lines earlier, clamped at zero", () => {
    const result = parseLrc("[offset:+500]\n[00:00.20]a\n[00:10.00]b");
    expect(result.lines.map((line) => line.startMs)).toEqual([0, 9500]);
  });

  it("turns an empty timed line into the previous line's end time", () => {
    const result = parseLrc("[00:01.00]a\n[00:04.00]\n[00:10.00]b");
    expect(simplify(result.lines)).toEqual([
      { text: "a", startMs: 1000, endMs: 4000 },
      { text: "b", startMs: 10_000, endMs: null },
    ]);
  });

  it("ignores a UTF-8 byte order mark at the start of the file", () => {
    const parsed = parseLrc("\uFEFF[ti:Song]\n[00:01.00]a\n");

    expect(parsed.metadata.title).toBe("Song");
    expect(parsed.lines.map((line) => line.text)).toEqual(["a"]);
  });

  it("ignores lines without timestamps and unknown tags", () => {
    const result = parseLrc("plain text\n[by:someone]\n[00:01.00]a");
    expect(simplify(result.lines)).toEqual([
      { text: "a", startMs: 1000, endMs: null },
    ]);
    expect(result.metadata).toEqual({});
  });
});

describe("linesOmittedFromLrc", () => {
  it("lists untimed lines and timed lines without text", () => {
    const untimed = createLine("untimed");
    const empty = createLine("", 2000);

    expect(
      linesOmittedFromLrc([createLine("kept", 1000), untimed, empty]),
    ).toEqual([untimed, empty]);
  });
});

describe("serializeLrc", () => {
  it("writes metadata, sorted timed lines and end-of-line gaps, skipping untimed lines", () => {
    const project = createProject({ title: "Song", artist: "Artist" });
    const ended = createLine("a", 1000);
    ended.endMs = 4000;
    project.lines = [createLine("b", 10_000), createLine("untimed"), ended];

    expect(serializeLrc(project)).toBe(
      [
        "[ti:Song]",
        "[ar:Artist]",
        "[00:01.00]a",
        "[00:04.00]",
        "[00:10.00]b",
        "",
      ].join("\n"),
    );
  });

  it("omits an end time that the next line already covers", () => {
    const project = createProject();
    const line = createLine("a", 1000);
    line.endMs = 5000;
    project.lines = [line, createLine("b", 3000)];

    expect(serializeLrc(project)).toBe("[00:01.00]a\n[00:03.00]b\n");
  });

  it("skips timed lines without text, which would read back as end times", () => {
    const project = createProject();
    project.lines = [createLine("a", 1000), createLine(" ", 2000)];

    expect(serializeLrc(project)).toBe("[00:01.00]a\n");
  });

  it("round-trips through parseLrc", () => {
    const source = "[ti:Song]\n[00:01.00]a\n[00:04.00]\n[00:10.00]b\n";
    const parsed = parseLrc(source);
    const project = createProject(parsed.metadata);
    project.lines = parsed.lines;

    expect(serializeLrc(project)).toBe(source);
  });
});

describe("formatLrcTimestamp", () => {
  it.each([
    [0, "00:00.00"],
    [12_345, "00:12.35"],
    [59_999, "01:00.00"],
    [6_000_000, "100:00.00"],
  ])("formats %i ms as %s", (ms, expected) => {
    expect(formatLrcTimestamp(ms)).toBe(expected);
  });
});

describe("parseLrcTimestamp", () => {
  it.each([
    ["01:23", 83_000],
    ["1:23.4", 83_400],
    ["01:23.45", 83_450],
    ["01:23.456", 83_456],
    ["01:23:45", 83_450],
  ])("parses %s as %i ms", (text, expected) => {
    expect(parseLrcTimestamp(text)).toBe(expected);
  });

  it.each(["", "abc", "83", "1:2:3:4", "01:23.4567", "-1:00"])(
    "rejects %j",
    (text) => {
      expect(parseLrcTimestamp(text)).toBeNull();
    },
  );
});
