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
import { classifyUiSurface, isAppBuild, isDashboardArtifactRequest, detectDeployTarget } from "./request-classification.js";
import { designRules, designSystemDir, designSystemNames, hasDesignSystem, isUiArtifactRequest } from "../design-system/runtime.js";
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
  private pendingDesignChoice = false;
  private selectedDesignSystem = "";
  private applicationActive = false;
  private pendingDeployChoice = false; // 앱 빌드 시 배포 옵션 선택 대기
  private selectedDeployTarget = ""; // 선택된 배포 플랫폼

  constructor(config: BcaveConfig, permissions: PermissionManager, cwd: string) {
    this.config = config;
    this.permissions = permissions;
    this.cwd = cwd;
    this.client = createOpenAIClient(config);
    this.messages.push({
      role: "system",
      content: `You are BCave, a CLI coding agent. Working directory: ${cwd}. Use tools to interact with the filesystem and shell. Respond in the user's language.

ARTIFACT vs APP: Real service/app (backend+API+DB+auth) → multi-file project. Standalone dashboard/report/landing → single self-contained HTML. Never fake data with static arrays.
UI: Follow existing stack. No stack → Tailwind CSS + shadcn/ui default. No arbitrary hex/inline styles.
UI QUALITY: (1) contrast≥4.5:1, alt text, keyboard nav, aria-labels, no remove focus rings (2) tap≥44×44px, loading feedback, no hover-only (3) SVG icons, Tailwind tokens (4) mobile-first, viewport meta, no horizontal scroll (5) body≥16px/1.5lh, no gray-on-gray (6) animation 150-300ms, prefers-reduced-motion (7) visible labels, inline errors, disable submit on load (8) predictable back, bottom-nav≤5.
WIRING: new page→add route+nav link; new API→frontend fetch+error; new component→import+render; schema change→migration. Read router/server after writing to confirm wire.
HTML ARTIFACTS: (1) single .html, all CSS+JS inline (2) always new filename (3) save in cwd, no subdirectory.
DATA: Use {{BCAVE_DATA:/path#sheet}} placeholder in <script>window.__DATA=…</script> only—never in visible HTML. Render from __DATA in JS (aggregate, slice top 50). Use {{BCAVE_SHEETS:path}} for multi-sheet. Re-emit placeholder on every edit. Never copy rows or leave empty arrays.
CHARTS: <script>{{BCAVE_CHARTJS}}</script>, canvas in position:relative;height:280px div, maintainAspectRatio:false. Grid align-items:stretch for chart+side-card rows.`,
    });
  }

  /** 저장용 대화 히스토리(시스템 프롬프트 제외 — 복원 시 현재 시스템 프롬프트를 새로 씌운다). */
  getHistory(): ChatCompletionMessageParam[] {
    return this.messages.slice(1);
  }

  /** 저장된 히스토리로 대화를 복원. 현재(최신) 시스템 프롬프트는 유지한다. */
  loadHistory(history: ChatCompletionMessageParam[]): void {
    this.messages = [this.messages[0], ...history];
    // 저장된 대화에서 마지막 활성 디자인 시스템을 복원한다.
    for (let i = history.length - 1; i >= 0; i--) {
      const message = history[i];
      if (message.role !== "system" || typeof message.content !== "string") continue;
      const active = message.content.match(/\[ACTIVE_DESIGN_SYSTEM:([a-z0-9_-]+)\]/i)?.[1]?.toLowerCase();
      if (!this.selectedDesignSystem && active && hasDesignSystem(active)) {
        this.selectedDesignSystem = active;
      }
      if (/\[APPLICATION_CONTEXT\]/.test(message.content) || /\[이 요청은 정적 목업이 아니라 실제로 동작하는 서비스\/애플리케이션이다/.test(message.content)) {
        this.applicationActive = true;
      }
      if (this.selectedDesignSystem && this.applicationActive) break;
    }
  }

  /** 이전 BCAVE/AXIS 지침을 제거하고 현재 작업에 맞는 디자인 컨텍스트 하나만 유지한다. */
  private setDesignSystemContext(name: string, content: string): void {
    this.messages = this.messages.filter((message, index) => {
      if (index === 0 || message.role !== "system" || typeof message.content !== "string") return true;
      return !(/\[ACTIVE_DESIGN_SYSTEM:/i.test(message.content) ||
        /\[이번 UI 산출물은 (?:BCAVE|AXIS) 디자인 시스템/i.test(message.content) ||
        /\[이 서비스의 모든 웹 UI는 (?:BCAVE|AXIS) 디자인 시스템/i.test(message.content));
    });
    this.messages.push({
      role: "system",
      content: `[ACTIVE_DESIGN_SYSTEM:${name}]\n${content}`,
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

  /** 배포 플랫폼별 프로덕션 스택 가이드 */
  private static deployStackGuide(target: string): string {
    const guides: Record<string, string> = {
      vercel:
        "[배포 대상: Vercel]\n" +
        "- 프론트: Next.js (App Router) + TypeScript + Tailwind CSS + shadcn/ui\n" +
        "- DB: PostgreSQL — Vercel Postgres(Neon) 또는 Supabase. Prisma ORM으로 스키마 관리.\n" +
        "- 인증: NextAuth.js (next-auth) 또는 Clerk\n" +
        "- 파일 업로드: Vercel Blob 또는 AWS S3\n" +
        "- 환경변수: .env.local + Vercel 대시보드 환경변수\n" +
        "- 배포: git push → 자동 배포. `vercel` CLI로 미리보기 배포 가능.\n" +
        "- SQLite·로컬 파일시스템 사용 금지 (Serverless 환경에서 영속화 불가).",

      railway:
        "[배포 대상: Railway]\n" +
        "- 백엔드: Node.js + Express (또는 Fastify) + TypeScript\n" +
        "- DB: PostgreSQL — Railway Postgres 플러그인 (DATABASE_URL 자동 주입). Prisma ORM.\n" +
        "- 프론트: React + Vite (별도 Railway 서비스) 또는 백엔드에서 정적 서빙\n" +
        "- 인증: JWT + bcrypt, HttpOnly 쿠키 세션\n" +
        "- 환경변수: Railway 대시보드 Variables\n" +
        "- 배포: Dockerfile 또는 Nixpacks 자동 감지, git push → 자동 배포\n" +
        "- SQLite 사용 금지 (Railway 볼륨 미설정 시 재배포마다 데이터 소실).",

      fly:
        "[배포 대상: Fly.io]\n" +
        "- 백엔드: Node.js + Express + TypeScript\n" +
        "- DB: PostgreSQL — Fly Postgres 또는 Supabase. Prisma ORM.\n" +
        "- 컨테이너: Dockerfile 필수 (multi-stage build 권장)\n" +
        "- 인증: JWT + bcrypt, HttpOnly 쿠키\n" +
        "- 환경변수: `fly secrets set KEY=VALUE`\n" +
        "- 배포: `fly deploy` (Dockerfile 기반)\n" +
        "- SQLite: Fly Volumes를 마운트하면 가능하지만 단일 인스턴스만 안전. 스케일 필요 시 Postgres 권장.",

      aws:
        "[배포 대상: AWS]\n" +
        "- 백엔드: Node.js + Express + TypeScript → EC2 또는 ECS(Fargate)\n" +
        "- DB: PostgreSQL — AWS RDS(Aurora Serverless v2 또는 RDS PostgreSQL). Prisma ORM.\n" +
        "- 정적 파일: S3 + CloudFront\n" +
        "- 인증: JWT + bcrypt, HttpOnly 쿠키. 또는 AWS Cognito.\n" +
        "- 환경변수: AWS Secrets Manager 또는 Parameter Store\n" +
        "- 컨테이너: Dockerfile + ECR + ECS 또는 Elastic Beanstalk\n" +
        "- SQLite 사용 금지.",

      vps:
        "[배포 대상: VPS/자체 서버 (Ubuntu + Nginx)]\n" +
        "- 백엔드: Node.js + Express + TypeScript (PM2로 프로세스 관리)\n" +
        "- DB: PostgreSQL — apt 설치 또는 Docker Compose. Prisma ORM.\n" +
        "- 프론트: React + Vite 빌드 후 Nginx 정적 서빙\n" +
        "- 인증: JWT + bcrypt, HttpOnly 쿠키\n" +
        "- 환경변수: /etc/environment 또는 .env (서버에 직접 관리)\n" +
        "- 배포: Dockerfile + docker-compose.yml (nginx + app + postgres) 또는 PM2\n" +
        "- 리버스 프록시: Nginx + Certbot(Let's Encrypt SSL)\n" +
        "- SQLite 사용 금지 (프로덕션 데이터 무결성/동시성 보장 불가).",

      local:
        "[배포 대상: 로컬 개발용]\n" +
        "- 백엔드: Node.js + Express + TypeScript (tsx watch로 HMR)\n" +
        "- DB: SQLite (better-sqlite3 또는 sqlite3). 로컬 개발 한정.\n" +
        "  단, 나중에 프로덕션 배포 시 PostgreSQL + Prisma로 마이그레이션 필요.\n" +
        "  처음부터 Prisma를 쓰면 DB 전환이 설정 변경만으로 가능하므로 권장.\n" +
        "- 프론트: React + Vite\n" +
        "- 인증: JWT + bcrypt, HttpOnly 쿠키",
    };
    return guides[target] ?? guides["railway"]; // 기본값: Railway
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
    if (appBuild) this.applicationActive = true;

    // ─── 배포 옵션 선택 ───────────────────────────────────────────────────────
    // 새 앱 빌드 요청이면 배포 대상을 먼저 물어본다 (프로덕션 스택을 결정하기 위해).
    // 이미 선택됐거나, 메시지에 명시됐거나, 배포 선택 답변이면 건너뛴다.
    if (appBuild && !this.selectedDeployTarget) {
      const explicitTarget = detectDeployTarget(userMessage);
      if (explicitTarget) {
        this.selectedDeployTarget = explicitTarget;
        this.pendingDeployChoice = false;
      } else if (!this.pendingDeployChoice) {
        // 처음 앱 빌드 요청 → 배포 옵션을 먼저 묻고 턴 종료
        const q =
          "어떤 환경에 배포할 예정인가요? 배포 대상에 따라 DB·스택·설정이 달라집니다.\n\n" +
          "  1. **Vercel** ✦ 프론트 중심 서비스 추천 — Next.js 풀스택, PostgreSQL(Neon/Supabase), git push 자동 배포, 무료 플랜 있음\n" +
          "  2. **Railway** ✦ 빠른 풀스택 배포 추천 — Node.js + Express + PostgreSQL 올인원, 설정 최소, 가장 빠른 시작\n" +
          "  3. **Fly.io** — Docker 기반, PostgreSQL, 리전 선택 가능, 중간 복잡도\n" +
          "  4. **AWS / ECS** ✦ 대규모·사내 인프라 추천 — EC2·Fargate, RDS PostgreSQL, 최대 제어·확장성\n" +
          "  5. **VPS / 자체 서버** ✦ 고정 비용·완전 제어 추천 — Ubuntu + Nginx + Docker Compose, 월 고정 비용\n" +
          "  6. **로컬 개발용** — 지금은 로컬에서만 실행, 배포는 나중에 결정\n\n" +
          "번호나 이름으로 답해 주세요. (예: `2` 또는 `railway`)";
        this.pendingDeployChoice = true;
        this.messages.push({ role: "user", content: userMessage });
        this.messages.push({ role: "assistant", content: q });
        yield { type: "text", content: q };
        yield { type: "done" };
        return;
      }
    } else if (this.pendingDeployChoice && !appBuild) {
      // 배포 선택 대기 중 답변 처리
      const answer = userMessage.trim().toLowerCase();
      const targetMap: Record<string, string> = {
        "1": "vercel", vercel: "vercel",
        "2": "railway", railway: "railway",
        "3": "fly", "fly.io": "fly", flyio: "fly",
        "4": "aws", ec2: "aws", ecs: "aws",
        "5": "vps", ubuntu: "vps", nginx: "vps", "자체": "vps",
        "6": "local", 로컬: "local", 개발용: "local",
      };
      const picked = Object.entries(targetMap).find(([k]) => answer.startsWith(k))?.[1];
      if (picked) {
        this.selectedDeployTarget = picked;
        this.pendingDeployChoice = false;
      }
    }
    const systems = designSystemNames();
    const withoutPaths = userMessage.replace(/\S*[\\/]\S*/g, " ").toLowerCase();
    let requestedSystem = systems.find((name) => new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(withoutPaths)) || "";
    if (!requestedSystem && /비케이브/.test(withoutPaths) && systems.includes("bcave")) requestedSystem = "bcave";
    if (!requestedSystem && /액시스/.test(withoutPaths) && systems.includes("axis")) requestedSystem = "axis";
    const pendingChoiceAnswer = this.pendingDesignChoice && /^[12](?:번)?$/.test(withoutPaths.trim());
    if (!requestedSystem && pendingChoiceAnswer) {
      requestedSystem = withoutPaths.trim().startsWith("1") ? "bcave" : "axis";
      if (!systems.includes(requestedSystem)) requestedSystem = "";
    }
    // applicationUiRequest: 서비스 맥락에서 화면 요청 → 디자인시스템 적용
    const applicationUiRequest = appBuild || (this.applicationActive && isUiArtifactRequest(userMessage));
    // dashboardRequest: 단독 대시보드/리포트 산출물 → 디자인시스템 강제 파이프라인
    // 단순 "화면 만들어줘"/"페이지 만들어줘"는 해당하지 않음 — 디자인시스템 제약 없이 자유롭게 구현
    const dashboardRequest = !applicationUiRequest && isDashboardArtifactRequest(userMessage);
    // 디자인 선택을 기다리던 중 관계없는 요청이 오면 대기 해제
    if (this.pendingDesignChoice && !pendingChoiceAnswer && !dashboardRequest) {
      this.pendingDesignChoice = false;
    }
    const uiRequest = dashboardRequest || Boolean(pendingChoiceAnswer);
    // 서비스 UI와 대시보드 모두 설정된 시스템을 기본 적용한다. 명시한 BCAVE/AXIS가 항상 우선한다.
    if (!requestedSystem && (applicationUiRequest || uiRequest) && hasDesignSystem(this.config.designSystem)) {
      requestedSystem = this.config.designSystem;
    }
    if (uiRequest && !requestedSystem) {
      this.pendingDesignChoice = true;
      const q = "이 대시보드/리포트에 사용할 디자인 시스템을 선택해 주세요: `1 BCAVE` 또는 `2 AXIS`.";
      this.messages.push({ role: "user", content: userMessage });
      this.messages.push({ role: "assistant", content: q });
      yield { type: "text", content: q };
      yield { type: "done" };
      return;
    }
    if (requestedSystem) {
      this.selectedDesignSystem = requestedSystem;
      this.pendingDesignChoice = false;
    }
    // 앱/서비스 빌드는 디자인시스템 파이프라인을 적용하지 않는다.
    // 모델이 design_system 필드를 write_file에 넣으면 body/app_script 강제 루프가 발생하므로
    // 앱 빌드 시 setDesignSystemContext를 호출하지 않고 스타일은 자유롭게 구현한다.
    if (uiRequest && hasDesignSystem(this.selectedDesignSystem)) {
      const selected = this.selectedDesignSystem;
      this.setDesignSystemContext(selected,
          `[이번 UI 산출물은 ${selected.toUpperCase()} 디자인 시스템 강제 파이프라인을 사용한다.]\n` +
          designRules(selected) +
          `\n\nwrite_file을 정확히 한 번 호출하고 design_system: "${selected}", path, body, app_script 필드를 사용한다. ` +
          "body에는 <body> 내부 마크업만, app_script에는 데이터 자리표시자 할당과 JS만 넣는다. content·코드펜스·완성 HTML·<style>·<script>를 넣지 말고 template.html도 직접 읽지 않는다. " +
          "write_file 호출 직전에 body의 모든 class 이름을 RULES/UI 제공 클래스와 대조하고, row·container·wrapper처럼 익숙하지만 제공되지 않은 클래스를 발명하지 않는다. BCAVE의 가로 정렬은 row가 아니라 row-flex를 사용한다. " +
          "동일 축에는 동일 단위만 사용하고 고객 수 단위는 '명'이다. 완료 전 write_file 결과가 반드시 검토 통과여야 하며 실패/경고를 성공으로 간주하지 않는다. 완료 응답은 파일명과 검증 통과만 간결히 쓴다.",
      );
    }
    if (appBuild || this.applicationActive) {
      const deployTarget = this.selectedDeployTarget || "railway";
      const deployGuide = ConversationManager.deployStackGuide(deployTarget);
      this.messages.push({
        role: "system",
        content:
          "[APPLICATION_CONTEXT]\n이 요청은 실제로 동작하는 서비스/애플리케이션이다. 정적 HTML 파일 몇 개로 끝내지 말 것.\n\n" +
          deployGuide + "\n\n" +
          "공통 규칙:\n" +
          "- 프론트엔드 스타일: Tailwind CSS + shadcn/ui (shadcn 없으면 Tailwind 유틸리티, 임의 hex/inline style 금지)\n" +
          "- 프론트엔드: API를 fetch로 호출해 실제 데이터 렌더 (정적 더미데이터 금지)\n" +
          "- 데이터·사용자·상태·CRUD·인증은 반드시 서버에서 처리 (프론트 하드코딩·localStorage·가짜 배열 금지)\n" +
          "- 구조: package.json, 폴더 구조, 서버·라우트·데이터 계층 분리\n" +
          "- Prisma ORM 사용 시 .env에 DATABASE_URL 설정, `prisma migrate dev`로 스키마 관리\n" +
          "- .env.example에 필요한 환경변수를 모두 나열 (실제 값은 .env에, .gitignore에 포함)\n" +
          "- README에 실행 방법, 환경변수 설정, 배포 방법 포함\n" +
          "- 기존 저장소에 스택이 있으면 그대로 따른다\n" +
          "- 단일 인라인 HTML 규칙 적용 안 됨 (정상적인 다중 파일 프로젝트)",
      });
    }
    // B) 계획 먼저 + 완료 기준 명시: 실질적 개발 작업은 작게 쪼개되, 반드시 실제로 연결까지 확인한다.
    if (appBuild || classifyTask(userMessage) === "heavy") {
      this.messages.push({
        role: "system",
        content:
          "[실질적인 개발/구현 작업이다. 다음 순서로 진행한다:\n" +
          "1) 계획: (a) 목표 1~2줄, (b) 만들거나 수정할 파일 목록, (c) 순서 있는 체크리스트.\n" +
          "2) 구현: 한 번에 한 조각씩. 각 조각이 끝나면 build/typecheck로 정확성 확인.\n" +
          "3) 연결 검증(핵심): 새 파일/기능을 만든 후 반드시 기존 코드에 실제로 연결됐는지 확인한다.\n" +
          "   - 새 페이지/화면: 라우터 파일에 route가 추가됐는가? 네비게이션에 링크가 있는가?\n" +
          "   - 새 API 엔드포인트: 프론트에서 실제로 fetch 호출하는가? 에러 처리가 있는가?\n" +
          "   - 새 컴포넌트: import해서 실제로 렌더하는 곳이 있는가?\n" +
          "   - DB 스키마 변경: migration이 적용됐는가? seed가 필요한가?\n" +
          "   연결이 빠진 채로 '완료'라고 하지 말 것 — 만든 것이 실제로 동작하는 경로까지가 완료다.\n" +
          "4) UI 품질(화면이 있을 때): 44×44px 터치 타깃, 4.5:1 대비, 인라인 에러, 로딩 피드백, SVG 아이콘(이모지 금지), 모바일 반응형.\n" +
          "5) 완료 후: 구현이 끝나면 '지금 바로 실행해드릴까요?' 한 줄로 물어본다. 사용자가 '응/예/실행해줘'라고 하면 dev 서버를 백그라운드로 기동하고 접속 URL을 알려준다. 사용자가 터미널에 익숙하지 않을 수 있으므로 실행 명령을 직접 대신 수행한다.\n" +
          "6) 완료 응답: 만든 파일, 추가한 route/link, 실행 명령 1줄만. 불필요한 설명 생략.]",
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
    let artifactValidationPending = false;
    let artifactRepairRounds = 0;

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
        const modelIsTryingToFinishPendingArtifact = artifactValidationPending &&
          (!message.tool_calls || message.tool_calls.length === 0);
        if (text && text !== lastText && !modelIsTryingToFinishPendingArtifact) {
          lastText = text;
          yield { type: "text", content: message.content as string };
        }

        if (!message.tool_calls || message.tool_calls.length === 0) {
          // 디자인 산출물은 write_file의 검토 통과가 완료 조건이다. 모델이 린트 실패 뒤
          // 성공 문구를 말해도 종료하지 않고, 같은 파일을 다시 작성하도록 되먹인다.
          if (artifactValidationPending && !signal?.aborted) {
            artifactRepairRounds++;
            const maxArtifactRepairRounds = Math.max(3, this.config.maxVerifyRounds ?? 2);
            if (artifactRepairRounds > maxArtifactRepairRounds) {
              yield { type: "error", message: "디자인 산출물이 반복 수정 후에도 검토를 통과하지 못했습니다. 미완성 상태이므로 생성 완료로 처리하지 않습니다." };
              return;
            }
            this.messages.push({ role: "assistant", content: message.content ?? "" });
            this.messages.push({
              role: "user",
              content:
                "[완료 차단] 마지막 write_file 결과가 검토 실패였습니다. 지금은 완료 응답을 할 수 없습니다. " +
                "직전 violations를 제거하도록 body/app_script를 다시 작성하고 같은 파일에 write_file을 호출하세요. " +
                "부분 수정이 반복 실패했다면 위반 구간을 디자인 시스템 제공 클래스만 사용해 새로 구성하세요.",
            });
            lastText = "";
            continue;
          }
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
          let args: Record<string, unknown>;
          try {
            args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
          } catch (parseErr) {
            // 모델별 툴 콜 파싱 실패율 집계를 위해 모델명을 로그에 포함
            console.error(`[tool-parse-fail] model=${routed.model} tool=${name} err=${(parseErr as Error).message} raw=${toolCall.function.arguments?.slice(0, 200)}`);
            this.messages.push({ role: "tool", tool_call_id: toolCall.id, content: "Tool call parse failed — invalid JSON in arguments." });
            yield { type: "tool_result", name, result: "Tool call parse failed." };
            continue;
          }
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
          if (name === "write_file" && typeof args.path === "string" && /\.html?$/i.test(args.path)) {
            if (/\(검토 통과\)\s*$/.test(result)) {
              artifactValidationPending = false;
              artifactRepairRounds = 0;
            } else if (typeof args.design_system === "string") {
              // 디자인 시스템 산출물은 저장 실패/계약 위반/린트 실패 모두 미완성이다.
              artifactValidationPending = true;
            } else if (/^File written(?: but NOT complete)?:/m.test(result) && /(?:⚠|✗|문제가 발견)/.test(result)) {
              artifactValidationPending = true;
            }
          }
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
