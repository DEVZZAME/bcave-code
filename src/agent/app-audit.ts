import fs from "node:fs";
import path from "node:path";

export function validateApiResponse(pathname: string, status: number, body: string, required = false): string | null {
  if (required && (status < 200 || status >= 300)) return `GET ${pathname} → HTTP ${status} (필수 헬스 엔드포인트)`;
  if (!required && status === 404) return null;
  if (!body.trim()) return `GET ${pathname} → 빈 응답 본문`;
  try { JSON.parse(body); }
  catch { return `GET ${pathname} → JSON 파싱 불가 (HTML/텍스트 반환): ${body.slice(0, 120)}`; }
  return null;
}

export function auditUiSource(source: string, filename = "UI"): string[] {
  const issues: string[] = [];
  for (const match of source.matchAll(/<a\b([^>]*)>/g)) {
    const attrs = match[1];
    if (!/\b(?:href|onClick)\s*=/.test(attrs)) issues.push(`${filename}: 이동 기능이 없는 메뉴/링크가 있습니다.`);
    if (/\bhref\s*=\s*["']#(?:["']|\s)/.test(attrs)) issues.push(`${filename}: 임시 주소(#)만 연결된 링크가 있습니다.`);
  }
  if (/onClick\s*=\s*\{\s*\(?(?:\w+)?\)?\s*=>\s*\{\s*\}\s*\}/.test(source)) issues.push(`${filename}: 눌러도 아무 동작을 하지 않는 버튼이 있습니다.`);
  if (/\btrend\s*=\s*["'][+−-]?\d+(?:\.\d+)?%["']/.test(source)) issues.push(`${filename}: 실제 데이터와 연결되지 않은 고정 증감률이 표시됩니다.`);
  if (/\b(?:MONDAY|TUESDAY|WEDNESDAY|THURSDAY|FRIDAY|SATURDAY|SUNDAY),\s+(?:JANUARY|FEBRUARY|MARCH|APRIL|MAY|JUNE|JULY|AUGUST|SEPTEMBER|OCTOBER|NOVEMBER|DECEMBER)\s+\d{1,2},\s+20\d{2}\b/i.test(source)) {
    issues.push(`${filename}: 오늘 날짜가 실제 시간이 아닌 고정 문구로 표시됩니다.`);
  }
  return [...new Set(issues)];
}

function collectCodeFiles(directory: string, uiOnly = false): string[] {
  if (!fs.existsSync(directory)) return [];
  const output: string[] = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (["node_modules", "dist", "build", ".next", ".git"].includes(entry.name)) continue;
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...collectCodeFiles(fullPath, uiOnly));
    else {
      const extension = uiOnly ? /\.(?:tsx|jsx|vue|svelte)$/ : /\.(?:ts|tsx|js|jsx|mjs|cjs)$/;
      if (extension.test(entry.name) && !/\.test\./.test(entry.name)) output.push(fullPath);
    }
  }
  return output;
}

export function auditApiContracts(cwd: string): string[] {
  const issues: string[] = [];
  const serverRoots = [path.join(cwd, "server"), path.join(cwd, "src", "server")];
  const serverRoutes = new Map<string, Set<string>>();
  for (const file of serverRoots.flatMap((root) => collectCodeFiles(root))) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(/\b(?:app|router)\.(get|post|put|patch|delete)\s*\(\s*['"](\/api\/[^'"]+)['"]/gi)) {
      const method = match[1].toUpperCase();
      const methods = serverRoutes.get(match[2]) ?? new Set<string>();
      methods.add(method);
      serverRoutes.set(match[2], methods);
    }
  }
  for (const file of collectCodeFiles(path.join(cwd, "src")).filter((name) => !/[\\/]server[\\/]/.test(name))) {
    const source = fs.readFileSync(file, "utf8");
    for (const match of source.matchAll(/\b(?:fetch|api)\s*\(\s*(['"])(\/api\/[^'"]+)\1\s*(?:,\s*\{([^}]{0,600})\})?/g)) {
      const options = match[3] ?? "";
      const method = options.match(/\bmethod\s*:\s*['"](GET|POST|PUT|PATCH|DELETE)['"]/i)?.[1]?.toUpperCase() ?? "GET";
      const allowed = serverRoutes.get(match[2]);
      if (allowed && !allowed.has(method)) issues.push(`${path.relative(cwd, file)}: ${match[2]} 요청이 ${method}로 되어 있지만 서버는 ${[...allowed].join("/")}만 허용합니다.`);
    }
  }
  return [...new Set(issues)];
}

export function auditAppCompleteness(cwd: string): string[] {
  const issues = collectCodeFiles(path.join(cwd, "src"), true).flatMap((file) => auditUiSource(fs.readFileSync(file, "utf8"), path.relative(cwd, file)));
  issues.push(...auditApiContracts(cwd));
  const readmePath = path.join(cwd, "README.md");
  const readme = fs.existsSync(readmePath) ? fs.readFileSync(readmePath, "utf8") : "";
  if (/\bCRUD\b/i.test(readme)) {
    const serverText = [path.join(cwd, "server"), path.join(cwd, "src", "server")]
      .flatMap((directory) => collectCodeFiles(directory).map((file) => fs.readFileSync(file, "utf8"))).join("\n");
    if (!/\.\s*(?:put|patch)\s*\(/i.test(serverText) || !/\.\s*delete\s*\(/i.test(serverText)) issues.push("README에는 CRUD 완성이라고 되어 있지만 수정 또는 삭제 기능이 구현되지 않았습니다.");
  }
  if (/\.env\.example/.test(readme) && !fs.existsSync(path.join(cwd, ".env.example"))) issues.push("실행 안내에 .env.example이 필요하다고 되어 있지만 파일이 없습니다.");
  const packagePath = path.join(cwd, "package.json");
  if (fs.existsSync(packagePath)) {
    try {
      const scripts = (JSON.parse(fs.readFileSync(packagePath, "utf8")).scripts || {}) as Record<string, string>;
      const startTarget = scripts.start?.match(/^node\s+([^\s]+)/)?.[1];
      if (startTarget && !fs.existsSync(path.resolve(cwd, startTarget))) issues.push(`서비스 실행 명령이 존재하지 않는 파일(${startTarget})을 가리킵니다.`);
    } catch { /* package.json 파싱 오류는 빌드 검증에서 처리 */ }
  }
  return [...new Set(issues)];
}
