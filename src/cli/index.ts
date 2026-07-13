#!/usr/bin/env node
import chalk from "chalk";
import readline from "node:readline";
import { loadConfig, saveConfig, getConfigDir } from "../config/config.js";
import { ConversationManager, type AgentEvent, type ToolCallRequest } from "../agent/conversation.js";
import { PermissionManager, type PermissionMode } from "../agent/permissions.js";
import type { BcaveConfig } from "../config/config.js";
import fs from "node:fs";

// ─── CLI Args ──────────────────────────────────────────
const args = process.argv.slice(2);
let mode: PermissionMode = "safe";
let initialPrompt: string | undefined;

const keyIdx = args.indexOf("--set-api-key");
if (keyIdx !== -1 && args[keyIdx + 1]) {
  saveConfig({ apiKey: args[keyIdx + 1] });
  console.log(chalk.green("✓ API key saved."));
  process.exit(0);
}

const modelIdx = args.indexOf("--model");
let modelOverride: string | undefined;
if (modelIdx !== -1 && args[modelIdx + 1]) {
  modelOverride = args[modelIdx + 1];
}

if (args.includes("--dangerously-skip-permissions")) {
  mode = "yolo";
} else if (args.includes("--auto-approve")) {
  mode = "auto-approve";
}

if (args.includes("--help") || args.includes("-h")) {
  console.log(`
  ${chalk.cyan.bold("BCave CODE")} — OpenAI GPT-4 기반 코딩 에이전트

  ${chalk.bold("Usage")}
    $ bcave [prompt]

  ${chalk.bold("Options")}
    --set-api-key <key>                API 키 설정
    --model <model>                    모델 변경 (기본: gpt-4o)
    --auto-approve                     카테고리별 한 번 승인 후 자동
    --dangerously-skip-permissions     모든 권한 확인 건너뛰기
`);
  process.exit(0);
}

const nonFlagArgs = args.filter((a, i) => {
  if (a.startsWith("--")) return false;
  const prev = args[i - 1];
  if (prev === "--set-api-key" || prev === "--model") return false;
  return true;
});
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
  { name: "/api-key", desc: "API 키 변경" },
  { name: "/model", desc: "모델 선택" },
  { name: "/mode", desc: "모드 전환" },
  { name: "/reset", desc: "설정 초기화" },
];

// Tab completion for slash commands
function slashCompleter(line: string): [string[], string] {
  if (!line.startsWith("/")) return [[], line];
  const matches = COMMANDS.filter((c) => c.name.startsWith(line));
  if (matches.length === 0) return [[], line];
  const completions = matches.map((c) => c.name);
  if (completions.length === 1) return [completions, line];
  // Show names for display
  return [completions, line];
}

// ─── Readline ──────────────────────────────────────────
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  completer: slashCompleter,
});

// Shift+Tab: mode cycle
process.stdin.on("keypress", (_str: string, key: readline.Key) => {
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
const MODELS = [
  { id: "gpt-4o", desc: "가장 강력한 모델. 복잡한 코딩과 분석에 적합." },
  { id: "gpt-4o-mini", desc: "빠르고 가성비 좋은 모델. 간단한 작업에 적합." },
  { id: "gpt-4.1", desc: "코딩 특화 모델. 정확한 코드 생성." },
  { id: "gpt-4.1-mini", desc: "코딩 특화 경량 모델." },
  { id: "gpt-4.1-nano", desc: "가장 빠른 초경량 모델." },
  { id: "o4-mini", desc: "추론 특화 모델. 복잡한 문제 해결." },
];

async function selectModel(): Promise<void> {
  return new Promise((resolve) => {
    let selected = MODELS.findIndex((m) => m.id === config.model);
    if (selected === -1) selected = 0;

    function render(): void {
      // Clear previous render
      process.stdout.write(`\x1b[${MODELS.length + 3}A`);
      for (let i = 0; i < MODELS.length + 3; i++) {
        process.stdout.write("\r\x1b[2K\n");
      }
      process.stdout.write(`\x1b[${MODELS.length + 3}A`);

      console.log("");
      console.log(chalk.bold("  Select Model"));
      console.log("");
      for (let i = 0; i < MODELS.length; i++) {
        const m = MODELS[i];
        const current = m.id === config.model ? chalk.dim(" (current)") : "";
        if (i === selected) {
          console.log(chalk.cyan(`  › ${(i + 1)}. ${chalk.bold(m.id)}${current}  ${chalk.dim(m.desc)}`));
        } else {
          console.log(chalk.dim(`    ${(i + 1)}. ${m.id}${current}  ${m.desc}`));
        }
      }
    }

    // Initial render - print blank lines first so we can overwrite
    for (let i = 0; i < MODELS.length + 3; i++) {
      console.log("");
    }
    render();

    const onKeypress = (_str: string, key: readline.Key) => {
      if (!key) return;

      if (key.name === "up" || (key.name === "k")) {
        selected = (selected - 1 + MODELS.length) % MODELS.length;
        render();
      } else if (key.name === "down" || (key.name === "j")) {
        selected = (selected + 1) % MODELS.length;
        render();
      } else if (key.name === "return") {
        process.stdin.removeListener("keypress", onKeypress);
        const chosen = MODELS[selected];
        saveConfig({ model: chosen.id });
        config = loadConfig();
        rebuildCM();
        console.log("");
        console.log(chalk.green(`  ✓ model → ${chalk.bold(chosen.id)}`));
        console.log("");
        resolve();
      } else if (key.name === "escape" || (key.ctrl && key.name === "c")) {
        process.stdin.removeListener("keypress", onKeypress);
        console.log("");
        console.log(chalk.dim("  취소됨"));
        console.log("");
        resolve();
      } else if (_str >= "1" && _str <= String(MODELS.length)) {
        // Number key selection
        selected = parseInt(_str) - 1;
        process.stdin.removeListener("keypress", onKeypress);
        const chosen = MODELS[selected];
        saveConfig({ model: chosen.id });
        config = loadConfig();
        rebuildCM();
        render();
        console.log("");
        console.log(chalk.green(`  ✓ model → ${chalk.bold(chosen.id)}`));
        console.log("");
        resolve();
      }
    };

    process.stdin.on("keypress", onKeypress);
  });
}

// ─── API Key Setup ─────────────────────────────────────
async function setupApiKey(): Promise<void> {
  return new Promise((resolve) => {
    console.log("");
    console.log(chalk.bold("  API 키를 입력해주세요."));
    console.log(chalk.dim("  키는 ~/.bcave/config.json에 저장됩니다."));
    console.log("");

    rl.question(chalk.dim("  API Key > "), (key) => {
      const trimmed = key.trim();
      if (!trimmed.startsWith("sk-")) {
        console.log(chalk.red("  올바른 API 키가 아닙니다 (sk- 로 시작해야 함)"));
        setupApiKey().then(resolve);
        return;
      }
      saveConfig({ apiKey: trimmed });
      config = loadConfig();
      console.log(chalk.green("  ✓ API 키 저장 완료"));
      console.log("");
      rebuildCM();
      resolve();
    });
  });
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

  if (trimmed === "/api-key") { await setupApiKey(); return true; }

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
  const trimmed = text.trim();
  if (!trimmed) {
    // Clear the empty separator+prompt and re-draw
    process.stdout.write("\x1b[A\r\x1b[2K");
    prompt();
    return;
  }

  if (await handleSlashCommand(trimmed)) { prompt(); return; }

  if (!cm) {
    console.log(chalk.dim("  API 키가 없습니다. /api-key 로 설정하세요."));
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
  console.log(
    chalk.cyan.bold(" ██████╗  ██████╗ █████╗ ██╗   ██╗███████╗") + "  " +
    chalk.blue.bold("  ██████╗ ██████╗ ██████╗ ███████╗")
  );
  console.log(
    chalk.cyan.bold(" ██╔══██╗██╔════╝██╔══██╗██║   ██║██╔════╝") + "  " +
    chalk.blue.bold(" ██╔════╝██╔═══██╗██╔══██╗██╔════╝")
  );
  console.log(
    chalk.cyan.bold(" ██████╔╝██║     ███████║██║   ██║█████╗  ") + "  " +
    chalk.blue.bold(" ██║     ██║   ██║██║  ██║█████╗  ")
  );
  console.log(
    chalk.cyan.bold(" ██╔══██╗██║     ██╔══██║╚██╗ ██╔╝██╔══╝  ") + "  " +
    chalk.blue.bold(" ██║     ██║   ██║██║  ██║██╔══╝  ")
  );
  console.log(
    chalk.cyan.bold(" ██████╔╝╚██████╗██║  ██║ ╚████╔╝ ███████╗") + "  " +
    chalk.blue.bold(" ╚██████╗╚██████╔╝██████╔╝███████╗")
  );
  console.log(
    chalk.cyan.bold(" ╚═════╝  ╚═════╝╚═╝  ╚═╝  ╚═══╝  ╚══════╝") + "  " +
    chalk.blue.bold("  ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝")
  );
  console.log("");
  console.log("  " + chalk.dim(`v0.1.0  ·  ${config.model}  ·  ${process.cwd()}`));
  console.log("  " + chalk.dim("Shift+Tab 모드 전환  ·  /help 명령어  ·  Ctrl+C 종료"));
  console.log("");

  if (!config.apiKey) {
    await setupApiKey();
  } else {
    rebuildCM();
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
