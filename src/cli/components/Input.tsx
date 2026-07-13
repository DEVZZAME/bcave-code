import React, { useState, useEffect } from "react";
import { Text, useStdin } from "ink";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  placeholder?: string;
  mask?: string;
}

export function Input({ value, onChange, onSubmit, placeholder, mask }: Props) {
  const { stdin, setRawMode } = useStdin();

  useEffect(() => {
    setRawMode(true);

    const handleData = (data: Buffer) => {
      const s = data.toString();

      // Ctrl+C
      if (s === "\x03") {
        process.exit(0);
      }

      // Enter
      if (s === "\r" || s === "\n") {
        onSubmit(value);
        return;
      }

      // Backspace
      if (s === "\x7f" || s === "\b") {
        onChange(value.slice(0, -1));
        return;
      }

      // Ignore other control characters (except Shift+Tab which is handled by useInput in parent)
      if (s.charCodeAt(0) < 32 && s !== "\t") {
        return;
      }

      // Escape sequences (arrows, etc) — ignore
      if (s.startsWith("\x1b")) {
        return;
      }

      // Normal text (including Korean IME)
      onChange(value + s);
    };

    stdin.on("data", handleData);
    return () => {
      stdin.off("data", handleData);
    };
  }, [value, onChange, onSubmit, stdin, setRawMode]);

  const displayValue = mask && value
    ? mask.repeat(value.length)
    : value;

  if (!displayValue && placeholder) {
    return <Text dimColor>{placeholder}</Text>;
  }

  return <Text>{displayValue}</Text>;
}
