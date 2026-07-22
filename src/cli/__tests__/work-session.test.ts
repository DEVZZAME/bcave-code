import { PassThrough, Writable } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WorkSession } from "../work-session.js";

afterEach(() => vi.useRealTimers());

describe("work session", () => {
  it("starts, renders progress and restores input on finish", () => {
    vi.useFakeTimers();
    const input = new PassThrough();
    let output = "";
    const pause = vi.fn();
    const resume = vi.fn();
    const session = new WorkSession({ input, output: new Writable({ write(chunk, _encoding, callback) { output += chunk.toString(); callback(); } }), pause, resume });
    session.begin();
    vi.advanceTimersByTime(100);
    expect(session.processing).toBe(true);
    expect(output).toContain("ESC");
    expect(session.finish()).toBeGreaterThanOrEqual(0);
    expect(session.processing).toBe(false);
    expect(pause).toHaveBeenCalled();
    expect(resume).toHaveBeenCalled();
  });

  it("aborts the active signal when escape is received", () => {
    vi.useFakeTimers();
    const input = new PassThrough();
    const session = new WorkSession({ input, output: new PassThrough(), pause: () => undefined, resume: () => undefined });
    session.begin();
    const signal = session.signal;
    input.write(Buffer.from([0x1b]));
    expect(session.aborted).toBe(true);
    expect(signal?.aborted).toBe(true);
    session.finish();
  });
});
