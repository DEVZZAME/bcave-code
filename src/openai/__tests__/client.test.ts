import { describe, it, expect } from "vitest";
import { createOpenAIClient } from "../client.js";

describe("OpenAI Client", () => {
  it("creates client with custom baseURL", () => {
    const client = createOpenAIClient({
      apiKey: "sk-test",
      model: "gpt-4o",
      baseUrl: "https://custom.api.com/v1",
    });
    expect(client).toBeDefined();
  });

  it("creates client with default baseURL", () => {
    const client = createOpenAIClient({
      apiKey: "sk-test",
      model: "gpt-4o",
      baseUrl: "https://api.openai.com/v1",
    });
    expect(client).toBeDefined();
  });
});
