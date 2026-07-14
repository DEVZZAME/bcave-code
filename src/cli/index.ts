#!/usr/bin/env node
import chalk from "chalk";
import readline from "node:readline";
import { loadConfig, saveConfig, getConfigDir, isLoggedIn } from "../config/config.js";
import { ConversationManager, type AgentEvent, type ToolCallRequest } from "../agent/conversation.js";
import { PermissionManager, type PermissionMode } from "../agent/permissions.js";
import type { BcaveConfig } from "../config/config.js";
import { hubLogin, hubLogout, hubListModels, hubUsage, type HubModel } from "../auth/hub.js";
import fs from "node:fs";

// ─── CLI Args ──────────────────────────────────────────
const args = process.argv.slice(2);
let mode: PermissionMode = "safe";
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

  ${chalk.bold("Options")}
    --hub-url <url>                    HUB 주소 지정 (예: http://hub.bcave.internal)
    --model <model>                    모델 변경 (기본: gpt-5.5)
    --auto-approve                     카테고리별 한 번 승인 후 자동
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

// 서브커맨드: `bcave login` / `bcave logout`
let subcommand: "login" | "logout" | null = null;
if (nonFlagArgs[0] === "login" || nonFlagArgs[0] === "logout") {
  subcommand = nonFlagArgs.shift() as "login" | "logout";
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
  { name: "/help", desc: "도움말 표시" },
  { name: "/login", desc: "사내 계정 로그인" },
  { name: "/logout", desc: "로그아웃" },
  { name: "/model", desc: "모델 선택" },
  { name: "/usage", desc: "사용량/한도 확인" },
  { name: "/mode", desc: "모드 전환" },
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

async function showSelector(items: SelectorItem[], initialIndex = 0): Promise<number> {
  return new Promise((resolve) => {
    selectorActive = true;
    let selected = initialIndex;
    const count = items.length;

    const cols = () => (process.stdout.columns || 80) - 1;
    function truncate(s: string, max: number): string {
      if (max <= 1) return "";
      return s.length > max ? s.slice(0, max - 1) + "…" : s;
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
  if (selectorActive || authInputActive) return;
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
  if (selectorActive || authInputActive) return;
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

function askYesNo(question: string): Promise<boolean> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      const lower = answer.trim().toLowerCase();
      resolve(lower === "y" || lower === "yes" || lower === "");
    });
  });
}

function askYesAlwaysNo(question: string): Promise<"yes" | "always" | "no"> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      const lower = answer.trim().toLowerCase();
      if (lower === "a" || lower === "always") resolve("always");
      else if (lower === "n" || lower === "no") resolve("no");
      else resolve("yes");
    });
  });
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

  // Only treat as unknown command if it looks like a slash command, not a file path
  if (trimmed.startsWith("/") && /^\/[a-z-]+$/i.test(trimmed.split(" ")[0]) && !trimmed.includes("/", 1)) {
    console.log(chalk.dim(`  알 수 없는 명령어: ${trimmed} — /help 참고`));
    return true;
  }

  return false;
}

// ─── Agent Events ──────────────────────────────────────
async function processAgentEvents(gen: AsyncGenerator<AgentEvent>): Promise<void> {
  let thinkingCleared = false;

  for await (const event of gen) {
    // Clear "thinking" indicator on first output
    if (!thinkingCleared) {
      process.stdout.write("\x1b[A\r\x1b[2K");
      thinkingCleared = true;
    }

    switch (event.type) {
      case "text":
        console.log("");
        const lines = event.content.split("\n");
        for (const line of lines) {
          console.log("  " + line);
        }
        console.log("");
        break;

      case "tool_call": {
        const req = event.request;
        const argsStr = Object.entries(req.args)
          .map(([k, v]) => `${k}=${typeof v === "string" && v.length > 60 ? v.slice(0, 60) + "…" : v}`)
          .join(", ");

        console.log("  " + chalk.dim("─"));
        console.log("  " + chalk.yellow("⚡") + " " + chalk.bold(req.name) + chalk.dim(`(${argsStr})`));

        if (mode === "auto-approve") {
          const answer = await askYesAlwaysNo("  " + chalk.dim("Allow? ") + chalk.dim("[Y/a/n] "));
          if (answer === "no") { cm!.rejectToolCall(req.id); }
          else { cm!.approveToolCall(req.id); }
        } else {
          const approved = await askYesNo("  " + chalk.dim("Allow? ") + chalk.dim("[Y/n] "));
          if (approved) { cm!.approveToolCall(req.id); }
          else { cm!.rejectToolCall(req.id); }
        }
        break;
      }

      case "tool_result": {
        const preview = event.result.length > 300
          ? event.result.slice(0, 300) + "…"
          : event.result;
        const rLines = preview.split("\n");
        if (rLines.length <= 5) {
          for (const l of rLines) {
            console.log("  " + chalk.dim(l));
          }
        } else {
          for (const l of rLines.slice(0, 4)) {
            console.log("  " + chalk.dim(l));
          }
          console.log("  " + chalk.dim(`… (${rLines.length - 4} more lines)`));
        }
        console.log("  " + chalk.dim("─"));
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

  console.log(chalk.dim("  ⏳ thinking…"));

  const gen = cm.run(trimmed);
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
  if (subcommand === "logout") {
    await doLogout();
    process.exit(0);
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
