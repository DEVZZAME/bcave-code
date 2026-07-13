import { describe, it, expect } from "vitest";
import { ConversationManager } from "../conversation.js";
import { PermissionManager } from "../permissions.js";

describe("ConversationManager", () => {
  it("can be instantiated", () => {
    const pm = new PermissionManager("yolo");
    const cm = new ConversationManager(
      { apiKey: "sk-test", model: "gpt-4o", baseUrl: "https://api.openai.com/v1" },
      pm,
      process.cwd()
    );
    expect(cm).toBeDefined();
  });
});
