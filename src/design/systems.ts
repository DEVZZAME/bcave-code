// 4개 디자인 시스템 — 사용자가 화면/대시보드/HTML 을 만들 때마다 이 중 하나를 고른다.
// 규칙(토큰·컴포넌트)은 지키되, LLM 이 매번 레이아웃을 다르게 조립한다(고정 틀 금지).
// CSS 는 {{BCAVE_DS:<id>}} 자리표시자로 인라인(토큰 0).

import { AXIS_CSS, TOSS_CSS, CLASSIC_CSS, ATELIER_CSS } from "./tokens-css.js";

export interface DesignSystem {
  id: string; // "1".."4"
  key: string; // axis | toss | classic | atelier
  label: string; // 선택지 표시
  css: string; // 토큰/컴포넌트 CSS
  guide: string; // 사용법(토큰형/컴포넌트형) + 배치 규칙
}

// 모든 시스템에 덧붙는 안전 보정(넘침·한글 줄바꿈). canvas 의 height 는 건드리지 않는다.
export const DS_SAFETY = `*{box-sizing:border-box}body{word-break:keep-all;overflow-wrap:break-word}img{max-width:100%}`;

// 표준 셸(GNB topbar + 컨테이너) — 토큰형(axis/atelier)의 쇼케이스에 정의된 공통 크롬.
// 토큰 CSS 엔 없어서 여기서 클래스로 제공한다(모든 페이지가 같은 GNB/구조 → 일관된 느낌).
const AXIS_SHELL = `.topbar{position:sticky;top:0;z-index:10;background:rgba(255,255,255,.85);backdrop-filter:blur(12px);border-bottom:1px solid var(--color-border)}
.topbar-inner{max-width:1040px;margin:0 auto;padding:0 var(--space-6);height:56px;display:flex;align-items:center;gap:var(--space-4)}
.logo{display:flex;align-items:center;gap:8px;font-weight:800;font-size:16px;letter-spacing:.02em;color:var(--color-text-primary)}
.topbar nav{display:flex;gap:var(--space-1);margin-left:auto;overflow-x:auto}
.topbar nav a{color:var(--color-text-secondary);text-decoration:none;font-size:13px;font-weight:500;padding:6px 10px;border-radius:var(--radius-sm);white-space:nowrap}
.topbar nav a:hover{background:var(--gray-100);color:var(--color-text-primary)}
.topbar nav a.on{background:var(--color-primary-subtle);color:var(--color-primary)}
.wrap{max-width:1040px;margin:0 auto;padding:var(--space-8) var(--space-6) var(--space-16)}
.page-head{padding:var(--space-2) 0 var(--space-8)}
.page-head h1{font:var(--text-display-2);letter-spacing:var(--letter-spacing-heading);margin:0}
.page-head p{color:var(--color-text-secondary);margin:var(--space-2) 0 0}`;
const ATELIER_SHELL = `.topbar{position:sticky;top:0;z-index:10;background:rgba(19,17,16,.88);backdrop-filter:blur(12px);border-bottom:1px solid var(--color-border)}
.topbar-inner{max-width:1020px;margin:0 auto;padding:0 var(--space-6);height:60px;display:flex;align-items:center;gap:var(--space-4)}
.logo{font-family:var(--font-family-display);font-weight:600;font-size:17px;letter-spacing:.16em;color:var(--color-text-primary);display:flex;align-items:center;gap:8px}
.topbar nav{display:flex;gap:2px;margin-left:auto;overflow-x:auto}
.topbar nav a{color:var(--color-text-secondary);text-decoration:none;font-size:13px;font-weight:500;padding:6px 10px;white-space:nowrap}
.topbar nav a:hover{color:var(--color-text-primary)}
.topbar nav a.on{color:var(--color-primary)}
.wrap{max-width:1020px;margin:0 auto;padding:var(--space-10) var(--space-6) var(--space-20)}
.page-head{padding:var(--space-2) 0 var(--space-10)}
.page-head h1{font:var(--text-display-2);margin:0}
.page-head p{color:var(--color-text-secondary);margin:var(--space-3) 0 0}`;
const SHELL_NOTE = "\n표준 셸(모든 페이지 공통 — 빼거나 새로 만들지 말 것): <body> 안에 GNB <div class=\"topbar\"><div class=\"topbar-inner\"><div class=\"logo\">제품/서비스명</div><nav><a href=\"#\">메뉴1</a><a href=\"#\">메뉴2</a>…</nav></div></div> 다음에 <main class=\"wrap\"><div class=\"page-head\"><h1>제목</h1><p>부제</p></div> …내용… </main>. GNB·.wrap·.page-head 는 이 시스템 모든 화면의 고정 크롬이다.";

const AXIS_GUIDE = `AXIS — 밝은 코발트 · 웹 플랫폼/대시보드 (모던 프로페셔널). 컴포넌트 클래스가 없는 "토큰형" — 아래 CSS 변수로 컴포넌트를 직접 만든다.
- 색: 배경 var(--color-bg) · 표면 var(--color-surface) · 보더 var(--color-border) · 텍스트 var(--color-text-primary|secondary|tertiary) · 강조 var(--color-primary)(코발트) · 증감 var(--color-increase)녹/var(--color-decrease)적 · 상태 success/danger/warning(+ -subtle 배경)
- 타이포(축약 프로퍼티): font: var(--text-display-1|display-2|heading-1|heading-2|heading-3|body-1|body-2|caption). 지표 숫자 font: var(--text-data-lg|md|sm) 에 font-feature-settings:var(--font-feature-data); letter-spacing:var(--letter-spacing-data)
- 간격 var(--space-1..16) · 라운드 var(--radius-sm|md|lg|full) · 그림자 var(--shadow-1|2|3) · 카드 padding var(--card-padding), gap var(--card-gap)
- 차트: var(--chart-1..8), 그리드 var(--chart-grid), 축 var(--chart-axis)
- 대시보드는 <html data-density="compact"> 로 밀도↑(패딩·행높이·지표크기 자동 축소)
- body{font-family:var(--font-family-base);background:var(--color-bg);color:var(--color-text-primary)}. Pretendard <link> 필요.
- 예) 카드: <div style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:var(--card-padding);box-shadow:var(--shadow-1)">…</div>  · KPI값: <div style="font:var(--text-data-lg);letter-spacing:var(--letter-spacing-data);font-feature-settings:var(--font-feature-data)">1,240</div>`;

const ATELIER_GUIDE = `ATELIER — 다크 에디토리얼 · 에스프레소+골드 · 세리프 제목 (고급/차분). 컴포넌트 클래스 없는 "토큰형".
- 색: 배경 var(--color-bg)(짙은 에스프레소) · 표면 var(--color-surface)/raised var(--color-surface-raised) · 골드 헤어라인 var(--color-hairline)(시그니처) · 텍스트 var(--color-text-primary|secondary|tertiary) · 브랜드/강조 var(--color-primary)(골드) · 증감 mint/coral
- 타이포: 제목은 세리프 font: var(--text-display-1|heading-1|heading-2)(Noto Serif KR), 본문 산세 var(--text-body-1|2), 라벨 var(--text-label)+letter-spacing:var(--letter-spacing-label) 대문자
- 지표 숫자는 "얇고 크게"가 인상: font: var(--text-data-xl|lg)(weight 300)
- 형태: 라운드 최소 var(--radius-sm=2px|md=4px). 다크라 그림자 대신 표면 밝기(surface/raised)로 높이 표현. 골드 1px 헤어라인·넉넉한 여백(var(--section-gap))
- 차트 var(--chart-1..8)(다크 대비). Noto Serif KR + Pretendard <link> 필요.
- body{background:var(--color-bg);color:var(--color-text-primary);font-family:var(--font-family-base)}
- 예) 표면 카드: <div style="background:var(--color-surface);border-top:1px solid var(--color-hairline);padding:var(--card-padding)">…</div>  · 제목: <h2 style="font:var(--text-heading-1)">…</h2>`;

const TOSS_GUIDE = `TOSS — 밝은 배경·둥근 카드·파란 강조 (토스풍 모던). "컴포넌트형" — .ds-* 클래스를 조립. body 에 class="ds-body". 컨테이너 .ds-wrap(max 1080), 2열 .ds-two-col.
- 섹션 제목 .ds-section-title · 카드 .ds-card(+.ds-card-head/.ds-card-title/.ds-card-desc)
- KPI .ds-kpi-label/.ds-kpi-value/.ds-kpi-sub · 델타 .ds-delta.ds-delta--up|--down · 배지 .ds-badge(--primary|--neutral) · 칩 .ds-chip(.ds-chip--on) · 세그 .ds-seg
- 표 .ds-tbl · 순위행 .ds-row(.ds-row-rank/.ds-row-avatar/.ds-row-thumb/.ds-row-main/.ds-row-title/.ds-row-sub/.ds-row-val)
- 스택바 .ds-stackbar + 범례 .ds-legend/.ds-legend-item/.ds-legend-dot/.ds-legend-pct · 게이지 .ds-gauge/.ds-gauge-bar/.ds-gauge-fill
- 팁 .ds-tip · 알림 .ds-noti(.ds-noti-icon/.ds-noti-title/.ds-noti-body) · 피드 .ds-feed/.ds-feed-item · 상품 .ds-prod(.ds-prod-img/.ds-prod-body/.ds-prod-cat/.ds-prod-name/.ds-prod-price) · 리포트 .ds-report/.ds-quote/.ds-tag
- 차트는 높이 고정 컨테이너(position:relative;height:280px)+ maintainAspectRatio:false. 팔레트 파랑 계열(#3182F6…). Pretendard <link> 필요.`;

const CLASSIC_GUIDE = `CLASSIC — 흰 종이·괘선·먹색+옐로 문서/보고서형. "컴포넌트형" — .rp-* 클래스. body class="rp-body", 종이 .rp-page>.rp-inner.
- 표제부 .rp-titleblock/.rp-doc-type/.rp-title/.rp-subtitle · 번호 섹션 .rp-section>.rp-sec-head(.rp-sec-no/.rp-sec-title/.rp-sec-en) · 소제목 .rp-subsec · 본문 .rp-text(b 강조)
- 요약 .rp-summary(.rp-summary-label,ul>li) · 시사점 .rp-insight(.rp-insight-label)
- KPI 스트립 .rp-kpi-strip>div(.rp-kpi-l/.rp-kpi-v(small.pos|neg)/.rp-kpi-s)
- 그림(차트) .rp-fig>.rp-fig-head(.rp-fig-title/.rp-fig-no/.rp-fig-unit)>.rp-fig-body · 표 .rp-tbl(tr.total/tr.hl/.up/.down/.muted, .rp-tbl-note)
- 100% 스택바 .rp-stack + .rp-stack-legend · 액션표 .rp-action-tbl + .rp-prio.h|m|l · 그리드 .rp-grid-2 / .rp-grid-53 · 푸터 .rp-footer
- 강조 옐로는 문서당 소수만. 차트는 저채도(먹색#2B3138/옐로#F5C400). Pretendard <link> 필요.`;

export const DESIGN_SYSTEMS: Record<string, DesignSystem> = {
  "1": { id: "1", key: "axis", label: "1. AXIS — 밝은 코발트 · 모던 프로페셔널 (웹/대시보드, 토큰형)", css: AXIS_CSS + "\n" + AXIS_SHELL, guide: AXIS_GUIDE + SHELL_NOTE },
  "2": { id: "2", key: "toss", label: "2. TOSS — 밝은 배경 · 둥근 카드 · 파란 강조 (토스풍)", css: TOSS_CSS, guide: TOSS_GUIDE },
  "3": { id: "3", key: "classic", label: "3. CLASSIC — 흰 종이 · 괘선 · 먹색+옐로 (문서/보고서형)", css: CLASSIC_CSS, guide: CLASSIC_GUIDE },
  "4": { id: "4", key: "atelier", label: "4. ATELIER — 다크 에디토리얼 · 골드+세리프 (고급/차분)", css: ATELIER_CSS + "\n" + ATELIER_SHELL, guide: ATELIER_GUIDE + SHELL_NOTE },
};

const ALIAS: Record<string, string> = {
  "1": "1", "1번": "1", axis: "1", 액시스: "1",
  "2": "2", "2번": "2", toss: "2", 토스: "2",
  "3": "3", "3번": "3", classic: "3", 클래식: "3", 보고서: "3",
  "4": "4", "4번": "4", atelier: "4", 아틀리에: "4", 다크: "4",
};

/** 메시지에서 디자인 시스템 선택(1~4 / 이름)을 찾는다. 없으면 null. */
export function findSystem(message?: string): DesignSystem | null {
  if (!message) return null;
  const m = message.toLowerCase();
  // 정확한 번호/이름 우선
  for (const [k, id] of Object.entries(ALIAS)) {
    const re = /^[a-z]/.test(k) ? new RegExp(`\\b${k}\\b`) : new RegExp(`(^|[^0-9])${k}([^0-9]|$)`);
    if (re.test(m)) return DESIGN_SYSTEMS[id];
  }
  return null;
}

/** 4개 선택지 목록(되묻기용). */
export function systemsMenu(): string {
  return Object.values(DESIGN_SYSTEMS).map((s) => "  " + s.label).join("\n");
}

// "알아서"일 때 4개를 순환 배정(매번 다른 시스템).
let _lastAuto = "";
export function rotateSystem(): DesignSystem {
  const ids = Object.keys(DESIGN_SYSTEMS).filter((i) => i !== _lastAuto);
  const id = ids[Math.floor(Math.random() * ids.length)] ?? "1";
  _lastAuto = id;
  return DESIGN_SYSTEMS[id];
}

// ── 요청 분류: UI/대시보드/HTML 제작인가, 시스템이 정해졌나, 되물어야 하나 ──
const UI_NOUN =
  /(대시보드|dashboard|화면|페이지|컴포넌트|랜딩|폼\b|모달|사이트|웹\s?ui|\bui\b|앱\s?화면|리포트|보고서|html|랜딩페이지|landing|screen|page|component|스크린)/i;
const CHANGE_HINT = /(다르게|새롭게|다른 느낌|다시 만들|다시 해|바꿔|바꿔봐|바꿔줘|재구성|리디자인|redesign|수정|고쳐|더 |좀 더)/;
const DETAIL_HINT =
  /(데이터|파일|\.(xlsx|csv|tsv|json)|매출|고객|지표|kpi|차트|그래프|표\b|테이블|컬럼|기간|월별|브랜드|카테고리|분석|랭킹|추이|현황|성과|목록|주문|결제|사용자|색|폰트|여백|간격|레이아웃)/i;
const VAGUE_OK = /(알아서|아무|그냥|적당히|맘대로|네가|당신이|추천|골라|자유롭게)/;
// 명백한 코드/비UI 신호 — UI 후속으로 오인 방지
const NON_UI = /(버그|bug|에러|error|예외|exception|테스트|\btest\b|함수|메서드|커밋|commit|푸시|push|배포|deploy|빌드(?!\s*화면)|\bbuild\b|타입\b|import|의존성|패키지|package|쿼리|\bapi\b\s?(호출|연동)|db\b|서버\s?실행|린트|lint)/i;

export function designChoiceForRequest(
  message: string,
  lastSystemId: string,
  lastWasUi: boolean,
): { isUi: boolean; system: DesignSystem | null; needsChoice: boolean } {
  const explicit = findSystem(message);
  let isUi = UI_NOUN.test(message) || !!explicit;
  if (
    !isUi &&
    lastWasUi &&
    !NON_UI.test(message) &&
    (CHANGE_HINT.test(message) || DETAIL_HINT.test(message) || VAGUE_OK.test(message) || /^(응|네|그래|좋아|ok|오케이|그렇게|진행|만들어)/i.test(message.trim()))
  ) {
    isUi = true;
  }
  if (!isUi) return { isUi: false, system: null, needsChoice: false };
  if (explicit) return { isUi: true, system: explicit, needsChoice: false };
  if (VAGUE_OK.test(message)) return { isUi: true, system: rotateSystem(), needsChoice: false }; // "알아서" → 자동 배정
  if (UI_NOUN.test(message)) return { isUi: true, system: null, needsChoice: true }; // 새 페이지/대시보드 → 항상 물어봄
  if (lastWasUi && lastSystemId && DESIGN_SYSTEMS[lastSystemId]) return { isUi: true, system: DESIGN_SYSTEMS[lastSystemId], needsChoice: false }; // 후속 수정 → 직전 시스템 유지
  return { isUi: true, system: null, needsChoice: true };
}
