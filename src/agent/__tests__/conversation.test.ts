import { describe, it, expect } from "vitest";
import { ConversationManager } from "../conversation.js";
import { PermissionManager } from "../permissions.js";

const config = {
  hubUrl: "http://localhost:3000",
  accessToken: "hub-access-token",
  refreshToken: "hub-refresh-token",
  userEmail: "user@bcave.co.kr",
  userName: "테스트",
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

  it("injects the configured design system for service application UI", async () => {
    const cm = new ConversationManager(config, new PermissionManager("yolo"), process.cwd());
    const run = cm.run("관리자 웹 서비스를 만들어줘");

    await run.next(); // model 이벤트 직전까지 실행해 시스템 지침을 주입한다.

    const injected = cm.getHistory().find((message) =>
      message.role === "system" && typeof message.content === "string" &&
      message.content.includes("모든 웹 UI는 BCAVE 디자인 시스템을 반드시 사용"),
    );
    expect(injected).toBeDefined();
    expect(String(injected?.content)).toContain("bcave-tokens.css");
    expect(String(injected?.content)).toContain("TSX/JSX");
    await run.return(undefined);
  });

  it("lets an explicit AXIS request override the configured BCAVE system", async () => {
    const cm = new ConversationManager(config, new PermissionManager("yolo"), process.cwd());
    const run = cm.run("AXIS 디자인으로 관리자 서비스를 만들어줘");

    await run.next();

    const systems = cm.getHistory().filter((message) => message.role === "system")
      .map((message) => String(message.content));
    expect(systems.some((content) => content.includes("모든 웹 UI는 AXIS 디자인 시스템을 반드시 사용"))).toBe(true);
    expect(systems.some((content) => content.includes("모든 웹 UI는 BCAVE 디자인 시스템을 반드시 사용"))).toBe(false);
    await run.return(undefined);
  });

  it("uses the configured system for a UI artifact without asking again", async () => {
    const cm = new ConversationManager(config, new PermissionManager("yolo"), process.cwd());
    const run = cm.run("운영 대시보드 화면을 만들어줘");

    const first = await run.next();

    expect(first.value).toMatchObject({ type: "model" });
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
});
