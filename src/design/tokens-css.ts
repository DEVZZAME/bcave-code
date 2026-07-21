// 4개 디자인 시스템의 토큰/컴포넌트 CSS (원본: /Users/bcave/Desktop/디자인시스템). 자동 생성 임베드.
export const AXIS_CSS = `/* ============================================================
   AXIS Design System — Tokens v0.1
   웹 플랫폼 · 보고용 대시보드 공용 토큰
   구조: Primitive(원시값) → Semantic(의미) → Component(컴포넌트)
   밀도: html[data-density="compact"] 로 대시보드 모드 전환
   ============================================================ */

:root {
  /* ---------- 1. Primitive · Color ---------- */
  /* Neutral (Cool Gray) */
  --gray-25:  #FBFCFD;
  --gray-50:  #F7F8FA;
  --gray-100: #EEF0F4;
  --gray-200: #E1E4EB;
  --gray-300: #C9CEDA;
  --gray-400: #A3AABC;
  --gray-500: #7B8399;
  --gray-600: #5A6275;
  --gray-700: #414958;
  --gray-800: #2B313D;
  --gray-900: #1A1F29;

  /* Brand (Cobalt) */
  --cobalt-50:  #EEF2FF;
  --cobalt-100: #DCE4FF;
  --cobalt-200: #B8C8FF;
  --cobalt-300: #8AA3FF;
  --cobalt-400: #5C7DF5;
  --cobalt-500: #3560E8;
  --cobalt-600: #274CC7;
  --cobalt-700: #1E3CA0;
  --cobalt-800: #172E7B;
  --cobalt-900: #112158;

  /* Accent & Status */
  --green-50:  #E9F9EF;
  --green-500: #12A150;
  --green-600: #0E8443;
  --red-50:    #FEECEC;
  --red-500:   #E5484D;
  --red-600:   #C93A40;
  --amber-50:  #FEF5E0;
  --amber-500: #EFA008;
  --amber-600: #C98508;
  --teal-500:  #0FA3A3;
  --violet-500:#7C5CFC;
  --rose-500:  #E85C90;

  /* ---------- 2. Semantic · Color ---------- */
  --color-bg:            var(--gray-50);
  --color-surface:       #FFFFFF;
  --color-surface-sub:   var(--gray-25);
  --color-border:        var(--gray-200);
  --color-border-strong: var(--gray-300);

  --color-text-primary:   var(--gray-900);
  --color-text-secondary: var(--gray-600);
  --color-text-tertiary:  var(--gray-400);
  --color-text-inverse:   #FFFFFF;

  --color-primary:        var(--cobalt-500);
  --color-primary-hover:  var(--cobalt-600);
  --color-primary-active: var(--cobalt-700);
  --color-primary-subtle: var(--cobalt-50);

  --color-success:        var(--green-500);
  --color-success-subtle: var(--green-50);
  --color-danger:         var(--red-500);
  --color-danger-subtle:  var(--red-50);
  --color-warning:        var(--amber-500);
  --color-warning-subtle: var(--amber-50);

  /* 증감 표기 — 기본: 상승=녹색 / 하락=적색 (글로벌 관례)
     국내 금융 관례(상승=적색/하락=청색)가 필요하면 아래 두 값만 교체 */
  --color-increase: var(--green-500);
  --color-decrease: var(--red-500);

  /* 데이터 시각화 · 범주형 8색 (명도 교차 배열, 인접 구분성 우선) */
  --chart-1: var(--cobalt-500);
  --chart-2: var(--teal-500);
  --chart-3: var(--amber-500);
  --chart-4: var(--violet-500);
  --chart-5: var(--rose-500);
  --chart-6: var(--green-500);
  --chart-7: var(--gray-500);
  --chart-8: var(--cobalt-300);
  --chart-grid: var(--gray-100);
  --chart-axis: var(--gray-400);

  /* ---------- 3. Typography ---------- */
  --font-family-base: "Pretendard Variable", Pretendard, -apple-system,
                      BlinkMacSystemFont, system-ui, "Segoe UI", sans-serif;
  --font-family-mono: "SF Mono", "JetBrains Mono", ui-monospace, monospace;

  /* 텍스트 스케일: size / line-height / weight */
  --text-display-1: 800 40px/48px var(--font-family-base);
  --text-display-2: 700 32px/40px var(--font-family-base);
  --text-heading-1: 700 24px/32px var(--font-family-base);
  --text-heading-2: 700 20px/28px var(--font-family-base);
  --text-heading-3: 600 17px/24px var(--font-family-base);
  --text-body-1:    400 15px/22px var(--font-family-base);
  --text-body-2:    400 14px/20px var(--font-family-base);
  --text-caption:   400 12px/16px var(--font-family-base);

  /* 숫자 전용(대시보드 지표) — tabular numerals 필수 */
  --text-data-lg: 700 28px/34px var(--font-family-base);
  --text-data-md: 700 20px/26px var(--font-family-base);
  --text-data-sm: 600 13px/18px var(--font-family-base);
  --font-feature-data: "tnum" 1, "ss01" 0;
  --letter-spacing-data: -0.02em;
  --letter-spacing-heading: -0.01em;

  /* ---------- 4. Spacing (4px base) ---------- */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;

  /* ---------- 5. Radius & Elevation ---------- */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --radius-full: 999px;

  --shadow-1: 0 1px 2px rgba(26, 31, 41, 0.06);
  --shadow-2: 0 2px 8px rgba(26, 31, 41, 0.08);
  --shadow-3: 0 8px 24px rgba(26, 31, 41, 0.12);

  --focus-ring: 0 0 0 3px var(--cobalt-100);

  /* ---------- 6. Motion ---------- */
  --duration-fast: 120ms;
  --duration-base: 200ms;
  --duration-slow: 320ms;
  --easing-standard: cubic-bezier(0.2, 0, 0, 1);

  /* ---------- 7. Component (밀도의 영향을 받는 토큰) ----------
     기본값 = comfortable(웹 플랫폼 모드) */
  --control-height-sm: 32px;
  --control-height-md: 40px;
  --control-height-lg: 48px;
  --control-padding-x: 16px;
  --control-font-size: 14px;

  --card-padding: var(--space-6);
  --card-gap: var(--space-4);

  --table-row-height: 48px;
  --table-padding-x: var(--space-4);
  --table-font-size: 14px;

  --kpi-value-size: 28px;
  --section-gap: var(--space-10);
}

/* ---------- 밀도: 대시보드(compact) 모드 ----------
   토큰 값만 바뀌고 컴포넌트 코드는 그대로 유지된다. */
[data-density="compact"] {
  --control-height-sm: 28px;
  --control-height-md: 34px;
  --control-height-lg: 40px;
  --control-padding-x: 12px;
  --control-font-size: 13px;

  --card-padding: var(--space-4);
  --card-gap: var(--space-3);

  --table-row-height: 36px;
  --table-padding-x: var(--space-3);
  --table-font-size: 13px;

  --kpi-value-size: 24px;
  --section-gap: var(--space-6);
}
`;
export const TOSS_CSS = `/* ============================================================
   대시보드 디자인 시스템 v1.0 — 토큰 & 컴포넌트
   토스 스타일 기반 · Pretendard 필요
   사용법: 이 파일을 import 하고 클래스를 조합해 쓰세요.
   ============================================================ */

/* ── 1. 디자인 토큰 ─────────────────────────────── */
:root{
  /* Color / Primary (Blue scale) */
  --blue-500:#3182F6;   /* 핵심 액션·강조·차트 1순위 */
  --blue-400:#64A8FF;   /* 차트 2순위 */
  --blue-300:#90C2FF;   /* 차트 3순위 */
  --blue-200:#C9E2FF;   /* 차트 4순위·비강조 막대 */
  --blue-100:#E8F3FF;   /* 배지·팁 배경 */

  /* Color / Grayscale */
  --gray-900:#191F28;   /* 제목·본문 강조 (text-strong) */
  --gray-700:#4E5968;   /* 본문 (text-mid) */
  --gray-500:#8B95A1;   /* 보조 텍스트·축 라벨 (text-weak) */
  --gray-300:#B0B8C1;   /* 비활성 */
  --gray-200:#E5E8EB;   /* 라인·비어있는 상태 */
  --gray-100:#F2F4F6;   /* 페이지 배경·디바이더 */
  --gray-50:#FAFBFC;    /* 합계 행 배경 */
  --white:#FFFFFF;

  /* Color / Semantic (국내 금융 관례: 상승=빨강, 하락=파랑) */
  --up:#F04452;         --up-bg:#FDEDEE;
  --down:#3182F6;       --down-bg:#E8F3FF;
  --positive:#02B26E;   --positive-bg:#EAFBF3;
  --warning:#FFB331;    --warning-bg:#FFF4E0;

  /* Color / Chart 보조 팔레트 */
  --chart-accent:#FFB331;      /* 파랑과 대비가 필요한 2번째 계열 */
  --chart-accent-2:#FFD98E;

  /* Typography */
  --font-family:"Pretendard Variable",Pretendard,-apple-system,BlinkMacSystemFont,system-ui,sans-serif;
  --text-display:38px;  /* 히어로 숫자 */
  --text-h1:26px;       /* 페이지 제목 */
  --text-kpi:22px;      /* KPI 숫자 */
  --text-h2:17px;       /* 카드 제목 */
  --text-body:15px;     /* 본문·리스트 제목 */
  --text-sub:13px;      /* 설명·범례 */
  --text-caption:12px;  /* 표 헤더·타임스탬프 */
  --text-micro:11px;    /* 축 라벨·배지 */
  --leading-body:1.75;  /* 장문 본문 */
  --tracking:-0.02em;   /* 기본 자간 */
  --tracking-tight:-0.03em; /* 큰 숫자 자간 */

  /* Spacing (4px 기반) */
  --space-1:4px;  --space-2:8px;  --space-3:12px;
  --space-4:16px; --space-5:20px; --space-6:24px;
  --space-7:28px; --space-8:32px;

  /* Radius */
  --radius-card:20px;   /* 카드 */
  --radius-md:12px;     /* 팁·아이콘·썸네일 */
  --radius-sm:8px;      /* 델타 배지·토글 버튼 */
  --radius-bar:6px;     /* 스택바·게이지 */
  --radius-full:999px;  /* 칩·아바타 */

  /* Shadow — 배경 대비로 구분하고 그림자는 최소로 */
  --shadow-toggle:0 1px 3px rgba(0,0,0,.08);

  /* Layout */
  --layout-max:1080px;
  --card-gap:12px;
}

/* ── 2. 베이스 ─────────────────────────────────── */
.ds-body{
  font-family:var(--font-family);
  background:var(--gray-100);
  color:var(--gray-900);
  -webkit-font-smoothing:antialiased;
  letter-spacing:var(--tracking);
}

/* ── 3. 레이아웃 ───────────────────────────────── */
.ds-wrap{max-width:var(--layout-max);margin:0 auto;padding:32px 20px 64px}
.ds-two-col{display:grid;grid-template-columns:1fr 1fr;gap:var(--card-gap)}
.ds-section-title{font-size:15px;font-weight:700;color:var(--gray-500);padding:28px 4px 12px}
@media (max-width:760px){ .ds-two-col{grid-template-columns:1fr} }

/* ── 4. 카드 ───────────────────────────────────── */
.ds-card{background:var(--white);border-radius:var(--radius-card);padding:26px;margin-bottom:var(--card-gap)}
.ds-card-title{font-size:var(--text-h2);font-weight:700}
.ds-card-desc{font-size:var(--text-sub);color:var(--gray-500);margin-top:4px;font-weight:500}
.ds-card-head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;gap:12px}

/* ── 5. KPI ───────────────────────────────────── */
.ds-kpi-label{font-size:var(--text-sub);font-weight:600;color:var(--gray-500)}
.ds-kpi-value{font-size:var(--text-kpi);font-weight:800;margin-top:8px;letter-spacing:var(--tracking-tight)}
.ds-kpi-sub{font-size:var(--text-caption);color:var(--gray-500);margin-top:4px;font-weight:500}

/* ── 6. 델타 배지 (등락 표시) ─────────────────── */
.ds-delta{display:inline-flex;align-items:center;gap:4px;
  font-size:14px;font-weight:700;border-radius:var(--radius-sm);padding:5px 10px}
.ds-delta--up{color:var(--up);background:var(--up-bg)}
.ds-delta--down{color:var(--down);background:var(--down-bg)}

/* ── 7. 배지 & 칩 ─────────────────────────────── */
.ds-badge{display:inline-block;font-size:var(--text-micro);font-weight:700;
  padding:2px 7px;border-radius:6px}
.ds-badge--primary{background:var(--blue-100);color:var(--blue-500)}
.ds-badge--neutral{background:var(--gray-100);color:var(--gray-500)}
.ds-chip{font-size:var(--text-sub);font-weight:600;padding:8px 14px;
  border-radius:var(--radius-full);background:var(--white);color:var(--gray-700);
  border:none;font-family:inherit;cursor:pointer}
.ds-chip--on{background:var(--gray-900);color:var(--white)}

/* ── 8. 세그먼트 토글 ─────────────────────────── */
.ds-seg{display:inline-flex;background:var(--gray-100);border-radius:10px;padding:3px}
.ds-seg button{border:none;background:transparent;font-family:inherit;
  font-size:var(--text-sub);font-weight:600;color:var(--gray-500);
  padding:6px 12px;border-radius:var(--radius-sm);cursor:pointer;transition:all .15s}
.ds-seg button.on{background:var(--white);color:var(--gray-900);box-shadow:var(--shadow-toggle)}

/* ── 9. 표 ─────────────────────────────────────── */
.ds-tbl{width:100%;border-collapse:collapse;font-size:14px}
.ds-tbl th{font-size:var(--text-caption);font-weight:600;color:var(--gray-500);
  text-align:right;padding:10px 8px;border-bottom:1px solid var(--gray-100);white-space:nowrap}
.ds-tbl th:first-child{text-align:left;padding-left:2px}
.ds-tbl td{padding:13px 8px;text-align:right;border-bottom:1px solid var(--gray-100);
  font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}
.ds-tbl td:first-child{text-align:left;font-weight:700;padding-left:2px}
.ds-tbl tr:last-child td{border-bottom:none}
.ds-tbl .up{color:var(--up);font-size:var(--text-caption);font-weight:700}
.ds-tbl .down{color:var(--down);font-size:var(--text-caption);font-weight:700}
.ds-tbl .muted{color:var(--gray-500);font-weight:500;font-size:var(--text-caption)}
.ds-tbl tr.total td{background:var(--gray-50);font-weight:800}

/* ── 10. 순위 행 ──────────────────────────────── */
.ds-row{display:flex;align-items:center;padding:12px 0;border-bottom:1px solid var(--gray-100)}
.ds-row:last-child{border-bottom:none}
.ds-row-rank{width:26px;font-size:var(--text-body);font-weight:800;color:var(--blue-500);flex-shrink:0}
.ds-row-avatar{width:38px;height:38px;border-radius:var(--radius-full);background:var(--blue-100);
  display:flex;align-items:center;justify-content:center;
  font-size:14px;font-weight:700;color:var(--blue-500);margin-right:12px;flex-shrink:0}
.ds-row-thumb{width:44px;height:44px;border-radius:var(--radius-md);margin-right:12px;flex-shrink:0;
  display:flex;align-items:center;justify-content:center;font-size:20px}
.ds-row-main{flex:1;min-width:0}
.ds-row-title{font-size:var(--text-body);font-weight:600;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ds-row-sub{font-size:var(--text-caption);color:var(--gray-500);margin-top:2px;font-weight:500}
.ds-row-val{font-size:var(--text-body);font-weight:700;text-align:right;flex-shrink:0}

/* ── 11. 스택바 & 범례 ────────────────────────── */
.ds-stackbar{display:flex;height:12px;border-radius:var(--radius-bar);overflow:hidden}
.ds-stackbar div{height:100%}
.ds-legend{display:flex;flex-wrap:wrap;gap:12px 18px}
.ds-legend-item{display:flex;align-items:center;gap:7px;
  font-size:var(--text-sub);font-weight:600;color:var(--gray-700)}
.ds-legend-dot{width:8px;height:8px;border-radius:var(--radius-full)}
.ds-legend-pct{color:var(--gray-500);font-weight:500}

/* ── 12. 팁 배너 ──────────────────────────────── */
.ds-tip{padding:14px 16px;background:var(--blue-100);border-radius:var(--radius-md);
  font-size:var(--text-sub);font-weight:600;color:var(--blue-500);line-height:1.5}

/* ── 13. 게이지 (강조 카드) ───────────────────── */
.ds-gauge{background:linear-gradient(135deg,var(--blue-500) 0%,#1B64DA 100%);
  border-radius:var(--radius-card);padding:26px 28px;color:var(--white)}
.ds-gauge-bar{height:12px;background:rgba(255,255,255,.25);
  border-radius:var(--radius-bar);overflow:hidden}
.ds-gauge-fill{height:100%;background:var(--white);border-radius:var(--radius-bar);
  transition:width 1.2s cubic-bezier(.2,.7,.3,1)}

/* ── 14. 알림 ─────────────────────────────────── */
.ds-noti{display:flex;gap:14px;padding:14px 0;border-bottom:1px solid var(--gray-100);align-items:flex-start}
.ds-noti:last-child{border-bottom:none}
.ds-noti-icon{width:40px;height:40px;border-radius:var(--radius-md);flex-shrink:0;
  display:flex;align-items:center;justify-content:center;font-size:18px}
.ds-noti-title{font-size:14px;font-weight:700}
.ds-noti-body{font-size:var(--text-sub);color:var(--gray-700);margin-top:3px;font-weight:500;line-height:1.55}
.ds-noti-time{font-size:var(--text-micro);color:var(--gray-500);margin-top:5px;font-weight:500}
.ds-noti--unread .ds-noti-title::after{content:"";display:inline-block;
  width:6px;height:6px;border-radius:var(--radius-full);
  background:var(--up);margin-left:6px;vertical-align:2px}

/* ── 15. 타임라인 피드 ────────────────────────── */
.ds-feed{position:relative;padding-left:22px}
.ds-feed::before{content:"";position:absolute;left:5px;top:8px;bottom:8px;
  width:2px;background:var(--gray-100)}
.ds-feed-item{position:relative;padding:10px 0}
.ds-feed-item::before{content:"";position:absolute;left:-22px;top:16px;
  width:12px;height:12px;border-radius:var(--radius-full);
  background:var(--blue-100);border:3px solid var(--blue-500)}

/* ── 16. 상품 카드 ────────────────────────────── */
.ds-prod{border-radius:16px;overflow:hidden;background:var(--gray-100)}
.ds-prod-img{height:110px;display:flex;align-items:center;justify-content:center;font-size:40px}
.ds-prod-body{padding:12px 14px 14px;background:var(--white)}
.ds-prod-cat{font-size:var(--text-micro);font-weight:700;color:var(--blue-500)}
.ds-prod-name{font-size:14px;font-weight:700;margin-top:3px;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ds-prod-price{font-size:var(--text-sub);font-weight:600;color:var(--gray-700);margin-top:4px}

/* ── 17. 장문 리포트 ──────────────────────────── */
.ds-report p{font-size:var(--text-body);line-height:var(--leading-body);
  color:var(--gray-700);font-weight:500;margin-bottom:16px}
.ds-report p strong{color:var(--gray-900);font-weight:700}
.ds-report h3{font-size:var(--text-body);font-weight:800;margin:26px 0 10px}
.ds-quote{border-left:3px solid var(--blue-500);padding:4px 0 4px 18px;margin:22px 0;
  font-size:16px;font-weight:700;color:var(--gray-900);line-height:1.6}
.ds-tag{font-size:var(--text-caption);font-weight:600;color:var(--blue-500);
  background:var(--blue-100);padding:5px 11px;border-radius:14px}

/* ── 18. 히트맵 셀 ────────────────────────────── */
.ds-hm-cell{border-radius:var(--radius-bar);transition:transform .1s}
.ds-hm-cell:hover{transform:scale(1.08)}
/* 농도 5단계: gray-100 → blue-200 → blue-300 → blue-400 → blue-500 */
`;
export const CLASSIC_CSS = `/* ============================================================
   실적 보고서 디자인 시스템 v1.0 — 토큰 & 컴포넌트
   문서형 대시보드(보고서) 전용 · Pretendard 필요
   접두사: rp- (report)
   ============================================================ */

/* ── 1. 토큰 ─────────────────────────────────── */
:root{
  /* Color / Ink (먹색 계층) */
  --rp-ink:#1F2328;          /* 제목·핵심 숫자·괘선(강) */
  --rp-ink-2:#4B5259;        /* 본문 */
  --rp-ink-3:#8A9199;        /* 캡션·표 헤더·비고 */

  /* Color / Accent — 카카오 옐로 (인쇄 시인성용 진한 톤) */
  --rp-accent:#F5C400;       /* 섹션 번호·강조 막대·강조점. 문서당 "한 곳에 하나"만 */
  --rp-accent-light:#FFF6D5; /* 요약 박스·강조 행 배경 */
  --rp-accent-line:#EBD98A;  /* 요약 박스 테두리 */

  /* Color / Line & Surface */
  --rp-line:#E3E6EA;         /* 기본 괘선 */
  --rp-line-strong:#C9CED4;  /* 헤더 하단·축선 */
  --rp-bg:#F4F5F7;           /* 화면 배경 (인쇄 시 백색) */
  --rp-paper:#FFFFFF;
  --rp-surface:#F7F8F9;      /* 표 헤더·합계 행·시사점 박스 */

  /* Color / Semantic — 보고서용 저채도 */
  --rp-up:#C4302B;           /* 증가 (차분한 적) */
  --rp-down:#1D5FBF;         /* 감소 (차분한 청) */

  /* Color / Chart */
  --rp-chart-1:#2B3138;      /* 기본 계열 = 먹색 */
  --rp-chart-2:#F5C400;      /* 강조 계열 = 옐로 */
  --rp-chart-3:#9AA1A9;      /* 보조 */
  --rp-chart-4:#DADDE1;      /* 비강조 */

  /* Typography */
  --rp-font:"Pretendard Variable",Pretendard,-apple-system,BlinkMacSystemFont,system-ui,sans-serif;
  --rp-text-title:30px;      /* 문서 제목 800 */
  --rp-text-h2:18px;         /* 섹션 제목 800 */
  --rp-text-h3:14px;         /* 소제목 800 */
  --rp-text-kpi:21px;        /* KPI 숫자 800 */
  --rp-text-body:13.5px;     /* 본문 500, lh 1.8 */
  --rp-text-tbl:12.5px;      /* 표 본문 */
  --rp-text-cap:11px;        /* 캡션·비고 */

  /* Layout */
  --rp-page-max:1000px;
  --rp-page-pad:52px;        /* 종이 안쪽 여백 (모바일 22px) */
  --rp-radius:0px;           /* 문서형 = 라운드 없음. 필요 시 4px 한도 */
}

/* ── 2. 페이지(종이) ─────────────────────────── */
.rp-body{font-family:var(--rp-font);background:var(--rp-bg);color:var(--rp-ink);
  -webkit-font-smoothing:antialiased;letter-spacing:-0.01em;font-size:14px}
.rp-page{max-width:var(--rp-page-max);margin:28px auto 60px;background:var(--rp-paper);
  border:1px solid var(--rp-line);box-shadow:0 2px 14px rgba(20,25,30,.06)}
.rp-inner{padding:48px var(--rp-page-pad)}

/* ── 3. 문서 표제부 ──────────────────────────── */
.rp-meta{display:flex;justify-content:space-between;padding-bottom:14px;
  border-bottom:1px solid var(--rp-line);font-size:12px;color:var(--rp-ink-3)}
.rp-confidential{font-weight:700;color:var(--rp-ink-2);
  border:1px solid var(--rp-line-strong);padding:3px 10px;letter-spacing:.06em}
.rp-titleblock{padding:34px 0 26px;border-bottom:3px solid var(--rp-ink)}
.rp-doc-type{display:inline-block;font-size:12px;font-weight:700;letter-spacing:.08em;
  color:var(--rp-ink);background:var(--rp-accent);padding:4px 12px;margin-bottom:16px}
.rp-title{font-size:var(--rp-text-title);font-weight:800;letter-spacing:-0.02em;line-height:1.3}
.rp-subtitle{font-size:15px;color:var(--rp-ink-2);margin-top:8px;font-weight:500}
.rp-doc-info{display:flex;flex-wrap:wrap;border-bottom:1px solid var(--rp-line);font-size:12.5px}
.rp-doc-info div{padding:11px 22px 11px 0;margin-right:22px}
.rp-doc-info dt{color:var(--rp-ink-3);font-weight:600;font-size:11px;margin-bottom:3px}
.rp-doc-info dd{font-weight:600}

/* ── 4. 섹션 ─────────────────────────────────── */
.rp-section{margin-top:44px}
.rp-sec-head{display:flex;align-items:baseline;gap:12px;padding-bottom:10px;
  border-bottom:2px solid var(--rp-ink);margin-bottom:20px}
.rp-sec-no{font-size:15px;font-weight:800;background:var(--rp-accent);padding:1px 8px}
.rp-sec-title{font-size:var(--rp-text-h2);font-weight:800}
.rp-sec-en{margin-left:auto;font-size:11px;color:var(--rp-ink-3);font-weight:600;letter-spacing:.05em}
.rp-subsec{font-size:var(--rp-text-h3);font-weight:800;margin:26px 0 12px;
  padding-left:10px;border-left:3px solid var(--rp-accent)}
.rp-text{font-size:var(--rp-text-body);line-height:1.8;color:var(--rp-ink-2);margin-bottom:12px}
.rp-text b{color:var(--rp-ink);font-weight:700}

/* ── 5. 요약 · 시사점 박스 ───────────────────── */
.rp-summary{background:var(--rp-accent-light);border:1px solid var(--rp-accent-line);
  padding:18px 22px;margin-bottom:22px}
.rp-summary-label{font-size:12px;font-weight:800;letter-spacing:.06em;margin-bottom:9px}
.rp-summary ul{list-style:none}
.rp-summary li{font-size:13.5px;line-height:1.75;font-weight:500;padding-left:14px;position:relative}
.rp-summary li::before{content:"■";position:absolute;left:0;font-size:8px;line-height:2.9}
.rp-insight{background:var(--rp-surface);border-left:3px solid var(--rp-ink);
  padding:13px 18px;margin-top:16px;font-size:13px;line-height:1.7;color:var(--rp-ink-2)}
.rp-insight-label{font-weight:800;color:var(--rp-ink);margin-right:8px}

/* ── 6. KPI 격자 ─────────────────────────────── */
.rp-kpi-strip{display:grid;grid-template-columns:repeat(4,1fr);
  border:1px solid var(--rp-line);border-bottom:none}
.rp-kpi-strip > div{padding:16px 18px;border-bottom:1px solid var(--rp-line);
  border-right:1px solid var(--rp-line)}
.rp-kpi-strip > div:nth-child(4n){border-right:none}
.rp-kpi-l{font-size:11.5px;font-weight:600;color:var(--rp-ink-3)}
.rp-kpi-v{font-size:var(--rp-text-kpi);font-weight:800;margin-top:6px;
  font-variant-numeric:tabular-nums;letter-spacing:-0.02em}
.rp-kpi-v small{font-size:12px;font-weight:700;margin-left:6px}
.rp-kpi-v small.pos{color:var(--rp-up)}
.rp-kpi-v small.neg{color:var(--rp-down)}
.rp-kpi-s{font-size:11px;color:var(--rp-ink-3);margin-top:4px}

/* ── 7. 표 ───────────────────────────────────── */
.rp-tbl{width:100%;border-collapse:collapse;font-size:var(--rp-text-tbl);
  border-top:2px solid var(--rp-ink)}
.rp-tbl thead th{background:var(--rp-surface);font-size:11.5px;font-weight:700;
  color:var(--rp-ink-2);text-align:right;padding:9px 10px;
  border-bottom:1px solid var(--rp-line-strong);white-space:nowrap}
.rp-tbl thead th:first-child{text-align:left}
.rp-tbl td{padding:10px;text-align:right;border-bottom:1px solid var(--rp-line);
  font-weight:500;font-variant-numeric:tabular-nums;white-space:nowrap}
.rp-tbl td:first-child{text-align:left;font-weight:700}
.rp-tbl .up{color:var(--rp-up);font-weight:700}
.rp-tbl .down{color:var(--rp-down);font-weight:700}
.rp-tbl .muted{color:var(--rp-ink-3);font-weight:400}
.rp-tbl tr.total td{background:var(--rp-surface);font-weight:800;
  border-top:1px solid var(--rp-line-strong)}
.rp-tbl tr.hl td{background:var(--rp-accent-light)}   /* 강조 행 — 표당 1행 */
.rp-tbl-note{font-size:var(--rp-text-cap);color:var(--rp-ink-3);margin-top:7px}
.rp-bdot{display:inline-block;width:9px;height:9px;margin-right:8px}

/* ── 8. 그림(차트) 프레임 ────────────────────── */
.rp-fig{border:1px solid var(--rp-line)}
.rp-fig-head{display:flex;justify-content:space-between;align-items:center;
  padding:11px 16px;border-bottom:1px solid var(--rp-line);background:#FBFBFC}
.rp-fig-title{font-size:12.5px;font-weight:800}
.rp-fig-no{color:var(--rp-ink-3);font-weight:700;margin-right:8px}
.rp-fig-unit{font-size:11px;color:var(--rp-ink-3);font-weight:500}
.rp-fig-body{padding:16px}

/* ── 9. 100% 스택바 (라벨 내장형) ────────────── */
.rp-stack{display:flex;height:22px;border:1px solid var(--rp-line);margin-bottom:10px}
.rp-stack div{height:100%;display:flex;align-items:center;justify-content:center;
  font-size:10.5px;font-weight:800;overflow:hidden;white-space:nowrap}
.rp-stack-legend{display:flex;flex-wrap:wrap;gap:8px 18px;
  font-size:11.5px;font-weight:600;color:var(--rp-ink-2)}
.rp-stack-legend span{display:flex;align-items:center;gap:6px}
.rp-stack-legend i{width:10px;height:10px;font-style:normal}

/* ── 10. 액션 테이블 · 우선순위 배지 ─────────── */
.rp-action-tbl td{text-align:left;white-space:normal;line-height:1.55}
.rp-prio{display:inline-block;font-size:10.5px;font-weight:800;padding:2px 8px;border:1px solid}
.rp-prio.h{color:var(--rp-up);border-color:var(--rp-up)}
.rp-prio.m{color:var(--rp-ink-2);border-color:var(--rp-line-strong)}
.rp-prio.l{color:var(--rp-ink-3);border-color:var(--rp-line)}

/* ── 11. 레이아웃 그리드 ─────────────────────── */
.rp-grid-2{display:grid;grid-template-columns:1fr 1fr;gap:18px}
.rp-grid-53{display:grid;grid-template-columns:1fr 1.15fr;gap:18px;align-items:start}

/* ── 12. 푸터 ────────────────────────────────── */
.rp-footer{margin-top:48px;padding-top:14px;border-top:1px solid var(--rp-line);
  display:flex;justify-content:space-between;font-size:11px;color:var(--rp-ink-3)}

/* ── 13. 반응형 · 인쇄 ───────────────────────── */
@media (max-width:820px){
  .rp-inner{padding:32px 22px}
  .rp-kpi-strip{grid-template-columns:1fr 1fr}
  .rp-kpi-strip > div:nth-child(2n){border-right:none}
  .rp-grid-2,.rp-grid-53{grid-template-columns:1fr}
  .rp-title{font-size:24px}
}
@media print{
  .rp-body{background:#fff}
  .rp-page{border:none;box-shadow:none;margin:0;max-width:100%}
  .rp-section{break-inside:avoid-page}
  .rp-fig,.rp-tbl,.rp-summary{break-inside:avoid}
}
`;
export const ATELIER_CSS = `/* ============================================================
   ATELIER Design System — Tokens v0.1
   다크 에디토리얼 · 웹 플랫폼 & 보고용 대시보드 공용
   구조: Primitive(원시값) → Semantic(의미) → Component(컴포넌트)
   ============================================================ */

:root {
  /* ---------- 1. Primitive · Color ---------- */
  /* Espresso — 웜 톤 다크 뉴트럴 */
  --espresso-950: #131110;
  --espresso-900: #1C1917;
  --espresso-800: #242019;
  --espresso-700: #2E2A25;
  --espresso-600: #3C362E;
  --espresso-500: #55503F;
  --espresso-400: #6E675D;
  --espresso-300: #8D8577;
  --espresso-200: #A69E92;
  --espresso-100: #CFC8BD;
  --espresso-50:  #EDE8E0;

  /* Gold — 브랜드 · 인터랙션 */
  --gold-100: #F1E3C8;
  --gold-200: #E8D3A8;
  --gold-300: #DFC391;
  --gold-400: #D4B27A;
  --gold-500: #C9A265;
  --gold-600: #B08949;
  --gold-700: #8F6D36;
  --gold-800: #6E5228;

  /* Status & Accent */
  --mint-400:  #7AD4B0;
  --mint-500:  #5FC79E;
  --coral-400: #EC8A78;
  --coral-500: #E5735F;
  --amber-500: #D98E3B;
  --lilac-500: #A78FD6;
  --sky-500:   #6FA8C9;
  --rose-500:  #CE7B96;

  /* ---------- 2. Semantic · Color ---------- */
  --color-bg:             var(--espresso-950);
  --color-surface:        var(--espresso-900);
  --color-surface-raised: var(--espresso-800);
  --color-border:         var(--espresso-700);
  --color-border-strong:  var(--espresso-600);
  --color-hairline:       var(--gold-700);        /* 시그니처 골드 헤어라인 */

  --color-text-primary:   var(--espresso-50);
  --color-text-secondary: var(--espresso-200);
  --color-text-tertiary:  var(--espresso-400);
  --color-text-on-gold:   var(--espresso-950);

  --color-primary:        var(--gold-500);
  --color-primary-hover:  var(--gold-400);
  --color-primary-active: var(--gold-600);
  --color-primary-subtle: rgba(201, 162, 101, 0.12);

  --color-success:        var(--mint-500);
  --color-danger:         var(--coral-500);
  --color-warning:        var(--amber-500);

  /* 증감 표기 — 기본: 상승=민트 / 하락=코랄
     국내 금융 관례 필요 시 increase=coral, decrease=sky 로 교체 */
  --color-increase: var(--mint-500);
  --color-decrease: var(--coral-500);

  /* 데이터 시각화 · 범주형 8색 (다크 배경 대비 확보) */
  --chart-1: var(--gold-500);
  --chart-2: var(--mint-500);
  --chart-3: var(--lilac-500);
  --chart-4: var(--coral-500);
  --chart-5: var(--sky-500);
  --chart-6: var(--rose-500);
  --chart-7: var(--espresso-300);
  --chart-8: var(--gold-200);
  --chart-grid: var(--espresso-800);
  --chart-axis: var(--espresso-400);

  /* ---------- 3. Typography ---------- */
  --font-family-display: "Noto Serif KR", "Nanum Myeongjo", serif;
  --font-family-base: "Pretendard Variable", Pretendard, -apple-system,
                      system-ui, sans-serif;
  --font-family-mono: "SF Mono", ui-monospace, monospace;

  /* 텍스트 스케일 — 제목은 세리프, 본문·숫자는 산세리프 */
  --text-display-1: 600 38px/52px var(--font-family-display);
  --text-display-2: 600 30px/42px var(--font-family-display);
  --text-heading-1: 600 23px/34px var(--font-family-display);
  --text-heading-2: 600 19px/28px var(--font-family-display);
  --text-heading-3: 600 16px/24px var(--font-family-base);
  --text-body-1:    400 15px/24px var(--font-family-base);
  --text-body-2:    400 13.5px/21px var(--font-family-base);
  --text-caption:   400 12px/17px var(--font-family-base);
  --text-label:     600 11px/16px var(--font-family-base);   /* 소문자 대신 자간으로 격 부여 */
  --letter-spacing-label: 0.12em;

  /* 숫자 전용 — 얇은 대형 숫자가 이 시스템의 인상 */
  --text-data-xl: 300 40px/48px var(--font-family-base);
  --text-data-lg: 300 32px/40px var(--font-family-base);
  --text-data-md: 400 20px/28px var(--font-family-base);
  --text-data-sm: 500 13px/18px var(--font-family-base);
  --font-feature-data: "tnum" 1;
  --letter-spacing-data: -0.01em;

  /* ---------- 4. Spacing (4px base, 여백은 넉넉하게) ---------- */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;
  --space-20: 80px;

  /* ---------- 5. Shape ----------
     라운드는 최소화 — 형태는 각지게, 위계는 표면 밝기로 */
  --radius-none: 0px;
  --radius-sm: 2px;
  --radius-md: 4px;
  --radius-full: 999px;

  /* 다크에서는 그림자 대신 표면 단계(surface level)로 높이를 표현 */
  --elevation-0: var(--color-bg);
  --elevation-1: var(--color-surface);
  --elevation-2: var(--color-surface-raised);
  --overlay-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);   /* 모달·팝오버 한정 */

  --focus-ring: 0 0 0 2px var(--espresso-950), 0 0 0 4px var(--gold-500);

  /* ---------- 6. Motion ---------- */
  --duration-fast: 140ms;
  --duration-base: 240ms;
  --duration-slow: 400ms;
  --easing-standard: cubic-bezier(0.25, 0, 0, 1);

  /* ---------- 7. Component ---------- */
  --control-height-sm: 32px;
  --control-height-md: 42px;
  --control-height-lg: 50px;
  --control-padding-x: 18px;
  --control-font-size: 13.5px;

  --card-padding: var(--space-8);
  --card-gap: var(--space-5);

  --table-row-height: 52px;
  --table-padding-x: var(--space-4);
  --table-font-size: 13.5px;

  --kpi-value-size: 34px;
  --kpi-value-weight: 300;
  --section-gap: var(--space-16);
}
`;
