import path from "node:path";
import { pathToFileURL } from "node:url";
import { describe, expect, it } from "vitest";
import { resolveInstallDir, updateCommand } from "../updater.js";

describe("updater", () => {
  it("resolves the repository root from a compiled CLI module URL", () => {
    const expectedRoot = path.join(path.parse(process.cwd()).root, "opt", "bcave");
    const moduleUrl = pathToFileURL(path.join(expectedRoot, "dist", "cli", "updater.js")).href;
    expect(resolveInstallDir(moduleUrl)).toBe(expectedRoot);
  });

  it("uses bash installer on macOS and Linux", () => {
    expect(updateCommand("darwin", "/opt/bcave")).toEqual({
      command: "bash",
      args: [path.join("/opt/bcave", "install.sh")],
    });
  });

  it("uses a PowerShell file invocation on Windows", () => {
    expect(updateCommand("win32", "C:\\bcave")).toEqual({
      command: "powershell.exe",
      args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join("C:\\bcave", "install.ps1")],
    });
  });
});
