import { describe, it, expect } from "vitest";
import { createOpenAIClient } from "../client.js";

// 게이트웨이 전용: 로그인(accessToken 보유) 상태만 지원한다.
const baseConfig = {
  hubUrl: "http://localhost:3000",
  accessToken: "hub-access-token",
  refreshToken: "hub-refresh-token",
  userEmail: "user@bcave.co.kr",
  userName: "테스트",
  model: "gpt-4o",
  apiKey: "",
  baseUrl: "https://api.openai.com/v1",
};

describe("OpenAI Client", () => {
  it("routes through the HUB gateway", () => {
    const client = createOpenAIClient({ ...baseConfig });
    expect(client.baseURL).toBe("http://localhost:3000/api/v1");
  });

  it("uses the access token as the credential", () => {
    const client = createOpenAIClient({ ...baseConfig });
    expect(client.apiKey).toBe("hub-access-token");
  });

  it("normalizes trailing slash in hubUrl", () => {
    const client = createOpenAIClient({ ...baseConfig, hubUrl: "http://localhost:3000/" });
    expect(client.baseURL).toBe("http://localhost:3000/api/v1");
  });
});
