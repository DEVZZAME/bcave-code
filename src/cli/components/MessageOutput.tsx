import React from "react";
import { Text, Box } from "ink";

interface Props {
  role: "user" | "assistant" | "tool";
  content: string;
  toolName?: string;
}

export function MessageOutput({ role, content, toolName }: Props) {
  if (role === "user") {
    return (
      <Box marginBottom={1} flexDirection="column">
        <Box flexDirection="row" gap={1}>
          <Text color="green" bold>YOU</Text>
          <Text dimColor>──────────────────────────────</Text>
        </Box>
        <Box paddingLeft={2}>
          <Text color="white">{content}</Text>
        </Box>
      </Box>
    );
  }

  if (role === "tool") {
    const truncated = content.length > 600 ? content.slice(0, 600) + "\n  ..." : content;
    return (
      <Box marginBottom={1} flexDirection="column">
        <Box flexDirection="row" gap={1}>
          <Text color="yellow" bold>{"⚙"}</Text>
          <Text color="yellow">{toolName ?? "tool"}</Text>
        </Box>
        <Box
          paddingLeft={2}
          paddingRight={1}
          paddingY={0}
          borderStyle="single"
          borderColor="gray"
          borderLeft={true}
          borderRight={false}
          borderTop={false}
          borderBottom={false}
        >
          <Text dimColor>{truncated}</Text>
        </Box>
      </Box>
    );
  }

  // assistant
  return (
    <Box marginBottom={1} flexDirection="column">
      <Box flexDirection="row" gap={1}>
        <Text color="cyan" bold>BCAVE</Text>
        <Text dimColor>──────────────────────────────</Text>
      </Box>
      <Box
        paddingLeft={2}
        borderStyle="single"
        borderColor="cyan"
        borderLeft={true}
        borderRight={false}
        borderTop={false}
        borderBottom={false}
      >
        <Text color="white">{content}</Text>
      </Box>
    </Box>
  );
}
