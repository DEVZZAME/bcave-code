import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export interface BcaveConfig {
  // ── HUB 로그인 기반 (권장) ──
  hubUrl: string; // bcave-service-hub 주소 (예: http://localhost:3000)
  accessToken: string; // HUB Access Token (게이트웨이 인증용)
  refreshToken: string; // HUB Refresh Token (자동 갱신용)
  userEmail: string; // 로그인된 사용자 이메일 (표시용)
  userName: string; // 로그인된 사용자 이름 (표시용)

  model: string; // 수동/기본 모델 (autoRoute off 일 때 사용)

  // ── 용도별 자동 모델 라우팅 ──
  autoRoute: boolean; // true 면 작업 성격에 따라 아래 두 모델을 자동 선택
  modelHeavy: string; // UI·서비스 개발·유지보수 등 무거운 작업
  modelLight: string; // 간단한 질문·연산 등 가벼운 작업

  // ── 레거시/폴백: 직접 OpenAI 키 사용 ──
  apiKey: string;
  baseUrl: string;
}

const DEFAULT_CONFIG: BcaveConfig = {
  // 사내 HUB(프로덕션) 기본값. BCAVE_HUB_URL 로 override 가능.
  hubUrl: process.env.BCAVE_HUB_URL ?? "http://3.36.247.93:3000",
  accessToken: "",
  refreshToken: "",
  userEmail: "",
  userName: "",
  model: "gpt-5.5",
  autoRoute: true,
  modelHeavy: "gpt-5.4",
  modelLight: "gpt-5.4-mini",
  apiKey: "",
  baseUrl: "https://api.openai.com/v1",
};

export function getConfigDir(): string {
  return path.join(os.homedir(), ".bcave");
}

function getConfigPath(): string {
  return path.join(getConfigDir(), "config.json");
}

export function loadConfig(): BcaveConfig {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    return { ...DEFAULT_CONFIG };
  }
  const raw = fs.readFileSync(configPath, "utf-8");
  const parsed = JSON.parse(raw) as Partial<BcaveConfig>;
  const merged = { ...DEFAULT_CONFIG, ...parsed };
  // 환경변수 BCAVE_HUB_URL 이 있으면 우선 적용 (사내 배포 시 일괄 지정 가능)
  if (process.env.BCAVE_HUB_URL) merged.hubUrl = process.env.BCAVE_HUB_URL;
  return merged;
}

export function saveConfig(partial: Partial<BcaveConfig>): void {
  const configDir = getConfigDir();
  fs.mkdirSync(configDir, { recursive: true });
  const existing = loadConfig();
  const merged = { ...existing, ...partial };
  fs.writeFileSync(getConfigPath(), JSON.stringify(merged, null, 2), "utf-8");
}

/** HUB 로그인 상태 여부 (Access Token 보유) */
export function isLoggedIn(config: BcaveConfig): boolean {
  return !!config.accessToken;
}

/** LLM 요청에 사용할 자격 유무 (로그인 또는 레거시 키) */
export function hasCredentials(config: BcaveConfig): boolean {
  return !!config.accessToken || !!config.apiKey;
}
