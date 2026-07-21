import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { createOpenAIClient, chat } from "../openai/client.js";
import { executeTool, getToolCategory } from "./tools.js";
import { PermissionManager, type PermissionCategory } from "./permissions.js";
import { saveConfig, type BcaveConfig } from "../config/config.js";
import { pickModel } from "./router.js";
import { directionForRequest, renderDirection } from "../design/directions.js";
import { hubRefresh } from "../auth/hub.js";

export interface ToolCallRequest {
  id: string;
  name: string;
  args: Record<string, unknown>;
  category: PermissionCategory;
}

export type AgentEvent =
  | { type: "text"; content: string }
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

  constructor(config: BcaveConfig, permissions: PermissionManager, cwd: string) {
    this.config = config;
    this.permissions = permissions;
    this.cwd = cwd;
    this.client = createOpenAIClient(config);
    this.messages.push({
      role: "system",
      content: `You are BCave, a CLI coding agent. You help users by reading/writing files and executing shell commands on their local machine. Working directory: ${cwd}. Always use the provided tools to interact with the filesystem and shell. Respond in the same language the user uses.

UI / SCREENS (service & app development): When building product UI — screens, pages, components, forms, flows, features — build real, modern, production-quality web UI exactly like a general coding agent (Claude Code / Codex) would.
ART DIRECTION (avoid same-looking output): for every UI/dashboard request you are given a specific art direction as a system note "[이번 UI/대시보드는 아래 아트 디렉션으로 …]". COMMIT fully to that direction's fonts/palette/shape/motion — never fall back to the generic AI default (centered card + gradient + glass/pastel + Inter + rounded-2xl + soft shadow). Each request gets a different direction, so do not reuse the previous look; when the user names a feel (더 심플하게/부드럽게/다크하게 등) the note reflects it — follow it.
Then inspect the repo and FOLLOW its existing stack and conventions: framework (React / Vue / Next / Svelte / plain HTML), styling (Tailwind / CSS Modules / styled-components / plain CSS), component library, routing, and file layout. Wire it into the codebase. If no stack exists yet, pick sensible modern defaults and say so.
This applies to DASHBOARDS TOO: when the user asks in chat (natural language) to build a dashboard or any data view, build it as real, custom web UI in the chosen art direction (charts via a library like Chart.js if useful, tables, cards you design). Do NOT use the company built-in design system (template1/template2) for natural-language requests. The built-in design system is available ONLY through the /dashboard slash command (a separate deterministic generator the user runs explicitly) — you have no tool for it, so never claim to apply it in chat.
DELIVERABLE CONTENT (what goes INSIDE the file): the file must contain ONLY the real product content — title, data, KPIs, charts, insights. NEVER embed meta/process narration in the deliverable: no "…를 바탕으로 다시 구성했습니다", no description of the art direction / mood ("따뜻하고 친근하게" 등), no data-source file path, no "단일 HTML 파일…" notes, no "원하시면 다음 단계로 …" suggestions. Put ALL of that in your CHAT reply only. The art direction changes the VISUAL style (fonts/colors/shape/motion) — it must NOT leak into the copy/wording of titles or text.
TITLE & HEADER: h1 is a concise, factual report title — a short noun phrase like a real business report heading (e.g. "브랜드 매출·고객 성과 리포트"), with NO trailing sentence/period and NO aesthetic or marketing phrasing. Keep the header compact: optional short eyebrow + short h1 + at most ONE brief subtitle line (period/scope, e.g. "2024-07 ~ 2025-06 · 고객·주문·RFM"). Do not cram sentences or a paragraph into the header. It is a report for the user to present — write it like one.
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
    // UI/대시보드 제작 요청이면 아트 디렉션을 자동 주입 → 매번 같은 디자인(모델 기본 룩)으로
    // 회귀하는 것을 방지. 사용자가 느낌/스타일을 말하면 그 방향, 아니면 회전(매번 다르게).
    const dir = directionForRequest(userMessage, this.lastWasUi);
    this.lastWasUi = dir.isUi;
    if (dir.direction) {
      this.messages.push({
        role: "system",
        content:
          `[이번 UI/대시보드는 아래 아트 디렉션으로 만들 것. 이미 정해진 방향이니 임의로 다른 스타일로 바꾸지 말고, 시각(폰트·색·모양·모션)에만 적용하고 제목·문구 카피에는 넣지 말 것. 모델 기본 룩(가운데 카드+그라디언트+글래스/파스텔)으로 회귀 금지.]\n` +
          renderDirection(dir.direction),
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
