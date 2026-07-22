import { describe, expect, it } from "vitest";
import { charWidth, displayWidth, truncateToWidth } from "../terminal-width.js";

describe("terminal width", () => {
  it("counts ASCII as one and Korean/emoji as two columns", () => {
    expect(charWidth("A".codePointAt(0)!)).toBe(1);
    expect(displayWidth("A한🙂")).toBe(5);
  });

  it("truncates without splitting a wide character", () => {
    expect(truncateToWidth("abc한글", 6)).toBe("abc한…");
    expect(truncateToWidth("short", 10)).toBe("short");
  });
});
