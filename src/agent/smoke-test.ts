import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import http from "node:http";
import { spawn } from "node:child_process";
import { validateApiResponse } from "./app-audit.js";

export interface SmokeTestResult { ok: boolean; skipped?: boolean; detail: string; startCmd: string }

export function detectStartCommand(cwd: string): string | null {
  try {
    const packagePath = path.join(cwd, "package.json");
    if (!fs.existsSync(packagePath)) return null;
    const scripts = (JSON.parse(fs.readFileSync(packagePath, "utf8")).scripts || {}) as Record<string, string>;
    for (const name of ["dev", "start", "serve", "dev:server", "server", "start:dev"]) {
      if (scripts[name]) return `npm run ${name} --silent`;
    }
  } catch { /* 잘못된 package.json은 빌드 검사에서 보고한다. */ }
  return null;
}

function findFreePort(): Promise<number> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(3000 + Math.floor(Math.random() * 2000)));
    server.listen(0, () => {
      const port = (server.address() as net.AddressInfo).port;
      server.close(() => resolve(port));
    });
  });
}

function httpPing(port: number, timeoutMs = 1500): Promise<boolean> {
  const pingHost = (host: string) => new Promise<boolean>((resolve) => {
    const request = http.get({ host, port, path: "/", timeout: timeoutMs }, (response) => { response.destroy(); resolve(true); });
    request.on("error", () => resolve(false));
    request.on("timeout", () => { request.destroy(); resolve(false); });
  });
  return pingHost("localhost").then((ok) => ok || pingHost("127.0.0.1"));
}

function cleanTerminalOutput(text: string): string {
  return text.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
}

export async function smokeTest(cwd: string, signal?: AbortSignal): Promise<SmokeTestResult> {
  const startCmd = detectStartCommand(cwd);
  if (!startCmd) return { ok: false, detail: "package.json에 dev/start/serve 서버 실행 스크립트가 없습니다.", startCmd: "" };
  const port = await findFreePort();
  const expectsFrontend = fs.existsSync(path.join(cwd, "vite.config.ts")) || fs.existsSync(path.join(cwd, "vite.config.js"));
  const logs: string[] = [];
  const collect = (bytes: Buffer) => { logs.push(bytes.toString()); while (logs.join("").length > 20_000) logs.shift(); };
  const child = spawn(startCmd, { cwd, shell: true, detached: true, env: { ...process.env, PORT: String(port), NODE_ENV: "development", BROWSER: "none" } });
  child.stdout?.on("data", collect);
  child.stderr?.on("data", collect);
  let exited: number | null = null;
  child.on("exit", (code) => { exited = code ?? 0; });
  const kill = () => {
    try { if (child.pid) process.kill(-child.pid, "SIGTERM"); } catch { /* 그룹 없음 */ }
    try { if (child.pid) process.kill(child.pid, "SIGTERM"); } catch { /* 이미 종료 */ }
    const timer = setTimeout(() => { try { if (child.pid) process.kill(-child.pid, "SIGKILL"); } catch { /* noop */ } }, 2000);
    timer.unref?.();
  };
  const onExit = () => kill();
  process.once("exit", onExit);
  const candidates = (): number[] => {
    const ports = new Set<number>([port]);
    const text = cleanTerminalOutput(logs.join(""));
    for (const match of text.matchAll(/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|::1)?:(\d{2,5})\b/g)) ports.add(+match[1]);
    for (const match of text.matchAll(/port[\s:=]+(\d{2,5})/gi)) ports.add(+match[1]);
    return [...ports].filter((candidate) => candidate > 0 && candidate < 65536);
  };

  const deadline = Date.now() + 35_000;
  let upPort = 0;
  let frontendPort = 0;
  while (Date.now() < deadline) {
    if (signal?.aborted || (exited !== null && exited !== 0)) break;
    const states = await Promise.all(candidates().map(async (candidate) => ({ port: candidate, live: await httpPing(candidate) })));
    const firstLive = states.find(({ live }) => live);
    const loggedFrontend = +(cleanTerminalOutput(logs.join("")).match(/Local:\s+https?:\/\/(?:localhost|127\.0\.0\.1):(\d{2,5})/i)?.[1] || 0);
    if (loggedFrontend && states.some((state) => state.port === loggedFrontend && state.live)) frontendPort = loggedFrontend;
    if (firstLive && (!expectsFrontend || frontendPort)) { upPort = firstLive.port; break; }
    await new Promise((resolve) => setTimeout(resolve, 700));
  }

  if (!upPort) {
    process.removeListener("exit", onExit);
    kill();
    const tail = logs.join("").slice(-4000).trim();
    const reason = exited !== null && exited !== 0 ? `서버가 시작 직후 종료됨(exit ${exited})` : expectsFrontend && !frontendPort ? "API 또는 프론트 화면이 함께 열리지 않음" : "제한 시간 내 HTTP 응답 없음(서버가 기동/바인딩 실패했거나 PORT 를 안 씀)";
    return { ok: false, detail: `[스모크 실패: ${reason}] 시작 명령: ${startCmd}\n서버는 반드시 process.env.PORT 를 사용해 바인딩해야 합니다.\n${tail || "(출력 없음)"}`, startCmd };
  }

  const apiIssues: string[] = [];
  try {
    const response = await fetch(`http://127.0.0.1:${upPort}/api/health`, { headers: { "Content-Type": "application/json" }, signal: AbortSignal.timeout(3000) });
    const issue = validateApiResponse("/api/health", response.status, await response.text(), true);
    if (issue) apiIssues.push(issue);
  } catch (error) {
    apiIssues.push(`GET /api/health → 요청 실패: ${(error as Error).message}`);
  }
  process.removeListener("exit", onExit);
  kill();
  if (apiIssues.length) {
    return { ok: false, detail: `[API 검증 실패] 서버는 기동됐지만 실제 실행 검증을 통과하지 못했습니다:\n${apiIssues.map((issue) => `  - ${issue}`).join("\n")}\n\n해결 방법:\n  1. GET /api/health 를 추가하고 2xx JSON을 반환하세요.\n  2. 모든 API 엔드포인트는 오류 상황에서도 JSON을 반환하세요.\n  3. Express 전역 오류 핸들러를 추가하세요: app.use((err,req,res,next)=>res.status(500).json({message:err.message}))`, startCmd };
  }
  return { ok: true, detail: `서비스 화면 및 데이터 연결 확인 완료 (화면 ${frontendPort || upPort}, 데이터 ${upPort})`, startCmd };
}
