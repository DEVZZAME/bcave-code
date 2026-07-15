// template1 디자인시스템 토큰·컴포넌트 CSS (원본: 사용자 제공 dashboard-tokens.css).
// /dashboard 결정론적 엔진이 이 CSS 를 인라인해 동일한 비주얼 언어로 대시보드를 조립한다.
export const TEMPLATE1_CSS = `/* ============================================================
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
