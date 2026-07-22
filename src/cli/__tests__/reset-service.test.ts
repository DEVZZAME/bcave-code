import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resetConfig } from "../reset-service.js";

describe("reset service", () => {
  it("removes only config.json and preserves sessions", () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), "bcave-reset-"));
    fs.writeFileSync(path.join(directory, "config.json"), "{}");
    fs.mkdirSync(path.join(directory, "sessions"));
    fs.writeFileSync(path.join(directory, "sessions", "one.json"), "{}");
    expect(resetConfig(directory)).toBe(true);
    expect(fs.existsSync(path.join(directory, "config.json"))).toBe(false);
    expect(fs.existsSync(path.join(directory, "sessions", "one.json"))).toBe(true);
    expect(resetConfig(directory)).toBe(false);
    fs.rmSync(directory, { recursive: true, force: true });
  });
});
