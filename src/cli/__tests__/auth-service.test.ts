import { describe, expect, it, vi } from "vitest";
import { authenticate, endSession } from "../auth-service.js";

describe("authentication service", () => {
  it("maps a HUB login to persisted session fields", async () => {
    const login = vi.fn(async () => ({
      accessToken: "access",
      refreshToken: "refresh",
      user: { id: 1, email: "user@example.com", name: "User", role: "USER", services: ["BCAVE_CODE"] },
    }));
    const result = await authenticate({ hubUrl: "https://hub" }, "user@example.com", "secret", login);
    expect(result.config).toMatchObject({ accessToken: "access", refreshToken: "refresh", apiKey: "" });
    expect(result.hasCliAccess).toBe(true);
    expect(login).toHaveBeenCalledWith("https://hub", "user@example.com", "secret");
  });

  it("revokes the remote session before clearing local identity", async () => {
    const logout = vi.fn(async () => undefined);
    const patch = await endSession({ hubUrl: "https://hub", accessToken: "a", refreshToken: "r" }, logout);
    expect(logout).toHaveBeenCalledWith("https://hub", "a", "r");
    expect(patch).toEqual({ accessToken: "", refreshToken: "", userEmail: "", userName: "" });
  });
});
