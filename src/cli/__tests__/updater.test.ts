import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveInstallDir, updateCommand } from "../updater.js";

describe("updater", () => {
  it("resolves the repository root from a compiled CLI module URL", () => {
    const root = resolveInstallDir("file:///opt/bcave/dist/cli/updater.js");
    expect(root).toBe(path.resolve("/opt/bcave"));
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
