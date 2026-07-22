import { describe, expect, it } from "vitest";
import { createBracketedPasteWriter, globalKeyAction } from "../terminal-input.js";

describe("bracketed paste input", () => {
  it("turns multiline pasted text into one line", () => {
    const writes: string[] = [];
    const writer = createBracketedPasteWriter((buffer) => writes.push(buffer.toString()));
    writer(Buffer.from("\x1b[200~first\nsecond\r\nthird\x1b[201~"));
    expect(writes).toEqual(["first second third"]);
  });

  it("handles markers split across input chunks and preserves normal input", () => {
    const writes: string[] = [];
    const writer = createBracketedPasteWriter((buffer) => writes.push(buffer.toString()));
    writer(Buffer.from("before"));
    writer(Buffer.from("\x1b[200~one\n"));
    writer(Buffer.from("two\x1b[201~after"));
    expect(writes).toEqual(["before", "one two", "after"]);
  });
});

describe("global key actions", () => {
  it("recognizes mode cycling, line clearing and command opening", () => {
    expect(globalKeyAction("", { name: "tab", shift: true }, false, "")).toBe("cycle-mode");
    expect(globalKeyAction("", { name: "escape" }, false, "hello")).toBe("clear-line");
    expect(globalKeyAction("/", undefined, false, "/")).toBe("open-command");
  });

  it("suppresses shortcuts while another interaction is active", () => {
    expect(globalKeyAction("/", undefined, true, "/")).toBe("none");
    expect(globalKeyAction("", { name: "escape" }, false, "")).toBe("none");
  });
});
