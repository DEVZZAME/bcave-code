// 7개 디자인 시스템 — 사용자가 화면/대시보드/HTML 을 만들 때마다 이 중 하나를 고른다.
// 규칙(토큰·컴포넌트)은 지키되, LLM 이 매번 레이아웃을 다르게 조립한다(고정 틀 금지).
// CSS 는 {{BCAVE_DS:<id>}} 자리표시자로 인라인(토큰 0).

import { BCAVE_CSS, AXIS_CSS, ATELIER_CSS, PRISM_CSS, PUNCH_CSS, MOCHI_CSS, MEOK_CSS } from "./tokens-css.js";

export interface DesignSystem {
  id: string; // "1".."7"
  key: string; // bcave | axis | atelier | prism | punch | mochi | meok
  label: string; // 선택지 표시
  css: string; // 토큰/컴포넌트 CSS
  guide: string; // 사용법(토큰형/컴포넌트형) + 배치 규칙
}

// 모든 시스템에 덧붙는 안전 보정(넘침·한글 줄바꿈). canvas 의 height 는 건드리지 않는다.
export const DS_SAFETY = `*{box-sizing:border-box}body{word-break:keep-all;overflow-wrap:break-word}img{max-width:100%}`;

// 표준 셸(GNB topbar + 컨테이너) — 토큰형(axis/atelier)의 쇼케이스에 정의된 공통 크롬.
// 토큰 CSS 엔 없어서 여기서 클래스로 제공한다(모든 페이지가 같은 GNB/구조 → 일관된 느낌).
const BCAVE_SHELL = `:root{--easing:var(--easing-standard);--font-mono:var(--font-family-mono)}
.wrap{max-width:1080px;margin:0 auto;padding:0 var(--space-6) var(--space-16)}
.topbar{position:sticky;top:0;z-index:20;background:rgba(255,255,255,.93);backdrop-filter:blur(10px);border-bottom:1px solid var(--color-border)}
.topbar-inner{max-width:1080px;margin:0 auto;padding:0 var(--space-6);height:58px;display:flex;align-items:center;gap:var(--space-4)}
.logo{display:flex;align-items:center;gap:10px;font-weight:900;font-size:16px;letter-spacing:.03em;color:var(--slate-800)}
.logo svg{display:block}
.topbar nav{display:flex;gap:2px;margin-left:auto;overflow-x:auto}
.topbar nav a{color:var(--ink-500);text-decoration:none;font-size:13px;font-weight:600;padding:7px 11px;border-radius:var(--radius-xs);white-space:nowrap;transition:all var(--duration-fast) var(--easing)}
.topbar nav a:hover{background:var(--slate-100);color:var(--slate-800)}
.hero{ margin-top:var(--space-8);background:var(--slate-800);border-radius:var(--radius-lg); padding:var(--space-16) var(--space-10) var(--space-12);color:#fff;box-shadow:var(--shadow-2); }
.hero .top{text-align:right}
.hero h1{font-size:36px;line-height:48px;font-weight:800}
.hero h1 .cave{display:inline-block;vertical-align:-2px;margin-right:10px}
.hero .rule{height:2px;background:#fff;margin:var(--space-5) 0 var(--space-3)}
.hero .dept{text-align:right;font-size:14px;font-weight:600;color:var(--slate-300)}
.hero .foot{display:flex;gap:8px;margin-top:var(--space-10);flex-wrap:wrap;align-items:center}
.hero .foot span{font-size:12px;font-weight:600;font-family:var(--font-mono);padding:5px 12px;border-radius:var(--radius-full);background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.16);color:var(--slate-200)}
.hero .foot em{font-style:normal;font-size:12px;color:var(--slate-400);margin-left:auto}
.sec-head{position:relative;padding-left:26px;margin-bottom:var(--space-6)}
.sec-head::before{content:"";position:absolute;left:0;top:-6px;width:11px;height:52px;background:var(--slate-800);border-radius:0 0 6px 6px}
.sec-head .kicker{font-size:13px;font-weight:500;color:var(--ink-500)}
.sec-head h2{font-size:26px;line-height:34px;font-weight:800;color:var(--color-text-strong);margin-top:2px}
.sec-head p{color:var(--ink-500);font-size:14px;margin-top:var(--space-2)}
@media(max-width:640px){.hero h1{font-size:25px;line-height:36px} .hero{padding:var(--space-10) var(--space-6)}}`;
const AXIS_SHELL = `.topbar{position:sticky;top:0;z-index:10;background:rgba(255,255,255,.85);backdrop-filter:blur(12px);border-bottom:1px solid var(--color-border)}
.topbar-inner{max-width:1040px;margin:0 auto;padding:0 var(--space-6);height:56px;display:flex;align-items:center;gap:var(--space-4)}
.logo{display:flex;align-items:center;gap:8px;font-weight:800;font-size:16px;letter-spacing:.02em;color:var(--color-text-primary)}
.topbar nav{display:flex;gap:var(--space-1);margin-left:auto;overflow-x:auto}
.topbar nav a{color:var(--color-text-secondary);text-decoration:none;font-size:13px;font-weight:500;padding:6px 10px;border-radius:var(--radius-sm);white-space:nowrap}
.topbar nav a:hover{background:var(--gray-100);color:var(--color-text-primary)}
.topbar nav a.on{background:var(--color-primary-subtle);color:var(--color-primary)}
.wrap{max-width:1040px;margin:0 auto;padding:var(--space-8) var(--space-6) var(--space-16)}
.hero{padding:var(--space-12) 0 var(--space-10)}
.hero .eyebrow{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:var(--color-primary);background:var(--color-primary-subtle);padding:5px 12px;border-radius:var(--radius-full)}
.hero h1{font:var(--text-display-1);letter-spacing:var(--letter-spacing-heading);margin:var(--space-5) 0 0}
.hero h1 em{color:var(--color-primary);font-style:normal}
.hero p{color:var(--color-text-secondary);margin-top:var(--space-4);max-width:620px}
.sec-head{margin:var(--section-gap) 0 var(--space-6);position:relative;padding-bottom:var(--space-3)}
.sec-head::after{content:"";position:absolute;left:0;bottom:0;width:100%;height:1px;background:var(--color-border)}
.sec-head::before{content:"";position:absolute;left:0;bottom:-4px;width:2px;height:9px;background:var(--color-primary)}
.sec-head .kicker{font-size:12px;font-weight:700;color:var(--color-primary);letter-spacing:.08em;text-transform:uppercase}
.sec-head h2{font:var(--text-heading-1);letter-spacing:var(--letter-spacing-heading);margin-top:2px}
.sec-head p{color:var(--color-text-secondary);font-size:14px;margin-top:var(--space-2)}`;
const ATELIER_SHELL = `.topbar{position:sticky;top:0;z-index:10;background:rgba(19,17,16,.88);backdrop-filter:blur(12px);border-bottom:1px solid var(--color-border)}
.topbar-inner{max-width:1020px;margin:0 auto;padding:0 var(--space-6);height:60px;display:flex;align-items:center;gap:var(--space-4)}
.logo{font-family:var(--font-family-display);font-weight:600;font-size:17px;letter-spacing:.16em;color:var(--color-text-primary);display:flex;align-items:center;gap:8px}
.topbar nav{display:flex;gap:2px;margin-left:auto;overflow-x:auto}
.topbar nav a{color:var(--color-text-secondary);text-decoration:none;font-size:13px;font-weight:500;padding:6px 10px;white-space:nowrap}
.topbar nav a:hover{color:var(--color-text-primary)}
.topbar nav a.on{color:var(--color-primary)}
.wrap{max-width:1020px;margin:0 auto;padding:var(--space-10) var(--space-6) var(--space-20)}
.overline{font-size:11px;font-weight:600;letter-spacing:.14em;color:var(--gold-500);text-transform:uppercase;display:block}
.hero{padding:var(--space-12) 0 var(--space-10)}
.hero .overline{margin-bottom:var(--space-5)}
.hero h1{font:var(--text-display-1);margin:0}
.hero h1 em{color:var(--color-primary);font-style:normal}
.hero p{color:var(--color-text-secondary);margin-top:var(--space-4);max-width:640px}
.sec-head{margin:var(--section-gap) 0 var(--space-8)}
.sec-head .overline{margin-bottom:var(--space-2)}
.sec-head h2{font:var(--text-heading-1);margin:0}
.sec-head p{color:var(--color-text-secondary);font-size:13.5px;margin-top:var(--space-3)}
.sec-head .hairline{margin-top:var(--space-5);height:1px;background:var(--color-border);position:relative}
.sec-head .hairline::before{content:"";position:absolute;left:0;top:0;width:64px;height:1px;background:var(--gold-600)}
.sec-head .hairline::after{content:"";position:absolute;left:0;top:3px;width:32px;height:1px;background:var(--gold-700)}
.page-head{padding:var(--space-2) 0 var(--space-10)}
.page-head h1{font:var(--text-display-2);margin:0}
.page-head p{color:var(--color-text-secondary);margin:var(--space-3) 0 0}`;
const PRISM_SHELL = `:root{--easing:var(--easing-standard)}
.wrap{max-width:1040px;margin:0 auto;padding:0 var(--space-6) var(--space-16)}
.topbar{position:sticky;top:12px;z-index:10;padding:0 var(--space-6)}
.topbar-inner{ max-width:1040px;margin:0 auto;height:56px; display:flex;align-items:center;gap:var(--space-4);padding:0 var(--space-5); background:var(--glass-bg-strong);backdrop-filter:blur(var(--glass-blur)); -webkit-backdrop-filter:blur(var(--glass-blur)); border:1px solid var(--glass-border);border-radius:var(--radius-full); box-shadow:var(--glass-shadow); }
.logo{display:flex;align-items:center;gap:9px;font-weight:800;font-size:16px}
.logo .mark{ width:24px;height:24px;border-radius:8px;background:var(--gradient-brand); display:flex;align-items:center;justify-content:center; }
.logo .mark svg{display:block}
.topbar nav{display:flex;gap:2px;margin-left:auto;overflow-x:auto}
.topbar nav a{ color:var(--color-text-secondary);text-decoration:none;font-size:13px;font-weight:600; padding:7px 12px;border-radius:var(--radius-full);white-space:nowrap; transition:all var(--duration-fast) var(--easing); }
.topbar nav a:hover{background:var(--color-primary-subtle);color:var(--violet-600)}
.hero{padding:var(--space-16) 0 var(--space-12)}
.hero .pill{ display:inline-flex;align-items:center;gap:7px;font-size:12.5px;font-weight:700; color:var(--violet-600);background:var(--glass-bg-strong); border:1px solid var(--glass-border);box-shadow:var(--glass-shadow); padding:7px 15px;border-radius:var(--radius-full);margin-bottom:var(--space-5); }
.hero .pill i{width:6px;height:6px;border-radius:50%;background:var(--gradient-brand);font-style:normal}
.hero h1{font-size:44px;line-height:54px;font-weight:800;letter-spacing:-0.02em}
.hero p{color:var(--color-text-secondary);margin-top:var(--space-5);max-width:600px}
.sec-head{margin-bottom:var(--space-6)}
.sec-head .kicker{ display:inline-block;font-size:12px;font-weight:700; background:var(--gradient-brand-soft);color:var(--violet-600); padding:4px 12px;border-radius:var(--radius-full);margin-bottom:var(--space-2); }
.sec-head h2{font-size:26px;line-height:34px;font-weight:800;letter-spacing:-0.02em}
.sec-head p{color:var(--color-text-secondary);font-size:14px;margin-top:var(--space-2)}
.grad-text{background:var(--gradient-text);-webkit-background-clip:text;background-clip:text;color:transparent}
@media(max-width:640px){.hero h1{font-size:31px;line-height:40px}}`;
const PUNCH_SHELL = `:root{--easing:var(--easing-standard);--bw:var(--border-width);--bw-bold:var(--border-width-bold)}
.wrap{max-width:1040px;margin:0 auto;padding:0 var(--space-6) var(--space-16)}
.topbar{position:sticky;top:0;z-index:10;background:var(--paper-50);border-bottom:var(--bw-bold) solid var(--ink-900)}
.topbar-inner{ max-width:1040px;margin:0 auto;padding:0 var(--space-6); height:60px;display:flex;align-items:center;gap:var(--space-4); }
.logo{display:flex;align-items:center;gap:10px;font-weight:900;font-size:17px;letter-spacing:-0.01em}
.logo .mark{ width:28px;height:28px;background:var(--yellow-500); border:var(--bw) solid var(--ink-900);border-radius:8px; box-shadow:var(--shadow-punch-sm); display:flex;align-items:center;justify-content:center;font-size:15px; transform:var(--tilt-1); }
.topbar nav{display:flex;gap:6px;margin-left:auto;overflow-x:auto;padding:8px 0}
.topbar nav a{ color:var(--ink-900);text-decoration:none;font-size:13px;font-weight:800; padding:6px 12px;border:var(--bw) solid transparent;border-radius:var(--radius-full); white-space:nowrap;transition:all var(--duration-fast) var(--easing); }
.topbar nav a:hover{border-color:var(--ink-900);background:var(--paper-0);box-shadow:var(--shadow-punch-sm)}
.hero{padding:var(--space-16) 0 var(--space-12);position:relative}
.hero .sticker{ display:inline-block;font-size:12px;font-weight:900;letter-spacing:.06em; background:var(--pink-500);border:var(--bw) solid var(--ink-900); border-radius:var(--radius-full);padding:6px 14px;margin-bottom:var(--space-5); box-shadow:var(--shadow-punch-sm);transform:var(--tilt-2); }
.hero h1{font-size:46px;line-height:54px;font-weight:900;letter-spacing:-0.02em}
.hero p{color:var(--ink-500);margin-top:var(--space-5);max-width:600px;font-weight:500}
.sec-head{margin-bottom:var(--space-8);display:flex;align-items:baseline;gap:var(--space-4);flex-wrap:wrap}
.sec-head .tag{ font-size:11px;font-weight:900;letter-spacing:.08em;text-transform:uppercase; background:var(--ink-900);color:var(--paper-50); padding:5px 11px;border-radius:6px;transform:var(--tilt-1);flex-shrink:0; }
.sec-head h2{font-size:27px;line-height:34px;font-weight:900;letter-spacing:-0.02em}
.sec-head p{color:var(--ink-500);font-size:14px;flex-basis:100%;margin-top:2px}
.hl{background:var(--highlight-yellow);padding:0 3px}
.hl-pink{background:var(--highlight-pink);padding:0 3px}
@media(max-width:640px){.hero h1{font-size:32px;line-height:40px}}`;
const MOCHI_SHELL = `:root{--easing:var(--easing-standard);--font-display:var(--font-family-display)}
.wrap{max-width:1040px;margin:0 auto;padding:0 var(--space-6) var(--space-16)}
.topbar{position:sticky;top:12px;z-index:10;padding:0 var(--space-6)}
.topbar-inner{ max-width:1040px;margin:0 auto;height:58px; display:flex;align-items:center;gap:var(--space-4);padding:0 var(--space-5); background:var(--cream-0);border-radius:var(--radius-full); box-shadow:var(--shadow-2); }
.logo{display:flex;align-items:center;gap:10px;font-family:var(--font-display);font-size:18px;letter-spacing:.02em}
.logo .blob{ width:32px;height:32px;background:var(--peach-500); border-radius:var(--radius-blob);position:relative;flex-shrink:0; transition:transform var(--duration-base) var(--easing-bounce); }
.logo:hover .blob{transform:rotate(-8deg) scale(1.1)}
.logo .blob::before{ content:"";position:absolute;top:12px;left:8px;width:4px;height:5px; background:var(--cocoa-900);border-radius:50%; box-shadow:12px 0 0 var(--cocoa-900); }
.logo .blob::after{ content:"";position:absolute;top:19px;left:5px;width:5px;height:3px; background:rgba(255,255,255,.55);border-radius:50%; box-shadow:17px 0 0 rgba(255,255,255,.55); }
.topbar nav{display:flex;gap:4px;margin-left:auto;overflow-x:auto}
.topbar nav a{ color:var(--cocoa-700);text-decoration:none;font-size:13px;font-weight:700; padding:8px 13px;border-radius:var(--radius-full);white-space:nowrap; transition:all var(--duration-fast) var(--easing); }
.topbar nav a:hover{background:var(--peach-100);color:var(--peach-700)}
.hero{padding:var(--space-16) 0 var(--space-12);position:relative;overflow:hidden}
.hero .pill{ display:inline-flex;align-items:center;gap:8px;font-size:12.5px;font-weight:800; color:var(--peach-700);background:var(--peach-100); padding:8px 16px;border-radius:var(--radius-full);margin-bottom:var(--space-5); }
.hero h1{font-size:42px;line-height:56px}
.hero h1 em{font-style:normal;color:var(--peach-600)}
.hero p{color:var(--cocoa-700);margin-top:var(--space-5);max-width:590px}
.hero .deco{position:absolute;border-radius:var(--radius-blob);opacity:.5;pointer-events:none}
.hero .d1{width:120px;height:120px;background:var(--mint-100);right:40px;top:40px;animation:float 7s ease-in-out infinite}
.hero .d2{width:76px;height:76px;background:var(--butter-100);right:190px;top:150px;animation:float 9s ease-in-out infinite reverse}
.hero .d3{width:56px;height:56px;background:var(--lavender-100);right:90px;top:210px;animation:float 8s ease-in-out infinite}
.sec-head{margin-bottom:var(--space-6);display:flex;align-items:center;gap:var(--space-3);flex-wrap:wrap}
.sec-head .dot{ width:14px;height:14px;background:var(--peach-500); border-radius:var(--radius-blob);flex-shrink:0; }
.sec-head h2{font-size:26px;line-height:34px}
.sec-head p{color:var(--cocoa-700);font-size:14px;flex-basis:100%;margin-top:2px;padding-left:26px}
@media(max-width:640px){.hero h1{font-size:30px;line-height:42px} .hero .deco{display:none}}`;
const MEOK_SHELL = `:root{--easing:var(--easing-standard);--font-display:var(--font-family-display)}
.wrap{max-width:1000px;margin:0 auto;padding:0 var(--space-6) var(--space-20)}
.topbar{position:sticky;top:0;z-index:10;background:rgba(245,240,228,.92);backdrop-filter:blur(8px);border-bottom:1px solid var(--meok-100)}
.topbar-inner{ max-width:1000px;margin:0 auto;padding:0 var(--space-6); height:58px;display:flex;align-items:center;gap:var(--space-4); }
.logo{display:flex;align-items:center;gap:11px;font-family:var(--font-display);font-weight:700;font-size:17px;letter-spacing:.24em}
.logo .seal{width:30px;height:30px;font-size:15px}
.topbar nav{display:flex;gap:2px;margin-left:auto;overflow-x:auto}
.topbar nav a{ color:var(--meok-500);text-decoration:none;font-size:13px;font-weight:500; padding:7px 12px;border-radius:var(--radius-sm);white-space:nowrap; transition:color var(--duration-fast) var(--easing); }
.topbar nav a:hover{color:var(--jjok-500)}
.hero{padding:var(--space-20) 0 var(--space-16);display:flex;gap:var(--space-8)}
.hero .vlabel{ writing-mode:vertical-rl;font-size:12px;letter-spacing:.4em; color:var(--meok-300);border-left:1px solid var(--meok-100); padding-left:var(--space-3);flex-shrink:0;font-weight:500; }
.hero .body h1{font-size:38px;line-height:1.55;letter-spacing:.01em}
.hero .body h1 .seal{width:34px;height:34px;font-size:16px;vertical-align:-4px;margin-left:10px}
.hero .body p{color:var(--meok-500);margin-top:var(--space-6);max-width:580px;font-size:15px;line-height:1.85}
.sec-head{display:flex;gap:var(--space-5);align-items:flex-start;margin-bottom:var(--space-8)}
.sec-head .vlabel{ writing-mode:vertical-rl;font-size:11px;letter-spacing:.35em;font-weight:500; color:var(--inju-500);border-left:2px solid var(--inju-500); padding:2px 0 2px 8px;flex-shrink:0;min-height:52px; }
.sec-head h2{font-size:24px;line-height:1.5}
.sec-head p{color:var(--meok-500);font-size:13.5px;margin-top:var(--space-2);line-height:1.75}
.seal{display:inline-flex;align-items:center;justify-content:center;background:var(--inju-500);color:var(--hanji-0);font-family:var(--font-display);font-weight:700;border-radius:6px;box-shadow:inset 0 0 0 1.5px rgba(251,248,241,.35);flex-shrink:0}
@media(max-width:640px){.hero{flex-direction:column;gap:var(--space-5)} .hero .vlabel{writing-mode:horizontal-tb;border-left:none;border-top:1px solid var(--meok-100);padding:var(--space-2) 0 0} .hero .body h1{font-size:28px}}`;
const SHELL_NOTE = "\n표준 셸(모든 페이지 공통 — 빼거나 새로 만들지 말 것): <body> 안에 GNB <div class=\"topbar\"><div class=\"topbar-inner\"><div class=\"logo\">제품/서비스명</div><nav><a href=\"#\">메뉴1</a><a href=\"#\">메뉴2</a>…</nav></div></div> 다음에 <main class=\"wrap\"><div class=\"page-head\"><h1>제목</h1><p>부제</p></div> …내용… </main>. GNB·.wrap·.page-head 는 이 시스템 모든 화면의 고정 크롬이다.\n섹션 헤더 규칙(디자인 시스템 시그니처 — 반드시 지킬 것): 각 주요 섹션은 <div class=\"sec-head\"> 로 시작한다. 그 안에 (1)영문 오버라인(예: OVERVIEW / PRINCIPLES / TRENDS / DETAILS — 대문자 짧은 영단어) (2)국문 제목 h2 (3)그 아래 얇은 구분선. 구분선·틱은 CSS가 자동으로 그린다(AXIS는 sec-head 자체가, ATELIER는 <div class=\"hairline\"></div> 를 마지막에 넣어야 함 — 각 가이드 마크업 참고). 페이지 최상단(page-head 대신 더 강조하고 싶으면)에는 히어로 <div class=\"hero\"> 를 둘 수 있다: 오버라인/뱃지 + 큰 제목(강조 단어는 <em>) + 설명 한 줄. 콘텐츠 배치는 매번 달라도, 이 오버라인+제목+구분선 헤더 패턴은 모든 섹션에서 동일하게 유지한다.";

const BCAVE_GUIDE = `BCAVE — 자사 브랜드 · 모노톤 슬레이트 · PPT 표지 문법(3색 모노톤, 하나만 어둡게, 흰 헤어라인). 컴포넌트 클래스 없는 "토큰형".
- 색: 배경 var(--color-bg)(밝은 슬레이트) · 표면 var(--color-surface)(흰색) · 텍스트 var(--color-text-primary)/강한 제목 var(--color-text-strong) · 보조 var(--ink-500) · 강조/다크 var(--color-primary)(=slate-800) · 슬레이트 스케일 var(--slate-800|300|200|100)
- 타이포: font: var(--text-display-1|heading-1|body-1|…). 라벨/메타는 모노 var(--font-family-mono). 지표 var(--text-data-*)
- 형태: 라운드 var(--radius-xs|md|lg|full), 그림자 var(--shadow-1|2), 흰 2px 헤어라인, 다크 슬레이트 블록. 절제된 3색 모노톤(강조는 어두운 슬레이트 하나로).
- 차트 var(--chart-1..6). body{background:var(--color-bg);color:var(--color-text-primary);font-family:var(--font-family-base)}. Pretendard <link> 필요.
- 예) 카드: <div style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:var(--card-padding);box-shadow:var(--shadow-1)">…</div>
- 히어로(브랜드 표지형, 다크 슬레이트 박스+흰 헤어라인+우측정렬): <div class="hero"><div class="top"><h1><span class="cave">B.CAVE</span>핵심 제목</h1><div class="rule"></div><div class="dept">부서/팀명</div></div><div class="foot"><span>태그</span><span>태그</span><em>날짜/버전</em></div></div>  (cave=로고 자리, rule=흰 2px 선, foot span=모노 칩)
- 섹션 헤더(모든 섹션 필수): <div class="sec-head"><div class="kicker">English Kicker</div><h2>국문 제목</h2><p>한 줄 설명</p></div>  ← 왼쪽 다크 라운드 탭은 sec-head 가 자동으로 그림`;

const AXIS_GUIDE = `AXIS — 밝은 코발트 · 웹 플랫폼/대시보드 (모던 프로페셔널). 컴포넌트 클래스가 없는 "토큰형" — 아래 CSS 변수로 컴포넌트를 직접 만든다.
- 색: 배경 var(--color-bg) · 표면 var(--color-surface) · 보더 var(--color-border) · 텍스트 var(--color-text-primary|secondary|tertiary) · 강조 var(--color-primary)(코발트) · 증감 var(--color-increase)녹/var(--color-decrease)적 · 상태 success/danger/warning(+ -subtle 배경)
- 타이포(축약 프로퍼티): font: var(--text-display-1|display-2|heading-1|heading-2|heading-3|body-1|body-2|caption). 지표 숫자 font: var(--text-data-lg|md|sm) 에 font-feature-settings:var(--font-feature-data); letter-spacing:var(--letter-spacing-data)
- 간격 var(--space-1..16) · 라운드 var(--radius-sm|md|lg|full) · 그림자 var(--shadow-1|2|3) · 카드 padding var(--card-padding), gap var(--card-gap)
- 차트: var(--chart-1..8), 그리드 var(--chart-grid), 축 var(--chart-axis)
- 대시보드는 <html data-density="compact"> 로 밀도↑(패딩·행높이·지표크기 자동 축소)
- body{font-family:var(--font-family-base);background:var(--color-bg);color:var(--color-text-primary)}. Pretendard <link> 필요.
- 예) 카드: <div style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-lg);padding:var(--card-padding);box-shadow:var(--shadow-1)">…</div>  · KPI값: <div style="font:var(--text-data-lg);letter-spacing:var(--letter-spacing-data);font-feature-settings:var(--font-feature-data)">1,240</div>
- 히어로(최상단): <div class="hero"><span class="eyebrow">짧은 라벨</span><h1>핵심 메시지<br><em>강조 줄</em></h1><p>한 줄 설명</p></div>  (eyebrow=코발트 알약 뱃지, em=코발트 강조)
- 섹션 헤더(모든 섹션 필수): <section><div class="sec-head"><div class="kicker">OVERVIEW</div><h2>국문 제목</h2></div> …내용… </section>  ← kicker=영문 대문자 오버라인, 구분선·코발트 틱은 sec-head 가 자동으로 그림(별도 태그 불필요)`;

const ATELIER_GUIDE = `ATELIER — 다크 에디토리얼 · 에스프레소+골드 · 세리프 제목 (고급/차분). 컴포넌트 클래스 없는 "토큰형".
- 색: 배경 var(--color-bg)(짙은 에스프레소) · 표면 var(--color-surface)/raised var(--color-surface-raised) · 골드 헤어라인 var(--color-hairline)(시그니처) · 텍스트 var(--color-text-primary|secondary|tertiary) · 브랜드/강조 var(--color-primary)(골드) · 증감 mint/coral
- 타이포: 제목은 세리프 font: var(--text-display-1|heading-1|heading-2)(Noto Serif KR), 본문 산세 var(--text-body-1|2), 라벨 var(--text-label)+letter-spacing:var(--letter-spacing-label) 대문자
- 지표 숫자는 "얇고 크게"가 인상: font: var(--text-data-xl|lg)(weight 300)
- 형태: 라운드 최소 var(--radius-sm=2px|md=4px). 다크라 그림자 대신 표면 밝기(surface/raised)로 높이 표현. 골드 1px 헤어라인·넉넉한 여백(var(--section-gap))
- 차트 var(--chart-1..8)(다크 대비). Noto Serif KR + Pretendard <link> 필요.
- body{background:var(--color-bg);color:var(--color-text-primary);font-family:var(--font-family-base)}
- 예) 표면 카드: <div style="background:var(--color-surface);border-top:1px solid var(--color-hairline);padding:var(--card-padding)">…</div>
- 히어로(최상단): <div class="hero"><span class="overline">짧은 라벨</span><h1>핵심 메시지<br><em>강조 줄</em></h1><p>한 줄 설명</p></div>  (overline=골드 대문자, em=골드 강조)
- 섹션 헤더(모든 섹션 필수): <div class="sec-head"><span class="overline">PRINCIPLES</span><h2>국문 제목</h2><div class="hairline"></div></div> …내용…  ← overline=영문 대문자 골드, 마지막 <div class="hairline"></div> 가 시그니처 골드 이중 구분선을 그림(반드시 넣을 것)`;

// 토큰형(prism/punch/mochi/meok) 공통 셸 노트 — 히어로/섹션 헤더 마크업은 각 가이드 예시를 따른다.
const SHELL_NOTE_TOKEN =
  "\n표준 셸(모든 페이지 공통 — 빼지 말 것): <body> 안에 GNB <div class=\"topbar\"><div class=\"topbar-inner\"><div class=\"logo\">제품/서비스명</div><nav><a href=\"#\">메뉴1</a><a href=\"#\">메뉴2</a>…</nav></div></div> 이어서 <main class=\"wrap\"> …내용… </main>. 페이지 최상단엔 히어로 <div class=\"hero\">…</div>, 각 주요 섹션은 <div class=\"sec-head\">…</div> 헤더로 시작한다. topbar·wrap·hero·sec-head 는 이 시스템의 고정 크롬이다 — hero/sec-head 안의 정확한 마크업(뱃지·라벨 클래스 등)은 위 가이드의 '히어로/섹션 헤더' 예시를 그대로 쓴다. 콘텐츠 배치만 매번 다르게, 셸·헤더 패턴은 모든 화면에서 동일하게 유지한다.";

const PRISM_GUIDE = `PRISM — 글래스모피즘 · 바이올렛 그라디언트 · 반투명 유리 표면 (트렌디/화려). 컴포넌트 클래스 없는 "토큰형".
- 색: 배경 var(--color-bg)(밝은 뉴트럴, 오로라 그라디언트를 깔면 유리가 산다) · 강조 var(--color-primary)(바이올렛)/var(--violet-600) · 텍스트 var(--color-text-primary|secondary)
- 유리 표면: background:var(--glass-bg)|var(--glass-bg-strong) + border:1px solid var(--glass-border) + box-shadow:var(--glass-shadow) + backdrop-filter:blur(var(--glass-blur))
- 그라디언트: var(--gradient-brand)/var(--gradient-brand-soft)/var(--gradient-text)(글자 그라디언트)
- 타이포 font: var(--text-display-1|heading-1|body-1|…)(제목 800), 지표 var(--text-data-*). 필 라운드 var(--radius-full), 간격 var(--space-*), 차트 var(--chart-1..8)
- body{background:var(--color-bg);color:var(--color-text-primary);font-family:var(--font-family-base)}. Pretendard <link> 필요.
- 예) 유리 카드: <div style="background:var(--glass-bg);backdrop-filter:blur(var(--glass-blur));border:1px solid var(--glass-border);box-shadow:var(--glass-shadow);border-radius:var(--radius-lg);padding:var(--card-padding)">…</div>
- 히어로: <div class="hero"><span class="pill"><i></i>짧은 라벨</span><h1>핵심 메시지<br><span class="grad-text">강조 줄</span></h1><p>설명</p></div>  (pill=유리 알약 뱃지, grad-text=그라디언트 글자)
- 섹션 헤더(모든 섹션 필수): <div class="sec-head"><span class="kicker">OVERVIEW</span><h2>국문 제목</h2></div>  (kicker=그라디언트 필 뱃지)`;

const PUNCH_GUIDE = `PUNCH — 네오 브루탈리즘 · 잉크 보더 · 블러 없는 하드 섀도 · 고채도 (에너지/젊음). 컴포넌트 클래스 없는 "토큰형".
- 색: 종이 var(--color-bg)/표면 var(--color-surface) · 잉크 var(--ink-900)(텍스트·보더) · 프라이머리는 배경색 var(--color-primary)(옐로 — 그 위 텍스트는 잉크) · 핑크 var(--pink-500) · 보조 텍스트 var(--ink-500)
- 보더/그림자: border:var(--bw)|var(--bw-bold) solid var(--ink-900), 블러 없는 하드 섀도 var(--shadow-punch-sm|md|lg), 살짝 기울임 transform:var(--tilt-1|2)
- 타이포 최대 웨이트(800~900) font: var(--text-*). 하이라이트 <span class="hl">(옐로)/<span class="hl-pink">(핑크). 필 뱃지엔 var(--radius-full), 간격 var(--space-*), 차트 var(--chart-1..8)(플랫 고채도)
- body{background:var(--color-bg);color:var(--color-text-primary);font-family:var(--font-family-base)}. Pretendard <link> 필요.
- 예) 카드: <div style="background:var(--color-surface);border:var(--bw) solid var(--ink-900);border-radius:10px;box-shadow:var(--shadow-punch-md);padding:var(--card-padding)">…</div>
- 히어로: <div class="hero"><span class="sticker">짧은 라벨</span><h1>데이터가 <span class="hl">소리치게</span></h1><p>설명</p></div>  (sticker=핑크 스티커 뱃지)
- 섹션 헤더(모든 섹션 필수): <div class="sec-head"><span class="tag">PRINCIPLES</span><h2>국문 제목</h2></div>  (tag=잉크색 대문자 뱃지)`;

const MOCHI_GUIDE = `MOCHI — 파스텔 · 풀 라운드/블롭 · 통통 튀는 모션 (귀여움/캐주얼). 컴포넌트 클래스 없는 "토큰형".
- 색: 크림 배경 var(--color-bg)/표면 var(--color-surface) · 피치 강조 var(--color-primary)/var(--peach-600|700) · 텍스트 var(--color-text-primary)(코코아)/보조 var(--cocoa-700) · 파스텔 var(--mint-100)/var(--butter-100)/var(--lavender-100)
- 타이포: 제목 폰트 var(--font-family-display)(Jua, 둥근 손글씨), 본문 var(--font-family-base). font: var(--text-*)
- 형태: 풀 라운드 var(--radius-full)·블롭 var(--radius-blob), 부드러운 그림자 var(--shadow-1|2), 바운스 var(--easing-bounce). 검정·직각은 쓰지 말 것. 간격 var(--space-*), 차트 var(--chart-1..8)(파스텔)
- body{background:var(--color-bg);color:var(--color-text-primary);font-family:var(--font-family-base)}. Pretendard + Jua <link> 필요.
- 예) 카드: <div style="background:var(--color-surface);border-radius:var(--radius-lg);box-shadow:var(--shadow-2);padding:var(--card-padding)">…</div>
- 히어로: <div class="hero"><span class="pill">🍡 짧은 라벨</span><h1>숫자도 <em>말랑하게</em></h1><p>설명</p></div>  (pill=피치 알약, em=피치 강조)
- 섹션 헤더(모든 섹션 필수): <div class="sec-head"><span class="dot"></span><h2>국문 제목</h2></div>  (dot=피치 블롭 점)`;

const MEOK_GUIDE = `MEOK — 한국 전통 지물 · 먹 농담 · 한지+인주(붉은) 괘선 · 세로 레이블 (헤리티지/차분). 컴포넌트 클래스 없는 "토큰형".
- 색: 한지 배경 var(--color-bg)/표면 var(--color-surface) · 먹 농담 위계 var(--meok-900|700|500|300)(텍스트) · 쪽(藍) var(--jjok-500)(강조·링크) · 인주(붉은) var(--inju-500)(도장·괘선 포인트)
- 타이포: 제목은 세리프 var(--font-family-display)(Gowun Batang), 본문 var(--font-family-base). font: var(--text-*), 넉넉한 행간
- 형태: 절제된 라운드 var(--radius-sm), 붉은 괘선(인찰지) 그리드, 낙관 도장 <span class="seal">墨</span>(인주 배경). 세로쓰기 레이블 writing-mode:vertical-rl. 간격 var(--space-*), 차트 var(--chart-1..8)(전통색 저채도)
- body{background:var(--color-bg);color:var(--color-text-primary);font-family:var(--font-family-base)}. Gowun Batang + Pretendard <link> 필요.
- 예) 카드: <div style="background:var(--color-surface);border:1px solid var(--meok-100);padding:var(--card-padding)">…</div>
- 히어로: <div class="hero"><div class="vlabel">세로 레이블</div><div class="body"><h1>핵심 메시지<span class="seal">墨</span></h1><p>설명</p></div></div>  (vlabel=세로쓰기, seal=인주 도장)
- 섹션 헤더(모든 섹션 필수): <div class="sec-head"><div class="vlabel">원칙</div><div><h2>국문 제목</h2></div></div>  (vlabel=인주 세로 레이블)`;

export const DESIGN_SYSTEMS: Record<string, DesignSystem> = {
  "1": { id: "1", key: "bcave", label: "1. BCAVE — 자사 브랜드 · 모노톤 슬레이트 · PPT 표지 문법 (기본/공식)", css: BCAVE_CSS + "\n" + BCAVE_SHELL, guide: BCAVE_GUIDE + SHELL_NOTE_TOKEN },
  "2": { id: "2", key: "axis", label: "2. AXIS — 밝은 코발트 · 모던 프로페셔널 (웹/대시보드, 토큰형)", css: AXIS_CSS + "\n" + AXIS_SHELL, guide: AXIS_GUIDE + SHELL_NOTE },
  "3": { id: "3", key: "atelier", label: "3. ATELIER — 다크 에디토리얼 · 골드+세리프 (고급/차분)", css: ATELIER_CSS + "\n" + ATELIER_SHELL, guide: ATELIER_GUIDE + SHELL_NOTE },
  "4": { id: "4", key: "prism", label: "4. PRISM — 글래스모피즘 · 바이올렛 그라디언트 · 유리 (트렌디/화려)", css: PRISM_CSS + "\n" + PRISM_SHELL, guide: PRISM_GUIDE + SHELL_NOTE_TOKEN },
  "5": { id: "5", key: "punch", label: "5. PUNCH — 네오 브루탈리즘 · 잉크 보더 · 옐로/핑크 (에너지/젊음)", css: PUNCH_CSS + "\n" + PUNCH_SHELL, guide: PUNCH_GUIDE + SHELL_NOTE_TOKEN },
  "6": { id: "6", key: "mochi", label: "6. MOCHI — 파스텔 · 풀 라운드 · 통통 튀는 (귀여움/캐주얼)", css: MOCHI_CSS + "\n" + MOCHI_SHELL, guide: MOCHI_GUIDE + SHELL_NOTE_TOKEN },
  "7": { id: "7", key: "meok", label: "7. MEOK — 한국 전통 · 먹 농담 · 한지+인주 · 세로 레이블 (헤리티지/차분)", css: MEOK_CSS + "\n" + MEOK_SHELL, guide: MEOK_GUIDE + SHELL_NOTE_TOKEN },
};

const ALIAS: Record<string, string> = {
  "1": "1", "1번": "1", bcave: "1", 비케이브: "1", 자사: "1", 브랜드: "1", 공식: "1",
  "2": "2", "2번": "2", axis: "2", 액시스: "2",
  "3": "3", "3번": "3", atelier: "3", 아틀리에: "3", 다크: "3",
  "4": "4", "4번": "4", prism: "4", 프리즘: "4", 글래스: "4", 유리: "4",
  "5": "5", "5번": "5", punch: "5", 펀치: "5", 브루탈: "5",
  "6": "6", "6번": "6", mochi: "6", 모찌: "6", 파스텔: "6",
  "7": "7", "7번": "7", meok: "7", 먹: "7", 한지: "7", 전통: "7",
};

/** 메시지에서 디자인 시스템 선택(1~7 / 이름)을 찾는다. 없으면 null. */
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

/** 7개 선택지 목록(되묻기용). */
export function systemsMenu(): string {
  return Object.values(DESIGN_SYSTEMS).map((s) => "  " + s.label).join("\n");
}

// "알아서"일 때 7개를 순환 배정(매번 다른 시스템).
let _lastAuto = "";
export function rotateSystem(): DesignSystem {
  const ids = Object.keys(DESIGN_SYSTEMS).filter((i) => i !== _lastAuto);
  const id = ids[Math.floor(Math.random() * ids.length)] ?? "1";
  _lastAuto = id;
  return DESIGN_SYSTEMS[id];
}

// ── 앱/서비스(실제 백엔드 포함) 요청 감지 — 단일 정적 HTML 이 아니라 진짜 프로젝트로 만들어야 하는 신호 ──
const APP_NOUN =
  /(서비스|애플리케이션|어플리케이션|어플\b|백엔드|backend|서버\b|\bserver\b|\bapi\b|엔드포인트|endpoint|데이터베이스|\bdb\b|회원가입|회원 ?관리|로그인 ?기능|인증 ?기능|\bauth\b|계정|crud|결제|주문 ?관리|재고|예약 ?(시스템|기능|서비스)|게시판|커뮤니티|채팅|메시지|실시간|알림|쇼핑몰|풀스택|full[- ]?stack|\bsaas\b|웹\s?서비스|웹앱|웹\s?애플리케이션|백오피스|관리자 ?(시스템|페이지|도구))/i;
/** 정적 목업이 아니라 실제 백엔드/데이터가 있는 애플리케이션을 만들라는 요청인가. */
export function isAppBuild(message?: string): boolean {
  if (!message) return false;
  // "목업/시안/정적/한 페이지"처럼 명시적으로 정적 산출물을 원하면 앱으로 보지 않는다.
  if (/(목업|mockup|mock-up|시안|정적|static|한 ?페이지|단일 ?html|프로토타입 ?화면)/i.test(message)) return false;
  return APP_NOUN.test(message);
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
