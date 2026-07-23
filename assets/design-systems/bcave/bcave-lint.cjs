#!/usr/bin/env node
/* BCAVE Design System Lint v0.2
   사용: node bcave-lint.js <생성된.html> [--ui path/to/bcave-ui.css] [--json]
   종료코드: 0 = 통과, 1 = 위반 존재
   검사 대상: 조립 완료된 최종 HTML.
   BCAVE:ASSET 마커가 붙은 블록(주입 자산)은 검사에서 제외한다. */
'use strict';
const fs = require('fs');
const path = require('path');

const args = process.argv.slice(2);
const file = args.find(a => !a.startsWith('--'));
const asJson = args.includes('--json');
const uiFlag = args.indexOf('--ui');
const uiPath = uiFlag >= 0 ? args[uiFlag + 1] : path.join(__dirname, 'bcave-ui.css');

if (!file) { console.error('사용법: node bcave-lint.js <html파일> [--ui ui.css] [--json]'); process.exit(2); }
const html = fs.readFileSync(file, 'utf8');

/* ---------- 허용 색상 (tokens.css 전체 + 확장색) ---------- */
const ALLOWED_HEX = new Set([
  '1A2E33','264148','3D555E','566C75','718790','8FA0A7','A8B6BB','C6CFD2','DEE2E3','EEF1F2',
  '000000','3B3B3B','7F7F7F','FFFFFF','F6F8F8',
  '2E7D5B','E9F2EE','C4453F','F8ECEB',
  'CBE3D8','1F5A41','EFD2D0','8E322D','7FC5A8'  // ui.css 내부 파생(알림 톤)
]);

/* ---------- 자산 블록 제거 → 검사 대상 = 모델/조립 산출물 ---------- */
function stripAssets(src) {
  // <style> 또는 <script> 블록 중 BCAVE:ASSET / BCAVE:DATA 마커 포함 시 제거
  return src.replace(/<(style|script)\b[^>]*>([\s\S]*?)<\/\1>/gi, (m, tag, body) =>
    /BCAVE:(ASSET|DATA)/.test(body.slice(0, 200)) ? `<!--stripped:${tag}-->` : m);
}
const target = stripAssets(html);

/* ---------- 위치 → 줄번호 ---------- */
function lineOf(idx) { return target.slice(0, idx).split('\n').length; }

const violations = [];
const warnings = [];
function V(rule, msg, idx) { violations.push({ rule, msg, line: idx != null ? lineOf(idx) : null }); }
function W(rule, msg, idx) { warnings.push({ rule, msg, line: idx != null ? lineOf(idx) : null }); }

/* ---------- R1: <style> 블록 (자산 외) ---------- */
for (const m of target.matchAll(/<style\b[^>]*>/gi))
  V('R1-no-style-block', '자산 마커 없는 <style> 블록 — 모델은 CSS를 작성할 수 없음', m.index);

/* ---------- R2: 인라인 style= ---------- */
for (const m of target.matchAll(/\sstyle\s*=\s*["'][^"']*["']/gi))
  V('R2-no-inline-style', `인라인 style 금지: ${m[0].trim().slice(0, 60)} — 유틸 클래스(.w-70 등) 사용`, m.index);

/* ---------- R3: 하드코딩 색 ---------- */
for (const m of target.matchAll(/#([0-9a-fA-F]{6})\b/g)) {
  if (!ALLOWED_HEX.has(m[1].toUpperCase()))
    V('R3-alien-hex', `허용 목록 외 색상 #${m[1]}`, m.index);
}
for (const m of target.matchAll(/rgba?\([^)]*\)/gi))
  V('R3-no-rgb', `rgb/rgba 직접 사용 금지: ${m[0].slice(0, 40)}`, m.index);

/* ---------- R4: font-family ---------- */
for (const m of target.matchAll(/font-family\s*:/gi))
  V('R4-no-font', 'font-family 선언 금지 — 폰트는 시스템이 관리', m.index);

/* ---------- R5: new Chart 직접 호출 ---------- */
for (const m of target.matchAll(/new\s+Chart\s*\(/g))
  V('R5-no-raw-chart', 'new Chart() 직접 호출 금지 — BCAVE.chart.* 래퍼 사용', m.index);

/* ---------- R6: 미정의 클래스 ---------- */
let uiClasses = new Set();
try {
  const ui = fs.readFileSync(uiPath, 'utf8');
  for (const m of ui.matchAll(/\.([a-zA-Z][\w-]*)/g)) uiClasses.add(m[1]);
} catch { W('R6-ui-missing', `ui.css를 찾지 못해 클래스 검사 생략 (${uiPath})`); }
if (uiClasses.size) {
  const used = new Set();
  for (const m of target.matchAll(/class\s*=\s*["']([^"']+)["']/gi))
    m[1].split(/\s+/).forEach(c => c && used.add(c));
  const IGNORE = new Set(['on','done','now','open']); // 상태 토글용
  for (const c of used)
    if (!uiClasses.has(c) && !IGNORE.has(c))
      W('R6-unknown-class', `ui.css에 없는 클래스 "${c}" — 발명 금지, 표준 클래스 사용`);
}

/* ---------- R7: 금액 포맷 ---------- */
for (const m of target.matchAll(/[\d,]{7,}\s*원/g))
  V('R7-krw-format', `원화 원시 표기 "${m[0]}" — BCAVE.fmt.krw() 사용 (₩·만/억 축약)`, m.index);
for (const m of target.matchAll(/toLocaleString\s*\(/g))
  W('R7-format-bypass', 'toLocaleString 직접 호출 — BCAVE.fmt.* 경유 권장', m.index);

/* ---------- R8: .kpi.dark 최대 1개 ---------- */
const darkKpi = [...target.matchAll(/class\s*=\s*["'][^"']*\bkpi\b[^"']*\bdark\b[^"']*["']/gi)];
if (darkKpi.length > 1)
  V('R8-one-dark', `.kpi.dark ${darkKpi.length}개 — 강조 KPI는 최대 1개만 허용`);

/* ---------- R9: delta 오용 (숫자·%·▲▼ 없는 delta) ---------- */
for (const m of target.matchAll(/class\s*=\s*["'][^"']*\bdelta\b[^"']*["'][^>]*>([^<]{1,40})</gi)) {
  const t = m[1].trim();
  if (t && !/[%▲▼\d$]|\$\{/.test(t))
    W('R9-delta-misuse', `.delta에 설명 텍스트 "${t}" — 증감률 전용, 설명은 .sub 사용`, m.index);
}

/* ---------- R10: 금지 차트 패턴 ---------- */
if (/yAxisID|secondaryValAxis/.test(target))
  V('R10-no-dual-axis', '이중 Y축 사용 금지', target.search(/yAxisID|secondaryValAxis/));
if (/PAL\[\s*i\s*%|backgroundColor:\s*\w+\.map/.test(target))
  W('R10-palette-cycle', '팔레트 순환 의심 — 범주형 다색 금지, BCAVE.chart.bar의 highlight 사용');

/* ---------- 출력 ---------- */
const result = { file: path.basename(file), violations, warnings,
  pass: violations.length === 0 };
if (asJson) {
  console.log(JSON.stringify(result, null, 2));
} else {
  console.log(`\nBCAVE Lint — ${result.file}`);
  console.log('─'.repeat(52));
  if (!violations.length && !warnings.length) console.log('✔ 위반 없음');
  for (const v of violations) console.log(`✘ [${v.rule}]${v.line ? ' L' + v.line : ''} ${v.msg}`);
  for (const w of warnings)  console.log(`△ [${w.rule}]${w.line ? ' L' + w.line : ''} ${w.msg}`);
  console.log('─'.repeat(52));
  console.log(`위반 ${violations.length} · 경고 ${warnings.length} → ${result.pass ? 'PASS' : 'FAIL'}`);
}
process.exit(result.pass ? 0 : 1);
