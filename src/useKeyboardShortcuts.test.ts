import { describe, expect, it } from "vitest";
import { shortcutName } from "./useKeyboardShortcuts";

const plain = {
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
};

describe("shortcutName", () => {
  it("uses the key itself for plain keys", () => {
    expect(shortcutName({ ...plain, key: "Enter" })).toBe("Enter");
    expect(shortcutName({ ...plain, key: " " })).toBe(" ");
  });

  it("ignores Shift on its own", () => {
    expect(shortcutName({ ...plain, key: "Enter", shiftKey: true })).toBe(
      "Enter",
    );
  });

  it("names modifier combinations with lower-case letters", () => {
    expect(shortcutName({ ...plain, key: "s", ctrlKey: true })).toBe("Ctrl+s");
    expect(
      shortcutName({ ...plain, key: "S", ctrlKey: true, shiftKey: true }),
    ).toBe("Ctrl+Shift+s");
  });

  it("treats Cmd as Ctrl", () => {
    expect(shortcutName({ ...plain, key: "o", metaKey: true })).toBe("Ctrl+o");
  });
});
