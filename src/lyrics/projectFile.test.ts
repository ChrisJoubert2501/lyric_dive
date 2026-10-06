import { describe, expect, it } from "vitest";
import { createLine, createProject, type LyricProject } from "./model";
import {
  parseProject,
  ProjectFileError,
  serializeProject,
  suggestedFileName,
} from "./projectFile";

function sampleProject(): LyricProject {
  return {
    ...createProject({ title: "Song", artist: "Band" }),
    audioPath: "/music/song.mp3",
    sourceLanguage: "en",
    lines: [
      { ...createLine("first", 1000), translations: { pt: "primeira" } },
      { ...createLine("second", 2500), endMs: 4000 },
      createLine("untimed"),
    ],
  };
}

function withChange(change: (data: Record<string, unknown>) => void): string {
  const data = JSON.parse(serializeProject(sampleProject()));
  change(data);
  return JSON.stringify(data);
}

describe("parseProject", () => {
  it("round-trips through serializeProject", () => {
    const project = sampleProject();

    expect(parseProject(serializeProject(project))).toEqual(project);
  });

  it("drops unknown fields", () => {
    const json = withChange((data) => {
      data.extra = true;
    });

    expect(parseProject(json)).not.toHaveProperty("extra");
  });

  it("rejects text that is not JSON", () => {
    expect(() => parseProject("{")).toThrow("not valid JSON");
  });

  it("explains when a newer version saved the file", () => {
    const json = withChange((data) => {
      data.schemaVersion = 2;
    });

    expect(() => parseProject(json)).toThrow("newer version");
  });

  it("rejects a file whose root is not an object", () => {
    expect(() => parseProject("[]")).toThrow("The project must be an object");
  });

  type Data = Record<string, unknown>;
  it.each<[string, (data: Data) => void, string]>([
    [
      "a missing schema version",
      (data) => delete data.schemaVersion,
      "Unsupported schemaVersion",
    ],
    [
      "missing metadata",
      (data) => delete data.metadata,
      "metadata must be an object",
    ],
    [
      "a numeric title",
      (data) => ((data.metadata as Data).title = 1),
      "metadata.title must be a string",
    ],
    [
      "lines that are not a list",
      (data) => (data.lines = {}),
      "lines must be a list",
    ],
  ])("rejects %s", (_, change, message) => {
    expect(() => parseProject(withChange(change))).toThrow(message);
  });

  it.each([
    [{ startMs: -1 }, "lines[1].startMs must be a whole number"],
    [{ endMs: 1.5 }, "lines[1].endMs must be a whole number"],
    [{ id: "" }, "lines[1].id must be a non-empty string"],
    [
      { translations: { pt: null } },
      "lines[1].translations.pt must be a string",
    ],
  ])("names the invalid line field in %j", (fields, message) => {
    const json = withChange((data) => {
      Object.assign((data.lines as object[])[1], fields);
    });

    expect(() => parseProject(json)).toThrow(message);
  });

  it("rejects duplicate line IDs", () => {
    const json = withChange((data) => {
      const lines = data.lines as { id: string }[];
      lines[2].id = lines[0].id;
    });

    expect(() => parseProject(json)).toThrow("lines[2].id is used twice");
  });

  it("throws ProjectFileError, so callers can tell file problems from bugs", () => {
    expect(() => parseProject("null")).toThrow(ProjectFileError);
  });
});

describe("suggestedFileName", () => {
  it("names the file after the artist and title", () => {
    expect(
      suggestedFileName({ title: "Song", artist: "Band", album: "" }),
    ).toBe("Band - Song.lyricdive.json");
  });

  it("falls back to Untitled and replaces characters that are invalid in file names", () => {
    expect(suggestedFileName({ title: " ", artist: "", album: "" })).toBe(
      "Untitled.lyricdive.json",
    );
    expect(suggestedFileName({ title: "A/B: C?", artist: "", album: "" })).toBe(
      "A_B_ C_.lyricdive.json",
    );
  });
});
