#!/usr/bin/env node
import chalk from "chalk";
import readline from "node:readline";
import { loadConfig, saveConfig, getConfigDir, isLoggedIn } from "../config/config.js";
import { ConversationManager, type AgentEvent, type ToolCallRequest } from "../agent/conversation.js";
import { PermissionManager, type PermissionMode } from "../agent/permissions.js";
import type { BcaveConfig } from "../config/config.js";
import { hubLogin, hubLogout, hubListModels, hubUsage, type HubModel } from "../auth/hub.js";
import { newSessionId, saveSession, listSessions, loadSession } from "../session/store.js";
import fs from "node:fs";
import os from "node:os";
import { execSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import nodePath from "node:path";
import { detectDesignSystemFromArtifact, designSystemNames, hasDesignSystem, lintDesignArtifact } from "../design-system/runtime.js";

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
  ${chalk.cyan.bold("BCAVE CODE")} — 사내 AI 코딩 에이전트 (HUB 로그인)

  ${chalk.bold("Usage")}
    $ bcave [prompt]

  ${chalk.bold("Commands")}
    login                              사내 계정으로 로그인
    logout                             로그아웃
    update                             최신 버전으로 업데이트
    design use bcave                   UI/대시보드 디자인 시스템 활성화
    design lint <file> [--system name] 생성된 HTML 디자인 규칙 검사

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
let subcommand: "login" | "logout" | "update" | "design" | null = null;
if (["login", "logout", "update", "design"].includes(nonFlagArgs[0])) {
  subcommand = nonFlagArgs.shift() as "login" | "logout" | "update" | "design";
}
const designArgs = subcommand === "design" ? nonFlagArgs.splice(0) : [];
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
  { name: "/resume", desc: "이전 세션 다시 열기" },
  { name: "/model", desc: "모델 선택 (gpt-5.6-luna 기본 · auto 용도별 라우팅)" },
  { name: "/deploy", desc: "서비스를 사용할 장소 선택" },
  { name: "/verify", desc: "완료 전 오류 자동 확인 on/off" },
  { name: "/smoke", desc: "완성된 서비스 실제 실행 확인 on/off" },
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

    // ── readline/stdin 완전 무음화 ──────────────────────────────────────
    // rl이 활성이면 키 입력이 에코되거나 prompt가 stdout에 출력돼 커서 위치가 어긋난다.
    // 셀렉터 표시 중에는 rl을 완전히 닫고, stdin을 raw 모드로 직접 읽는다.
    try { rl.pause(); } catch { /* noop */ }
    const prevRawMode = process.stdin.isRaw;
    try { process.stdin.setRawMode(true); } catch { /* noop */ }
    process.stdin.resume();

    // stdout 출력 직전 커서 숨김 / 이후 표시 (깜빡임 방지)
    const hideCursor = () => process.stdout.write("\x1b[?25l");
    const showCursor = () => process.stdout.write("\x1b[?25h");

    const cols = () => Math.max(40, (process.stdout.columns || 80) - 4);
    function lineText(i: number): string {
      const prefix = i === selected ? "  \x1b[36m›\x1b[0m " : "    ";
      const label = truncWidth(items[i].dimLabel, cols() - 4);
      const colored = i === selected ? `\x1b[96m${label}\x1b[0m` : `\x1b[2m${label}\x1b[0m`;
      return prefix + colored;
    }

    let linesDrawn = 0;
    function render(): void {
      hideCursor();
      // 이전 블록 지우기: 이미 그린 줄만큼 올라가서 지운다
      if (linesDrawn > 0) {
        process.stdout.write(`\x1b[${linesDrawn}A`);
      }
      const out: string[] = [];
      for (let i = 0; i < count; i++) {
        out.push("\r\x1b[2K" + lineText(i));
      }
      process.stdout.write(out.join("\n") + "\n");
      linesDrawn = count;
      showCursor();
    }

    function cleanup(result: number): void {
      // 블록 전체 지우기
      if (linesDrawn > 0) {
        process.stdout.write(`\x1b[${linesDrawn}A`);
        for (let i = 0; i < linesDrawn; i++) process.stdout.write("\r\x1b[2K\n");
        process.stdout.write(`\x1b[${linesDrawn}A`);
      }
      showCursor();
      process.stdin.removeListener("data", onData);
      try { process.stdin.setRawMode(prevRawMode ?? false); } catch { /* noop */ }
      try { rl.resume(); } catch { /* noop */ }
      // readline 버퍼 초기화
      const rlAny = rl as unknown as { line: string; cursor: number };
      rlAny.line = ""; rlAny.cursor = 0;
      selectorActive = false;
      resolve(result);
    }

    // stdin을 raw 바이트로 직접 읽음 → readline 에코 간섭 없음
    const onData = (buf: Buffer) => {
      const b = buf[0];
      const seq = buf.toString();

      if (seq === "\x1b[A" || b === 0x41 && buf[0] === 0x1b) { // up
        selected = (selected - 1 + count) % count;
        render();
      } else if (seq === "\x1b[B") { // down
        selected = (selected + 1) % count;
        render();
      } else if (b === 0x0d || b === 0x0a) { // enter
        cleanup(selected);
      } else if (b === 0x1b && buf.length === 1) { // esc
        cleanup(-1);
      } else if (b >= 0x30 && b <= 0x39) { // 0-9 숫자
        const n = b - 0x30;
        if (n >= 0 && n < count) { selected = n; cleanup(selected); }
      }
    };

    process.stdin.on("data", onData);
    render();
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
let _isPasting = false;
let _pasteAccum = "";
const _rlAny = rl as unknown as { _normalWrite?: (b: Buffer) => void };
const _origWrite = _rlAny._normalWrite?.bind(rl);
if (_origWrite) {
  _rlAny._normalWrite = (buf: Buffer) => {
    const s = buf.toString("utf8");
    if (s === "\x1b[200~") { _isPasting = true; _pasteAccum = ""; return; }
    if (s === "\x1b[201~") {
      _isPasting = false;
      if (_pasteAccum) _origWrite(Buffer.from(_pasteAccum, "utf8"));
      _pasteAccum = "";
      return;
    }
    if (_isPasting) {
      // 줄바꿈(\r\n, \n, \r) → 공백으로 치환해 Enter 로 해석되지 않게
      _pasteAccum += s.replace(/\r\n|\r|\n/g, " ");
      return;
    }
    _origWrite(buf);
  };
}

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
  // ESC: 현재 입력 전체 지우기 (작업 중 아닐 때)
  // — 딜리트 키로 한 자씩 지우는 불편함을 해소
  if (key && key.name === "escape") {
    const rlAny = rl as unknown as { line: string; cursor: number; _refreshLine?: () => void };
    if (rlAny.line && rlAny.line.length > 0) {
      rlAny.line = "";
      rlAny.cursor = 0;
      process.stdout.write("\r\x1b[2K");
      rlAny._refreshLine?.();
    }
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

/** 현재 디렉토리를 안전하게 반환. 삭제된 경우 홈 디렉토리로 폴백. */
function safeCwd(): string {
  try { return process.cwd(); } catch { return os.homedir(); }
}

/** 터미널 폭을 고려해 경로를 짧게 줄인다. 홈은 ~로, 긴 경로는 끝 2단계만 표시. */
function shortPath(p: string): string {
  const home = os.homedir();
  const rel = p.startsWith(home) ? "~" + p.slice(home.length) : p;
  const cols = getTermWidth();
  // 프롬프트 고정 부분 폭: "Auto mode " + " > " (chalk 색상 코드 제외한 실제 표시 폭)
  const modeLabel = MODE_INFO[mode].label; // e.g. "Auto mode"
  const fixedWidth = dispWidth(modeLabel) + 3; // " > " = 3
  const maxPath = Math.max(15, cols - fixedWidth - 2);
  if (dispWidth(rel) <= maxPath) return rel;
  // 너무 길면 끝 2단계만 (~/.../parent/dir)
  const parts = p.replace(home, "~").split("/").filter(Boolean);
  return (p.startsWith(home) ? "~" : "") + "/…/" + parts.slice(-2).join("/");
}

/**
 * ANSI 이스케이프 시퀀스를 readline 비표시 마커(\x01...\x02)로 감싼다.
 * readline 이 프롬프트 표시 폭을 계산할 때 ANSI 코드를 폭 0으로 처리하도록 해,
 * 한글·CJK 입력 시 커서 위치 계산 오류(중복/깨짐)를 방지한다.
 */
function rlWrap(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, (m) => `\x01${m}\x02`);
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

// shell 실패 시 STDERR 첫 의미있는 줄을 뽑는다.
function shellErrReason(r: string): string {
  const idx = r.indexOf("STDERR:");
  const tail = idx >= 0 ? r.slice(idx + 7) : r.replace(/^Exit code \d+\n?/, "");
  const line = tail
    .split("\n")
    .map((s) => s.trim())
    .find((s) => s && !/^Exit code/.test(s));
  return line ? (line.length > 90 ? line.slice(0, 90) + "…" : line) : "";
}

// 도구 실행 결과를 사람이 읽기 좋은 한 줄로. 표시할 게 없으면 null(조용히).
function toolResultLine(name: string, result: string): string | null {
  const r = (result || "").trim();
  const exitM = r.match(/^Exit code (\d+)/);
  if (exitM) {
    const reason = shellErrReason(r);
    return chalk.yellow("    ⚠ 실패") + chalk.dim(` (exit ${exitM[1]})${reason ? " · " + reason : ""}`);
  }
  if (/^(Error|Invalid regular expression)/.test(r)) {
    return chalk.yellow("    ⚠ ") + chalk.dim(r.split("\n")[0].slice(0, 110));
  }
  if (/^\[바이너리/.test(r)) return null;
  if (name === "write_file") {
    if (/^File not written\./.test(r)) {
      return chalk.red("    ✗ 저장 안 됨") + chalk.dim(" · " + r.replace(/^File not written\.\s*/, "").split("\n")[0].slice(0, 100));
    }
    if (/^File written but NOT complete:/.test(r)) {
      const attempt = r.match(/수정 시도 (\d+)/)?.[1];
      return chalk.yellow("    ↻ 자동 교정 중") + chalk.dim(` · ${attempt ? `${attempt}차 검토에서 ` : ""}재작성 필요`);
    }
    if (/⚠/.test(r)) {
      const detail = r.split("\n").slice(1).join(" ").replace(/\s+/g, " ").trim().slice(0, 90);
      return chalk.yellow("    ⚠ 검토 경고") + (detail ? chalk.dim(" · " + detail) : "");
    }
    return chalk.dim("    ✓ 저장됨");
  }
  if (name === "shell_exec") {
    if (r.startsWith("[SERVER_START_FAILED]")) {
      return chalk.red("    ✗ 서비스가 아직 열리지 않습니다") + chalk.dim(" · 원인을 확인하고 다시 시도합니다");
    }
    if (r.startsWith("[SERVER_STARTED]")) {
      const url = r.match(/https?:\/\/[^\s]+/)?.[0];
      return chalk.green("    ✓ 서비스 화면이 정상적으로 열립니다") + chalk.dim(url ? " · " + url : "");
    }
    const firstOut = r.split("\n").map((s) => s.trim()).find(Boolean);
    return chalk.dim("    ✓ 완료" + (firstOut ? " · " + (firstOut.length > 80 ? firstOut.slice(0, 80) + "…" : firstOut) : ""));
  }
  return null; // read_file/list_files/search_files 성공은 표시하지 않음(⚡ 라인으로 충분)
}

function friendlyVerifyLabel(cmd: string): string {
  if (/스키마|DB/i.test(cmd)) return "입력한 내용이 저장되는지 확인";
  if (/proxy|API/i.test(cmd)) return "화면과 데이터가 연결되는지 확인";
  if (/서버|스모크|health/i.test(cmd)) return "서비스가 실제로 열리는지 확인";
  return "코드 오류 확인";
}

function friendlyErrorMessage(message: string): string {
  if (/서버 실행|서비스 실행|SERVER_START|HTTP 응답/i.test(message)) return "서비스가 아직 정상적으로 열리지 않습니다. 원인을 확인했지만 자동으로 해결하지 못했습니다.";
  if (/DB 스키마|schema|INSERT/i.test(message)) return "입력한 내용을 저장하는 기능에 문제가 남아 있어 완료하지 않았습니다.";
  if (/Vite|proxy|API 검증/i.test(message)) return "화면과 데이터 연결에 문제가 남아 있어 완료하지 않았습니다.";
  if (/빌드|타입|검증에 실패/i.test(message)) return "코드 오류가 남아 있어 완료하지 않았습니다.";
  return message;
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
// 요청 1건의 시작 시각(경과·소요 시간 표시용). 0이면 미측정.
let runStartMs = 0;
// 라이브 스피너용 압축 표기: 45초 / 1:20 / 12:05
function fmtClock(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}초`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${String(r).padStart(2, "0")}`;
}
// 완료 메시지용 친화 표기: 45초 / 1분 20초
function fmtDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}초`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}분 ${r}초` : `${m}분`;
}
function startSpinner(label = "작업 중…"): void {
  stopSpinner();
  let i = 0;
  spinnerTimer = setInterval(() => {
    const el = runStartMs ? chalk.dim(`· ${fmtClock(Date.now() - runStartMs)} 경과 `) : "";
    process.stdout.write(
      `\r\x1b[2K  ${chalk.cyan(SPIN[i % SPIN.length])} ${chalk.dim(label)} ${el}${chalk.dim("· ESC 로 중지")}`,
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
  cm = new ConversationManager(config, pm, safeCwd());
}

// ─── 세션(대화) 저장/복원 ───────────────────────────────
let sessionId = newSessionId();
let sessionCreatedAt = new Date().toISOString();
let sessionTitle = "";
let sessionTurns = 0;

/** 한 턴 끝날 때마다 현재 대화를 세션 파일로 저장한다. */
function persistSession(userMsg: string): void {
  if (!cm) return;
  if (!sessionTitle) sessionTitle = userMsg.replace(/\s+/g, " ").trim().slice(0, 80);
  sessionTurns++;
  saveSession({
    id: sessionId,
    createdAt: sessionCreatedAt,
    updatedAt: new Date().toISOString(),
    cwd: safeCwd(),
    title: sessionTitle,
    turns: sessionTurns,
    messages: cm.getHistory(),
  });
}

/** ISO 시간 → "방금/N분 전/N시간 전/N일 전" */
function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "방금";
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

function homeShort(p: string): string {
  const home = process.env.HOME ?? "";
  return home && p.startsWith(home) ? "~" + p.slice(home.length) : p;
}

/** 메시지에서 텍스트만 뽑기(도구 호출/결과는 건너뜀). */
function msgText(m: { role?: string; content?: unknown }): string {
  if (typeof m.content === "string") return m.content;
  if (Array.isArray(m.content)) return m.content.map((p) => (typeof p === "string" ? p : ((p as { text?: string })?.text ?? ""))).join(" ");
  return "";
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
  sessionId = s.id;
  sessionCreatedAt = s.createdAt;
  sessionTitle = s.title;
  sessionTurns = s.turns;
  console.log("  " + chalk.green("✓ 세션 복원: ") + (s.title || "(제목 없음)") + chalk.dim(`  (${s.turns}턴 · ${relTime(s.updatedAt)})`));
  // 마지막 사용자/어시스턴트 대화를 짧게 리캡
  const lastUser = [...s.messages].reverse().find((m) => m.role === "user");
  const lastAsst = [...s.messages].reverse().find((m) => m.role === "assistant" && msgText(m).trim());
  if (lastUser) console.log("  " + chalk.dim("· 나: ") + chalk.dim(msgText(lastUser).replace(/\s+/g, " ").slice(0, 100)));
  if (lastAsst) console.log("  " + chalk.dim("· AI: ") + chalk.dim(msgText(lastAsst).replace(/\s+/g, " ").slice(0, 100)));
  console.log("  " + chalk.dim("이어서 입력하면 이 대화가 계속됩니다."));
}

// ─── Model Selection ───────────────────────────────────
// HUB 연결이 안 될 때만 쓰는 폴백 목록 (평상시엔 서버에서 받아온다)
const FALLBACK_MODELS: HubModel[] = [
  { id: "gpt-5.6-luna", displayName: "gpt-5.6-luna (기본)", description: "OpenAI GPT-5.6-luna · 고품질 코딩/추론" },
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

async function doUpdate(): Promise<boolean> {
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
  const entry = nodePath.join(installDir(), "dist", "cli", "index.js");
  console.log("  " + chalk.cyan("▸") + " bcave 를 다시 시작합니다…");
  console.log("");
  // stdio 상속으로 대화형 세션을 자식이 그대로 이어받게 함. 업데이트 인자는 제거하고 일반 실행.
  const res = spawnSync(process.execPath, [entry], { stdio: "inherit" });
  process.exit(res.status ?? 0);
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
    const arg = trimmed.slice(7).trim();
    const [sub, ...rest] = arg.split(/\s+/);
    const val = rest.join(" ").trim();
    // 용도별 자동 라우팅 제어
    if (sub === "auto") {
      saveConfig({ autoRoute: true });
      config = loadConfig();
      rebuildCM();
      console.log(chalk.green("  ✓ 자동 라우팅 ON") + chalk.dim(`  (개발/UI → ${config.modelHeavy} · 질문/연산 → ${config.modelLight})`));
      return true;
    }
    if (sub === "heavy" && val) {
      saveConfig({ modelHeavy: val }); config = loadConfig(); rebuildCM();
      console.log(chalk.green(`  ✓ 개발/UI 모델 → ${val}`));
      return true;
    }
    if (sub === "light" && val) {
      saveConfig({ modelLight: val }); config = loadConfig(); rebuildCM();
      console.log(chalk.green(`  ✓ 질문/연산 모델 → ${val}`));
      return true;
    }
    // 특정 모델 직접 지정 → 수동 모드(자동 라우팅 off)
    if (arg) {
      saveConfig({ model: arg, autoRoute: false });
      config = loadConfig();
      rebuildCM();
      console.log(chalk.green(`  ✓ model → ${arg}`) + chalk.dim("  (자동 라우팅 OFF — /model auto 로 복귀)"));
      return true;
    }
    // Interactive model selection
    await selectModel();
    return true;
  }

  if (trimmed === "/verify" || trimmed.startsWith("/verify ")) {
    const arg = trimmed.slice(7).trim().toLowerCase();
    if (arg === "on" || arg === "off") {
      saveConfig({ autoVerify: arg === "on" });
      config = loadConfig();
      rebuildCM();
      console.log(chalk.green(`  ✓ 완료 전 오류 자동 확인 ${arg === "on" ? "ON" : "OFF"}`));
    } else {
      console.log("  " + chalk.dim(`완료 전 오류 자동 확인: ${config.autoVerify ? "ON" : "OFF"}  ·  /verify on|off 로 전환`));
    }
    return true;
  }



  if (trimmed === "/deploy") {
    const deployItems = [
      { label: "검색 노출 중심으로 공개", dimLabel: "1. 검색 노출 중심으로 인터넷에 공개 (Vercel)" },
      { label: "간편하게 인터넷에 공개  ✦ 추천", dimLabel: "2. 화면과 데이터 기능을 한 번에 공개 (Railway)" },
      { label: "여러 지역에서 안정적으로 운영", dimLabel: "3. 이용자와 가까운 지역에서 운영 (Fly.io)" },
      { label: "큰 규모의 회사 서비스", dimLabel: "4. 많은 사용자를 위한 회사용 운영 환경 (AWS)" },
      { label: "회사 서버에서 직접 운영", dimLabel: "5. 보유한 서버에서 직접 관리" },
      { label: "내 컴퓨터에서 먼저 사용", dimLabel: "6. 내 컴퓨터에 저장 ✦ 빠르게 확인하고 나중에 온라인 전환" },
    ];
    const answers = ["vercel", "railway", "fly", "aws", "vps", "local"];
    console.log("\n  " + chalk.bold("서비스를 어디에서 사용할까요?") + chalk.dim("  (↑↓ 방향키·Enter 선택 · ESC 취소)"));
    const idx = await showSelector(deployItems);
    if (idx >= 0) {
      const chosen = answers[idx];
      if (cm) cm.setDeployTarget(chosen);
      console.log(chalk.green(`  ✓ 배포 환경 → ${deployItems[idx].label}`) + chalk.dim("  (다음 서비스 개발부터 적용)"));
    } else {
      console.log(chalk.dim("  취소됨"));
    }
    return true;
  }

  if (trimmed === "/smoke" || trimmed.startsWith("/smoke ")) {
    const arg = trimmed.slice(6).trim().toLowerCase();
    if (arg === "on" || arg === "off") {
      saveConfig({ smokeTest: arg === "on" });
      config = loadConfig();
      rebuildCM();
      console.log(chalk.green(`  ✓ 완성된 서비스 실제 실행 확인 ${arg === "on" ? "ON" : "OFF"}`));
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
  processing = true;
  aborted = false;
  runStartMs = Date.now();
  let autoReply = ""; // 셀렉터 선택 후 다음 턴에 자동으로 보낼 응답
  enterWorkInput();
  startSpinner();
  try {
    // autoReply 가 설정되면 현재 루프를 break 하고 새 gen 으로 재시작한다.
    // (for-await 안에서 gen 을 재할당해도 이터레이터는 바뀌지 않으므로 while 로 감쌈)
    outer: while (true) {
    inner: for await (const event of gen) {
      if (aborted) break outer;
      stopSpinner();

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
            const deployItems = isPostStack ? [
              { label: "간편하게 인터넷에 공개  ✦ 추천", dimLabel: "1. 화면과 데이터 기능을 한 번에 공개" },
              { label: "검색 노출 중심으로 공개", dimLabel: "2. 검색 결과 노출과 첫 화면 속도 중심" },
              { label: "여러 지역에서 안정적으로 운영", dimLabel: "3. 이용자와 가까운 지역에서 운영" },
              { label: "회사 서버에서 직접 운영", dimLabel: "4. 회사가 보유한 운영 환경 사용" },
              { label: "내 컴퓨터에서 먼저 사용", dimLabel: "5. 내 컴퓨터에 저장 ✦ 빠르게 확인하고 나중에 온라인 전환" },
            ] : [
              { label: "검색 노출 중심으로 공개", dimLabel: "1. 검색 결과 노출과 첫 화면 속도 중심" },
              { label: "간편하게 인터넷에 공개  ✦ 추천", dimLabel: "2. 화면과 데이터 기능을 한 번에 공개" },
              { label: "여러 지역에서 안정적으로 운영", dimLabel: "3. 이용자와 가까운 지역에서 운영" },
              { label: "큰 규모의 회사 서비스", dimLabel: "4. 많은 사용자를 위한 회사용 환경" },
              { label: "회사 서버에서 직접 운영", dimLabel: "5. 회사가 보유한 서버에서 직접 관리" },
              { label: "내 컴퓨터에서 먼저 사용", dimLabel: "6. 내 컴퓨터에 저장 ✦ 빠르게 확인하고 나중에 온라인 전환" },
            ];
            const answers = isPostStack
              ? ["1", "2", "3", "4", "5"]
              : ["vercel", "railway", "fly", "aws", "vps", "local"];
            exitWorkInput();
            console.log("\n  " + chalk.bold("서비스를 어디에서 사용할까요?") + chalk.dim("  ↑↓ 선택 · Enter 확인"));
            const idx = await showSelector(deployItems);
            enterWorkInput();
            if (idx >= 0) autoReply = answers[idx];
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
            exitWorkInput();
            console.log("\n  " + chalk.bold("어떤 종류의 서비스로 만들까요?") + chalk.dim("  (↑↓ 방향키·Enter 선택 · ESC 취소)"));
            const idx = await showSelector(stackItems);
            enterWorkInput();
            if (idx >= 0) autoReply = answers[idx];
            break;
          }
          // 디자인시스템 선택 질문 → 방향키 셀렉터로 인터셉트
          if (/디자인 시스템을 선택해 주세요/.test(event.content)) {
            const dsItems = [
              { label: "BCAVE  ✦ 자사 브랜드 기본", dimLabel: "1. BCAVE ✦ 기본/공식 — 자사 브랜드 · 모노톤 슬레이트 · PPT 표지 문법" },
              { label: "AXIS", dimLabel: "2. AXIS — 밝은 코발트 · 모던 프로페셔널" },
            ];
            exitWorkInput();
            console.log("\n  " + chalk.bold("디자인 시스템 선택") + chalk.dim("  (↑↓ 방향키·Enter · ESC 취소)"));
            const idx = await showSelector(dsItems);
            enterWorkInput();
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

      if (!aborted && event.type !== "done") startSpinner();
    } // end for-await

    // for-await 가 끝난 뒤 autoReply 가 있으면 새 턴 실행
    if (autoReply && !aborted) {
      const reply = autoReply;
      autoReply = "";
      console.log("  " + chalk.dim(`↳ 선택: ${reply}`));
      gen = cm!.run(reply, abortController?.signal);
      startSpinner();
      continue; // while 재시작
    }
    break; // autoReply 없음 → 정상 종료
    } // end while outer
  } finally {
    stopSpinner();
    exitWorkInput();
    processing = false;
  }
  const elapsedMs = runStartMs ? Date.now() - runStartMs : 0;
  runStartMs = 0;
  if (aborted) {
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


  abortController = new AbortController();
  let gen = cm.run(trimmed, abortController.signal);
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
  const who = isLoggedIn(config) ? `  ·  ${config.userName || config.userEmail}` : "";
  const modelLabel = config.autoRoute ? `자동(${config.modelHeavy} · ${config.modelLight})` : config.model;

  console.log("  " + chalk.dim(`v0.1.0  ·  ${modelLabel}  ·  ${safeCwd()}${who}`));
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
