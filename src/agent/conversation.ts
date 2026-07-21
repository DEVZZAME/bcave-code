import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { createOpenAIClient, chat } from "../openai/client.js";
import { executeTool, getToolCategory } from "./tools.js";
import { PermissionManager, type PermissionCategory } from "./permissions.js";
import { saveConfig, type BcaveConfig } from "../config/config.js";
import { pickModel } from "./router.js";
import { designChoiceForRequest, systemsMenu } from "../design/systems.js";
import { hubRefresh } from "../auth/hub.js";

export interface ToolCallRequest {
  id: string;
  name: string;
  args: Record<string, unknown>;
  category: PermissionCategory;
}

export type AgentEvent =
  | { type: "text"; content: string }
  | { type: "tool_start"; name: string; args: Record<string, unknown> }
  | { type: "tool_call"; request: ToolCallRequest }
  | { type: "tool_result"; name: string; result: string }
  | { type: "model"; model: string; tier: "heavy" | "light" | "manual" }
  | { type: "done" }
  | { type: "error"; message: string };

export class ConversationManager {
  private client: OpenAI;
  private config: BcaveConfig;
  private permissions: PermissionManager;
  private cwd: string;
  private messages: ChatCompletionMessageParam[] = [];
  private pendingApprovals: Map<string, { resolve: (approved: boolean) => void }> = new Map();
  private lastWasUi = false; // 직전 턴이 UI/대시보드 제작이었는지 (짧은 후속 수정 인식용)
  private lastSystemId = ""; // 직전에 선택된 디자인 시스템 (후속 수정 시 유지)

  constructor(config: BcaveConfig, permissions: PermissionManager, cwd: string) {
    this.config = config;
    this.permissions = permissions;
    this.cwd = cwd;
    this.client = createOpenAIClient(config);
    this.messages.push({
      role: "system",
      content: `You are BCave, a CLI coding agent. You help users by reading/writing files and executing shell commands on their local machine. Working directory: ${cwd}. Always use the provided tools to interact with the filesystem and shell. Respond in the same language the user uses.

UI / SCREENS (service & app development): When building product UI — screens, pages, components, forms, flows, features — build real, modern, production-quality web UI exactly like a general coding agent (Claude Code / Codex) would.
DESIGN SYSTEM CHOICE (mandatory): the company has 4 design systems (1 AXIS, 2 TOSS, 3 CLASSIC, 4 ATELIER). Whenever the user asks to build a screen / dashboard / any HTML page and has NOT picked one, do NOT build yet — ASK which of the 4 to use (they answer by number or name). A system note lists them. Once chosen (or if the user names it, or says "알아서" → you pick), you get a system note "[이번 화면/대시보드/HTML 은 "…" 디자인 시스템으로 …]" with that system's rules/tokens/components — build with ONLY those (no arbitrary colors/fonts/values). Inline its CSS via <style>{{BCAVE_DS:<id>}}</style> (token-free). Keep the chosen system across follow-up edits; only re-ask for a brand-new page.
VARY THE LAYOUT: never emit the same fixed template every time. Following the system's rules (spacing/typography/color/components), arrange each build DIFFERENTLY — different grid, order, emphasis, section composition to fit the request and data. Rules are fixed; layout is fresh each time.
Then inspect the repo and FOLLOW its existing stack and conventions: framework (React / Vue / Next / Svelte / plain HTML), styling (Tailwind / CSS Modules / styled-components / plain CSS), component library, routing, and file layout. Wire it into the codebase. If no stack exists yet, pick sensible modern defaults and say so.
FILE RULES (mandatory): (1) SINGLE self-contained .html file — ALL CSS inside inline <style> (via {{BCAVE_DS}} + your layout styles), JS inline too; no separate .css/.js files, no external stylesheet links (a web-font <link> and an inlined chart lib are the only allowed externals). (2) ALWAYS write to a NEW file that does not already exist (e.g. <name>.html → <name>-2.html …); NEVER overwrite a previous page/dashboard, even for a "다르게/더 심플하게" iteration — so the user can keep and compare versions.
DELIVERABLE CONTENT: the file contains ONLY the real product content — title, data, KPIs, charts, insights. NEVER embed meta/process narration: no "…를 바탕으로 다시 구성했습니다", no design-system/mood description, no data-source file path, no "단일 HTML 파일…" notes, no "원하시면 다음 단계로 …". Put ALL of that in your CHAT reply only.
TITLE & HEADER: h1 is a concise, factual report title — a short noun phrase (e.g. "브랜드 매출·고객 성과 리포트"), NO trailing sentence/period, NO marketing phrasing. Keep the header compact (optional short eyebrow + short h1 + at most one brief subtitle). Follow the chosen system's heading typography tokens; do not blanket-bold every heading.
RESPONSIVE & LAYOUT (mandatory, mobile-first): always add <meta name="viewport" content="width=device-width,initial-scale=1"> and \`*{box-sizing:border-box}\`. Use fluid layouts (flex/grid with min-width:0 on children, grid tracks as minmax(0,1fr), %/rem/clamp() sizing) — never fixed px widths on containers (use max-width + width:100%). Add @media breakpoints (e.g. 640/768/1024px) so nothing overflows or breaks on mobile; media/img get max-width:100%. Long text wraps; avoid horizontal scroll. Cover UI states: hover/focus/active/disabled + loading/empty/error. After writing an HTML page, honor the export review — fix any 반응형/레이아웃 warnings before claiming done.
For embedding spreadsheet data token-free you may still use the {{BCAVE_DATA:/abs/path#sheet}} placeholder and {{BCAVE_CHARTJS}} for inlined Chart.js — these are generic utilities, not the design system.`,
    });
  }

  /** 저장용 대화 히스토리(시스템 프롬프트 제외 — 복원 시 현재 시스템 프롬프트를 새로 씌운다). */
  getHistory(): ChatCompletionMessageParam[] {
    return this.messages.slice(1);
  }

  /** 저장된 히스토리로 대화를 복원. 현재(최신) 시스템 프롬프트는 유지한다. */
  loadHistory(history: ChatCompletionMessageParam[]): void {
    this.messages = [this.messages[0], ...history];
  }

  approveToolCall(id: string): void {
    const pending = this.pendingApprovals.get(id);
    if (pending) {
      pending.resolve(true);
      this.pendingApprovals.delete(id);
    }
  }

  rejectToolCall(id: string): void {
    const pending = this.pendingApprovals.get(id);
    if (pending) {
      pending.resolve(false);
      this.pendingApprovals.delete(id);
    }
  }

  /**
   * 게이트웨이 401(세션 만료) 시 Refresh Token 으로 갱신하고 새 client 반환.
   * 갱신 실패(만료/폐기) 시 null → 재로그인 필요.
   */
  private async refreshSession(): Promise<OpenAI | null> {
    if (!this.config.accessToken || !this.config.refreshToken) return null;
    try {
      const r = await hubRefresh(this.config.hubUrl, this.config.refreshToken);
      this.config.accessToken = r.accessToken;
      this.config.refreshToken = r.refreshToken;
      saveConfig({ accessToken: r.accessToken, refreshToken: r.refreshToken });
      this.client = createOpenAIClient(this.config);
      return this.client;
    } catch {
      return null;
    }
  }

  /**
   * 대화 히스토리가 커지면 오래된 턴을 버려 모델 컨텍스트 한도 초과를 막는다.
   * tool_call/tool_result 쌍이 깨지지 않도록 반드시 user 메시지 경계에서 자른다.
   */
  private trimHistory(): void {
    const BUDGET = 250_000; // 문자 수 (~6만 토큰) — 모델 한도보다 훨씬 아래로 유지
    const msgs = this.messages;
    if (msgs.length <= 2) return;
    const size = (m: ChatCompletionMessageParam): number => JSON.stringify(m).length;
    const total = msgs.reduce((s, m) => s + size(m), 0);
    if (total <= BUDGET) return;

    const system = msgs[0];
    const sysSize = size(system);
    const userIdxs: number[] = [];
    for (let i = 1; i < msgs.length; i++) {
      if ((msgs[i] as { role: string }).role === "user") userIdxs.push(i);
    }
    if (userIdxs.length === 0) return; // 안전하게 자를 경계가 없으면 그대로 둔다

    let chosen = userIdxs[userIdxs.length - 1]; // 최소한 마지막 턴은 유지
    for (const idx of userIdxs) {
      let s = sysSize;
      for (let j = idx; j < msgs.length; j++) s += size(msgs[j]);
      if (s <= BUDGET) { chosen = idx; break; }
    }
    this.messages = [system, ...msgs.slice(chosen)];
  }

  /**
   * LLM 호출 없이 대화에 한 턴(지시문 + 하드코딩된 어시스턴트 인사)을 심는다.
   * 첫 인사가 고정적인 커맨드에서 첫 LLM 호출을 아끼기 위함. 이후 사용자가
   * 답하면 run() 이 이 맥락을 이어받는다.
   */
  seedTurn(instructions: string, assistantIntro: string): void {
    this.messages.push({ role: "user", content: instructions });
    this.messages.push({ role: "assistant", content: assistantIntro });
  }

  async *run(userMessage: string, signal?: AbortSignal): AsyncGenerator<AgentEvent> {
    // 화면/대시보드/HTML 제작 요청 처리 — 4개 디자인 시스템 중 선택:
    //  - 시스템이 안 정해졌으면 만들지 말고 먼저 "1~4 중 무엇으로?" 되묻는다.
    //  - 정해졌으면 그 시스템의 규칙/컴포넌트로 조립하되, 배치는 매번 다르게(고정 틀 금지).
    const choice = designChoiceForRequest(userMessage, this.lastSystemId, this.lastWasUi);
    this.lastWasUi = choice.isUi;
    if (choice.system) this.lastSystemId = choice.system.id;
    if (choice.isUi && choice.needsChoice) {
      this.messages.push({
        role: "system",
        content:
          "[사용자가 화면/대시보드/HTML 을 요청했지만 어떤 디자인 시스템으로 만들지 정하지 않았다. 지금 만들지 말고, 아래 4개 중 무엇으로 만들지 먼저 물어봐라(번호나 이름으로 답하게). '알아서'라고 하면 네가 하나 골라 진행.\n" +
          systemsMenu() +
          "]",
      });
    } else if (choice.system) {
      const s = choice.system;
      this.messages.push({
        role: "system",
        content:
          `[이번 화면/대시보드/HTML 은 "${s.label}" 디자인 시스템으로 만들 것.\n` +
          `- CSS 는 <style>{{BCAVE_DS:${s.id}}}</style> 로 인라인(토큰 0). 이 시스템의 토큰/컴포넌트 규칙만 사용(임의 색·폰트·값 금지).\n` +
          `- 단일 HTML 파일(모든 CSS 인라인), 항상 새 파일명으로 저장.\n` +
          `- 배치는 매번 다르게: 고정된 틀을 반복하지 말고 그리드·순서·강조·섹션 구성을 요청/데이터에 맞게 새로 짜라. 단 시스템 규칙(간격·타이포·색·컴포넌트)은 지킬 것.\n` +
          s.guide +
          `]`,
      });
    }
    this.messages.push({ role: "user", content: userMessage });

    // 용도별 모델 라우팅: 이 턴 전체에 사용할 모델을 메시지 성격으로 결정
    const routed = pickModel(this.config, userMessage);
    yield { type: "model", model: routed.model, tier: routed.tier };

    // 같은 텍스트가 연속으로 출력되는 중복 방지 (모델이 도구 호출 전후로
    // 동일 인사/질문을 반복하는 경우 화면에 두 번 찍히던 문제).
    let lastText = "";

    try {
      while (true) {
        this.trimHistory();
        if (signal?.aborted) return;
        const response = await chat(this.client, this.messages, routed.wire, {
          onAuthError: () => this.refreshSession(),
          signal,
        });
        const choice = response.choices[0];
        if (!choice) {
          yield { type: "error", message: "No response from API" };
          return;
        }

        const { message } = choice;

        const text = message.content?.trim() ?? "";
        if (text && text !== lastText) {
          lastText = text;
          yield { type: "text", content: message.content as string };
        }

        if (!message.tool_calls || message.tool_calls.length === 0) {
          this.messages.push({ role: "assistant", content: message.content ?? "" });
          yield { type: "done" };
          return;
        }

        this.messages.push({
          role: "assistant",
          content: message.content ?? null,
          tool_calls: message.tool_calls,
        });

        for (const toolCall of message.tool_calls) {
          if (!("function" in toolCall)) continue;
          const name = toolCall.function.name;
          const args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
          const category = getToolCategory(name);

          // 승인 여부와 무관하게 "무엇을 하는 중"을 먼저 알린다(yolo 모드에서도 진행 표시).
          yield { type: "tool_start", name, args };

          if (this.permissions.needsApproval(category)) {
            const request: ToolCallRequest = { id: toolCall.id, name, args, category };

            // Register pending approval BEFORE yielding, so approveToolCall/rejectToolCall
            // can resolve it even if called before we await
            const approvalPromise = new Promise<boolean>((resolve) => {
              this.pendingApprovals.set(toolCall.id, { resolve });
            });

            yield { type: "tool_call", request };

            const approved = await approvalPromise;

            if (!approved) {
              this.messages.push({
                role: "tool",
                tool_call_id: toolCall.id,
                content: "Permission denied by user.",
              });
              yield { type: "tool_result", name, result: "Permission denied by user." };
              continue;
            }

            this.permissions.approve(category);
          }

          const result = await executeTool(name, args, this.cwd);
          this.messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: result,
          });
          yield { type: "tool_result", name, result };
        }
      }
    } catch (err) {
      // ESC 중단은 오류가 아니라 조용히 종료
      if (signal?.aborted || (err as Error)?.name === "AbortError") return;
      yield { type: "error", message: (err as Error).message };
    }
  }
}
