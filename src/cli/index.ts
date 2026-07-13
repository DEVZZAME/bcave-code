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
  console.log(chalk.green("✅ API key saved to ~/.bcave/config.json"));
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

// ─── UI Helpers ────────────────────────────────────────
const DIM_LINE = chalk.dim("─".repeat(60));

function box(content: string, color: (s: string) => string = chalk.dim): void {
  const lines = content.split("\n");
  const maxLen = Math.max(...lines.map((l) => stripAnsi(l).length));
  const top = color("╭" + "─".repeat(maxLen + 2) + "╮");
  const bottom = color("╰" + "─".repeat(maxLen + 2) + "╯");
  console.log("  " + top);
  for (const line of lines) {
    const pad = " ".repeat(maxLen - stripAnsi(line).length);
    console.log("  " + color("│") + " " + line + pad + " " + color("│"));
  }
  console.log("  " + bottom);
}

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

// ─── Banner ────────────────────────────────────────────
const BANNER = [
  "",
  chalk.cyan.bold(" ██████╗  ██████╗ █████╗ ██╗   ██╗███████╗") + "  " + chalk.blue.bold("  ██████╗ ██████╗ ██████╗ ███████╗"),
  chalk.cyan.bold(" ██╔══██╗██╔════╝██╔══██╗██║   ██║██╔════╝") + "  " + chalk.blue.bold(" ██╔════╝██╔═══██╗██╔══██╗██╔════╝"),
  chalk.cyan.bold(" ██████╔╝██║     ███████║██║   ██║█████╗  ") + "  " + chalk.blue.bold(" ██║     ██║   ██║██║  ██║█████╗  "),
  chalk.cyan.bold(" ██╔══██╗██║     ██╔══██║╚██╗ ██╔╝██╔══╝  ") + "  " + chalk.blue.bold(" ██║     ██║   ██║██║  ██║██╔══╝  "),
  chalk.cyan.bold(" ██████╔╝╚██████╗██║  ██║ ╚████╔╝ ███████╗") + "  " + chalk.blue.bold(" ╚██████╗╚██████╔╝██████╔╝███████╗"),
  chalk.cyan.bold(" ╚═════╝  ╚═════╝╚═╝  ╚═╝  ╚═══╝  ╚══════╝") + "  " + chalk.blue.bold("  ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝"),
  "",
  "  " + chalk.white.bold("v0.1.0") + chalk.dim("  ·  ") + chalk.gray("OpenAI GPT-4 기반 코딩 에이전트"),
  "",
  "  " + chalk.dim("Shift+Tab") + chalk.dim(" 모드 전환") + chalk.dim("  ·  ") + chalk.dim("/help") + chalk.dim(" 명령어 확인") + chalk.dim("  ·  ") + chalk.dim("Ctrl+C") + chalk.dim(" 종료"),
  "",
].join("\n");

// ─── Mode ──────────────────────────────────────────────
const MODE_ORDER: PermissionMode[] = ["safe", "auto-approve", "yolo"];
const MODE_INFO: Record<PermissionMode, { label: string; color: (s: string) => string; desc: string }> = {
  safe: { label: " SAFE ", color: chalk.bgGreen.black, desc: "모든 작업 전 확인" },
  "auto-approve": { label: " AUTO ", color: chalk.bgYellow.black, desc: "카테고리별 한 번 승인 후 자동" },
  yolo: { label: " YOLO ", color: chalk.bgRed.white, desc: "확인 없이 모두 실행" },
};

function printModeBadge(): void {
  const info = MODE_INFO[mode];
  console.log("  " + info.color(info.label) + " " + chalk.dim(info.desc) + chalk.dim("  ·  ") + chalk.dim(process.cwd()));
  console.log("  " + DIM_LINE);
  console.log("");
}

function cycleMode(): void {
  const idx = MODE_ORDER.indexOf(mode);
  mode = MODE_ORDER[(idx + 1) % MODE_ORDER.length];
  rebuildCM();
  const info = MODE_INFO[mode];
  process.stdout.write("\r\x1b[K");
  console.log("  " + info.color(info.label) + " " + chalk.dim(info.desc));
  console.log("");
}

// ─── Slash Commands ────────────────────────────────────
const COMMANDS = [
  { name: "/help", desc: "도움말 표시" },
  { name: "/api-key", desc: "API 키 변경" },
  { name: "/reset", desc: "설정 초기화" },
  { name: "/model", desc: "모델 변경 (예: /model gpt-4o-mini)" },
  { name: "/mode", desc: "권한 모드 전환" },
];

function slashCompleter(line: string): [string[], string] {
  if (!line.startsWith("/")) return [[], line];
  const matches = COMMANDS
    .filter((c) => c.name.startsWith(line))
    .map((c) => c.name);
  return [matches, line];
}

let lastSuggestionLines = 0;

function clearSuggestions(): void {
  if (lastSuggestionLines > 0) {
    for (let i = 0; i < lastSuggestionLines; i++) {
      process.stdout.write("\x1b[B\x1b[2K");
    }
    for (let i = 0; i < lastSuggestionLines; i++) {
      process.stdout.write("\x1b[A");
    }
    lastSuggestionLines = 0;
  }
}

function showSuggestions(line: string): void {
  clearSuggestions();
  if (!line.startsWith("/") || line.includes(" ")) return;

  const matches = COMMANDS.filter((c) => c.name.startsWith(line));
  if (matches.length === 0 || (matches.length === 1 && matches[0].name === line)) return;

  process.stdout.write("\x1b[s");

  const lines: string[] = [];
  for (const cmd of matches) {
    lines.push(chalk.dim("    ") + chalk.cyan(cmd.name.padEnd(14)) + chalk.dim(cmd.desc));
  }

  process.stdout.write("\n" + lines.join("\n"));
  lastSuggestionLines = lines.length;

  process.stdout.write("\x1b[u");
}

// ─── Readline Setup ────────────────────────────────────
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  completer: slashCompleter,
});

process.stdin.on("keypress", (_str: string, key: readline.Key) => {
  if (key && key.name === "tab" && key.shift) {
    cycleMode();
    prompt();
    return;
  }
});

let currentLine = "";
process.stdin.on("keypress", () => {
  setImmediate(() => {
    const line = (rl as unknown as { line: string }).line ?? "";
    if (line !== currentLine) {
      currentLine = line;
      if (line.startsWith("/")) {
        showSuggestions(line);
      } else {
        clearSuggestions();
      }
    }
  });
});

function prompt(): void {
  currentLine = "";
  lastSuggestionLines = 0;
  rl.question(chalk.green.bold("❯ "), (answer) => {
    clearSuggestions();
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

// ─── API Key Setup ─────────────────────────────────────
async function setupApiKey(): Promise<void> {
  return new Promise((resolve) => {
    console.log("");
    box(
      chalk.cyan.bold("API 키 설정") + "\n" +
      chalk.dim("키는 ~/.bcave/config.json 에 저장됩니다.") + "\n" +
      chalk.dim("발급: https://platform.openai.com/api-keys"),
      chalk.cyan
    );
    console.log("");

    rl.question("  " + chalk.cyan("API Key ") + chalk.dim("▸ "), (key) => {
      const trimmed = key.trim();
      if (!trimmed.startsWith("sk-")) {
        console.log(chalk.red("  ✗ 올바른 OpenAI API 키가 아닙니다. (sk- 로 시작)"));
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
  console.log("  " + chalk.white.bold("명령어"));
  console.log("  " + DIM_LINE);
  console.log("");
  for (const cmd of COMMANDS) {
    console.log("  " + chalk.cyan.bold(cmd.name.padEnd(16)) + chalk.white(cmd.desc));
  }
  console.log("  " + chalk.cyan.bold("Shift+Tab".padEnd(16)) + chalk.white("권한 모드 전환"));
  console.log("  " + chalk.cyan.bold("Tab".padEnd(16)) + chalk.white("명령어 자동 완성"));
  console.log("  " + chalk.cyan.bold("Ctrl+C".padEnd(16)) + chalk.white("BCave 종료"));
  console.log("");
  console.log("  " + DIM_LINE);
  console.log("");
}

async function handleSlashCommand(text: string): Promise<boolean> {
  const trimmed = text.trim();

  if (trimmed === "/help") {
    showHelp();
    return true;
  }

  if (trimmed === "/api-key") {
    await setupApiKey();
    return true;
  }

  if (trimmed === "/reset") {
    const configDir = getConfigDir();
    const configPath = `${configDir}/config.json`;
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath);
    }
    console.log(chalk.green("  ✓ 설정이 초기화되었습니다. BCave를 다시 시작해주세요."));
    process.exit(0);
  }

  if (trimmed.startsWith("/model ")) {
    const newModel = trimmed.slice(7).trim();
    if (!newModel) {
      console.log(chalk.yellow("  사용법: /model <모델명> (예: /model gpt-4o-mini)"));
      return true;
    }
    saveConfig({ model: newModel });
    config = loadConfig();
    rebuildCM();
    console.log(chalk.green(`  ✓ 모델: ${chalk.bold(newModel)}`));
    console.log("");
    return true;
  }

  if (trimmed === "/mode") {
    cycleMode();
    return true;
  }

  if (trimmed.startsWith("/")) {
    console.log(chalk.yellow(`  ✗ 알 수 없는 명령어: ${trimmed}`));
    console.log(chalk.dim("    /help 로 사용 가능한 명령어를 확인하세요."));
    console.log("");
    return true;
  }

  return false;
}

// ─── Agent Events ──────────────────────────────────────
async function processAgentEvents(gen: AsyncGenerator<AgentEvent>): Promise<void> {
  for await (const event of gen) {
    switch (event.type) {
      case "text":
        // Clear "생각 중..." line
        process.stdout.write("\x1b[A\x1b[2K");
        console.log("");
        console.log("  " + chalk.cyan("┃ ") + chalk.cyan.bold("BCAVE"));
        const textLines = event.content.split("\n");
        for (const line of textLines) {
          console.log("  " + chalk.cyan("┃ ") + line);
        }
        console.log("  " + chalk.cyan("┃"));
        console.log("");
        break;

      case "tool_call": {
        const req = event.request;
        console.log("  " + chalk.yellow("┃ ") + chalk.yellow.bold("⚡ 권한 요청"));
        console.log("  " + chalk.yellow("┃ ") + chalk.bold(req.name) + chalk.dim(` (${req.category})`));
        const argLines = JSON.stringify(req.args, null, 2).split("\n");
        for (const line of argLines) {
          console.log("  " + chalk.yellow("┃ ") + chalk.dim(line));
        }
        console.log("  " + chalk.yellow("┃"));

        if (mode === "auto-approve") {
          const answer = await askYesAlwaysNo("  " + chalk.yellow("┃ ") + chalk.yellow("[Y]es / [A]lways / [N]o: "));
          if (answer === "no") {
            cm!.rejectToolCall(req.id);
          } else {
            cm!.approveToolCall(req.id);
          }
        } else {
          const approved = await askYesNo("  " + chalk.yellow("┃ ") + chalk.yellow("[Y]es / [N]o: "));
          if (approved) {
            cm!.approveToolCall(req.id);
          } else {
            cm!.rejectToolCall(req.id);
          }
        }
        console.log("");
        break;
      }

      case "tool_result":
        console.log("  " + chalk.dim("┃ ") + chalk.dim("⚙ " + event.name));
        const resultPreview = event.result.length > 500
          ? event.result.slice(0, 500) + "\n..."
          : event.result;
        const resultLines = resultPreview.split("\n");
        for (const line of resultLines.slice(0, 10)) {
          console.log("  " + chalk.dim("┃ " + line));
        }
        if (resultLines.length > 10) {
          console.log("  " + chalk.dim("┃ ... (" + (resultLines.length - 10) + " more lines)"));
        }
        console.log("");
        break;

      case "error":
        console.log("  " + chalk.red("┃ ") + chalk.red.bold("✗ Error"));
        console.log("  " + chalk.red("┃ ") + event.message);
        console.log("");
        break;

      case "done":
        break;
    }
  }
}

// ─── Main Input Handler ────────────────────────────────
async function handleInput(text: string): Promise<void> {
  const trimmed = text.trim();
  if (!trimmed) {
    prompt();
    return;
  }

  const wasCommand = await handleSlashCommand(trimmed);
  if (wasCommand) {
    prompt();
    return;
  }

  if (!cm) {
    console.log(chalk.yellow("  API 키가 설정되지 않았습니다. /api-key 로 설정해주세요."));
    prompt();
    return;
  }

  console.log("");
  console.log("  " + chalk.green("┃ ") + chalk.green.bold("YOU"));
  console.log("  " + chalk.green("┃ ") + trimmed);
  console.log("  " + chalk.green("┃"));
  console.log("");
  console.log(chalk.cyan("  ⠋ 생각 중..."));

  const gen = cm.run(trimmed);
  await processAgentEvents(gen);
  prompt();
}

// ─── Main ──────────────────────────────────────────────
async function main(): Promise<void> {
  console.clear();
  console.log(BANNER);

  if (!config.apiKey) {
    await setupApiKey();
  } else {
    rebuildCM();
  }

  printModeBadge();

  if (mode === "yolo") {
    console.log("  " + chalk.bgRed.white(" ⚠ ") + " " + chalk.red("모든 권한 확인이 비활성화되었습니다."));
    console.log("");
  }

  if (initialPrompt) {
    await handleInput(initialPrompt);
  } else {
    prompt();
  }
}

rl.on("close", () => {
  console.log("");
  console.log(chalk.dim("  Goodbye! 👋"));
  process.exit(0);
});

main();
