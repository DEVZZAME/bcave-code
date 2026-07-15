// /kickstart 로 정리한 기획 정보를 실제 결과물 생성 프롬프트로 변환.
// (프롬프트 문자열만 만드는 순수 로직 — 실제 LLM 호출은 CLI 쪽에서.)

import { DESIGN_COMMON, DESIGN_PROFILES } from "./design-systems.js";

// 유형별 "만드는 방법" 지시. 백엔드가 필요 없는 결과물은 프론트/파일 기반으로.
const INSTRUCTIONS: Record<string, string> = {
  dashboard:
    "백엔드·서버·DB 없이, 결과물은 **자체 완결적인 HTML 파일 '하나'**로 만들어(더블클릭하면 바로 열림). CSS·데이터·JS 를 모두 그 파일 안에 인라인해. **최종적으로 .html 파일 하나만 남겨야 해.**\n" +
    "\n■ 참고 데이터 파일이 있을 때 (데이터 누락 금지):\n" +
    "  1) 데이터를 눈으로 옮기지 말고, 파일을 읽어 처리하는 **임시** Node 스크립트를 작성해(엑셀이면 폴더에 `npm install xlsx`). **엑셀 날짜가 45590 같은 직렬 숫자로 오면 실제 날짜로 변환**해서 집계해(안 하면 월별 추이가 1970-01 로 몰림). read 시 cellDates:true 를 쓰거나 직렬값→날짜로 변환.\n" +
    "  2) 스크립트로 **전체 행**을 집계해 KPI·차트 데이터를 실제로 계산하고, 표에 쓸 전체 데이터를 JSON 으로 만들어 HTML 안에 <script> 로 인라인해. 수치는 전부 실제 계산값(지어내기 금지).\n" +
    "  3) HTML 을 다 만든 뒤 **임시 스크립트·중간 파일은 삭제**해서 최종에 .html 하나만 남겨. 완성 후 표시 행 수·합계가 원본과 맞는지 확인.\n" +
    "■ 참고 파일이 없을 때: 현실적인 예시 데이터를 넣고 화면에 '예시 데이터'로 표기.\n" +
    "\n■ 차트 (반드시 지킬 것 — 안 지키면 화면이 빈다):\n" +
    "  · Chart.js 는 **UMD 빌드**로 로드: `<script src=\"https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js\"></script>`. (그냥 `.../npm/chart.js` 는 전역 Chart 를 만들지 않아 차트가 안 그려지고 뒤 코드까지 멈춘다.)\n" +
    "  · 렌더링 코드는 try/catch 로 감싸고, 차트는 `if(window.Chart)` 확인 후 그려서 하나가 실패해도 표·다른 요소는 보이게. 인라인 스크립트에서 쓰는 헬퍼(esc 등)는 **반드시 같은 파일에 정의**.\n" +
    "  · 원형/도넛은 항목 5개 이하일 때만. 차트마다 제목·단위·툴팁.\n" +
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
    "- 결과는 **자체 완결적인 단일 HTML 리포트**(요약 + 표 + 그래프)로. Chart.js 는 UMD 빌드(`https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js`)로 로드하고, 렌더 코드는 try/catch + `if(window.Chart)` 로 감싸.\n" +
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

// 글꼴을 지정할 수 있는 유형 (화면 + 문서/발표) — Pretendard 사용.
const FONT_TYPES = new Set([...VISUAL_TYPES, "document"]);

// 모든 결과물의 기본 글꼴은 Pretendard.
const PRETENDARD =
  "\n\n[글꼴]\n모든 글꼴은 **Pretendard**를 사용해. " +
  "웹(HTML) 결과물이면 <head> 에 " +
  "`<link rel=\"stylesheet\" href=\"https://cdn.jsdelivr.net/gh/orioncactus/pretendard@latest/dist/web/static/pretendard.min.css\">` 를 넣고 " +
  "`font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, sans-serif;` 로 지정해. " +
  "PPT·문서 등 웹이 아니면 글꼴을 Pretendard 로(설치돼 있지 않으면 유사한 산세리프로 대체) 지정해.";


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
  const instr =
    (INSTRUCTIONS[projectType] ?? INSTRUCTIONS.other) +
    (isVisual ? "\n\n" + DESIGN_COMMON : "") +
    (isVisual && profile ? "\n\n" + profile : "") +
    (FONT_TYPES.has(projectType) ? PRETENDARD : "");
  const refBlock =
    referenceFiles && referenceFiles.trim()
      ? `\n\n[참고 파일]\n아래 경로의 파일을 read_file 도구로 **먼저 읽어** 내용·형식·데이터를 파악한 뒤 그것을 반영해 만들어. ` +
        `엑셀·CSV 처럼 행이 많은 데이터 파일이면 몇 줄만 손으로 옮기지 말고(누락·왜곡 발생), 그 파일을 읽는 스크립트로 전체를 집계·반영해. 수치는 실제 계산값이어야 하고, 경로를 찾을 수 없으면 지어내지 말고 사용자에게 알려줘:\n${referenceFiles}`
      : "";
  return (
    `아래는 사용자가 질문에 답해 정리한 "${label}" 기획 정보야. ` +
    `이 정보를 바탕으로 **지금 실제 결과물을 만들어줘.** 추가 질문은 꼭 필요할 때만 최소로 하고, 정해지지 않은 부분은 합리적인 기본값으로 채워.\n\n` +
    `[기획 정보]\n${brief}${refBlock}\n\n` +
    `[만드는 방법]\n${instr}\n\n` +
    `기술 용어는 쓰지 말고, 완성되면 사용자가 결과물을 어떻게 보는지 쉽게 안내해줘.`
  );
}
