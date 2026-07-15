// /kickstart 정적 질문 데이터 (로직과 분리). 토큰/LLM 미사용.
// 질문 문구·순서는 코드 수정 없이 이 파일만 바꿔 조정할 수 있다.

import type { KickstartQuestion, ProjectSchema } from "./types.js";

/** "잘 모르겠어요"를 나타내는 옵션값 — 엔진이 unknown 으로 저장. */
export const UNKNOWN = "__unknown__";

const o = (label: string, value: string) => ({ label, value });
const U = o("잘 모르겠어요", UNKNOWN);

// ── 최상위 메뉴 ──
export const TOP_MENU: { label: string; value: string }[] = [
  o("데이터 대시보드", "dashboard"),
  o("프레젠테이션", "presentation"),
  o("웹 서비스 또는 앱", "service"),
  o("문서", "document"),
  o("자동화 도구", "automation"),
  o("데이터 분석", "data_analysis"),
  o("아직 잘 모르겠어요", "discovery"),
  o("기타", "other"),
];

// ── 1. 대시보드 ──
const dashboard: ProjectSchema = {
  type: "dashboard",
  label: "데이터 대시보드",
  intro: "데이터를 한눈에 확인할 수 있는 화면을 만들게요.\n어떤 정보를 보고 싶은지부터 정리해볼게요.",
  questions: [
    { id: "dashboardPurpose", type: "single_select", message: "어떤 데이터를 보고 싶으신가요?", options: [
      o("매출 또는 비용", "revenue"), o("고객 또는 회원", "customers"), o("마케팅 성과", "marketing"),
      o("업무 진행 현황", "work"), o("재고 또는 상품", "inventory"), o("서버 또는 시스템 상태", "system"),
      o("여러 데이터를 함께 보고 싶어요", "mixed"), o("직접 입력", "custom"), U ] },
    { id: "dataSource", type: "single_select", message: "데이터는 현재 어디에 있나요?", options: [
      o("엑셀 파일", "excel"), o("CSV 파일", "csv"), o("Google Sheets", "gsheets"), o("데이터베이스", "db"),
      o("API", "api"), o("여러 곳에 나뉘어 있어요", "multiple"), o("아직 데이터가 없어요", "none"), U ] },
    { id: "targetUsers", type: "single_select", message: "대시보드를 주로 누가 사용하나요?", options: [
      o("나 혼자", "self"), o("실무 담당자", "staff"), o("팀장 또는 관리자", "manager"),
      o("경영진", "exec"), o("고객", "customer"), o("여러 사람이 함께", "multiple"), U ] },
    { id: "keyMetrics", type: "text", optional: true, message: "가장 중요하게 확인해야 하는 수치는 무엇인가요?",
      description: "예: 오늘 매출, 전월 대비 증가율, 신규 회원 수, 미완료 업무 수, 광고 효율 (직접 입력하거나 건너뛸 수 있어요)" },
    { id: "refreshCycle", type: "single_select", message: "데이터를 얼마나 자주 업데이트해야 하나요?", options: [
      o("실시간", "realtime"), o("몇 분마다", "minutes"), o("매시간", "hourly"), o("하루 한 번", "daily"),
      o("사용자가 파일을 올릴 때만", "onupload"), o("아직 정하지 않았어요", "undecided") ] },
    { id: "visualizations", type: "multi_select", message: "어떤 형태로 보고 싶으신가요? (여러 개 선택 가능)", options: [
      o("핵심 숫자 카드", "cards"), o("막대그래프", "bar"), o("선그래프", "line"), o("원형그래프", "pie"),
      o("표", "table"), o("지도", "map"), o("순위", "ranking"), o("알림 또는 경고", "alerts"), U ] },
    { id: "filters", type: "multi_select", message: "사용자가 데이터를 검색하거나 조건별로 나눠볼 필요가 있나요? (여러 개 선택 가능)", options: [
      o("날짜별 조회", "byDate"), o("부서 또는 담당자별 조회", "byTeam"), o("상품 또는 서비스별 조회", "byProduct"),
      o("지역별 조회", "byRegion"), o("검색 기능", "search"), o("필요 없어요", "none"), U ] },
    { id: "platform", type: "single_select", message: "어디에서 사용할 예정인가요?", options: [
      o("웹 브라우저", "web"), o("사내 시스템", "internal"), o("모바일", "mobile"),
      o("큰 모니터 또는 전광판", "bigscreen"), o("아직 정하지 않았어요", "undecided") ] },
  ],
};

// ── 2. 프레젠테이션 ──
const presentation: ProjectSchema = {
  type: "presentation",
  label: "프레젠테이션",
  intro: "발표 목적과 청중을 기준으로 프레젠테이션의 구성을 정리할게요.",
  questions: [
    { id: "presentationPurpose", type: "single_select", message: "어떤 목적으로 발표하나요?", options: [
      o("업무 보고", "report"), o("프로젝트 제안", "proposal"), o("서비스 또는 제품 소개", "product"),
      o("교육 또는 강의", "education"), o("투자 또는 사업 제안", "investment"), o("포트폴리오", "portfolio"),
      o("행사 또는 세미나", "event"), o("직접 입력", "custom"), U ] },
    { id: "audience", type: "single_select", message: "누구에게 발표하나요?", options: [
      o("같은 팀", "team"), o("팀장 또는 관리자", "manager"), o("경영진", "exec"),
      o("고객 또는 외부 업체", "client"), o("학생 또는 교육생", "student"), o("불특정 다수", "public"), U ] },
    { id: "desiredAudienceAction", type: "single_select", message: "발표를 들은 사람이 무엇을 하길 원하나요?", options: [
      o("내용을 이해하면 돼요", "understand"), o("의사결정을 내려야 해요", "decide"),
      o("제안을 승인해야 해요", "approve"), o("제품이나 서비스를 구매해야 해요", "buy"),
      o("행동이나 업무를 시작해야 해요", "act"), U ] },
    { id: "durationMinutes", type: "single_select", message: "발표 시간은 어느 정도인가요?", options: [
      o("5분 이하", "5"), o("10분", "10"), o("20분", "20"), o("30분", "30"),
      o("1시간 이상", "60"), o("아직 정하지 않았어요", "undecided") ] },
    { id: "availableMaterials", type: "multi_select", message: "이미 준비된 자료가 있나요? (여러 개 선택 가능)", options: [
      o("텍스트 또는 메모", "text"), o("엑셀 또는 데이터", "data"), o("이미지", "image"),
      o("기존 PPT", "ppt"), o("참고 링크", "link"), o("아무 자료도 없어요", "none") ] },
    { id: "designTone", type: "single_select", message: "어떤 분위기의 디자인을 원하나요?", options: [
      o("깔끔하고 전문적", "professional"), o("간결하고 현대적", "modern"), o("친근하고 쉬운 느낌", "friendly"),
      o("강렬하고 시각적인 느낌", "bold"), o("차분하고 고급스러운 느낌", "elegant"),
      o("회사 디자인에 맞춰야 해요", "brand"), U ] },
    { id: "requiredSections", type: "text", optional: true, message: "꼭 포함해야 하는 내용이 있나요?",
      description: "예: 현재 문제, 핵심 데이터, 해결 방법, 일정, 예산, 기대 효과, 요청 사항 (직접 입력하거나 건너뛸 수 있어요)" },
    { id: "outputFormat", type: "single_select", message: "원하는 결과물은 무엇인가요?", options: [
      o("PPTX 파일", "pptx"), o("Google Slides", "gslides"), o("발표 목차만", "outline"),
      o("슬라이드별 내용과 발표 대본", "script"), o("아직 정하지 않았어요", "undecided") ] },
  ],
};

// ── 3. 웹 서비스/앱 ──
const service: ProjectSchema = {
  type: "service",
  label: "웹 서비스 또는 앱",
  intro: "어떤 사람이 어떤 문제를 해결하기 위해 사용하는 서비스인지부터 정리할게요.",
  questions: [
    { id: "serviceType", type: "single_select", message: "어떤 형태를 만들고 싶으신가요?", options: [
      o("웹사이트", "website"), o("웹 애플리케이션", "webapp"), o("모바일 앱", "mobile"),
      o("사내 업무 시스템", "internal"), o("관리자 페이지", "admin"), o("쇼핑몰", "shop"),
      o("커뮤니티", "community"), o("아직 정하지 않았어요", "undecided") ] },
    { id: "targetUsers", type: "single_select", message: "이 서비스를 사용할 사람은 누구인가요?", options: [
      o("일반 고객", "customer"), o("회사 직원", "employee"), o("관리자", "admin"),
      o("특정 업종의 실무자", "domain"), o("학생 또는 교육생", "student"), o("나 혼자", "self"),
      o("직접 입력", "custom"), U ] },
    { id: "userProblem", type: "text", optional: true, message: "사용자가 겪고 있는 가장 큰 불편은 무엇인가요?",
      description: "예: 반복 업무가 너무 많아요 / 여러 파일을 일일이 확인해야 해요 / 정보를 찾기 어려워요 / 기존 서비스가 너무 복잡해요" },
    { id: "primaryUserAction", type: "single_select", message: "사용자가 이 서비스에서 가장 먼저 해야 하는 일은 무엇인가요?", options: [
      o("회원가입 또는 로그인", "auth"), o("파일 업로드", "upload"), o("정보 검색", "search"),
      o("내용 작성", "write"), o("상품 또는 콘텐츠 탐색", "browse"), o("데이터 확인", "view"),
      o("업무 요청", "request"), U ] },
    { id: "coreFeatures", type: "multi_select", message: "꼭 필요한 기능을 선택해주세요. (여러 개 선택 가능)", options: [
      o("회원가입 및 로그인", "auth"), o("사용자 권한 관리", "roles"), o("검색", "search"),
      o("파일 업로드", "upload"), o("게시글 또는 콘텐츠 작성", "content"), o("결제", "payment"),
      o("알림", "notify"), o("대시보드", "dashboard"), o("관리자 기능", "admin"),
      o("외부 서비스 연동", "integration"), o("AI 기능", "ai"), U ] },
    { id: "userFlow", type: "single_select", message: "사용자가 서비스를 이용하는 기본 흐름을 선택해주세요.", options: [
      o("가입 → 정보 입력 → 결과 확인", "signup"), o("로그인 → 파일 업로드 → 처리 결과 확인", "upload"),
      o("검색 → 상세 정보 확인 → 신청 또는 구매", "search"), o("콘텐츠 작성 → 검토 → 게시", "content"),
      o("직접 입력", "custom"), o("아직 정하지 않았어요", "undecided") ] },
    { id: "targetDevices", type: "single_select", message: "어떤 기기에서 주로 사용하나요?", options: [
      o("PC", "pc"), o("모바일", "mobile"), o("PC와 모바일 모두", "both"), o("태블릿", "tablet"), U ] },
    { id: "adminFeatures", type: "multi_select", message: "서비스 운영에 필요한 관리 기능이 있나요? (여러 개 선택 가능)", options: [
      o("사용자 관리", "users"), o("콘텐츠 관리", "content"), o("주문 또는 결제 관리", "orders"),
      o("통계 확인", "stats"), o("문의 관리", "inquiries"), o("필요 없어요", "none"), U ] },
    { id: "authenticationRequired", type: "single_select", message: "로그인이 필요한 서비스인가요?", options: [
      o("반드시 필요해요", "required"), o("일부 기능에만 필요해요", "partial"),
      o("필요 없어요", "none"), U ] },
    { id: "projectScope", type: "single_select", message: "이번에 만들고 싶은 범위는 어디까지인가요?", options: [
      o("아이디어와 기획만", "idea"), o("화면 설계", "wireframe"), o("디자인 시안", "design"),
      o("동작하는 프로토타입", "prototype"), o("실제 사용할 수 있는 서비스", "production"), U ] },
  ],
};

// ── 4. 문서 ──
const doc: ProjectSchema = {
  type: "document",
  label: "문서",
  intro: "문서의 목적과 읽는 사람을 기준으로 필요한 내용을 정리할게요.",
  questions: [
    { id: "documentType", type: "single_select", message: "어떤 문서를 만들고 싶으신가요?", options: [
      o("보고서", "report"), o("기획서", "plan"), o("제안서", "proposal"), o("회의록", "minutes"),
      o("업무 매뉴얼", "manual"), o("정책 또는 가이드", "guide"), o("이메일 또는 안내문", "email"),
      o("자기소개서 또는 포트폴리오 문서", "portfolio"), o("직접 입력", "custom"), U ] },
    { id: "audience", type: "text", optional: true, message: "누가 읽는 문서인가요?" },
    { id: "documentGoal", type: "text", optional: true, message: "문서를 읽은 사람이 무엇을 알아야 하나요?" },
    { id: "desiredReaderAction", type: "text", optional: true, message: "문서를 읽은 사람이 어떤 행동을 해야 하나요?" },
    { id: "availableMaterials", type: "text", optional: true, message: "이미 작성된 자료가 있나요? 있다면 알려주세요." },
    { id: "requiredSections", type: "text", optional: true, message: "반드시 포함해야 하는 내용은 무엇인가요?" },
    { id: "lengthPreference", type: "single_select", message: "원하는 문서 길이는 어느 정도인가요?", options: [
      o("한 장 이내", "1page"), o("2~3장", "few"), o("5장 이상", "long"), o("정해지지 않음", "undecided") ] },
    { id: "tone", type: "single_select", message: "원하는 말투는 무엇인가요?", options: [
      o("격식 있고 정중하게", "formal"), o("간결하고 명확하게", "concise"),
      o("친근하고 쉽게", "friendly"), U ] },
    { id: "outputFormat", type: "single_select", message: "어떤 형식이 필요한가요?", options: [
      o("DOCX", "docx"), o("PDF", "pdf"), o("Markdown", "md"), o("텍스트", "txt") ] },
  ],
};

// ── 5. 자동화 도구 ──
const automation: ProjectSchema = {
  type: "automation",
  label: "자동화 도구",
  intro: "반복해서 하고 있는 일을 찾아 자동화할 수 있도록 정리할게요.",
  questions: [
    { id: "automationTarget", type: "single_select", message: "어떤 일을 자동화하고 싶으신가요?", options: [
      o("파일 정리", "files"), o("엑셀 또는 데이터 처리", "data"), o("문서 생성", "docs"),
      o("이메일 처리", "email"), o("웹사이트 정보 수집", "scraping"), o("보고서 생성", "reports"),
      o("여러 시스템 간 데이터 이동", "integration"), o("정기 알림", "notify"), o("직접 입력", "custom"), U ] },
    { id: "currentWorkflow", type: "text", optional: true, message: "현재 이 업무를 어떤 순서로 하고 있나요?" },
    { id: "inputSources", type: "text", optional: true, message: "어떤 파일이나 프로그램을 사용하나요?" },
    { id: "frequency", type: "single_select", message: "얼마나 자주 반복하나요?", options: [
      o("하루에 여러 번", "manyDaily"), o("매일", "daily"), o("매주", "weekly"),
      o("매월", "monthly"), o("비정기적", "adhoc") ] },
    { id: "dataVolume", type: "single_select", message: "한 번 처리할 때 데이터가 얼마나 많나요?", options: [
      o("적음 (몇 건~수십 건)", "small"), o("보통 (수백~수천 건)", "medium"),
      o("많음 (수만 건 이상)", "large"), o("잘 모르겠어요", UNKNOWN) ] },
    { id: "trigger", type: "single_select", message: "자동화가 시작되는 조건은 무엇인가요?", options: [
      o("정해진 시간", "schedule"), o("파일이 생기면", "onfile"), o("사람이 실행할 때", "manual"),
      o("다른 시스템 신호", "event"), o("아직 정하지 않았어요", "undecided") ] },
    { id: "outputDestination", type: "text", optional: true, message: "결과물은 어디에 저장하거나 전달해야 하나요?" },
    { id: "humanReviewRequired", type: "single_select", message: "중간에 사람이 검토해야 하나요?", options: [
      o("예", "yes"), o("아니오", "no"), U ] },
    { id: "failureNotification", type: "single_select", message: "실패했을 때 알림이 필요한가요?", options: [
      o("예", "yes"), o("아니오", "no"), U ] },
    { id: "dataSensitivity", type: "single_select", message: "민감하거나 외부로 나가면 안 되는 데이터가 있나요?", options: [
      o("있어요 (외부 전송 금지)", "sensitive"), o("없어요", "none"), U ] },
  ],
};

// ── 6. 데이터 분석 ──
const dataAnalysis: ProjectSchema = {
  type: "data_analysis",
  label: "데이터 분석",
  intro: "가지고 있는 데이터에서 어떤 질문의 답을 찾고 싶은지 정리할게요.",
  questions: [
    { id: "analysisGoal", type: "single_select", message: "무엇을 알고 싶으신가요?", options: [
      o("현황을 요약하고 싶어요", "summary"), o("원인을 찾고 싶어요", "cause"),
      o("여러 항목을 비교하고 싶어요", "compare"), o("미래 수치를 예측하고 싶어요", "forecast"),
      o("이상하거나 잘못된 데이터를 찾고 싶어요", "anomaly"),
      o("고객이나 상품을 그룹으로 나누고 싶어요", "segment"), U ] },
    { id: "dataSource", type: "text", optional: true, message: "분석할 데이터는 어디에 있나요?" },
    { id: "dateRange", type: "text", optional: true, message: "어떤 기간의 데이터인가요?" },
    { id: "keyDimensions", type: "text", optional: true, message: "가장 중요하게 보고 싶은 기준은 무엇인가요?" },
    { id: "comparisonTargets", type: "text", optional: true, message: "비교 대상이 있나요? 있다면 알려주세요." },
    { id: "audience", type: "text", optional: true, message: "결과를 누구에게 보여주나요?" },
    { id: "outputType", type: "multi_select", message: "원하는 결과 형태는 무엇인가요? (여러 개 선택 가능)", options: [
      o("요약 문서", "report"), o("표", "table"), o("그래프", "chart"),
      o("대시보드", "dashboard"), o("예측 수치", "prediction"), U ] },
    { id: "visualizationRequired", type: "single_select", message: "그래프나 대시보드가 필요한가요?", options: [
      o("예", "yes"), o("아니오", "no"), U ] },
    { id: "containsSensitiveData", type: "single_select", message: "데이터에 개인정보 또는 민감정보가 포함되어 있나요?", options: [
      o("예", "yes"), o("아니오", "no"), U ] },
  ],
};

// ── 8. 기타 (전부 직접 입력) ──
const other: ProjectSchema = {
  type: "other",
  label: "기타",
  intro: "만들고 싶은 것을 자유롭게 알려주세요. 순서대로 여쭤볼게요.",
  questions: [
    { id: "summary", type: "text", message: "만들고 싶은 것을 한 문장으로 설명해주세요." },
    { id: "reason", type: "text", optional: true, message: "이 결과물이 필요한 이유는 무엇인가요?" },
    { id: "targetUsers", type: "text", optional: true, message: "누가 사용할 예정인가요?" },
    { id: "coreRequirements", type: "text", optional: true, message: "가장 중요한 기능이나 내용은 무엇인가요?" },
    { id: "desiredOutput", type: "text", optional: true, message: "어떤 형태의 결과물을 원하나요?" },
    { id: "references", type: "text", optional: true, message: "참고할 만한 기존 서비스나 파일이 있나요?" },
    { id: "constraints", type: "text", optional: true, message: "반드시 지켜야 하는 조건이 있나요?" },
  ],
};

// ── 7. 발견(아직 모름) — 문제 중심 ──
export const DISCOVERY: ProjectSchema = {
  type: "discovery",
  label: "아직 잘 모르겠어요",
  intro: "괜찮아요. 만들고 싶은 결과물이 아니라 현재 불편한 점부터 찾아볼게요.",
  questions: [
    { id: "problemArea", type: "single_select", message: "현재 가장 해결하고 싶은 문제는 무엇인가요?", options: [
      o("반복 업무가 너무 많아요", "repetitive"), o("데이터를 보기 어려워요", "data"),
      o("발표 자료를 만들어야 해요", "presentation"), o("문서를 작성해야 해요", "document"),
      o("고객이나 직원이 사용할 서비스가 필요해요", "service"),
      o("여러 파일이나 정보를 정리하고 싶어요", "organize"),
      o("아이디어를 구체화하고 싶어요", "idea"), o("직접 입력", "custom") ] },
    { id: "problemWho", type: "text", optional: true, message: "이 문제를 주로 겪는 사람은 누구인가요?" },
    { id: "currentSolution", type: "text", optional: true, message: "현재는 이 문제를 어떻게 해결하고 있나요?" },
    { id: "currentPain", type: "text", optional: true, message: "현재 방식에서 가장 불편한 점은 무엇인가요?" },
    { id: "desiredState", type: "text", optional: true, message: "문제가 해결되면 어떤 상태가 되길 원하나요?" },
    { id: "preferredOutput", type: "single_select", message: "결과물이 어떤 형태이면 가장 사용하기 쉬울까요?", options: [
      o("한눈에 보는 화면", "dashboard"), o("발표 자료", "presentation"), o("문서", "document"),
      o("자동으로 실행되는 프로그램", "automation"), o("웹사이트 또는 앱", "service"),
      o("분석 결과", "data_analysis"), U ] },
  ],
};

// 발견 → 추천 규칙 (problemArea / preferredOutput 기준)
export function recommendType(answers: Record<string, string | string[]>): string {
  const out = answers.preferredOutput as string | undefined;
  const known = ["dashboard", "presentation", "document", "automation", "service", "data_analysis"];
  if (out && known.includes(out)) return out;
  const area = answers.problemArea as string | undefined;
  const map: Record<string, string> = {
    repetitive: "automation",
    data: "dashboard",
    presentation: "presentation",
    document: "document",
    service: "service",
    organize: "automation",
    idea: "service",
  };
  return (area && map[area]) || "service";
}

// ── 공통 추가 질문 (각 유형 완료 후) ──
export const COMMON_QUESTIONS: KickstartQuestion[] = [
  { id: "deadline", type: "single_select", message: "언제까지 필요하신가요?", options: [
    o("오늘", "today"), o("이번 주", "week"), o("이번 달", "month"),
    o("날짜 직접 입력", "custom"), o("아직 정하지 않았어요", "undecided") ] },
  { id: "deadlineDate", type: "date", optional: true, message: "완료 희망일을 입력해주세요 (YYYY-MM-DD).",
    condition: { field: "deadline", operator: "equals", value: "custom" } },
  { id: "availableMaterials", type: "multi_select", message: "현재 사용할 수 있는 자료가 있나요? (여러 개 선택 가능)", options: [
    o("텍스트 또는 메모", "text"), o("이미지", "image"), o("엑셀 또는 CSV", "spreadsheet"),
    o("PDF 또는 문서", "pdf"), o("기존 소스코드", "code"), o("참고 사이트", "site"),
    o("아무 자료도 없어요", "none") ] },
  { id: "constraints", type: "multi_select", message: "반드시 지켜야 하는 조건이 있나요? (여러 개 선택 가능)", options: [
    o("특정 기술을 사용해야 해요", "tech"), o("회사 디자인이나 규칙을 따라야 해요", "brand"),
    o("외부 인터넷을 사용할 수 없어요", "offline"), o("개인정보가 포함되어 있어요", "privacy"),
    o("예산 제한이 있어요", "budget"), o("직접 입력", "custom"), o("특별한 조건이 없어요", "none") ] },
  { id: "referenceFiles", type: "text", optional: true, message: "참고해야 할 파일이 있나요? 있다면 파일 경로를 입력해주세요.",
    description: "예: ./data/sales.csv, /Users/me/보고서.xlsx, ./old/index.html (여러 개면 쉼표로 구분, 없으면 그냥 Enter)" },
];

export const SCHEMAS: Record<string, ProjectSchema> = {
  dashboard, presentation, service, document: doc, automation, data_analysis: dataAnalysis, other,
};

export function getSchema(type: string): ProjectSchema | null {
  if (type === "discovery") return DISCOVERY;
  return SCHEMAS[type] ?? null;
}

// 화면 디자인이 중요한 유형 — 디자인 시스템 선택 질문을 끼운다.
const VISUAL = new Set(["dashboard", "service", "presentation", "data_analysis"]);

/** 유명 디자인 시스템 선택 (토큰 0). 선택값은 생성 프롬프트에 특징으로 주입된다. */
export const DESIGN_SYSTEM_Q: KickstartQuestion = {
  id: "designSystem",
  type: "single_select",
  message: "어떤 디자인 스타일로 만들까요?",
  options: [
    o("애플 (깔끔·넉넉한 여백·부드러운 곡선)", "apple"),
    o("구글 머티리얼 (선명한 색·그림자·직관적)", "material"),
    o("마이크로소프트 플루언트 (차분·기업용·정돈)", "fluent"),
    o("모던 미니멀 (Linear/Vercel 풍·절제)", "minimal"),
    o("토스 (큰 숫자·친근·아주 깔끔)", "toss"),
    o("알아서 잘 (기획에 맞게)", "auto"),
  ],
};

/** 유형별 질문 + (시각 유형이면) 디자인 시스템 + 공통 질문(중복 id 제외). */
export function flowQuestions(type: string): KickstartQuestion[] {
  const schema = getSchema(type);
  if (!schema) return [];
  const ids = new Set(schema.questions.map((q) => q.id));
  const extra = VISUAL.has(type) && !ids.has("designSystem") ? [DESIGN_SYSTEM_Q] : [];
  const common = COMMON_QUESTIONS.filter((q) => !ids.has(q.id));
  return [...schema.questions, ...extra, ...common];
}
