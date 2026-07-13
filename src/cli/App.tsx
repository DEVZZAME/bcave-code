import React, { useState, useEffect, useCallback } from "react";
import { Text, Box, useInput, useApp } from "ink";
import fs from "node:fs";
import { ConversationManager, type AgentEvent, type ToolCallRequest } from "../agent/conversation.js";
import { PermissionManager, type PermissionMode } from "../agent/permissions.js";
import type { BcaveConfig } from "../config/config.js";
import { loadConfig, saveConfig, getConfigDir } from "../config/config.js";
import { MessageOutput } from "./components/MessageOutput.js";
import { PermissionPrompt } from "./components/PermissionPrompt.js";
import { Banner } from "./components/Banner.js";
import { ApiKeySetup } from "./components/ApiKeySetup.js";
import { Input } from "./components/Input.js";

interface Props {
  config: BcaveConfig;
  mode: PermissionMode;
  initialPrompt?: string;
  hasApiKey: boolean;
}

interface Message {
  role: "user" | "assistant" | "tool";
  content: string;
  toolName?: string;
}

type Screen = "welcome" | "chat" | "apikey";

const MODE_ORDER: PermissionMode[] = ["safe", "auto-approve", "yolo"];
const MODE_LABELS: Record<PermissionMode, { label: string; color: string; desc: string }> = {
  safe: { label: "SAFE", color: "green", desc: "모든 작업 전 확인" },
  "auto-approve": { label: "AUTO-APPROVE", color: "yellow", desc: "카테고리별 한 번 승인 후 자동" },
  yolo: { label: "YOLO", color: "red", desc: "확인 없이 모두 실행" },
};

export function App({ config, mode: initialMode, initialPrompt, hasApiKey }: Props) {
  const { exit } = useApp();
  const [screen, setScreen] = useState<Screen>(hasApiKey ? "chat" : "welcome");
  const [activeConfig, setActiveConfig] = useState<BcaveConfig>(config);
  const [currentMode, setCurrentMode] = useState<PermissionMode>(initialMode);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingPermission, setPendingPermission] = useState<ToolCallRequest | null>(null);
  const [cm, setCm] = useState<ConversationManager | null>(() => {
    if (!hasApiKey) return null;
    const pm = new PermissionManager(initialMode);
    return new ConversationManager(config, pm, process.cwd());
  });

  const rebuildConversationManager = useCallback(
    (cfg: BcaveConfig, mode: PermissionMode) => {
      const pm = new PermissionManager(mode);
      const newCm = new ConversationManager(cfg, pm, process.cwd());
      setCm(newCm);
      return newCm;
    },
    []
  );

  const processEvents = useCallback(async (gen: AsyncGenerator<AgentEvent>) => {
    for await (const event of gen) {
      switch (event.type) {
        case "text":
          setMessages((prev) => [...prev, { role: "assistant", content: event.content }]);
          break;
        case "tool_call":
          setPendingPermission(event.request);
          break;
        case "tool_result":
          setMessages((prev) => [
            ...prev,
            { role: "tool", content: event.result, toolName: event.name },
          ]);
          break;
        case "error":
          setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${event.message}` }]);
          break;
        case "done":
          break;
      }
    }
    setIsProcessing(false);
  }, []);

  const showHelp = useCallback(() => {
    const helpText = [
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      "  BCave CODE — 사용 가능한 명령어",
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
      "",
      "  /help          이 도움말을 표시합니다",
      "  /api-key       API 키를 변경합니다",
      "  /reset         모든 설정을 초기화합니다",
      "  /model <name>  모델을 변경합니다 (예: /model gpt-4o-mini)",
      "  /mode          현재 권한 모드를 표시합니다",
      "  Shift+Tab      권한 모드를 전환합니다",
      "  Ctrl+C         BCave를 종료합니다",
      "",
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    ].join("\n");
    setMessages((prev) => [...prev, { role: "assistant", content: helpText }]);
  }, []);

  const handleSlashCommand = useCallback(
    (text: string): boolean => {
      const trimmed = text.trim();

      if (trimmed === "/help") {
        showHelp();
        return true;
      }

      if (trimmed === "/api-key") {
        setScreen("apikey");
        return true;
      }

      if (trimmed === "/reset") {
        const configDir = getConfigDir();
        const configPath = `${configDir}/config.json`;
        if (fs.existsSync(configPath)) {
          fs.unlinkSync(configPath);
        }
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "설정이 초기화되었습니다. BCave를 다시 시작해주세요." },
        ]);
        setCm(null);
        return true;
      }

      if (trimmed.startsWith("/model ")) {
        const newModel = trimmed.slice(7).trim();
        if (!newModel) {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: "사용법: /model <모델명> (예: /model gpt-4o-mini)" },
          ]);
          return true;
        }
        saveConfig({ model: newModel });
        const newConfig = loadConfig();
        setActiveConfig(newConfig);
        rebuildConversationManager(newConfig, currentMode);
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `모델이 ${newModel}(으)로 변경되었습니다.` },
        ]);
        return true;
      }

      if (trimmed === "/mode") {
        const info = MODE_LABELS[currentMode];
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `현재 권한 모드: ${info.label} — ${info.desc}\nShift+Tab 으로 전환할 수 있습니다.` },
        ]);
        return true;
      }

      if (trimmed.startsWith("/")) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: `알 수 없는 명령어: ${trimmed}\n/help 로 사용 가능한 명령어를 확인하세요.` },
        ]);
        return true;
      }

      return false;
    },
    [currentMode, showHelp, rebuildConversationManager]
  );

  const handleSubmit = useCallback(
    (text: string) => {
      if (!text.trim() || isProcessing) return;

      setInput("");

      if (handleSlashCommand(text)) return;

      if (!cm) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "API 키가 설정되지 않았습니다. /api-key 로 설정해주세요." },
        ]);
        return;
      }

      setMessages((prev) => [...prev, { role: "user", content: text }]);
      setIsProcessing(true);
      const gen = cm.run(text);
      processEvents(gen);
    },
    [cm, isProcessing, processEvents, handleSlashCommand]
  );

  useEffect(() => {
    if (initialPrompt && screen === "chat" && cm) {
      handleSubmit(initialPrompt);
    }
  }, [screen]);

  // Shift+Tab to cycle modes + Ctrl+C to exit
  useInput((ch, key) => {
    if (key.ctrl && ch.toLowerCase() === "c") {
      exit();
    }

    if (key.shift && key.tab && screen === "chat" && !isProcessing) {
      setCurrentMode((prev) => {
        const idx = MODE_ORDER.indexOf(prev);
        const nextMode = MODE_ORDER[(idx + 1) % MODE_ORDER.length];
        rebuildConversationManager(activeConfig, nextMode);
        return nextMode;
      });
    }
  });

  const handleApprove = useCallback(() => {
    if (pendingPermission && cm) {
      cm.approveToolCall(pendingPermission.id);
      setPendingPermission(null);
    }
  }, [cm, pendingPermission]);

  const handleAlways = useCallback(() => {
    if (pendingPermission && cm) {
      cm.approveToolCall(pendingPermission.id);
      setPendingPermission(null);
    }
  }, [cm, pendingPermission]);

  const handleReject = useCallback(() => {
    if (pendingPermission && cm) {
      cm.rejectToolCall(pendingPermission.id);
      setPendingPermission(null);
    }
  }, [cm, pendingPermission]);

  const handleApiKeyComplete = useCallback(
    (apiKey: string) => {
      const newConfig = loadConfig();
      setActiveConfig(newConfig);
      rebuildConversationManager(newConfig, currentMode);
      setScreen("chat");
    },
    [currentMode, rebuildConversationManager]
  );

  // Welcome screen (no API key)
  if (screen === "welcome") {
    return (
      <Box flexDirection="column" padding={1}>
        <Banner />
        <ApiKeySetup onComplete={handleApiKeyComplete} />
      </Box>
    );
  }

  // API key change screen
  if (screen === "apikey") {
    return (
      <Box flexDirection="column" padding={1}>
        <Banner />
        <ApiKeySetup onComplete={handleApiKeyComplete} />
      </Box>
    );
  }

  // Mode badge
  const badge = MODE_LABELS[currentMode];

  // Chat screen
  return (
    <Box flexDirection="column" padding={1}>
      <Banner />

      <Box marginBottom={1} flexDirection="row" gap={2}>
        <Box borderStyle="round" borderColor={badge.color} paddingX={1}>
          <Text color={badge.color as "green" | "yellow" | "red"} bold>{badge.label}</Text>
        </Box>
        <Text dimColor>{process.cwd()}</Text>
        <Text dimColor>Shift+Tab: 모드 전환</Text>
      </Box>

      {messages.map((msg, i) => (
        <MessageOutput key={i} role={msg.role} content={msg.content} toolName={msg.toolName} />
      ))}

      {pendingPermission && (
        <PermissionPrompt
          request={pendingPermission}
          isAutoApprove={currentMode === "auto-approve"}
          onApprove={handleApprove}
          onAlways={handleAlways}
          onReject={handleReject}
        />
      )}

      {isProcessing && !pendingPermission && (
        <Box flexDirection="row" gap={1}>
          <Text color="cyan">{"⏳"}</Text>
          <Text color="cyan" dimColor>생각 중...</Text>
        </Box>
      )}

      {!isProcessing && (
        <Box marginTop={1} flexDirection="row">
          <Text color="green" bold>{"❯ "}</Text>
          <Input
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            placeholder="메시지를 입력하세요..."
          />
        </Box>
      )}
    </Box>
  );
}
