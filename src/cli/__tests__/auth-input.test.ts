import { PassThrough, Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { askHidden, askVisible, type AuthInputOptions } from "../auth-input.js";

function harness(questionValue = ""): { options: AuthInputOptions; input: PassThrough; output: () => string; states: boolean[] } {
  const input = new PassThrough();
  let rendered = "";
  const states: boolean[] = [];
  const output = new Writable({ write(chunk, _encoding, callback) { rendered += chunk.toString(); callback(); } });
  return {
    input,
    output: () => rendered,
    states,
    options: { input, output, question: (_query, callback) => callback(questionValue), setActive: (active) => states.push(active) },
  };
}

describe("authentication input", () => {
  it("masks password characters and handles backspace", async () => {
    const test = harness();
    const password = askHidden("password > ", test.options);
    test.input.write("abc\x7fd\n");
    expect(await password).toBe("abd");
    expect(test.output()).not.toContain("abc");
    expect(test.output()).toContain("***");
    expect(test.states).toEqual([true, false]);
  });

  it("tracks active state around visible input", async () => {
    const test = harness("user@example.com");
    expect(await askVisible("email > ", test.options)).toBe("user@example.com");
    expect(test.states).toEqual([true, false]);
  });
});
