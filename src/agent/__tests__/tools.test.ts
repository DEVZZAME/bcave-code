import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { executeTool, getToolCategory, TOOL_DEFINITIONS } from "../tools.js";

describe("Tools", () => {
  const testDir = path.join(os.tmpdir(), "bcave-tools-test-" + Date.now());

  beforeEach(() => {
    fs.mkdirSync(testDir, { recursive: true });
    fs.writeFileSync(path.join(testDir, "hello.txt"), "hello world");
    fs.mkdirSync(path.join(testDir, "subdir"), { recursive: true });
    fs.writeFileSync(path.join(testDir, "subdir", "nested.ts"), "const x = 1;");
  });

  afterEach(() => {
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  it("has 8 tool definitions", () => {
    expect(TOOL_DEFINITIONS).toHaveLength(8);
  });

  it("exposes frontend_design as a file_read tool", () => {
    expect(TOOL_DEFINITIONS.map((t) => t.function.name)).toContain("frontend_design");
    expect(getToolCategory("frontend_design")).toBe("file_read");
  });

  it("exposes create_dashboard as a file_write tool", () => {
    expect(TOOL_DEFINITIONS.map((t) => t.function.name)).toContain("create_dashboard");
    expect(getToolCategory("create_dashboard")).toBe("file_write");
  });

  it("exposes dashboard_design_system as a file_read tool", () => {
    expect(TOOL_DEFINITIONS.map((t) => t.function.name)).toContain("dashboard_design_system");
    expect(getToolCategory("dashboard_design_system")).toBe("file_read");
  });

  describe("getToolCategory", () => {
    it("maps read tools to file_read", () => {
      expect(getToolCategory("read_file")).toBe("file_read");
      expect(getToolCategory("list_files")).toBe("file_read");
      expect(getToolCategory("search_files")).toBe("file_read");
    });

    it("maps write_file to file_write", () => {
      expect(getToolCategory("write_file")).toBe("file_write");
    });

    it("maps shell_exec to shell_exec", () => {
      expect(getToolCategory("shell_exec")).toBe("shell_exec");
    });
  });

  describe("read_file", () => {
    it("reads file content", async () => {
      const result = await executeTool("read_file", { path: "hello.txt" }, testDir);
      expect(result).toBe("hello world");
    });

    it("returns error for missing file", async () => {
      const result = await executeTool("read_file", { path: "nope.txt" }, testDir);
      expect(result).toContain("Error");
    });
  });

  describe("write_file", () => {
    it("creates a new file", async () => {
      await executeTool("write_file", { path: "new.txt", content: "new content" }, testDir);
      const content = fs.readFileSync(path.join(testDir, "new.txt"), "utf-8");
      expect(content).toBe("new content");
    });

    it("creates directories if needed", async () => {
      await executeTool("write_file", { path: "a/b/c.txt", content: "deep" }, testDir);
      const content = fs.readFileSync(path.join(testDir, "a/b/c.txt"), "utf-8");
      expect(content).toBe("deep");
    });
  });

  describe("list_files", () => {
    it("lists directory contents", async () => {
      const result = await executeTool("list_files", { path: "." }, testDir);
      expect(result).toContain("hello.txt");
      expect(result).toContain("subdir");
    });
  });

  describe("search_files", () => {
    it("finds matching content", async () => {
      const result = await executeTool("search_files", { pattern: "const", path: "." }, testDir);
      expect(result).toContain("nested.ts");
    });
  });

  describe("shell_exec", () => {
    it("executes a command and returns output", async () => {
      const result = await executeTool("shell_exec", { command: "echo hello" }, testDir);
      expect(result.trim()).toBe("hello");
    });
  });
});
