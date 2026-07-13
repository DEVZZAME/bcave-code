import React, { useState, useCallback } from "react";
import { Text, Box } from "ink";
import TextInput from "ink-text-input";
import { saveConfig } from "../../config/config.js";

interface Props {
  onComplete: (apiKey: string) => void;
}

export function ApiKeySetup({ onComplete }: Props) {
  const [input, setInput] = useState("");
  const [error, setError] = useState("");

  const handleSubmit = useCallback(
    (value: string) => {
      const trimmed = value.trim();
      if (!trimmed) {
        setError("API 키를 입력해주세요.");
        return;
      }
      if (!trimmed.startsWith("sk-")) {
        setError("올바른 OpenAI API 키 형식이 아닙니다. (sk- 로 시작해야 합니다)");
        return;
      }
      saveConfig({ apiKey: trimmed });
      onComplete(trimmed);
    },
    [onComplete]
  );

  // Mask the input: show only last 4 characters, rest as asterisks
  const maskedDisplay = input.length > 4
    ? "*".repeat(input.length - 4) + input.slice(-4)
    : input;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={2} paddingY={1}>
      <Text color="cyan" bold>API 키 설정</Text>
      <Box marginTop={1} flexDirection="column" gap={1}>
        <Text>OpenAI API 키를 입력해주세요.</Text>
        <Text dimColor>키는 ~/.bcave/config.json 에 저장됩니다.</Text>
        <Text dimColor>발급: https://platform.openai.com/api-keys</Text>
      </Box>

      <Box marginTop={1} flexDirection="row">
        <Text color="cyan" bold>{"API Key: "}</Text>
        <TextInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          mask="*"
          placeholder="sk-..."
        />
      </Box>

      {error && (
        <Box marginTop={1}>
          <Text color="red">{error}</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text dimColor>Enter를 눌러 저장하세요.</Text>
      </Box>
    </Box>
  );
}
