import OpenAI from "openai";
import fs from "node:fs";
import path from "node:path";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { createOpenAIClient, chat } from "../openai/client.js";
import { executeTool, getToolCategory, isDevServerCommand } from "./tools.js";
import { PermissionManager, type PermissionCategory } from "./permissions.js";
import { saveConfig, type BcaveConfig } from "../config/config.js";
import { pickModel, classifyTask } from "./router.js";
import { classifyUiSurface, isAppBuild, isDashboardArtifactRequest, detectDeployTarget } from "./request-classification.js";
import { designRules, designSystemDir, designSystemNames, hasDesignSystem, isUiArtifactRequest } from "../design-system/runtime.js";
import { hubRefresh } from "../auth/hub.js";
import { detectVerifyCommands, runVerify } from "./build-verification.js";
import { auditAppCompleteness } from "./app-audit.js";
export { auditApiContracts, auditUiSource, validateApiResponse } from "./app-audit.js";
import { smokeTest } from "./smoke-test.js";
import { buildSystemPrompt } from "./system-prompt.js";
export { smokeTest } from "./smoke-test.js";

const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|vue|svelte|py|go|rs|java|rb|php|cs|kt|swift|scss|sass|less|css|json|astro)$/i;

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
  private pendingStackChoice = false; // 앱 빌드 시 스택 선택 대기
  private selectedStack = ""; // 선택된 기술 스택
  private pendingDeployChoice = false; // 앱 빌드 시 배포 옵션 선택 대기
  private selectedDeployTarget = ""; // 선택된 배포 플랫폼
  constructor(config: BcaveConfig, permissions: PermissionManager, cwd: string) {
    this.config = config;
    this.permissions = permissions;
    this.cwd = cwd;
    this.client = createOpenAIClient(config);
    this.messages.push({
      role: "system",
      content: buildSystemPrompt(cwd),
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

  /** 반복 턴마다 쌓이는 작업 컨텍스트를 최신 한 벌로 교체해 요청 크기와 TPM 사용을 제한한다. */
  private replaceSystemContext(marker: string, content: string): void {
    this.messages = this.messages.filter((message, index) =>
      index === 0 || message.role !== "system" || typeof message.content !== "string" || !message.content.startsWith(marker),
    );
    this.messages.push({ role: "system", content });
  }

  /** 배포 환경을 외부에서 재설정 (CLI /deploy 명령용). */
  setDeployTarget(target: string): void {
    this.selectedDeployTarget = target;
    this.pendingDeployChoice = false;
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
    const BUDGET = 140_000; // 문자 수 (~3.5만 토큰) — Tier 1 TPM과 응답 지연을 함께 낮춘다
    const msgs = this.messages;
    if (msgs.length <= 2) return;
    const size = (m: ChatCompletionMessageParam): number => JSON.stringify(m).length;
    const sizes = msgs.map(size);
    const total = sizes.reduce((sum, value) => sum + value, 0);
    if (total <= BUDGET) return;

    const system = msgs[0];
    const sysSize = sizes[0];
    const userIdxs: number[] = [];
    for (let i = 1; i < msgs.length; i++) {
      if ((msgs[i] as { role: string }).role === "user") userIdxs.push(i);
    }
    if (userIdxs.length === 0) return; // 안전하게 자를 경계가 없으면 그대로 둔다

    const suffixSizes = new Array<number>(msgs.length + 1).fill(0);
    for (let i = msgs.length - 1; i >= 1; i--) suffixSizes[i] = suffixSizes[i + 1] + sizes[i];
    let chosen = userIdxs[userIdxs.length - 1]; // 최소한 마지막 턴은 유지
    for (const idx of userIdxs) {
      if (sysSize + suffixSizes[idx] <= BUDGET) { chosen = idx; break; }
    }
    // assistant 텍스트가 과도하게 길면 앞부분을 잘라 히스토리 토큰을 줄인다.
    // (계획·설명·재언급이 쌓여 다음 턴 입력 토큰을 낭비하는 주요 원인)
    const MAX_ASSISTANT_TEXT = 800;
    const trimmed = msgs.slice(chosen).map((m) => {
      if ((m as { role: string }).role !== "assistant") return m;
      const c = (m as { content?: unknown }).content;
      if (typeof c !== "string" || c.length <= MAX_ASSISTANT_TEXT) return m;
      return { ...m, content: c.slice(0, MAX_ASSISTANT_TEXT) + " …[생략]" };
    });
    this.messages = [system, ...trimmed];
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
        "[배포 대상: Railway — PostgreSQL 필수]\n" +
        "- 백엔드: Node.js + Express + TypeScript\n" +
        "- DB: ★ PostgreSQL 직접 사용 (pg 패키지). Prisma 사용 시 datasource provider = \"postgresql\" 필수.\n" +
        "  ★★ SQLite·better-sqlite3·@prisma/adapter-better-sqlite3 절대 사용 금지. 로컬 개발이라도 같은 PostgreSQL 스키마 사용.\n" +
        "  로컬 개발용 DATABASE_URL: Neon(neon.tech) 또는 Supabase 무료 티어에서 발급한 PostgreSQL URL 사용.\n" +
        "  .env 에 DATABASE_URL=postgresql://... 를 설정하고 .env.example 에도 형식 포함.\n" +
        "- 프론트: React + Vite. vite.config.ts 에 반드시 server.proxy 설정: '/api' → 'http://localhost:3001'.\n" +
        "- 인증: JWT + bcrypt, HttpOnly 쿠키 세션\n" +
        "- 환경변수: Railway 대시보드 Variables (DATABASE_URL, JWT_SECRET 등)\n" +
        "- 배포: Nixpacks 자동 감지, git push → 자동 배포",

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
        "[배포 대상: SQLite 로컬 빠른 검증]\n" +
        "- 백엔드: Node.js + Express + TypeScript (tsx watch로 HMR)\n" +
        "- DB: SQLite — better-sqlite3 직접 사용(Prisma 미사용 권장). 이유: Prisma 7은 SQLite 기본 지원 제거, @prisma/adapter-better-sqlite3 필요해 복잡도 증가.\n" +
        "  better-sqlite3 로 직접 사용하는 패턴: const db = new Database('dev.db'); db.exec('CREATE TABLE IF NOT EXISTS ...');\n" +
        "  마이그레이션 없이 즉시 실행 가능한 초기 스키마와 seed를 제공해 로컬 기능 검증을 우선한다.\n" +
        "  나중에 프로덕션 배포 시 PostgreSQL(pg 패키지)로 교체 필요. 데이터 계층을 분리해 전환 범위를 제한한다.\n" +
        "- 프론트: React + Vite. vite.config.ts 에 반드시 server.proxy: { '/api': { target: 'http://localhost:3001', changeOrigin: true } }.\n" +
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
    // 최초 요청에 배포 환경 또는 SQLite가 명시되면 스택 선택 뒤 같은 질문을 반복하지 않는다.
    if (appBuild && !this.selectedDeployTarget) {
      const explicitTarget = detectDeployTarget(userMessage);
      if (explicitTarget) this.selectedDeployTarget = explicitTarget;
    }

    // ─── 배포 옵션 선택 ───────────────────────────────────────────────────────
    // 새 앱 빌드 요청이면 배포 대상을 먼저 물어본다 (프로덕션 스택을 결정하기 위해).
    // 이미 선택됐거나, 메시지에 명시됐거나, 배포 선택 답변이면 건너뛴다.
    // ─── 스택 선택: 앱 빌드 요청이면 항상 먼저 물어본다 ──────────────────────────
    // (디렉토리에 package.json이 남아있어도 건너뛰지 않음 — 이전 시도 파일과 혼동 방지)
    const hasExistingStack = (() => {
      try { return fs.existsSync(path.join(this.cwd, "package.json")); } catch { return false; }
    })();
    if (appBuild && !this.selectedStack && !this.pendingStackChoice) {
      const existingNote = hasExistingStack ? "  0. **현재 방식 유지** — 이미 만들어진 서비스 구조를 그대로 사용\n" : "";
      const q =
        "어떤 종류의 서비스로 만들까요?\n\n" +
        existingNote +
        "  1. **일반적인 웹 서비스** ✦ 빠르고 유연하게 시작 (추천)\n" +
        "  2. **검색에 잘 노출되는 서비스** — 검색 결과 노출이 중요할 때\n" +
        "  3. **기존 Vue 방식 유지** — 기존 작업이 Vue일 때\n" +
        "  4. **많은 요청을 처리하는 서비스** — 동시 사용자가 많을 때\n" +
        "  5. **알아서 선택** — 요청에 가장 적합한 방식으로\n\n" +
        "번호나 이름으로 답해 주세요.";
      this.pendingStackChoice = true;
      this.messages.push({ role: "user", content: userMessage });
      this.messages.push({ role: "assistant", content: q });
      yield { type: "text", content: q };
      yield { type: "done" };
      return;
    }
    if (this.pendingStackChoice) {
      const answer = userMessage.trim().toLowerCase();
      const stackMap: Record<string, string> = {
        "0": "existing", 현재: "existing", 유지: "existing", 기존: "existing",
        "1": "react-vite-express", react: "react-vite-express", vite: "react-vite-express", express: "react-vite-express",
        "2": "nextjs", next: "nextjs", nextjs: "nextjs", "next.js": "nextjs",
        "3": "vue-vite-express", vue: "vue-vite-express",
        "4": "react-vite-fastify", fastify: "react-vite-fastify",
        "5": "auto", 알아서: "auto",
      };
      const picked = Object.entries(stackMap).find(([k]) => answer.startsWith(k))?.[1];
      this.selectedStack = picked ?? "auto";
      this.pendingStackChoice = false;
      if (appBuild) this.applicationActive = true;

      // 스택 선택 직후 배포 환경도 바로 물어본다 — DB 종류가 달라지므로 먼저 알아야 한다.
      // SQLite는 로컬 전용이며 대부분 배포 환경에서 사용 불가.
      if (this.selectedStack !== "existing" && !this.selectedDeployTarget) {
        const dq =
          "서비스를 어디에서 사용할까요?\n\n" +
          "  1. **내 컴퓨터에서 먼저 사용** ✦ 빠르게 확인하고 나중에 온라인 전환\n" +
          "  2. **간편하게 인터넷에 공개** — 빠른 시작 추천\n" +
          "  3. **검색 노출 중심으로 인터넷에 공개**\n" +
          "  4. **여러 지역에서 안정적으로 운영**\n" +
          "  5. **회사 서버에서 직접 운영**\n\n" +
          "번호로 답해 주세요.";
        this.pendingDeployChoice = true;
        this.messages.push({ role: "user", content: userMessage });
        this.messages.push({ role: "assistant", content: dq });
        yield { type: "text", content: dq };
        yield { type: "done" };
        return;
      }
    }

    if (appBuild && !this.selectedDeployTarget) {
      const explicitTarget = detectDeployTarget(userMessage);
      if (explicitTarget) {
        this.selectedDeployTarget = explicitTarget;
      } else {
        // 배포 환경 미선택 — 기본값은 Railway(PostgreSQL). SQLite 금지.
        this.selectedDeployTarget = "railway";
      }
    } else if (this.pendingDeployChoice && !appBuild) {
      // 배포 선택 대기 중 답변 처리
      const answer = userMessage.trim().toLowerCase();
      const targetMap: Record<string, string> = {
        "1": "local", 로컬: "local", 개발용: "local",
        "2": "railway", railway: "railway",
        "3": "vercel", vercel: "vercel",
        "4": "fly", flyio: "fly",
        "5": "aws", "6": "vps", ec2: "aws", ecs: "aws", vps: "vps", ubuntu: "vps",
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
    // 명시적으로 지정된 시스템만 우선 적용한다.
    // 대시보드 요청(uiRequest)은 항상 물어본다 — config.designSystem 기본값으로 자동 선택 금지.
    // (앱 빌드의 applicationUiRequest 는 선택된 시스템을 유지해도 됨)
    if (!requestedSystem && applicationUiRequest && !uiRequest && hasDesignSystem(this.config.designSystem)) {
      requestedSystem = this.config.designSystem;
    }
    if (uiRequest && !requestedSystem) {
      this.pendingDesignChoice = true;
      const q = "이 대시보드/리포트에 사용할 디자인 시스템을 선택해 주세요:\n\n  1. **BCAVE** ✦ 자사 브랜드 · 모노톤 슬레이트 (기본/공식)\n  2. **AXIS** — 밝은 코발트 · 모던 프로페셔널\n\n번호로 답해 주세요.";
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
          "동일 축에는 동일 단위만 사용하고 고객 수 단위는 '명'이다. 주입 데이터의 행은 배열이 아니라 컬럼명 키를 가진 객체이므로 r[0] 같은 숫자 인덱스를 쓰지 않고 r['컬럼명']으로 읽는다. 데이터는 이미 정리되어 있으므로 헤더 제거 목적으로 .slice(1), .slice(3)을 쓰지 않는다. 원본의 모든 시트와 주요 컬럼을 화면 구성 전에 목록화하고, 사용하지 않는 데이터가 있다면 의도적으로 제외한 이유를 설명할 수 있어야 한다. 완료 전 write_file 결과가 반드시 검토 통과여야 하며 실패/경고를 성공으로 간주하지 않는다. 완료 응답은 파일명과 검증 통과만 간결히 쓴다.",
      );
    }
    if (appBuild || this.applicationActive) {
      const deployTarget = this.selectedDeployTarget || "local";
      const deployGuide = ConversationManager.deployStackGuide(deployTarget);
      // 스택 선택 결과를 스택 가이드로 변환
      const stackGuide = (() => {
        const s = this.selectedStack;
        if (!s || s === "auto") return "";
        if (s === "nextjs") return "\n[선택된 스택: Next.js 풀스택] — Next.js App Router + API Routes + TypeScript. npm create next-app@latest으로 시작. 인증은 NextAuth.js 또는 직접 JWT.";
        if (s === "vue-vite-express") return "\n[선택된 스택: Vue 3 + Vite + Express] — 프론트: Vue 3 + Vite + Vue Router + Pinia. 백엔드: Express + TypeScript.";
        if (s === "react-vite-fastify") return "\n[선택된 스택: React + Vite + Fastify] — 프론트: React + Vite + React Router. 백엔드: Fastify + TypeScript.";
        return "\n[선택된 스택: React + Vite + Express] — 프론트: React + Vite + React Router + Tailwind CSS + shadcn/ui. 백엔드: Express + TypeScript.";
      })();
      this.replaceSystemContext("[APPLICATION_CONTEXT]",
          "[APPLICATION_CONTEXT]\n이 요청은 실제로 동작하는 서비스/애플리케이션이다. 정적 HTML 파일 몇 개로 끝내지 말 것.\n\n" +
          deployGuide + stackGuide + "\n\n" +
          "공통 규칙:\n" +
          "- 프론트엔드 스타일: Tailwind CSS + shadcn/ui (shadcn 없으면 Tailwind 유틸리티, 임의 hex/inline style 금지)\n" +
          "- 프론트엔드: API를 fetch로 호출해 실제 데이터 렌더 (정적 더미데이터 금지)\n" +
          "- 데이터·사용자·상태·CRUD·인증은 반드시 서버에서 처리 (프론트 하드코딩·localStorage·가짜 배열 금지)\n" +
          "- 구조: package.json, 폴더 구조, 서버·라우트·데이터 계층 분리\n" +
          "- Prisma ORM 사용 시 .env에 DATABASE_URL 설정, `prisma migrate dev`로 스키마 관리\n" +
          "- .env.example에 필요한 환경변수를 모두 나열 (실제 값은 .env에, .gitignore에 포함)\n" +
          "- README에 실행 방법, 환경변수 설정, 배포 방법 포함\n" +
          "- 완료 전 GET /api/health 가 2xx JSON을 반환해야 하며, 실제 dev/start 서버 기동과 API 호출 검증을 반드시 통과해야 함\n" +
          "- 기존 저장소에 스택이 있으면 그대로 따른다\n" +
          "- 단일 인라인 HTML 규칙 적용 안 됨 (정상적인 다중 파일 프로젝트)");
    }
    // B) 계획 먼저 + 완료 기준 명시: 실질적 개발 작업은 작게 쪼개되, 반드시 실제로 연결까지 확인한다.
    if (appBuild || classifyTask(userMessage) === "heavy") {
      this.replaceSystemContext("[DEV]",
          "[DEV] 계획은 내부적으로 세우되 채팅에 출력하지 않는다.\n" +
          "작업: 한 번에 한 파일씩 구현 → build/typecheck 확인 → 연결 검증(route/import/fetch).\n" +
          "연결 검증: 새 파일은 반드시 router/nav/server에 등록됐는지 직접 확인 후 완료 처리.\n" +
          "UI: 44px 터치, 4.5:1 대비, 인라인 에러, 반응형.\n" +
          "완료 응답: 만든 파일 목록 + '실행할까요?' 한 줄. 설명·계획·재언급 금지.\n" +
          "실행 요청 시: dev 서버 직접 기동 → URL 확인 → '배포할까요?' 한 줄.]");
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
    // 검증 단계별 재시도 횟수를 분리한다. 앞 단계 오류가 뒤 단계의 수정 기회를 소진하면 안 된다.
    let buildRepairRounds = 0;
    let schemaRepairRounds = 0;
    let proxyRepairRounds = 0;
    let completenessRepairRounds = 0;
    let smokeRepairRounds = 0;
    let artifactValidationPending = false;
    let artifactRepairRounds = 0;
    const executionRequested = /(실행해|실행시켜|서버.{0,8}(?:켜|띄워|실행)|(?:^|\s)(?:run|start)(?:\s|$))/i.test(userMessage);
    let runtimeStartAttempted = false;
    let runtimeStartVerified = false;
    let runtimeStartUrl = "";
    let runtimeStartFailure = "";
    let runtimeRepairRounds = 0;

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
        let currentTextYielded = false;
        const hasNoToolCalls = !message.tool_calls || message.tool_calls.length === 0;
        const modelIsTryingToFinishPendingArtifact = artifactValidationPending &&
          hasNoToolCalls;
        const modelIsTryingToReportRuntime = executionRequested &&
          hasNoToolCalls;
        const modelIsTryingToFinishUnverifiedCode = codeTouched && hasNoToolCalls &&
          (verifyCmds.length > 0 || (this.applicationActive && this.config.autoVerify));
        if (text && text !== lastText && !modelIsTryingToFinishPendingArtifact && !modelIsTryingToReportRuntime && !modelIsTryingToFinishUnverifiedCode) {
          lastText = text;
          currentTextYielded = true;
          yield { type: "text", content: message.content as string };
        }

        if (!message.tool_calls || message.tool_calls.length === 0) {
          // 실행 요청은 shell_exec가 실제 HTTP 응답을 확인한 경우에만 완료할 수 있다.
          if (executionRequested && !runtimeStartVerified && !signal?.aborted) {
            if (runtimeRepairRounds >= this.config.maxVerifyRounds) {
              const detail = runtimeStartFailure || "개발 서버 실행 도구를 호출하지 않았거나 실제 HTTP 응답을 확인하지 못했습니다.";
              yield { type: "error", message: `서버 실행을 확인하지 못해 완료 처리하지 않았습니다.\n${detail}` };
              return;
            }
            runtimeRepairRounds++;
            this.messages.push({ role: "assistant", content: message.content ?? "" });
            this.messages.push({
              role: "user",
              content:
                `[실행 완료 차단] 실제 서버 HTTP 응답이 확인되지 않았습니다. 성공 URL을 추정하거나 "실행되었습니다"라고 말하지 마세요. ` +
                `로그 원인을 수정한 뒤 dev/start 명령을 다시 실행하고, shell_exec 결과가 [SERVER_STARTED]일 때만 완료하세요.\n\n` +
                (runtimeStartFailure || (runtimeStartAttempted ? "서버 시작 검증 실패" : "아직 서버 실행 명령을 호출하지 않음")),
            });
            lastText = "";
            continue;
          }
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
          if (verifyCmds.length && codeTouched && !signal?.aborted) {
            yield { type: "verify", status: "run", cmd: verifyCmds.join(" && ") };
            const fail = runVerify(verifyCmds, this.cwd);
            if (fail) {
              if (buildRepairRounds >= this.config.maxVerifyRounds) {
                yield { type: "error", message: `빌드/타입 검증에 실패해 완료 처리하지 않았습니다.\n${fail.output}` };
                return;
              }
              buildRepairRounds++;
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
          // A-1.5a) SQLite 스키마-INSERT 불일치 검증:
          // CREATE TABLE IF NOT EXISTS 는 기존 테이블이 있으면 건너뜀 → 컬럼 추가 시 INSERT 실패.
          // 서버 코드에서 INSERT 컬럼이 CREATE TABLE 컬럼과 일치하는지 정적 분석으로 확인.
          if (this.applicationActive && this.config.autoVerify && codeTouched) {
            const serverDir = [path.join(this.cwd, "server"), path.join(this.cwd, "src/server"), this.cwd]
              .find(d => fs.existsSync(d) && fs.statSync(d).isDirectory()) ?? this.cwd;
            const serverFiles = fs.readdirSync(serverDir).filter(f => /\.(ts|js)$/.test(f) && !f.includes(".test."));
            const schemaIssues: string[] = [];
            for (const sf of serverFiles) {
              const code = fs.readFileSync(path.join(serverDir, sf), "utf8");
              // CREATE TABLE 에서 컬럼 목록 추출
              const tableMatches = [...code.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)\s*\(([^;]+?)\)/gi)];
              for (const tm of tableMatches) {
                const tableName = tm[1];
                const colDefs = tm[2];
                const cols = new Set(
                  [...colDefs.matchAll(/^\s*(\w+)\s+\w/gm)].map(m => m[1].toLowerCase())
                    .filter(c => !["primary", "foreign", "unique", "check"].includes(c))
                );
                // INSERT 컬럼 목록과 대조
                const insertRe = new RegExp(`INSERT INTO ${tableName}\\s*\\(([^)]+)\\)`, "gi");
                for (const im of code.matchAll(insertRe)) {
                  const insertCols = im[1].split(",").map(c => c.trim().toLowerCase().replace(/['"]/g, ""));
                  const missing = insertCols.filter(c => !cols.has(c));
                  if (missing.length) {
                    schemaIssues.push(`${sf}: INSERT INTO ${tableName} 에 없는 컬럼 → ${missing.join(", ")}. CREATE TABLE 에 해당 컬럼을 추가하거나 INSERT 에서 제거하세요.`);
                  }
                }
              }
            }
            if (schemaIssues.length > 0) {
              if (schemaRepairRounds >= this.config.maxVerifyRounds) {
                yield { type: "error", message: `DB 스키마 검증에 실패해 완료 처리하지 않았습니다.\n${schemaIssues.join("\n")}` };
                return;
              }
              schemaRepairRounds++;
              codeTouched = false;
              const detail = `[DB 스키마-INSERT 불일치]\n${schemaIssues.join("\n")}\n\n주의: CREATE TABLE IF NOT EXISTS 는 기존 테이블을 수정하지 않습니다. 컬럼 추가 시 DB 파일을 삭제하거나 ALTER TABLE ADD COLUMN 을 추가해야 합니다.`;
              this.messages.push({ role: "assistant", content: message.content ?? "" });
              this.messages.push({ role: "user", content: detail });
              yield { type: "verify", status: "fail", cmd: "DB 스키마 검증", detail };
              lastText = "";
              continue;
            }
          }
          // A-1.5b) Vite 프록시 설정 검증: 프론트(Vite)와 백엔드(Express 등)가 분리된 구조에서
          //   vite.config.ts 에 /api 프록시가 없으면 프론트의 fetch('/api/...') 가 백엔드로 안 가고
          //   "Unexpected end of JSON" / CORS 오류가 난다.
          if (this.applicationActive && this.config.autoVerify && codeTouched) {
            const viteConfig = path.join(this.cwd, "vite.config.ts");
            const viteConfigJs = path.join(this.cwd, "vite.config.js");
            const viteCfgPath = fs.existsSync(viteConfig) ? viteConfig : fs.existsSync(viteConfigJs) ? viteConfigJs : null;
            if (viteCfgPath) {
              const viteCfg = fs.readFileSync(viteCfgPath, "utf8");
              const hasBackend = fs.existsSync(path.join(this.cwd, "server")) || fs.existsSync(path.join(this.cwd, "src/server"));
              const hasProxy = /proxy\s*:\s*\{/.test(viteCfg);
              const fetchesApi = (() => {
                try {
                  const src = path.join(this.cwd, "src");
                  const files = fs.readdirSync(src).filter(f => /\.(ts|tsx|js|jsx)$/.test(f));
                  return files.some(f => fs.readFileSync(path.join(src, f), "utf8").includes("fetch('/api"));
                } catch { return false; }
              })();
              if (hasBackend && fetchesApi && !hasProxy) {
                if (proxyRepairRounds >= this.config.maxVerifyRounds) {
                  yield { type: "error", message: "Vite /api 프록시 검증에 실패해 완료 처리하지 않았습니다." };
                  return;
                }
                proxyRepairRounds++;
                codeTouched = false;
                const issue = `[Vite 프록시 누락] 프론트(Vite)에서 fetch('/api/...')를 호출하지만 vite.config.ts 에 proxy 설정이 없습니다.\nVite 개발 서버(5173)는 /api 요청을 백엔드(예: 3001)로 전달하지 않아 "Failed to fetch" / "Unexpected end of JSON" 오류가 발생합니다.\n\n${viteCfgPath} 에 다음을 추가하세요:\nserver: { proxy: { '/api': { target: 'http://localhost:3001', changeOrigin: true } } }`;
                this.messages.push({ role: "assistant", content: message.content ?? "" });
                this.messages.push({ role: "user", content: issue });
                yield { type: "verify", status: "fail", cmd: "Vite proxy 검증", detail: issue };
                lastText = "";
                continue;
              }
            }
          }
          // A-1.5c) 화면 완성도 검사: 보이기만 하고 동작하지 않는 메뉴, 고정 지표,
          // 문서의 과장된 CRUD 주장을 완료 전에 차단한다.
          if (this.applicationActive && this.config.autoVerify && codeTouched) {
            const completenessIssues = auditAppCompleteness(this.cwd);
            if (completenessIssues.length > 0) {
              if (completenessRepairRounds >= this.config.maxVerifyRounds) {
                yield { type: "error", message: `화면 기능 연결 확인에 실패해 완료 처리하지 않았습니다.\n${completenessIssues.join("\n")}` };
                return;
              }
              completenessRepairRounds++;
              codeTouched = false;
              const detail = `[화면 완성도 확인 실패]\n${completenessIssues.map((issue) => `- ${issue}`).join("\n")}\n\n화면에 보이는 모든 메뉴·버튼·지표를 실제 기능/데이터에 연결하세요. 구현하지 않을 항목은 클릭 가능한 UI와 완성 주장 모두에서 제거하세요.`;
              this.messages.push({ role: "assistant", content: message.content ?? "" });
              this.messages.push({ role: "user", content: detail });
              yield { type: "verify", status: "fail", cmd: "화면 기능 연결 확인", detail };
              lastText = "";
              continue;
            }
            yield { type: "verify", status: "pass", cmd: "화면 기능 연결 확인" };
          }
          // A-2) 앱이면 서버를 실제로 띄워 HTTP 응답(헬스체크)까지 확인. 실패 시 로그를 되먹여 고친다.
          if (this.applicationActive && this.config.autoVerify && this.config.smokeTest && codeTouched && !signal?.aborted) {
            yield { type: "verify", status: "run", cmd: "서버 실행 헬스체크(스모크)" };
            const smoke = await smokeTest(this.cwd, signal);
            if (!smoke.ok) {
              if (smokeRepairRounds >= this.config.maxVerifyRounds) {
                yield { type: "error", message: `서비스 실행 검증에 실패해 완료 처리하지 않았습니다.\n${smoke.detail}` };
                return;
              }
              smokeRepairRounds++;
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
          if (executionRequested && runtimeStartVerified) {
            const confirmed = `실행 확인됨: ${runtimeStartUrl}`;
            this.messages.push({ role: "assistant", content: confirmed });
            yield { type: "text", content: confirmed };
          } else {
            if (text && !currentTextYielded) {
              lastText = text;
              yield { type: "text", content: message.content as string };
            }
            this.messages.push({ role: "assistant", content: message.content ?? "" });
          }
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
          if (name === "shell_exec" && isDevServerCommand(String(args.command ?? ""))) {
            runtimeStartAttempted = true;
            if (result.startsWith("[SERVER_STARTED]")) {
              runtimeStartVerified = true;
              runtimeStartFailure = "";
              runtimeStartUrl = result.match(/https?:\/\/[^\s]+/)?.[0] ?? "(확인된 URL 없음)";
            } else {
              runtimeStartVerified = false;
              runtimeStartFailure = result;
            }
          }
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
