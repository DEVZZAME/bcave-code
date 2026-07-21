// 용도별 모델 라우팅 — 무거운 작업(UI·서비스 개발·유지보수)은 강한 모델, 간단 질문·연산은 mini.
// 규칙 기반(추가 LLM 호출 없이 즉시 판정). config.autoRoute 로 켜고 끈다.

import type { BcaveConfig } from "../config/config.js";

export type Tier = "heavy" | "light";

// 만들기/수정 등 "동작" 동사 → 확실히 무거움
const ACTION =
  /(만들|구현|개발|생성|추가|작성|짜(?:줘|봐|주세|자)|빌드|스캐폴|세팅|셋업|수정|고쳐|고치|바꿔|바꾸|변경|지워|삭제|제거|옮겨|이동|리팩터|리팩토링|디버그|개선|최적화|배포|커밋|병합|유지보수|유지 ?보수|리뷰|build|create|implement|make|add|writ(?:e|ing)|refactor|debug|fix|patch|deploy|scaffold|set ?up|maintain|migrat|integrat|review)/i;

// UI/코드 "주제어" — 질문이 아니면 만들/고칠 의도로 본다
const UITOPIC =
  /(화면|페이지|컴포넌트|레이아웃|랜딩|버튼|폼|입력창|모달|드롭다운|네비|사이드바|헤더|푸터|카드|테이블|대시보드|디자인|스타일|ui\b|ux\b|css|tailwind|스타일링|react|리액트|vue|뷰|next|넥스트|svelte|스벨트|화면단|프론트|frontend|screen|page|component|layout|landing|button|modal|navbar|sidebar|design|endpoint|api|엔드포인트|스키마|schema|데이터베이스|기능\s*추가|feature)/i;

// 질문/설명/연산 → 가벼움
const QUESTION =
  /(무엇|뭐(?:야|니|지|예요|에요)?|무슨|왜|어떻게|어떤|언제|어디|누구|누가|얼마|차이|뜻|의미|정의|알려|설명|가르쳐|궁금|추천|맞(?:아|나요)|될까|인가요?|나요\?|은가요|\?|what|why|how|when|where|who|which|explain|difference|meaning|define|\bvs\b|should i)/i;
const CALC = /^[\s\d.,()+\-*/×÷%^=]+$/;
const CALC_WORD = /(계산|더하|빼기|곱하|나누|제곱|루트|합계|평균|퍼센트|환율)/;

/** 메시지의 작업 성격을 heavy/light 로 분류. */
export function classifyTask(message: string): Tier {
  const m = (message || "").trim();
  if (!m) return "light";
  if (ACTION.test(m)) return "heavy"; // 무언가 만들/고치기 → 무거움
  const isQuestion = QUESTION.test(m);
  if (UITOPIC.test(m) && !isQuestion) return "heavy"; // "로그인 화면" 처럼 UI 주제 + 비질문 → 구현 의도
  if (isQuestion || CALC.test(m) || CALC_WORD.test(m)) return "light"; // 질문/연산 → 가벼움
  if (m.length < 12) return "light"; // 짧은 잡담/인사
  return "heavy"; // 애매하면 품질 우선(무거운 쪽)
}

/** config + 메시지 → 실제 사용할 모델과 등급. autoRoute off 면 config.model 그대로. */
export function pickModel(config: BcaveConfig, message: string): { model: string; tier: Tier | "manual" } {
  if (!config.autoRoute) return { model: config.model, tier: "manual" };
  const tier = classifyTask(message);
  return { model: tier === "heavy" ? config.modelHeavy : config.modelLight, tier };
}
