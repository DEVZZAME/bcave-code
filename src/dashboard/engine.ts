// 결정론적 대시보드 엔진 (템플릿 기반).
// 스프레드시트를 코드로 프로파일링 → 스펙 → 등록된 템플릿(디자인시스템)의 토큰·컴포넌트로 HTML 조립.
// LLM 미사용(토큰 0). 데이터는 {{BCAVE_DATA}}, Chart.js 는 {{BCAVE_CHARTJS}} 자리표시자로 주입.

import fs from "node:fs";
import XLSX from "xlsx";
import { TEMPLATE1_CSS } from "./tokens.js";

// ── 템플릿 레지스트리 ────────────────────────────
export interface Template {
  id: string;
  label: string;
  css: string; // 인라인할 디자인시스템 CSS(토큰+컴포넌트)
  palette: string[]; // 차트 색(1순위→비강조)
  accent: string; // 막대·라인 기본색
}

export const TEMPLATES: Record<string, Template> = {
  template1: {
    id: "template1",
    label: "template1 — 패션브랜드 디자인시스템 (토스 스타일)",
    css: TEMPLATE1_CSS,
    palette: ["#3182F6", "#64A8FF", "#90C2FF", "#C9E2FF", "#FFB331", "#FFD98E", "#B0B8C1"],
    accent: "#3182F6",
  },
};

// ── 스프레드시트 읽기 ────────────────────────────
export function readRows(filePath: string): { rows: Record<string, unknown>[]; sheet: string } {
  const wb = XLSX.read(fs.readFileSync(filePath), { type: "buffer", cellDates: true });
  let name = wb.SheetNames[0];
  let best = -1;
  for (const s of wb.SheetNames) {
    const ws = wb.Sheets[s];
    const range = ws["!ref"] ? XLSX.utils.decode_range(ws["!ref"]) : null;
    const n = range ? range.e.r - range.s.r : 0;
    if (n > best) { best = n; name = s; }
  }
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: null, raw: false }) as Record<string, unknown>[];
  return { rows, sheet: name };
}

// ── 프로파일러 ──────────────────────────────────
export type ColKind = "date" | "numeric" | "binary" | "categorical" | "text";
export interface ColProfile {
  name: string;
  kind: ColKind;
  filled: number;
  cardinality: number;
  positive?: string;
  magnitude?: number;
}

const YESNO = new Set(["y", "n", "예", "아니오", "아니요", "true", "false", "o", "x", "1", "0", "yes", "no"]);
const POSITIVE = ["y", "예", "yes", "true", "o", "1"];

function toNum(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = Number(String(v).replace(/[, %₩$]/g, "").trim());
  return isNaN(n) ? null : n;
}
function isDateVal(v: unknown): boolean {
  if (v instanceof Date) return true;
  return /^\d{4}[-/.]\d{1,2}([-/.]\d{1,2})?/.test(String(v).trim());
}

export function profileColumns(rows: Record<string, unknown>[]): ColProfile[] {
  const cols = Object.keys(rows[0] ?? {});
  const sample = rows.slice(0, 800);
  return cols.map((name) => {
    const vals = sample.map((r) => r[name]).filter((v) => v != null && v !== "");
    const filled = vals.length || 1;
    const distinct = new Set(vals.map((v) => String(v)));
    const cardinality = distinct.size;
    const numCount = vals.filter((v) => toNum(v) != null).length;
    const dateCount = vals.filter(isDateVal).length;
    const lowered = [...distinct].map((s) => s.toLowerCase());

    let kind: ColKind = "text";
    let positive: string | undefined;
    let magnitude: number | undefined;
    if (dateCount / filled >= 0.7) kind = "date";
    else if (cardinality <= 3 && lowered.every((s) => YESNO.has(s))) {
      kind = "binary";
      positive = [...distinct].find((s) => POSITIVE.includes(s.toLowerCase())) ?? [...distinct][0];
    } else if (numCount / filled >= 0.8) {
      kind = "numeric";
      const nums = vals.map(toNum).filter((n): n is number => n != null);
      magnitude = nums.reduce((a, b) => a + Math.abs(b), 0) / Math.max(nums.length, 1);
    } else if (cardinality >= 2 && cardinality <= 25 && cardinality / filled < 0.6) kind = "categorical";
    return { name, kind, filled, cardinality, positive, magnitude };
  });
}

// ── 스펙 ────────────────────────────────────────
export interface Kpi { label: string; kind: "count" | "avg" | "max" | "rate"; col?: string; positive?: string }
export interface ChartSpec { title: string; kind: "bar" | "doughnut" | "line"; col: string }
export interface DashboardSpec {
  title: string;
  subtitle: string;
  kpis: Kpi[];
  charts: ChartSpec[];
  ranking: { title: string; col: string } | null;
  tableCols: string[];
  numericCols: string[];
}

export function buildSpec(cols: ColProfile[], title: string, rowCount: number): DashboardSpec {
  const numerics = cols.filter((c) => c.kind === "numeric").sort((a, b) => (b.magnitude ?? 0) - (a.magnitude ?? 0));
  const binaries = cols.filter((c) => c.kind === "binary");
  const cats = cols.filter((c) => c.kind === "categorical");
  const catsLow = cats.slice().sort((a, b) => a.cardinality - b.cardinality); // 분포 차트용(적은 범주 우선)
  const dates = cols.filter((c) => c.kind === "date");

  const kpis: Kpi[] = [{ label: "전체", kind: "count" }];
  if (numerics[0]) {
    kpis.push({ label: `평균 ${numerics[0].name}`, kind: "avg", col: numerics[0].name });
    kpis.push({ label: `최고 ${numerics[0].name}`, kind: "max", col: numerics[0].name });
  }
  if (binaries[0]) kpis.push({ label: `${binaries[0].name} 비율`, kind: "rate", col: binaries[0].name, positive: binaries[0].positive });
  if (kpis.length < 4 && numerics[1]) kpis.push({ label: `평균 ${numerics[1].name}`, kind: "avg", col: numerics[1].name });

  const charts: ChartSpec[] = [];
  if (dates[0]) charts.push({ title: `${dates[0].name} 월별 추이`, kind: "line", col: dates[0].name });
  catsLow.slice(0, 3).forEach((c, i) => charts.push({ title: `${c.name} 분포`, kind: i === 2 ? "doughnut" : "bar", col: c.name }));
  if (charts.length < 2 && binaries[0]) charts.push({ title: `${binaries[0].name} 분포`, kind: "doughnut", col: binaries[0].name });

  // 랭킹: 카디널리티가 큰 범주형(4~30)을 상위 N 으로 — 상품/지역 등 "TOP" 뷰
  const rankCol = cats.filter((c) => c.cardinality >= 4 && c.cardinality <= 30).sort((a, b) => b.cardinality - a.cardinality)[0];

  return {
    title,
    subtitle: `${rowCount.toLocaleString("ko-KR")}개 레코드 · 자동 분석`,
    kpis: kpis.slice(0, 4),
    charts: charts.slice(0, 4),
    ranking: rankCol ? { title: `${rankCol.name} TOP`, col: rankCol.name } : null,
    tableCols: cols.map((c) => c.name),
    numericCols: numerics.map((c) => c.name),
  };
}

// ── 렌더 스크립트(브라우저 런타임: __DATA/__SPEC 로 KPI·차트·랭킹·표 생성) ──
const RENDER_SCRIPT = `<script>(function(){
var esc=window.esc||function(v){return String(v==null?'':v);};
var SPEC=window.__SPEC||{},DATA=window.__DATA||[],PAL=SPEC.palette||['#3182F6','#64A8FF','#90C2FF','#C9E2FF','#FFB331'];
function num(v){var n=Number(String(v==null?'':v).replace(/[, %]/g,''));return isNaN(n)?0:n;}
function fmt(n){return Number(n).toLocaleString('ko-KR');}
var total=DATA.length;
function set(id,v){var e=document.getElementById(id);if(e)e.textContent=v;}
(SPEC.kpis||[]).forEach(function(k,i){var v='';
if(k.kind==='count')v=fmt(total);
else if(k.kind==='avg'){var s=0,c=0;DATA.forEach(function(r){if(r[k.col]!=null&&r[k.col]!==''){s+=num(r[k.col]);c++;}});v=fmt(Math.round(s/Math.max(c,1)));}
else if(k.kind==='max'){var m=0;DATA.forEach(function(r){m=Math.max(m,num(r[k.col]));});v=fmt(m);}
else if(k.kind==='rate'){var y=DATA.filter(function(r){return String(r[k.col]).trim()===k.positive;}).length;v=(Math.round(y/Math.max(total,1)*1000)/10)+'%';}
set('kpi'+i,v);});
function cnt(col){var m={};DATA.forEach(function(r){var x=r[col];x=(x==null||x==='')?'미상':String(x);m[x]=(m[x]||0)+1;});return m;}
function monthly(col){var m={};DATA.forEach(function(r){var d=String(r[col]||'').slice(0,7).replace(/[/.]/g,'-');if(/^\\d{4}-\\d{2}$/.test(d))m[d]=(m[d]||0)+1;});var ks=Object.keys(m).sort();var o={};ks.forEach(function(k){o[k]=m[k];});return o;}
function top(o,n){return Object.keys(o).map(function(k){return [k,o[k]];}).sort(function(a,b){return b[1]-a[1];}).slice(0,n);}
try{if(window.Chart){Chart.defaults.font.family='Pretendard Variable,Pretendard,system-ui,sans-serif';Chart.defaults.maintainAspectRatio=false;Chart.defaults.color='#8B95A1';
(SPEC.charts||[]).forEach(function(ch,i){var el=document.getElementById('chart'+i);if(!el)return;
var pairs=ch.kind==='line'?Object.keys(monthly(ch.col)).map(function(k){return [k,monthly(ch.col)[k]];}):top(cnt(ch.col),8);
var labels=pairs.map(function(p){return p[0];}),vals=pairs.map(function(p){return p[1];});
if(ch.kind==='doughnut'){new Chart(el,{type:'doughnut',data:{labels:labels,datasets:[{data:vals,backgroundColor:PAL,borderWidth:2,borderColor:'#fff'}]},options:{responsive:true,cutout:'64%',plugins:{legend:{position:'bottom',labels:{boxWidth:8,boxHeight:8,usePointStyle:true,font:{size:12}}}}}});}
else if(ch.kind==='line'){new Chart(el,{type:'line',data:{labels:labels,datasets:[{data:vals,borderColor:PAL[0],backgroundColor:'rgba(49,130,246,.10)',fill:true,tension:.4,pointRadius:0,borderWidth:2.5}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{x:{grid:{display:false},ticks:{maxTicksLimit:8}},y:{beginAtZero:true,border:{display:false},grid:{color:'#F2F4F6'}}}}});}
else{new Chart(el,{type:'bar',data:{labels:labels,datasets:[{data:vals,backgroundColor:PAL[0],borderRadius:6,maxBarThickness:44}]},options:{responsive:true,plugins:{legend:{display:false}},scales:{x:{grid:{display:false}},y:{beginAtZero:true,border:{display:false},grid:{color:'#F2F4F6'}}}}});}
});}}catch(e){}
if(SPEC.ranking){var rk=top(cnt(SPEC.ranking.col),6),mx=rk.length?rk[0][1]:1,box=document.getElementById('ranking');
if(box)box.innerHTML=rk.map(function(p,i){return '<div class="ds-row"><div class="ds-row-rank">'+(i+1)+'</div><div class="ds-row-main"><div class="ds-row-title">'+esc(p[0])+'</div><div class="g-bar-track"><div class="g-bar-fill" style="width:'+Math.round(p[1]/mx*100)+'%"></div></div></div><div class="ds-row-val">'+fmt(p[1])+'</div></div>';}).join('');}
var cols=SPEC.tableCols||Object.keys(DATA[0]||{}),nums=SPEC.numericCols||[];
var th=document.getElementById('thead');if(th)th.innerHTML='<tr>'+cols.map(function(c){return '<th>'+esc(c)+'</th>';}).join('')+'</tr>';
var P=1,S=12,F=DATA,tb=document.getElementById('tb'),q=document.getElementById('q'),cn=document.getElementById('cnt'),pv=document.getElementById('pv'),nx=document.getElementById('nx'),pi=document.getElementById('pi');
function draw(){if(!tb)return;var pg=Math.max(1,Math.ceil(F.length/S));if(P>pg)P=pg;var sl=F.slice((P-1)*S,(P-1)*S+S);
tb.innerHTML=sl.length?sl.map(function(r){return '<tr>'+cols.map(function(c){return '<td'+(nums.indexOf(c)>=0?'':' class="muted"')+'>'+esc(r[c])+'</td>';}).join('')+'</tr>';}).join(''):'<tr><td colspan="'+cols.length+'" style="text-align:center;color:var(--gray-500);padding:24px">검색 결과가 없습니다.</td></tr>';
if(cn)cn.textContent='전체 '+fmt(F.length)+'건';if(pi)pi.textContent=P+' / '+pg;if(pv)pv.disabled=P<=1;if(nx)nx.disabled=P>=pg;}
if(q)q.addEventListener('input',function(){var s=q.value.trim().toLowerCase();F=!s?DATA:DATA.filter(function(r){return cols.some(function(c){return String(r[c]).toLowerCase().indexOf(s)>=0;});});P=1;draw();});
if(pv)pv.onclick=function(){if(P>1){P--;draw();}};if(nx)nx.onclick=function(){P++;draw();};draw();
})();</script>`;

// 생성 대시보드 전용 레이아웃 보조 CSS(디자인시스템 토큰 사용, g- 네임스페이스로 충돌 회피)
const EXTRA_CSS = `
*{margin:0;padding:0;box-sizing:border-box}
.g-header{padding:16px 4px 24px;display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap}
.g-eyebrow{font-size:14px;font-weight:600;color:var(--gray-500);margin-bottom:6px}
.g-header h1{font-size:26px;font-weight:800;letter-spacing:-.03em}
.g-period{font-size:14px;color:var(--gray-500);margin-top:6px;font-weight:500}
.g-kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:var(--card-gap);margin-bottom:var(--card-gap)}
.g-kpi-grid .ds-card{margin-bottom:0;padding:20px 22px}
@media(max-width:760px){.g-kpi-grid{grid-template-columns:repeat(2,1fr)}}
.g-chart-box{position:relative;height:280px}
.g-chart-box.sm{height:240px}
.g-search{padding:9px 14px;border:1px solid var(--gray-200);border-radius:10px;font:inherit;font-size:14px;color:var(--gray-900);background:var(--white)}
.g-pager{display:flex;gap:6px;justify-content:flex-end;align-items:center;margin-top:14px}
.g-pager button{border:none;background:var(--gray-100);color:var(--gray-700);font:inherit;font-weight:600;font-size:13px;padding:7px 12px;border-radius:8px;cursor:pointer}
.g-pager button:disabled{opacity:.4;cursor:default}
.g-bar-track{height:6px;background:var(--gray-100);border-radius:var(--radius-bar);overflow:hidden;margin-top:6px;max-width:340px}
.g-bar-fill{height:100%;background:var(--blue-500);border-radius:var(--radius-bar)}
.g-tbl-scroll{overflow-x:auto;margin:0 -4px;padding:0 4px}
.ds-tbl td.muted{color:var(--gray-700);font-weight:600;font-size:14px}
`;

function chartCard(i: number, title: string, sm: boolean): string {
  return `<div class="ds-card"><div class="ds-card-head"><div><div class="ds-card-title">${title}</div></div></div><div class="g-chart-box${sm ? " sm" : ""}"><canvas id="chart${i}"></canvas></div></div>`;
}

/** 스펙 + 템플릿 → 단일 HTML(자리표시자 포함). write_file 로 저장하면 데이터·Chart.js 가 주입되고 검토된다. */
export function renderDashboard(spec: DashboardSpec, dataFile: string, sheet: string, templateId: string): string {
  const t = TEMPLATES[templateId] ?? TEMPLATES.template1;

  const kpiCards = spec.kpis
    .map((k, i) => `<div class="ds-card"><div class="ds-kpi-label">${k.label}</div><div class="ds-kpi-value" id="kpi${i}">–</div></div>`)
    .join("");

  // 차트 배치: line(추이) 은 전폭, 나머지는 2열 그리드
  const lineCharts = spec.charts.map((c, i) => ({ c, i })).filter((x) => x.c.kind === "line");
  const otherCharts = spec.charts.map((c, i) => ({ c, i })).filter((x) => x.c.kind !== "line");
  let chartsHtml = lineCharts.map((x) => chartCard(x.i, x.c.title, false)).join("");
  for (let j = 0; j < otherCharts.length; j += 2) {
    const pair = otherCharts.slice(j, j + 2);
    chartsHtml += `<div class="ds-two-col">${pair.map((x) => chartCard(x.i, x.c.title, true)).join("")}</div>`;
  }

  const rankingHtml = spec.ranking
    ? `<div class="ds-card"><div class="ds-card-head"><div><div class="ds-card-title">${spec.ranking.title}</div><div class="ds-card-desc">상위 6개 · 건수 기준</div></div></div><div id="ranking"></div></div>`
    : "";

  const tableHtml =
    `<div class="ds-card"><div class="ds-card-head"><div><div class="ds-card-title">전체 데이터</div><div class="ds-card-desc" id="cnt"></div></div>` +
    `<input id="q" class="g-search" type="search" placeholder="검색"></div>` +
    `<div class="g-tbl-scroll"><table class="ds-tbl"><thead id="thead"></thead><tbody id="tb"></tbody></table></div>` +
    `<div class="g-pager"><span id="pi" style="margin-right:auto;font-size:12px;color:var(--gray-500)"></span><button id="pv">이전</button><button id="nx">다음</button></div></div>`;

  const specJson = JSON.stringify({
    kpis: spec.kpis,
    charts: spec.charts,
    ranking: spec.ranking,
    tableCols: spec.tableCols,
    numericCols: spec.numericCols,
    palette: t.palette,
  });

  return (
    `<!doctype html><html lang="ko"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1"><title>${spec.title}</title>` +
    `<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">` +
    `<script>{{BCAVE_CHARTJS}}</script>` +
    `<style>${t.css}\n${EXTRA_CSS}\n:where(body){word-break:keep-all;overflow-wrap:break-word}</style></head>` +
    `<body class="ds-body"><div class="ds-wrap">` +
    `<div class="g-header"><div><div class="g-eyebrow">DASHBOARD</div><h1>${spec.title}</h1><div class="g-period">${spec.subtitle}</div></div></div>` +
    `<div class="ds-section-title">핵심 지표</div><div class="g-kpi-grid">${kpiCards}</div>` +
    (spec.charts.length ? `<div class="ds-section-title">분석</div>${chartsHtml}` : "") +
    (rankingHtml ? `<div class="ds-section-title">순위</div>${rankingHtml}` : "") +
    `<div class="ds-section-title">데이터</div>${tableHtml}` +
    `</div>` +
    `<script>window.__SPEC=${specJson};window.__DATA={{BCAVE_DATA:${dataFile}#${sheet}}};</script>` +
    RENDER_SCRIPT +
    `</body></html>`
  );
}

/** 파일 경로 + 템플릿 → 대시보드 HTML(자리표시자 포함). rows 는 프로파일링용으로만 읽고 데이터는 자리표시자로 주입. */
export function buildDashboard(filePath: string, templateId: string): { html: string; sheet: string; rowCount: number; spec: DashboardSpec } {
  const { rows, sheet } = readRows(filePath);
  const title = filePath.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "대시보드";
  const spec = buildSpec(profileColumns(rows), title, rows.length);
  const html = renderDashboard(spec, filePath, sheet, templateId);
  return { html, sheet, rowCount: rows.length, spec };
}
