import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { detectVerifyCommands, runVerify } from "../build-verification.js";

const directories: string[] = [];
function temporaryDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "bcave-verification-"));
  directories.push(directory);
  return directory;
}
afterEach(() => directories.splice(0).forEach((directory) => fs.rmSync(directory, { recursive: true, force: true })));

describe("build verification", () => {
  it("prefers typecheck over build and respects overrides", () => {
    const directory = temporaryDirectory();
    fs.writeFileSync(path.join(directory, "package.json"), JSON.stringify({ scripts: { build: "build", typecheck: "check" } }));
    expect(detectVerifyCommands(directory, [])).toEqual(["npm run typecheck --silent"]);
    expect(detectVerifyCommands(directory, ["custom verify"])).toEqual(["custom verify"]);
  });

  it("returns the first command failure", () => {
    const failure = runVerify(["node -e \"process.exit(3)\""], temporaryDirectory());
    expect(failure?.cmd).toContain("process.exit(3)");
    expect(failure?.output).toContain("exit code 3");
  });

  it("returns null when all commands pass", () => {
    expect(runVerify(["node --version"], temporaryDirectory())).toBeNull();
  });
});
