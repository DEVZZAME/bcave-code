import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import XLSX from "xlsx";
import { executeTool, extractServerPorts, getToolCategory, isDevServerCommand, TOOL_DEFINITIONS } from "../tools.js";

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

  it("detects long-running dev server commands without treating build commands as servers", () => {
    expect(isDevServerCommand("npm run dev")).toBe(true);
    expect(isDevServerCommand("pnpm start")).toBe(true);
    expect(isDevServerCommand("npx vite --host 0.0.0.0")).toBe(true);
    expect(isDevServerCommand("npm run build")).toBe(false);
    expect(isDevServerCommand("npm test")).toBe(false);
    expect(isDevServerCommand("lsof -nP -iTCP | rg 'node|vite|tsx'")).toBe(false);
    expect(isDevServerCommand("cat /tmp/server.log | grep vite")).toBe(false);
  });

  it("uses the actual fallback frontend port and ignores an occupied port", () => {
    const logs = "Port 5173 is in use, trying another one...\nLocal: http://localhost:\u001b[1m5174\u001b[22m/\nAPI on 3001";
    expect(extractServerPorts(logs)).toEqual([5174, 3001]);
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
      expect(props).toHaveProperty("design_system");
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

    it("rejects dashboards that discard normalized rows or read row objects by numeric index", async () => {
      const result = await executeTool("write_file", {
        path: "broken-data-dashboard.html",
        content: `<!doctype html><html><body><canvas id="c"></canvas><script>window.__DATA={"월별요약":[{"연월":"2026-01","총매출":100}]};</script><script>const d=window.__DATA||{};const rows=(d['월별요약']||[]).slice(1);const labels=rows.map(r=>r[0]);</script></body></html>`,
      }, testDir);
      expect(result).toContain(".slice(1+)");
      expect(result).toContain("숫자 인덱스");
      expect(result).not.toContain("검토 통과");
    });

    it("allows tuple indexes and ranking slices that are not normalized data rows", async () => {
      const result = await executeTool("write_file", {
        path: "valid-aggregation-dashboard.html",
        content: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="out"></div><script>window.__DATA={"법인":[{"국가":"한국"}]};</script><script>const rows=window.__DATA['법인']||[];const counts={한국:2,미국:1};const entries=Object.entries(counts).sort((a,b)=>b[1]-a[1]);const rest=entries.slice(5).reduce((sum,e)=>sum+e[1],0);const actions=[["검토",2],["완료",1]];document.getElementById('out').textContent=entries.map(e=>e[0]).join(',')+actions.map(a=>a[0]).join(',')+rest+rows.length;</script></body></html>`,
      }, testDir);
      expect(result).toContain("검토 통과");
      expect(result).not.toContain("숫자 인덱스");
      expect(result).not.toContain(".slice(1+)");
    });

    it("never tells the model to stop repairing a failed design lint", async () => {
      const args = {
        path: "invalid-dashboard.html",
        design_system: "bcave",
        body: '<div class="page"><div class="row">invalid class</div></div>',
        app_script: "void 0;",
      };
      const first = await executeTool("write_file", args, testDir);
      const second = await executeTool("write_file", args, testDir);
      expect(first).toContain("File written but NOT complete");
      expect(second).toContain("해당 body 구간을 다시 작성");
      expect(second).not.toContain("더 이상 자동수정하지 마세요");
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
