import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { exec } from "node:child_process";
import { glob } from "glob";
import XLSX from "xlsx";
import { CHARTJS_SOURCE } from "../assets/chartjs.js";
import { DESIGN_SYSTEMS, DS_SAFETY } from "../design/systems.js";
import type { PermissionCategory } from "./permissions.js";

// 스프레드시트 로드: 텍스트(csv·tsv·txt·html)는 UTF-8 원본으로(raw), 그 외는 버퍼로.
const _TEXT_EXT = new Set([".csv", ".tsv", ".txt", ".tab", ".html", ".htm"]);
function readWorkbook(filePath: string): XLSX.WorkBook {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  if (_TEXT_EXT.has(ext)) return XLSX.read(fs.readFileSync(filePath, "utf8"), { type: "string", raw: true });
  return XLSX.read(fs.readFileSync(filePath), { type: "buffer", cellDates: true });
}

// Chart.js 로드 직후 적용할 전역 기본값: 항목이 적어도 막대가 카드 폭에 꽉 늘어나지 않게 두께 상한.
const CHARTJS_DEFAULTS =
  ";try{if(window.Chart){var _d=Chart.defaults;if(_d.datasets&&_d.datasets.bar){_d.datasets.bar.maxBarThickness=52;_d.datasets.bar.categoryPercentage=0.72;_d.datasets.bar.barPercentage=0.9;}_d.font.family=\"Pretendard,-apple-system,BlinkMacSystemFont,sans-serif\";}}catch(e){}" +
  // 안전한 전역 esc (모델이 직접 만든 esc 의 따옴표 키 버그 방지용 폴백)
  ";try{if(!window.esc){window.esc=function(v){return String(v==null?'':v).replace(/[&<>\"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c];});};}}catch(e){}" +
  // CSS 변수 자동 해석: canvas 는 var(--x) 를 못 읽어 색이 검정으로 폴백됨.
  // 차트 data/options 안의 'var(--chart-1)' 같은 문자열을 실제 계산값으로 치환하는 전역 플러그인.
  ";try{if(window.Chart){var __cssv=function(n){try{return getComputedStyle(document.documentElement).getPropertyValue(n).trim();}catch(e){return '';}};var __rs=function(s){return s.replace(/var\\((--[\\w-]+)\\)/g,function(m,n){return __cssv(n)||m;});};var __walk=function(o,d){if(!o||typeof o!=='object'||d>6)return;if(Array.isArray(o)){for(var i=0;i<o.length;i++){var a=o[i];if(typeof a==='string'){if(a.indexOf('var(--')>=0)o[i]=__rs(a);}else __walk(a,d+1);}return;}for(var k in o){if(!Object.prototype.hasOwnProperty.call(o,k))continue;var v=o[k];if(typeof v==='string'){if(v.indexOf('var(--')>=0)o[k]=__rs(v);}else __walk(v,d+1);}};var __fix=function(c){try{__walk(c.config.data,0);__walk(c.config.options,0);}catch(e){}};Chart.register({id:'__cssvars',beforeInit:__fix,beforeUpdate:__fix});}}catch(e){}";
const CHARTJS_INLINE = `<script>${CHARTJS_SOURCE}${CHARTJS_DEFAULTS}</script>`;

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read the contents of a file at the given path",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path relative to working directory" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Create or overwrite a file with the given content",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path relative to working directory" },
          content: { type: "string", description: "Content to write" },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_files",
      description: "List files in a directory, optionally filtering by glob pattern",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Directory path relative to working directory" },
          pattern: { type: "string", description: "Glob pattern to filter (e.g. '**/*.ts')" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_files",
      description: "Search file contents for a regex pattern",
      parameters: {
        type: "object",
        properties: {
          pattern: { type: "string", description: "Regex pattern to search for" },
          path: { type: "string", description: "Directory to search in (default: '.')" },
        },
        required: ["pattern"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "shell_exec",
      description: "Execute a shell command and return stdout/stderr",
      parameters: {
        type: "object",
        properties: {
          command: { type: "string", description: "Shell command to execute" },
        },
        required: ["command"],
      },
    },
  },
];

const CATEGORY_MAP: Record<string, PermissionCategory> = {
  read_file: "file_read",
  list_files: "file_read",
  search_files: "file_read",
  write_file: "file_write",
  shell_exec: "shell_exec",
};

export function getToolCategory(name: string): PermissionCategory {
  const cat = CATEGORY_MAP[name];
  if (!cat) throw new Error(`Unknown tool: ${name}`);
  return cat;
}

// ── 출력 폭증 방지: 툴 결과 크기·항목 수 상한 + 무거운 폴더 제외 ──
// (제한이 없으면 list_files **/* 나 큰 파일이 대화 히스토리에 통째로 쌓여
//  매 턴 재전송되며 토큰이 폭증한다.)
const MAX_TOOL_CHARS = 12_000; // 대부분 툴 결과 상한
const MAX_READ_CHARS = 40_000; // read_file 은 조금 더 여유
const MAX_ITEMS = 400; // list/search 결과 항목 수
const MAX_FILE_BYTES = 1_000_000; // search 시 이보다 큰 파일은 건너뜀
const IGNORE: string[] = [
  "**/node_modules/**",
  "**/.git/**",
  "**/dist/**",
  "**/build/**",
  "**/.next/**",
  "**/coverage/**",
  "**/.cache/**",
  "**/*.min.js",
  "**/*.map",
  "**/*.lock",
];

function truncate(text: string, max: number, why = "생략"): string {
  if (text.length <= max) return text;
  return (
    text.slice(0, max) +
    `\n… [${why}: ${text.length - max}자 잘림 / 원본 ${text.length}자]`
  );
}

// 표 형태 스프레드시트 — 바이너리지만 CSV(텍스트)로 변환해 읽을 수 있다.
const SPREADSHEET_EXT = new Set([".xlsx", ".xls", ".xlsm", ".xlsb", ".ods"]);

/** 엑셀 등 스프레드시트를 시트별 CSV 텍스트로 변환 (행/열 수 표기). */
function readSpreadsheet(filePath: string, displayPath: string): string {
  const wb = XLSX.read(fs.readFileSync(filePath), { type: "buffer", cellDates: true });
  const parts: string[] = [];
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const range = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]) : null;
    const rows = range ? range.e.r - range.s.r + 1 : 0;
    const cols = range ? range.e.c - range.s.c + 1 : 0;
    const csv = XLSX.utils.sheet_to_csv(ws, { blankrows: false });
    if (csv.trim()) parts.push(`# 시트: ${name} (약 ${rows}행 × ${cols}열)\n${csv}`);
  }
  const body = parts.join("\n\n") || "(빈 스프레드시트)";
  // 컬럼·값을 파악하는 용도. 전체 데이터를 결과물에 넣을 땐 손으로 옮기거나 스크립트를 쓰지 말고
  // 자리표시자로 넣으세요: <script>window.__DATA = {{BCAVE_DATA:파일경로}};</script> (전체 JSON 자동 주입).
  const header =
    `[엑셀 파일을 표(CSV)로 변환해 읽었습니다: ${displayPath}\n` +
    `※ 컬럼·값 확인용입니다. 결과 HTML 에 전체 데이터를 넣을 땐 npm·스크립트 없이 ` +
    `\`<script>window.__DATA = {{BCAVE_DATA:${displayPath}}};</script>\` 한 줄을 쓰면 전체 행이 JSON 배열로 자동 주입됩니다(각 행 = 컬럼명 키 객체).]\n\n`;
  return header + truncate(body, MAX_READ_CHARS, "표가 큼(앞부분만)");
}

/** 스프레드시트를 행 객체 JSON 배열로 (자리표시자 {{BCAVE_DATA}} 치환용). 날짜는 실제 날짜로 변환. */
function spreadsheetToJSON(filePath: string, sheet?: string): string {
  try {
    const wb = readWorkbook(filePath); // 텍스트(csv·tsv·txt·html)·바이너리(엑셀) 모두 지원
    const name = sheet && wb.Sheets[sheet] ? sheet : wb.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: null, raw: false });
    return JSON.stringify(rows.slice(0, 100_000));
  } catch {
    return "[]";
  }
}

/** PDF 텍스트 추출 (의존성 없이 zlib 로 FlateDecode 스트림 해제 + 텍스트 연산자 파싱).
 *  디지털 생성 PDF 의 라틴/ASCII 텍스트에 유효. 스캔본·일부 한글 CID 폰트는 추출이 제한적. */
function extractPdfText(buf: Buffer): string {
  const raw = buf.toString("latin1");
  const chunks: string[] = [];
  const re = /stream\r?\n?([\s\S]*?)endstream/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const data = Buffer.from(m[1], "latin1");
    let text = "";
    try { text = zlib.inflateSync(data).toString("latin1"); }
    catch { try { text = zlib.inflateRawSync(data).toString("latin1"); } catch { text = data.toString("latin1"); } }
    // 텍스트 연산자: (문자열)Tj / [ ... ]TJ 안의 리터럴 문자열만 모은다.
    const ops: string[] = [];
    const lit = /\((?:\\.|[^\\()])*\)/g;
    let g: RegExpExecArray | null;
    while ((g = lit.exec(text))) {
      ops.push(g[0].slice(1, -1).replace(/\\([()\\])/g, "$1").replace(/\\n/g, "\n").replace(/\\r/g, "").replace(/\\t/g, "\t"));
    }
    const joined = ops.join("");
    if (joined.trim()) chunks.push(joined);
  }
  return chunks.join("\n").replace(/[ \t]{2,}/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

/** 텍스트로 보기 어려운 바이너리 데이터인지 판별 (NUL·제어문자·깨진문자 비율). */
function looksBinary(text: string): boolean {
  if (text.length === 0) return false;
  if (text.includes("\u0000")) return true;
  const sample = text.slice(0, 4000);
  let bad = 0;
  for (let i = 0; i < sample.length; i++) {
    const c = sample.charCodeAt(i);
    // 탭(9)·LF(10)·CR(13) 외의 제어문자, 그리고 대체문자(U+FFFD)를 이상치로 카운트
    if ((c < 9 || (c > 13 && c < 32)) || c === 0xfffd) bad++;
  }
  return bad / sample.length > 0.1;
}

/** 데이터·Chart.js 자리표시자를 실제 리소스로 치환. */
function resolvePlaceholders(content: string, cwd: string): string {
  // {{BCAVE_DATA:파일경로[#시트]}} → 전체 데이터 JSON (npm·스크립트 불필요, 토큰 0)
  content = content.replace(/\{\{BCAVE_DATA:([^}]+)\}\}/g, (_m, spec) => {
    const [rawPath, sheet] = String(spec).split("#");
    return spreadsheetToJSON(path.resolve(cwd, rawPath.trim()), sheet?.trim());
  });
  // {{BCAVE_DS:id}} → 선택된 디자인 시스템 CSS(+안전 보정) 인라인 (토큰 0)
  content = content.replace(/\{\{BCAVE_DS:([\w-]+)\}\}/g, (_m, id) => {
    const s = DESIGN_SYSTEMS[id] ?? Object.values(DESIGN_SYSTEMS).find((x) => x.key === String(id).toLowerCase());
    return s ? s.css + "\n" + DS_SAFETY : "";
  });
  // 흔한 실수 교정: <script src="{{BCAVE_CHARTJS}}"></script> (라이브러리를 src 에 넣음) → 인라인 <script>…</script>
  content = content.replace(
    /<script\b[^>]*\bsrc=["']\{\{BCAVE_CHARTJS\}\}["'][^>]*>\s*<\/script>/gi,
    "<script>{{BCAVE_CHARTJS}}</script>",
  );
  // Chart.js 자리표시자·CDN <script> → 인라인 소스(+기본값). 완전한 단일 파일·오프라인 가능.
  if (content.includes("{{BCAVE_CHARTJS}}")) {
    content = content.split("{{BCAVE_CHARTJS}}").join(CHARTJS_SOURCE + CHARTJS_DEFAULTS);
  }
  content = content.replace(
    /<script\b[^>]*\bsrc="[^"]*chart[^"]*"[^>]*>\s*<\/script>/gi,
    CHARTJS_INLINE,
  );
  return content;
}

/** HTML 을 read_file 로 볼 때, 대용량 인라인(라이브러리·데이터 JSON)을 짧은 마커로 접는다.
 *  이유: 이미 생성된 대시보드를 수정할 때 거대한 데이터/차트 라이브러리가 읽기 한도(40K)를
 *  다 잡아먹어 정작 레이아웃을 못 보고, 데이터를 재현하려다 비워버리는 문제를 막는다.
 *  마커에 자리표시자 사용법을 남겨 수정 시 데이터가 자동 재주입되도록 유도한다. */
function collapseHeavyScripts(html: string): string {
  return html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (m, attrs, js: string) => {
    if (js.length <= 8000) return m; // 손으로 쓴 차트 설정 등은 그대로 보이게
    const head = js.slice(0, 300);
    const isLib = /Chart\.js v\d|@license|@preserve/.test(head) || /^\s*\/\*!/.test(head);
    const note = isLib
      ? "Chart.js 라이브러리 인라인 — 저장 시 <script>{{BCAVE_CHARTJS}}</script> 로 다시 넣으세요"
      : `대용량 인라인 데이터/스크립트 약 ${js.length.toLocaleString()}자 생략 — 데이터는 직접 재현·복사하지 말고 저장 시 {{BCAVE_DATA:원본 스프레드시트 경로#시트}} 자리표시자로 다시 주입하세요(경로는 이전과 동일)`;
    return `<script${attrs}>/* [${note}] */</script>`;
  });
}

// 내보내기 전 HTML 자동 검토: 데이터 누락·자리표시자·인라인 스크립트 문법 오류를 잡는다.
function reviewHtml(content: string, filePath: string): string[] {
  if (!/\.html?$/i.test(filePath)) return [];
  const issues: string[] = [];
  const isPage = /<body|<html/i.test(content);
  // 대시보드(디자인시스템/데이터 주입)인지 — 데이터 관련 검토는 대시보드에만 적용(일반 UI 오탐 방지)
  const isDashboard = /\{\{BCAVE_(DS|DATA|CHARTJS)|window\.__DATA|class=["'][^"']*\b(?:ds-|rp-)/.test(content);

  // 1) 미해결 자리표시자 (항상)
  const ph = content.match(/\{\{[A-Za-z_][^}]*\}\}/g);
  if (ph) issues.push(`치환되지 않은 자리표시자: ${[...new Set(ph)].slice(0, 3).join(", ")}`);

  // 2) 대시보드 데이터 검토
  if (isDashboard) {
    if (
      /window\.__DATA\s*=\s*\[\s*\]/.test(content) ||
      /\b(?:const|let|var)\s+\w*[Dd]ata\w*\s*=\s*\[\s*\]\s*[;,]/.test(content) ||
      /["']?rows["']?\s*:\s*\[\s*\]/.test(content)
    ) {
      issues.push(
        "데이터 배열이 비어 있습니다(예: window.__DATA=[]). `{{BCAVE_DATA:<데이터파일 절대경로>}}` 로 실제 데이터를 넣고 경로가 정확한지 확인하세요.",
      );
    }
    const hasVisual = /<canvas|<tbody|<table/i.test(content);
    const hasData = /window\.__DATA|[Dd]ata\s*=\s*\[\s*\{/.test(content);
    if (hasVisual && !hasData) {
      issues.push("차트/표가 있는데 데이터가 없습니다. `{{BCAVE_DATA:경로}}` 로 데이터를 주입하세요.");
    }
  }

  // 3) 인라인 스크립트 문법 검사 (벤더 Chart.js·거대 데이터 스크립트 제외)
  const scripts = content.match(/<script>[\s\S]*?<\/script>/g) || [];
  for (const block of scripts) {
    const js = block.slice(8, -9);
    if (js.length > 60000 || js.includes("Chart.js v") || /^\s*window\.__DATA\s*=/.test(js)) continue;
    if (!js.trim()) continue;
    try {
      new Function(js); // 파싱만 (실행 아님)
    } catch (e) {
      issues.push(`스크립트 문법 오류: ${(e as Error).message}`);
      break;
    }
  }

  // 4) 레이아웃·반응형 검토 (완결된 HTML 페이지 — 대시보드/일반 UI 공통)
  if (isPage) {
    const styleCss =
      (content.match(/<style[\s\S]*?<\/style>/gi) || []).join("\n") +
      " " +
      (content.match(/style=["'][^"']*["']/g) || []).join(" ");
    if (!/<meta[^>]+name=["']?viewport\b/i.test(content)) {
      issues.push('반응형: <meta name="viewport" content="width=device-width,initial-scale=1"> 가 없습니다(모바일에서 데스크톱 폭으로 축소 렌더).');
    }
    if (styleCss.length > 40) {
      if (/(?:^|[^-])(?:width|padding)\s*:/.test(styleCss) && !/box-sizing\s*:\s*border-box/.test(styleCss)) {
        issues.push("레이아웃: box-sizing 이 없습니다. `*{box-sizing:border-box}` 를 넣으세요(width+padding 이 컨테이너를 넘치게 하는 주원인).");
      }
      let big = false;
      const wRe = /(?:min-)?width\s*:\s*(\d{3,})px/gi;
      let wm: RegExpExecArray | null;
      while ((wm = wRe.exec(styleCss))) if (parseInt(wm[1]) >= 700) { big = true; break; }
      if (big && !/max-width\s*:/.test(styleCss)) {
        issues.push("반응형: 700px+ 고정 width 인데 max-width 가 없습니다(작은 화면에서 가로 스크롤/깨짐). `max-width` + `width:100%` 로 바꾸세요.");
      }
      if (!/@media/.test(styleCss) && !/(%|vw|vh|minmax\(|\dfr|clamp\(|flex|grid)/.test(styleCss)) {
        issues.push("반응형: @media 브레이크포인트도, 유동 레이아웃(%/vw/flex/grid/minmax/clamp)도 없습니다. 모바일 대응을 추가하세요.");
      }
    }
    if (/<img\b/i.test(content) && !/img[^{}]*\{[^}]*max-width/i.test(styleCss) && !/<img[^>]*style=["'][^"']*max-width/i.test(content)) {
      issues.push("반응형: <img> 에 max-width:100% 가 없습니다(원본 크기로 컨테이너를 넘칠 수 있음).");
    }
    // 단일 파일: 외부 스타일시트(<link rel=stylesheet>) 금지 — 웹폰트 링크만 허용. CSS 는 인라인 <style> 로.
    const cssLinks = content.match(/<link\b[^>]*rel=["']?stylesheet[^>]*>/gi) || [];
    const nonFontCss = cssLinks.filter((l) => !/fonts\.googleapis|fonts\.gstatic|pretendard|\bfont/i.test(l));
    if (nonFontCss.length) {
      issues.push("단일 파일 규칙: 외부 CSS(<link rel=\"stylesheet\">)를 쓰지 말고 CSS 를 전부 같은 파일의 인라인 <style> 안에 넣으세요(웹폰트 링크만 예외).");
    }
    // 차트(canvas) 세로 과확장 방지 — 각 canvas 를 감싼 요소에 고정 높이가 있어야 한다.
    if (/<canvas/i.test(content)) {
      // (a) canvas 에 height:auto → Chart.js 세로 무한 확장
      if (/canvas[^{}]*\{[^}]*height\s*:\s*auto/i.test(styleCss)) {
        issues.push("차트 오류: canvas 에 height:auto 를 주면 Chart.js 가 세로로 무한 확장됩니다. canvas 에는 height 를 지정하지 말고 높이가 고정된 컨테이너 <div>(position:relative;height:280px) 안에 넣고 maintainAspectRatio:false 를 쓰세요.");
      }
      // (b) 각 canvas 의 "직전 감싸는 요소"에 고정 높이가 있는지 개별 확인
      //     (한 차트만 높이를 주고 다른 차트는 빠뜨리는 실수 방지)
      const esc = (c: string) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      let unbounded = 0;
      for (const m of content.matchAll(/<(\w+)([^>]*)>\s*<canvas\b/gi)) {
        const attrs = m[2] || "";
        const inlineH = /style=["'][^"']*(?:height|aspect-ratio)\s*:\s*[^;"']*\d/i.test(attrs);
        const cls = (attrs.match(/class=["']([^"']+)["']/) || [])[1] || "";
        const classH = cls
          .split(/\s+/)
          .filter(Boolean)
          .some((c) => new RegExp(`\\.${esc(c)}\\b[^{}]*\\{[^}]*(?:height\\s*:\\s*\\d|aspect-ratio\\s*:)`, "i").test(styleCss));
        if (!inlineH && !classH) unbounded++;
      }
      if (unbounded > 0) {
        issues.push(`차트 오류: canvas ${unbounded}개의 감싸는 요소에 고정 높이가 없습니다 → 차트가 컨테이너 폭에 맞춰 과도하게 커집니다(maintainAspectRatio 기본값 문제). 모든 canvas 를 'position:relative; height:280px' 처럼 높이 고정된 <div> 에 넣고, Chart 옵션에 maintainAspectRatio:false 를 쓰세요.`);
      }
      // (c) Chart.js 쓰는데 maintainAspectRatio:false 가 한 번도 없음 → 폭 기준 2:1 로 과대해짐
      if (/new Chart|\{\{BCAVE_CHARTJS\}\}|chart\.umd/i.test(content) && !/maintainAspectRatio\s*:\s*false/i.test(content)) {
        issues.push("차트 권장: Chart 옵션에 maintainAspectRatio:false 가 없습니다. 없으면 차트가 컨테이너 폭의 2:1 비율로 커집니다. 고정 높이 컨테이너 + maintainAspectRatio:false 조합을 쓰세요.");
      }
    }
    // 차트 색이 CSS 변수로만 지정됨 → canvas 는 var() 를 못 읽어 검정 단색으로 폴백(자동 플러그인이 보정하지만 경고로 알림)
    const scripts = content.match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) || [];
    const userJs = scripts.filter((s) => s.length < 20000).join("\n"); // 인라인 라이브러리(대용량) 제외
    if (/backgroundColor|borderColor/.test(userJs) && /var\(--/.test(userJs)) {
      issues.push("차트 색상: Chart.js 설정에 var(--chart-1) 같은 CSS 변수를 그대로 넣었습니다. canvas 는 var() 를 못 읽어 색이 검정으로 나옵니다. getComputedStyle(document.documentElement).getPropertyValue('--chart-1').trim() 로 실제 값을 뽑아 팔레트 배열을 만들고, 도넛/파이는 backgroundColor 에 세그먼트 수만큼의 색 배열을 넣으세요.");
    }
    // 라이브러리 코드가 <script src="…"> 의 src 에 통째로 들어간 경우(그러면 로드 실패 → 차트 안 뜸)
    if (/<script\b[^>]*\bsrc=["'][^"']{300,}/i.test(content)) {
      issues.push("차트 오류: <script src=…> 의 src 값이 비정상적으로 깁니다(라이브러리 코드를 src 에 넣음 → 로드 실패로 차트가 안 뜸). Chart.js 는 <script>{{BCAVE_CHARTJS}}</script> 처럼 인라인으로 넣으세요.");
    }

    // 결과물에 들어가면 안 되는 "제작 과정·메타·다음 단계" 서술 (스크립트 제외한 표시 텍스트에서)
    const visible = content.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ");
    if (/다시 ?구성했|재구성했|구성했습니다|반영했습니다|바꿨습니다|데이터 ?출처|단일 ?HTML|바로 열 수 있|원하시면|다음 단계로|추가할 수 있(?:어요|습니다)/.test(visible)) {
      issues.push("결과물에 제작 과정·데이터 출처·'원하시면 다음 단계로…' 같은 설명 문구가 들어가 있습니다. 이런 서술은 파일에서 빼고 채팅으로만 말하세요(대시보드엔 실제 콘텐츠만).");
    }
    // 로컬 절대경로가 표시 텍스트로 노출
    if (/(?:\/Users\/|\/home\/|[A-Za-z]:\\Users\\)[^\s"'<>]+/.test(visible)) {
      issues.push("결과물에 로컬 파일 절대경로가 노출돼 있습니다. 화면에 경로를 표시하지 마세요.");
    }
    // 제목(h1)이 문장형/과다 — 보고서 제목은 짧은 명사구
    const h1m = content.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
    if (h1m) {
      const h1text = h1m[1].replace(/<[^>]+>/g, "").trim();
      if (/[.。]$/.test(h1text) || h1text.length > 40) {
        issues.push(`h1 제목이 문장형이거나 너무 깁니다("${h1text.slice(0, 30)}…"). 보고서 제목처럼 짧은 명사구(마침표 없이)로, 부연은 부제로 옮기세요.`);
      }
    }
  }

  // 디자인시스템 시그니처(섹션 헤더/히어로/타이포 토큰) 준수 검사
  const isTokenSystem = content.includes("--text-heading-1") || content.includes("--text-data");
  if (isTokenSystem) {
    // 시스템이 .sec-head 를 정의했는데 본문에서 안 씀 → 섹션 헤더 시그니처 누락
    if (/\.sec-head\s*\{/.test(content) && !/class="[^"]*\bsec-head\b/.test(content)) {
      issues.push('섹션 헤더 시그니처 누락: 시스템에 .sec-head(영문 오버라인+제목+구분선)가 있는데 본문에서 안 썼습니다. 각 섹션 제목을 밋밋한 <h2> 대신 <div class="sec-head">…</div> 헤더로 감싸세요(가이드 마크업 그대로).');
    }
    // 히어로를 쓰면서 h1 이 단색(강조 <em> 없음) → 2색 헤드라인 불일치
    if (/class="[^"]*\bhero\b/.test(content)) {
      const heroH1 = content.match(/class="[^"]*\bhero\b[\s\S]{0,400}?<h1[^>]*>([\s\S]*?)<\/h1>/i);
      if (heroH1 && !/<em\b/i.test(heroH1[1])) {
        issues.push("히어로 h1 2색 누락: 강조 단어/줄을 <em>…</em>로 감싸 강조색이 되게 하세요(디자인시스템의 2색 헤드라인과 맞춤).");
      }
    }
    // 타입 토큰 대신 임의 px 폰트를 인라인으로 남발 → 폰트 크기 불일치
    const inlinePx = content.match(/style="[^"]*font-size:\s*\d+(?:\.\d+)?px/gi);
    if (inlinePx && inlinePx.length > 5) {
      issues.push(`타이포 토큰 미사용: 인라인 임의 px 폰트가 ${inlinePx.length}곳입니다. 글자 크기는 font:var(--text-display-1|heading-1|body-1|…), 숫자는 var(--text-data-*) 토큰만 쓰세요(임의 px 는 다른 시스템처럼 보입니다).`);
    }
  }

  return issues;
}

// 스크립트(shell_exec)가 써낸 HTML 에 남은 자리표시자를 사후 치환 (write_file 툴 우회 대비).
async function resolvePlaceholdersInDir(cwd: string): Promise<void> {
  let files: string[] = [];
  try {
    files = await glob("**/*.{html,htm,svg}", { cwd, nodir: true, ignore: IGNORE });
  } catch {
    return;
  }
  for (const f of files.slice(0, MAX_ITEMS)) {
    const full = path.join(cwd, f);
    try {
      if (fs.statSync(full).size > 20_000_000) continue;
      const src = fs.readFileSync(full, "utf-8");
      if (!src.includes("{{BCAVE_")) continue; // 우리 자리표시자가 있는 파일만
      const out = resolvePlaceholders(src, cwd);
      if (out !== src) fs.writeFileSync(full, out, "utf-8");
    } catch {
      /* skip */
    }
  }
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  cwd: string
): Promise<string> {
  try {
    switch (name) {
      case "read_file": {
        const filePath = path.resolve(cwd, args.path as string);
        const ext = path.extname(filePath).toLowerCase();
        // 엑셀 등 스프레드시트는 표(CSV)로 변환해서 읽는다.
        if (SPREADSHEET_EXT.has(ext)) {
          return readSpreadsheet(filePath, args.path as string);
        }
        // PDF 는 텍스트를 추출해 읽는다 (의존성 없이). 데이터가 표 형태면 CSV 로 정리해
        // 활용할 수 있다.
        if (ext === ".pdf") {
          const text = extractPdfText(fs.readFileSync(filePath));
          if (!text || text.length < 20) {
            return `[PDF 에서 텍스트를 추출하지 못했습니다: ${args.path}\n(스캔 이미지 PDF 이거나 특수 폰트일 수 있습니다. 표 데이터라면 CSV/엑셀로 변환해 주세요.)]`;
          }
          return `[PDF 텍스트 추출: ${args.path}]\n\n` + truncate(text, MAX_READ_CHARS, "PDF가 큼(앞부분만)");
        }
        let content: string;
        let partial = false;
        // 거대 파일은 통째로 메모리에 올리지 않고 앞부분만 읽는다.
        if (fs.statSync(filePath).size > 2_000_000) {
          const fd = fs.openSync(filePath, "r");
          const buf = Buffer.alloc(MAX_READ_CHARS);
          const n = fs.readSync(fd, buf, 0, MAX_READ_CHARS, 0);
          fs.closeSync(fd);
          content = buf.toString("utf-8", 0, n);
          partial = true;
        } else {
          content = fs.readFileSync(filePath, "utf-8");
        }
        // 이미지 등 바이너리는 원문을 내보내지 않는다 (화면 깨짐·토큰 낭비 방지).
        if (looksBinary(content)) {
          return `[바이너리 파일이라 텍스트로 열 수 없습니다: ${args.path}\n(이미지/압축/실행 파일 등은 내용을 직접 읽을 수 없습니다. 필요하면 어떤 데이터인지 사용자에게 물어보거나 적절한 도구/라이브러리로 처리하세요.)]`;
        }
        // 생성된 대시보드 HTML: 대용량 인라인(라이브러리·데이터)을 접어 레이아웃이 온전히 보이게 하고,
        // 수정 시 데이터를 {{BCAVE_DATA:경로}} 로 재주입하도록 유도한다.
        if (ext === ".html" || ext === ".htm") {
          content = collapseHeavyScripts(content);
        }
        return truncate(content, MAX_READ_CHARS, partial ? "파일이 큼(앞부분만)" : "파일이 큼");
      }
      case "write_file": {
        const filePath = path.resolve(cwd, args.path as string);
        // 데이터·Chart.js 자리표시자 → 실제 리소스로 치환 (프롬프트 토큰 절약)
        const content = resolvePlaceholders(args.content as string, cwd);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, content, "utf-8");
        // 내보내기 전 자동 검토 (데이터 누락·자리표시자·문법). 문제가 있으면 모델이 고쳐 다시 쓰게 알린다.
        const issues = reviewHtml(content, args.path as string);
        if (issues.length) {
          return (
            `File written: ${args.path}\n` +
            `⚠ 내보내기 검토에서 문제가 발견됐습니다. 아래를 고쳐 같은 파일에 다시 저장하세요:\n` +
            issues.map((s) => "  - " + s).join("\n")
          );
        }
        return `File written: ${args.path} (검토 통과)`;
      }
      case "list_files": {
        const dirPath = path.resolve(cwd, args.path as string);
        const pattern = (args.pattern as string) || "*";
        const files = await glob(pattern, { cwd: dirPath, ignore: IGNORE });
        files.sort();
        const shown = files.slice(0, MAX_ITEMS);
        let out = shown.join("\n");
        if (files.length > MAX_ITEMS) {
          out += `\n… (${files.length - MAX_ITEMS}개 더 있음 / 총 ${files.length}개, node_modules 등 제외)`;
        }
        return truncate(out, MAX_TOOL_CHARS);
      }
      case "search_files": {
        const searchDir = path.resolve(cwd, (args.path as string) || ".");
        const regex = new RegExp(args.pattern as string);
        const allFiles = await glob("**/*", {
          cwd: searchDir,
          nodir: true,
          ignore: IGNORE,
        });
        const results: string[] = [];
        for (const file of allFiles) {
          if (results.length >= MAX_ITEMS) break;
          const fullPath = path.join(searchDir, file);
          let content: string;
          try {
            if (fs.statSync(fullPath).size > MAX_FILE_BYTES) continue;
            content = fs.readFileSync(fullPath, "utf-8");
          } catch {
            continue;
          }
          if (content.includes("\u0000")) continue; // 바이너리 건너뜀
          const lines = content.split("\n");
          for (let i = 0; i < lines.length && results.length < MAX_ITEMS; i++) {
            if (regex.test(lines[i])) {
              results.push(`${file}:${i + 1}: ${lines[i].slice(0, 200)}`);
            }
          }
        }
        let out = results.length > 0 ? results.join("\n") : "No matches found.";
        if (results.length >= MAX_ITEMS) out += `\n… (결과가 많아 ${MAX_ITEMS}개에서 잘림)`;
        return truncate(out, MAX_TOOL_CHARS);
      }
      case "shell_exec": {
        const output = await new Promise<string>((resolve) => {
          const child = exec(args.command as string, {
            cwd,
            timeout: 120_000,
            maxBuffer: 10 * 1024 * 1024,
          });
          let stdout = "";
          let stderr = "";
          child.stdout?.on("data", (data) => (stdout += data));
          child.stderr?.on("data", (data) => (stderr += data));
          child.on("close", (code) => {
            let out = stdout + (stderr ? `\nSTDERR:\n${stderr}` : "");
            if (looksBinary(out)) {
              out = "[명령 출력에 바이너리 데이터가 섞여 있어 텍스트로 표시하지 않았습니다]";
            }
            resolve(code !== 0 ? `Exit code ${code}\n${out}` : out);
          });
          child.on("error", (err) => resolve(`Error: ${err.message}`));
        });
        // 스크립트가 HTML 을 써냈다면 남은 자리표시자를 치환한다.
        await resolvePlaceholdersInDir(cwd);
        return truncate(output, MAX_TOOL_CHARS, "출력이 김");
      }
      default:
        return `Error: Unknown tool "${name}"`;
    }
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
}
