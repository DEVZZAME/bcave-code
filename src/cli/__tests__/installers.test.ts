import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("installers", () => {
  it("keeps the active Unix install until the staged build is verified", () => {
    const source = fs.readFileSync(path.join(root, "install.sh"), "utf8");
    const clone = source.indexOf("git clone");
    const verify = source.indexOf('node "$TEMP_DIR/$ENTRY_REL" --help');
    const backup = source.indexOf('mv "$INSTALL_DIR" "$BACKUP_DIR"');
    const activate = source.indexOf('mv "$TEMP_DIR" "$INSTALL_DIR"');

    expect(source).toContain("npm ci");
    expect(source).toContain("BCAVE_ENTRY_MISSING");
    expect(clone).toBeGreaterThan(0);
    expect(verify).toBeGreaterThan(clone);
    expect(backup).toBeGreaterThan(verify);
    expect(activate).toBeGreaterThan(backup);
    expect(source).not.toContain('rm -rf "$INSTALL_DIR"');
  });

  it("keeps the active Windows install until the staged build is verified", () => {
    const source = fs.readFileSync(path.join(root, "install.ps1"), "utf8");
    const clone = source.indexOf("git clone");
    const verify = source.indexOf("& node $TempEntry --help");
    const backup = source.indexOf("Move-Item -Path $InstallDir -Destination $BackupDir");
    const activate = source.indexOf("Move-Item -Path $TempDir -Destination $InstallDir");

    expect(source).toContain("npm.cmd ci");
    expect(source).toContain("BCAVE_ENTRY_MISSING");
    expect(clone).toBeGreaterThan(0);
    expect(verify).toBeGreaterThan(clone);
    expect(backup).toBeGreaterThan(verify);
    expect(activate).toBeGreaterThan(backup);
    expect(source).not.toContain("Remove-Item -Recurse -Force $InstallDir");
  });
});
