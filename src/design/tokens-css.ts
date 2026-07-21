// 자동 생성물: 디자인시스템 tokens.css 임베드. 직접 수정하지 말 것.
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
export const PRISM_CSS = `/* ============================================================
   PRISM Design System — Tokens v0.1
   리퀴드 글래스 · 오로라 그라디언트 · 벤토 그리드
   웹 플랫폼 & 보고용 대시보드 공용
   구조: Primitive(원시값) → Semantic(의미) → Component(컴포넌트)
   ============================================================ */

:root {
  /* ---------- 1. Primitive · Color ---------- */
  /* Neutral — 살짝 보랏빛이 도는 쿨 그레이 */
  --neutral-0:   #FFFFFF;
  --neutral-50:  #F5F6FA;
  --neutral-100: #EDEEF5;
  --neutral-200: #DFE1EC;
  --neutral-300: #C6C9DA;
  --neutral-400: #9EA3B8;
  --neutral-500: #757B91;
  --neutral-600: #5B616E;
  --neutral-700: #3F4450;
  --neutral-800: #282C36;
  --neutral-900: #16181D;

  /* Violet — 브랜드 축 1 */
  --violet-100: #EDE8FF;
  --violet-300: #B7A6FB;
  --violet-500: #7C5CFC;
  --violet-600: #6847E6;
  --violet-700: #5637C4;

  /* Blue — 브랜드 축 2 (그라디언트 페어) */
  --blue-100: #E3EEFF;
  --blue-300: #93BEFA;
  --blue-500: #4D7CFE;
  --blue-600: #3B64E0;

  /* Accent & Status */
  --pink-500:  #F16BB9;
  --teal-500:  #22C5B8;
  --orange-500:#FF8A4C;
  --lime-500:  #9ADB3C;
  --green-500: #22B573;
  --green-100: #E3F8EE;
  --red-500:   #F45B69;
  --red-100:   #FEE9EB;
  --amber-500: #F5A623;
  --amber-100: #FEF3DD;

  /* ---------- 2. Gradient (시그니처) ---------- */
  --gradient-brand: linear-gradient(120deg, #7C5CFC 0%, #4D7CFE 100%);
  --gradient-brand-soft: linear-gradient(120deg, rgba(124,92,252,.14), rgba(77,124,254,.14));
  --gradient-text: linear-gradient(110deg, #6847E6 10%, #4D7CFE 60%, #22C5B8 110%);
  --gradient-aurora-1: radial-gradient(closest-side, rgba(124,92,252,.30), transparent);
  --gradient-aurora-2: radial-gradient(closest-side, rgba(77,124,254,.26), transparent);
  --gradient-aurora-3: radial-gradient(closest-side, rgba(241,107,185,.20), transparent);

  /* ---------- 3. Semantic · Color ---------- */
  --color-bg:            var(--neutral-50);
  --color-text-primary:  var(--neutral-900);
  --color-text-secondary:var(--neutral-600);
  --color-text-tertiary: var(--neutral-400);
  --color-text-inverse:  #FFFFFF;

  --color-primary:        var(--violet-500);
  --color-primary-hover:  var(--violet-600);
  --color-primary-active: var(--violet-700);
  --color-primary-subtle: var(--violet-100);

  --color-success: var(--green-500);
  --color-danger:  var(--red-500);
  --color-warning: var(--amber-500);

  /* 증감 표기 — 기본: 상승=그린 / 하락=레드
     국내 금융 관례 필요 시 두 값만 교체 */
  --color-increase: var(--green-500);
  --color-decrease: var(--red-500);

  /* ---------- 4. Glass (시그니처 표면) ---------- */
  --glass-bg: rgba(255, 255, 255, 0.62);
  --glass-bg-strong: rgba(255, 255, 255, 0.82);
  --glass-border: rgba(255, 255, 255, 0.75);
  --glass-blur: 20px;
  --glass-shadow: 0 8px 32px rgba(60, 66, 110, 0.10);
  --glass-shadow-hover: 0 14px 44px rgba(60, 66, 110, 0.16);
  --color-border: rgba(22, 24, 29, 0.08);
  --color-border-strong: rgba(22, 24, 29, 0.14);

  /* 데이터 시각화 · 범주형 8색 (고채도, 밝은 배경 대비) */
  --chart-1: var(--violet-500);
  --chart-2: var(--blue-500);
  --chart-3: var(--teal-500);
  --chart-4: var(--pink-500);
  --chart-5: var(--orange-500);
  --chart-6: var(--lime-500);
  --chart-7: var(--neutral-400);
  --chart-8: var(--violet-300);
  --chart-grid: rgba(22, 24, 29, 0.06);
  --chart-axis: var(--neutral-400);

  /* ---------- 5. Typography ---------- */
  --font-family-base: "Pretendard Variable", Pretendard, -apple-system,
                      system-ui, sans-serif;
  --font-family-mono: "SF Mono", ui-monospace, monospace;

  --text-display-1: 800 42px/52px var(--font-family-base);
  --text-display-2: 800 32px/40px var(--font-family-base);
  --text-heading-1: 700 24px/32px var(--font-family-base);
  --text-heading-2: 700 20px/28px var(--font-family-base);
  --text-heading-3: 600 16px/24px var(--font-family-base);
  --text-body-1:    400 15px/23px var(--font-family-base);
  --text-body-2:    400 14px/21px var(--font-family-base);
  --text-caption:   500 12px/17px var(--font-family-base);

  /* 숫자 전용 — 크고 또렷하게, 히어로 지표는 그라디언트 텍스트 허용 */
  --text-data-xl: 800 36px/44px var(--font-family-base);
  --text-data-lg: 700 28px/36px var(--font-family-base);
  --text-data-md: 700 20px/28px var(--font-family-base);
  --text-data-sm: 600 13px/18px var(--font-family-base);
  --font-feature-data: "tnum" 1;
  --letter-spacing-data: -0.02em;
  --letter-spacing-heading: -0.02em;

  /* ---------- 6. Spacing (4px base) ---------- */
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

  /* ---------- 7. Shape — 넉넉한 라운드 ---------- */
  --radius-sm: 12px;
  --radius-md: 18px;
  --radius-lg: 24px;
  --radius-full: 999px;

  --focus-ring: 0 0 0 3px rgba(124, 92, 252, 0.35);

  /* ---------- 8. Motion — 탄성 있는 마이크로 인터랙션 ---------- */
  --duration-fast: 150ms;
  --duration-base: 250ms;
  --duration-slow: 450ms;
  --easing-standard: cubic-bezier(0.3, 0, 0, 1);
  --easing-spring: cubic-bezier(0.34, 1.56, 0.64, 1);

  /* ---------- 9. Component ---------- */
  --control-height-sm: 34px;
  --control-height-md: 42px;
  --control-height-lg: 50px;
  --control-padding-x: 18px;
  --control-font-size: 14px;

  --card-padding: var(--space-6);
  --card-gap: var(--space-4);
  --bento-gap: var(--space-4);       /* 벤토 그리드 타일 간격 */

  --table-row-height: 48px;
  --table-padding-x: var(--space-4);
  --table-font-size: 14px;

  --kpi-value-size: 30px;
  --section-gap: var(--space-12);
}
`;
export const PUNCH_CSS = `/* ============================================================
   PUNCH Design System — Tokens v0.1
   네오 브루탈리즘 · 두꺼운 보더 · 하드 오프셋 섀도
   웹 플랫폼 & 보고용 대시보드 공용
   구조: Primitive(원시값) → Semantic(의미) → Component(컴포넌트)
   ============================================================ */

:root {
  /* ---------- 1. Primitive · Color ---------- */
  /* Ink & Paper */
  --ink-900: #101010;      /* 보더·텍스트·섀도의 단일 잉크 */
  --ink-700: #3A3A3A;
  --ink-500: #6B6B6B;
  --ink-300: #A8A49B;
  --ink-150: #DFDACD;
  --paper-0:  #FFFFFF;
  --paper-50: #FAF5EA;     /* 페이지 배경 */
  --paper-100:#F1EADB;

  /* Pop — 고채도 플랫 컬러 */
  --yellow-500: #FFD43D;   /* 주역 */
  --yellow-300: #FFE787;
  --pink-500:   #FF90C8;
  --cyan-500:   #5FD9EA;
  --blue-500:   #4D9DE0;
  --green-500:  #5ED97E;
  --orange-500: #FF8552;
  --purple-500: #B79CFF;
  --red-500:    #FF5D5D;

  /* ---------- 2. Semantic · Color ---------- */
  --color-bg:           var(--paper-50);
  --color-surface:      var(--paper-0);
  --color-surface-sub:  var(--paper-100);
  --color-border:       var(--ink-900);   /* 보더는 항상 잉크색 */
  --color-border-muted: var(--ink-150);

  --color-text-primary:   var(--ink-900);
  --color-text-secondary: var(--ink-500);
  --color-text-tertiary:  var(--ink-300);

  --color-primary:        var(--yellow-500);   /* 배경형 프라이머리 — 텍스트는 잉크 */
  --color-primary-hover:  var(--yellow-300);
  --color-primary-text:   var(--ink-900);
  --color-accent:         var(--pink-500);

  --color-success: var(--green-500);
  --color-danger:  var(--red-500);
  --color-warning: var(--orange-500);

  /* 증감 표기 — 기본: 상승=그린 / 하락=레드
     국내 금융 관례 필요 시 두 값만 교체 */
  --color-increase: #1FA34A;    /* 텍스트용 진한 그린 */
  --color-decrease: #E03131;    /* 텍스트용 진한 레드 */

  /* 데이터 시각화 · 범주형 8색 (플랫 + 잉크 아웃라인 전제) */
  --chart-1: var(--yellow-500);
  --chart-2: var(--cyan-500);
  --chart-3: var(--pink-500);
  --chart-4: var(--green-500);
  --chart-5: var(--purple-500);
  --chart-6: var(--orange-500);
  --chart-7: var(--blue-500);
  --chart-8: var(--ink-300);
  --chart-outline: var(--ink-900);   /* 모든 도형은 잉크 아웃라인을 두른다 */
  --chart-grid: var(--ink-150);
  --chart-axis: var(--ink-500);

  /* ---------- 3. Typography ---------- */
  --font-family-base: "Pretendard Variable", Pretendard, -apple-system,
                      system-ui, sans-serif;
  --font-family-mono: "SF Mono", ui-monospace, monospace;

  /* 제목은 최대 웨이트로 뭉툭하게 */
  --text-display-1: 900 42px/50px var(--font-family-base);
  --text-display-2: 900 32px/38px var(--font-family-base);
  --text-heading-1: 800 24px/30px var(--font-family-base);
  --text-heading-2: 800 20px/26px var(--font-family-base);
  --text-heading-3: 700 16px/22px var(--font-family-base);
  --text-body-1:    500 15px/23px var(--font-family-base);
  --text-body-2:    500 14px/21px var(--font-family-base);
  --text-caption:   600 12px/16px var(--font-family-base);
  --text-label:     800 11px/15px var(--font-family-base);  /* 대문자 + 자간 */
  --letter-spacing-label: 0.08em;
  --letter-spacing-heading: -0.02em;

  /* 숫자 전용 */
  --text-data-xl: 900 36px/42px var(--font-family-base);
  --text-data-lg: 800 28px/34px var(--font-family-base);
  --text-data-md: 800 20px/26px var(--font-family-base);
  --text-data-sm: 700 13px/18px var(--font-family-base);
  --font-feature-data: "tnum" 1;
  --letter-spacing-data: -0.02em;

  /* 마커 하이라이트 — 시그니처 강조 */
  --highlight-yellow: linear-gradient(transparent 55%, var(--yellow-500) 55%, var(--yellow-500) 92%, transparent 92%);
  --highlight-pink:   linear-gradient(transparent 55%, var(--pink-500) 55%, var(--pink-500) 92%, transparent 92%);

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

  /* ---------- 5. Shape — 두꺼운 보더 + 하드 섀도 (시그니처) ---------- */
  --border-width: 2px;
  --border-width-bold: 3px;
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-full: 999px;

  /* 하드 오프셋 섀도 — 블러 0, 잉크색 단색 */
  --shadow-punch-sm: 3px 3px 0 var(--ink-900);
  --shadow-punch:    5px 5px 0 var(--ink-900);
  --shadow-punch-lg: 8px 8px 0 var(--ink-900);
  --shadow-pressed:  1px 1px 0 var(--ink-900);

  --focus-ring: 0 0 0 3px var(--paper-50), 0 0 0 6px var(--blue-500);

  /* ---------- 6. Motion — 짧고 경쾌하게 ---------- */
  --duration-fast: 100ms;
  --duration-base: 160ms;
  --easing-standard: cubic-bezier(0.2, 0, 0.4, 1);

  /* 스티커 회전 — 배지·라벨의 장난기 */
  --tilt-1: rotate(-2deg);
  --tilt-2: rotate(1.5deg);

  /* ---------- 7. Component ---------- */
  --control-height-sm: 34px;
  --control-height-md: 44px;
  --control-height-lg: 52px;
  --control-padding-x: 18px;
  --control-font-size: 14px;

  --card-padding: var(--space-6);
  --card-gap: var(--space-5);      /* 하드 섀도 공간 확보를 위해 여유 있게 */

  --table-row-height: 48px;
  --table-padding-x: var(--space-4);
  --table-font-size: 14px;

  --kpi-value-size: 32px;
  --section-gap: var(--space-12);
}
`;
export const MOCHI_CSS = `/* ============================================================
   MOCHI Design System — Tokens v0.1
   말랑 파스텔 · 풀 라운드 · 바운시 모션
   웹 플랫폼 & 보고용 대시보드 공용
   구조: Primitive(원시값) → Semantic(의미) → Component(컴포넌트)
   ============================================================ */

:root {
  /* ---------- 1. Primitive · Color ---------- */
  /* Cocoa — 검정 대신 따뜻한 브라운 뉴트럴 */
  --cocoa-900: #453A36;      /* 본문 텍스트 — 순검정 금지 */
  --cocoa-700: #6B5D57;
  --cocoa-500: #94857E;
  --cocoa-300: #C4B8B1;
  --cocoa-150: #E8DFD9;
  --cream-0:   #FFFFFF;
  --cream-50:  #FFF8F1;      /* 페이지 배경 */
  --cream-100: #FDF0E4;

  /* Pastel — 말랑 파스텔 */
  --peach-100: #FFE3E8;
  --peach-300: #FFB8C6;
  --peach-500: #FF8FA8;      /* 주역 */
  --peach-600: #F06D8C;
  --peach-700: #D14E70;
  --mint-100:  #DDF6EC;
  --mint-300:  #A8E8CE;
  --mint-500:  #6DD4AC;
  --mint-600:  #45B98D;
  --butter-100:#FFF3D1;
  --butter-500:#FFD880;
  --butter-600:#F5B942;
  --lavender-100:#EEE9FF;
  --lavender-500:#B8A8F0;
  --sky-100:   #DFF1FC;
  --sky-500:   #8CCBEF;
  --strawberry-500: #F2788F; /* 감소·위험 텍스트용 */

  /* ---------- 2. Semantic · Color ---------- */
  --color-bg:          var(--cream-50);
  --color-surface:     var(--cream-0);
  --color-surface-sub: var(--cream-100);
  --color-border:      var(--cocoa-150);
  --color-border-strong: var(--cocoa-300);

  --color-text-primary:   var(--cocoa-900);
  --color-text-secondary: var(--cocoa-700);
  --color-text-tertiary:  var(--cocoa-500);
  --color-text-inverse:   #FFFFFF;

  --color-primary:        var(--peach-500);
  --color-primary-hover:  var(--peach-300);
  --color-primary-active: var(--peach-600);
  --color-primary-subtle: var(--peach-100);

  --color-success:        var(--mint-500);
  --color-success-subtle: var(--mint-100);
  --color-danger:         var(--strawberry-500);
  --color-danger-subtle:  var(--peach-100);
  --color-warning:        var(--butter-600);
  --color-warning-subtle: var(--butter-100);

  /* 증감 표기 — 텍스트 가독을 위해 진한 단계 사용
     국내 금융 관례 필요 시 두 값만 교체 */
  --color-increase: var(--mint-600);
  --color-decrease: #E25C7A;

  /* 데이터 시각화 · 파스텔 범주형 8색 */
  --chart-1: var(--peach-500);
  --chart-2: var(--mint-500);
  --chart-3: var(--butter-500);
  --chart-4: var(--lavender-500);
  --chart-5: var(--sky-500);
  --chart-6: var(--peach-300);
  --chart-7: var(--cocoa-300);
  --chart-8: var(--mint-300);
  --chart-grid: var(--cream-100);
  --chart-axis: var(--cocoa-500);

  /* ---------- 3. Typography ---------- */
  /* 제목은 동글동글한 Jua, 본문·숫자는 Pretendard */
  --font-family-display: "Jua", "Pretendard Variable", sans-serif;
  --font-family-base: "Pretendard Variable", Pretendard, -apple-system,
                      system-ui, sans-serif;
  --font-family-mono: "SF Mono", ui-monospace, monospace;

  --text-display-1: 400 40px/52px var(--font-family-display);
  --text-display-2: 400 30px/40px var(--font-family-display);
  --text-heading-1: 400 24px/32px var(--font-family-display);
  --text-heading-2: 400 20px/28px var(--font-family-display);
  --text-heading-3: 700 16px/23px var(--font-family-base);
  --text-body-1:    500 15px/24px var(--font-family-base);
  --text-body-2:    500 14px/21px var(--font-family-base);
  --text-caption:   600 12px/17px var(--font-family-base);

  /* 숫자 전용 — 통통하고 또렷하게 */
  --text-data-xl: 800 34px/42px var(--font-family-base);
  --text-data-lg: 800 27px/34px var(--font-family-base);
  --text-data-md: 700 20px/27px var(--font-family-base);
  --text-data-sm: 700 13px/18px var(--font-family-base);
  --font-feature-data: "tnum" 1;
  --letter-spacing-data: -0.01em;

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

  /* ---------- 5. Shape — 전부 둥글게 ---------- */
  --radius-sm: 14px;
  --radius-md: 20px;
  --radius-lg: 28px;
  --radius-full: 999px;
  /* 블롭 — 마스코트·장식용 비정형 라운드 */
  --radius-blob: 58% 42% 55% 45% / 52% 48% 52% 48%;

  /* 그림자도 파스텔 — 검정 그림자 금지 */
  --shadow-1: 0 3px 10px rgba(240, 109, 140, 0.10);
  --shadow-2: 0 6px 18px rgba(240, 109, 140, 0.14);
  --shadow-3: 0 12px 32px rgba(209, 78, 112, 0.18);

  --focus-ring: 0 0 0 4px rgba(255, 143, 168, 0.35);

  /* ---------- 6. Motion — 통통 튀게 ---------- */
  --duration-fast: 150ms;
  --duration-base: 280ms;
  --duration-slow: 500ms;
  --easing-standard: cubic-bezier(0.3, 0, 0, 1);
  --easing-bounce: cubic-bezier(0.34, 1.8, 0.5, 1);   /* 오버슈트 큰 스프링 */

  /* 말랑 스쿼시 — 누르면 찌그러진다 (시그니처) */
  --squish-press: scale(0.94, 0.9);
  --squish-hover: scale(1.04);

  /* ---------- 7. Component ---------- */
  --control-height-sm: 36px;
  --control-height-md: 44px;
  --control-height-lg: 52px;
  --control-padding-x: 20px;
  --control-font-size: 14px;

  --card-padding: var(--space-6);
  --card-gap: var(--space-4);

  --table-row-height: 50px;
  --table-padding-x: var(--space-4);
  --table-font-size: 14px;

  --kpi-value-size: 30px;
  --section-gap: var(--space-12);
}
`;
export const MEOK_CSS = `/* ============================================================
   MEOK (먹) Design System — Tokens v0.1
   한지 · 먹의 농담(濃淡) · 한국 전통색
   웹 플랫폼 & 보고용 대시보드 공용
   구조: Primitive(원시값) → Semantic(의미) → Component(컴포넌트)
   ============================================================ */

:root {
  /* ---------- 1. Primitive · Color ---------- */
  /* 한지(韓紙) — 배경 지물 */
  --hanji-0:   #FBF8F1;
  --hanji-50:  #F5F0E4;      /* 페이지 배경 */
  --hanji-100: #EDE6D5;
  --hanji-200: #E0D7C1;

  /* 먹(墨) — 농담 5단계가 곧 뉴트럴 스케일
     초묵(焦墨) > 농묵(濃墨) > 중묵(重墨) > 담묵(淡墨) > 청묵(淸墨) */
  --meok-900: #211C15;      /* 초묵 — 본문 텍스트 */
  --meok-700: #3D362A;      /* 농묵 */
  --meok-500: #635A48;      /* 중묵 — 보조 텍스트 */
  --meok-300: #968B74;      /* 담묵 */
  --meok-200: #B8AE9A;      /* 청묵 */
  --meok-100: #D9D1BD;      /* 획선(獲線) — 구분선 */

  /* 전통색 — 이름이 곧 토큰 */
  --jjok-700:  #22375C;      /* 쪽빛 진(津) */
  --jjok-500:  #2E4A7A;      /* 쪽빛 — 링크·포커스·선택 */
  --jjok-300:  #5C7BAB;      /* 옅은 쪽 */
  --jjok-100:  #DCE4F0;
  --inju-600:  #A33325;      /* 인주(印朱) 진 */
  --inju-500:  #BF3B2B;      /* 인주 — 낙관·위험·상승 */
  --inju-100:  #F4DDD7;
  --chija-500: #C99C3F;      /* 치자(梔子) — 경고 */
  --chija-100: #F3E8CD;
  --ok-500:    #7FA692;      /* 옥색(玉色) */
  --noerok-500:#4F7A5B;      /* 뇌록(磊綠) */
  --jaju-500:  #7B4B68;      /* 자주(紫朱) */

  /* ---------- 2. Semantic · Color ---------- */
  --color-bg:            var(--hanji-50);
  --color-surface:       var(--hanji-0);
  --color-surface-sub:   var(--hanji-100);
  --color-border:        var(--meok-100);
  --color-border-strong: var(--meok-200);

  --color-text-primary:   var(--meok-900);
  --color-text-secondary: var(--meok-500);
  --color-text-tertiary:  var(--meok-300);
  --color-text-inverse:   var(--hanji-0);

  /* 주요 행동은 먹 — 도장을 찍듯 */
  --color-primary:        var(--meok-900);
  --color-primary-hover:  var(--meok-700);
  --color-primary-active: #000000;
  --color-accent:         var(--jjok-500);     /* 링크·포커스·선택 상태 */
  --color-accent-subtle:  var(--jjok-100);

  --color-success:        var(--noerok-500);
  --color-success-subtle: #E4EDE6;
  --color-danger:         var(--inju-500);
  --color-danger-subtle:  var(--inju-100);
  --color-warning:        var(--chija-500);
  --color-warning-subtle: var(--chija-100);

  /* 증감 표기 — 이 시스템은 국내 관례가 기본:
     상승=인주(赤) / 하락=쪽(靑). 글로벌 관례 필요 시 두 값만 교체 */
  --color-increase: var(--inju-500);
  --color-decrease: var(--jjok-500);

  /* 데이터 시각화 · 전통색 범주형 8색 (한지 위 채도 절제) */
  --chart-1: var(--jjok-500);
  --chart-2: var(--inju-500);
  --chart-3: var(--chija-500);
  --chart-4: var(--noerok-500);
  --chart-5: var(--jaju-500);
  --chart-6: var(--ok-500);
  --chart-7: var(--meok-300);
  --chart-8: var(--jjok-300);
  --chart-grid: var(--hanji-100);
  --chart-axis: var(--meok-300);

  /* 인찰지(印札紙) — 옛 서책의 붉은 괘선. 표 전용 */
  --gwaeseon: rgba(191, 59, 43, 0.28);
  --gwaeseon-strong: rgba(191, 59, 43, 0.55);

  /* ---------- 3. Typography ---------- */
  /* 제목은 고운바탕(명조), 본문·숫자는 Pretendard */
  --font-family-display: "Gowun Batang", "Noto Serif KR", serif;
  --font-family-base: "Pretendard Variable", Pretendard, -apple-system,
                      system-ui, sans-serif;
  --font-family-mono: "SF Mono", ui-monospace, monospace;

  --text-display-1: 700 36px/52px var(--font-family-display);
  --text-display-2: 700 28px/42px var(--font-family-display);
  --text-heading-1: 700 22px/34px var(--font-family-display);
  --text-heading-2: 700 19px/30px var(--font-family-display);
  --text-heading-3: 700 16px/24px var(--font-family-base);
  --text-body-1:    400 15px/26px var(--font-family-base);
  --text-body-2:    400 14px/23px var(--font-family-base);
  --text-caption:   400 12px/18px var(--font-family-base);
  --line-height-loose: 1.75;      /* 서책의 행간 */

  /* 숫자 전용 */
  --text-data-xl: 600 34px/44px var(--font-family-base);
  --text-data-lg: 600 27px/36px var(--font-family-base);
  --text-data-md: 600 20px/28px var(--font-family-base);
  --text-data-sm: 600 13px/19px var(--font-family-base);
  --font-feature-data: "tnum" 1;
  --letter-spacing-data: -0.01em;

  /* 세로쓰기 — 구획 라벨의 시그니처 */
  --writing-vertical: vertical-rl;

  /* ---------- 4. Spacing (4px base · 여백은 화폭처럼) ---------- */
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

  /* ---------- 5. Shape — 종이의 형태 ---------- */
  --radius-sm: 3px;
  --radius-md: 6px;
  --radius-lg: 10px;
  --radius-full: 999px;
  --radius-seal: 6px;             /* 낙관 도장 */

  /* 그림자는 종이가 살짝 뜬 정도만 */
  --shadow-1: 0 1px 3px rgba(33, 28, 21, 0.07);
  --shadow-2: 0 3px 12px rgba(33, 28, 21, 0.09);
  --shadow-3: 0 10px 28px rgba(33, 28, 21, 0.14);

  --focus-ring: 0 0 0 3px rgba(46, 74, 122, 0.30);

  /* ---------- 6. Motion — 먹이 스미듯 ---------- */
  --duration-fast: 160ms;
  --duration-base: 280ms;
  --duration-slow: 520ms;
  --easing-standard: cubic-bezier(0.33, 0, 0.15, 1);   /* 스미는 감속 */

  /* ---------- 7. Component ---------- */
  --control-height-sm: 32px;
  --control-height-md: 40px;
  --control-height-lg: 48px;
  --control-padding-x: 18px;
  --control-font-size: 14px;

  --card-padding: var(--space-8);
  --card-gap: var(--space-5);

  --table-row-height: 50px;
  --table-padding-x: var(--space-4);
  --table-font-size: 14px;

  --kpi-value-size: 32px;
  --section-gap: var(--space-20);
}
`;
