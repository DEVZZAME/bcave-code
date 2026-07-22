import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { configFileIssues, loadConfig, saveConfig, type BcaveConfig } from "../config.js";

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
    expect(config.model).toBe("gpt-5.6-luna");
    expect(config.autoRoute).toBe(false);
    expect(config.baseUrl).toBe("https://api.openai.com/v1");
    expect(config.apiKey).toBe("");
  });

  it("saves and loads config", () => {
    saveConfig({ apiKey: "sk-test123" });
    const config = loadConfig();
    expect(config.apiKey).toBe("sk-test123");
    expect(config.model).toBe("gpt-5.6-luna");
  });

  it("merges partial config with existing", () => {
    saveConfig({ apiKey: "sk-test123" });
    saveConfig({ model: "gpt-5.5-mini" });
    const config = loadConfig();
    expect(config.apiKey).toBe("sk-test123");
    expect(config.model).toBe("gpt-5.5-mini");
  });

  it("falls back to defaults when config JSON is damaged", () => {
    const configDir = path.join(testDir, ".bcave");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, "config.json"), "{broken");
    expect(loadConfig().model).toBe("gpt-5.6-luna");
    expect(configFileIssues()).toContain("config.json JSON 구문이 손상됐습니다.");
  });

  it("ignores values with invalid config types and reports them", () => {
    const configDir = path.join(testDir, ".bcave");
    fs.mkdirSync(configDir, { recursive: true });
    fs.writeFileSync(path.join(configDir, "config.json"), JSON.stringify({ autoVerify: "yes", maxVerifyRounds: "many" }));
    const config = loadConfig();
    expect(config.autoVerify).toBe(true);
    expect(config.maxVerifyRounds).toBe(2);
    expect(configFileIssues()).toHaveLength(2);
  });

  it.skipIf(process.platform === "win32")("stores config with owner-only permissions", () => {
    saveConfig({ apiKey: "secret" });
    const mode = fs.statSync(path.join(testDir, ".bcave", "config.json")).mode & 0o777;
    expect(mode).toBe(0o600);
  });
});
