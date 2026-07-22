import { describe, expect, it } from "vitest";
import { CLI_COMMANDS } from "../commands.js";

describe("CLI_COMMANDS", () => {
  it("uses unique slash command names", () => {
    const names = CLI_COMMANDS.map(({ name }) => name);
    expect(new Set(names).size).toBe(names.length);
    expect(names.every((name) => name.startsWith("/"))).toBe(true);
  });
});
