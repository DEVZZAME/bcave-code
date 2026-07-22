import type { ParsedSlashCommand } from "./slash-command.js";

export type SettingsAction =
  | { kind: "model-auto" }
  | { kind: "model-heavy"; model: string }
  | { kind: "model-light"; model: string }
  | { kind: "model-manual"; model: string }
  | { kind: "model-select" }
  | { kind: "toggle"; setting: "verify" | "smoke"; value: boolean | null };

export function settingsAction(command: ParsedSlashCommand): SettingsAction | null {
  if (command.name === "model") {
    const [mode = "", ...rest] = command.args.split(/\s+/);
    const model = rest.join(" ").trim();
    if (!command.args) return { kind: "model-select" };
    if (mode === "auto" && !model) return { kind: "model-auto" };
    if (mode === "heavy" && model) return { kind: "model-heavy", model };
    if (mode === "light" && model) return { kind: "model-light", model };
    return { kind: "model-manual", model: command.args };
  }
  if (command.name === "verify" || command.name === "smoke") {
    const value = command.args.toLowerCase();
    return { kind: "toggle", setting: command.name, value: value === "on" ? true : value === "off" ? false : null };
  }
  return null;
}
