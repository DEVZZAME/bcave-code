import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { createOpenAIClient, chat } from "../openai/client.js";
import { executeTool, getToolCategory } from "./tools.js";
import { PermissionManager, type PermissionCategory } from "./permissions.js";
import { saveConfig, type BcaveConfig } from "../config/config.js";
import { pickModel } from "./router.js";
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

  constructor(config: BcaveConfig, permissions: PermissionManager, cwd: string) {
    this.config = config;
    this.permissions = permissions;
    this.cwd = cwd;
    this.client = createOpenAIClient(config);
    this.messages.push({
      role: "system",
      content: `You are BCave, a CLI coding agent. You help users by reading/writing files and executing shell commands on their local machine. Working directory: ${cwd}. Always use the provided tools to interact with the filesystem and shell. Respond in the same language the user uses.

UI / SCREENS (service & app development): When building product UI — screens, pages, components, forms, flows, features — build real, modern, production-quality web UI exactly like a general coding agent (Claude Code / Codex) would.
ART DIRECTION (avoid same-looking output): BEFORE writing any UI, call frontend_design to get a concrete art direction (fonts/palette/shape/motion/signature) and COMMIT fully to it — never fall back to the generic AI default (centered card + indigo gradient + Inter + rounded-2xl + soft shadow). Pass a style arg if the user named one; otherwise use the assigned one and vary it across different screens. "다르게/새롭게 해줘" ⇒ call frontend_design again for a new direction.
Then inspect the repo and FOLLOW its existing stack and conventions: framework (React / Vue / Next / Svelte / plain HTML), styling (Tailwind / CSS Modules / styled-components / plain CSS), component library, routing, and file layout. Wire it into the codebase. Do NOT apply the company dashboard design system, its tokens, or the dashboard_design_system/create_dashboard tools to general UI — those are for data dashboards ONLY. If no stack exists yet, pick sensible modern defaults and say so.
RESPONSIVE & LAYOUT (mandatory, mobile-first): always add <meta name="viewport" content="width=device-width,initial-scale=1"> and \`*{box-sizing:border-box}\`. Use fluid layouts (flex/grid with min-width:0 on children, grid tracks as minmax(0,1fr), %/rem/clamp() sizing) — never fixed px widths on containers (use max-width + width:100%). Add @media breakpoints (e.g. 640/768/1024px) so nothing overflows or breaks on mobile; media/img get max-width:100%. Long text wraps; avoid horizontal scroll. Cover UI states: hover/focus/active/disabled + loading/empty/error. After writing an HTML page, honor the export review — fix any 반응형/레이아웃 warnings before claiming done.

DATA DASHBOARDS ONLY (a KPI / chart / report view built from a data file) use the company design system — never for the general UI above:
0. Two designs: (1) 모던 — Toss-style, light, rounded cards; (2) 클래식 — document/report, paper, ruled lines. If unspecified, ASK "1번 모던 / 2번 클래식" first. (When editing an existing dashboard, keep its template.)
1. Call dashboard_design_system with the chosen template ('template1'/'template2') AND the data file path — you get that template's component catalog + the data's columns/types.
2. Write the dashboard HTML yourself using ONLY those components, including ONLY the sections asked for (e.g. "charts only"). No empty cards/regions. Vary the layout between requests.
3. Placeholders: <style>{{BCAVE_DS}}</style> (or {{BCAVE_DS2}}) for CSS, {{BCAVE_DATA:/abs/path#sheet}} for data, {{BCAVE_CHARTJS}} for Chart.js. No arbitrary CSS, no emojis.
4. Editing a dashboard: remove/add the WHOLE container (card/section) — never leave an empty box.
5. Non-tabular sources (PDF etc.): read_file → extract to .csv → compose from that .csv.
Exception: for a quick standard full dashboard, use create_dashboard.`,
    });
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
        const response = await chat(this.client, this.messages, routed.model, {
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
