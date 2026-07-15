// /kickstart 로 정리한 기획 정보를 실제 결과물 생성 프롬프트로 변환.
// (프롬프트 문자열만 만드는 순수 로직 — 실제 LLM 호출은 CLI 쪽에서.)

import { DESIGN_COMMON, DESIGN_PROFILES } from "./design-systems.js";
import { DS_CONTRACT, DS_SHAPE, DS_FULL } from "./ds-styles.js";
import { BCAVE_BRAND } from "./brand.js";

// 완전 동일(verbatim) 접근 지침: 디자인시스템 원본 nav·CSS·토글 JS 를 그대로 주입해 픽셀 동일하게.
function dsUsageVerbatim(id: string): string {
  return (
    "[이 디자인시스템을 100% 그대로 따라라 — 절대 규칙]\n" +
    "★ 자체 레이아웃/CSS 를 새로 만들지 마라. **사이드바(aside)·자기만의 nav·자기만의 .container/.section/.card 정의 금지.** 아래 자리표시자와 원본 클래스만 써라. 어기면 실패다.\n" +
    "★ 이 파일의 뼈대는 정확히 이 순서로:\n" +
    "<!doctype html><html lang=\"ko\"><head>\n" +
    " <meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>…</title>\n" +
    " <script>{{BCAVE_CHARTJS}}</script>\n" +
    ` <style>{{BCAVE_DS:${id}}}</style>   ← 원본 전체 CSS(토큰·다크모드·호버·반응형·컴포넌트) 자동 주입. 여기 외에 스타일을 새로 정의하지 마라(정 필요하면 아주 소량만).\n` +
    "</head><body>\n" +
    ` {{BCAVE_DS_NAV:${id}}}   ← 원본 상단 GNB + 다크모드 토글이 그대로 주입(브랜드=로고, 링크=개요/분포/목록). nav 를 직접 만들지 마라.\n` +
    " <div class=\"container\">\n" +
    "   <section id=\"overview\" class=\"section\"><p class=\"section-eyebrow\">라벨</p><h2 class=\"section-title\">고객 현황</h2><p class=\"section-desc\">설명</p>\n" +
    "     <div class=\"grid grid-4\"><div class=\"card\">…KPI…</div>…</div></section>\n" +
    "   <section id=\"charts\" class=\"section\"><p class=\"section-eyebrow\">Analytics</p><h2 class=\"section-title\">분포</h2>\n" +
    "     <div class=\"grid grid-2\"><div class=\"card\"><div style=\"position:relative;height:300px\"><canvas></canvas></div></div>…</div></section>\n" +
    "   <section id=\"table\" class=\"section\"><h2 class=\"section-title\">목록</h2><div class=\"card\">…표…</div></section>\n" +
    " </div>\n" +
    " <script>window.__DATA = {{BCAVE_DATA:데이터파일경로}};</script>   ← 전체 데이터 자동 주입(npm·스크립트 금지)\n" +
    " <script> …window.__DATA 를 집계해 KPI·차트·표 렌더… </script>\n" +
    ` {{BCAVE_DS_JS:${id}}}   ← 다크모드 토글 등 인터랙션\n` +
    "</body></html>\n" +
    "★ 컴포넌트는 원본 클래스만: 카드 .card, 배치 .grid.grid-2/.grid-3/.grid-4, 버튼 .btn.btn-primary/.btn-secondary, 배지 .badge 등. 하드코딩 hex·인라인 색·자체 그리드 금지.\n" +
    "★ 로고는 nav 에 이미 있으니 본문에 또 넣지 마라. 차트: 시간추이=line, 비교=bar, options responsive:true,maintainAspectRatio:false."
  );
}

// 프로필별 레이아웃 마크업 (GNB=상단내비 / side=좌측 사이드바). 원본 디자인시스템 구조에 맞춤.
const LAYOUT_GNB =
  "<div class=\"ds-app\">\n  <nav class=\"ds-nav\"><span class=\"ds-brand\"><img src=\"{{BCAVE_CI}}\" alt=\"B.CAVE\"></span>\n    <span class=\"ds-links\"><a href=\"#overview\" class=\"active\">개요</a><a href=\"#charts\">분포</a><a href=\"#table\">목록</a></span></nav>\n  <div class=\"ds-container\">\n    <p class=\"ds-eyebrow\">패션 CRM</p><h1 class=\"ds-title\">고객 현황</h1><p class=\"ds-sub\">한 줄 설명</p>\n    <section id=\"overview\" class=\"ds-section\"><div class=\"ds-kpis\">…KPI 카드(.card)…</div></section>\n    <section id=\"charts\" class=\"ds-section\"><p class=\"ds-eyebrow\">Analytics</p><h2 class=\"ds-sectitle\">분포 분석</h2>\n      <div class=\"ds-grid\"><div class=\"card\"><h3>제목</h3><div class=\"ds-chart\"><canvas></canvas></div></div>…</div></section>\n    <section id=\"table\" class=\"ds-section\"><h2 class=\"ds-sectitle\">목록</h2><div class=\"card\"><div class=\"ds-tablewrap\"><table>…</table></div></div></section>\n  </div>\n</div>";
const LAYOUT_SIDE =
  "<div class=\"ds-app\">\n  <aside class=\"ds-side\"><span class=\"ds-brand\"><img src=\"{{BCAVE_CI}}\" alt=\"B.CAVE\"></span>\n    <nav class=\"ds-links\"><a href=\"#overview\" class=\"active\">개요</a><a href=\"#charts\">분포</a><a href=\"#table\">목록</a></nav></aside>\n  <main class=\"ds-main\"><div class=\"ds-container\">\n    <p class=\"ds-eyebrow\">패션 CRM</p><h1 class=\"ds-title\">고객 현황</h1><p class=\"ds-sub\">한 줄 설명</p>\n    <section id=\"overview\" class=\"ds-section\"><div class=\"ds-kpis\">…KPI 카드(.card)…</div></section>\n    <section id=\"charts\" class=\"ds-section\"><h2 class=\"ds-sectitle\">분포 분석</h2>\n      <div class=\"ds-grid\"><div class=\"card\"><h3>제목</h3><div class=\"ds-chart\"><canvas></canvas></div></div>…</div></section>\n    <section id=\"table\" class=\"ds-section\"><h2 class=\"ds-sectitle\">목록</h2><div class=\"card\"><div class=\"ds-tablewrap\"><table>…</table></div></div></section>\n  </div></main>\n</div>";

// 디자인시스템 CSS 를 자리표시자로 주입시키는 사용 지침 (실제 CSS 는 write_file 가 치환 — 프롬프트 토큰 절약).
function dsUsage(id: string): string {
  // DS_FULL 프로필(원본 전체 CSS 보유)은 완전 동일 접근.
  if (DS_FULL[id]) return dsUsageVerbatim(id);
  const shape = DS_SHAPE[id] === "side" ? "side" : "gnb";
  const shapeDesc =
    shape === "side"
      ? "이 디자인시스템은 **좌측 사이드바** 레이아웃이다. 아래 구조를 그대로 써라(상단 GNB 로 바꾸지 마라):"
      : "이 디자인시스템은 **상단 GNB(내비바)** 레이아웃이다. 아래 구조를 그대로 써라(사이드바로 바꾸지 마라):";
  const markup = shape === "side" ? LAYOUT_SIDE : LAYOUT_GNB;
  return (
    "[디자인시스템 CSS 적용 — 반드시]\n" +
    `결과 HTML <head> 의 <style> 맨 앞에 정확히 \`{{BCAVE_DS:${id}}}\` 한 줄만 넣어라. ` +
    "그 자리에 이 디자인시스템의 토큰·컴포넌트·레이아웃 CSS 가 자동 주입된다(직접 토큰·레이아웃을 재정의하지 말 것). 이어서 이 화면 전용 CSS(카드 내부 등)만 덧붙여라.\n" +
    shapeDesc +
    "\n" +
    markup +
    "\n" +
    "링크는 <a href=\"#섹션id\">(클릭 시 스크롤). 큰 제목·넉넉한 여백·eyebrow 라벨로 디자인시스템 느낌을 살려라. " +
    "**.ds-app/.ds-nav/.ds-side/.ds-links/.ds-main/.ds-container/.ds-section/.ds-kpis/.ds-grid/.ds-chart 의 CSS(display·grid·width·position 등)를 다시 정의하거나 미디어쿼리로 건드리지 마라 — 레이아웃(형태·컨테이너 폭)은 스캐폴드가 원본 디자인시스템에 맞춰 처리한다.** " +
    "그 외 색·간격·모서리·글꼴은 통일 토큰(var(--ds-bg)/--ds-surface/--ds-text/--ds-text-2/--ds-border/--ds-accent/--ds-radius/--ds-space/--ds-font)만 쓰고, 버튼·뱃지·입력·배너 등은 위 계약 클래스를 쓴다. 하드코딩 hex 금지. " +
    "차트: 시간 추이는 line/area, 항목 비교는 bar. 차트 컨테이너는 .ds-chart, options 에 responsive:true,maintainAspectRatio:false."
  );
}

// 유형별 "만드는 방법" 지시. 백엔드가 필요 없는 결과물은 프론트/파일 기반으로.
const INSTRUCTIONS: Record<string, string> = {
  dashboard:
    "백엔드·서버·DB 없이, 결과물은 **완전한 자체 완결 HTML 파일 '하나'**로 만들어(더블클릭하면 인터넷 없이도 바로 열림). CSS·데이터·JS·차트 라이브러리·로고를 **전부 그 파일 안에 인라인**해서 외부 링크에 의존하지 마. **최종적으로 .html 파일 하나만 남겨야 해.**\n" +
    "\n■ 참고 데이터 파일(엑셀/CSV)이 있을 때 — **npm·스크립트·파일 생성 금지**:\n" +
    "  · `npm install`·package.json·node_modules·별도 빌드 스크립트를 만들지 마라(폴더가 지저분해지고 단일 파일이 깨진다).\n" +
    "  · 데이터는 HTML 안에서 자리표시자로 넣어라: `<script>window.__DATA = {{BCAVE_DATA:<데이터파일 절대경로>}};</script>` — 그 자리에 **전체 행이 JSON 배열로 자동 주입**된다(각 행 = 원본 컬럼명을 키로 갖는 객체, 날짜는 변환됨). 특정 시트는 `{{BCAVE_DATA:경로#시트명}}`.\n" +
    "  · 그 다음 순수 브라우저 JS 로 `window.__DATA` 를 순회하며 KPI·차트 데이터를 **직접 집계**하고 표를 그려라(수치는 실제 계산값, 지어내기 금지). 데이터를 손으로 옮기거나 `rows:[]` 로 비워두지 마라.\n" +
    "  · 컬럼명·값이 궁금하면 read_file 로 앞부분만 확인(전체 임베드는 위 자리표시자가 처리).\n" +
    "■ 참고 파일이 없을 때: 현실적인 예시 데이터를 코드에 직접 넣고 화면에 '예시 데이터'로 표기.\n" +
    "\n■ 차트 (반드시 지킬 것 — 안 지키면 화면이 빈다):\n" +
    "  · Chart.js 는 CDN 대신 **인라인**해라. <head> 에 정확히 `<script>{{BCAVE_CHARTJS}}</script>` 한 줄을 넣으면 그 자리에 Chart.js 원본이 자동 주입된다(오프라인에서도 차트가 뜬다). 별도 <script src> CDN 을 쓰지 마.\n" +
    "  · 렌더링 코드는 try/catch 로 감싸고, 차트는 `if(window.Chart)` 확인 후 그려서 하나가 실패해도 표·다른 요소는 보이게. 인라인 스크립트에서 쓰는 헬퍼(esc 등)는 **반드시 같은 파일에 정의**.\n" +
    "  · 원형/도넛은 항목 5개 이하일 때만. 차트마다 제목·단위·툴팁.\n" +
    "  · HTML 이스케이프가 필요하면 **직접 함수를 만들지 말고 전역 `esc(값)`** 를 써라(자동 제공). 굳이 정의한다면 따옴표 키를 정확히: `const esc=v=>String(v==null?'':v).replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',\"'\":'&#39;'}[c]));` — `\"\"\"` 처럼 쓰면 문법 오류로 화면 전체가 깨진다.\n" +
    "\n- 구성: 상단 핵심 숫자(KPI 3~5개) → 사용자가 고른 차트 → 전체 데이터 표(검색/페이지네이션). 반응형. 로그인/서버 코드 금지.\n" +
    "- 완성되면 최종 HTML 경로와 여는 법만 안내(임시 파일이 안 남았는지 확인).",
  presentation:
    "실제로 열리는 .pptx 파일을 만들어. Node 의 pptxgenjs 라이브러리를 해당 폴더에 설치해 스크립트로 생성해 (여의치 않으면 Marp/reveal.js HTML).\n" +
    "- 표지 → 목차 → 본문(한 슬라이드 한 메시지) → 마무리 구성. 색상·글꼴·정렬 일관되게, 글자 과하지 않게.\n" +
    "- 완성되면 파일 위치와 여는 법을 안내.",
  service:
    "백엔드 없이 **동작하는 프론트 프로토타입**을 만들어 (단일/소수 HTML·CSS·JS, 필요시 React CDN).\n" +
    "- 선택한 핵심 기능을 화면과 상호작용으로 구현. 로그인·결제 등 서버가 필요한 부분은 목업(가짜 동작)으로 처리.\n" +
    "- 디자인을 깔끔하게. 완성되면 실행/확인 방법을 안내.",
  document:
    "요청한 형식(DOCX/PDF/Markdown/텍스트)의 실제 문서 파일을 만들어. 기본은 Markdown 으로 작성하고 필요하면 변환.\n" +
    "- 포함해야 할 내용과 말투·길이를 반영. 완성되면 파일 위치를 안내.",
  automation:
    "실행 가능한 스크립트로 만들어 (작업에 맞는 언어 선택, 의존성 최소).\n" +
    "- 입력 소스·트리거·결과 저장 위치를 반영. 사람이 검토해야 하면 확인 단계를 넣고, 실패 알림이 필요하면 포함.\n" +
    "- 민감 데이터는 외부로 전송하지 않게. 완성되면 실행 방법을 안내.",
  data_analysis:
    "데이터가 있으면 읽어서 분석하고, 없으면 현실적인 예시 데이터로 진행해. 백엔드 없이.\n" +
    "- 데이터 파일이 있으면 눈으로 표본만 옮기지 말고, 그 파일을 읽는 **임시** Node 스크립트로 **전체 행**을 집계해(엑셀이면 xlsx 설치, 날짜 직렬 숫자는 실제 날짜로 변환). 요약 수치는 반드시 실제 계산값. 다 만든 뒤 임시 스크립트는 삭제.\n" +
    "- 결과는 **완전한 자체 완결 단일 HTML 리포트**(요약 + 표 + 그래프)로, 외부 링크 없이 인터넷 없이도 열리게. Chart.js 는 CDN 대신 <head> 에 `<script>{{BCAVE_CHARTJS}}</script>` 로 인라인하고, 렌더 코드는 try/catch + `if(window.Chart)` 로 감싸.\n" +
    "- 개인정보/민감정보가 있으면 마스킹. 완성되면 결과 파일과 보는 법을 안내.",
  other:
    "기획 정보에 가장 잘 맞는, 가능한 한 단순하고 실용적인 결과물을 만들어. 서버가 꼭 필요하지 않으면 프론트/파일 기반으로.",
};

const LABELS: Record<string, string> = {
  dashboard: "데이터 대시보드",
  presentation: "프레젠테이션",
  service: "웹 서비스 또는 앱",
  document: "문서",
  automation: "자동화 도구",
  data_analysis: "데이터 분석",
  other: "결과물",
};

// 화면 디자인이 중요한 유형 — 디자인 가이드를 덧붙인다.
const VISUAL_TYPES = new Set(["dashboard", "service", "data_analysis", "presentation"]);

// 글꼴을 지정할 수 있는 유형 (화면 + 문서/발표).
const FONT_TYPES = new Set([...VISUAL_TYPES, "document"]);

// 글꼴 규칙: 선택한 프로필의 실제 글꼴 스택을 우선하고, Pretendard 를 한글 폴백으로 로드.
const PRETENDARD =
  "\n\n[글꼴]\n" +
  "웹(HTML) 결과물이면 <head> 에 Pretendard 를 CDN 으로 로드해: " +
  "`<link rel=\"stylesheet\" href=\"https://cdn.jsdelivr.net/gh/orioncactus/pretendard@latest/dist/web/static/pretendard.min.css\">`. " +
  "**글꼴은 위에서 선택한 디자인 프로필이 지정한 font-family 스택을 그대로 사용**해(예: Apple=-apple-system·SF Pro…, MS=Segoe UI…, 스택 끝에 Pretendard 폴백 포함). " +
  "프로필이 없으면 `font-family:'Pretendard',-apple-system,BlinkMacSystemFont,sans-serif;`. " +
  "PPT·문서 등 웹이 아니면 프로필 글꼴(없으면 Pretendard)로 지정.";


/** 정리된 기획(사람이 읽는 마크다운 brief) + 유형(+디자인 시스템, 참고 파일)으로 생성 프롬프트를 만든다. */
export function generationPrompt(
  projectType: string,
  brief: string,
  designSystem?: string,
  referenceFiles?: string,
): string {
  const label = LABELS[projectType] ?? "결과물";
  const isVisual = VISUAL_TYPES.has(projectType);
  const profile = designSystem ? DESIGN_PROFILES[designSystem] : undefined;
  const isFull = !!(isVisual && designSystem && DS_FULL[designSystem]);
  const hasDs = !!(isVisual && designSystem && DS_CONTRACT[designSystem]);
  // DS_FULL(완전 동일) 프로필은 verbatim 지침만 — 옛 스캐폴드/사이드바 지침과 충돌 방지.
  const instr = isFull
    ? (INSTRUCTIONS[projectType] ?? INSTRUCTIONS.other) + "\n\n" + dsUsageVerbatim(designSystem!)
    : (INSTRUCTIONS[projectType] ?? INSTRUCTIONS.other) +
      (isVisual ? "\n\n" + DESIGN_COMMON : "") +
      (isVisual && profile ? "\n\n" + profile : "") +
      (hasDs ? "\n\n" + DS_CONTRACT[designSystem!] + "\n\n" + dsUsage(designSystem!) : "") +
      (isVisual ? "\n\n" + BCAVE_BRAND : "") +
      (FONT_TYPES.has(projectType) ? PRETENDARD : "");
  const refBlock =
    referenceFiles && referenceFiles.trim()
      ? `\n\n[참고 파일]\n아래 경로의 파일을 참고해 만들어. 엑셀·CSV 데이터는 손으로 옮기거나 스크립트를 쓰지 말고 ` +
        `\`<script>window.__DATA = {{BCAVE_DATA:경로}};</script>\` 자리표시자로 전체를 주입한 뒤 브라우저 JS 로 집계해. 경로를 못 찾으면 지어내지 말고 알려줘:\n${referenceFiles}`
      : "";
  return (
    `아래는 사용자가 질문에 답해 정리한 "${label}" 기획 정보야. ` +
    `이 정보를 바탕으로 **지금 실제 결과물을 만들어줘.** 추가 질문은 꼭 필요할 때만 최소로 하고, 정해지지 않은 부분은 합리적인 기본값으로 채워.\n\n` +
    `[기획 정보]\n${brief}${refBlock}\n\n` +
    `[만드는 방법]\n${instr}\n\n` +
    `기술 용어는 쓰지 말고, 완성되면 사용자가 결과물을 어떻게 보는지 쉽게 안내해줘.`
  );
}
