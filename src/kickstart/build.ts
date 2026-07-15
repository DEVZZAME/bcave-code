// /kickstart 로 정리한 기획 정보를 실제 결과물 생성 프롬프트로 변환.
// (프롬프트 문자열만 만드는 순수 로직 — 실제 LLM 호출은 CLI 쪽에서.)

import { FRONTEND_DESIGN } from "../agent/frontend-design.js";

// 유형별 "만드는 방법" 지시. 백엔드가 필요 없는 결과물은 프론트/파일 기반으로.
const INSTRUCTIONS: Record<string, string> = {
  dashboard:
    "백엔드·서버·DB 없이 결과물은 **단일 HTML 파일 하나**로 만들어(더블클릭하면 브라우저에서 바로 열림). 그래프는 Chart.js 를 CDN 으로 불러와 사용.\n" +
    "\n■ 참고 데이터 파일이 있을 때 (아주 중요 — 데이터 누락 금지):\n" +
    "  데이터를 눈으로 몇 줄만 옮겨 적지 마. 반드시 누락·왜곡이 생긴다. 대신 이렇게 해:\n" +
    "  1) 그 파일을 읽어 처리하는 Node 스크립트(build.js)를 작성해. 엑셀이면 그 폴더에 `npm install xlsx` 로 라이브러리를 설치해 사용(온라인이 안 되면, CSV 로 저장된 파일을 읽거나 read_file 로 얻은 표 전체를 데이터 파일로 저장해 사용).\n" +
    "  2) 스크립트로 **전체 행**을 훑어 KPI(합계·평균·건수 등)와 차트용 집계를 실제로 계산하고, 표에 쓸 전체 데이터를 JSON 으로 만들어. (수치를 임의로 지어내지 말 것 — 전부 실제 계산값)\n" +
    "  3) 그 JSON 을 HTML 안에 자동으로 끼워 넣어 최종 파일을 생성(스크립트가 HTML 을 써내게)하고, 스크립트를 실행해.\n" +
    "  4) 표에는 **전체 데이터**를 담되 검색·페이지네이션으로 보여줘(7~10줄만 넣지 말 것). 완성 후 표시된 행 수·합계가 원본과 맞는지 확인해.\n" +
    "■ 참고 파일이 없을 때: 선택한 데이터 종류에 맞는 현실적인 예시 데이터를 넣고, 화면에 '예시 데이터'임을 표기해.\n" +
    "\n- 구성: 상단 핵심 숫자 카드 → 사용자가 고른 차트 종류(막대/선/도넛 등) → 표. 필터 항목이 있으면 셀렉트/버튼으로.\n" +
    "- 반응형(모바일에서도 보기 좋게). 로그인/회원가입/서버 코드는 절대 만들지 마. 완성되면 파일 경로와 여는 법을 알려줘.",
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
    "- 데이터 파일이 있으면 눈으로 표본만 옮기지 말고, 그 파일을 읽는 Node 스크립트로 **전체 행**을 집계해(엑셀이면 xlsx 설치). 요약 수치는 반드시 실제 계산값.\n" +
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

// 유명 디자인 시스템별 특징 — 작은 모델도 따라올 수 있게 구체적 값으로.
const DESIGN_SYSTEMS: Record<string, string> = {
  apple:
    "애플(Apple) 스타일 — 다음을 반드시 지켜:\n" +
    "· 배경: 순수 흰색(#ffffff) 또는 애플 라이트그레이(#f5f5f7)로 **납작하게**. 그라데이션·radial-gradient·전면 유리(글래스)블러 금지.\n" +
    "· 글자색: 기본 #1d1d1f, 보조 #6e6e73.\n" +
    "· 강조색: 애플 블루 #0071e3 **딱 하나만**, 링크·핵심 버튼 등 꼭 필요한 곳에만 아주 절제해서. 알록달록한 배지 남발 금지(상태는 회색조 위주).\n" +
    "· 카드: 흰 배경, radius 18px, 그림자는 아주 옅게(예: 0 1px 3px rgba(0,0,0,.06)). 두꺼운 그림자·테두리 금지.\n" +
    "· 여백: 아주 넉넉하게. 요소 사이 공백을 충분히.\n" +
    "· 타이포: 제목은 크고 굵게 letter-spacing:-0.02em, 핵심 숫자(KPI)는 아주 크게(48px 이상, weight 600~700).\n" +
    "· 전체 인상: 미니멀·고요·고급. 화려함보다 정돈과 여백.",
  material:
    "구글 Material Design 스타일 — 배경 #ffffff, 강조는 브랜드 1색(예: #1a73e8)과 엘리베이션(그림자)로 위계 표현, 카드 radius 12px + 부드러운 그림자, 8px 그리드, 상태색(성공 초록/경고 노랑/오류 빨강) 뚜렷이. 명확한 컴포넌트(카드·칩·버튼). 직관적이고 활기차게.",
  fluent:
    "마이크로소프트 Fluent 스타일 — 배경 #faf9f8, 차분한 색과 은은한 반투명(아크릴) 표면, 강조 #0f6cbd, 카드 radius 8px, 정돈된 밀도와 기업용 신뢰감. 절제되고 명료하게.",
  minimal:
    "모던 미니멀(Linear/Vercel 풍) — 뉴트럴 또는 다크(#0b0b0c) 배경, 얇은 1px 경계선(rgba 저채도), 강조색 1개만, 카드 radius 10px, 그림자 거의 없이 선으로 구분, 정밀한 여백·타이포. 세련되고 군더더기 없이.",
  toss:
    "토스 스타일 — 아주 깨끗한 흰 배경, 큼직한 숫자와 굵은 강조, 친근하게 둥근 요소(radius 16~20px), 강조는 토스 블루 #3182f6, 넉넉한 여백. 쉽고 신뢰감 있게.",
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
