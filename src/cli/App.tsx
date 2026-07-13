import React, { useState, useEffect, useCallback } from "react";
import { Text, Box, useInput, useApp } from "ink";
import TextInput from "ink-text-input";
import { ConversationManager, type AgentEvent, type ToolCallRequest } from "../agent/conversation.js";
import { PermissionManager, type PermissionMode } from "../agent/permissions.js";
import type { BcaveConfig } from "../config/config.js";
import { loadConfig } from "../config/config.js";
import { MessageOutput } from "./components/MessageOutput.js";
import { PermissionPrompt } from "./components/PermissionPrompt.js";
import { Banner } from "./components/Banner.js";
import { ApiKeySetup } from "./components/ApiKeySetup.js";

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

type Screen = "welcome" | "chat" | "config";

export function App({ config, mode, initialPrompt, hasApiKey }: Props) {
  const { exit } = useApp();
  const [screen, setScreen] = useState<Screen>(hasApiKey ? "chat" : "welcome");
  const [activeConfig, setActiveConfig] = useState<BcaveConfig>(config);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [pendingPermission, setPendingPermission] = useState<ToolCallRequest | null>(null);
  const [cm, setCm] = useState<ConversationManager | null>(() => {
    if (!hasApiKey) return null;
    const pm = new PermissionManager(mode);
    return new ConversationManager(config, pm, process.cwd());
  });

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

  const handleSubmit = useCallback(
    (text: string) => {
      if (!text.trim() || isProcessing || !cm) return;

      if (text.trim() === "/config") {
        setInput("");
        setScreen("config");
        return;
      }

      setMessages((prev) => [...prev, { role: "user", content: text }]);
      setInput("");
      setIsProcessing(true);
      const gen = cm.run(text);
      processEvents(gen);
    },
    [cm, isProcessing, processEvents]
  );

  useEffect(() => {
    if (initialPrompt && screen === "chat" && cm) {
      handleSubmit(initialPrompt);
    }
  }, [screen]);

  useInput((_, key) => {
    if (key.ctrl && _.toLowerCase() === "c") {
      exit();
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
      const pm = new PermissionManager(mode);
      const newCm = new ConversationManager(newConfig, pm, process.cwd());
      setCm(newCm);
      setScreen("chat");
    },
    [mode]
  );

  // Welcome / API key setup screen
  if (screen === "welcome") {
    return (
      <Box flexDirection="column" padding={1}>
        <Banner />
        <ApiKeySetup onComplete={handleApiKeyComplete} />
      </Box>
    );
  }

  // Config change screen (triggered by /config command)
  if (screen === "config") {
    return (
      <Box flexDirection="column" padding={1}>
        <Banner compact />
        <ApiKeySetup
          onComplete={(apiKey) => {
            handleApiKeyComplete(apiKey);
            setScreen("chat");
          }}
        />
      </Box>
    );
  }

  // Mode badge
  const modeBadge: Record<PermissionMode, { label: string; color: string }> = {
    safe: { label: "SAFE", color: "green" },
    "auto-approve": { label: "AUTO-APPROVE", color: "yellow" },
    yolo: { label: "YOLO", color: "red" },
  };
  const badge = modeBadge[mode];

  // Chat screen
  return (
    <Box flexDirection="column" padding={1}>
      <Banner compact />

      <Box marginBottom={1} flexDirection="row" gap={2}>
        <Box borderStyle="round" borderColor={badge.color} paddingX={1}>
          <Text color={badge.color as "green" | "yellow" | "red"} bold>{badge.label}</Text>
        </Box>
        <Text dimColor>{process.cwd()}</Text>
        <Text dimColor>  /config — API 키 변경</Text>
      </Box>

      {messages.map((msg, i) => (
        <MessageOutput key={i} role={msg.role} content={msg.content} toolName={msg.toolName} />
      ))}

      {pendingPermission && (
        <PermissionPrompt
          request={pendingPermission}
          isAutoApprove={mode === "auto-approve"}
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
          <TextInput value={input} onChange={setInput} onSubmit={handleSubmit} />
        </Box>
      )}
    </Box>
  );
}
