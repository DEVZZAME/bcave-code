import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import type { AgentEvent } from "../agent/conversation.js";
import { executeTool } from "../agent/tools.js";

export function resolveSessionAssetRoot(moduleUrl = import.meta.url): string {
  return path.resolve(path.dirname(fileURLToPath(moduleUrl)), "..", "..", "assets", "session-mode");
}

export interface SessionModeOptions {
  dashboardRoot?: string;
  dashboardUpdateRoot?: string;
  projectRoot?: string;
  delayMs?: number;
  random?: () => number;
  startService?: (projectPath: string) => Promise<string>;
  installDeps?: (projectPath: string) => Promise<string>;
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
  const service = /(?:서비스|앱|애플리케이션|플랫폼|웹사이트|사이트|site|service|app|platform|website)/i.test(message);
  const build = /(?:개발|만들|생성|제작|구현|구축|develop|create|build|implement)/i.test(message);
  const fashion = /(?:패션|의류|브랜드|쇼핑|커머스|fashion|apparel|brand|commerce)/i.test(message);
  return service && build && fashion;
}

/** roundfit_만들기_프롬프트.txt 를 붙여넣는 등, RoundFit(매장 라운딩 점검) 전용 요청을 식별한다. */
function isRoundfitRequest(message: string): boolean {
  if (/\broundfit\b|ro-?undfit|라운드\s*핏/i.test(message)) return true;
  // 이름 없이 스펙만 붙여넣는 경우 대비: "라운딩" + 매장 점검 맥락
  return /라운딩/.test(message) && /(?:점검표|점검\s*내용|매장[^]*점검|점검[^]*매장)/.test(message);
}

function referencedPath(message: string): string {
  return message.match(/(?:\/[^ \n\r\t"'`]+)+\.(?:xlsx|xls|xlsm|csv|tsv|ods|json)/i)?.[0] ?? "";
}

/** OS가 비어 있는 TCP 포트를 하나 골라 준다. 준비된 서비스가 기본 포트(3000/4000)에서 충돌하는 것을 피한다. */
function findFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

/** 서버 실행 요청에 명시된 프로젝트 디렉터리 경로(절대/홈/상대)를 뽑아낸다. 데이터·산출 파일 경로는 제외. */
function referencedDirectory(message: string): string {
  const match = message.match(/(?:~|\.{1,2})?(?:\/[^\s"'`]+)+/);
  if (!match) return "";
  const raw = match[0];
  if (/\.(?:xlsx|xls|xlsm|csv|tsv|ods|json|html?|txt|md)$/i.test(raw)) return "";
  return raw.startsWith("~") ? path.join(os.homedir(), raw.slice(1)) : raw;
}

export class SessionModeRunner {
  private readonly dashboardRoot: string;
  private readonly dashboardUpdateRoot: string;
  private readonly projectRoot: string;
  private readonly delayMs: number;
  private readonly random: () => number;
  private readonly startService: (projectPath: string) => Promise<string>;
  private readonly installDeps: (projectPath: string) => Promise<string>;
  private pendingDashboard = false;
  private dashboardInput = "";
  private lastDashboardSystem: "bcave" | "axis" | null = null;
  private lastDashboardOutput = "";
  private lastProjectOutput = "";
  private lastServiceUrl = "";
  private readonly startedUrls = new Map<string, string>();

  constructor(private readonly cwd: string, options: SessionModeOptions = {}) {
    const assetRoot = resolveSessionAssetRoot();
    this.dashboardRoot = options.dashboardRoot ?? path.join(assetRoot, "dashboards");
    this.dashboardUpdateRoot = options.dashboardUpdateRoot ?? path.join(assetRoot, "dashboard-updates");
    this.projectRoot = options.projectRoot ?? path.join(assetRoot, "projects");
    this.delayMs = Math.max(0, options.delayMs ?? 30_000);
    this.random = options.random ?? Math.random;
    this.startService = options.startService ?? (async (projectPath) => {
      // 준비된 서비스들은 3000/4000 기본 포트를 쓰므로, 재실행·중복 실행 시 EADDRINUSE로 죽는다.
      // 매번 비어 있는 포트를 잡아 주입해 충돌 없이 뜨게 한다.
      const port = await findFreePort();
      return executeTool("shell_exec", { command: "npm start", env: { PORT: String(port) } }, projectPath);
    });
    this.installDeps = options.installDeps ?? ((projectPath) =>
      executeTool("shell_exec", { command: "npm install --no-audit --no-fund --loglevel=error" }, projectPath));
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

  private preparedProjects(): { name: string; path: string }[] {
    if (!fs.existsSync(this.projectRoot)) return [];
    return fs.readdirSync(this.projectRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({ name: entry.name, path: path.join(this.projectRoot, entry.name) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** 준비된 프로젝트가 이미 현재 폴더에 생성돼 있으면 true (중복 생성 방지 기준). */
  private isAlreadyCreated(name: string): boolean {
    return fs.existsSync(path.join(this.cwd, name, "package.json"));
  }

  /**
   * preferred 가 지정되면 그 프로젝트를(예: roundfit), 아니면 roundfit 을 제외한 나머지 중
   * 아직 만들어지지 않은 것을 무작위로 골라 개발하는 척 복사한다. 이미 만든 건 다시 만들지 않는다.
   */
  private async *createService(preferred: string | null, signal?: AbortSignal): AsyncGenerator<AgentEvent> {
    const projects = this.preparedProjects();
    if (!projects.length) {
      yield { type: "error", message: `Session mode 준비 프로젝트를 찾을 수 없습니다: ${this.projectRoot}` };
      yield { type: "done" };
      return;
    }

    let target: { name: string; path: string };
    if (preferred) {
      const found = projects.find((project) => project.name === preferred);
      if (!found) {
        yield { type: "error", message: `Session mode 준비 프로젝트를 찾을 수 없습니다: ${preferred}` };
        yield { type: "done" };
        return;
      }
      if (this.isAlreadyCreated(found.name)) {
        this.lastProjectOutput = path.join(this.cwd, found.name);
        yield { type: "text", content: `이미 생성된 서비스입니다: ${this.lastProjectOutput} (중복 생성하지 않습니다)` };
        yield { type: "done" };
        return;
      }
      target = found;
    } else {
      const pool = projects.filter((project) => project.name !== "roundfit" && !this.isAlreadyCreated(project.name));
      if (!pool.length) {
        yield { type: "text", content: "요청하신 유형의 준비된 서비스는 이미 모두 생성되어 있습니다. 중복 생성하지 않습니다." };
        yield { type: "done" };
        return;
      }
      const index = Math.min(pool.length - 1, Math.floor(Math.max(0, this.random()) * pool.length));
      target = pool[index];
    }

    const source = target.path;
    const output = path.join(this.cwd, target.name);
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
    this.lastProjectOutput = output;
    this.lastServiceUrl = "";
    yield { type: "tool_result", name: "write_file", result: `File written: ${output}` };
    yield { type: "text", content: `서비스 생성 완료: ${output}` };
    yield { type: "done" };
  }

  private resolveProjectPath(target: string): string {
    return path.isAbsolute(target) ? target : path.resolve(this.cwd, target);
  }

  private async *startPreparedService(target = ""): AsyncGenerator<AgentEvent> {
    const project = target ? this.resolveProjectPath(target) : this.lastProjectOutput;
    if (!project || !fs.existsSync(path.join(project, "package.json"))) {
      yield {
        type: "error",
        message: target
          ? `해당 경로에서 실행할 서비스를 찾을 수 없습니다: ${project} (package.json 없음)`
          : "먼저 Session mode에서 패션 회사용 서비스를 생성하거나, 실행할 프로젝트 경로를 명시해 주세요.",
      };
      yield { type: "done" };
      return;
    }
    const running = this.startedUrls.get(project);
    if (running) {
      yield { type: "text", content: `서버 실행 중: ${running}` };
      yield { type: "done" };
      return;
    }

    // 배포 클론에는 프로젝트 node_modules가 없으므로(루트 .gitignore가 제외) 최초 1회 설치한다.
    if (!fs.existsSync(path.join(project, "node_modules"))) {
      yield { type: "tool_start", name: "shell_exec", args: { command: "npm install" } };
      const installResult = await this.installDeps(project);
      yield { type: "tool_result", name: "shell_exec", result: installResult };
      if (/^(?:Exit code|Error:)/.test(installResult)) {
        yield { type: "error", message: `의존성 설치에 실패했습니다.\n${installResult}` };
        yield { type: "done" };
        return;
      }
    }

    yield { type: "tool_start", name: "shell_exec", args: { command: "npm start" } };
    const result = await this.startService(project);
    yield { type: "tool_result", name: "shell_exec", result };
    if (!result.startsWith("[SERVER_STARTED]")) {
      yield { type: "error", message: result };
      yield { type: "done" };
      return;
    }
    const url = result.match(/https?:\/\/[^\s]+/)?.[0] ?? "";
    this.startedUrls.set(project, url || project);
    this.lastServiceUrl = url;
    yield { type: "text", content: `서버 실행 완료: ${url || project}` };
    yield { type: "done" };
  }

  async *run(message: string, signal?: AbortSignal): AsyncGenerator<AgentEvent> {
    const normalized = message.trim();
    if (this.pendingDashboard && /^[12](?:번)?$/.test(normalized)) {
      this.pendingDashboard = false;
      yield* this.copyDashboard(normalized.startsWith("1") ? "bcave" : "axis", signal);
      return;
    }
    const serverStartIntent = /(?:서버.{0,8}(?:실행|켜|띄워|시작)|실행해\s*줘|실행해\s*주세요|run\s+(?:the\s+)?server|start\s+(?:the\s+)?server)/i.test(normalized);
    if (serverStartIntent) {
      yield* this.startPreparedService(referencedDirectory(normalized));
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
    if (isRoundfitRequest(normalized)) {
      yield* this.createService("roundfit", signal);
      return;
    }
    if (isFashionServiceRequest(normalized)) {
      yield* this.createService(null, signal);
      return;
    }
    yield {
      type: "text",
      content: "Session mode에서는 준비된 대시보드 생성과 패션 회사용 서비스 개발 시연만 실행할 수 있습니다.",
    };
    yield { type: "done" };
  }
}
