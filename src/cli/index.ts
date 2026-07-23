#!/usr/bin/env node
import chalk from "chalk";
import readline from "node:readline";
import { loadConfig, saveConfig, isLoggedIn } from "../config/config.js";
import { ConversationManager, type AgentEvent, type ToolCallRequest } from "../agent/conversation.js";
import { PermissionManager, type PermissionMode } from "../agent/permissions.js";
import type { BcaveConfig } from "../config/config.js";
import { hubUsage } from "../auth/hub.js";
import { listSessions, loadSession } from "../session/store.js";
import fs from "node:fs";
import os from "node:os";
import nodePath from "node:path";
import { detectDesignSystemFromArtifact, designSystemNames, hasDesignSystem, lintDesignArtifact } from "../design-system/runtime.js";
import { collectDoctorChecks, doctorExitCode } from "./doctor.js";
import { hasRemoteUpdate, relaunchUpdatedCli, resolveInstallDir, runSafeUpdate } from "./updater.js";
import { friendlyErrorMessage, friendlyVerifyLabel, formatDuration as fmtDuration, readlineAnsi as rlWrap, shortenPath, toolResultLine, toolStatus } from "./rendering.js";
import { homeRelativePath as homeShort, messageText as msgText, relativeTime as relTime } from "./session-format.js";
import { askHidden, askVisible, type AuthInputOptions } from "./auth-input.js";
import { parseSlashCommand } from "./slash-command.js";
import { authenticate, endSession } from "./auth-service.js";
import { settingsAction } from "./settings-command.js";
import { SessionController } from "./session-controller.js";
import { resetConfig } from "./reset-service.js";
import { deployChoices } from "./deploy-catalog.js";
import { availableModels } from "./model-service.js";
import { usageRows } from "./usage-format.js";
import { showTerminalSelector, type SelectorItem } from "./terminal-selector.js";
import { createBracketedPasteWriter, globalKeyAction } from "./terminal-input.js";
import { WorkSession } from "./work-session.js";
import { CLI_COMMANDS } from "./commands.js";
import { BCAVE_VERSION } from "../version.js";
import { SessionModeRunner } from "./session-mode.js";

// ─── CLI Args ──────────────────────────────────────────
const args = process.argv.slice(2);
type CliMode = PermissionMode | "session";
let mode: CliMode = "auto-approve"; // 기본: Auto mode (카테고리별 자동 승인)
let initialPrompt: string | undefined;

const modelIdx = args.indexOf("--model");
let modelOverride: string | undefined;
if (modelIdx !== -1 && args[modelIdx + 1]) {
  modelOverride = args[modelIdx + 1];
}

const hubIdx = args.indexOf("--hub-url");
if (hubIdx !== -1 && args[hubIdx + 1]) {
  saveConfig({ hubUrl: args[hubIdx + 1] });
}

if (args.includes("--session-mode")) {
  mode = "session";
} else if (args.includes("--dangerously-skip-permissions")) {
  mode = "yolo";
} else if (args.includes("--safe")) {
  mode = "safe";
} else if (args.includes("--auto-approve")) {
  mode = "auto-approve";
}

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
  ${chalk.cyan.bold("BCAVE CODE")} — 사내 AI 코딩 에이전트 (HUB 로그인)

  ${chalk.bold("Usage")}
    $ bcave [prompt]

  ${chalk.bold("Commands")}
    login                              사내 계정으로 로그인
    logout                             로그아웃
    update                             최신 버전으로 업데이트
    doctor                             설치 및 실행 환경 진단
    design use bcave                   UI/대시보드 디자인 시스템 활성화
    design lint <file> [--system name] 생성된 HTML 디자인 규칙 검사

  ${chalk.bold("Options")}
    --hub-url <url>                    HUB 주소 지정 (예: http://hub.bcave.internal)
    --model <model>                    모델 변경 (기본: gpt-5.5)
    --safe                             Safe mode (모든 작업 전 확인)
    --auto-approve                     Auto mode: 카테고리별 자동 승인 (기본값)
    --dangerously-skip-permissions     모든 권한 확인 건너뛰기
    --session-mode                     시연용 사전 준비 모드 (LLM·로그인 미사용)
`);
  process.exit(0);
}

const nonFlagArgs = args.filter((a, i) => {
  if (a.startsWith("--")) return false;
  const prev = args[i - 1];
  if (prev === "--model" || prev === "--hub-url") return false;
  return true;
});

// 서브커맨드: `bcave login` / `bcave logout` / `bcave update`
let subcommand: "login" | "logout" | "update" | "design" | "doctor" | null = null;
if (["login", "logout", "update", "design", "doctor"].includes(nonFlagArgs[0])) {
  subcommand = nonFlagArgs.shift() as "login" | "logout" | "update" | "design" | "doctor";
}
const designArgs = subcommand === "design" ? nonFlagArgs.splice(0) : [];
if (nonFlagArgs.length > 0) {
  initialPrompt = nonFlagArgs.join(" ");
}

// ─── Mode ──────────────────────────────────────────────
const MODE_ORDER: CliMode[] = ["safe", "auto-approve", "session", "yolo"];
const MODE_INFO: Record<CliMode, { label: string; color: (s: string) => string; desc: string }> = {
  safe: { label: "Safe mode", color: chalk.green, desc: "모든 작업 전 확인" },
  "auto-approve": { label: "Auto mode", color: chalk.yellow, desc: "카테고리별 자동 승인" },
  yolo: { label: "Yolo mode", color: chalk.red, desc: "확인 없이 실행" },
  session: { label: "Session mode", color: chalk.magenta, desc: "사전 준비 시연 · LLM 미사용" },
};

function cycleMode(): void {
  const idx = MODE_ORDER.indexOf(mode);
  mode = MODE_ORDER[(idx + 1) % MODE_ORDER.length];
  rebuildCM();
  process.stdout.write("\r\x1b[2K");
}

// ─── Slash Commands ────────────────────────────────────
// Interactive selector helper — used for both commands and models
let selectorActive = false;
// 로그인 비밀번호 등 민감 입력 중에는 전역 keypress 핸들러(/, Shift+Tab)를 비활성화
let authInputActive = false;

async function showSelector(items: SelectorItem[], initialIndex = 0): Promise<number> {
  return showTerminalSelector(items, {
    input: process.stdin,
    output: process.stdout,
    pause: () => rl.pause(),
    resume: () => rl.resume(),
    resetLine: () => {
      const state = rl as unknown as { line: string; cursor: number };
      state.line = "";
      state.cursor = 0;
    },
    setActive: (active) => { selectorActive = active; },
  }, initialIndex);
}

async function selectCommand(): Promise<string | null> {
  const items = CLI_COMMANDS.map((c) => ({
    label: `${c.name.padEnd(14)}${c.desc}`,
    dimLabel: `${c.name.padEnd(14)}${c.desc}`,
  }));
  const idx = await showSelector(items);
  if (idx < 0) return null;
  return CLI_COMMANDS[idx].name;
}

// ─── Readline ──────────────────────────────────────────
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true,
});

// ── 브라케티드 페이스트 모드 ────────────────────────────────────────────────
// 붙여넣기 시 \n 이 Enter 로 해석되어 즉시 전송되는 문제를 방지한다.
// 터미널에 \x1b[?2004h 를 보내면 붙여넣기 구간을 \x1b[200~ ... \x1b[201~ 로 감싸 전달한다.
// readline._normalWrite 를 패치해 구간 내 \r/\n 을 공백으로 치환한 뒤 한 번에 전달한다.
if (process.stdout.isTTY) {
  process.stdout.write("\x1b[?2004h"); // 브라케티드 페이스트 활성화
  process.on("exit", () => { try { process.stdout.write("\x1b[?2004l"); } catch { /* noop */ } });
}
const _rlAny = rl as unknown as { _normalWrite?: (buffer: Buffer) => void };
const _origWrite = _rlAny._normalWrite?.bind(rl);
if (_origWrite) _rlAny._normalWrite = createBracketedPasteWriter(_origWrite);

// Shift+Tab: mode cycle
process.stdin.on("keypress", (str: string, key: readline.Key) => {
  const rlState = rl as unknown as { line: string; cursor: number; _refreshLine?: () => void };
  const action = globalKeyAction(str, key, selectorActive || authInputActive || workSession.processing, rlState.line ?? "");
  if (action === "cycle-mode") {
    process.stdout.write("\r\x1b[2K");
    cycleMode();
    setImmediate(() => {
      (rl as unknown as { line: string }).line = "";
      rl.write("\n");
    });
    return;
  }
  // ESC: 현재 입력 전체 지우기 (작업 중 아닐 때)
  // — 딜리트 키로 한 자씩 지우는 불편함을 해소
  if (action === "clear-line") {
    if (rlState.line && rlState.line.length > 0) {
      rlState.line = "";
      rlState.cursor = 0;
      process.stdout.write("\r\x1b[2K");
      rlState._refreshLine?.();
    }
    return;
  }
});

// "/" typed → close current question, then open command selector
let pendingCommandSelector = false;

process.stdin.on("keypress", (str: string) => {
  if (str === "/") {
    setImmediate(() => {
      const line = (rl as unknown as { line: string }).line ?? "";
      if (globalKeyAction(str, undefined, selectorActive || authInputActive || workSession.processing, line) === "open-command") {
        pendingCommandSelector = true;
        // Clear visual line and submit empty to close current rl.question
        process.stdout.write("\r\x1b[2K");
        (rl as unknown as { line: string }).line = "";
        rl.write("\n");
      }
    });
  }
});

function getTermWidth(): number {
  return process.stdout.columns || 80;
}

/** 현재 디렉토리를 안전하게 반환. 삭제된 경우 홈 디렉토리로 폴백. */
function safeCwd(): string {
  try { return process.cwd(); } catch { return os.homedir(); }
}

/** 터미널 폭을 고려해 경로를 짧게 줄인다. 홈은 ~로, 긴 경로는 끝 2단계만 표시. */
function shortPath(p: string): string {
  return shortenPath(p, MODE_INFO[mode].label, getTermWidth(), os.homedir());
}

function prompt(): void {
  const modeInfo = MODE_INFO[mode];
  const modeTag = rlWrap(modeInfo.color(modeInfo.label));
  const cwd = shortPath(safeCwd());
  const separator = chalk.dim("─".repeat(getTermWidth()));
  console.log(separator);
  // rlWrap 으로 ANSI 코드를 비표시 영역으로 표시 → readline 이 폭을 정확히 계산
  rl.question(`${modeTag} ${rlWrap(chalk.dim(cwd))} ${rlWrap(chalk.bold(">"))} `, (answer) => {
    handleInput(answer);
  });
}

const workSession = new WorkSession({
  input: process.stdin,
  output: process.stdout,
  pause: () => rl.pause(),
  resume: () => rl.resume(),
});

// 권한 확인 — 방향키(↑↓)·숫자·Enter 로 선택 (Esc=아니오)
async function askYesNo(): Promise<boolean> {
  console.log("  " + chalk.dim("실행할까요?"));
  const idx = await showSelector(
    [
      { label: "예", dimLabel: "예" },
      { label: "아니오", dimLabel: "아니오" },
    ],
    0,
  );
  return idx === 0; // Esc(-1) → 아니오
}

async function askYesAlwaysNo(): Promise<"yes" | "always" | "no"> {
  console.log("  " + chalk.dim("실행할까요?"));
  const idx = await showSelector(
    [
      { label: "예 (한 번 실행)", dimLabel: "예 (한 번 실행)" },
      { label: "항상 허용 (이 종류는 자동 승인)", dimLabel: "항상 허용 (이 종류는 자동 승인)" },
      { label: "아니오", dimLabel: "아니오" },
    ],
    0,
  );
  if (idx === 1) return "always";
  if (idx < 0 || idx === 2) return "no";
  return "yes";
}

// ─── State ─────────────────────────────────────────────
let config = loadConfig();
if (modelOverride) config.model = modelOverride;
let cm: ConversationManager | SessionModeRunner | null = null;

function rebuildCM(): void {
  if (mode === "session") {
    cm = new SessionModeRunner(safeCwd());
    return;
  }
  const pm = new PermissionManager(mode);
  cm = new ConversationManager(config, pm, safeCwd());
}

// ─── 세션(대화) 저장/복원 ───────────────────────────────
const sessionController = new SessionController();

/** 한 턴 끝날 때마다 현재 대화를 세션 파일로 저장한다. */
function persistSession(userMsg: string): void {
  if (!cm || mode === "session") return;
  sessionController.persist(userMsg, safeCwd(), cm.getHistory());
}

// /resume — 이전 세션을 골라 다시 연다
async function resumeCommand(): Promise<void> {
  if (!cm) {
    console.log(chalk.dim("  로그인이 필요합니다. /login 후 다시 시도하세요."));
    return;
  }
  const sessions = listSessions();
  if (sessions.length === 0) {
    console.log(chalk.dim("  저장된 세션이 없습니다."));
    return;
  }
  console.log("");
  console.log("  " + chalk.bold("이전 세션 다시 열기"));
  const items = sessions.map((s) => {
    const meta = chalk.dim(`· ${relTime(s.updatedAt)} · ${s.turns}턴 · ${homeShort(s.cwd)}`);
    const label = `${s.title || "(제목 없음)"}  ${meta}`;
    return { label, dimLabel: `${s.title} · ${relTime(s.updatedAt)}` };
  });
  const idx = await showSelector(items);
  if (idx < 0) {
    console.log(chalk.dim("  취소했습니다."));
    return;
  }
  const s = loadSession(sessions[idx].id);
  if (!s) {
    console.log(chalk.red("  세션을 불러오지 못했습니다."));
    return;
  }
  cm.loadHistory(s.messages);
  // 이후 저장이 이 세션을 이어서 갱신하도록 포인터 전환
  sessionController.restore(s);
  console.log("  " + chalk.green("✓ 세션 복원: ") + (s.title || "(제목 없음)") + chalk.dim(`  (${s.turns}턴 · ${relTime(s.updatedAt)})`));
  // 마지막 사용자/어시스턴트 대화를 짧게 리캡
  const lastUser = [...s.messages].reverse().find((m) => m.role === "user");
  const lastAsst = [...s.messages].reverse().find((m) => m.role === "assistant" && msgText(m).trim());
  if (lastUser) console.log("  " + chalk.dim("· 나: ") + chalk.dim(msgText(lastUser).replace(/\s+/g, " ").slice(0, 100)));
  if (lastAsst) console.log("  " + chalk.dim("· AI: ") + chalk.dim(msgText(lastAsst).replace(/\s+/g, " ").slice(0, 100)));
  console.log("  " + chalk.dim("이어서 입력하면 이 대화가 계속됩니다."));
}

async function selectModel(): Promise<void> {
  console.log(chalk.bold("  Select Model"));
  console.log("");

  // 로그인 상태면 HUB 에서 "내가 쓸 수 있는 모델"을 받아온다 (RBAC 반영)
  const available = await availableModels(config);
  const models = available.models;
  if (available.usedFallback && isLoggedIn(config)) console.log(chalk.dim("  (HUB 모델 목록을 못 받아 기본 목록을 표시합니다)"));

  const initialIdx = Math.max(0, models.findIndex((m) => m.id === config.model));
  const items = models.map((m, i) => {
    const current = m.id === config.model ? " (current)" : "";
    return {
      label: `${(i + 1)}. ${chalk.bold(m.id)}${current}  ${chalk.dim(m.description)}`,
      dimLabel: `${(i + 1)}. ${m.id}${current}  ${m.description}`,
    };
  });
  const idx = await showSelector(items, initialIdx);
  if (idx >= 0) {
    const chosen = models[idx];
    saveConfig({ model: chosen.id });
    config = loadConfig();
    rebuildCM();
    console.log(chalk.green(`  ✓ model → ${chalk.bold(chosen.id)}`));
  }
}

async function showUsage(): Promise<void> {
  if (!isLoggedIn(config)) {
    console.log(chalk.dim("  로그인이 필요합니다. /login 하세요."));
    return;
  }
  console.log("");
  try {
    const u = await hubUsage(config.hubUrl, config.accessToken);
    if (!u.hasAccess) {
      console.log(chalk.yellow("  BCAVE_CODE 사용 권한이 없습니다 (관리자 승인 대기)."));
      console.log("");
      return;
    }
    console.log(chalk.bold(`  사용량`) + chalk.dim(`  ·  등급: ${u.tierName ?? u.role ?? "-"}`));
    console.log("");
    for (const row of usageRows(u)) {
      console.log(
        "  " + chalk.cyan(row.label.padEnd(7)) +
        `${row.used} / ${row.limit}` + chalk.dim(row.percentage) +
        chalk.dim(`   · 리셋 ${row.reset}`)
      );
    }
    console.log("");
  } catch (err) {
    console.log(chalk.red(`  ✗ ${(err as Error).message}`));
    console.log("");
  }
}

// ─── HUB 로그인 ────────────────────────────────────────
/** 비밀번호 입력 (에코 숨김) */
function authInputOptions(): AuthInputOptions {
  return {
    input: process.stdin,
    output: process.stdout,
    question: (query, callback) => rl.question(query, callback),
    setActive: (active) => { authInputActive = active; },
    onInterrupt: () => process.exit(0),
  };
}

function askPassword(query: string): Promise<string> {
  return askHidden(query, authInputOptions());
}

function askLine(query: string): Promise<string> {
  return askVisible(query, authInputOptions());
}

/**
 * 사내 계정 로그인. 성공 시 토큰 저장 + CM 재생성.
 * cancellable=true 면 빈 이메일 입력으로 취소 가능.
 */
async function loginFlow(cancellable = false): Promise<boolean> {
  console.log("");
  console.log(chalk.bold("  사내 계정으로 로그인"));
  console.log(chalk.dim(`  HUB: ${config.hubUrl}`));
  if (cancellable) console.log(chalk.dim("  빈 이메일 입력으로 취소"));
  console.log("");

  while (true) {
    const email = (await askLine(chalk.dim("  이메일 > "))).trim();
    if (!email) {
      if (cancellable) {
        console.log(chalk.dim("  취소됨"));
        console.log("");
        return false;
      }
      continue;
    }
    const password = await askPassword(chalk.dim("  비밀번호 > "));
    if (!password) continue;

    process.stdout.write(chalk.dim("  로그인 중…"));
    try {
      const result = await authenticate(config, email, password);
      saveConfig(result.config);
      config = loadConfig();
      process.stdout.write("\r\x1b[2K");
      console.log(chalk.green(`  ✓ 로그인되었습니다: ${result.user.name} (${result.user.email})`));
      if (!result.hasCliAccess) {
        console.log(chalk.yellow("  ⚠ BCAVE_CODE 서비스 권한이 아직 없습니다. HUB 에서 신청 후 관리자 승인이 필요합니다."));
      }
      console.log("");
      rebuildCM();
      return true;
    } catch (err) {
      process.stdout.write("\r\x1b[2K");
      console.log(chalk.red(`  ✗ ${(err as Error).message}`));
      console.log("");
      // 재시도
    }
  }
}

async function doLogout(): Promise<void> {
  if (!isLoggedIn(config)) {
    console.log(chalk.dim("  로그인 상태가 아닙니다."));
    return;
  }
  saveConfig(await endSession(config));
  config = loadConfig();
  cm = null;
  console.log(chalk.green("  ✓ 로그아웃되었습니다."));
}

// ─── 버전 체크 / 업데이트 ──────────────────────────────
async function doUpdate(): Promise<boolean> {
  console.log("");
  try {
    console.log("  " + chalk.cyan("▸") + " 안전 업데이트를 시작합니다…");
    const result = runSafeUpdate(resolveInstallDir());
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`설치기가 종료 코드 ${result.status ?? "unknown"}로 끝났습니다.`);
    console.log("  " + chalk.green("✓ 최신 버전으로 업데이트했습니다."));
    console.log("");
    return true;
  } catch (e) {
    console.log("  " + chalk.red("✗ 업데이트 실패: ") + chalk.dim((e as Error).message.split("\n")[0]));
    console.log("  " + chalk.dim("  설치 명령을 다시 실행해 보세요."));
    console.log("");
    return false;
  }
}

/** 업데이트 후 방금 빌드된 CLI 를 새 프로세스로 자동 재실행(현재 프로세스는 옛 코드라 교체 필요). */
function relaunchUpdated(): never {
  console.log("  " + chalk.cyan("▸") + " bcave 를 다시 시작합니다…");
  console.log("");
  return relaunchUpdatedCli();
}

// ─── Command Handlers ──────────────────────────────────
function showHelp(): void {
  console.log("");
  console.log(chalk.bold("  Commands"));
  console.log("");
  for (const cmd of CLI_COMMANDS) {
    console.log("    " + chalk.cyan(cmd.name.padEnd(14)) + chalk.dim(cmd.desc));
  }
  console.log("    " + chalk.cyan("Shift+Tab".padEnd(14)) + chalk.dim("모드 전환"));
  console.log("    " + chalk.cyan("Tab".padEnd(14)) + chalk.dim("명령어 자동 완성"));
  console.log("    " + chalk.cyan("Ctrl+C".padEnd(14)) + chalk.dim("종료"));
  console.log("");
}

async function handleSlashCommand(text: string): Promise<boolean> {
  const parsed = parseSlashCommand(text);
  if (!parsed) return false;
  const trimmed = parsed.raw;
  const setting = settingsAction(parsed);

  if (trimmed === "/help") { showHelp(); return true; }

  if (trimmed === "/login") { await loginFlow(true); return true; }

  if (trimmed === "/logout") { await doLogout(); return true; }

  if (trimmed === "/usage") { await showUsage(); return true; }

  if (trimmed === "/reset") {
    resetConfig();
    console.log(chalk.green("  ✓ 설정 초기화 완료. 다시 시작해주세요."));
    process.exit(0);
  }

  if (setting?.kind === "model-auto") {
      saveConfig({ autoRoute: true });
      config = loadConfig();
      rebuildCM();
      console.log(chalk.green("  ✓ 자동 라우팅 ON") + chalk.dim(`  (개발/UI → ${config.modelHeavy} · 질문/연산 → ${config.modelLight})`));
    return true;
  }
  if (setting?.kind === "model-heavy" || setting?.kind === "model-light") {
    const patch = setting.kind === "model-heavy" ? { modelHeavy: setting.model } : { modelLight: setting.model };
    saveConfig(patch); config = loadConfig(); rebuildCM();
    console.log(chalk.green(`  ✓ ${setting.kind === "model-heavy" ? "개발/UI" : "질문/연산"} 모델 → ${setting.model}`));
    return true;
  }
  if (setting?.kind === "model-manual") {
      saveConfig({ model: setting.model, autoRoute: false });
      config = loadConfig();
      rebuildCM();
      console.log(chalk.green(`  ✓ model → ${setting.model}`) + chalk.dim("  (자동 라우팅 OFF — /model auto 로 복귀)"));
      return true;
  }
  if (setting?.kind === "model-select") {
    await selectModel();
    return true;
  }

  if (setting?.kind === "toggle" && setting.setting === "verify") {
    if (setting.value !== null) {
      saveConfig({ autoVerify: setting.value });
      config = loadConfig();
      rebuildCM();
      console.log(chalk.green(`  ✓ 완료 전 오류 자동 확인 ${setting.value ? "ON" : "OFF"}`));
    } else {
      console.log("  " + chalk.dim(`완료 전 오류 자동 확인: ${config.autoVerify ? "ON" : "OFF"}  ·  /verify on|off 로 전환`));
    }
    return true;
  }



  if (trimmed === "/deploy") {
    const deployItems = deployChoices();
    console.log("\n  " + chalk.bold("서비스를 어디에서 사용할까요?") + chalk.dim("  (↑↓ 방향키·Enter 선택 · ESC 취소)"));
    const idx = await showSelector(deployItems);
    if (idx >= 0) {
      const chosen = deployItems[idx].answer;
      if (cm) cm.setDeployTarget(chosen);
      console.log(chalk.green(`  ✓ 배포 환경 → ${deployItems[idx].label}`) + chalk.dim("  (다음 서비스 개발부터 적용)"));
    } else {
      console.log(chalk.dim("  취소됨"));
    }
    return true;
  }

  if (setting?.kind === "toggle" && setting.setting === "smoke") {
    if (setting.value !== null) {
      saveConfig({ smokeTest: setting.value });
      config = loadConfig();
      rebuildCM();
      console.log(chalk.green(`  ✓ 완성된 서비스 실제 실행 확인 ${setting.value ? "ON" : "OFF"}`));
    } else {
      console.log("  " + chalk.dim(`완성된 서비스 실제 실행 확인: ${config.smokeTest ? "ON" : "OFF"}  ·  /smoke on|off 로 전환`));
    }
    return true;
  }

  if (trimmed === "/mode") { cycleMode(); return true; }

  // /resume — 이전 세션 다시 열기
  if (trimmed === "/resume") { await resumeCommand(); return true; }

  // Only treat as unknown command if it looks like a slash command, not a file path
  if (trimmed.startsWith("/") && /^\/[a-z-]+$/i.test(trimmed.split(" ")[0]) && !trimmed.includes("/", 1)) {
    console.log(chalk.dim(`  알 수 없는 명령어: ${trimmed} — /help 참고`));
    return true;
  }

  return false;
}

// ─── Agent Events ──────────────────────────────────────
async function processAgentEvents(initialGen: AsyncGenerator<AgentEvent>): Promise<void> {
  let gen = initialGen;
  let elapsedMs = 0;
  let autoReply = ""; // 셀렉터 선택 후 다음 턴에 자동으로 보낼 응답
  try {
    // autoReply 가 설정되면 현재 루프를 break 하고 새 gen 으로 재시작한다.
    // (for-await 안에서 gen 을 재할당해도 이터레이터는 바뀌지 않으므로 while 로 감쌈)
    outer: while (true) {
    inner: for await (const event of gen) {
      if (workSession.aborted) break outer;
      workSession.stopSpinner();

      switch (event.type) {
        case "model": {
          // 용도별 라우팅 시 어떤 모델이 선택됐는지 옅게 표시
          if (event.tier !== "manual") {
            const why = event.tier === "heavy" ? "개발·UI" : "질문·연산";
            console.log("  " + chalk.dim(`↳ ${event.model} (${why})`));
          }
          break;
        }
        case "text": {
          // 배포 환경 선택 질문 → 방향키 셀렉터로 인터셉트
          if (/어디에 배포할 예정인가요|어떤 환경에 배포할 예정인가요|서비스를 어디에서 사용할까요/.test(event.content)) {
            // 스택 직후 배포 질문(5개) vs 독립 배포 질문(6개) 구분
            const isPostStack = /DB 종류|내 컴퓨터에서 먼저 사용/.test(event.content);
            const deployItems = deployChoices(isPostStack ? "post-stack" : "standalone");
            workSession.unlockInput();
            console.log("\n  " + chalk.bold("서비스를 어디에서 사용할까요?") + chalk.dim("  ↑↓ 선택 · Enter 확인"));
            const idx = await showSelector(deployItems);
            workSession.lockInput();
            if (idx >= 0) autoReply = deployItems[idx].answer;
            break;
          }
          // 스택 선택 질문 → 방향키 셀렉터로 인터셉트
          if (/어떤 기술 스택으로 만들까요|어떤 종류의 서비스로 만들까요/.test(event.content)) {
            const hasExisting = /현재 (?:스택|방식) 유지/.test(event.content);
            const stackItems = [
              ...(hasExisting ? [{ label: "현재 방식 유지", dimLabel: "0. 이미 만들어진 서비스 구조를 그대로 사용" }] : []),
              { label: "일반적인 웹 서비스  ✦ 추천", dimLabel: "1. 일반적인 웹 서비스 ✦ 빠르고 유연하게 시작" },
              { label: "검색에 잘 노출되는 서비스", dimLabel: "2. 검색 결과 노출과 첫 화면 속도가 중요한 서비스" },
              { label: "Vue 방식으로 만들기", dimLabel: "3. 기존 작업이 Vue 기반일 때 선택" },
              { label: "많은 요청을 처리하는 서비스", dimLabel: "4. 동시에 많은 사용자가 이용할 때 선택" },
              { label: "알아서 선택", dimLabel: "5. 알아서 선택 — 요청 내용 보고 적합한 스택으로" },
            ];
            const answers = hasExisting ? ["0", "1", "2", "3", "4", "5"] : ["1", "2", "3", "4", "5"];
            workSession.unlockInput();
            console.log("\n  " + chalk.bold("어떤 종류의 서비스로 만들까요?") + chalk.dim("  (↑↓ 방향키·Enter 선택 · ESC 취소)"));
            const idx = await showSelector(stackItems);
            workSession.lockInput();
            if (idx >= 0) autoReply = answers[idx];
            break;
          }
          // 디자인시스템 선택 질문 → 방향키 셀렉터로 인터셉트
          if (/디자인 시스템을 선택해 주세요/.test(event.content)) {
            const dsItems = [
              { label: "BCAVE  ✦ 자사 브랜드 기본", dimLabel: "1. BCAVE ✦ 기본/공식 — 자사 브랜드 · 모노톤 슬레이트" },
              { label: "AXIS", dimLabel: "2. AXIS — 밝은 코발트 · 모던 프로페셔널" },
            ];
            workSession.unlockInput();
            console.log("\n  " + chalk.bold("디자인 시스템 선택") + chalk.dim("  (↑↓ 방향키·Enter · ESC 취소)"));
            const idx = await showSelector(dsItems);
            workSession.lockInput();
            if (idx >= 0) autoReply = String(idx + 1);
            break;
          }
          console.log("");
          for (const line of event.content.split("\n")) console.log("  " + line);
          console.log("");
          break;
        }

        case "tool_start":
          // 승인 여부와 무관하게 "무엇을 하는 중"을 표시(yolo 모드 포함)
          console.log("  " + chalk.cyan("⚡") + " " + toolStatus(event.name, event.args));
          break;

        case "verify": {
          // 검증→자동수정 루프 진행 표시
          const label = friendlyVerifyLabel(event.cmd);
          if (event.status === "run") console.log("  " + chalk.cyan("●") + " " + chalk.dim(`${label} 중`));
          else if (event.status === "pass") console.log("  " + chalk.green("✓") + " " + chalk.dim(label));
          else console.log("  " + chalk.yellow("↻") + " " + chalk.dim(`${label}에서 문제 발견 · 자동으로 수정 중`));
          break;
        }

        case "tool_call": {
          const req = event.request;
          // ⚡ 라인은 tool_start 에서 이미 표시됨 — 여기선 승인만.
          // 승인 선택 동안은 정상 입력 복원 (방향키 셀렉터 동작)
          workSession.unlockInput();
          if (mode === "auto-approve") {
            const answer = await askYesAlwaysNo();
            if (answer === "no") cm!.rejectToolCall(req.id);
            else cm!.approveToolCall(req.id);
          } else {
            const approved = await askYesNo();
            if (approved) cm!.approveToolCall(req.id);
            else cm!.rejectToolCall(req.id);
          }
          workSession.lockInput();
          break;
        }

        case "tool_result": {
          // 진행 상황을 사람이 읽기 좋게: 성공은 "✓ 완료", 실패는 이유까지.
          const line = toolResultLine(event.name, event.result);
          if (line) console.log(line);
          break;
        }

        case "error":
          console.log("");
          console.log("  " + chalk.red("✗ " + friendlyErrorMessage(event.message)));
          console.log("");
          break;

        case "done":
          if (autoReply) {
            // for-await(inner) 만 탈출 → while(outer) 의 autoReply 처리 블록으로 이동
            break inner;
          }
          break;
      }

      if (!workSession.aborted && event.type !== "done") workSession.startSpinner();
    } // end for-await

    // for-await 가 끝난 뒤 autoReply 가 있으면 새 턴 실행
    if (autoReply && !workSession.aborted) {
      const reply = autoReply;
      autoReply = "";
      console.log("  " + chalk.dim(`↳ 선택: ${reply}`));
      gen = cm!.run(reply, workSession.signal);
      workSession.startSpinner();
      continue; // while 재시작
    }
    break; // autoReply 없음 → 정상 종료
    } // end while outer
  } finally {
    elapsedMs = workSession.finish();
  }
  if (workSession.aborted) {
    console.log(
      "  " + chalk.yellow("■ 중지했습니다.") + (elapsedMs ? chalk.dim(` · ${fmtDuration(elapsedMs)} 작업`) : ""),
    );
    console.log("");
  } else if (elapsedMs) {
    console.log("  " + chalk.dim(`✓ ${fmtDuration(elapsedMs)} 만에 완료`));
    console.log("");
  }
}

// ─── Main Input ────────────────────────────────────────
async function handleInput(text: string): Promise<void> {
  // Check if "/" triggered the command selector
  if (pendingCommandSelector) {
    pendingCommandSelector = false;
    // Also clear the separator line that prompt() printed
    process.stdout.write("\x1b[A\r\x1b[2K");
    const chosen = await selectCommand();
    if (chosen) {
      await handleSlashCommand(chosen);
    }
    prompt();
    return;
  }

  const trimmed = text.trim();
  if (!trimmed || trimmed === "/") {
    // Clear the empty separator+prompt and re-draw
    process.stdout.write("\x1b[A\r\x1b[2K");
    prompt();
    return;
  }

  if (await handleSlashCommand(trimmed)) { prompt(); return; }

  if (!cm) {
    console.log(chalk.dim("  로그인이 필요합니다. /login 으로 사내 계정에 로그인하세요."));
    prompt();
    return;
  }


  workSession.begin();
  const gen = cm.run(trimmed, workSession.signal);
  await processAgentEvents(gen);
  persistSession(trimmed);
  prompt();
}

// ─── Banner & Start ────────────────────────────────────
const LOGO = [
  "                                                            ",
  "                      ░▓▓▒                                  ",
  "           ▒▓▓▒░      ▓▓▓▓▓▓░                  ░▓▒          ",
  "          ▒▓▓▓▓▓▓▓▓  ▓▓▓  ▒▓▓▓▓            ░▓▓▓▓▓▓▓         ",
  "         ░▓▓░   ░▓▓▓▓▓▓░    ░▒▓▓▒       ░▓▓▓▓▓░ ░▓▓▒        ",
  "         ▒▓▓       ▒▓▓▓       ░▓▓▓░   ░▓▓▓▓▒     ▓▓▓        ",
  "         ▒▓▓        ▓▓▓░        ▒▓▓▒▓▓▓▓▓░       ▒▓▓░       ",
  "         ▒▓▓         ░░          ░▓▓▓▒░          ░▓▓░       ",
  "         ░▓▓░                      ░             ▒▓▓░       ",
  "          ▓▓▒                                    ▒▓▓        ",
  "          ░▓▓▒                                  ░▓▓▒        ",
  "           ▒▓▓░                                 ▓▓▓         ",
  "            ▓▓▓▒           ▒▓▒  ▓▓▓            ░▓▓░         ",
  "            ░▓▓▓            ░░                 ▓▓▓          ",
  "             ▒▓▓▒       ▓▓░       ▒▓░         ▒▓▓░          ",
  "              ▒▓▓▒      ░▓▓▒      ░▓▓▒       ░▓▓▒           ",
  "               ░▓▓▒       ▓▓▓▓▓▓▓▓▓▓▒       ░▓▓▒            ",
  "                ▒▓▓░         ░░░░░░        ░▓▓▒             ",
  "                ░▓▓▒                      ░▓▓▓              ",
  "                 ░▓▓▒                  ▓▓▓▓▓▓               ",
  "                  ░▓▓▓░         ░░░░░▒▓▓▓░░                 ",
  "                    ▓▓▓░       ▒▓▓▓▓▓▓▓░                    ",
  "                   ▒▓▓░         ░▓▓▓▒                       ",
  "                  ▓▓▓             ░▓▓▓▓▓▒                   ",
  "                 ▓▓▒                 ░▒▓▓▓▒░                ",
  "                ▓▓▓                     ░▓▓▓▓▓░             ",
  "               ▓▓▓                         ░▓▓▓▓            ",
  "              ▒▓▓░         ▒▒░                ▒▓▓▒          ",
  "             ░▓▓░        ▒▓▓▓▓▓▓▒░░             ▓▓▓░        ",
  "             ▓▓▒       ▒▓▓▓   ▓▓▓▓▓▓▓▓▓░         ▓▓▓░       ",
  "           ▒▓▓░      ▒▓▓▓░         ░▒▓▓▓▓▓▓▓▒░▒▓▓▓▓░        ",
  "          ▒▓▓░    ░▒▓▓▓░                 ░▒▓▓▓▓▓░           ",
  "         ░▓▓▓▓▓░▒▓▓▓▓                                       ",
  "            ░▒▓▓▓▓░                                         ",
];

async function main(): Promise<void> {
  if (subcommand === "doctor") {
    const checks = collectDoctorChecks();
    console.log("\n  " + chalk.bold.cyan("BCave Doctor") + "\n");
    for (const check of checks) {
      const mark = check.ok ? chalk.green("✓") : chalk.yellow("!");
      const code = check.code ? chalk.dim(` · ${check.code}`) : "";
      console.log(`  ${mark} ${check.label}: ${check.detail}${code}`);
    }
    const exitCode = doctorExitCode(checks);
    console.log(exitCode === 0
      ? chalk.green("\n  모든 필수 검사를 통과했습니다.\n")
      : chalk.yellow("\n  문제가 발견됐습니다. 표시된 진단 코드를 확인하세요.\n"));
    process.exit(exitCode);
  }
  if (subcommand === "design") {
    const [action, value] = designArgs;
    if (action === "use") {
      if (!value || !hasDesignSystem(value)) {
        console.error(chalk.red(`  ✗ 디자인 시스템을 찾을 수 없습니다: ${value || "(없음)"}`));
        process.exit(1);
      }
      saveConfig({ designSystem: value });
      console.log(chalk.green(`  ✓ 디자인 시스템 활성화: ${value}`));
      process.exit(0);
    }
    if (action === "lint") {
      if (!value) {
        console.error(chalk.red("  ✗ 검사할 HTML 파일을 지정하세요: bcave design lint <파일>"));
        process.exit(2);
      }
      const target = nodePath.resolve(value);
      if (!fs.existsSync(target)) {
        console.error(chalk.red(`  ✗ 파일을 찾을 수 없습니다: ${target}`));
        process.exit(2);
      }
      const systemIdx = args.indexOf("--system");
      const explicit = systemIdx >= 0 ? String(args[systemIdx + 1] || "").toLowerCase() : "";
      const active = explicit || detectDesignSystemFromArtifact(target) || loadConfig().designSystem;
      if (!hasDesignSystem(active)) {
        console.error(chalk.red(`  ✗ 디자인 시스템을 판별할 수 없습니다. --system ${designSystemNames().join("|")} 중 하나를 지정하세요.`));
        process.exit(2);
      }
      const result = lintDesignArtifact(active, target);
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.pass ? 0 : 1);
    }
    console.log("  bcave design use bcave\n  bcave design lint <file>");
    process.exit(2);
  }
  console.clear();
  console.log("");
  for (const line of LOGO) {
    console.log(chalk.yellow(line));
  }
  console.log("");
  const bcaveArt = [
    " ██████╗  ██████╗ █████╗ ██╗   ██╗███████╗",
    " ██╔══██╗██╔════╝██╔══██╗██║   ██║██╔════╝",
    " ██████╔╝██║     ███████║██║   ██║█████╗  ",
    " ██╔══██╗██║     ██╔══██║╚██╗ ██╔╝██╔══╝  ",
    " ██████╔╝╚██████╗██║  ██║ ╚████╔╝ ███████╗",
    " ╚═════╝  ╚═════╝╚═╝  ╚═╝  ╚═══╝  ╚══════╝",
  ];
  const codeArt = [
    "  ██████╗ ██████╗ ██████╗ ███████╗",
    " ██╔════╝██╔═══██╗██╔══██╗██╔════╝",
    " ██║     ██║   ██║██║  ██║█████╗  ",
    " ██║     ██║   ██║██║  ██║██╔══╝  ",
    " ╚██████╗╚██████╔╝██████╔╝███████╗",
    "  ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝",
  ];
  // BCAVE 와 CODE 를 한 줄에 나란히 (개행 없이)
  for (let i = 0; i < bcaveArt.length; i++) {
    console.log(chalk.cyan.bold(bcaveArt[i]) + chalk.blue.bold(codeArt[i]));
  }
  console.log("");
  const who = mode !== "session" && isLoggedIn(config) ? `  ·  ${config.userName || config.userEmail}` : "";
  const modelLabel = mode === "session"
    ? "사전 준비 시연 · LLM 미사용"
    : config.autoRoute ? `자동(${config.modelHeavy} · ${config.modelLight})` : config.model;

  console.log("  " + chalk.dim(`v${BCAVE_VERSION}  ·  ${modelLabel}  ·  ${safeCwd()}${who}`));
  console.log("  " + chalk.dim("Shift+Tab 모드 전환  ·  ESC 입력 전체 지우기  ·  /help 명령어  ·  Ctrl+C 종료"));
  console.log("");

  // 서브커맨드 처리
  if (subcommand === "update") {
    const ok = await doUpdate();
    if (ok) relaunchUpdated(); // 성공 시 새로 빌드된 버전으로 자동 재실행
    process.exit(1);
  }

  if (subcommand === "logout") {
    await doLogout();
    process.exit(0);
  }

  // 새 버전 알림 (설치본 vs GitHub 최신)
  if (mode !== "session" && hasRemoteUpdate()) {
    console.log("  " + chalk.yellow("● 새 버전이 있습니다.") + chalk.dim("   bcave update  로 업데이트하세요."));
    console.log("");
  }

  if (mode === "session") {
    rebuildCM();
  } else if (subcommand === "login") {
    await loginFlow();
  } else if (isLoggedIn(config)) {
    rebuildCM();
  } else {
    // 로그인 필수 — 사내 계정 인증만이 유일한 사용 경로 (게이트웨이 강제 경유)
    await loginFlow();
  }

  if (mode === "yolo") {
    console.log("  " + chalk.red("⚠ 모든 권한 확인이 비활성화되었습니다."));
    console.log("");
  }
  if (mode === "session") {
    console.log("  " + chalk.magenta("● Session mode") + chalk.dim(" · 로그인과 LLM 호출 없이 사전 준비된 시연만 실행합니다."));
    console.log("");
  }

  if (initialPrompt) {
    await handleInput(initialPrompt);
  } else {
    prompt();
  }
}

rl.on("close", () => {
  console.log(chalk.dim("\n  Goodbye 👋\n"));
  process.exit(0);
});

main();
