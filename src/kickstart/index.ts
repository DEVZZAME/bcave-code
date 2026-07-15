// /kickstart 오케스트레이션 — 정적(토큰 0) 요구사항 수집 마법사 + 하위명령.
// 터미널/파일 I/O 는 WizardIO / storage 로 주입. LLM·네트워크 호출 없음.

import type { KickstartQuestion, KickstartState, WizardIO } from "./types.js";
import { runQuestions, applyAnswer } from "./engine.js";
import {
  TOP_MENU,
  getSchema,
  flowQuestions,
  recommendType,
} from "./schemas.js";
import { buildSummary, questionsFor, answeredRows } from "./formatter.js";
import { generationPrompt } from "./build.js";
import * as store from "./storage.js";

export type Outcome = "confirmed" | "cancelled";

function nowIso(): string {
  return new Date().toISOString();
}

function newState(projectType: string): KickstartState {
  const t = nowIso();
  return {
    version: "1.0",
    createdAt: t,
    updatedAt: t,
    status: "draft",
    projectType,
    answers: {},
    unknownFields: [],
    answered: [],
  };
}

const NEXT_STEPS =
  "\n기획 정보가 저장되었습니다.\n\n다음 단계:\n" +
  "- /plan : 구현 계획 만들기\n" +
  "- /build : 프로젝트 생성 시작\n" +
  "- /kickstart edit : 기획 내용 수정\n" +
  "- /kickstart show : 저장된 기획 내용 확인\n" +
  "- /kickstart reset : 기획 내용 초기화";

/** 메인 마법사. */
export async function runKickstart(
  io: WizardIO,
  cwd: string,
  opts: { resume?: boolean } = {},
): Promise<Outcome> {
  let state: KickstartState | null = null;

  if (opts.resume) {
    state = store.loadDraft(cwd);
    if (!state) {
      io.print("이어서 진행할 저장된 진행 내용이 없습니다. /kickstart 로 새로 시작하세요.");
      return "cancelled";
    }
    io.print(`이전 진행을 이어갑니다 (${state.answered.length}개 답변 완료).`);
  }

  const persist = (s: KickstartState) => {
    try {
      store.saveDraft(cwd, s);
    } catch {
      /* 저장 실패는 진행을 막지 않는다 */
    }
  };

  // 처음부터 다시(restart) 를 위한 외부 루프
  restart: while (true) {
    if (!state) {
      const menuQ: KickstartQuestion = {
        id: "__type__",
        type: "single_select",
        message: "무엇을 만들고 싶으신가요?",
        options: TOP_MENU,
      };
      const ans = await io.ask(menuQ, { step: 1, total: 1 });
      if (ans.kind !== "value") {
        store.clearDraft(cwd);
        return "cancelled";
      }
      state = newState(String(ans.value));
    }

    const isDiscovery = state.projectType === "discovery";
    const schema = getSchema(state.projectType);
    if (!schema) {
      io.print("알 수 없는 유형입니다.");
      return "cancelled";
    }

    io.print(schema.intro);

    // 유형별 질문 + 공통 질문(중복 id 제외)을 하나의 흐름으로
    const questions: KickstartQuestion[] = flowQuestions(state.projectType);
    const r = await runQuestions(questions, io, state, persist);
    if (r === "cancel") {
      io.print("취소했습니다. (진행 내용은 /kickstart resume 으로 이어갈 수 있어요)");
      return "cancelled";
    }
    if (r === "back") {
      // 첫 질문에서 이전 → 유형 선택으로 되돌아감
      store.clearDraft(cwd);
      state = null;
      continue restart;
    }

    if (isDiscovery) {
      state.recommendedType = recommendType(state.answers);
      const recLabel = getSchema(state.recommendedType)?.label ?? state.recommendedType;
      io.print(`정리해보니 "${recLabel}" 유형이 가장 잘 맞아 보여요. 이 방향으로 저장할게요. (요약에서 확인하고 바꿀 수 있어요)`);
      persist(state);
    }

    // 요약 → 확정/수정/처음부터/취소
    while (true) {
      const action = await io.finalAction(buildSummary(state));
      if (action === 0) {
        // 확정 저장
        if (store.finalExists(cwd)) {
          const ok = await io.confirm("이미 저장된 기획이 있습니다. 덮어쓸까요?");
          if (!ok) continue;
        }
        state.status = "confirmed";
        state.updatedAt = nowIso();
        try {
          const paths = store.saveFinal(cwd, state);
          io.print(`저장 완료: ${paths.json}, ${paths.md}`);
          io.print(NEXT_STEPS);
        } catch (e) {
          io.print(`저장에 실패했습니다: ${(e as Error).message}`);
          return "cancelled";
        }
        return "confirmed";
      }
      if (action === 2) {
        // 처음부터 다시
        store.clearDraft(cwd);
        state = null;
        continue restart;
      }
      if (action === 3) {
        io.print("취소했습니다.");
        return "cancelled";
      }
      // action === 1: 특정 항목 수정
      await editOne(io, state);
      persist(state);
    }
  }
}

/** 요약에서 항목 하나를 골라 다시 질문. */
async function editOne(io: WizardIO, state: KickstartState): Promise<void> {
  const rows = answeredRows(state);
  if (rows.length === 0) return;
  const pickQ: KickstartQuestion = {
    id: "__edit__",
    type: "single_select",
    message: "어떤 항목을 수정할까요?",
    options: rows.map((r, i) => ({ label: r.message, value: String(i) })),
  };
  const pick = await io.ask(pickQ, { step: 1, total: 1 });
  if (pick.kind !== "value") return;
  const idx = Number(pick.value);
  const row = rows[idx];
  if (!row) return;
  const q = questionsFor(state.projectType).find((x) => x.id === row.id);
  if (!q) return;
  const ans = await io.ask(q, { step: 1, total: 1 });
  applyAnswer(state, q, ans);
}

/** /kickstart show — 저장된 기획 확인 */
export function showKickstart(io: WizardIO, cwd: string): void {
  const md = store.loadFinalMarkdown(cwd);
  if (!md) {
    io.print("저장된 기획이 없습니다. /kickstart 로 시작하세요.");
    return;
  }
  io.print(md);
}

/** /kickstart reset — 초기화 (확인 후) */
export async function resetKickstart(io: WizardIO, cwd: string): Promise<void> {
  if (!store.finalExists(cwd) && !store.loadDraft(cwd)) {
    io.print("초기화할 기획 내용이 없습니다.");
    return;
  }
  const ok = await io.confirm("저장된 기획 내용을 모두 삭제할까요?");
  if (!ok) {
    io.print("취소했습니다.");
    return;
  }
  store.resetAll(cwd);
  io.print("기획 내용을 초기화했습니다.");
}

/** /kickstart edit — 저장된 확정본을 불러와 항목 수정 후 재저장 */
export async function editKickstart(io: WizardIO, cwd: string): Promise<void> {
  const draft = store.loadDraft(cwd);
  const finalJson = store.loadFinal(cwd);
  if (!draft && !finalJson) {
    io.print("수정할 기획이 없습니다. /kickstart 로 시작하세요.");
    return;
  }
  // 확정본이 있으면 그 requirements 로 상태 복원
  let state: KickstartState;
  if (draft) {
    state = draft;
  } else {
    const f = finalJson as Record<string, unknown>;
    state = {
      version: "1.0",
      createdAt: String(f.createdAt ?? nowIso()),
      updatedAt: nowIso(),
      status: "draft",
      projectType: String(f.projectType ?? ""),
      answers: (f.requirements as Record<string, string | string[]>) ?? {},
      unknownFields: (f.unknownFields as string[]) ?? [],
      answered: Object.keys((f.requirements as Record<string, unknown>) ?? {}),
    };
  }

  while (true) {
    const action = await io.finalAction(buildSummary(state));
    if (action === 0) {
      state.status = "confirmed";
      state.updatedAt = nowIso();
      const paths = store.saveFinal(cwd, state);
      io.print(`저장 완료: ${paths.json}, ${paths.md}`);
      return;
    }
    if (action === 3 || action === 2) {
      io.print("수정을 취소했습니다.");
      return;
    }
    await editOne(io, state);
  }
}

export function hasDraft(cwd: string): boolean {
  return store.loadDraft(cwd) !== null;
}

/** 저장된 기획을 "실제 결과물 생성" 프롬프트로 변환 (LLM 에 넘길 문자열). 없으면 null. */
export function buildPromptFor(cwd: string): string | null {
  const rec = store.loadFinal(cwd);
  const brief = store.loadFinalMarkdown(cwd);
  if (!rec || !brief) return null;
  const req = (rec.requirements as Record<string, unknown>) ?? {};
  const ds = typeof req.designSystem === "string" ? req.designSystem : undefined;
  return generationPrompt(String(rec.projectType ?? "other"), brief, ds);
}
