import chalk from "chalk";
import type { Readable, Writable } from "node:stream";
import { formatClock } from "./rendering.js";

const FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export interface WorkSessionOptions {
  input: Readable;
  output: Writable;
  pause: () => void;
  resume: () => void;
}

export class WorkSession {
  processing = false;
  aborted = false;
  private controller: AbortController | null = null;
  private startedAt = 0;
  private spinner: ReturnType<typeof setInterval> | null = null;
  private rawListener: ((buffer: Buffer) => void) | null = null;

  constructor(private readonly options: WorkSessionOptions) {}

  get signal(): AbortSignal | undefined { return this.controller?.signal; }

  begin(): void {
    this.processing = true;
    this.aborted = false;
    this.startedAt = Date.now();
    this.controller = new AbortController();
    this.lockInput();
    this.startSpinner();
  }

  lockInput(): void {
    if (this.rawListener) return;
    try { this.options.pause(); } catch { /* noop */ }
    this.rawListener = (buffer) => {
      if (!buffer.includes(0x1b)) return;
      this.aborted = true;
      this.controller?.abort();
      this.stopSpinner();
      this.options.output.write(`  ${chalk.yellow("■ 중지 중…")}\n`);
    };
    this.options.input.on("data", this.rawListener);
    try { this.options.input.resume(); } catch { /* noop */ }
  }

  unlockInput(): void {
    if (this.rawListener) this.options.input.removeListener("data", this.rawListener);
    this.rawListener = null;
    try { this.options.resume(); } catch { /* noop */ }
  }

  startSpinner(label = "작업 중…"): void {
    this.stopSpinner();
    let index = 0;
    this.spinner = setInterval(() => {
      const elapsed = this.startedAt ? chalk.dim(`· ${formatClock(Date.now() - this.startedAt)} 경과 `) : "";
      this.options.output.write(`\r\x1b[2K  ${chalk.cyan(FRAMES[index % FRAMES.length])} ${chalk.dim(label)} ${elapsed}${chalk.dim("· ESC 로 중지")}`);
      index++;
    }, 80);
  }

  stopSpinner(): void {
    if (!this.spinner) return;
    clearInterval(this.spinner);
    this.spinner = null;
    this.options.output.write("\r\x1b[2K");
  }

  finish(): number {
    this.stopSpinner();
    this.unlockInput();
    this.processing = false;
    const elapsed = this.startedAt ? Date.now() - this.startedAt : 0;
    this.startedAt = 0;
    this.controller = null;
    return elapsed;
  }
}
