import { describe, it, expect } from "vitest";
import { ConversationManager } from "../conversation.js";
import { PermissionManager } from "../permissions.js";

describe("ConversationManager", () => {
  it("can be instantiated", () => {
    const pm = new PermissionManager("yolo");
    const cm = new ConversationManager(
      {
        hubUrl: "http://localhost:3000",
        accessToken: "hub-access-token",
        refreshToken: "hub-refresh-token",
        userEmail: "user@bcave.co.kr",
        userName: "테스트",
        model: "gpt-4o",
        apiKey: "",
        baseUrl: "https://api.openai.com/v1",
      },
      pm,
      process.cwd()
    );
    expect(cm).toBeDefined();
  });
});
