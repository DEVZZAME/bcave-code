import OpenAI from "openai";
import { spawnSync, spawn } from "node:child_process";
import net from "node:net";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { createOpenAIClient, chat } from "../openai/client.js";
import { executeTool, getToolCategory } from "./tools.js";
import { PermissionManager, type PermissionCategory } from "./permissions.js";
import { saveConfig, type BcaveConfig } from "../config/config.js";
import { pickModel, classifyTask } from "./router.js";
import { isAppBuild } from "./request-classification.js";
import { designRules, hasDesignSystem, isUiArtifactRequest } from "../design-system/runtime.js";
import { hubRefresh } from "../auth/hub.js";

const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|vue|svelte|py|go|rs|java|rb|php|cs|kt|swift|scss|sass|less|css|json|astro)$/i;

/** 이 저장소의 검증(빌드/타입체크) 명령을 감지 — package.json 스크립트 우선, 없으면 tsconfig 로 tsc. */
function detectVerifyCommands(cwd: string, override: string[]): string[] {
  if (override && override.length) return override;
  try {
    const pkgPath = path.join(cwd, "package.json");
    if (fs.existsSync(pkgPath)) {
      const scripts = (JSON.parse(fs.readFileSync(pkgPath, "utf8")).scripts || {}) as Record<string, string>;
      // 빠르고 부작용 적은 순: 타입체크 → 빌드 → 린트 (테스트는 느리거나 대화형일 수 있어 자동 실행 제외)
      for (const name of ["typecheck", "type-check", "tsc", "build", "lint"]) {
        if (scripts[name]) return [`npm run ${name} --silent`];
      }
    }
    if (fs.existsSync(path.join(cwd, "tsconfig.json"))) return ["npx --no-install tsc --noEmit"];
  } catch { /* 감지 실패 → 검증 없음 */ }
  return [];
}

/** 검증 명령들을 실행해 처음 실패한 것의 {cmd, output} 반환. 모두 통과면 null. */
function runVerify(cmds: string[], cwd: string): { cmd: string; output: string } | null {
  for (const cmd of cmds) {
    let r;
    try {
      r = spawnSync(cmd, { cwd, shell: true, encoding: "utf8", timeout: 180_000, maxBuffer: 8 * 1024 * 1024 });
    } catch { continue; }
    if (r.status !== 0) {
      const raw = `${r.stdout || ""}\n${r.stderr || ""}`.trim();
      // 오류는 보통 끝부분에 몰려 있으므로 뒤에서 자른다.
      const output = raw.length > 5000 ? "…\n" + raw.slice(-5000) : raw;
      return { cmd, output: output || `exit code ${r.status}` };
    }
  }
  return null;
}

/** 서버 시작 명령 감지 — package.json 의 dev/start/serve. */
function detectStartCommand(cwd: string): string | null {
  try {
    const pkg = path.join(cwd, "package.json");
    if (!fs.existsSync(pkg)) return null;
    const scripts = (JSON.parse(fs.readFileSync(pkg, "utf8")).scripts || {}) as Record<string, string>;
    for (const n of ["dev", "start", "serve", "dev:server", "server", "start:dev"]) if (scripts[n]) return `npm run ${n} --silent`;
    return null;
  } catch { return null; }
}

/** OS 가 배정하는 빈 포트 하나. */
function findFreePort(): Promise<number> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(3000 + Math.floor(Math.random() * 2000)));
    srv.listen(0, () => { const p = (srv.address() as net.AddressInfo).port; srv.close(() => resolve(p)); });
  });
}

/** 해당 포트로 HTTP GET 이 어떤 응답이든 받으면 서버가 살아있다고 본다. */
function httpPing(port: number, timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const req = http.get({ host: "127.0.0.1", port, path: "/", timeout: timeoutMs }, (res) => { res.destroy(); resolve(true); });
    req.on("error", () => resolve(false));
    req.on("timeout", () => { req.destroy(); resolve(false); });
  });
}

/** 앱을 실제로 띄워 응답하는지 확인(스모크). 시작 명령이 없으면 스킵(통과 처리). */
async function smokeTest(cwd: string, signal?: AbortSignal): Promise<{ ok: boolean; skipped?: boolean; detail: string; startCmd: string }> {
  const startCmd = detectStartCommand(cwd);
  if (!startCmd) return { ok: true, skipped: true, detail: "", startCmd: "" };
  const port = await findFreePort();
  const logs: string[] = [];
  const collect = (b: Buffer) => { logs.push(b.toString()); while (logs.join("").length > 20000) logs.shift(); };
  const child = spawn(startCmd, { cwd, shell: true, detached: true, env: { ...process.env, PORT: String(port), NODE_ENV: "development", BROWSER: "none" } });
  child.stdout?.on("data", collect);
  child.stderr?.on("data", collect);
  let exited: number | null = null;
  child.on("exit", (code) => { exited = code ?? 0; });

  const kill = () => {
    try { if (child.pid) process.kill(-child.pid, "SIGTERM"); } catch { /* 그룹 없음 */ }
    try { if (child.pid) process.kill(child.pid, "SIGTERM"); } catch { /* 이미 종료 */ }
    const t = setTimeout(() => { try { if (child.pid) process.kill(-child.pid, "SIGKILL"); } catch { /* noop */ } }, 2000);
    (t as unknown as { unref?: () => void }).unref?.();
  };
  // 이 프로세스 스스로 죽어도 서버 좀비를 남기지 않도록.
  const onExit = () => kill();
  process.once("exit", onExit);

  const candidates = (): number[] => {
    const set = new Set<number>([port]);
    const text = logs.join("");
    for (const m of text.matchAll(/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|::1)?:(\d{2,5})\b/g)) set.add(+m[1]);
    for (const m of text.matchAll(/port[\s:=]+(\d{2,5})/gi)) set.add(+m[1]);
    return [...set].filter((p) => p > 0 && p < 65536);
  };

  const deadline = Date.now() + 35000; // 서버 기동(특히 Next dev)까지 넉넉히
  let up = false;
  try {
    while (Date.now() < deadline) {
      if (signal?.aborted) break;
      if (exited !== null && exited !== 0) break; // 크래시로 종료
      for (const p of candidates()) { if (await httpPing(p)) { up = true; break; } }
      if (up) break;
      await new Promise((r) => setTimeout(r, 700));
    }
  } finally {
    process.removeListener("exit", onExit);
    kill();
  }

  if (up) return { ok: true, detail: "", startCmd };
  const tail = logs.join("").slice(-4000).trim();
  const reason = exited !== null && exited !== 0 ? `서버가 시작 직후 종료됨(exit ${exited})` : "제한 시간 내 HTTP 응답 없음(서버가 기동/바인딩 실패했거나 PORT 를 안 씀)";
  return { ok: false, detail: `[스모크 실패: ${reason}] 시작 명령: ${startCmd}\n서버는 반드시 process.env.PORT 를 사용해 바인딩해야 합니다.\n${tail || "(출력 없음)"}`, startCmd };
}

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
  | { type: "verify"; status: "run" | "pass" | "fail"; cmd: string; detail?: string }
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

ARTIFACT vs APPLICATION (decide first): if the user asks for a real SERVICE / APPLICATION (backend, API, data, accounts/auth, CRUD, persistence, a running app), build an ACTUAL multi-file, runnable project WITH A REAL BACKEND — never deliver a few static HTML files and call it a service, and never fake data/auth in the frontend. The SINGLE-self-contained-HTML rule below applies ONLY to standalone artifacts (a dashboard, a report, a landing/one-off page, a mockup). For applications, ignore the single-HTML rule and follow the per-request application note.
UI / SCREENS (service & app development): When building product UI — screens, pages, components, forms, flows, features — build real, modern, production-quality web UI exactly like a general coding agent (Claude Code / Codex) would.
Then inspect the repo and FOLLOW its existing stack and conventions: framework (React / Vue / Next / Svelte / plain HTML), styling (Tailwind / CSS Modules / styled-components / plain CSS), component library, routing, and file layout. Wire it into the codebase. If no stack exists yet, pick sensible modern defaults and say so.
FILE RULES (mandatory): (1) SINGLE self-contained .html file — ALL CSS and JS inline; no separate .css/.js files, no external stylesheet links (a web-font link and an inlined chart lib are the only allowed externals). (2) ALWAYS write to a NEW file that does not already exist (e.g. <name>.html → <name>-2.html …); NEVER overwrite a previous page/dashboard, even for a "다르게/더 심플하게" iteration — so the user can keep and compare versions. (3) Save the file in the CURRENT working directory (where the user ran the command) — do NOT create or nest it inside a subfolder (never invent a project subdirectory for a single HTML deliverable).
DATA (mandatory — the #1 cause of "data disappeared on edit"): ALWAYS inject spreadsheet data with the {{BCAVE_DATA:/abs/path#sheet}} placeholder — on the FIRST build AND on EVERY later edit/redesign. write_file resolves it to the FULL dataset at save time, so re-emitting the placeholder always re-injects all rows. The data-source path does NOT change across edits — reuse the SAME path from earlier in the conversation. When the user asks to "change / develop / redo" a data page, you are writing a NEW file (per FILE RULES) that must contain the data again: put {{BCAVE_DATA:path}} back in. NEVER hand-copy rows out of the previous HTML, NEVER paste a sample/subset, NEVER leave a data array empty (window.__DATA=[] / data:[]), and do NOT try to read the big data blob back from the old file (read_file truncates it) — just reference the original path via the placeholder. If you don't have the path, ASK for it rather than shipping empty data.
DATA BINDING & RENDERING (mandatory — how to actually USE the injected data): the placeholder MUST go ONLY inside a script as a JS variable — <script>window.__DATA = {{BCAVE_DATA:/abs/path#sheet}};</script> (each row = an object keyed by real column names). NEVER place {{BCAVE_DATA}} inside visible HTML (a <td>, <p>, <div>…) — doing so dumps the raw JSON array as a giant wall of text (this is a severe bug). Then RENDER everything from window.__DATA in JS: compute KPIs/aggregates (sums, averages, group-by) and build tables/chart datasets by iterating the array. Tables: use the REAL column names (never "컬럼 1/2/3"), and render only a sensible slice (e.g. top 20–50 rows or an aggregated summary), NOT all thousands of rows. Charts: the labels and numbers MUST be derived from window.__DATA by aggregating it (e.g. group-by month → sum) — NEVER hardcode placeholder series like labels ['Q1'..'Q8'] / data [12,19,15,…]. Section titles must name real content ("월별 매출", "지역별 분포"), not meta/narration ("보이는 것", "다음 보기", "확인 포인트", "데이터 해석").
MULTI-SHEET & VALUES (avoid the recurring "data missing" bugs): (1) If the workbook has MULTIPLE sheets and your dashboard needs several, inject EACH one you use as its own variable — <script>window.__월별 = {{BCAVE_DATA:path#월별}}; window.__브랜드 = {{BCAVE_DATA:path#브랜드}};</script> — or the whole map with window.__SHEETS = {{BCAVE_SHEETS:path}} then read window.__SHEETS["시트명"]. The read_file preview lists the sheet names and the exact injection snippet. (2) NEVER reference data globals you did not inject via a placeholder (window.__DATA_MAP__, __DATA_BRAND__, loadSheet(), etc. are NOT real — they resolve to empty and blank the section). Every data source a chart/table/KPI reads MUST trace back to a {{BCAVE_DATA:…}} / {{BCAVE_SHEETS:…}} placeholder in the same file. (3) Injected numbers are already real numbers (no comma strings), so +row['총매출'] / reduce sums work directly — do not re-parse. (4) The injected array is already clean row objects (title/subtitle rows auto-removed) — do NOT .slice() off leading rows to "skip headers"; that drops real data.
DELIVERABLE CONTENT: the file contains ONLY the real product content — title, data, KPIs, charts, insights. NEVER embed meta/process narration: no "…를 바탕으로 다시 구성했습니다", no design-system/mood description, no data-source file path, no "단일 HTML 파일…" notes, no "원하시면 다음 단계로 …". Put ALL of that in your CHAT reply only.
TITLE & HEADER: h1 is a concise, factual report title — a short noun phrase (e.g. "브랜드 매출·고객 성과 리포트"), NO trailing sentence/period, NO marketing phrasing. Keep the header compact (optional short eyebrow + short h1 + at most one brief subtitle). Do not blanket-bold every heading.
RESPONSIVE & LAYOUT (mandatory, mobile-first): always add <meta name="viewport" content="width=device-width,initial-scale=1"> and \`*{box-sizing:border-box}\`. Use fluid layouts (flex/grid with min-width:0 on children, grid tracks as minmax(0,1fr), %/rem/clamp() sizing) — never fixed px widths on containers (use max-width + width:100%). Add @media breakpoints (e.g. 640/768/1024px) so nothing overflows or breaks on mobile; media/img get max-width:100%. Long text wraps; avoid horizontal scroll. Cover UI states: hover/focus/active/disabled + loading/empty/error.
MULTI-COLUMN ROWS (chart + side content): when a chart sits next to cards/lists/a table in the same grid row, the two columns must line up top AND bottom — never pair a FIXED-height chart box with auto-height content under align-items:start (it leaves ragged, misaligned bottoms / dead whitespace, a very common bug). Fix: put align-items:stretch on the grid and make BOTH columns fill the row height — the chart wrapper uses height:100%;min-height:280px (canvas fills it via maintainAspectRatio:false) and the side column uses height:100% (e.g. flex column that distributes its items). If you cannot make heights match, stack them vertically instead of side-by-side. The same applies to any row of side-by-side cards: give the row align-items:stretch so cards are equal height. After writing an HTML page, honor the export review — fix any 반응형/레이아웃 warnings before claiming done.
CHARTS: to use Chart.js, inline it as <script>{{BCAVE_CHARTJS}}</script> — NOT <script src="{{BCAVE_CHARTJS}}"> (putting the library in src breaks loading → chart won't render). Put EVERY <canvas> in a fixed-height container (position:relative;height:280px) and set the chart option maintainAspectRatio:false. For spreadsheet data token-free use the {{BCAVE_DATA:/abs/path#sheet}} placeholder. These are generic utilities, not the design system.
COMPOSITION DISCIPLINE:
- CARDS are NOT the default container. Use a card ONLY for a genuinely discrete widget (a KPI tile, one chart, one callout). Do NOT wrap whole sections, tables, or the whole page in cards — a page that is just a stack of boxes is wrong. Most content (section headers, tables, charts, prose) sits directly on the page inside the section, no card.
- Use Chart.js for data charts. Do not hand-build bars, donuts, gauges, or sparklines from divs when a real chart is appropriate.
- Keep text contrast accessible on every surface and use a coherent visual hierarchy across the page.`,
    });
    if (hasDesignSystem(config.designSystem)) {
      this.messages.push({
        role: "system",
        content:
          `[활성 디자인 시스템: ${config.designSystem}]\n` + designRules(config.designSystem) +
          `\n\n대시보드/UI/화면 HTML을 만들 때 출력 계약: write_file을 정확히 한 번 호출하고 path, body, app_script 필드를 사용한다. ` +
          "body에는 <body> 내부 마크업만, app_script에는 데이터 자리표시자 할당과 JS만 원문 문자열로 넣는다. content 필드와 코드펜스는 사용하지 않는다. 두 블록을 따로 저장하거나 완성 HTML, <style>, <script>, 별도 설명을 넣지 않는다. template.html을 직접 읽거나 조립하지 않는다. " +
          "CLI가 템플릿·토큰·UI CSS·Chart.js·차트 어댑터·데이터를 조립하고 린트한다. " +
          "차트는 동일 축에 동일 단위만 사용하고, 도넛은 상위 5개+기타(최대 6조각), 고객 수 단위는 '명'으로 쓴다. " +
          "히어로를 쓰면 반드시 <section class=\"hero\"><div class=\"top\"><h1>제목</h1><div class=\"rule\"></div><div class=\"dept\">부서 · 기간</div></div></section> 구조만 사용한다. hero-copy/hero-grid 같은 클래스를 발명하거나 히어로 안에 KPI를 넣지 않는다. " +
          "완료 응답 전 write_file 결과가 반드시 '검토 통과'여야 한다. 실패/경고를 저장 성공으로 간주하지 말고 수정한다. 완료 응답에는 파일명과 검증 통과만 간결히 쓰며 '원하시면/다음 단계' 제안은 넣지 않는다.",
      });
    }
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
    // 실제 백엔드가 있는 애플리케이션/서비스 요청 → 단일 정적 HTML 플로우가 아니라 진짜 프로젝트로 만든다.
    const appBuild = isAppBuild(userMessage);
    if (!appBuild && isUiArtifactRequest(userMessage) && hasDesignSystem(this.config.designSystem)) {
      this.messages.push({
        role: "system",
        content: `[이번 UI 산출물은 ${this.config.designSystem} 디자인 시스템 강제 파이프라인을 사용한다. RULES.md의 클래스와 BCAVE.chart/BCAVE.fmt API만 사용하고 write_file content 출력 계약을 지켜라.]`,
      });
    }
    if (appBuild) {
      this.messages.push({
        role: "system",
        content:
          "[이 요청은 정적 목업이 아니라 실제로 동작하는 서비스/애플리케이션이다. 정적 HTML 파일 몇 개로 끝내고 '서비스'라고 부르지 말 것. 다음을 갖춘 진짜 프로젝트를 만든다:\n" +
          "- 백엔드(필수): 실제 서버와 HTTP API 엔드포인트 + 데이터 영속화(DB). 별도 인프라가 필요없도록 기본은 SQLite/파일 DB. 데이터·사용자·상태·CRUD·인증·결제는 반드시 서버에서 처리 — 프론트 하드코딩·localStorage·가짜 배열 목업으로 대체 금지.\n" +
          "- 프론트엔드: 그 API 를 fetch 로 호출해 실제 데이터를 렌더(정적 더미데이터 금지).\n" +
          "- 구조: 여러 파일로 된 실행 가능한 프로젝트 — package.json(의존성), 폴더 구조, 서버·라우트·데이터 계층 분리, 라우팅.\n" +
          "- 실행/검증: 의존성 설치가 되고 build/typecheck 가 통과해야 한다. 실행 방법(예: npm install && npm run dev)과 주요 엔드포인트를 README 로 남긴다. (긴 실행이 필요한 서버 起動은 사용자가 하도록 안내만.)\n" +
          "- 스택: 저장소에 기존 스택이 있으면 그대로 따르고, 없으면 로컬에서 바로 도는 간단·확실한 기본값을 골라 한 줄로 밝힌다(예: Node.js+Express+SQLite(better-sqlite3), 또는 Next.js 풀스택+SQLite/Prisma). 무거운 외부 인프라(별도 DB 서버·클라우드·도커 필수)는 요구하지 말 것.\n" +
          "- 단일 인라인 HTML 규칙은 여기 적용되지 않는다(정상적인 다중 파일 프로젝트로).]",
      });
    }
    // B) 계획 먼저: 실질적 개발 작업(앱 빌드 또는 UI 단일 파일 제외의 heavy)은 큰 걸 한 번에 쏟지 말고 쪼개서 구현
    //    → 작고 명확한 단계는 약한 모델이 가장 안정적으로 처리하는 지점.
    if (appBuild || classifyTask(userMessage) === "heavy") {
      this.messages.push({
        role: "system",
        content:
          "[실질적인 개발/구현 작업이다. 바로 코드를 쏟지 말고 먼저 짧은 계획을 세워라: (1) 목표 1~2줄 (2) 만들거나 수정할 파일 목록 (3) 순서 있는 구현 체크리스트. 그다음 한 번에 한 조각씩 구현하고, 각 조각을 마치면 빌드/타입체크로 정확성을 확인하라. 애매하면 가정을 한 줄로 명시하고 진행. 거대한 덩어리를 한 번에 만들지 말 것 — 작은 단위가 품질을 높인다.]",
      });
    }
    this.messages.push({ role: "user", content: userMessage });

    // 용도별 모델 라우팅: 이 턴 전체에 사용할 모델을 메시지 성격으로 결정
    const routed = pickModel(this.config, userMessage);
    yield { type: "model", model: routed.model, tier: routed.tier };

    // 같은 텍스트가 연속으로 출력되는 중복 방지 (모델이 도구 호출 전후로
    // 동일 인사/질문을 반복하는 경우 화면에 두 번 찍히던 문제).
    let lastText = "";

    // A) 검증→자동수정 루프 상태: 코드가 바뀌면 검증 명령을 돌려 실패 시 모델이 스스로 고치게 한다.
    const verifyCmds = this.config.autoVerify ? detectVerifyCommands(this.cwd, this.config.verifyCmds) : [];
    let codeTouched = false;
    let verifyRounds = 0;

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
          // A) 완료 직전 자동 검증: 코드가 바뀌었고 검증 명령이 있으면 실행, 실패하면 로그를 되먹여 계속 고친다.
          if (verifyCmds.length && codeTouched && verifyRounds < this.config.maxVerifyRounds && !signal?.aborted) {
            yield { type: "verify", status: "run", cmd: verifyCmds.join(" && ") };
            const fail = runVerify(verifyCmds, this.cwd);
            if (fail) {
              verifyRounds++;
              codeTouched = false; // 다음 라운드에서 다시 수정하면 재검증
              this.messages.push({ role: "assistant", content: message.content ?? "" });
              this.messages.push({
                role: "user",
                content:
                  `[자동 검증 실패] \`${fail.cmd}\` 가 오류로 끝났습니다. 아래 로그의 원인을 찾아 파일을 수정하세요. ` +
                  `완료하면 자연스럽게 마무리만 하면 됩니다(검증은 자동으로 다시 실행됩니다).\n\n${fail.output}`,
              });
              yield { type: "verify", status: "fail", cmd: fail.cmd, detail: fail.output };
              lastText = "";
              continue;
            }
            yield { type: "verify", status: "pass", cmd: verifyCmds.join(" && ") };
          }
          // A-2) 앱이면 서버를 실제로 띄워 HTTP 응답(헬스체크)까지 확인. 실패 시 로그를 되먹여 고친다.
          if (appBuild && this.config.autoVerify && this.config.smokeTest && codeTouched && verifyRounds < this.config.maxVerifyRounds && !signal?.aborted) {
            yield { type: "verify", status: "run", cmd: "서버 실행 헬스체크(스모크)" };
            const smoke = await smokeTest(this.cwd, signal);
            if (!smoke.ok) {
              verifyRounds++;
              codeTouched = false;
              this.messages.push({ role: "assistant", content: message.content ?? "" });
              this.messages.push({
                role: "user",
                content:
                  `[스모크 테스트 실패] 서버를 띄워 확인했지만 HTTP 응답을 못 받았습니다. 원인을 고쳐 실제로 뜨게 하세요(서버는 반드시 process.env.PORT 로 바인딩, 시작 스크립트 dev/start 정상 동작, 의존성 설치). 완료하면 마무리만 하면 자동 재확인됩니다.\n\n${smoke.detail}`,
              });
              yield { type: "verify", status: "fail", cmd: "서버 실행 헬스체크(스모크)", detail: smoke.detail };
              lastText = "";
              continue;
            }
            if (!smoke.skipped) yield { type: "verify", status: "pass", cmd: `서버 실행 헬스체크 통과 (${smoke.startCmd})` };
          }
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
          // 코드 파일이 바뀌면 완료 시 자동 검증 대상으로 표시(HTML 단일 산출물은 reviewHtml 이 따로 담당).
          if (name === "write_file" && typeof args.path === "string" && CODE_EXT.test(args.path)) codeTouched = true;
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
