import { describe, expect, it } from "vitest";
import { inferAppStack, inferDeployTarget } from "../app-planning.js";

describe("app planning defaults", () => {
  it("starts a generic service locally without a chooser", () => {
    expect(inferAppStack("관리 서비스를 만들어줘", false)).toBe("react-vite-express");
    expect(inferDeployTarget("관리 서비스를 만들어줘")).toBe("local");
  });

  it("preserves explicit stack and deployment intent", () => {
    expect(inferAppStack("SEO가 중요한 Next.js 서비스를 Vercel에 만들어줘", false)).toBe("nextjs");
    expect(inferDeployTarget("SEO가 중요한 Next.js 서비스를 Vercel에 만들어줘")).toBe("vercel");
    expect(inferAppStack("기존 서비스를 개선해줘", true)).toBe("existing");
  });
});
