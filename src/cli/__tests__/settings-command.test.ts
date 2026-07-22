import { describe, expect, it } from "vitest";
import { parseSlashCommand } from "../slash-command.js";
import { settingsAction } from "../settings-command.js";

function action(command: string) {
  return settingsAction(parseSlashCommand(command)!);
}

describe("settings commands", () => {
  it("parses model routing changes", () => {
    expect(action("/model auto")).toEqual({ kind: "model-auto" });
    expect(action("/model heavy gpt-5.6-sol")).toEqual({ kind: "model-heavy", model: "gpt-5.6-sol" });
    expect(action("/model gpt-5.6-terra")).toEqual({ kind: "model-manual", model: "gpt-5.6-terra" });
    expect(action("/model")).toEqual({ kind: "model-select" });
  });

  it("parses boolean settings and leaves invalid values as queries", () => {
    expect(action("/verify on")).toEqual({ kind: "toggle", setting: "verify", value: true });
    expect(action("/smoke off")).toEqual({ kind: "toggle", setting: "smoke", value: false });
    expect(action("/verify maybe")).toEqual({ kind: "toggle", setting: "verify", value: null });
  });
});
