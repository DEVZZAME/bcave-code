// /kickstart 로 정리한 기획 정보를 실제 결과물 생성 프롬프트로 변환.
// (프롬프트 문자열만 만드는 순수 로직 — 실제 LLM 호출은 CLI 쪽에서.)

import { FRONTEND_DESIGN } from "../agent/frontend-design.js";

// 유형별 "만드는 방법" 지시. 백엔드가 필요 없는 결과물은 프론트/파일 기반으로.
const INSTRUCTIONS: Record<string, string> = {
  dashboard:
    "백엔드·서버·DB 없이 **단일 HTML 파일 하나**로 만들어. 더블클릭하면 브라우저에서 바로 열려야 해.\n" +
    "- 그래프는 Chart.js 를 CDN(<script src>)으로 불러와 사용 (설치 불필요).\n" +
    "- 디자인이 깔끔하고 한눈에 보기 편하게: 상단에 핵심 숫자 카드, 그 아래에 사용자가 고른 차트 종류(막대/선/도넛 등)와 표로 데이터를 표현.\n" +
    "- 실제 데이터가 없으면 선택한 데이터 종류에 맞는 현실적인 예시 데이터를 넣어. 필터 항목이 있으면 간단한 셀렉트/버튼으로 구현.\n" +
    "- 반응형(모바일에서도 보기 좋게), 색상·여백·정렬을 신경 써서 세련되게.\n" +
    "- 로그인/회원가입/서버 코드는 절대 만들지 마. 완성되면 파일 경로와 여는 법을 알려줘.",
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
    "- 결과를 보기 편한 형태로: 요약 + 표 + 그래프(Chart.js 를 쓴 단일 HTML 리포트 권장).\n" +
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

// 유명 디자인 시스템별 특징 (선택 시 생성 프롬프트에 주입).
const DESIGN_SYSTEMS: Record<string, string> = {
  apple:
    "애플 Human Interface 스타일로: 넉넉한 여백, 부드럽게 둥근 모서리, 무채색 배경 + 포인트 1색, 은은한 그림자·반투명(블러), 큼직하고 명료한 타이포. 미니멀하고 고급스럽게.",
  material:
    "구글 Material Design 스타일로: 선명한 브랜드 색과 엘리베이션(그림자) 위계, 명확한 컴포넌트(카드·칩·버튼), 8dp 그리드, 뚜렷한 상태 색. 직관적이고 활기차게.",
  fluent:
    "마이크로소프트 Fluent 스타일로: 차분한 색과 반투명(아크릴) 표면, 정돈된 밀도와 기업용 신뢰감. 절제되고 명료하게.",
  minimal:
    "모던 미니멀(Linear/Vercel 풍)로: 다크 또는 뉴트럴 배경, 얇은 경계선, 절제된 색 1~2, 정밀한 여백·타이포, 은은한 인터랙션. 세련되고 군더더기 없이.",
  toss:
    "토스 스타일로: 아주 깔끔한 흰 배경, 큼직한 숫자와 굵은 강조, 친근하고 둥근 요소, 파랑 포인트, 넉넉한 여백. 쉽고 신뢰감 있게.",
  auto: "",
};

/** 정리된 기획(사람이 읽는 마크다운 brief) + 유형(+디자인 시스템, 참고 파일)으로 생성 프롬프트를 만든다. */
export function generationPrompt(
  projectType: string,
  brief: string,
  designSystem?: string,
  referenceFiles?: string,
): string {
  const label = LABELS[projectType] ?? "결과물";
  const sys = designSystem && DESIGN_SYSTEMS[designSystem];
  const instr =
    (INSTRUCTIONS[projectType] ?? INSTRUCTIONS.other) +
    (VISUAL_TYPES.has(projectType) ? "\n\n" + FRONTEND_DESIGN : "") +
    (sys ? "\n\n[디자인 시스템]\n" + sys : "") +
    (FONT_TYPES.has(projectType) ? PRETENDARD : "");
  const refBlock =
    referenceFiles && referenceFiles.trim()
      ? `\n\n[참고 파일]\n아래 경로의 파일을 read_file 도구로 **먼저 읽어** 내용·형식·데이터를 파악한 뒤 그것을 반영해 만들어. ` +
        `경로를 찾을 수 없으면 임의로 지어내지 말고 사용자에게 알려줘:\n${referenceFiles}`
      : "";
  return (
    `아래는 사용자가 질문에 답해 정리한 "${label}" 기획 정보야. ` +
    `이 정보를 바탕으로 **지금 실제 결과물을 만들어줘.** 추가 질문은 꼭 필요할 때만 최소로 하고, 정해지지 않은 부분은 합리적인 기본값으로 채워.\n\n` +
    `[기획 정보]\n${brief}${refBlock}\n\n` +
    `[만드는 방법]\n${instr}\n\n` +
    `기술 용어는 쓰지 말고, 완성되면 사용자가 결과물을 어떻게 보는지 쉽게 안내해줘.`
  );
}
