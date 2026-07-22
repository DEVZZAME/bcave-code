import { describe, expect, it, vi } from "vitest";
import { availableModels, FALLBACK_MODELS } from "../model-service.js";

describe("model service", () => {
  it("uses models returned by HUB", async () => {
    const loader = vi.fn(async () => [{ id: "model-a", displayName: "A", description: "test" }]);
    const result = await availableModels({ hubUrl: "https://hub", accessToken: "token" }, loader);
    expect(result).toEqual({ models: [{ id: "model-a", displayName: "A", description: "test" }], usedFallback: false });
  });

  it("falls back without credentials or when HUB fails", async () => {
    expect((await availableModels({ hubUrl: "https://hub", accessToken: "" })).models).toEqual(FALLBACK_MODELS);
    const result = await availableModels({ hubUrl: "https://hub", accessToken: "token" }, async () => { throw new Error("offline"); });
    expect(result.usedFallback).toBe(true);
  });
});
