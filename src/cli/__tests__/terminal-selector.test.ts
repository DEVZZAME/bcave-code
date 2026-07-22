import { EventEmitter } from "node:events";
import { describe, expect, it } from "vitest";
import { showTerminalSelector, type SelectorOptions } from "../terminal-selector.js";

function harness() {
  const input = new EventEmitter() as EventEmitter & { isRaw: boolean; setRawMode: (value: boolean) => void; resume: () => void };
  input.isRaw = false;
  input.setRawMode = (value) => { input.isRaw = value; };
  input.resume = () => undefined;
  let output = "";
  const active: boolean[] = [];
  const options = {
    input,
    output: { columns: 80, write: (value: string) => { output += value; return true; } },
    pause: () => undefined,
    resume: () => undefined,
    resetLine: () => undefined,
    setActive: (value: boolean) => active.push(value),
  } as unknown as SelectorOptions;
  return { input, options, active, output: () => output };
}

const items = [
  { label: "first", dimLabel: "first" },
  { label: "second", dimLabel: "second" },
  { label: "third", dimLabel: "third" },
];

describe("terminal selector", () => {
  it("moves down and confirms the selected item", async () => {
    const test = harness();
    const selection = showTerminalSelector(items, test.options);
    test.input.emit("keypress", "", { name: "down" });
    test.input.emit("keypress", "\r", { name: "return" });
    expect(await selection).toBe(1);
    expect(test.active).toEqual([true, false]);
    expect(test.input.isRaw).toBe(false);
    expect(test.output()).toContain("second");
  });

  it("wraps upward and supports escape cancellation", async () => {
    const up = harness();
    const wrapped = showTerminalSelector(items, up.options);
    up.input.emit("keypress", "", { name: "up" });
    up.input.emit("keypress", "", { name: "enter" });
    expect(await wrapped).toBe(2);

    const cancel = harness();
    const cancelled = showTerminalSelector(items, cancel.options);
    cancel.input.emit("keypress", "", { name: "escape" });
    expect(await cancelled).toBe(-1);
  });

  it("returns cancellation for an empty list", async () => {
    expect(await showTerminalSelector([], harness().options)).toBe(-1);
  });
});
