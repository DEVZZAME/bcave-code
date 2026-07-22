import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

export interface VerificationFailure {
  cmd: string;
  output: string;
}

export function detectVerifyCommands(cwd: string, override: string[]): string[] {
  if (override.length) return override;
  try {
    const packagePath = path.join(cwd, "package.json");
    if (fs.existsSync(packagePath)) {
      const scripts = (JSON.parse(fs.readFileSync(packagePath, "utf8")).scripts || {}) as Record<string, string>;
      for (const name of ["typecheck", "type-check", "tsc", "build", "lint"]) {
        if (scripts[name]) return [`npm run ${name} --silent`];
      }
    }
    if (fs.existsSync(path.join(cwd, "tsconfig.json"))) return ["npx --no-install tsc --noEmit"];
  } catch { /* 감지 실패 시 자동 검증을 생략한다. */ }
  return [];
}

export function runVerify(commands: string[], cwd: string): VerificationFailure | null {
  for (const command of commands) {
    const result = spawnSync(command, {
      cwd,
      shell: true,
      encoding: "utf8",
      timeout: 180_000,
      maxBuffer: 8 * 1024 * 1024,
    });
    if (result.status !== 0) {
      const raw = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
      const output = raw.length > 5_000 ? `…\n${raw.slice(-5_000)}` : raw;
      return { cmd: command, output: output || `exit code ${result.status}` };
    }
  }
  return null;
}
