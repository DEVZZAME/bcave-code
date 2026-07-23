import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

export interface DesignLintResult {
  file: string;
  violations: Array<{ rule: string; msg: string; line: number | null }>;
  warnings: Array<{ rule: string; msg: string; line: number | null }>;
  pass: boolean;
}

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../assets/design-systems");

export function designSystemDir(name: string): string {
  return path.join(ROOT, name);
}

export function hasDesignSystem(name: string): boolean {
  return !!name && fs.existsSync(path.join(designSystemDir(name), "RULES.md"));
}

export function designSystemNames(): string[] {
  if (!fs.existsSync(ROOT)) return [];
  return fs.readdirSync(ROOT, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && hasDesignSystem(entry.name))
    .map((entry) => entry.name)
    .sort();
}

export function designRules(name: string): string {
  return fs.readFileSync(path.join(designSystemDir(name), "RULES.md"), "utf8");
}

export function isUiArtifactRequest(message: string): boolean {
  return /(대시보드|dashboard|화면|페이지|랜딩|리포트|보고서|html|웹\s?ui|\bui\b|screen|landing|report)/i.test(message);
}

export function detectDesignSystemFromArtifact(filePath: string): string | null {
  if (!fs.existsSync(filePath)) return null;
  const head = fs.readFileSync(filePath, "utf8").slice(0, 100_000);
  for (const name of designSystemNames()) {
    const marker = name.toUpperCase().replace(/[^A-Z0-9_-]/g, "");
    if (head.includes(`${marker}:ASSET`)) return name;
  }
  return null;
}

/** 수정 요청에 포함된 기존 HTML 경로에서 디자인 시스템 마커를 찾는다. */
export function detectDesignSystemFromRequest(message: string, cwd: string): string | null {
  const candidates = [...message.matchAll(/([^"'`\s]+?\.html?)/gi)]
    .map((match) => match[1])
    .map((candidate) => path.resolve(cwd, candidate));
  for (const candidate of candidates) {
    const detected = detectDesignSystemFromArtifact(candidate);
    if (detected) return detected;
  }
  return null;
}

function extractBlock(source: string, kind: "html:body" | "js:app"): string | null {
  const escaped = kind.replace(":", "\\s*:\\s*");
  const match = source.match(new RegExp("```" + escaped + "\\s*\\n([\\s\\S]*?)```", "i"));
  return match ? match[1].trim() : null;
}

function titleFromBody(body: string, fallback: string): string {
  const raw = body.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1]
    ?.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return raw || fallback.replace(/[-_]+/g, " ");
}

/** RULES의 topbar→hero→page 순서와 UI CSS의 page-only max-width가 충돌할 때,
 *  top-level section.hero를 뒤따르는 .page 안으로 옮겨 컨테이너 폭을 상속시킨다. */
function containHero(body: string, uiCss: string): string {
  const pageHasContainer = /\.page\s*\{[^}]*max-width\s*:/i.test(uiCss);
  const heroHasContainer = /\.hero\s*\{[^}]*max-width\s*:/i.test(uiCss);
  if (!pageHasContainer || heroHasContainer) return body;
  const match = body.match(/(<section\b[^>]*class=["'][^"']*\bhero\b[^"']*["'][^>]*>[\s\S]*?<\/section>)\s*(<div\b[^>]*class=["'][^"']*\bpage\b[^"']*["'][^>]*>)/i);
  if (!match || match.index == null) return body;
  return body.slice(0, match.index) + match[2] + match[1] + body.slice(match.index + match[0].length);
}

export function assembleDesignArtifactParts(name: string, body: string, app: string, outputPath: string): string {
  const dir = designSystemDir(name);
  const prefix = name.toLowerCase();
  if (!body.trim() || !app.trim()) {
    throw new Error("디자인 시스템 출력 계약 위반: write_file의 body와 app_script를 모두 전달하세요.");
  }

  body = body.trim();
  app = app.trim();
  if (/<(?:!doctype|html|head|body)\b/i.test(body) || /<style\b/i.test(body)) {
    throw new Error("body에는 <body> 내부 마크업만 전달하세요. 완성 HTML, <head>, <style>은 CLI가 조립합니다.");
  }

  const uiCss = fs.readFileSync(path.join(dir, `${prefix}-ui.css`), "utf8");
  body = containHero(body, uiCss);

  const dataLines: string[] = [];
  const appLines: string[] = [];
  for (const line of app.split("\n")) {
    if (/\{\{BCAVE_(?:DATA|SHEETS):/.test(line)) dataLines.push(line);
    else appLines.push(line);
  }

  const replacements: Record<string, string> = {
    TITLE: titleFromBody(body, path.basename(outputPath, path.extname(outputPath))),
    TOKENS_CSS: fs.readFileSync(path.join(dir, `${prefix}-tokens.css`), "utf8"),
    UI_CSS: uiCss,
    CHARTJS_BUNDLE: fs.readFileSync(path.join(ROOT, "..", "vendor", "chart.umd.js"), "utf8"),
    CHART_ADAPTER: fs.readFileSync(path.join(dir, `${prefix}-chart.js`), "utf8"),
    DATA: dataLines.join("\n"),
    BODY: body,
    APP_SCRIPT: appLines.join("\n"),
  };
  const symbolPath = path.join(dir, `${prefix}-symbol.svg`);
  if (fs.existsSync(symbolPath)) {
    replacements.BODY = replacements.BODY
      .split(`<!--${name.toUpperCase()}_SYMBOL_SVG-->`)
      .join(fs.readFileSync(symbolPath, "utf8"));
  }
  let html = fs.readFileSync(path.join(dir, "template.html"), "utf8");
  for (const [key, value] of Object.entries(replacements)) html = html.split(`{{${key}}}`).join(value);
  return html;
}

/** 이전 코드펜스 계약과의 하위 호환용. 신규 호출은 구조화된 body/app_script 필드를 사용한다. */
export function assembleDesignArtifact(name: string, source: string, outputPath: string): string {
  const body = extractBlock(source, "html:body");
  const app = extractBlock(source, "js:app");
  if (body == null || app == null) {
    throw new Error("디자인 시스템 출력 계약 위반: write_file의 body와 app_script 필드를 사용하세요. 코드펜스나 완성 HTML은 전달하지 마세요.");
  }
  return assembleDesignArtifactParts(name, body, app, outputPath);
}

export function lintDesignArtifact(name: string, filePath: string): DesignLintResult {
  const dir = designSystemDir(name);
  const prefix = name.toLowerCase();
  const lint = path.join(dir, `${prefix}-lint.cjs`);
  const uiPath = path.join(dir, `${prefix}-ui.css`);
  const result = spawnSync(process.execPath, [lint, filePath, "--ui", uiPath, "--json"], {
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
  });
  try {
    const parsed = JSON.parse(result.stdout) as DesignLintResult;
    const html = fs.readFileSync(filePath, "utf8");
    const marker = name.toUpperCase().replace(/[^A-Z0-9_-]/g, "");
    const app = html.match(new RegExp(`<script>\\/\\* ${marker}:APP[\\s\\S]*?\\*\\/([\\s\\S]*?)<\\/script>`, "i"))?.[1] || "";
    const add = (rule: string, msg: string) => parsed.violations.push({ rule, msg, line: null });

    // RULES.md에서 미정의 클래스는 NEVER 규칙이므로 제공 린터의 경고를 실패로 승격한다.
    const unknownClasses = parsed.warnings.filter((w) => w.rule === "R6-unknown-class");
    for (const warning of unknownClasses) add("R6-unknown-class", warning.msg);
    parsed.warnings = parsed.warnings.filter((w) => w.rule !== "R6-unknown-class");

    // ui.css가 실제로 스타일링하는 표지 문법만 허용한다. 발명 래퍼나 KPI를 넣으면
    // 다크 배경 위 정렬·대비가 무너진다.
    const uiCss = fs.readFileSync(uiPath, "utf8");
    const heroStart = html.search(/class=["'][^"']*\bhero\b[^"']*["']/i);
    if (heroStart >= 0) {
      const nextSection = html.slice(heroStart + 1).search(/class=["'][^"']*\bsec-head\b/i);
      const heroRegion = html.slice(heroStart, nextSection >= 0 ? heroStart + 1 + nextSection : undefined);
      if (/\.hero\s+\.top\b/.test(uiCss) &&
          (!/class=["'][^"']*\btop\b/.test(heroRegion) || !/<h1\b/.test(heroRegion) ||
           !/class=["'][^"']*\brule\b/.test(heroRegion) || !/class=["'][^"']*\bdept\b/.test(heroRegion))) {
        add("R14-hero-structure", "히어로는 .hero > .top 안에 h1, .rule, .dept를 사용하는 표준 표지 구조여야 합니다.");
      }
      if (/\.hero\s+\.top\b/.test(uiCss) && /class=["'][^"']*\bkpi\b/.test(heroRegion)) {
        add("R14-hero-no-kpi", "히어로 안에 KPI 카드/그리드를 넣지 마세요. KPI는 다음 .page 섹션에 배치하세요.");
      }
      if (/\.hero\s+\.eyebrow\b/.test(uiCss) &&
          (!/class=["'][^"']*\beyebrow\b/.test(heroRegion) || !/<h1\b/.test(heroRegion))) {
        add("R14-hero-structure", "히어로는 시스템 UI CSS에 정의된 .eyebrow와 h1 구조를 사용하세요.");
      }
      const beforeHero = html.slice(0, heroStart);
      const lastPageOpen = beforeHero.lastIndexOf('class="page"');
      const pageCssNeedsContainer = /\.page\s*\{[^}]*max-width\s*:/i.test(uiCss) && !/\.hero\s*\{[^}]*max-width\s*:/i.test(uiCss);
      if (pageCssNeedsContainer && lastPageOpen < 0) {
        add("R15-hero-container", "히어로에 자체 max-width가 없으므로 .page 컨테이너 안에 배치해야 합니다.");
      }
    }

    // 동적 배열 map을 그대로 도넛에 넘기면 런타임 조각 수가 6개를 넘을 수 있다.
    const rules = designRules(name);
    const maxCategories = Number(rules.match(/도넛\s*(?:조각)?\s*(\d+)개\s*초과/)?.[1] || 8);
    const ns = name.toUpperCase().replace(/[^A-Z0-9_$]/g, "");
    const donutRe = new RegExp(`${ns}\\.chart\\.donut\\s*\\([^;]+\\);`, "g");
    for (const call of app.matchAll(donutRe)) {
      const limited = new RegExp(`\\.slice\\s*\\(\\s*0\\s*,\\s*(?:[1-${Math.min(maxCategories, 9)}])\\s*\\)`);
      if (/\.map\s*\(/.test(call[0]) && !limited.test(call[0]) && !/기타|other/i.test(call[0])) {
        add("R11-donut-limit", `동적 도넛 데이터는 기타를 포함해 최대 ${maxCategories}개로 명시적으로 제한하세요.`);
      }
    }
    // 같은 축에서 금액과 건수/고객수를 섞는 대표 오류를 차단한다.
    const lineRe = new RegExp(`${ns}\\.chart\\.(?:line|curve)\\s*\\([^;]+\\);`, "g");
    for (const call of app.matchAll(lineRe)) {
      if (/unit\s*:\s*['"]krw['"]/.test(call[0]) && /(주문\s*건수|고객\s*수|orders?|customers?)/i.test(call[0])) {
        add("R12-mixed-units", "금액(krw) 축에 건수/고객수 시리즈를 함께 넣지 마세요. 단위별로 차트를 분리하세요.");
      }
    }
    const customerUnitRe = new RegExp(`(?:kpiCust|customer\\w*)[^\\n;]*${ns}\\.fmt\\.num\\([^;]+\\)\\s*\\+\\s*['"]건['"]`, "i");
    if (customerUnitRe.test(app)) {
      add("R13-customer-unit", "고객 수 단위는 '건'이 아니라 '명'을 사용하세요.");
    }
    parsed.pass = parsed.violations.length === 0;
    return parsed;
  } catch {
    throw new Error(`디자인 린터 실행 실패: ${(result.stderr || result.stdout || `exit ${result.status}`).trim()}`);
  }
}
