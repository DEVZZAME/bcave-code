import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { AgentEvent } from "../agent/conversation.js";

export function resolveSessionAssetRoot(moduleUrl = import.meta.url): string {
  return path.resolve(path.dirname(fileURLToPath(moduleUrl)), "..", "..", "assets", "session-mode");
}

export interface SessionModeOptions {
  dashboardRoot?: string;
  dashboardUpdateRoot?: string;
  projectRoot?: string;
  delayMs?: number;
  random?: () => number;
}

const wait = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve) => {
  if (ms <= 0 || signal?.aborted) return resolve();
  const timer = setTimeout(done, ms);
  function done() {
    clearTimeout(timer);
    signal?.removeEventListener("abort", done);
    resolve();
  }
  signal?.addEventListener("abort", done, { once: true });
});

function isDashboardRequest(message: string): boolean {
  return /(?:대시보드|dashboard)/i.test(message) &&
    /(?:만들|생성|제작|구현|create|build|generate)/i.test(message);
}

function isFashionServiceRequest(message: string): boolean {
  const service = /(?:서비스|앱|애플리케이션|플랫폼|service|app|platform)/i.test(message);
  const build = /(?:개발|만들|생성|제작|구현|구축|develop|create|build|implement)/i.test(message);
  const fashion = /(?:패션|의류|브랜드|쇼핑|커머스|fashion|apparel|brand|commerce)/i.test(message);
  return service && build && fashion;
}

function referencedPath(message: string): string {
  return message.match(/(?:\/[^ \n\r\t"'`]+)+\.(?:xlsx|xls|xlsm|csv|tsv|ods|json)/i)?.[0] ?? "";
}

export class SessionModeRunner {
  private readonly dashboardRoot: string;
  private readonly dashboardUpdateRoot: string;
  private readonly projectRoot: string;
  private readonly delayMs: number;
  private readonly random: () => number;
  private pendingDashboard = false;
  private dashboardInput = "";
  private lastDashboardSystem: "bcave" | "axis" | null = null;
  private lastDashboardOutput = "";

  constructor(private readonly cwd: string, options: SessionModeOptions = {}) {
    const assetRoot = resolveSessionAssetRoot();
    this.dashboardRoot = options.dashboardRoot ?? path.join(assetRoot, "dashboards");
    this.dashboardUpdateRoot = options.dashboardUpdateRoot ?? path.join(assetRoot, "dashboard-updates");
    this.projectRoot = options.projectRoot ?? path.join(assetRoot, "projects");
    this.delayMs = Math.max(0, options.delayMs ?? 30_000);
    this.random = options.random ?? Math.random;
  }

  getHistory(): ChatCompletionMessageParam[] { return []; }
  loadHistory(_history: ChatCompletionMessageParam[]): void {}
  setDeployTarget(_target: string): void {}
  approveToolCall(_id: string): void {}
  rejectToolCall(_id: string): void {}

  private async *copyDashboard(system: "bcave" | "axis", signal?: AbortSignal): AsyncGenerator<AgentEvent> {
    const source = path.join(this.dashboardRoot, `${system}-dashboard.html`);
    const output = path.join(this.cwd, path.basename(source));
    if (!fs.existsSync(source)) {
      yield { type: "error", message: `Session mode 준비 파일을 찾을 수 없습니다: ${source}` };
      yield { type: "done" };
      return;
    }

    const first = Math.round(this.delayMs * 0.2);
    const second = Math.round(this.delayMs * 0.25);
    const third = Math.max(0, this.delayMs - first - second);
    yield { type: "tool_start", name: "list_files", args: { path: "." } };
    await wait(first, signal);
    if (signal?.aborted) return;
    yield { type: "tool_result", name: "list_files", result: "Prepared dashboard workspace." };

    yield { type: "tool_start", name: "read_file", args: { path: this.dashboardInput || "dashboard data" } };
    await wait(second, signal);
    if (signal?.aborted) return;
    yield { type: "tool_result", name: "read_file", result: "Dashboard data inspected." };

    yield { type: "tool_start", name: "write_file", args: { path: output } };
    await wait(third, signal);
    if (signal?.aborted) return;
    fs.copyFileSync(source, output);
    this.lastDashboardSystem = system;
    this.lastDashboardOutput = output;
    yield { type: "tool_result", name: "write_file", result: `File written: ${output} (검토 통과)` };
    yield { type: "text", content: `저장됨: ${output}` };
    yield { type: "done" };
  }

  private async *replaceDashboard(
    system: "bcave" | "axis",
    preparedName: string,
    signal?: AbortSignal,
  ): AsyncGenerator<AgentEvent> {
    const source = path.join(this.dashboardUpdateRoot, preparedName);
    const fallbackName = system === "bcave" ? "bcave-dashboard.html" : "axis-dashboard.html";
    const output = this.lastDashboardOutput || path.join(this.cwd, fallbackName);
    if (!fs.existsSync(source)) {
      yield { type: "error", message: `Session mode 수정 파일을 찾을 수 없습니다: ${source}` };
      yield { type: "done" };
      return;
    }
    if (!fs.existsSync(output)) {
      yield { type: "error", message: `수정할 기존 대시보드를 찾을 수 없습니다: ${output}` };
      yield { type: "done" };
      return;
    }

    const first = Math.round(this.delayMs * 0.4);
    const second = Math.max(0, this.delayMs - first);
    yield { type: "tool_start", name: "read_file", args: { path: output } };
    await wait(first, signal);
    if (signal?.aborted) return;
    yield { type: "tool_result", name: "read_file", result: "Existing dashboard inspected." };

    yield { type: "tool_start", name: "write_file", args: { path: output } };
    await wait(second, signal);
    if (signal?.aborted) return;
    fs.copyFileSync(source, output);
    this.lastDashboardSystem = system;
    this.lastDashboardOutput = output;
    yield { type: "tool_result", name: "write_file", result: `File written: ${output} (검토 통과)` };
    yield { type: "text", content: `수정됨: ${output}` };
    yield { type: "done" };
  }

  private projectDirectories(): string[] {
    if (!fs.existsSync(this.projectRoot)) return [];
    return fs.readdirSync(this.projectRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(this.projectRoot, entry.name))
      .sort();
  }

  private async *copyFashionProject(signal?: AbortSignal): AsyncGenerator<AgentEvent> {
    const projects = this.projectDirectories();
    if (!projects.length) {
      yield { type: "error", message: `Session mode 준비 프로젝트를 찾을 수 없습니다: ${this.projectRoot}` };
      yield { type: "done" };
      return;
    }
    const index = Math.min(projects.length - 1, Math.floor(Math.max(0, this.random()) * projects.length));
    const source = projects[index];
    const output = path.join(this.cwd, path.basename(source));
    const first = Math.round(this.delayMs * 0.25);
    const second = Math.round(this.delayMs * 0.25);
    const third = Math.max(0, this.delayMs - first - second);

    yield { type: "tool_start", name: "list_files", args: { path: "." } };
    await wait(first, signal);
    if (signal?.aborted) return;
    yield { type: "tool_result", name: "list_files", result: "Service requirements analyzed." };

    yield { type: "tool_start", name: "read_file", args: { path: "package.json" } };
    await wait(second, signal);
    if (signal?.aborted) return;
    yield { type: "tool_result", name: "read_file", result: "Application structure planned." };

    yield { type: "tool_start", name: "write_file", args: { path: output } };
    await wait(third, signal);
    if (signal?.aborted) return;
    fs.cpSync(source, output, { recursive: true, force: true });
    yield { type: "tool_result", name: "write_file", result: `File written: ${output}` };
    yield { type: "text", content: `서비스 생성 완료: ${output}` };
    yield { type: "done" };
  }

  async *run(message: string, signal?: AbortSignal): AsyncGenerator<AgentEvent> {
    const normalized = message.trim();
    if (this.pendingDashboard && /^[12](?:번)?$/.test(normalized)) {
      this.pendingDashboard = false;
      yield* this.copyDashboard(normalized.startsWith("1") ? "bcave" : "axis", signal);
      return;
    }
    const editIntent = /(?:수정|변경|고쳐|바꿔|업데이트|update|edit|modify)/i.test(normalized);
    const darkModeIntent = /(?:다크\s*모드|dark\s*mode)/i.test(normalized);
    const explicitBcave = /(?:1번|BCAVE|비케이브)/i.test(normalized);
    const explicitAxis = /(?:2번|AXIS|액시스)/i.test(normalized);
    const currentSystem = explicitBcave ? "bcave" : explicitAxis ? "axis" : this.lastDashboardSystem;
    if (editIntent && currentSystem === "bcave") {
      if (!this.lastDashboardOutput) this.lastDashboardOutput = path.join(this.cwd, "bcave-dashboard.html");
      yield* this.replaceDashboard("bcave", "bcave-dashboard.html", signal);
      return;
    }
    if (darkModeIntent && currentSystem === "axis") {
      if (!this.lastDashboardOutput) this.lastDashboardOutput = path.join(this.cwd, "axis-dashboard.html");
      yield* this.replaceDashboard("axis", "axis-dashboard1.html", signal);
      return;
    }
    if (isDashboardRequest(normalized)) {
      this.pendingDashboard = true;
      this.dashboardInput = referencedPath(normalized);
      yield {
        type: "text",
        content: "이 대시보드/리포트에 사용할 디자인 시스템을 선택해 주세요:\n\n  1. **BCAVE** ✦ 자사 브랜드 · 모노톤 슬레이트 (기본/공식)\n  2. **AXIS** — 밝은 코발트 · 모던 프로페셔널\n\n번호로 답해 주세요.",
      };
      yield { type: "done" };
      return;
    }
    if (isFashionServiceRequest(normalized)) {
      yield* this.copyFashionProject(signal);
      return;
    }
    yield {
      type: "text",
      content: "Session mode에서는 준비된 대시보드 생성과 패션 회사용 서비스 개발 시연만 실행할 수 있습니다.",
    };
    yield { type: "done" };
  }
}
