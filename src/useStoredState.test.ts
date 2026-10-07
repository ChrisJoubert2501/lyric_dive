import { describe, expect, it } from "vitest";
import { parseStored } from "./useStoredState";

describe("parseStored", () => {
  it("returns the stored value", () => {
    expect(parseStored("false", true)).toBe(false);
  });

  it("falls back to the default when nothing is stored", () => {
    expect(parseStored(null, true)).toBe(true);
  });

  it("falls back to the default for invalid JSON or a different type", () => {
    expect(parseStored("{", true)).toBe(true);
    expect(parseStored('"yes"', true)).toBe(true);
  });
});
