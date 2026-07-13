import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface BcaveConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
}

const DEFAULT_CONFIG: BcaveConfig = {
  apiKey: "",
  model: "gpt-5.5",
  baseUrl: "https://api.openai.com/v1",
};

export function getConfigDir(): string {
  return path.join(os.homedir(), ".bcave");
}

function getConfigPath(): string {
  return path.join(getConfigDir(), "config.json");
}

export function loadConfig(): BcaveConfig {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }
  const raw = fs.readFileSync(configPath, "utf-8");
  const parsed = JSON.parse(raw) as Partial<BcaveConfig>;
  return { ...DEFAULT_CONFIG, ...parsed };
}

export function saveConfig(partial: Partial<BcaveConfig>): void {
  const configDir = getConfigDir();
  fs.mkdirSync(configDir, { recursive: true });
  const existing = loadConfig();
  const merged = { ...existing, ...partial };
  fs.writeFileSync(getConfigPath(), JSON.stringify(merged, null, 2), "utf-8");
}
