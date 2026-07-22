import fs from "node:fs";
import path from "node:path";
import { getConfigDir } from "../config/config.js";

export function resetConfig(configDir = getConfigDir()): boolean {
  const configPath = path.join(configDir, "config.json");
  if (!fs.existsSync(configPath)) return false;
  fs.unlinkSync(configPath);
  return true;
}
