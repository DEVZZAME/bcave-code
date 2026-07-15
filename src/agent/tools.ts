import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { glob } from "glob";
import XLSX from "xlsx";
import { BCAVE_CI, BCAVE_LOGO_DATA_URI } from "../kickstart/brand.js";
import { DS_STYLES, DS_LAYOUT, DS_FULL, DS_NAV, DS_JS } from "../kickstart/ds-styles.js";
import { CHARTJS_SOURCE } from "../assets/chartjs.js";
import type { PermissionCategory } from "./permissions.js";

// Chart.js 로드 직후 적용할 전역 기본값: 항목이 적어도 막대가 카드 폭에 꽉 늘어나지 않게 두께 상한.
const CHARTJS_DEFAULTS =
  ";try{if(window.Chart){var _d=Chart.defaults;if(_d.datasets&&_d.datasets.bar){_d.datasets.bar.maxBarThickness=52;_d.datasets.bar.categoryPercentage=0.72;_d.datasets.bar.barPercentage=0.9;}_d.font.family=\"Pretendard,-apple-system,BlinkMacSystemFont,sans-serif\";}}catch(e){}" +
  // 안전한 전역 esc (모델이 직접 만든 esc 의 따옴표 키 버그 방지용 폴백)
  ";try{if(!window.esc){window.esc=function(v){return String(v==null?'':v).replace(/[&<>\"']/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c];});};}}catch(e){}";
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
    const wb = XLSX.read(fs.readFileSync(filePath), { type: "buffer", cellDates: true });
    const name = sheet && wb.Sheets[sheet] ? sheet : wb.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: null, raw: false });
    return JSON.stringify(rows.slice(0, 100_000));
  } catch {
    return "[]";
  }
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

/** CI 로고·디자인시스템 CSS/nav/JS·데이터·Chart.js 자리표시자를 실제 리소스로 치환. */
function resolvePlaceholders(content: string, cwd: string): string {
  // {{BCAVE_DATA:파일경로[#시트]}} → 전체 데이터 JSON (npm·스크립트 불필요, 토큰 0)
  content = content.replace(/\{\{BCAVE_DATA:([^}]+)\}\}/g, (_m, spec) => {
    const [rawPath, sheet] = String(spec).split("#");
    return spreadsheetToJSON(path.resolve(cwd, rawPath.trim()), sheet?.trim());
  });
  // {{BCAVE_DS:id}} → 디자인시스템 CSS. DS_FULL(원본 전체)이 있으면 완전 동일, 없으면 DS_STYLES.
  let dsId = "";
  let full = false;
  content = content.replace(/\{\{BCAVE_DS:([\w-]+)\}\}/g, (_m, id) => {
    // DS_FULL 은 자리표시자 위치에 넣지 않고 </head> 직전에 주입(모델 오버라이드보다 뒤라 이긴다).
    if (DS_FULL[id]) { dsId = id; full = true; return ""; }
    if (DS_STYLES[id]) { dsId = id; return DS_STYLES[id]; }
    return "";
  });
  // 레이아웃이 항상 이기도록 </head> 직전에 주입:
  //  - DS_FULL: 원본 전체 CSS(컨테이너 폭·nav·섹션 등 원본 그대로 유지)
  //  - 그 외: 스캐폴드
  const winCss = full ? DS_FULL[dsId] : dsId ? DS_LAYOUT[dsId] : "";
  if (winCss) {
    // 한글은 기본적으로 글자 단위로 줄바꿈되어 옆 공간이 있어도 한 글자가 아래로 떨어진다.
    // word-break:keep-all 로 단어 단위 줄바꿈(자연스러운 한국어 줄바꿈).
    const style = `<style>${winCss}\n:where(body){word-break:keep-all;overflow-wrap:break-word}</style>`;
    content = content.includes("</head>")
      ? content.replace("</head>", style + "</head>")
      : style + content;
  }
  // 원본 nav 마크업 · 토글/인터랙션 JS (완전 동일 접근)
  content = content.replace(/\{\{BCAVE_DS_NAV:([\w-]+)\}\}/g, (_m, id) => DS_NAV[id] ?? "");
  content = content.replace(/\{\{BCAVE_DS_JS:([\w-]+)\}\}/g, (_m, id) =>
    DS_JS[id] ? `<script>${DS_JS[id]}</script>` : "",
  );
  // Chart.js 자리표시자·CDN <script> → 인라인 소스(+기본값). 완전한 단일 파일·오프라인 가능.
  if (content.includes("{{BCAVE_CHARTJS}}")) {
    content = content.split("{{BCAVE_CHARTJS}}").join(CHARTJS_SOURCE + CHARTJS_DEFAULTS);
  }
  content = content.replace(
    /<script\b[^>]*\bsrc="[^"]*chart[^"]*"[^>]*>\s*<\/script>/gi,
    CHARTJS_INLINE,
  );
  // CI 로고는 마지막에 치환 → 모델 마크업 + 주입된 nav 안의 {{BCAVE_CI}} 모두 처리
  if (content.includes(BCAVE_CI)) content = content.split(BCAVE_CI).join(BCAVE_LOGO_DATA_URI);
  return content;
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
        // 엑셀 등 스프레드시트는 표(CSV)로 변환해서 읽는다.
        if (SPREADSHEET_EXT.has(path.extname(filePath).toLowerCase())) {
          return readSpreadsheet(filePath, args.path as string);
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
        return truncate(content, MAX_READ_CHARS, partial ? "파일이 큼(앞부분만)" : "파일이 큼");
      }
      case "write_file": {
        const filePath = path.resolve(cwd, args.path as string);
        // CI·디자인시스템·Chart.js 자리표시자 → 실제 리소스로 치환 (프롬프트 토큰 절약)
        const content = resolvePlaceholders(args.content as string, cwd);
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, content, "utf-8");
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
