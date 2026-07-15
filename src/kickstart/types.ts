// /kickstart — 정적(토큰 0) 요구사항 수집 마법사 타입.
// 질문 정의는 로직과 분리된 순수 데이터로 관리한다.

export type QuestionType =
  | "single_select"
  | "multi_select"
  | "text"
  | "date";

export interface QuestionOption {
  label: string;
  value: string;
}

export interface QuestionCondition {
  field: string; // 이전 답변의 questionId(=저장 필드)
  operator: "equals" | "includes" | "not_equals";
  value: unknown;
}

export interface KickstartQuestion {
  id: string; // 고유 ID = 저장 필드명
  type: QuestionType;
  message: string;
  description?: string;
  options?: QuestionOption[];
  /** 텍스트/날짜에서 빈 입력 허용(건너뛰기) */
  optional?: boolean;
  /** "잘 모르겠어요"를 unknown 으로 저장하는 옵션값 (single_select 에서 사용) */
  unknownValue?: string;
  condition?: QuestionCondition;
}

export interface ProjectSchema {
  type: string; // dashboard / presentation / ...
  label: string; // 메뉴 표시명
  intro: string; // 첫 안내 문구
  questions: KickstartQuestion[];
}

/** 답변 하나의 결과 (IO → 엔진) */
export type Answer =
  | { kind: "value"; value: string | string[] }
  | { kind: "unknown" }
  | { kind: "back" }
  | { kind: "cancel" };

/** 마법사 진행/결과 상태 (임시저장·resume 용) */
export interface KickstartState {
  version: string;
  createdAt: string;
  updatedAt: string;
  status: "draft" | "confirmed";
  projectType: string; // 실제로 진행한 유형(질문 스키마 기준). discovery 면 "discovery"
  recommendedType?: string; // discovery 에서 규칙 기반으로 추천된 최종 유형
  answers: Record<string, string | string[]>; // questionId → 값
  unknownFields: string[]; // "잘 모르겠어요"로 남긴 필드
  /** resume 용: 아직 답 안 한 질문 커서 (답변한 questionId 순서) */
  answered: string[];
}

/** IO 인터페이스 — 터미널 렌더링/키 입력을 추상화 (엔진은 이것만 호출).
 *  테스트에서는 스크립트된 답을 돌려주는 mock 으로 대체한다. */
export interface WizardIO {
  print(text: string): void;
  ask(
    q: KickstartQuestion,
    ctx: { step: number; total: number },
  ): Promise<Answer>;
  /** 최종 요약 후 행동 선택. 반환: 0=확정,1=수정,2=처음부터,3=취소 */
  finalAction(summary: string): Promise<number>;
  /** 예/아니오 확인 (덮어쓰기 등). defaultYes=true 면 '예'가 기본 선택. */
  confirm(message: string, defaultYes?: boolean): Promise<boolean>;
}
