#!/usr/bin/env node
import React from "react";
import { render } from "ink";
import meow from "meow";
import { loadConfig, saveConfig } from "../config/config.js";
import { App } from "./App.js";
import type { PermissionMode } from "../agent/permissions.js";

const cli = meow(
  `
  Usage
    $ bcave [prompt]

  Options
    --set-api-key <key>                Set OpenAI API key
    --model <model>                    Set model (default: gpt-4o)
    --auto-approve                     Auto-approve after first approval per category
    --dangerously-skip-permissions     Skip all permission checks

  Examples
    $ bcave "README.md를 한국어로 번역해줘"
    $ bcave --auto-approve "src를 ts로 변환해줘"
    $ bcave --set-api-key sk-xxxxx
`,
  {
    importMeta: import.meta,
    flags: {
      setApiKey: { type: "string" },
      model: { type: "string" },
      autoApprove: { type: "boolean", default: false },
      dangerouslySkipPermissions: { type: "boolean", default: false },
    },
  }
);

if (cli.flags.setApiKey) {
  saveConfig({ apiKey: cli.flags.setApiKey });
  console.log("API key saved to ~/.bcave/config.json");
  process.exit(0);
}

const config = loadConfig();

if (cli.flags.model) {
  config.model = cli.flags.model;
}

const hasApiKey = Boolean(config.apiKey);

let mode: PermissionMode = "safe";
if (cli.flags.dangerouslySkipPermissions) {
  mode = "yolo";
} else if (cli.flags.autoApprove) {
  mode = "auto-approve";
}

const initialPrompt = cli.input.join(" ") || undefined;

render(<App config={config} mode={mode} initialPrompt={initialPrompt} hasApiKey={hasApiKey} />);
