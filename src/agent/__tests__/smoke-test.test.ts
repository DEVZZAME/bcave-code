import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { detectStartCommand, smokeTest } from "../smoke-test.js";

const directories: string[] = [];
function temporaryDirectory(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "bcave-smoke-test-"));
  directories.push(directory);
  return directory;
}
afterEach(() => directories.splice(0).forEach((directory) => fs.rmSync(directory, { recursive: true, force: true })));

describe("smoke test", () => {
  it("detects the preferred server script", () => {
    const directory = temporaryDirectory();
    fs.writeFileSync(path.join(directory, "package.json"), JSON.stringify({ scripts: { start: "node app.js", dev: "vite" } }));
    expect(detectStartCommand(directory)).toBe("npm run dev --silent");
  });

  it("fails quickly when no server script exists", async () => {
    const result = await smokeTest(temporaryDirectory());
    expect(result.ok).toBe(false);
    expect(result.detail).toContain("서버 실행 스크립트가 없습니다");
  });
});
