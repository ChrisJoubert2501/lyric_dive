import { describe, expect, it } from "vitest";
import { fileName, withExtension } from "./paths";

describe("fileName", () => {
  it("returns the last part of a Unix or Windows path", () => {
    expect(fileName("/music/song.mp3")).toBe("song.mp3");
    expect(fileName("C:\\music\\song.mp3")).toBe("song.mp3");
  });
});

describe("withExtension", () => {
  it.each([
    ["/music/song.mp3", "/music/song.lrc"],
    ["/music/song.remix.mp3", "/music/song.remix.lrc"],
    ["/music.d/song", "/music.d/song.lrc"],
    ["/music/.hidden", "/music/.hidden.lrc"],
    ["C:\\music\\song.mp3", "C:\\music\\song.lrc"],
  ])("turns %s into %s", (path, expected) => {
    expect(withExtension(path, ".lrc")).toBe(expected);
  });
});
