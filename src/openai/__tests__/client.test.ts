import OpenAI from "openai";
import { describe, it, expect, vi } from "vitest";
import { chat, createOpenAIClient, MAX_COMPLETION_TOKENS, retryDelayMs } from "../client.js";

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
    expect(client.maxRetries).toBe(0);
  });

  it("normalizes trailing slash in hubUrl", () => {
    const client = createOpenAIClient({ ...baseConfig, hubUrl: "http://localhost:3000/" });
    expect(client.baseURL).toBe("http://localhost:3000/api/v1");
  });

  it("caps completion tokens to reduce TPM reservation", async () => {
    const create = vi.fn().mockResolvedValue({ choices: [] });
    const client = { chat: { completions: { create } } } as unknown as OpenAI;

    await chat(client, [{ role: "user", content: "서비스를 만들어줘" }], "gpt-5.4-mini");

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ max_completion_tokens: MAX_COMPLETION_TOKENS }),
      expect.any(Object),
    );
  });

  it("honors the longer token reset header", () => {
    const err = new OpenAI.APIError(
      429,
      {},
      "rate limited",
      new Headers({ "retry-after": "1", "x-ratelimit-reset-tokens": "2.772s" }),
    );

    expect(retryDelayMs(err, 0, 0)).toBe(2_772);
  });

  it("falls back to exponential backoff when reset headers are absent", () => {
    const err = new OpenAI.APIError(503, {}, "unavailable", new Headers());
    expect(retryDelayMs(err, 2, 0)).toBe(4_000);
  });

  it("keeps a 429 internal and retries after the cooldown", async () => {
    vi.useFakeTimers();
    try {
      const rateLimit = new OpenAI.APIError(
        429,
        {},
        "rate limited",
        new Headers({ "retry-after": "1s" }),
      );
      const create = vi.fn()
        .mockRejectedValueOnce(rateLimit)
        .mockResolvedValueOnce({ choices: [] });
      const client = { chat: { completions: { create } } } as unknown as OpenAI;

      const result = chat(client, [{ role: "user", content: "계속해줘" }], "gpt-5.4-mini");
      await vi.advanceTimersByTimeAsync(3_000);

      await expect(result).resolves.toEqual({ choices: [] });
      expect(create).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
