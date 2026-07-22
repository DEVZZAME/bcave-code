import { describe, expect, it } from "vitest";
import { parseSlashCommand } from "../slash-command.js";

describe("slash command parser", () => {
  it("normalizes command names and preserves arguments", () => {
    expect(parseSlashCommand("  /MODEL heavy gpt-5  ")).toEqual({
      name: "model",
      args: "heavy gpt-5",
      raw: "/MODEL heavy gpt-5",
    });
  });

  it("rejects normal chat messages", () => {
    expect(parseSlashCommand("프로젝트 설명해줘")).toBeNull();
  });
});
