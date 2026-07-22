import type readline from "node:readline";
import type { ReadStream, WriteStream } from "node:tty";
import { truncateToWidth } from "./terminal-width.js";

export interface SelectorItem {
  label: string;
  dimLabel: string;
}

export interface SelectorOptions {
  input: Pick<ReadStream, "on" | "removeListener" | "resume" | "isRaw" | "setRawMode">;
  output: Pick<WriteStream, "write" | "columns">;
  pause: () => void;
  resume: () => void;
  resetLine: () => void;
  setActive: (active: boolean) => void;
}

export function showTerminalSelector(items: SelectorItem[], options: SelectorOptions, initialIndex = 0): Promise<number> {
  if (!items.length) return Promise.resolve(-1);
  return new Promise((resolve) => {
    options.setActive(true);
    let selected = Math.max(0, Math.min(initialIndex, items.length - 1));
    try { options.pause(); } catch { /* noop */ }
    const previousRawMode = options.input.isRaw;
    try { options.input.setRawMode(true); } catch { /* noop */ }
    options.input.resume();
    const showCursor = () => options.output.write("\x1b[?25h");
    const width = () => Math.max(40, (options.output.columns || 80) - 4);
    let linesDrawn = 0;

    const lineText = (index: number) => {
      const prefix = index === selected ? "  \x1b[36m›\x1b[0m " : "    ";
      const label = truncateToWidth(items[index].dimLabel, width() - 4);
      return prefix + (index === selected ? `\x1b[96m${label}\x1b[0m` : `\x1b[2m${label}\x1b[0m`);
    };
    const render = () => {
      options.output.write("\x1b[?25l");
      if (linesDrawn) options.output.write(`\x1b[${linesDrawn}A`);
      options.output.write(items.map((_item, index) => `\r\x1b[2K${lineText(index)}`).join("\n") + "\n");
      linesDrawn = items.length;
      showCursor();
    };
    const cleanup = (result: number) => {
      if (linesDrawn) {
        options.output.write(`\x1b[${linesDrawn}A`);
        for (let index = 0; index < linesDrawn; index++) options.output.write("\r\x1b[2K\n");
        options.output.write(`\x1b[${linesDrawn}A`);
      }
      showCursor();
      options.input.removeListener("keypress", onKeypress);
      try { options.input.setRawMode(previousRawMode ?? false); } catch { /* noop */ }
      try { options.resume(); } catch { /* noop */ }
      options.resetLine();
      options.setActive(false);
      resolve(result);
    };
    const onKeypress = (character: string, key: readline.Key) => {
      if (key?.name === "up") { selected = (selected - 1 + items.length) % items.length; render(); }
      else if (key?.name === "down") { selected = (selected + 1) % items.length; render(); }
      else if (key?.name === "return" || key?.name === "enter") cleanup(selected);
      else if (key?.name === "escape") cleanup(-1);
      else if (/^[0-9]$/.test(character)) {
        const index = Number(character);
        if (index < items.length) cleanup(index);
      }
    };
    options.input.on("keypress", onKeypress);
    render();
  });
}
