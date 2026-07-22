import type { Readable, Writable } from "node:stream";

export interface AuthInputOptions {
  input: Readable;
  output: Writable;
  question: (query: string, callback: (value: string) => void) => void;
  setActive: (active: boolean) => void;
  onInterrupt?: () => void;
}

export function askHidden(query: string, options: AuthInputOptions): Promise<string> {
  return new Promise((resolve) => {
    options.setActive(true);
    options.output.write(query);
    const savedKeypress = options.input.listeners("keypress") as Array<(...args: unknown[]) => void>;
    options.input.removeAllListeners("keypress");
    let password = "";
    const finish = () => {
      options.input.removeListener("data", onData);
      for (const listener of savedKeypress) options.input.on("keypress", listener);
      options.setActive(false);
      options.output.write("\n");
      resolve(password);
    };
    const onData = (buffer: Buffer | string) => {
      for (const character of buffer.toString()) {
        if (character === "\r" || character === "\n") { finish(); return; }
        if (character === "\x7f" || character === "\b") {
          if (password.length) { password = password.slice(0, -1); options.output.write("\b \b"); }
        } else if (character === "\x03") {
          options.setActive(false);
          options.output.write("\n");
          options.onInterrupt?.();
          return;
        } else if (character >= " ") {
          password += character;
          options.output.write("*");
        }
      }
    };
    options.input.on("data", onData);
  });
}

export function askVisible(query: string, options: AuthInputOptions): Promise<string> {
  return new Promise((resolve) => {
    options.setActive(true);
    options.question(query, (value) => {
      options.setActive(false);
      resolve(value);
    });
  });
}
