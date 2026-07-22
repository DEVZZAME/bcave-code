import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { BCAVE_VERSION } from "../version.js";

describe("BCAVE_VERSION", () => {
  it("matches package.json", () => {
    const pkg = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8")) as { version: string };
    expect(BCAVE_VERSION).toBe(pkg.version);
  });
});
