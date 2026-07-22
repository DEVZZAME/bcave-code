import { describe, expect, it } from "vitest";
import { buildSystemPrompt } from "../system-prompt.js";

describe("buildSystemPrompt", () => {
  it("includes the current working directory and core contracts", () => {
    const prompt = buildSystemPrompt("/tmp/example project");
    expect(prompt).toContain("Working directory: /tmp/example project");
    expect(prompt).toContain("API CONTRACT");
    expect(prompt).toContain("REQUEST METHOD CONTRACT");
    expect(prompt).toContain("HTML ARTIFACTS");
  });
});
