import { describe, it, expect } from "vitest";
import { ConversationManager, validateApiResponse } from "../conversation.js";
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
});
