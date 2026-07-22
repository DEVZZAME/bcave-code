import { describe, expect, it } from "vitest";
import { formatClock, formatDuration, friendlyErrorMessage, friendlyVerifyLabel, readlineAnsi, shortenPath, toolResultLine, toolStatus } from "../rendering.js";

describe("CLI rendering", () => {
  it("shortens long paths while preserving the last two segments", () => {
    expect(shortenPath("/Users/test/work/project/src", "Auto mode", 25, "/Users/test"))
      .toBe("~/…/project/src");
  });

  it("marks ANSI sequences as non-printing for readline", () => {
    expect(readlineAnsi("\x1b[31mred\x1b[0m")).toBe("\x01\x1b[31m\x02red\x01\x1b[0m\x02");
  });

  it("formats tool progress and failures", () => {
    expect(toolStatus("read_file", { path: "src/index.ts" })).toContain("index.ts");
    expect(toolResultLine("shell_exec", "Exit code 2\nSTDERR: broken")).toContain("broken");
  });

  it("formats verification labels, errors and durations", () => {
    expect(friendlyVerifyLabel("서버 스모크")).toContain("실제로 열리는지");
    expect(friendlyErrorMessage("빌드 검증에 실패")).toContain("코드 오류");
    expect(formatClock(80_000)).toBe("1:20");
    expect(formatDuration(80_000)).toBe("1분 20초");
  });
});
