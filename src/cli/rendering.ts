import chalk from "chalk";
import { displayWidth } from "./terminal-width.js";

export function shortenPath(value: string, modeLabel: string, columns: number, home: string): string {
  const relative = value.startsWith(home) ? `~${value.slice(home.length)}` : value;
  const maximum = Math.max(15, columns - displayWidth(modeLabel) - 5);
  if (displayWidth(relative) <= maximum) return relative;
  const parts = value.replace(home, "~").split("/").filter(Boolean);
  return `${value.startsWith(home) ? "~" : ""}/…/${parts.slice(-2).join("/")}`;
}

export function readlineAnsi(value: string): string {
  return value.replace(/\x1b\[[0-9;]*m/g, (match) => `\x01${match}\x02`);
}

export function toolStatus(name: string, args: Record<string, unknown>): string {
  const basename = (value: string) => {
    const result = (value.split("/").pop() || value).trim();
    return result.length > 42 ? `${result.slice(0, 42)}…` : result;
  };
  const target = (value: string) => value ? `  ${chalk.dim(basename(value))}` : "";
  const filePath = typeof args.path === "string" ? args.path : "";
  if (name === "read_file") return `파일 읽는 중${target(filePath)}`;
  if (name === "write_file") return `파일 작성 중${target(filePath)}`;
  if (name === "list_files") return `폴더 살펴보는 중${target(filePath)}`;
  if (name === "search_files") return "검색 중";
  if (name === "shell_exec") {
    const command = String(args.command ?? "").replace(/\s+/g, " ").trim();
    const summary = command.length > 46 ? `${command.slice(0, 46)}…` : command;
    return `작업 중${summary ? `  ${chalk.dim(summary)}` : ""}`;
  }
  return name;
}

function shellErrorReason(result: string): string {
  const index = result.indexOf("STDERR:");
  const tail = index >= 0 ? result.slice(index + 7) : result.replace(/^Exit code \d+\n?/, "");
  const line = tail.split("\n").map((value) => value.trim()).find((value) => value && !/^Exit code/.test(value));
  return line && line.length > 90 ? `${line.slice(0, 90)}…` : line ?? "";
}

export function toolResultLine(name: string, result: string): string | null {
  const value = (result || "").trim();
  const exit = value.match(/^Exit code (\d+)/);
  if (exit) {
    const reason = shellErrorReason(value);
    return chalk.yellow("    ⚠ 실패") + chalk.dim(` (exit ${exit[1]})${reason ? ` · ${reason}` : ""}`);
  }
  if (/^(Error|Invalid regular expression)/.test(value)) return chalk.yellow("    ⚠ ") + chalk.dim(value.split("\n")[0].slice(0, 110));
  if (/^\[바이너리/.test(value)) return null;
  if (name === "write_file") {
    if (/^File not written\./.test(value)) return chalk.red("    ✗ 저장 안 됨") + chalk.dim(` · ${value.replace(/^File not written\.\s*/, "").split("\n")[0].slice(0, 100)}`);
    if (/^File written but NOT complete:/.test(value)) {
      const attempt = value.match(/수정 시도 (\d+)/)?.[1];
      return chalk.yellow("    ↻ 자동 교정 중") + chalk.dim(` · ${attempt ? `${attempt}차 검토에서 ` : ""}재작성 필요`);
    }
    if (/⚠/.test(value)) {
      const detail = value.split("\n").slice(1).join(" ").replace(/\s+/g, " ").trim().slice(0, 90);
      return chalk.yellow("    ⚠ 검토 경고") + (detail ? chalk.dim(` · ${detail}`) : "");
    }
    return chalk.dim("    ✓ 저장됨");
  }
  if (name === "shell_exec") {
    if (value.startsWith("[SERVER_START_FAILED]")) return chalk.red("    ✗ 서비스가 아직 열리지 않습니다") + chalk.dim(" · 원인을 확인하고 다시 시도합니다");
    if (value.startsWith("[SERVER_STARTED]")) {
      const url = value.match(/https?:\/\/[^\s]+/)?.[0];
      return chalk.green("    ✓ 서비스 화면이 정상적으로 열립니다") + chalk.dim(url ? ` · ${url}` : "");
    }
    const first = value.split("\n").map((line) => line.trim()).find(Boolean);
    return chalk.dim(`    ✓ 완료${first ? ` · ${first.length > 80 ? `${first.slice(0, 80)}…` : first}` : ""}`);
  }
  return null;
}

export function friendlyVerifyLabel(command: string): string {
  if (/화면 기능|완성도/.test(command)) return "화면에 보이는 기능이 모두 동작하는지 확인";
  if (/스키마|DB/i.test(command)) return "입력한 내용이 저장되는지 확인";
  if (/proxy|API/i.test(command)) return "화면과 데이터가 연결되는지 확인";
  if (/서버|스모크|health/i.test(command)) return "서비스가 실제로 열리는지 확인";
  return "코드 오류 확인";
}

export function friendlyErrorMessage(message: string): string {
  if (/서버 실행|서비스 실행|SERVER_START|HTTP 응답/i.test(message)) return "서비스가 아직 정상적으로 열리지 않습니다. 원인을 확인했지만 자동으로 해결하지 못했습니다.";
  if (/DB 스키마|schema|INSERT/i.test(message)) return "입력한 내용을 저장하는 기능에 문제가 남아 있어 완료하지 않았습니다.";
  if (/Vite|proxy|API 검증/i.test(message)) return "화면과 데이터 연결에 문제가 남아 있어 완료하지 않았습니다.";
  if (/빌드|타입|검증에 실패/i.test(message)) return "코드 오류가 남아 있어 완료하지 않았습니다.";
  return message;
}

export function formatClock(milliseconds: number): string {
  const seconds = Math.floor(milliseconds / 1000);
  if (seconds < 60) return `${seconds}초`;
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export function formatDuration(milliseconds: number): string {
  const seconds = Math.round(milliseconds / 1000);
  if (seconds < 60) return `${seconds}초`;
  const minutes = Math.floor(seconds / 60);
  return seconds % 60 ? `${minutes}분 ${seconds % 60}초` : `${minutes}분`;
}
