import { describe, it, expect } from "vitest";
import { auditApiContracts, auditUiSource, ConversationManager, pptxPackageIssues, validateApiResponse } from "../conversation.js";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { PermissionManager } from "../permissions.js";

const config = {
  hubUrl: "http://localhost:3000",
  accessToken: "hub-access-token",
  refreshToken: "hub-refresh-token",
  userEmail: "user@bcave.co.kr",
  userName: "테스트",
  llmUrl: "",
  model: "gpt-5.4-mini",
  autoRoute: false,
  modelHeavy: "gpt-5.4-mini",
  modelLight: "gpt-5.4-mini",
  autoVerify: true,
  verifyCmds: [],
  maxVerifyRounds: 2,
  smokeTest: true,
  designSystem: "bcave",
  apiKey: "",
  baseUrl: "https://api.openai.com/v1",
};

async function reachAppModel(cm: ConversationManager, request: string, deploy = "5") {
  const stackQuestion = cm.run(request);
  expect((await stackQuestion.next()).value).toMatchObject({ type: "text" });
  await stackQuestion.return(undefined);

  const deployQuestion = cm.run("1");
  const deployEvent = await deployQuestion.next();
  if (deployEvent.value?.type === "model") return deployQuestion;
  expect(deployEvent.value).toMatchObject({ type: "text" });
  await deployQuestion.return(undefined);

  const app = cm.run(deploy);
  expect((await app.next()).value).toMatchObject({ type: "model" });
  return app;
}

describe("ConversationManager", () => {
  it("rejects a PPTX with orphan slide XML files and an empty slide registry", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "bcave-empty-slide-registry-"));
    fs.mkdirSync(path.join(root, "src", "ppt", "slides"), { recursive: true });
    fs.mkdirSync(path.join(root, "src", "ppt", "_rels"), { recursive: true });
    fs.writeFileSync(path.join(root, "src", "[Content_Types].xml"), "<Types/>");
    fs.writeFileSync(path.join(root, "src", "ppt", "presentation.xml"), '<p:presentation xmlns:p="p"><p:sldIdLst/></p:presentation>');
    fs.writeFileSync(path.join(root, "src", "ppt", "_rels", "presentation.xml.rels"), "<Relationships/>");
    fs.writeFileSync(path.join(root, "src", "ppt", "slides", "slide1.xml"), '<p:sld xmlns:p="p"/>');
    const out = path.join(root, "empty.pptx");
    expect(spawnSync("zip", ["-qr", out, "[Content_Types].xml", "ppt"], { cwd: path.join(root, "src") }).status).toBe(0);
    const issues = pptxPackageIssues(out);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain("등록된 슬라이드가 0장");
    expect(issues[0]).toContain("미등록 slide XML 1개");
    fs.rmSync(root, { recursive: true, force: true });
  });
  it("can be instantiated", () => {
    const pm = new PermissionManager("yolo");
    const cm = new ConversationManager(
      config,
      pm,
      process.cwd()
    );
    expect(cm).toBeDefined();
  });

  it("does NOT inject design system context for app/service builds (routing loop fix)", async () => {
    // 앱 빌드는 DS 컨텍스트를 주입하지 않는다 — 주입 시 모델이 write_file에 design_system
    // 필드를 포함해 body/app_script 강제 루프에 빠지던 문제를 방지한다.
    const cm = new ConversationManager(config, new PermissionManager("yolo"), process.cwd());
    const run = await reachAppModel(cm, "관리자 웹 서비스를 만들어줘");

    const hasAppDsContext = cm.getHistory().some((message) =>
      message.role === "system" && typeof message.content === "string" &&
      message.content.includes("모든 웹 UI는 BCAVE 디자인 시스템을 반드시 사용"),
    );
    expect(hasAppDsContext).toBe(false);
    // 앱 빌드 지시(APPLICATION_CONTEXT)는 주입된다
    const hasAppContext = cm.getHistory().some((message) =>
      message.role === "system" && String(message.content).includes("APPLICATION_CONTEXT"),
    );
    expect(hasAppContext).toBe(true);
    await run.return(undefined);
  });

  it("does NOT inject design system context even with an explicit system name in app builds", async () => {
    const cm = new ConversationManager(config, new PermissionManager("yolo"), process.cwd());
    const run = await reachAppModel(cm, "AXIS 디자인으로 관리자 서비스를 만들어줘");

    const hasDsContext = cm.getHistory().some((message) =>
      message.role === "system" && String(message.content).includes("모든 웹 UI는 AXIS 디자인 시스템을 반드시 사용"),
    );
    expect(hasDsContext).toBe(false);
    await run.return(undefined);
  });

  it("asks for a design system before a standalone dashboard", async () => {
    const cm = new ConversationManager(config, new PermissionManager("yolo"), process.cwd());
    const choose = cm.run("운영 대시보드 화면을 만들어줘");
    expect((await choose.next()).value).toMatchObject({ type: "text" });
    await choose.return(undefined);
    const run = cm.run("1");
    expect((await run.next()).value).toMatchObject({ type: "model" });
    expect(cm.getHistory().some((message) =>
      message.role === "system" && String(message.content).includes("BCAVE 디자인 시스템 강제 파이프라인"),
    )).toBe(true);
    await run.return(undefined);
  });

  it("does not show the design-system chooser for a dashboard mention", async () => {
    const cm = new ConversationManager(config, new PermissionManager("yolo"), process.cwd());
    const run = cm.run("대시보드가 왜 안 열리는지 확인해줘");
    expect((await run.next()).value).toMatchObject({ type: "model" });
    expect(cm.getHistory().some((message) =>
      message.role === "assistant" && String(message.content).includes("디자인 시스템을 선택"),
    )).toBe(false);
    await run.return(undefined);
  });

  it("routes a report PowerPoint request to PPTX instead of the dashboard HTML flow", async () => {
    const template = path.join(os.tmpdir(), `team-template-${Date.now()}.pptx`);
    fs.writeFileSync(template, "PK");
    const cm = new ConversationManager(config, new PermissionManager("yolo"), process.cwd(), template);
    const run = cm.run("보고서.md 내용으로 피피티 만들어줘");
    expect((await run.next()).value).toMatchObject({ type: "model" });
    expect(cm.getHistory().some((message) =>
      message.role === "system" && String(message.content).startsWith("[PRESENTATION_CONTEXT]"),
    )).toBe(true);
    const presentationContext = cm.getHistory().find((message) =>
      message.role === "system" && String(message.content).startsWith("[PRESENTATION_CONTEXT]"),
    );
    expect(String(presentationContext?.content)).toContain(template);
    expect(String(presentationContext?.content)).toContain(path.join(process.cwd(), "보고서.pptx"));
    expect(String(presentationContext?.content)).toContain("_v2, _final, _verified 같은 별도 PPTX를 만들지 말고");
    expect(String(presentationContext?.content)).toContain("python-pptx와 xml.etree는 사용하지 않는다");
    expect(String(presentationContext?.content)).toContain("Python 3+lxml");
    expect(String(presentationContext?.content)).toContain("선택 가능한 레이아웃 라이브러리");
    expect(String(presentationContext?.content)).toContain("같은 페이지를 여러 번 복제");
    expect(String(presentationContext?.content)).toContain("꼭 필요한 경우에만 기존 텍스트박스의 폭·높이를 조정");
    expect(String(presentationContext?.content)).toContain("gridSpan/hMerge");
    expect(String(presentationContext?.content)).toContain("현재 세션 템플릿의 실제 페이지 복제본");
    expect(String(presentationContext?.content)).toContain("최종 위치에는 완성된 .pptx 파일 하나만");
    expect(String(presentationContext?.content)).toContain("add_textbox/add_shape");
    await run.return(undefined);
    fs.rmSync(template, { force: true });
  });

  it("asks for a template when no CLI, config, or working-directory PPTX exists", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bcave-no-ppt-template-"));
    const cm = new ConversationManager({ ...config, pptTemplatePath: "" }, new PermissionManager("yolo"), dir);
    const run = cm.run("보고서로 피피티 만들어줘");
    expect((await run.next()).value).toMatchObject({ type: "text", content: expect.stringContaining("템플릿") });
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("auto-detects a template beside an absolute source document", async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "bcave-ppt-cwd-"));
    const sourceDir = fs.mkdtempSync(path.join(os.tmpdir(), "bcave-ppt-source-"));
    const source = path.join(sourceDir, "보고서.md");
    const template = path.join(sourceDir, "team_template.pptx");
    fs.writeFileSync(source, "# 보고서");
    fs.writeFileSync(template, "PK");
    const cm = new ConversationManager({ ...config, pptTemplatePath: "" }, new PermissionManager("yolo"), cwd);
    const run = cm.run(`${source} 이걸로 피피티 만들어줘`);
    expect((await run.next()).value).toMatchObject({ type: "model" });
    expect(cm.getHistory().some((message) => message.role === "system" && String(message.content).includes(template))).toBe(true);
    await run.return(undefined);
    fs.rmSync(cwd, { recursive: true, force: true });
    fs.rmSync(sourceDir, { recursive: true, force: true });
  });

  it("accepts a template path embedded in a full sentence", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bcave-ppt-explicit-"));
    const template = path.join(dir, "bcave_ppt_template.pptx");
    fs.writeFileSync(template, "PK");
    const cm = new ConversationManager({ ...config, pptTemplatePath: "" }, new PermissionManager("yolo"), dir);
    const run = cm.run(`보고서.md로 피피티 만들어줘. 템플릿은 ${template} 이거야`);
    expect((await run.next()).value).toMatchObject({ type: "model" });
    expect(cm.getHistory().some((message) => message.role === "system" && String(message.content).includes(template))).toBe(true);
    await run.return(undefined);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("clears a pending template question when the next request is a dashboard", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bcave-ppt-cancel-"));
    const cm = new ConversationManager({ ...config, pptTemplatePath: "" }, new PermissionManager("yolo"), dir);
    const ask = cm.run("보고서.md로 피피티 만들어줘");
    expect((await ask.next()).value).toMatchObject({ type: "text", content: expect.stringContaining("템플릿") });
    await ask.return(undefined);
    const dashboard = cm.run("매출.xlsx로 대시보드 만들어줘");
    expect((await dashboard.next()).value).toMatchObject({ type: "text", content: expect.stringContaining("디자인 시스템") });
    await dashboard.return(undefined);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("does not let a stale design choice intercept a port troubleshooting request", async () => {
    const noDefault = { ...config, designSystem: "" };
    const cm = new ConversationManager(noDefault, new PermissionManager("yolo"), process.cwd());
    const choose = cm.run("운영 대시보드 화면을 만들어줘");
    expect((await choose.next()).value).toMatchObject({ type: "text" });
    await choose.return(undefined);

    const troubleshoot = cm.run("아직도 3000번 포트에서 확인이 안돼");
    const first = await troubleshoot.next();

    expect(first.value).toMatchObject({ type: "model" });
    await troubleshoot.return(undefined);
  });

  it("does NOT inject DS context for multi-turn app builds either", async () => {
    const cm = new ConversationManager(config, new PermissionManager("yolo"), process.cwd());
    const r1 = await reachAppModel(cm, "관리자 웹 서비스를 만들어줘");
    await r1.return(undefined);

    const r2 = cm.run("AXIS 디자인시스템으로 서비스를 구현해줘");
    await r2.next();

    // 앱 빌드는 DS 컨텍스트 없음
    const dsContexts = cm.getHistory().filter((m) =>
      m.role === "system" && String(m.content).includes("[ACTIVE_DESIGN_SYSTEM:"),
    );
    expect(dsContexts).toHaveLength(0);
    const appContexts = cm.getHistory().filter((m) =>
      m.role === "system" && String(m.content).startsWith("[APPLICATION_CONTEXT]"),
    );
    const devContexts = cm.getHistory().filter((m) =>
      m.role === "system" && String(m.content).startsWith("[DEV]"),
    );
    expect(appContexts).toHaveLength(1);
    expect(devContexts).toHaveLength(1);
    await r2.return(undefined);
  });

  it("standalone dashboard request still uses DS pipeline (not affected by app build fix)", async () => {
    const cm = new ConversationManager(config, new PermissionManager("yolo"), process.cwd());
    const choose = cm.run("매출 분석 대시보드를 만들어줘");
    expect((await choose.next()).value).toMatchObject({ type: "text" });
    await choose.return(undefined);
    const run = cm.run("1");
    const first = await run.next();
    // 대시보드 단독 요청은 DS 강제 파이프라인을 사용한다
    expect(first.value).toMatchObject({ type: "model" });
    expect(cm.getHistory().some((m) =>
      m.role === "system" && String(m.content).includes("BCAVE 디자인 시스템 강제 파이프라인"),
    )).toBe(true);
    await run.return(undefined);
  });

  it("treats an explicit SQLite service request as local quick validation", async () => {
    const cm = new ConversationManager(config, new PermissionManager("yolo"), process.cwd());
    const run = await reachAppModel(cm, "SQLite로 빠르게 검증할 관리 서비스를 만들어줘");

    const appContext = cm.getHistory().find((m) =>
      m.role === "system" && String(m.content).includes("[APPLICATION_CONTEXT]"),
    );
    expect(String(appContext?.content)).toContain("SQLite 로컬 빠른 검증");
    expect(String(appContext?.content)).toContain("GET /api/health");
    await run.return(undefined);
  });

  it("requires a successful JSON health response before an application can complete", () => {
    expect(validateApiResponse("/api/health", 200, '{"ok":true}', true)).toBeNull();
    expect(validateApiResponse("/api/health", 404, '{"message":"missing"}', true)).toContain("HTTP 404");
    expect(validateApiResponse("/api/health", 200, "<html>not json</html>", true)).toContain("JSON 파싱 불가");
    expect(validateApiResponse("/api/health", 200, "", true)).toContain("빈 응답");
  });

  it("rejects visible placeholder navigation and fabricated dashboard values", () => {
    const issues = auditUiSource(`
      <nav><a className="active">Overview</a><a href="#">Products</a></nav>
      <Metric trend="+12.5%" />
      <p>TUESDAY, JUNE 24, 2025</p>
    `, "src/main.tsx");
    expect(issues).toEqual(expect.arrayContaining([
      expect.stringContaining("이동 기능이 없는"),
      expect.stringContaining("임시 주소"),
      expect.stringContaining("고정 증감률"),
      expect.stringContaining("고정 문구"),
    ]));
  });

  it("detects frontend and backend request method mismatches", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bcave-api-audit-"));
    try {
      fs.mkdirSync(path.join(dir, "src"));
      fs.mkdirSync(path.join(dir, "server"));
      fs.writeFileSync(path.join(dir, "src", "main.tsx"), `api('/api/auth/logout')`);
      fs.writeFileSync(path.join(dir, "server", "index.ts"), `app.post('/api/auth/logout', handler)`);
      expect(auditApiContracts(dir)).toEqual([
        expect.stringContaining("GET로 되어 있지만 서버는 POST만 허용"),
      ]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
