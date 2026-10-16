import { describe, expect, it } from "vitest";
import { formatKey, SHORTCUTS, shortcutLabel } from "./shortcuts";
import { shortcutName } from "./useKeyboardShortcuts";

const allKeys = Object.values(SHORTCUTS).flatMap(({ keys }) => keys);

describe("SHORTCUTS", () => {
  it("binds every key to one action only", () => {
    expect(new Set(allKeys).size).toBe(allKeys.length);
  });

  it.each(allKeys)("names %j as shortcutName does", (key) => {
    const parts = key === " " ? [" "] : key.split("+");
    const event = {
      key: parts.at(-1)!,
      ctrlKey: parts.includes("Ctrl"),
      metaKey: false,
      altKey: parts.includes("Alt"),
      shiftKey: parts.includes("Shift"),
    };

    expect(shortcutName(event)).toBe(key);
  });
});

describe("formatKey", () => {
  it.each([
    [" ", "Space"],
    ["e", "E"],
    ["?", "?"],
    ["Enter", "Enter"],
    ["Ctrl+Shift+s", "Ctrl+Shift+S"],
    ["Alt+ArrowUp", "Alt+↑"],
  ])("formats %j as %s", (key, expected) => {
    expect(formatKey(key)).toBe(expected);
  });
});

describe("shortcutLabel", () => {
  it("lists all keys of an action", () => {
    expect(shortcutLabel("redo")).toBe("Ctrl+Shift+Z or Ctrl+Y");
  });
});
