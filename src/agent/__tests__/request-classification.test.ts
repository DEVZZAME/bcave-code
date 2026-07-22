import { describe, expect, it } from "vitest";
import { isDashboardArtifactRequest } from "../request-classification.js";

describe("isDashboardArtifactRequest", () => {
  it.each([
    "매출 대시보드 만들어줘",
    "운영 현황을 대시보드로 구현해줘",
    "Create a sales dashboard",
    "dashboard 생성해주세요",
  ])("recognizes an explicit dashboard creation request: %s", (message) => {
    expect(isDashboardArtifactRequest(message)).toBe(true);
  });

  it.each([
    "대시보드가 왜 안 열려?",
    "대시보드 확인해봐",
    "대시보드의 문제점을 파악해줘",
    "대시보드 말고 일반 서비스로 만들어줘",
    "대시보드라는 문자열이 포함되어 있어",
    "보고서 만들어줘",
    "리포트 화면을 검토해줘",
  ])("does not treat a mention as a creation request: %s", (message) => {
    expect(isDashboardArtifactRequest(message)).toBe(false);
  });
});
