import { describe, it, expect } from "vitest";
import { classifyTask, pickModel } from "../router.js";
import type { BcaveConfig } from "../../config/config.js";

const cfg = { autoRoute: true, modelHeavy: "gpt-5.4", modelLight: "gpt-5.4-mini", model: "manual-x" } as BcaveConfig;

describe("router.classifyTask", () => {
  it("무거운 작업(UI·개발·유지보수) → heavy", () => {
    for (const m of [
      "로그인 화면 만들어줘",
      "대시보드 UI 개선해줘",
      "이 버그 고쳐줘",
      "결제 기능 추가해줘",
      "유지보수 좀 해줘",
      "이 컴포넌트 반응형으로 바꿔줘",
      "프로필 페이지",
      "이 함수 리팩터링 해줘",
    ]) {
      expect(classifyTask(m)).toBe("heavy");
    }
  });

  it("간단한 질문·연산 → light", () => {
    for (const m of [
      "리액트가 뭐야?",
      "이 코드 설명해줘",
      "3 * 128",
      "안녕",
      "오늘 서울 날씨 어때?",
      "프로젝트 구조 알려줘",
    ]) {
      expect(classifyTask(m)).toBe("light");
    }
  });
});

describe("router.pickModel", () => {
  it("autoRoute 시 등급별 모델 선택", () => {
    expect(pickModel(cfg, "화면 만들어줘")).toEqual({ model: "gpt-5.4", tier: "heavy" });
    expect(pickModel(cfg, "이게 뭐야?")).toEqual({ model: "gpt-5.4-mini", tier: "light" });
  });
  it("autoRoute off 면 config.model 고정(manual)", () => {
    expect(pickModel({ ...cfg, autoRoute: false }, "화면 만들어줘")).toEqual({ model: "manual-x", tier: "manual" });
  });
});
