import React from "react";
import { Text, Box, Newline } from "ink";

interface Props {
  compact?: boolean;
}

const ASCII_ART = [
  " ██████╗  ██████╗ █████╗ ██╗   ██╗███████╗",
  " ██╔══██╗██╔════╝██╔══██╗██║   ██║██╔════╝",
  " ██████╔╝██║     ███████║██║   ██║█████╗  ",
  " ██╔══██╗██║     ██╔══██║╚██╗ ██╔╝██╔══╝  ",
  " ██████╔╝╚██████╗██║  ██║ ╚████╔╝ ███████╗",
  " ╚═════╝  ╚═════╝╚═╝  ╚═╝  ╚═══╝  ╚══════╝",
];

const CODE_ART = [
  "  ██████╗ ██████╗ ██████╗ ███████╗",
  " ██╔════╝██╔═══██╗██╔══██╗██╔════╝",
  " ██║     ██║   ██║██║  ██║█████╗  ",
  " ██║     ██║   ██║██║  ██║██╔══╝  ",
  " ╚██████╗╚██████╔╝██████╔╝███████╗",
  "  ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝",
];

export function Banner({ compact = false }: Props) {
  if (compact) {
    return (
      <Box flexDirection="row" gap={1} marginBottom={1}>
        <Text color="cyan" bold>BCAVE</Text>
        <Text color="blue" bold>CODE</Text>
        <Text dimColor>v0.1.0</Text>
        <Text dimColor>—</Text>
        <Text color="gray">OpenAI GPT-4 기반 코딩 에이전트</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginBottom={1} alignItems="center">
      <Box flexDirection="row">
        <Box flexDirection="column">
          {ASCII_ART.map((line, i) => (
            <Text key={i} color="cyan" bold>{line}</Text>
          ))}
        </Box>
        <Box flexDirection="column" marginLeft={1}>
          {CODE_ART.map((line, i) => (
            <Text key={i} color="blue" bold>{line}</Text>
          ))}
        </Box>
      </Box>
      <Box marginTop={1} flexDirection="row" gap={2}>
        <Text color="cyan" dimColor>v0.1.0</Text>
        <Text color="gray">OpenAI GPT-4 기반 코딩 에이전트</Text>
      </Box>
    </Box>
  );
}
