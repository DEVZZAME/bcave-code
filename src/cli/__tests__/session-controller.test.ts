import { describe, expect, it, vi } from "vitest";
import { SessionController } from "../session-controller.js";

describe("session controller", () => {
  it("creates a title, increments turns and writes sessions", () => {
    const write = vi.fn();
    const controller = new SessionController(write, () => "session-id", () => new Date("2026-07-22T00:00:00Z"));
    const first = controller.persist("  첫 번째   요청  ", "/work", [{ role: "user", content: "hello" }], new Date("2026-07-22T00:01:00Z"));
    const second = controller.persist("다른 제목", "/work", [], new Date("2026-07-22T00:02:00Z"));
    expect(first).toMatchObject({ id: "session-id", title: "첫 번째 요청", turns: 1 });
    expect(second).toMatchObject({ title: "첫 번째 요청", turns: 2 });
    expect(write).toHaveBeenCalledTimes(2);
  });

  it("continues metadata from a restored session", () => {
    const write = vi.fn();
    const controller = new SessionController(write);
    controller.restore({ id: "old", createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-02T00:00:00Z", cwd: "/old", title: "기존", turns: 4, messages: [] });
    expect(controller.persist("new", "/new", [])).toMatchObject({ id: "old", title: "기존", turns: 5 });
  });
});
