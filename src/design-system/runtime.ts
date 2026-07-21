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

export function designRules(name: string): string {
  return fs.readFileSync(path.join(designSystemDir(name), "RULES.md"), "utf8");
}

export function isUiArtifactRequest(message: string): boolean {
  return /(대시보드|dashboard|화면|페이지|랜딩|리포트|보고서|html|웹\s?ui|\bui\b|screen|landing|report)/i.test(message);
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

export function assembleDesignArtifactParts(name: string, body: string, app: string, outputPath: string): string {
  const dir = designSystemDir(name);
  if (!body.trim() || !app.trim()) {
    throw new Error("디자인 시스템 출력 계약 위반: write_file의 body와 app_script를 모두 전달하세요.");
  }

  body = body.trim();
  app = app.trim();
  if (/<(?:!doctype|html|head|body)\b/i.test(body) || /<style\b/i.test(body)) {
    throw new Error("body에는 <body> 내부 마크업만 전달하세요. 완성 HTML, <head>, <style>은 CLI가 조립합니다.");
  }

  const dataLines: string[] = [];
  const appLines: string[] = [];
  for (const line of app.split("\n")) {
    if (/\{\{BCAVE_(?:DATA|SHEETS):/.test(line)) dataLines.push(line);
    else appLines.push(line);
  }

  const replacements: Record<string, string> = {
    TITLE: titleFromBody(body, path.basename(outputPath, path.extname(outputPath))),
    TOKENS_CSS: fs.readFileSync(path.join(dir, "bcave-tokens.css"), "utf8"),
    UI_CSS: fs.readFileSync(path.join(dir, "bcave-ui.css"), "utf8"),
    CHARTJS_BUNDLE: fs.readFileSync(path.join(dir, "vendor", "chart.umd.js"), "utf8"),
    CHART_ADAPTER: fs.readFileSync(path.join(dir, "bcave-chart.js"), "utf8"),
    DATA: dataLines.join("\n"),
    BODY: body.split("<!--BCAVE_SYMBOL_SVG-->").join(fs.readFileSync(path.join(dir, "bcave-symbol.svg"), "utf8")),
    APP_SCRIPT: appLines.join("\n"),
  };
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
  const lint = path.join(dir, "bcave-lint.cjs");
  const result = spawnSync(process.execPath, [lint, filePath, "--ui", path.join(dir, "bcave-ui.css"), "--json"], {
    encoding: "utf8",
    maxBuffer: 2 * 1024 * 1024,
  });
  try {
    const parsed = JSON.parse(result.stdout) as DesignLintResult;
    const html = fs.readFileSync(filePath, "utf8");
    const app = html.match(/<script>\/\* BCAVE:APP[\s\S]*?\*\/([\s\S]*?)<\/script>/i)?.[1] || "";
    const add = (rule: string, msg: string) => parsed.violations.push({ rule, msg, line: null });

    // RULES.md에서 미정의 클래스는 NEVER 규칙이므로 제공 린터의 경고를 실패로 승격한다.
    const unknownClasses = parsed.warnings.filter((w) => w.rule === "R6-unknown-class");
    for (const warning of unknownClasses) add("R6-unknown-class", warning.msg);
    parsed.warnings = parsed.warnings.filter((w) => w.rule !== "R6-unknown-class");

    // ui.css가 실제로 스타일링하는 표지 문법만 허용한다. 발명 래퍼나 KPI를 넣으면
    // 다크 배경 위 정렬·대비가 무너진다.
    const heroStart = html.search(/class=["'][^"']*\bhero\b[^"']*["']/i);
    if (heroStart >= 0) {
      const nextSection = html.slice(heroStart + 1).search(/class=["'][^"']*\bsec-head\b/i);
      const heroRegion = html.slice(heroStart, nextSection >= 0 ? heroStart + 1 + nextSection : undefined);
      if (!/class=["'][^"']*\btop\b/.test(heroRegion) || !/<h1\b/.test(heroRegion) ||
          !/class=["'][^"']*\brule\b/.test(heroRegion) || !/class=["'][^"']*\bdept\b/.test(heroRegion)) {
        add("R14-hero-structure", "히어로는 .hero > .top 안에 h1, .rule, .dept를 사용하는 표준 표지 구조여야 합니다.");
      }
      if (/class=["'][^"']*\bkpi\b/.test(heroRegion)) {
        add("R14-hero-no-kpi", "히어로 안에 KPI 카드/그리드를 넣지 마세요. KPI는 다음 .page 섹션에 배치하세요.");
      }
    }

    // 동적 배열 map을 그대로 도넛에 넘기면 런타임 조각 수가 6개를 넘을 수 있다.
    for (const call of app.matchAll(/BCAVE\.chart\.donut\s*\([^;]+\);/g)) {
      if (/\.map\s*\(/.test(call[0]) && !/\.slice\s*\(\s*0\s*,\s*[1-6]\s*\)|기타|other/i.test(call[0])) {
        add("R11-donut-limit", "동적 도넛 데이터는 상위 5개 + 기타 또는 최대 6개로 명시적으로 제한하세요.");
      }
    }
    // 같은 축에서 금액과 건수/고객수를 섞는 대표 오류를 차단한다.
    for (const call of app.matchAll(/BCAVE\.chart\.(?:line|curve)\s*\([^;]+\);/g)) {
      if (/unit\s*:\s*['"]krw['"]/.test(call[0]) && /(주문\s*건수|고객\s*수|orders?|customers?)/i.test(call[0])) {
        add("R12-mixed-units", "금액(krw) 축에 건수/고객수 시리즈를 함께 넣지 마세요. 단위별로 차트를 분리하세요.");
      }
    }
    if (/(?:kpiCust|customer\w*)[^\n;]*BCAVE\.fmt\.num\([^;]+\)\s*\+\s*['"]건['"]/i.test(app)) {
      add("R13-customer-unit", "고객 수 단위는 '건'이 아니라 '명'을 사용하세요.");
    }
    parsed.pass = parsed.violations.length === 0;
    return parsed;
  } catch {
    throw new Error(`디자인 린터 실행 실패: ${(result.stderr || result.stdout || `exit ${result.status}`).trim()}`);
  }
}
