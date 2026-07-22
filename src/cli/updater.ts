import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync, type SpawnSyncReturns } from "node:child_process";
import { fileURLToPath } from "node:url";

export const REPOSITORY_URL = "https://github.com/DEVZZAME/bcave-agent.git";

export function resolveInstallDir(moduleUrl = import.meta.url): string {
  return path.resolve(path.dirname(fileURLToPath(moduleUrl)), "..", "..");
}

export function updateCommand(platform: NodeJS.Platform, installDir: string): { command: string; args: string[] } {
  return platform === "win32"
    ? { command: "powershell.exe", args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(installDir, "install.ps1")] }
    : { command: "bash", args: [path.join(installDir, "install.sh")] };
}

export function hasRemoteUpdate(installDir = resolveInstallDir()): boolean {
  try {
    const options = { cwd: installDir, timeout: 3_000, encoding: "utf8" as const };
    const local = execFileSync("git", ["rev-parse", "HEAD"], options).trim();
    const remote = execFileSync("git", ["ls-remote", REPOSITORY_URL, "refs/heads/master"], options)
      .trim().split(/\s+/)[0];
    return Boolean(local && remote && local !== remote);
  } catch {
    return false;
  }
}

export function runSafeUpdate(
  installDir = resolveInstallDir(),
  runner: typeof spawnSync = spawnSync,
): SpawnSyncReturns<Buffer> {
  const update = updateCommand(process.platform, installDir);
  return runner(update.command, update.args, {
    cwd: os.homedir(),
    stdio: "inherit",
    timeout: 10 * 60_000,
  });
}

export function relaunchUpdatedCli(installDir = resolveInstallDir()): never {
  const entry = path.join(installDir, "dist", "cli", "index.js");
  const result = spawnSync(process.execPath, [entry], { stdio: "inherit" });
  process.exit(result.status ?? 1);
}
