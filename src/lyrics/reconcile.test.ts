import { describe, expect, it } from "vitest";
import { createLine, linesFromText, type LyricLine } from "./model";
import { reconcileLines } from "./reconcile";

function timed(...lines: [string, number][]): LyricLine[] {
  return lines.map(([text, startMs]) => createLine(text, startMs));
}

function replace(previous: LyricLine[], text: string) {
  return reconcileLines(previous, linesFromText(text)).map((line) => [
    line.text,
    line.startMs,
  ]);
}

describe("reconcileLines", () => {
  it("keeps the IDs and timing of unchanged lines", () => {
    const previous = timed(["one", 1000], ["two", 2000]);

    expect(reconcileLines(previous, linesFromText("one\ntwo"))).toEqual(
      previous,
    );
  });

  it("adds inserted lines untimed", () => {
    const previous = timed(["one", 1000], ["three", 3000]);

    expect(replace(previous, "one\ntwo\nthree")).toEqual([
      ["one", 1000],
      ["two", null],
      ["three", 3000],
    ]);
  });

  it("drops removed lines", () => {
    const previous = timed(["one", 1000], ["two", 2000], ["three", 3000]);

    expect(replace(previous, "one\nthree")).toEqual([
      ["one", 1000],
      ["three", 3000],
    ]);
  });

  it("matches lines that differ only in case, punctuation or spacing, and takes the new text", () => {
    const previous = timed(["hello world", 1000], ["Goodbye", 2000]);

    expect(replace(previous, "Hello,   world!\ngoodbye...")).toEqual([
      ["Hello,   world!", 1000],
      ["goodbye...", 2000],
    ]);
  });

  it("keeps the timing of a line reworded in place", () => {
    const previous = timed(["one", 1000], ["teh two", 2000], ["three", 3000]);

    expect(replace(previous, "one\nthe two\nthree")).toEqual([
      ["one", 1000],
      ["the two", 2000],
      ["three", 3000],
    ]);
  });

  it("pairs reworded lines in order even when no line is unchanged", () => {
    const previous = timed(["a", 1000], ["b", 2000]);

    expect(replace(previous, "x\ny")).toEqual([
      ["x", 1000],
      ["y", 2000],
    ]);
  });

  it("leaves new lines untimed when lines were also added or removed around them", () => {
    const previous = timed(["one", 1000], ["two", 2000], ["four", 4000]);

    expect(replace(previous, "one\n2\n3\nfour")).toEqual([
      ["one", 1000],
      ["2", null],
      ["3", null],
      ["four", 4000],
    ]);
  });

  it("keeps timestamps in order when lines repeat", () => {
    const previous = timed(["chorus", 1000], ["verse", 2000], ["chorus", 3000]);

    // Matching the chorus to its first occurrence would put 1000 after 2000.
    expect(replace(previous, "verse\nchorus")).toEqual([
      ["verse", 2000],
      ["chorus", 3000],
    ]);
  });

  it("keeps end times and translations", () => {
    const line: LyricLine = {
      ...createLine("one", 1000),
      endMs: 1500,
      translations: { pt: "um" },
    };

    expect(reconcileLines([line], linesFromText("One"))).toEqual([
      { ...line, text: "One" },
    ]);
  });

  it("compares lines without letters or digits as they are", () => {
    const previous = timed(["♪", 1000], ["♫", 2000]);

    expect(replace(previous, "♫")).toEqual([["♫", 2000]]);
  });

  it("returns the new lines unchanged when there were none before", () => {
    const next = linesFromText("one\ntwo");

    expect(reconcileLines([], next)).toEqual(next);
  });
});
