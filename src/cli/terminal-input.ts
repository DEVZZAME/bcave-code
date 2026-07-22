import type readline from "node:readline";

const PASTE_START = "\x1b[200~";
const PASTE_END = "\x1b[201~";

/** readline의 기본 writer 앞에서 여러 줄 붙여넣기를 한 줄 입력으로 정규화한다. */
export function createBracketedPasteWriter(write: (buffer: Buffer) => void): (buffer: Buffer) => void {
  let pasting = false;
  let accumulated = "";
  return (buffer: Buffer) => {
    let input = buffer.toString("utf8");
    while (input) {
      if (!pasting) {
        const start = input.indexOf(PASTE_START);
        if (start < 0) { write(Buffer.from(input)); return; }
        if (start > 0) write(Buffer.from(input.slice(0, start)));
        pasting = true;
        accumulated = "";
        input = input.slice(start + PASTE_START.length);
      } else {
        const end = input.indexOf(PASTE_END);
        if (end < 0) { accumulated += input.replace(/\r\n|\r|\n/g, " "); return; }
        accumulated += input.slice(0, end).replace(/\r\n|\r|\n/g, " ");
        if (accumulated) write(Buffer.from(accumulated, "utf8"));
        accumulated = "";
        pasting = false;
        input = input.slice(end + PASTE_END.length);
      }
    }
  };
}

export type GlobalKeyAction = "cycle-mode" | "clear-line" | "open-command" | "none";

export function globalKeyAction(character: string, key: readline.Key | undefined, blocked: boolean, line: string): GlobalKeyAction {
  if (blocked) return "none";
  if (key?.name === "tab" && key.shift) return "cycle-mode";
  if (key?.name === "escape" && line.length > 0) return "clear-line";
  if (character === "/" && line === "/") return "open-command";
  return "none";
}
