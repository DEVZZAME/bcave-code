import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import os from "node:os";
import zlib from "node:zlib";
import { exec, spawn } from "node:child_process";
import { glob } from "glob";
import XLSX from "xlsx";
import { CHARTJS_SOURCE } from "../assets/chartjs.js";
import type { PermissionCategory } from "./permissions.js";
import { loadConfig } from "../config/config.js";
import { assembleDesignArtifact, assembleDesignArtifactParts, designSystemNames, hasDesignSystem, lintDesignArtifact } from "../design-system/runtime.js";

// 스프레드시트 로드: 텍스트(csv·tsv·txt·html)는 UTF-8 원본으로(raw), 그 외는 버퍼로.
const _TEXT_EXT = new Set([".csv", ".tsv", ".txt", ".tab", ".html", ".htm"]);
const designLintAttempts = new Map<string, number>();

/** 바이트를 텍스트로 디코딩 — UTF-8 로 깨지면(대체문자 다수) 한국어 EUC-KR/CP949 로 재시도. BOM 제거. */
function readBytesAsText(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  let text = buf.toString("utf8");
  const bad = (text.match(/�/g) || []).length;
  if (bad > 2 && bad / Math.max(1, text.length) > 0.001) {
    // 한국 사내 문서에 흔한 CP949/EUC-KR 로 재해석해 더 깨끗하면 채택
    for (const enc of ["euc-kr", "cp949", "windows-949"]) {
      try {
        const alt = new TextDecoder(enc).decode(buf);
        if ((alt.match(/�/g) || []).length < bad) { text = alt; break; }
      } catch { /* 해당 인코딩 미지원 환경 → 다음 후보 */ }
    }
  }
  return text.replace(/^﻿/, "");
}

function readWorkbook(filePath: string): XLSX.WorkBook {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  if (_TEXT_EXT.has(ext)) return XLSX.read(readBytesAsText(filePath), { type: "string", raw: true });
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
      description: "Create or overwrite a file. For a standalone active-design-system HTML artifact, pass body and app_script as separate raw strings. For application files such as TSX/JSX/CSS, pass content and follow the active design-system assets and tokens.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "File path relative to working directory" },
          content: { type: "string", description: "Regular application/file content. Do not use only for standalone active-design-system HTML artifacts." },
          body: { type: "string", description: "Dashboard <body> inner markup only, without <body>, <style>, or code fences." },
          app_script: { type: "string", description: "Dashboard data injection and application JavaScript only, without <script> or code fences." },
          design_system: { type: "string", enum: designSystemNames(), description: "Design system for a standalone HTML artifact. Application code uses the active system through shared CSS assets instead." },
        },
        required: ["path"],
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

/** 장기 실행 개발/프리뷰 서버 명령인지 판별한다. */
export function isDevServerCommand(command: string): boolean {
  return /(?:^|\s|\&\&|\|\|)\s*(?:npm|yarn|pnpm|bun)\s+(?:run\s+)?(?:dev|start|serve|preview|dev:server|start:dev)\b/i.test(command) ||
    /(?:^|\s)(?:npx\s+)?vite\b(?!\s+build)/i.test(command) ||
    /\b(?:next|vite|ts-node|tsx|nodemon|pm2 start)\b.*(?:dev|start|watch|index\.ts|server\.ts|index\.js)/i.test(command);
}

/** 새 프로세스의 명령/로그에 실제로 나타난 포트만 반환한다. */
export function extractServerPorts(text: string): number[] {
  const found = new Set<number>();
  const unavailable = new Set<number>();
  for (const m of text.matchAll(/\bport\s+(\d{2,5})\s+is\s+(?:already\s+)?in\s+use\b/gi)) unavailable.add(+m[1]);
  for (const m of text.matchAll(/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|::1)?:(\d{2,5})\b/g)) found.add(+m[1]);
  for (const m of text.matchAll(/\bport[\s:=]+(\d{2,5})\b/gi)) found.add(+m[1]);
  for (const m of text.matchAll(/\b(?:api|server)\s+(?:on|at|listening(?:\s+on)?)\s+(\d{2,5})\b/gi)) found.add(+m[1]);
  return [...found].filter((port) => port > 0 && port < 65536 && !unavailable.has(port));
}

// ── 출력 폭증 방지: 툴 결과 크기·항목 수 상한 + 무거운 폴더 제외 ──
// (제한이 없으면 list_files **/* 나 큰 파일이 대화 히스토리에 통째로 쌓여
//  매 턴 재전송되며 토큰이 폭증한다.)
const MAX_TOOL_CHARS = 8_000; // 반복 도구 결과의 모델 전송량과 TPM 사용 제한
const MAX_READ_CHARS = 24_000; // 큰 파일도 수정에 필요한 앞부분은 충분히 유지
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

// 표 형태 데이터 — read_file 이 컬럼·주입법을 안내하는 미리보기로 처리하는 확장자.
const SPREADSHEET_EXT = new Set([".xlsx", ".xls", ".xlsm", ".xlsb", ".ods"]);
const TABULAR_EXT = new Set([...SPREADSHEET_EXT, ".csv", ".tsv", ".tab"]);

/** 파일의 시트 이름 목록(엑셀=시트, json=배열 키 또는 data, csv=단일). */
function sheetNamesOf(filePath: string): string[] {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  if (ext === ".json") {
    try {
      const p = JSON.parse(readBytesAsText(filePath));
      if (p && typeof p === "object" && !Array.isArray(p)) {
        const keys = Object.entries(p).filter(([, v]) => Array.isArray(v)).map(([k]) => k);
        if (keys.length) return keys;
      }
    } catch { /* 파싱 실패 → 단일 */ }
    return ["data"];
  }
  if (ext === ".pdf") return [];
  try { return readWorkbook(filePath).SheetNames; } catch { return []; }
}

const _fmtPreview = (v: unknown) => {
  if (v == null) return "";
  const s = String(v);
  return s.length > 40 ? s.slice(0, 39) + "…" : s;
};

/** 표 데이터(엑셀/csv/ods)를 컬럼·미리보기·주입법 안내로 변환. window.__DATA 에 담길 정리된 모습 그대로 보여준다. */
function readSpreadsheet(filePath: string, displayPath: string): string {
  const sheetNames = sheetNamesOf(filePath);
  const parts: string[] = [];
  for (const name of sheetNames) {
    const { columns, rows } = loadTabular(filePath, name);
    if (!columns.length && !rows.length) continue;
    const head = `# 시트: ${name} (약 ${rows.length}행 × ${columns.length}열)\n# 컬럼(각 행 객체의 키): ${columns.join(", ")}`;
    const sample = [columns.join(" | "), ...rows.slice(0, 20).map((r) => columns.map((c) => _fmtPreview(r[c])).join(" | "))].join("\n");
    parts.push(`${head}\n${sample}`);
  }
  const body = parts.join("\n\n") || "(빈 데이터)";
  const multi = sheetNames.length > 1;
  // 데이터 주입 방법(중요): 손으로 옮기거나 스크립트 없이, 자리표시자로 전체 JSON 을 넣는다.
  // 숫자는 이미 number(콤마 없음), 날짜는 문자열, 각 행 = 실제 컬럼명 키 객체. 제목행은 자동 스킵됨.
  const recipe = multi
    ? `이 파일은 시트가 ${sheetNames.length}개(${sheetNames.join(", ")})입니다. 필요한 시트를 각각 변수로 주입하세요:\n` +
      `  <script>\n` +
      sheetNames.map((n) => `  window.__${n.replace(/[^\w가-힣]/g, "")} = {{BCAVE_DATA:${displayPath}#${n}}};`).join("\n") +
      `\n  </script>\n` +
      `또는 전체를 한 번에: <script>window.__SHEETS = {{BCAVE_SHEETS:${displayPath}}};</script> → window.__SHEETS["시트명"] 로 접근.`
    : `<script>window.__DATA = {{BCAVE_DATA:${displayPath}}};</script> 한 줄이면 전체 행이 JSON 배열로 주입됩니다.`;
  const header =
    `[표 데이터 파일을 읽었습니다: ${displayPath}\n` +
    `※ 아래는 컬럼·값 확인용 미리보기(정리 후 실제 window.__DATA 모습: 제목·각주·합계 행 제거, 숫자는 number)입니다. 결과 HTML 에는 이 표를 손으로 옮기지 말고 자리표시자로 데이터를 주입하세요:\n` +
    `${recipe}\n` +
    `주의: 존재하지 않는 전역(window.__DATA_MAP__, loadSheet() 등)을 지어내지 말 것 — 위 자리표시자만이 데이터를 주입한다. 숫자는 이미 number 라 +row['컬럼'] 로 바로 합산 가능(콤마 문자열 아님). window.__DATA 는 이미 정리된 행 객체 배열이니 .slice() 로 앞행을 건너뛰지 말 것(제목·각주·합계 행은 자동 제거됨). 표에 없는 컬럼명을 지어내지 말고 위 '컬럼' 목록의 키만 사용할 것.]\n\n`;
  return header + truncate(body, MAX_READ_CHARS, "표가 큼(앞부분만)");
}

/** 시트에서 진짜 헤더 행을 찾아 행 객체 배열로 변환.
 *  많은 엑셀이 1행에 제목/부제(병합셀)를 두고 실제 컬럼명은 2~3행에 둔다 —
 *  그대로 sheet_to_json 하면 헤더가 "__EMPTY" 로 깨지므로, 앞쪽에서 "거의 꽉 찬" 첫 행을 헤더로 본다. */
// 셀 값을 집계 가능한 형태로 정규화: 숫자는 진짜 number, 날짜는 읽기 좋은 문자열,
// "13,531,000" 처럼 텍스트로 저장된 천단위 숫자도 number 로. (그래야 +row[key] 가 NaN 이 안 됨)
function coerceCell(v: unknown): unknown {
  if (v == null) return null;
  if (v instanceof Date) {
    const iso = v.toISOString();
    return iso.slice(11, 19) === "00:00:00" ? iso.slice(0, 10) : iso.slice(0, 19).replace("T", " ");
  }
  if (typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "string") {
    const t = v.trim();
    // 콤마 천단위 숫자 / 소수 → number (선행 0 코드·전화번호 등은 그대로 두려고 콤마·소수·통화 있을 때만 변환)
    if (/^[-+]?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(t) || /^[-+]?\d+\.\d+$/.test(t)) {
      const n = Number(t.replace(/,/g, ""));
      if (Number.isFinite(n)) return n;
    }
    // 통화기호(₩ $ € ¥ £)가 붙은 금액 → number
    if (/^[-+]?[₩$€¥£]\s?\d[\d,]*(?:\.\d+)?$/.test(t) || /^[-+]?\d[\d,]*(?:\.\d+)?\s?(?:원|won)$/i.test(t)) {
      const n = Number(t.replace(/[₩$€¥£,\s원]/gi, "").replace(/won/i, ""));
      if (Number.isFinite(n)) return n;
    }
    return v;
  }
  return v;
}

// 합계/소계 라벨(집계를 오염시키므로 데이터에서 제외)
const _TOTAL_LABEL = /^(합\s*계|소\s*계|총\s*계|총\s*합\s*계?|누\s*계|평\s*균|평균|전\s*체|Total|Sub\s*total|Grand\s*Total|Sum|Average|Avg)$/i;
const _NOTE_MARK = /[※★☆]|색상\s*규칙|범례|비\s*고|주\s*[:：]|참\s*고|출\s*처|note|legend|단위\s*[:：]/i;
const _cellStr = (c: unknown) => (c == null ? "" : String(c).trim());

/** 데이터가 아닌 잡음 행인가 — 각주/범례(희소+긴 문장/마커), 합계·소계 행. */
function isJunkRow(row: unknown[], colCount: number): boolean {
  const filled = row.map(_cellStr).filter((c) => c !== "");
  if (filled.length === 0) return true;
  // 각주/범례: 다열 표인데 채워진 셀이 1개뿐이고 긴 문장이거나 주석 마커 포함
  if (colCount >= 3 && filled.length <= 1) {
    const txt = filled[0] || "";
    if (txt.length > 25 || _NOTE_MARK.test(txt)) return true;
  }
  // 합계/소계/평균 행: 첫 텍스트 셀(숫자가 아닌)이 정확히 집계 라벨
  const firstText = row.map(_cellStr).find((c) => c !== "" && !/^[-+]?[\d,.\s%₩$€¥£]+$/.test(c));
  if (firstText && _TOTAL_LABEL.test(firstText)) return true;
  return false;
}

function sheetToObjects(ws: XLSX.WorkSheet): { columns: string[]; rows: Record<string, unknown>[] } {
  // raw:true → 숫자/날짜를 네이티브 값으로(콤마 문자열 방지). 날짜는 cellDates 로 Date 객체.
  let aoa = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: true, blankrows: false });
  if (!aoa.length) return { columns: [], rows: [] };
  const nonEmpty = (r: unknown[]) => r.filter((c) => _cellStr(c) !== "").length;
  const maxCols = Math.max(...aoa.map((r) => r.length));
  // 데이터가 A열이 아닌 곳부터 시작하는 경우: 좌우로 완전히 빈 열을 잘라낸다.
  let firstCol = maxCols, lastCol = 0;
  for (const r of aoa) for (let c = 0; c < r.length; c++) if (_cellStr(r[c]) !== "") { if (c < firstCol) firstCol = c; if (c > lastCol) lastCol = c; }
  if (firstCol > lastCol) return { columns: [], rows: [] };
  if (firstCol > 0 || lastCol < maxCols - 1) aoa = aoa.map((r) => r.slice(firstCol, lastCol + 1));
  const width = Math.max(...aoa.map((r) => r.length));
  // 헤더 = 앞 10행 중 처음으로 "거의 꽉 찬"(≥80%) 행. 그 위(제목/부제)는 건너뛴다.
  let h = 0;
  for (let i = 0; i < Math.min(aoa.length, 10); i++) {
    if (nonEmpty(aoa[i]) >= Math.max(2, Math.ceil(width * 0.8))) { h = i; break; }
  }
  const seen: Record<string, number> = {};
  const columns = (aoa[h] || []).map((c, i) => {
    let k = _cellStr(c) === "" ? `열${i + 1}` : _cellStr(c);
    if (seen[k] != null) { seen[k]++; k = `${k}_${seen[k]}`; } else seen[k] = 0;
    return k;
  });
  const rows: Record<string, unknown>[] = [];
  for (let r = h + 1; r < aoa.length; r++) {
    const row = aoa[r] || [];
    // 한 시트에 여러 표가 세로로 이어진 경우 첫 표만 반환한다.
    // 예: 브랜드 요약 표 아래 "고객 세그먼트 분포" 제목 + 새 헤더가 이어지는 구조.
    // 데이터가 이미 시작된 뒤 단일 셀 섹션 제목 다음에 다열 텍스트 헤더가 오면 표 경계로 본다.
    const filledNow = row.map(_cellStr).filter(Boolean);
    const next = aoa[r + 1] || [];
    const filledNext = next.map(_cellStr).filter(Boolean);
    const nextTextRatio = filledNext.length
      ? filledNext.filter((c) => !/^[-+]?\d[\d,.%₩$€¥£\s]*$/.test(c)).length / filledNext.length
      : 0;
    if (rows.length > 0 && filledNow.length === 1 && filledNext.length >= 2 && nextTextRatio >= 0.75) break;
    if (isJunkRow(row, columns.length)) continue; // 각주·범례·합계 행 제외
    const obj: Record<string, unknown> = {};
    for (let c = 0; c < columns.length; c++) obj[columns[c]] = coerceCell(row[c] ?? null);
    rows.push(obj);
  }
  return { columns, rows };
}

/** JSON 문자열을 행 객체 배열로. 배열/객체(값이 배열)/AoA/단일객체 모두 수용. */
function jsonToTabular(raw: string, sheet?: string): { columns: string[]; rows: Record<string, unknown>[] } {
  let data: unknown;
  try { data = JSON.parse(raw); } catch { return { columns: [], rows: [] }; }
  let arr: unknown = data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;
    if (sheet && Array.isArray(obj[sheet])) arr = obj[sheet];
    else arr = Object.values(obj).find((v) => Array.isArray(v)) ?? [data];
  }
  const list: unknown[] = Array.isArray(arr) ? arr : [arr];
  if (list.length && Array.isArray(list[0])) {
    const aoa = list as unknown[][];
    const cols = (aoa[0] || []).map((c, i) => (_cellStr(c) === "" ? `열${i + 1}` : _cellStr(c)));
    const rows = aoa.slice(1).map((r) => { const o: Record<string, unknown> = {}; cols.forEach((k, i) => (o[k] = coerceCell(r[i] ?? null))); return o; });
    return { columns: cols, rows };
  }
  const columns: string[] = [];
  const rows = list.map((r) => {
    const o: Record<string, unknown> = {};
    if (r && typeof r === "object" && !Array.isArray(r)) {
      for (const [k, v] of Object.entries(r as Record<string, unknown>)) { if (!columns.includes(k)) columns.push(k); o[k] = coerceCell(v); }
    } else { if (!columns.includes("값")) columns.push("값"); o["값"] = coerceCell(r); }
    return o;
  });
  return { columns, rows };
}

/** 어떤 문서든 표 데이터로 로드 — json/csv/tsv/xlsx/ods 지원. pdf·미지원 형식은 빈 결과. */
function loadTabular(filePath: string, sheet?: string): { columns: string[]; rows: Record<string, unknown>[] } {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  if (ext === ".json") return jsonToTabular(readBytesAsText(filePath), sheet);
  if (ext === ".pdf") return { columns: [], rows: [] }; // PDF 는 표로 신뢰성 있게 변환 불가 → 모델이 다른 방법을 쓰도록
  const wb = readWorkbook(filePath);
  const name = sheet && wb.Sheets[sheet] ? sheet : wb.SheetNames[0];
  if (!name || !wb.Sheets[name]) return { columns: [], rows: [] };
  return sheetToObjects(wb.Sheets[name]);
}

/** 워크북의 모든 시트를 {시트명: 행객체[]} 맵으로 (다중 시트 대시보드용 {{BCAVE_SHEETS}} 치환). */
function workbookToSheetMap(filePath: string): string {
  try {
    const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
    if (ext === ".json") {
      const parsed = JSON.parse(readBytesAsText(filePath));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const map: Record<string, unknown[]> = {};
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) if (Array.isArray(v)) map[k] = jsonToTabular(JSON.stringify(v)).rows.slice(0, 100_000);
        if (Object.keys(map).length) return JSON.stringify(map);
      }
      return JSON.stringify({ data: jsonToTabular(readBytesAsText(filePath)).rows.slice(0, 100_000) });
    }
    if (ext === ".pdf") return "{}";
    const wb = readWorkbook(filePath);
    const map: Record<string, unknown[]> = {};
    for (const name of wb.SheetNames) map[name] = sheetToObjects(wb.Sheets[name]).rows.slice(0, 100_000);
    return JSON.stringify(map);
  } catch {
    return "{}";
  }
}

/** 스프레드시트를 행 객체 JSON 배열로 (자리표시자 {{BCAVE_DATA}} 치환용). 날짜는 실제 날짜로 변환. */
function spreadsheetToJSON(filePath: string, sheet?: string): string {
  try {
    const { rows } = loadTabular(filePath, sheet); // json/csv/xlsx 통합 + 제목행 스킵·잡음행 제외
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
  // {{BCAVE_SHEETS:파일경로}} → 모든 시트를 {시트명: 행객체[]} 맵으로 (다중 시트 대시보드용). {{BCAVE_DATA}} 보다 먼저 치환.
  content = content.replace(/\{\{BCAVE_SHEETS:([^}]+)\}\}/g, (_m, spec) => {
    return workbookToSheetMap(path.resolve(cwd, String(spec).split("#")[0].trim()));
  });
  // {{BCAVE_DATA:파일경로[#시트]}} → 한 시트의 전체 데이터 JSON (npm·스크립트 불필요, 토큰 0)
  content = content.replace(/\{\{BCAVE_DATA:([^}]+)\}\}/g, (_m, spec) => {
    const [rawPath, sheet] = String(spec).split("#");
    return spreadsheetToJSON(path.resolve(cwd, rawPath.trim()), sheet?.trim());
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
  // 데이터 대시보드인지 — 데이터 관련 검토는 대시보드에만 적용(일반 UI 오탐 방지)
  const isDashboard = /\{\{BCAVE_(DATA|SHEETS|CHARTJS)|window\.__DATA|window\.__SHEETS/.test(content);

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
    // 표시 영역(스크립트 제외)에 날 JSON 배열을 통째로 쏟아부은 경우 — 자리표시자를 <td>/본문에 박은 대표적 오류
    const visibleHtml = content.replace(/<script[\s\S]*?<\/script>/gi, " ");
    if (/[\[,]\s*\{\s*["'][^"']+["']\s*:\s*["'][^"']*["']\s*,[\s\S]{1500,}?\}\s*\]/.test(visibleHtml) || /<td[^>]*>\s*\[\s*\{[\s\S]{800,}/i.test(visibleHtml)) {
      issues.push("데이터가 화면에 날(raw) JSON 으로 찍혀 있습니다. {{BCAVE_DATA}} 는 <td>/본문에 넣지 말고 <script>window.__DATA = {{BCAVE_DATA:경로}};</script> 로 변수에 담은 뒤, JS 로 표·차트·KPI 를 window.__DATA 를 순회해 렌더하세요.");
    }
    // 가짜 표 헤더(컬럼 1/2/3) — 실제 컬럼명을 쓰지 않은 신호
    if (/<th[^>]*>\s*컬럼\s*\d/.test(content) || /<th[^>]*>\s*(?:Column|Col)\s*\d/i.test(content)) {
      issues.push("표 헤더가 '컬럼 1/2/3' 같은 자리표시자입니다. window.__DATA 의 실제 컬럼명을 헤더로 쓰세요.");
    }
    // 차트가 window.__DATA 대신 지어낸 하드코딩 수열(Q1..Qn, 임의 정수)을 쓰는 신호
    if (/window\.__DATA/.test(content) && /labels\s*:\s*\[\s*['"]Q1['"]/i.test(content)) {
      issues.push("차트가 실데이터 대신 하드코딩된 가짜 수열(['Q1','Q2'…])을 씁니다. window.__DATA 를 집계(group-by/합계 등)해 labels·data 를 만드세요.");
    }
    // 존재하지 않는 데이터 전역/헬퍼를 지어냄 → 그 섹션이 빈값으로 렌더
    if (/window\.__DATA_MAP__|window\.__DATA_[A-Z]|\bloadSheet\s*\(/.test(content) &&
        !/window\.__SHEETS\s*=\s*\{\{BCAVE_SHEETS/.test(content)) {
      issues.push("주입하지 않은 데이터 전역/헬퍼(window.__DATA_MAP__, loadSheet() 등)를 참조합니다 → 그 섹션이 빈값이 됩니다. 필요한 시트를 {{BCAVE_DATA:경로#시트명}} 로 각각 주입하거나 window.__SHEETS = {{BCAVE_SHEETS:경로}} 로 넣고 window.__SHEETS['시트명'] 로 읽으세요.");
    }
    // 다중 시트 맵을 배열로 잘못 주입: window.__SHEETS 등에 배열을 넣고 sheets['시트명'] 로 접근 → 전부 빈값
    const sheetsAsArray = /(?:window\.)?__?SHEETS\w*\s*=\s*\[\s*\{/.test(content) ||
      (/=\s*\[\s*\{/.test(content) && /\bsheets\b\s*\[\s*['"`]/.test(content) && !/__SHEETS\s*=\s*\{[^[]/.test(content));
    if (sheetsAsArray) {
      issues.push("다중 시트 데이터를 '배열'로 주입해놓고 sheets['시트명'] 처럼 '맵'으로 접근합니다 → 모든 시트 조회가 빈값이 되어 데이터가 안 보입니다. 여러 시트를 쓰면 window.__SHEETS = {{BCAVE_SHEETS:경로}} (시트명→행배열 맵) 로 주입하고 window.__SHEETS['시트명'] 로 읽으세요. 한 시트만 쓰면 그 배열을 직접 순회하세요(맵 접근 금지).");
    }
    // 정리된 데이터에 .slice(N) 으로 앞행을 '헤더인 줄 알고' 버리는 오류
    if (/(?:window\.__\w+|sheets\.\w+|__SHEETS\[[^\]]+\])\s*(?:\|\|\s*\[\s*\])?\s*\)?\s*\.slice\(\s*[1-9]/.test(content)) {
      issues.push("주입된 데이터에 .slice(1+) 로 앞 행을 건너뜁니다. 데이터는 이미 정리된 행 객체 배열(제목행 자동 제거)이라 .slice 로 앞행을 버리면 실제 데이터가 사라집니다.");
    }
    // 고정 높이 차트 박스 + 2단 grid + align-items:start → 좌(차트)·우(카드) 아래끝 어긋남
    const twoColGrid = /grid-template-columns\s*:\s*[^;{}]*(?:fr|minmax)[^;{}]*(?:fr|minmax)/i.test(content);
    const topAligned = /align-items\s*:\s*(?:start|flex-start)/i.test(content);
    const fixedChartBox = /position\s*:\s*relative[^{}]*height\s*:\s*\d{2,3}px|height\s*:\s*\d{2,3}px[^{}]*position\s*:\s*relative/i.test(content);
    if (/<canvas/i.test(content) && twoColGrid && topAligned && fixedChartBox) {
      issues.push("레이아웃: 고정 높이 차트 박스가 옆 카드/리스트와 같은 grid 행에 있는데 align-items:start 라 두 열의 아래끝이 어긋나고 빈 공간이 생깁니다. grid 에 align-items:stretch 를 주고, 차트 래퍼는 height:100%;min-height:280px(canvas 가 채움, maintainAspectRatio:false), 옆 열도 height:100% 로 높이를 맞추세요(맞추기 어려우면 세로로 쌓으세요).");
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

  // 정의되지 않은 CSS 변수 참조 검사. var(--x, fallback) 형태는 폴백이 있어 제외한다.
  if (/:root\s*\{/.test(content) && /var\(--/.test(content)) {
    const defined = new Set([...content.matchAll(/(--[\w-]+)\s*:/g)].map((m) => m[1]));
    const undef = new Set<string>();
    for (const m of content.matchAll(/var\(\s*(--[\w-]+)\s*\)/g)) if (!defined.has(m[1])) undef.add(m[1]);
    if (undef.size) {
      issues.push(`정의되지 않은 CSS 변수 ${undef.size}개를 씁니다(${[...undef].slice(0, 6).join(", ")}). 변수가 무효가 되어 스타일이 적용되지 않으므로 변수를 정의하거나 폴백 값을 추가하세요.`);
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
        // 엑셀·csv 등 표 데이터는 컬럼·주입법 안내가 붙은 미리보기로 읽는다.
        if (TABULAR_EXT.has(ext)) {
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
        let source = String(args.content ?? "");
        const requestedDesign = typeof args.design_system === "string" ? args.design_system.toLowerCase() : "";
        const design = requestedDesign || loadConfig().designSystem;
        if (requestedDesign && !hasDesignSystem(requestedDesign)) {
          return `File not written. 알 수 없는 디자인 시스템: ${requestedDesign}`;
        }
        // 디자인시스템 HTML 파이프라인: design_system 필드가 명시된 경우에만 적용한다.
        // 앱 빌드의 index.html(Vite 엔트리), 일반 HTML 템플릿 등은 content 필드로 처리한다.
        if (requestedDesign && /\.html?$/i.test(filePath) && hasDesignSystem(design)) {
          try {
            const body = typeof args.body === "string" ? args.body : null;
            const app = typeof args.app_script === "string" ? args.app_script : null;
            source = body != null || app != null
              ? assembleDesignArtifactParts(design, body ?? "", app ?? "", filePath)
              : assembleDesignArtifact(design, source, filePath);
          } catch (err) {
            return `File not written. ${(err as Error).message}`;
          }
        } else if (typeof args.content !== "string") {
          return "File not written. 일반 파일은 write_file의 content 필드가 필요합니다.";
        }
        // 데이터·Chart.js 자리표시자 → 실제 리소스로 치환 (프롬프트 토큰 절약)
        const content = resolvePlaceholders(source, cwd);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, content, "utf-8");
        if (requestedDesign && /\.html?$/i.test(filePath) && hasDesignSystem(design)) {
          const lint = lintDesignArtifact(design, filePath);
          if (!lint.pass) {
            const attempts = (designLintAttempts.get(filePath) ?? 0) + 1;
            designLintAttempts.set(filePath, attempts);
            const strategy = attempts >= 2
              ? "같은 수정이 반복 실패했습니다. 위반 클래스/구조를 부분 수정하지 말고, 제공된 UI 클래스만 사용하도록 해당 body 구간을 다시 작성하세요."
              : "다음 violations를 수정하세요.";
            return `File written but NOT complete: ${args.path}\n⚠ ${design} 디자인 린트 FAIL (수정 시도 ${attempts}). ${strategy} 검토 통과 전에는 완료 응답을 하지 말고 write_file의 body/app_script 필드로 같은 파일에 다시 저장하세요:\n${JSON.stringify(lint.violations, null, 2)}`;
          }
          designLintAttempts.delete(filePath);
        }
        // 내보내기 전 자동 검토 — 단독 HTML 산출물(대시보드·리포트·디자인시스템 아티팩트)만 대상.
        // Vite/React의 index.html, 프레임워크 템플릿 등 앱 빌드 HTML은 검토하지 않는다.
        const isStandaloneArtifact = /\{\{BCAVE_(DATA|SHEETS|CHARTJS)|window\.__DATA|window\.__SHEETS/.test(content)
          || (requestedDesign && /\.html?$/i.test(filePath));
        if (isStandaloneArtifact) {
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
        return `File written: ${args.path}`;
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
        // 산출물(HTML/대시보드)을 shell(cat/echo/python/node 등)로 직접 써서 데이터·검토
        // 파이프라인을 우회하는 것을 차단 — 반드시 write_file 로 저장해야 데이터 주입과 자동 검토가 적용된다.
        const cmd = String(args.command ?? "");
        const writesHtml =
          /(^|[^\w])(>>?|tee)\s*[^\s|&;]*\.html\b/i.test(cmd) || // 리다이렉션/tee 로 .html 생성
          (/(write_text|writeFileSync|writeFile|fs\.write|open\s*\([^)]*['"][wa])/i.test(cmd) && /\.html\b/i.test(cmd)) || // 프로그램적으로 .html 쓰기
          /<!doctype html|<html[\s>]/i.test(cmd); // 명령 안에 HTML 본문이 통째로 들어있음
        if (writesHtml) {
          return "[차단됨] HTML/대시보드 파일을 shell(cat/echo/python/node 스크립트 등)로 직접 만들지 마세요. 반드시 write_file 도구로 저장해야 데이터 주입({{BCAVE_DATA:경로}})과 자동 검토가 적용됩니다.";
        }
        // 개발/프리뷰 서버 명령 감지 — 블로킹 실행 대신 백그라운드로 띄우고 포트 응답을 확인한다.
        const isDevServer = isDevServerCommand(cmd);

        if (isDevServer) {
          // pipe를 성공 직후 destroy하면 concurrently/Vite가 EPIPE로 종료될 수 있다.
          // 독립 로그 파일을 자식 stdio로 넘겨 CLI 턴이 끝난 뒤에도 서버가 유지되게 한다.
          const logPath = path.join(os.tmpdir(), `bcave-server-${Date.now()}-${process.pid}.log`);
          const logFd = fs.openSync(logPath, "a");
          const child = spawn(cmd, { cwd, shell: true, detached: true, stdio: ["ignore", logFd, logFd],
            env: { ...process.env, NODE_ENV: "development", BROWSER: "none", FORCE_COLOR: "0" } });
          fs.closeSync(logFd);
          let exited: number | null = null;
          child.on("exit", (c) => { exited = c ?? 0; });

          const readLogs = () => { try { return fs.readFileSync(logPath, "utf8"); } catch { return ""; } };
          const pingHost = (host: string, port: number, t = 1200) => new Promise<boolean>(res => {
            const req = http.get({ host, port, path: "/", timeout: t }, r => { r.destroy(); res(true); });
            req.on("error", () => res(false)); req.on("timeout", () => { req.destroy(); res(false); });
          });
          // Vite는 환경에 따라 ::1(localhost)에만 바인딩될 수 있어 127.0.0.1만 검사하면 오탐한다.
          const ping = async (port: number) => await pingHost("localhost", port) || await pingHost("127.0.0.1", port);
          const deadline = Date.now() + 30_000;
          let livePorts: number[] = [];
          let firstResponseAt = 0;
          while (Date.now() < deadline) {
            if (exited !== null && exited !== 0) break;
            const ports = extractServerPorts(`${cmd}\n${readLogs()}`);
            const states = await Promise.all(ports.map(async (port) => ({ port, live: await ping(port) })));
            livePorts = states.filter(({ live }) => live).map(({ port }) => port);
            // concurrently 같은 다중 서버 명령에서 첫 서버만 보고 너무 일찍 성공하지 않는다.
            if (livePorts.length && !firstResponseAt) firstResponseAt = Date.now();
            if (firstResponseAt && Date.now() - firstResponseAt >= 1500) break;
            await new Promise(r => setTimeout(r, 600));
          }
          const logText = readLogs();
          const tail = logText.slice(-2500).trim();
          if (livePorts.length && exited === null) {
            // Vite가 포트 충돌로 5174 등에 올라가면 로그의 Local URL을 대표 URL로 삼는다.
            const localPort = +(logText.match(/Local:\s+https?:\/\/(?:localhost|127\.0\.0\.1):(\d{2,5})/i)?.[1] || 0);
            const primaryPort = livePorts.includes(localPort) ? localPort : livePorts[0];
            const urls = [primaryPort, ...livePorts.filter(p => p !== primaryPort)].map(p => `http://localhost:${p}`);
            child.unref();
            await resolvePlaceholdersInDir(cwd);
            return `[SERVER_STARTED] ${urls[0]}\n응답 확인 URL: ${urls.join(", ")}\nPID: ${child.pid ?? "unknown"}\n로그: ${logPath}\n종료하려면: kill -${child.pid ?? "<PID>"}`;
          }
          // 기동 실패 시에는 정리
          try { if (child.pid) process.kill(-child.pid, "SIGTERM"); } catch { /* noop */ }
          try { if (child.pid) process.kill(child.pid, "SIGTERM"); } catch { /* noop */ }
          try { fs.unlinkSync(logPath); } catch { /* noop */ }
          return `[SERVER_START_FAILED] 서버 응답 없음 (30초 초과).\n로그:\n${tail || "(없음)"}\n\n위 로그를 보고 오류를 수정하세요. 실제 HTTP 응답을 확인하기 전에는 실행됐다고 말하지 마세요.`;
        }

        const output = await new Promise<string>((resolve) => {
          const child = exec(cmd, {
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
