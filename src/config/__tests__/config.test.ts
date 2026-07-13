import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadConfig, saveConfig, type BcaveConfig } from "../config.js";

describe("Config", () => {
  const testDir = path.join(os.tmpdir(), "bcave-test-" + Date.now());
  const originalHome = process.env.HOME;

  beforeEach(() => {
    process.env.HOME = testDir;
    fs.mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    process.env.HOME = originalHome;
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it("returns default config when no file exists", () => {
    const config = loadConfig();
    expect(config.model).toBe("gpt-5.5");
    expect(config.baseUrl).toBe("https://api.openai.com/v1");
    expect(config.apiKey).toBe("");
  });

  it("saves and loads config", () => {
    saveConfig({ apiKey: "sk-test123" });
    const config = loadConfig();
    expect(config.apiKey).toBe("sk-test123");
    expect(config.model).toBe("gpt-5.5");
  });

  it("merges partial config with existing", () => {
    saveConfig({ apiKey: "sk-test123" });
    saveConfig({ model: "gpt-5.5-mini" });
    const config = loadConfig();
    expect(config.apiKey).toBe("sk-test123");
    expect(config.model).toBe("gpt-5.5-mini");
  });
});
