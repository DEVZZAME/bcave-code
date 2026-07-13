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

// --set-api-key
const keyIdx = args.indexOf("--set-api-key");
if (keyIdx !== -1 && args[keyIdx + 1]) {
  saveConfig({ apiKey: args[keyIdx + 1] });
  console.log(chalk.green("✅ API key saved to ~/.bcave/config.json"));
  process.exit(0);
}

// --model
const modelIdx = args.indexOf("--model");
let modelOverride: string | undefined;
if (modelIdx !== -1 && args[modelIdx + 1]) {
  modelOverride = args[modelIdx + 1];
}

// --dangerously-skip-permissions
if (args.includes("--dangerously-skip-permissions")) {
  mode = "yolo";
}
// --auto-approve
else if (args.includes("--auto-approve")) {
  mode = "auto-approve";
}

// --help
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

  ${chalk.bold("Examples")}
    $ bcave "README.md를 한국어로 번역해줘"
    $ bcave --auto-approve "src를 ts로 변환해줘"
`);
  process.exit(0);
}

// Remaining args = initial prompt
const nonFlagArgs = args.filter((a, i) => {
  if (a.startsWith("--")) return false;
  const prev = args[i - 1];
  if (prev === "--set-api-key" || prev === "--model") return false;
  return true;
});
if (nonFlagArgs.length > 0) {
  initialPrompt = nonFlagArgs.join(" ");
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
  "  " + chalk.dim("v0.1.0") + "  " + chalk.gray("OpenAI GPT-4 기반 코딩 에이전트"),
  "  " + chalk.dim("/help 로 사용 가능한 명령어를 확인하세요"),
  "",
].join("\n");

// ─── Mode Helpers ──────────────────────────────────────
const MODE_ORDER: PermissionMode[] = ["safe", "auto-approve", "yolo"];
const MODE_INFO: Record<PermissionMode, { label: string; color: (s: string) => string; desc: string }> = {
  safe: { label: "SAFE", color: chalk.green, desc: "모든 작업 전 확인" },
  "auto-approve": { label: "AUTO-APPROVE", color: chalk.yellow, desc: "카테고리별 한 번 승인 후 자동" },
  yolo: { label: "YOLO", color: chalk.red, desc: "확인 없이 모두 실행" },
};

function printModeBadge(m: PermissionMode): void {
  const info = MODE_INFO[m];
  console.log("  " + info.color(`[${info.label}]`) + chalk.dim(` ${info.desc}  ·  ${process.cwd()}`));
  console.log("");
}

// ─── Readline Setup ────────────────────────────────────
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function prompt(): void {
  rl.question(chalk.green.bold("❯ "), (answer) => {
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
    console.log(chalk.cyan.bold("  API 키 설정"));
    console.log(chalk.dim("  키는 ~/.bcave/config.json 에 저장됩니다."));
    console.log(chalk.dim("  발급: https://platform.openai.com/api-keys"));
    console.log("");

    rl.question(chalk.cyan("  API Key: "), (key) => {
      const trimmed = key.trim();
      if (!trimmed.startsWith("sk-")) {
        console.log(chalk.red("  올바른 OpenAI API 키 형식이 아닙니다. (sk- 로 시작해야 합니다)"));
        setupApiKey().then(resolve);
        return;
      }
      saveConfig({ apiKey: trimmed });
      config = loadConfig();
      console.log(chalk.green("  ✅ API 키가 저장되었습니다."));
      console.log("");
      rebuildCM();
      resolve();
    });
  });
}

// ─── Slash Commands ────────────────────────────────────
function showHelp(): void {
  console.log("");
  console.log(chalk.dim("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
  console.log(chalk.bold("  BCave CODE — 사용 가능한 명령어"));
  console.log(chalk.dim("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
  console.log("");
  console.log("  /help              이 도움말을 표시합니다");
  console.log("  /api-key           API 키를 변경합니다");
  console.log("  /reset             모든 설정을 초기화합니다");
  console.log("  /model <name>      모델을 변경합니다 (예: /model gpt-4o-mini)");
  console.log("  /mode              현재 권한 모드를 전환합니다");
  console.log("  Ctrl+C             BCave를 종료합니다");
  console.log("");
  console.log(chalk.dim("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
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
    console.log(chalk.green("  ✅ 설정이 초기화되었습니다. BCave를 다시 시작해주세요."));
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
    console.log(chalk.green(`  ✅ 모델이 ${chalk.bold(newModel)}(으)로 변경되었습니다.`));
    console.log("");
    return true;
  }

  if (trimmed === "/mode") {
    const idx = MODE_ORDER.indexOf(mode);
    mode = MODE_ORDER[(idx + 1) % MODE_ORDER.length];
    rebuildCM();
    const info = MODE_INFO[mode];
    console.log(chalk.green(`  ✅ 권한 모드: ${info.color(info.label)} — ${info.desc}`));
    console.log("");
    return true;
  }

  if (trimmed.startsWith("/")) {
    console.log(chalk.yellow(`  알 수 없는 명령어: ${trimmed}`));
    console.log(chalk.dim("  /help 로 사용 가능한 명령어를 확인하세요."));
    console.log("");
    return true;
  }

  return false;
}

// ─── Agent Event Processing ────────────────────────────
async function processAgentEvents(gen: AsyncGenerator<AgentEvent>): Promise<void> {
  for await (const event of gen) {
    switch (event.type) {
      case "text":
        console.log("");
        console.log(chalk.cyan.bold("  BCAVE ──"));
        console.log("  " + event.content.split("\n").join("\n  "));
        console.log("");
        break;

      case "tool_call": {
        const req = event.request;
        console.log("");
        console.log(chalk.yellow.bold("  ⚡ Permission Required"));
        console.log(chalk.bold(`  ${req.name}`) + chalk.dim(` (${req.category})`));
        console.log(chalk.dim("  " + JSON.stringify(req.args, null, 2).split("\n").join("\n  ")));
        console.log("");

        if (mode === "auto-approve") {
          const answer = await askYesAlwaysNo(chalk.yellow("  [Y]es / [A]lways / [N]o: "));
          if (answer === "no") {
            cm!.rejectToolCall(req.id);
          } else {
            cm!.approveToolCall(req.id);
          }
        } else {
          const approved = await askYesNo(chalk.yellow("  [Y]es / [N]o: "));
          if (approved) {
            cm!.approveToolCall(req.id);
          } else {
            cm!.rejectToolCall(req.id);
          }
        }
        break;
      }

      case "tool_result":
        console.log(chalk.yellow.dim(`  ⚙ ${event.name}`));
        const resultPreview = event.result.length > 500
          ? event.result.slice(0, 500) + "\n..."
          : event.result;
        console.log(chalk.dim("  " + resultPreview.split("\n").join("\n  ")));
        console.log("");
        break;

      case "error":
        console.log(chalk.red(`  ❌ Error: ${event.message}`));
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
  console.log(chalk.green.bold("  YOU ──"));
  console.log("  " + trimmed);
  console.log("");
  console.log(chalk.cyan("  ⏳ 생각 중..."));

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

  printModeBadge(mode);

  if (mode === "yolo") {
    console.log(chalk.red.bold("  ⚠️  모든 권한 확인이 비활성화되었습니다. 주의하세요!"));
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
