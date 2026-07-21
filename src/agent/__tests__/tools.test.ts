import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import XLSX from "xlsx";
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

  it("has 5 tool definitions (fs + shell only; UI direction is auto-injected)", () => {
    expect(TOOL_DEFINITIONS).toHaveLength(5);
  });

  it("does NOT expose design/dashboard tools in chat (design system via /dashboard; art direction auto-injected)", () => {
    const names = TOOL_DEFINITIONS.map((t) => t.function.name);
    expect(names).not.toContain("create_dashboard");
    expect(names).not.toContain("dashboard_design_system");
    expect(names).not.toContain("frontend_design");
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

    it("stops at a second vertical table instead of mixing its rows", async () => {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([
        ["브랜드", "총매출", "주문건수"],
        ["A", 100, 2],
        ["B", 200, 3],
        ["고객 세그먼트 분포", null, null],
        ["세그먼트", "고객수", "비중"],
        ["VIP", 10, 0.2],
      ]);
      XLSX.utils.book_append_sheet(wb, ws, "브랜드별요약");
      XLSX.writeFile(wb, path.join(testDir, "multi-table.xlsx"));
      const result = await executeTool("read_file", { path: "multi-table.xlsx" }, testDir);
      expect(result).toContain("약 2행 × 3열");
      expect(result).not.toContain("VIP | 10");
    });
  });

  describe("write_file", () => {
    it("advertises structured dashboard fields instead of requiring fragile code fences", () => {
      const write = TOOL_DEFINITIONS.find((t) => t.function.name === "write_file")!;
      const props = write.function.parameters.properties as Record<string, unknown>;
      expect(props).toHaveProperty("body");
      expect(props).toHaveProperty("app_script");
      expect(write.function.parameters.required).toEqual(["path"]);
    });

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
