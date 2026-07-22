import { describe, expect, it } from "vitest";
import { homeRelativePath, messageText, relativeTime } from "../session-format.js";

describe("session formatting", () => {
  it("formats relative timestamps", () => {
    const now = new Date("2026-07-22T12:00:00Z").getTime();
    expect(relativeTime("2026-07-22T11:55:00Z", now)).toBe("5분 전");
    expect(relativeTime("2026-07-20T12:00:00Z", now)).toBe("2일 전");
  });

  it("shortens home paths and extracts multipart text", () => {
    expect(homeRelativePath("/Users/me/project", "/Users/me")).toBe("~/project");
    expect(messageText({ content: [{ text: "hello" }, "world"] })).toBe("hello world");
  });
});
