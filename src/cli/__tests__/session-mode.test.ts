import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { pathToFileURL } from "node:url";
import { resolveSessionAssetRoot, SessionModeRunner } from "../session-mode.js";

async function collect(runner: SessionModeRunner, message: string) {
  const events = [];
  for await (const event of runner.run(message)) events.push(event);
  return events;
}

describe("SessionModeRunner", () => {
  it("resolves bundled assets from the installed CLI root", () => {
    const installRoot = path.join(path.parse(process.cwd()).root, "opt", "bcave");
    const moduleUrl = pathToFileURL(path.join(installRoot, "dist", "cli", "session-mode.js")).href;
    expect(resolveSessionAssetRoot(moduleUrl)).toBe(path.join(installRoot, "assets", "session-mode"));
  });

  it("asks for a design system then copies the selected prepared dashboard", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "bcave-session-mode-"));
    const prepared = path.join(root, "dashboard");
    const cwd = path.join(root, "output");
    fs.mkdirSync(prepared);
    fs.mkdirSync(cwd);
    fs.writeFileSync(path.join(prepared, "bcave-dashboard.html"), "bcave demo");
    fs.writeFileSync(path.join(prepared, "axis-dashboard.html"), "axis demo");
    const runner = new SessionModeRunner(cwd, { dashboardRoot: prepared, delayMs: 0 });

    const choose = await collect(runner, "/tmp/data.xlsx 대시보드 만들어줘");
    expect(choose[0]).toMatchObject({ type: "text" });
    expect(String((choose[0] as { content: string }).content)).toContain("디자인 시스템을 선택");

    const result = await collect(runner, "2");
    expect(fs.readFileSync(path.join(cwd, "axis-dashboard.html"), "utf8")).toBe("axis demo");
    expect(result.some((event) => event.type === "text" && event.content.includes("axis-dashboard.html"))).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("overwrites the existing BCAVE dashboard with the prepared edit", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "bcave-session-edit-"));
    const prepared = path.join(root, "dashboard");
    const updates = path.join(root, "updates");
    const cwd = path.join(root, "output");
    fs.mkdirSync(prepared);
    fs.mkdirSync(updates);
    fs.mkdirSync(cwd);
    fs.writeFileSync(path.join(prepared, "bcave-dashboard.html"), "bcave original");
    fs.writeFileSync(path.join(updates, "bcave-dashboard.html"), "bcave edited");
    const runner = new SessionModeRunner(cwd, {
      dashboardRoot: prepared,
      dashboardUpdateRoot: updates,
      delayMs: 0,
    });
    await collect(runner, "data.xlsx 대시보드 만들어줘");
    await collect(runner, "1");
    await collect(runner, "이 결과물을 수정해줘");
    expect(fs.readFileSync(path.join(cwd, "bcave-dashboard.html"), "utf8")).toBe("bcave edited");
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("overwrites the existing AXIS dashboard with the prepared dark version", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "axis-session-edit-"));
    const prepared = path.join(root, "dashboard");
    const updates = path.join(root, "updates");
    const cwd = path.join(root, "output");
    fs.mkdirSync(prepared);
    fs.mkdirSync(updates);
    fs.mkdirSync(cwd);
    fs.writeFileSync(path.join(prepared, "axis-dashboard.html"), "axis original");
    fs.writeFileSync(path.join(updates, "axis-dashboard1.html"), "axis dark");
    const runner = new SessionModeRunner(cwd, {
      dashboardRoot: prepared,
      dashboardUpdateRoot: updates,
      delayMs: 0,
    });
    await collect(runner, "data.xlsx 대시보드 만들어줘");
    await collect(runner, "2");
    await collect(runner, "다크모드로 바꿔줘");
    expect(fs.readFileSync(path.join(cwd, "axis-dashboard.html"), "utf8")).toBe("axis dark");
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("copies one of the prepared fashion projects without an LLM", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "bcave-session-project-"));
    const prepared = path.join(root, "project");
    const cwd = path.join(root, "output");
    fs.mkdirSync(prepared);
    fs.mkdirSync(cwd);
    for (const name of ["one", "three", "two"]) {
      fs.mkdirSync(path.join(prepared, name));
      fs.writeFileSync(path.join(prepared, name, "package.json"), `{"name":"${name}"}`);
    }
    const runner = new SessionModeRunner(cwd, { projectRoot: prepared, delayMs: 0, random: () => 0.5 });
    await collect(runner, "패션회사에서 사용할 서비스를 하나 개발해줘");
    expect(fs.existsSync(path.join(cwd, "three", "package.json"))).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  });

  it("does not fall through to arbitrary requests", async () => {
    const runner = new SessionModeRunner(process.cwd(), { delayMs: 0 });
    const events = await collect(runner, "오늘 날씨 알려줘");
    expect(events[0]).toMatchObject({ type: "text" });
    expect(String((events[0] as { content: string }).content)).toContain("Session mode");
  });
});
