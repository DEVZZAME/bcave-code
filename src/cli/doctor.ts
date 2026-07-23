import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { configFileIssues, getConfigDir, loadConfig } from "../config/config.js";

export interface DoctorCheck {
  label: string;
  ok: boolean;
  detail: string;
  code?: string;
}

function commandVersion(command: string, args: string[]): string {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 5_000 });
  if (result.error || result.status !== 0) return "찾을 수 없음";
  return String(result.stdout || result.stderr).trim().split(/\r?\n/)[0];
}

function canWrite(directory: string): boolean {
  try {
    fs.mkdirSync(directory, { recursive: true });
    fs.accessSync(directory, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export function collectDoctorChecks(entryUrl = import.meta.url): DoctorCheck[] {
  const here = path.dirname(fileURLToPath(entryUrl));
  const installDir = path.resolve(here, "..", "..");
  const entry = path.join(installDir, "dist", "cli", "index.js");
  const configDir = getConfigDir();
  const configPath = path.join(configDir, "config.json");
  const config = loadConfig();
  const nodeMajor = Number(process.versions.node.split(".")[0]);
  const supportedNode = [20, 22, 24].includes(nodeMajor);
  const entryExists = fs.existsSync(entry);
  const dependenciesExist = fs.existsSync(path.join(installDir, "node_modules"));
  const assetsExist = fs.existsSync(path.join(installDir, "assets", "design-systems"));
  const sessionAssetsExist = ["bcave-dashboard.html", "axis-dashboard.html"].every((file) =>
    fs.existsSync(path.join(installDir, "assets", "session-mode", "dashboards", file)),
  ) && ["bcave-dashboard.html", "axis-dashboard1.html"].every((file) =>
    fs.existsSync(path.join(installDir, "assets", "session-mode", "dashboard-updates", file)),
  ) && ["roundfit", "stylemetrics", "threadly"].every((project) =>
    fs.existsSync(path.join(installDir, "assets", "session-mode", "projects", project, "package.json")),
  );
  const configMode = (() => {
    try { return (fs.statSync(configPath).mode & 0o777).toString(8).padStart(3, "0"); }
    catch { return "없음"; }
  })();
  const configWritable = canWrite(configDir);
  const secureConfigMode = process.platform === "win32" || configMode === "없음" || configMode === "600";
  const configIssues = configFileIssues();

  return [
    { label: "환경", ok: true, detail: `${os.platform()} ${os.arch()} · Node v${process.versions.node}` },
    {
      label: "Node 지원 범위",
      ok: nodeMajor >= 20 && supportedNode,
      detail: supportedNode ? `Node ${nodeMajor} LTS` : nodeMajor < 20 ? "Node 20 이상 필요" : `Node ${nodeMajor}는 공식 검증 범위 20/22/24 밖`,
      code: supportedNode ? undefined : "BCAVE_NODE_UNSUPPORTED",
    },
    { label: "npm", ok: !commandVersion("npm", ["--version"]).includes("없음"), detail: commandVersion("npm", ["--version"]) },
    { label: "Git", ok: !commandVersion("git", ["--version"]).includes("없음"), detail: commandVersion("git", ["--version"]) },
    {
      label: "CLI 엔트리",
      ok: entryExists,
      detail: entry,
      code: entryExists ? undefined : "BCAVE_ENTRY_MISSING",
    },
    {
      label: "의존성",
      ok: dependenciesExist,
      detail: dependenciesExist ? "node_modules 확인" : "node_modules 누락",
      code: dependenciesExist ? undefined : "BCAVE_DEPENDENCIES_MISSING",
    },
    {
      label: "디자인 자산",
      ok: assetsExist,
      detail: assetsExist ? "assets/design-systems 확인" : "디자인 시스템 자산 누락",
      code: assetsExist ? undefined : "BCAVE_ASSETS_MISSING",
    },
    {
      label: "Session mode 자산",
      ok: sessionAssetsExist,
      detail: sessionAssetsExist ? "대시보드 2개 · 수정본 2개 · 프로젝트 3개 확인" : "Session mode 시연 자산 누락",
      code: sessionAssetsExist ? undefined : "BCAVE_SESSION_ASSETS_MISSING",
    },
    {
      label: "설정 저장소",
      ok: configWritable,
      detail: configDir,
      code: configWritable ? undefined : "BCAVE_CONFIG_NOT_WRITABLE",
    },
    {
      label: "설정 파일 권한",
      ok: secureConfigMode,
      detail: configMode === "없음" ? "로그인 후 생성됨" : configMode,
      code: secureConfigMode ? undefined : "BCAVE_CONFIG_PERMISSIONS",
    },
    {
      label: "설정 형식",
      ok: configIssues.length === 0,
      detail: configIssues.length ? configIssues.join("; ") : "정상",
      code: configIssues.length ? "BCAVE_CONFIG_INVALID" : undefined,
    },
    {
      label: "HUB 설정",
      ok: /^https?:\/\//.test(config.hubUrl),
      detail: config.hubUrl.replace(/\?.*$/, ""),
      code: /^https?:\/\//.test(config.hubUrl) ? undefined : "BCAVE_HUB_URL_INVALID",
    },
  ];
}

export function doctorExitCode(checks: DoctorCheck[]): number {
  return checks.every((check) => check.ok) ? 0 : 1;
}
