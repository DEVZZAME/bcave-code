#!/usr/bin/env node
import chalk from "chalk";
import readline from "node:readline";
import { loadConfig, saveConfig, getConfigDir, isLoggedIn } from "../config/config.js";
import { ConversationManager, type AgentEvent, type ToolCallRequest } from "../agent/conversation.js";
import { PermissionManager, type PermissionMode } from "../agent/permissions.js";
import type { BcaveConfig } from "../config/config.js";
import { hubLogin, hubLogout, hubListModels, hubUsage, type HubModel } from "../auth/hub.js";
import {
  runKickstart,
  showKickstart,
  editKickstart,
  resetKickstart,
  hasDraft,
  buildPromptFor,
  dashboardPrompt,
  DESIGN_SYSTEM_Q,
} from "../kickstart/index.js";
import type { WizardIO, Answer, KickstartQuestion } from "../kickstart/types.js";
import fs from "node:fs";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import nodePath from "node:path";

// ─── CLI Args ──────────────────────────────────────────
const args = process.argv.slice(2);
let mode: PermissionMode = "auto-approve"; // 기본: Auto mode (카테고리별 자동 승인)
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

if (args.includes("--dangerously-skip-permissions")) {
  mode = "yolo";
} else if (args.includes("--safe")) {
  mode = "safe";
} else if (args.includes("--auto-approve")) {
  mode = "auto-approve";
}

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
  ${chalk.cyan.bold("BCAVE AGENT")} — 사내 AI 코딩 에이전트 (HUB 로그인)

  ${chalk.bold("Usage")}
    $ bcave [prompt]

  ${chalk.bold("Commands")}
    login                              사내 계정으로 로그인
    logout                             로그아웃
    update                             최신 버전으로 업데이트

  ${chalk.bold("Options")}
    --hub-url <url>                    HUB 주소 지정 (예: http://hub.bcave.internal)
    --model <model>                    모델 변경 (기본: gpt-5.5)
    --safe                             Safe mode (모든 작업 전 확인)
    --auto-approve                     Auto mode: 카테고리별 자동 승인 (기본값)
    --dangerously-skip-permissions     모든 권한 확인 건너뛰기
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
let subcommand: "login" | "logout" | "update" | null = null;
if (["login", "logout", "update"].includes(nonFlagArgs[0])) {
  subcommand = nonFlagArgs.shift() as "login" | "logout" | "update";
}
if (nonFlagArgs.length > 0) {
  initialPrompt = nonFlagArgs.join(" ");
}

// ─── Mode ──────────────────────────────────────────────
const MODE_ORDER: PermissionMode[] = ["safe", "auto-approve", "yolo"];
const MODE_INFO: Record<PermissionMode, { label: string; color: (s: string) => string; desc: string }> = {
  safe: { label: "Safe mode", color: chalk.green, desc: "모든 작업 전 확인" },
  "auto-approve": { label: "Auto mode", color: chalk.yellow, desc: "카테고리별 자동 승인" },
  yolo: { label: "Yolo mode", color: chalk.red, desc: "확인 없이 실행" },
};

function cycleMode(): void {
  const idx = MODE_ORDER.indexOf(mode);
  mode = MODE_ORDER[(idx + 1) % MODE_ORDER.length];
  rebuildCM();
  const info = MODE_INFO[mode];
  process.stdout.write("\r\x1b[2K");
  console.log(info.color(`  → ${info.label}`) + chalk.dim(` — ${info.desc}`));
}

// ─── Slash Commands ────────────────────────────────────
const COMMANDS = [
  // 요구사항 수집 마법사 (정적, 토큰 0)
  { name: "/dashboard", desc: "참고 파일·디자인만 골라 대시보드 생성" },
  { name: "/kickstart", desc: "질문에 답하며 만들 것을 정리 (토큰 0)" },
  { name: "/build", desc: "저장된 기획으로 바로 다시 생성" },
  // 유틸리티
  { name: "/model", desc: "모델 선택" },
  { name: "/usage", desc: "사용량/한도 확인" },
  { name: "/login", desc: "사내 계정 로그인" },
  { name: "/logout", desc: "로그아웃" },
  { name: "/mode", desc: "모드 전환" },
  { name: "/help", desc: "도움말 표시" },
  { name: "/reset", desc: "설정 초기화" },
];

// Interactive selector helper — used for both commands and models
let selectorActive = false;
// 로그인 비밀번호 등 민감 입력 중에는 전역 keypress 핸들러(/, Shift+Tab)를 비활성화
let authInputActive = false;

interface SelectorItem {
  label: string;
  dimLabel: string;
}

// 한글·CJK·전각 문자는 터미널에서 2칸을 차지한다. 표시 폭 기준으로 잘라야 줄바꿈이 안 생긴다.
function charWidth(cp: number): number {
  return (cp >= 0x1100 &&
    (cp <= 0x115f || cp === 0x2329 || cp === 0x232a ||
      (cp >= 0x2e80 && cp <= 0xa4cf && cp !== 0x303f) ||
      (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff) ||
      (cp >= 0xfe30 && cp <= 0xfe4f) || (cp >= 0xff00 && cp <= 0xff60) ||
      (cp >= 0xffe0 && cp <= 0xffe6) || (cp >= 0x1f300 && cp <= 0x1faff)))
    ? 2 : 1;
}
function dispWidth(s: string): number {
  let w = 0;
  for (const ch of s) w += charWidth(ch.codePointAt(0)!);
  return w;
}
function truncWidth(s: string, maxW: number): string {
  if (maxW <= 1) return "";
  let w = 0, out = "";
  for (const ch of s) {
    const cw = charWidth(ch.codePointAt(0)!);
    if (w + cw > maxW - 1) return out + "…";
    w += cw;
    out += ch;
  }
  return out;
}

async function showSelector(items: SelectorItem[], initialIndex = 0): Promise<number> {
  return new Promise((resolve) => {
    selectorActive = true;
    let selected = initialIndex;
    const count = items.length;

    const cols = () => (process.stdout.columns || 80) - 1;
    function truncate(s: string, max: number): string {
      return truncWidth(s, max);
    }
    // 각 항목을 터미널 폭 1줄로 렌더 (줄바꿈 방지 → 커서 계산이 어긋나지 않음)
    function lineText(i: number): string {
      const prefix = i === selected ? "  › " : "    ";
      const full = prefix + truncate(items[i].dimLabel, cols() - prefix.length);
      return i === selected ? chalk.cyan(full) : chalk.dim(full);
    }

    let drawn = false;
    // 매 입력마다 블록 전체를 다시 그린다 (부분 갱신 desync 제거).
    function render(): void {
      if (drawn) process.stdout.write(`\x1b[${count}A`); // 블록 맨 위로
      for (let i = 0; i < count; i++) {
        process.stdout.write("\r\x1b[2K" + lineText(i) + "\n");
      }
      drawn = true;
    }
    function clearBlock(): void {
      process.stdout.write(`\x1b[${count}A`);
      for (let i = 0; i < count; i++) process.stdout.write("\r\x1b[2K\n");
      process.stdout.write(`\x1b[${count}A`);
      // readline 이 처리한 키가 다음 입력으로 새지 않도록 버퍼 비움
      const rlAny = rl as unknown as { line: string; cursor: number };
      rlAny.line = "";
      rlAny.cursor = 0;
    }

    render();

    const onKeypress = (str: string, key: readline.Key) => {
      if (!key) return;
      if (key.name === "up") {
        selected = (selected - 1 + count) % count;
        render();
      } else if (key.name === "down") {
        selected = (selected + 1) % count;
        render();
      } else if (key.name === "return") {
        process.stdin.removeListener("keypress", onKeypress);
        clearBlock();
        selectorActive = false;
        resolve(selected);
      } else if (key.name === "escape" || key.name === "backspace") {
        process.stdin.removeListener("keypress", onKeypress);
        clearBlock();
        selectorActive = false;
        resolve(-1);
      } else if (str >= "1" && str <= String(Math.min(9, count))) {
        selected = parseInt(str) - 1;
        process.stdin.removeListener("keypress", onKeypress);
        clearBlock();
        selectorActive = false;
        resolve(selected);
      }
    };

    process.stdin.on("keypress", onKeypress);
  });
}

async function selectCommand(): Promise<string | null> {
  const items = COMMANDS.map((c) => ({
    label: `${c.name.padEnd(14)}${c.desc}`,
    dimLabel: `${c.name.padEnd(14)}${c.desc}`,
  }));
  const idx = await showSelector(items);
  if (idx < 0) return null;
  return COMMANDS[idx].name;
}

// ─── Readline ──────────────────────────────────────────
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Shift+Tab: mode cycle
process.stdin.on("keypress", (_str: string, key: readline.Key) => {
  if (selectorActive || authInputActive || processing) return;
  if (key && key.name === "tab" && key.shift) {
    process.stdout.write("\r\x1b[2K");
    cycleMode();
    setImmediate(() => {
      (rl as unknown as { line: string }).line = "";
      rl.write("\n");
    });
    return;
  }
});

// "/" typed → close current question, then open command selector
let pendingCommandSelector = false;

process.stdin.on("keypress", (str: string) => {
  if (selectorActive || authInputActive || processing) return;
  if (str === "/") {
    setImmediate(() => {
      const line = (rl as unknown as { line: string }).line ?? "";
      if (line === "/") {
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

function prompt(): void {
  const modeInfo = MODE_INFO[mode];
  const modeTag = modeInfo.color(modeInfo.label);
  const cwd = process.cwd();
  const separator = chalk.dim("─".repeat(getTermWidth()));
  console.log(separator);
  rl.question(`${modeTag} ${chalk.dim(cwd)} ${chalk.bold(">")} `, (answer) => {
    handleInput(answer);
  });
}

// 툴 실행을 사용자 친화적 한 줄 상태로 (원문 덤프 대신). 파일명·명령만 짧게.
function toolStatus(name: string, args: Record<string, unknown>): string {
  const base = (s: string) => {
    const b = (s.split("/").pop() || s).trim();
    return b.length > 42 ? b.slice(0, 42) + "…" : b;
  };
  const path = typeof args.path === "string" ? args.path : "";
  const tgt = (s: string) => (s ? "  " + chalk.dim(base(s)) : "");
  switch (name) {
    case "read_file": return "파일 읽는 중" + tgt(path);
    case "write_file": return "파일 작성 중" + tgt(path);
    case "list_files": return "폴더 살펴보는 중" + tgt(path);
    case "search_files": return "검색 중";
    case "shell_exec": {
      const c = String(args.command ?? "").replace(/\s+/g, " ").trim();
      return "작업 중" + (c ? "  " + chalk.dim(c.length > 46 ? c.slice(0, 46) + "…" : c) : "");
    }
    default: return name;
  }
}

// ─── 작업 중 스피너 / 입력 차단 / ESC 취소 ───────────────
let processing = false;
let aborted = false;
let abortController: AbortController | null = null;
let workRawListener: ((b: Buffer) => void) | null = null;

// 작업 중에는 readline 을 멈춰(에코·버퍼링 방지) 입력을 막고, ESC 만 raw 로 감지해 취소.
function enterWorkInput(): void {
  try { rl.pause(); } catch { /* noop */ }
  workRawListener = (buf: Buffer) => {
    if (buf.includes(0x1b)) {
      aborted = true;
      abortController?.abort(); // 진행 중인 API 요청 즉시 취소
      stopSpinner();
      process.stdout.write("  " + chalk.yellow("■ 중지 중…") + "\n");
    }
  };
  process.stdin.on("data", workRawListener);
  // rl.pause() 로 명시적으로 멈춘 stdin 은 data 리스너를 추가해도 자동 재개되지 않는다.
  // resume() 을 호출해야 ESC 바이트가 리스너로 흐른다.
  try { process.stdin.resume(); } catch { /* noop */ }
}
function exitWorkInput(): void {
  if (workRawListener) {
    process.stdin.removeListener("data", workRawListener);
    workRawListener = null;
  }
  try { rl.resume(); } catch { /* noop */ }
}

const SPIN = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
let spinnerTimer: ReturnType<typeof setInterval> | null = null;
function startSpinner(label = "작업 중…"): void {
  stopSpinner();
  let i = 0;
  spinnerTimer = setInterval(() => {
    process.stdout.write(
      `\r\x1b[2K  ${chalk.cyan(SPIN[i % SPIN.length])} ${chalk.dim(label)} ${chalk.dim("· ESC 로 중지")}`,
    );
    i++;
  }, 80);
}
function stopSpinner(): void {
  if (spinnerTimer) {
    clearInterval(spinnerTimer);
    spinnerTimer = null;
    process.stdout.write("\r\x1b[2K");
  }
}

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
let cm: ConversationManager | null = null;

function rebuildCM(): void {
  const pm = new PermissionManager(mode);
  cm = new ConversationManager(config, pm, process.cwd());
}

// ─── Model Selection ───────────────────────────────────
// HUB 연결이 안 될 때만 쓰는 폴백 목록 (평상시엔 서버에서 받아온다)
const FALLBACK_MODELS: HubModel[] = [
  { id: "gpt-4o-mini", displayName: "gpt-4o-mini", description: "Fast and cost-efficient for simple tasks." },
  { id: "gpt-4o", displayName: "gpt-4o", description: "Strong multimodal model for complex tasks." },
];

async function selectModel(): Promise<void> {
  console.log(chalk.bold("  Select Model"));
  console.log("");

  // 로그인 상태면 HUB 에서 "내가 쓸 수 있는 모델"을 받아온다 (RBAC 반영)
  let models: HubModel[] = FALLBACK_MODELS;
  if (isLoggedIn(config)) {
    try {
      const fetched = await hubListModels(config.hubUrl, config.accessToken);
      if (fetched.length > 0) models = fetched;
    } catch {
      console.log(chalk.dim("  (HUB 모델 목록을 못 받아 기본 목록을 표시합니다)"));
    }
  }

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

// ─── 사용량 확인 ───────────────────────────────────────
// 요청당 비용이 1센트 미만이라, 소액은 4자리까지 표시한다.
function fmtUsd(n: number): string {
  if (n === 0) return "$0.00";
  if (n < 1) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
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
    const LABEL = { daily: "오늘", weekly: "이번 주", monthly: "이번 달" } as const;
    console.log(chalk.bold(`  사용량`) + chalk.dim(`  ·  등급: ${u.tierName ?? u.role ?? "-"}`));
    console.log("");
    for (const key of ["daily", "weekly", "monthly"] as const) {
      const p = u.periods[key];
      const used = fmtUsd(p.used);
      const limit = p.limit === 0 ? "무제한" : fmtUsd(p.limit);
      const pct = p.limit > 0 ? ` (${Math.min(100, Math.round((p.used / p.limit) * 100))}%)` : "";
      const reset = new Date(p.reset).toLocaleString("ko-KR", {
        month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
      });
      console.log(
        "  " + chalk.cyan(LABEL[key].padEnd(7)) +
        `${used} / ${limit}` + chalk.dim(pct) +
        chalk.dim(`   · 리셋 ${reset}`)
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
function askPassword(query: string): Promise<string> {
  return new Promise((resolve) => {
    authInputActive = true;
    const stdin = process.stdin;
    // 라벨을 그대로 출력 (이메일 프롬프트와 동일하게 보이도록)
    process.stdout.write(query);

    // 비밀번호 입력 동안에는 readline 의 라인 편집(에코)을 잠시 끄기 위해
    // keypress 리스너를 보관 후 해제하고, raw 바이트를 직접 읽어 * 로 표시한다.
    const savedKeypress = stdin.listeners("keypress") as Array<
      (...a: unknown[]) => void
    >;
    stdin.removeAllListeners("keypress");

    let pw = "";
    const onData = (buf: Buffer) => {
      for (const ch of buf.toString("utf8")) {
        if (ch === "\r" || ch === "\n") {
          finish();
          return;
        } else if (ch === "\x7f" || ch === "\b") {
          if (pw.length) {
            pw = pw.slice(0, -1);
            process.stdout.write("\b \b");
          }
        } else if (ch === "\x03") {
          // Ctrl-C
          process.stdout.write("\n");
          process.exit(0);
        } else if (ch >= " ") {
          pw += ch;
          process.stdout.write("*");
        }
      }
    };

    function finish(): void {
      stdin.removeListener("data", onData);
      for (const l of savedKeypress) stdin.on("keypress", l);
      authInputActive = false;
      process.stdout.write("\n");
      resolve(pw);
    }

    stdin.on("data", onData);
  });
}

function askLine(query: string): Promise<string> {
  return new Promise((resolve) => {
    authInputActive = true;
    rl.question(query, (value) => {
      authInputActive = false;
      resolve(value);
    });
  });
}

// ─── /kickstart 마법사 IO (정적, 토큰 0) ────────────────
// 선택형: ↑↓/숫자/Enter, Space(복수), ← 이전, Esc 취소. 텍스트: 입력/:b/:q.
function wizardSelect(
  options: { label: string; value: string }[],
  multi: boolean,
): Promise<Answer> {
  return new Promise((resolve) => {
    selectorActive = true;
    let sel = 0;
    const chosen = new Set<number>();
    const count = options.length;
    const totalLines = count + 1; // 옵션들 + 안내줄
    const cols = () => (process.stdout.columns || 80) - 1;
    const trunc = (s: string, m: number) => truncWidth(s, m);
    const footer = multi
      ? "↑↓ 이동 · Space 선택 · Enter 확정 · ← 이전 · Esc 취소"
      : "↑↓ 이동 · Enter 선택 · 숫자 · ← 이전 · Esc 취소";
    const lineText = (i: number): string => {
      const mark = multi ? (chosen.has(i) ? "◉ " : "◯ ") : "";
      const prefix = i === sel ? "  › " : "    ";
      const full = prefix + mark + trunc(options[i].label, cols() - prefix.length - mark.length);
      return i === sel ? chalk.cyan(full) : chalk.dim(full);
    };
    let drawn = false;
    const render = () => {
      if (drawn) process.stdout.write(`\x1b[${totalLines}A`);
      for (let i = 0; i < count; i++) process.stdout.write("\r\x1b[2K" + lineText(i) + "\n");
      process.stdout.write("\r\x1b[2K" + chalk.dim("  " + footer) + "\n");
      drawn = true;
    };
    const clear = () => {
      process.stdout.write(`\x1b[${totalLines}A`);
      for (let i = 0; i < totalLines; i++) process.stdout.write("\r\x1b[2K\n");
      process.stdout.write(`\x1b[${totalLines}A`);
    };
    render();
    const done = (ans: Answer) => {
      process.stdin.removeListener("keypress", onKey);
      clear();
      // readline 이 처리한 키(숫자 등)가 다음 텍스트 입력으로 새지 않도록 버퍼 비움
      const rlAny = rl as unknown as { line: string; cursor: number };
      rlAny.line = "";
      rlAny.cursor = 0;
      selectorActive = false;
      resolve(ans);
    };
    const onKey = (str: string, key: readline.Key) => {
      if (!key) return;
      if (key.name === "up") { sel = (sel - 1 + count) % count; render(); }
      else if (key.name === "down") { sel = (sel + 1) % count; render(); }
      else if (key.name === "left") { done({ kind: "back" }); }
      else if (key.name === "escape") { done({ kind: "cancel" }); }
      else if (key.name === "space" && multi) {
        chosen.has(sel) ? chosen.delete(sel) : chosen.add(sel);
        render();
      } else if (key.name === "return") {
        if (multi) done({ kind: "value", value: [...chosen].sort((a, b) => a - b).map((i) => options[i].value) });
        else done({ kind: "value", value: options[sel].value });
      } else if (str >= "1" && str <= String(Math.min(9, count))) {
        const i = parseInt(str) - 1;
        if (multi) { chosen.has(i) ? chosen.delete(i) : chosen.add(i); sel = i; render(); }
        else done({ kind: "value", value: options[i].value });
      }
    };
    process.stdin.on("keypress", onKey);
  });
}

async function wizardText(q: KickstartQuestion): Promise<Answer> {
  const hint = q.optional
    ? "(빈 값 = 건너뛰기 · :b 이전 · :q 취소)"
    : "(:b 이전 · :q 취소)";
  console.log("  " + chalk.dim(hint));
  while (true) {
    const raw = (await askLine(chalk.dim("  > "))).trim();
    if (raw === ":q") return { kind: "cancel" };
    if (raw === ":b") return { kind: "back" };
    if (raw === "") {
      if (q.optional) return { kind: "unknown" };
      console.log("  " + chalk.dim("값을 입력해주세요."));
      continue;
    }
    if (q.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      console.log("  " + chalk.dim("YYYY-MM-DD 형식으로 입력해주세요."));
      continue;
    }
    return { kind: "value", value: raw };
  }
}

const wizardIO: WizardIO = {
  print(text: string): void {
    console.log("");
    for (const line of text.split("\n")) console.log("  " + line);
    console.log("");
  },
  async ask(q, ctx): Promise<Answer> {
    const header = ctx.total > 1 ? `[${ctx.step}/${ctx.total}] ${q.message}` : q.message;
    console.log("");
    console.log("  " + chalk.bold(header));
    if (q.description) {
      for (const line of q.description.split("\n")) console.log("  " + chalk.dim(line));
    }
    if (q.type === "single_select") return wizardSelect(q.options ?? [], false);
    if (q.type === "multi_select") return wizardSelect(q.options ?? [], true);
    return wizardText(q);
  },
  async finalAction(summary: string): Promise<number> {
    console.log("");
    for (const line of summary.split("\n")) console.log("  " + line);
    console.log("");
    const items = [
      "1. 이 내용으로 확정",
      "2. 특정 항목 수정",
      "3. 처음부터 다시 작성",
      "4. 취소",
    ].map((l) => ({ label: l, dimLabel: l }));
    const idx = await showSelector(items);
    return idx < 0 ? 3 : idx; // Esc → 취소
  },
  async confirm(message: string, defaultYes = false): Promise<boolean> {
    console.log("");
    console.log("  " + message);
    console.log("");
    const items = [
      { label: "예", dimLabel: "예" },
      { label: "아니오", dimLabel: "아니오" },
    ];
    const idx = await showSelector(items, defaultYes ? 0 : 1);
    return idx === 0; // Esc(-1) → 아니오
  },
};

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
      const result = await hubLogin(config.hubUrl, email, password);
      saveConfig({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        userEmail: result.user.email,
        userName: result.user.name,
        // 게이트웨이 모드로 전환되므로 레거시 키 흔적 제거
        apiKey: "",
      });
      config = loadConfig();
      process.stdout.write("\r\x1b[2K");
      console.log(chalk.green(`  ✓ 로그인되었습니다: ${result.user.name} (${result.user.email})`));
      const hasCli = result.user.services.includes("BCAVE_CODE");
      if (!hasCli) {
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
  await hubLogout(config.hubUrl, config.accessToken, config.refreshToken);
  saveConfig({ accessToken: "", refreshToken: "", userEmail: "", userName: "" });
  config = loadConfig();
  cm = null;
  console.log(chalk.green("  ✓ 로그아웃되었습니다."));
}

// ─── 버전 체크 / 업데이트 ──────────────────────────────
const REPO_URL = "https://github.com/DEVZZAME/bcave-agent.git";

function installDir(): string {
  // dist/cli/index.js → 저장소 루트(../../)
  const here = nodePath.dirname(fileURLToPath(import.meta.url));
  return nodePath.resolve(here, "..", "..");
}

/** 설치본 커밋과 GitHub master 최신 커밋을 비교. 새 버전이 있으면 true. */
function checkForUpdate(): boolean {
  try {
    const dir = installDir();
    const opt = { cwd: dir, timeout: 3000, stdio: "pipe" as const };
    const local = execSync("git rev-parse HEAD", opt).toString().trim();
    const remote = execSync(`git ls-remote ${REPO_URL} refs/heads/master`, opt)
      .toString()
      .trim()
      .split(/\s+/)[0];
    return !!local && !!remote && local !== remote;
  } catch {
    return false;
  }
}

async function doUpdate(): Promise<void> {
  const dir = installDir();
  const run = (cmd: string, timeout: number) => execSync(cmd, { cwd: dir, stdio: "ignore", timeout });
  console.log("");
  try {
    console.log("  " + chalk.cyan("▸") + " 최신 버전을 받는 중…");
    run("git fetch --depth 1 origin master", 60000);
    run("git reset --hard origin/master", 20000);
    console.log("  " + chalk.cyan("▸") + " 의존성 설치…");
    run("npm install --silent", 300000);
    console.log("  " + chalk.cyan("▸") + " 빌드…");
    run("npm run build --silent", 180000);
    console.log("  " + chalk.green("✓ 최신 버전으로 업데이트했습니다.") + chalk.dim("  bcave 를 다시 실행하세요."));
  } catch (e) {
    console.log("  " + chalk.red("✗ 업데이트 실패: ") + chalk.dim((e as Error).message.split("\n")[0]));
    console.log("  " + chalk.dim("  설치 명령을 다시 실행해 보세요."));
  }
  console.log("");
}

// ─── Command Handlers ──────────────────────────────────
function showHelp(): void {
  console.log("");
  console.log(chalk.bold("  Commands"));
  console.log("");
  for (const cmd of COMMANDS) {
    console.log("    " + chalk.cyan(cmd.name.padEnd(14)) + chalk.dim(cmd.desc));
  }
  console.log("    " + chalk.cyan("Shift+Tab".padEnd(14)) + chalk.dim("모드 전환"));
  console.log("    " + chalk.cyan("Tab".padEnd(14)) + chalk.dim("명령어 자동 완성"));
  console.log("    " + chalk.cyan("Ctrl+C".padEnd(14)) + chalk.dim("종료"));
  console.log("");
}

// /kickstart 확정 후: 정리된 기획으로 실제 결과물을 지금 만들지 물어보고, 예 면 AI 로 생성.
async function offerBuild(cwd: string): Promise<void> {
  const prompt = buildPromptFor(cwd);
  if (!prompt) return;
  const go = await wizardIO.confirm("정리된 내용으로 지금 바로 만들어드릴까요? (AI가 결과물을 생성합니다)", true);
  if (!go) {
    console.log(chalk.dim("  알겠습니다. 저장된 기획(.agent/kickstart.md)을 바탕으로 언제든 만들 수 있어요."));
    return;
  }
  if (!cm) {
    console.log(chalk.dim("  결과물 생성은 로그인이 필요합니다. /login 후 다시 시도하세요."));
    return;
  }
  abortController = new AbortController();
  await processAgentEvents(cm.run(prompt, abortController.signal));
}

// 저장된 기획(.agent/kickstart.json)으로 바로 (재)생성 — 마법사 다시 안 거침.
async function buildFromSaved(cwd: string): Promise<void> {
  const prompt = buildPromptFor(cwd);
  if (!prompt) {
    console.log(chalk.dim("  저장된 기획이 없습니다. 먼저 /kickstart 로 정리하세요."));
    return;
  }
  if (!cm) {
    console.log(chalk.dim("  결과물 생성은 로그인이 필요합니다. /login 후 다시 시도하세요."));
    return;
  }
  console.log(chalk.dim("  저장된 기획으로 다시 만듭니다…"));
  abortController = new AbortController();
  await processAgentEvents(cm.run(prompt, abortController.signal));
}

// /dashboard — 참고 파일 + 디자인시스템만 골라 바로 대시보드 생성 (마법사 생략).
async function dashboardCommand(): Promise<void> {
  if (!cm) {
    console.log(chalk.dim("  로그인이 필요합니다. /login 후 다시 시도하세요."));
    return;
  }
  console.log("");
  console.log("  " + chalk.bold("데이터 대시보드 만들기"));
  console.log("  " + chalk.dim("참고할 데이터 파일과 디자인만 고르면 됩니다."));
  console.log("");
  const file = (await askLine(chalk.dim("  데이터 파일 경로 (엑셀/CSV) > "))).trim();
  if (!file) {
    console.log(chalk.dim("  취소했습니다."));
    return;
  }
  console.log("");
  console.log("  " + chalk.bold("어떤 디자인으로 만들까요?"));
  const opts = (DESIGN_SYSTEM_Q.options ?? []) as { label: string; value: string }[];
  const idx = await showSelector(
    opts.map((o) => ({ label: o.label, dimLabel: o.label })),
    0,
  );
  if (idx < 0) {
    console.log(chalk.dim("  취소했습니다."));
    return;
  }
  console.log("  " + chalk.cyan("선택: ") + opts[idx].label);
  console.log(chalk.dim("  대시보드를 만듭니다…"));
  abortController = new AbortController();
  await processAgentEvents(cm.run(dashboardPrompt(file, opts[idx].value), abortController.signal));
}

async function handleSlashCommand(text: string): Promise<boolean> {
  const trimmed = text.trim();

  if (trimmed === "/help") { showHelp(); return true; }

  if (trimmed === "/login") { await loginFlow(true); return true; }

  if (trimmed === "/logout") { await doLogout(); return true; }

  if (trimmed === "/usage") { await showUsage(); return true; }

  if (trimmed === "/reset") {
    const configPath = `${getConfigDir()}/config.json`;
    if (fs.existsSync(configPath)) fs.unlinkSync(configPath);
    console.log(chalk.green("  ✓ 설정 초기화 완료. 다시 시작해주세요."));
    process.exit(0);
  }

  if (trimmed === "/model" || trimmed.startsWith("/model ")) {
    // If model name provided directly, set it
    const directModel = trimmed.slice(7).trim();
    if (directModel) {
      saveConfig({ model: directModel });
      config = loadConfig();
      rebuildCM();
      console.log(chalk.green(`  ✓ model → ${directModel}`));
      return true;
    }
    // Interactive model selection
    await selectModel();
    return true;
  }

  if (trimmed === "/mode") { cycleMode(); return true; }

  // /dashboard — 참고 파일·디자인만 골라 대시보드 생성
  if (trimmed === "/dashboard") { await dashboardCommand(); return true; }

  // /build — 저장된 기획으로 바로 다시 생성
  if (trimmed === "/build") { await buildFromSaved(process.cwd()); return true; }

  // /kickstart — 정적(토큰 0) 요구사항 수집 마법사 + 하위명령
  if (trimmed === "/kickstart" || trimmed.startsWith("/kickstart ")) {
    const sub = trimmed.slice("/kickstart".length).trim();
    const cwd = process.cwd();
    if (sub === "show") { showKickstart(wizardIO, cwd); return true; }
    if (sub === "reset") { await resetKickstart(wizardIO, cwd); return true; }
    if (sub === "edit") { await editKickstart(wizardIO, cwd); return true; }
    if (sub === "resume") { await runKickstart(wizardIO, cwd, { resume: true }); return true; }
    if (sub === "build") { await buildFromSaved(cwd); return true; }
    if (sub && sub !== "new") {
      console.log(chalk.dim("  사용법: /kickstart [show|edit|reset|resume|build]"));
      return true;
    }
    // 인자 없음: 중단된 초안이 있으면 이어서 할지 물어봄
    let outcome;
    if (hasDraft(cwd)) {
      const resume = await wizardIO.confirm("이어서 진행할 내용이 있습니다. 이어서 할까요? (아니오 = 새로 시작)", true);
      outcome = await runKickstart(wizardIO, cwd, { resume });
    } else {
      outcome = await runKickstart(wizardIO, cwd);
    }
    if (outcome === "confirmed") await offerBuild(cwd);
    return true;
  }

  // Only treat as unknown command if it looks like a slash command, not a file path
  if (trimmed.startsWith("/") && /^\/[a-z-]+$/i.test(trimmed.split(" ")[0]) && !trimmed.includes("/", 1)) {
    console.log(chalk.dim(`  알 수 없는 명령어: ${trimmed} — /help 참고`));
    return true;
  }

  return false;
}

// ─── Agent Events ──────────────────────────────────────
async function processAgentEvents(gen: AsyncGenerator<AgentEvent>): Promise<void> {
  processing = true;
  aborted = false;
  enterWorkInput();
  startSpinner();
  try {
    for await (const event of gen) {
      if (aborted) break;
      stopSpinner();

      switch (event.type) {
        case "text":
          console.log("");
          for (const line of event.content.split("\n")) console.log("  " + line);
          console.log("");
          break;

        case "tool_call": {
          const req = event.request;
          console.log("  " + chalk.cyan("⚡") + " " + toolStatus(req.name, req.args));
          // 승인 선택 동안은 정상 입력 복원 (방향키 셀렉터 동작)
          exitWorkInput();
          if (mode === "auto-approve") {
            const answer = await askYesAlwaysNo();
            if (answer === "no") cm!.rejectToolCall(req.id);
            else cm!.approveToolCall(req.id);
          } else {
            const approved = await askYesNo();
            if (approved) cm!.approveToolCall(req.id);
            else cm!.rejectToolCall(req.id);
          }
          enterWorkInput();
          break;
        }

        case "tool_result": {
          // 원문은 표시하지 않고, 실패했을 때만 짧게 알린다.
          const r = (event.result || "").trim();
          if (/^(Error|Exit code|Invalid regular expression|\[바이너리)/.test(r)) {
            console.log("    " + chalk.yellow("⚠ ") + chalk.dim(r.split("\n")[0].slice(0, 110)));
          }
          break;
        }

        case "error":
          console.log("");
          console.log("  " + chalk.red("✗ " + event.message));
          console.log("");
          break;

        case "done":
          break;
      }

      if (!aborted && event.type !== "done") startSpinner();
    }
  } finally {
    stopSpinner();
    exitWorkInput();
    processing = false;
  }
  if (aborted) {
    console.log("  " + chalk.yellow("■ 중지했습니다."));
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


  abortController = new AbortController();
  const gen = cm.run(trimmed, abortController.signal);
  await processAgentEvents(gen);
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
  const agentArt = [
    "  █████╗  ██████╗ ███████╗███╗   ██╗████████╗",
    " ██╔══██╗██╔════╝ ██╔════╝████╗  ██║╚══██╔══╝",
    " ███████║██║  ███╗█████╗  ██╔██╗ ██║   ██║   ",
    " ██╔══██║██║   ██║██╔══╝  ██║╚██╗██║   ██║   ",
    " ██║  ██║╚██████╔╝███████╗██║ ╚████║   ██║   ",
    " ╚═╝  ╚═╝ ╚═════╝ ╚══════╝╚═╝  ╚═══╝   ╚═╝   ",
  ];
  for (const l of bcaveArt) console.log(chalk.cyan.bold(l));
  for (const l of agentArt) console.log(chalk.blue.bold(l));
  console.log("");
  const who = isLoggedIn(config) ? `  ·  ${config.userName || config.userEmail}` : "";
  console.log("  " + chalk.dim(`v0.1.0  ·  ${config.model}  ·  ${process.cwd()}${who}`));
  console.log("  " + chalk.dim("Shift+Tab 모드 전환  ·  /help 명령어  ·  Ctrl+C 종료"));
  console.log("");

  // 서브커맨드 처리
  if (subcommand === "update") {
    await doUpdate();
    process.exit(0);
  }

  if (subcommand === "logout") {
    await doLogout();
    process.exit(0);
  }

  // 새 버전 알림 (설치본 vs GitHub 최신)
  if (checkForUpdate()) {
    console.log("  " + chalk.yellow("● 새 버전이 있습니다.") + chalk.dim("   bcave update  로 업데이트하세요."));
    console.log("");
  }

  if (subcommand === "login") {
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
