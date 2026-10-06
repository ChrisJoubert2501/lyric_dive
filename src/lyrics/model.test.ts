import { describe, expect, it } from "vitest";
import { createLine, findActiveLine, linesFromText } from "./model";

describe("linesFromText", () => {
  it("splits pasted lyrics into trimmed, untimed lines and drops blank lines", () => {
    const lines = linesFromText("  First line \r\n\nSecond line\n   \n");

    expect(lines.map((line) => line.text)).toEqual([
      "First line",
      "Second line",
    ]);
    expect(
      lines.every((line) => line.startMs === null && line.endMs === null),
    ).toBe(true);
    expect(new Set(lines.map((line) => line.id)).size).toBe(2);
  });
});

describe("findActiveLine", () => {
  const intro = createLine("intro", 1000);
  const untimed = createLine("untimed");
  const verse = createLine("verse", 5000);
  const lines = [intro, untimed, verse];

  it("returns null before the first timed line", () => {
    expect(findActiveLine(lines, 999)).toBeNull();
  });

  it("returns the latest line that has started, skipping untimed lines", () => {
    expect(findActiveLine(lines, 1000)).toBe(intro);
    expect(findActiveLine(lines, 4999)).toBe(intro);
    expect(findActiveLine(lines, 5000)).toBe(verse);
    expect(findActiveLine(lines, 600_000)).toBe(verse);
  });

  it("returns null once a line's explicit end time has passed", () => {
    const ending = { ...createLine("ending", 1000), endMs: 3000 };
    expect(findActiveLine([ending], 2999)).toBe(ending);
    expect(findActiveLine([ending], 3000)).toBeNull();
  });
});
