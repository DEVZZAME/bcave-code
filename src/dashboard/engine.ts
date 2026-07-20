// 결정론적 대시보드 엔진 (템플릿 기반, 풀 컴포넌트).
// 스프레드시트를 코드로 프로파일링 → 스펙 → 디자인시스템 토큰·컴포넌트 전부로 HTML 조립.
// LLM 미사용(토큰 0). 데이터는 {{BCAVE_DATA}}, Chart.js 는 {{BCAVE_CHARTJS}} 자리표시자로 주입.

import fs from "node:fs";
import XLSX from "xlsx";
import { TEMPLATE1_CSS } from "./tokens.js";

// ── 템플릿 레지스트리 ────────────────────────────
export interface Template {
  id: string;
  label: string;
  css: string;
  palette: string[];
  accent: string;
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

// 표 데이터를 담을 수 있는 형식. 텍스트 계열은 UTF-8 로 읽어야 한글이 안 깨진다.
export const TABULAR_EXT = new Set([
  ".xlsx", ".xls", ".xlsm", ".xlsb", ".ods", // 바이너리(스프레드시트)
  ".csv", ".tsv", ".txt", ".tab", ".html", ".htm", // 텍스트/마크업
]);
const TEXT_EXT = new Set([".csv", ".tsv", ".txt", ".tab", ".html", ".htm"]);

/** 파일을 워크북으로 로드. 텍스트 형식(csv·tsv·txt·html)은 UTF-8 원본 문자열로(raw:true —
 *  날짜 "2025-01-01" 이 로케일로 변형되는 것 방지), 그 외 바이너리는 버퍼+cellDates 로 읽는다. */
export function readWorkbook(filePath: string): XLSX.WorkBook {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  if (TEXT_EXT.has(ext)) return XLSX.read(fs.readFileSync(filePath, "utf8"), { type: "string", raw: true });
  return XLSX.read(fs.readFileSync(filePath), { type: "buffer", cellDates: true });
}

// ── 스프레드시트 읽기 (최대 시트 자동 선택) ──────
export function readRows(filePath: string): { rows: Record<string, unknown>[]; sheet: string } {
  const wb = readWorkbook(filePath);
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
  name: string; kind: ColKind; filled: number; cardinality: number;
  positive?: string; magnitude?: number;
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

// ── 스펙 (풀 버전: 어떤 컬럼을 어느 블록에 쓸지) ──
export interface DashboardSpec {
  title: string; subtitle: string;
  dateCol: string | null;
  metricCol: string | null; metricLabel: string;
  qtyCol: string | null;
  binaryCol: string | null; binaryPositive: string | null;
  catCols: string[];
  entityCol: string | null;
  tableCols: string[]; numericCols: string[];
}
function pref(cols: ColProfile[], words: string[]): ColProfile | undefined {
  return cols.find((c) => words.some((w) => c.name.toLowerCase().includes(w)));
}
export function buildSpec(cols: ColProfile[], title: string, rowCount: number): DashboardSpec {
  const numerics = cols.filter((c) => c.kind === "numeric").sort((a, b) => (b.magnitude ?? 0) - (a.magnitude ?? 0));
  const dates = cols.filter((c) => c.kind === "date");
  const binaries = cols.filter((c) => c.kind === "binary");
  const cats = cols.filter((c) => c.kind === "categorical");

  const metric = pref(numerics, ["결제", "매출", "금액", "amount", "price", "revenue", "sales", "total"]) ?? numerics[0];
  const qty = pref(numerics, ["수량", "qty", "개수", "건수", "count", "quantity"]) ?? numerics.filter((c) => c !== metric).slice(-1)[0];
  const catsLow = cats.filter((c) => c.cardinality <= 12).sort((a, b) => a.cardinality - b.cardinality);
  // 엔티티(상품카드·TOP 랭킹용): 값이 반복되는 범주/텍스트. ID 등 near-unique(고유값 비율↑) 컬럼은 제외.
  const entityCands = cols.filter(
    (c) => (c.kind === "categorical" || c.kind === "text") && c.cardinality >= 4 && c.cardinality / c.filled <= 0.5,
  );
  const entity = pref(entityCands, ["상품", "제품", "product", "품목", "name", "이름"]) ?? entityCands.sort((a, b) => b.cardinality - a.cardinality)[0];

  return {
    title,
    subtitle: `${rowCount.toLocaleString("ko-KR")}개 레코드 · 자동 분석`,
    dateCol: dates[0]?.name ?? null,
    metricCol: metric?.name ?? null,
    metricLabel: metric?.name ?? "값",
    qtyCol: qty?.name ?? null,
    binaryCol: binaries[0]?.name ?? null,
    binaryPositive: binaries[0]?.positive ?? null,
    catCols: catsLow.slice(0, 4).map((c) => c.name),
    entityCol: entity?.name ?? null,
    tableCols: cols.map((c) => c.name),
    numericCols: numerics.map((c) => c.name),
  };
}

// ── 브라우저 런타임 렌더 스크립트 (모든 블록을 __DATA/__SPEC 로 생성) ──
const RENDER_SCRIPT = String.raw`<script>(function(){
var esc=window.esc||function(v){return String(v==null?'':v);};
var S=window.__SPEC||{},D=window.__DATA||[],PAL=S.palette||['#3182F6','#64A8FF','#90C2FF','#C9E2FF','#FFB331','#FFD98E','#B0B8C1'];
var N=D.length;
function num(v){var n=Number(String(v==null?'':v).replace(/[, %]/g,''));return isNaN(n)?0:n;}
function fmt(n){return Number(Math.round(n)).toLocaleString('ko-KR');}
function money(n){var a=Math.abs(n);if(a>=1e8)return (n/1e8).toFixed(1)+'억';if(a>=1e4)return fmt(n/1e4)+'만';return fmt(n);}
function set(id,v){var e=document.getElementById(id);if(e)e.textContent=v;}
function has(id){return !!document.getElementById(id);}
function html(id,v){var e=document.getElementById(id);if(e)e.innerHTML=v;}
var MC=S.metricCol,DC=S.dateCol,QC=S.qtyCol;
function mkey(r){var d=String(r[DC]||'').slice(0,7).replace(/[/.]/g,'-');return /^\d{4}-\d{2}$/.test(d)?d:'';}
function groupSum(col,valfn){var m={};D.forEach(function(r){var k=r[col];k=(k==null||k==='')?'미상':String(k);m[k]=(m[k]||0)+(valfn?valfn(r):1);});return m;}
function top(o,n){return Object.keys(o).map(function(k){return [k,o[k]];}).sort(function(a,b){return b[1]-a[1];}).slice(0,n);}
function monthsAgg(valfn){var m={};D.forEach(function(r){var k=mkey(r);if(!k)return;m[k]=(m[k]||0)+(valfn?valfn(r):1);});var ks=Object.keys(m).sort();return {ks:ks,vs:ks.map(function(k){return m[k];})};}
var mCount=DC?monthsAgg(null):{ks:[],vs:[]};
var mMetric=(DC&&MC)?monthsAgg(function(r){return num(r[MC]);}):{ks:[],vs:[]};
var totMetric=MC?D.reduce(function(a,r){return a+num(r[MC]);},0):0;
var avgTicket=N?totMetric/N:0;
Chart&&(Chart.defaults.font.family='Pretendard Variable,Pretendard,system-ui,sans-serif',Chart.defaults.maintainAspectRatio=false,Chart.defaults.color='#8B95A1');
function mkChart(el,cfg){try{if(window.Chart&&el)return new Chart(el,cfg);}catch(e){}}
function spark(id,vals,color){var el=document.getElementById(id);if(!el||!vals.length)return;mkChart(el,{type:'line',data:{labels:vals.map(function(_,i){return i;}),datasets:[{data:vals,borderColor:color||PAL[0],borderWidth:2,pointRadius:0,fill:true,backgroundColor:'rgba(49,130,246,.08)',tension:.4}]},options:{plugins:{legend:{display:false},tooltip:{enabled:false}},scales:{x:{display:false},y:{display:false}}}});}
function pct(a,b){return b?Math.round(a/b*1000)/10:0;}
function deltaBadge(cur,prev){var d=prev?((cur-prev)/prev*100):0;var up=d>=0;return '<span class="ds-delta '+(up?'ds-delta--up':'ds-delta--down')+'">'+(up?'▲':'▼')+' '+Math.abs(Math.round(d*10)/10)+'%</span>';}

// ── HERO ──
if(has('heroVal')){set('heroLabel','총 '+S.metricLabel);set('heroVal',MC?money(totMetric):fmt(N)+'건');
var lc=mMetric.vs.length,dl=lc>=2?deltaBadge(mMetric.vs[lc-1],mMetric.vs[lc-2]):'';html('heroDelta',dl?dl+' <span style="color:var(--gray-500);font-weight:600;font-size:13px">전월 대비</span>':'');
set('heroSub',MC?('평균 객단가 '+money(avgTicket)+' · 총 '+fmt(N)+'건'):'');
spark('heroSpark',(MC?mMetric:mCount).vs,PAL[0]);}

// ── KPI (4) + 스파크라인 ──
var kpiDefs=[{l:'주문 건수',v:fmt(N),s:mCount.vs},
{l:'총 '+S.metricLabel,v:MC?money(totMetric):'—',s:mMetric.vs},
{l:'평균 객단가',v:MC?money(avgTicket):'—',s:mMetric.ks.map(function(k,i){return mCount.vs[i]?mMetric.vs[i]/mCount.vs[i]:0;})},
{l:S.binaryCol?(S.binaryCol+' 비율'):(QC?('평균 '+QC):'컬럼 수'),
 v:S.binaryCol?(pct(D.filter(function(r){return String(r[S.binaryCol]).trim()===S.binaryPositive;}).length,N)+'%'):(QC?fmt(D.reduce(function(a,r){return a+num(r[QC]);},0)/Math.max(N,1)):String((S.tableCols||[]).length)),
 s:mCount.vs}];
kpiDefs.forEach(function(k,i){set('kLabel'+i,k.l);set('kVal'+i,k.v);spark('spark'+i,k.s,PAL[0]);});

// ── 목표 게이지 ──
if(has('goalFill')&&mMetric.vs.length>=2){var cur=mMetric.vs[mMetric.vs.length-1];var hist=mMetric.vs.slice(0,-1);var avg=hist.reduce(function(a,b){return a+b;},0)/Math.max(hist.length,1);var target=avg*1.1;var p=Math.min(999,Math.round(cur/Math.max(target,1)*100));set('goalTitle','이번 달 '+S.metricLabel+' 목표');set('goalPct',p+'%');document.getElementById('goalFill').style.width=Math.min(100,p)+'%';set('goalSub','목표 '+money(target)+' 중 '+money(cur)+' 달성 (직전 평균 +10% 기준)');}

// ── 추이 라인(세그: 금액/건수) ──
var trendChart;
function drawTrend(mode){var d=mode==='count'?mCount:mMetric;if(trendChart)trendChart.destroy();
trendChart=mkChart(document.getElementById('trendChart'),{type:'line',data:{labels:d.ks,datasets:[{data:d.vs,borderColor:PAL[0],backgroundColor:'rgba(49,130,246,.10)',fill:true,tension:.4,pointRadius:0,borderWidth:2.5}]},options:{plugins:{legend:{display:false}},scales:{x:{grid:{display:false}},y:{beginAtZero:true,border:{display:false},grid:{color:'#F2F4F6'},ticks:{callback:function(v){return mode==='count'?fmt(v):money(v);}}}}}});}
if(has('trendChart')){drawTrend(MC?'metric':'count');
var seg=document.getElementById('trendSeg');if(seg)seg.querySelectorAll('button').forEach(function(b){b.onclick=function(){seg.querySelectorAll('button').forEach(function(x){x.classList.remove('on');});b.classList.add('on');drawTrend(b.getAttribute('data-mode'));};});}

// ── 콤보(건수 bar + 객단가 line) ──
if(has('comboChart')&&MC&&mCount.ks.length){var ticket=mCount.ks.map(function(k,i){return mCount.vs[i]?mMetric.vs[i]/mCount.vs[i]:0;});
mkChart(document.getElementById('comboChart'),{data:{labels:mCount.ks,datasets:[{type:'bar',label:'건수',data:mCount.vs,backgroundColor:PAL[3],borderRadius:6,maxBarThickness:36,yAxisID:'y'},{type:'line',label:'객단가',data:ticket,borderColor:PAL[4],backgroundColor:PAL[4],borderWidth:2.5,pointRadius:0,tension:.4,yAxisID:'y1'}]},options:{plugins:{legend:{display:true,position:'bottom',labels:{boxWidth:8,usePointStyle:true,font:{size:12}}}},scales:{x:{grid:{display:false}},y:{beginAtZero:true,border:{display:false},grid:{color:'#F2F4F6'}},y1:{position:'right',beginAtZero:true,border:{display:false},grid:{display:false},ticks:{callback:function(v){return money(v);}}}}}});}

// ── 히트맵 (요일 × 월) ──
if(has('heatmap')&&DC){var WD=['일','월','화','수','목','금','토'];var hm={};var mset={};
D.forEach(function(r){var s=String(r[DC]||'').slice(0,10).replace(/[/.]/g,'-');if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return;var dt=new Date(s);if(isNaN(dt))return;var mo=s.slice(0,7);mset[mo]=1;var key=dt.getDay()+'|'+mo;hm[key]=(hm[key]||0)+1;});
var mos=Object.keys(mset).sort();var mx=0;Object.keys(hm).forEach(function(k){if(hm[k]>mx)mx=hm[k];});
var HP=['#F2F4F6','#C9E2FF','#90C2FF','#64A8FF','#3182F6'];
function cell(v){if(!v)return HP[0];var t=v/Math.max(mx,1);return HP[Math.min(4,1+Math.floor(t*4))];}
if(mos.length){var g='<div style="display:grid;grid-template-columns:auto repeat('+mos.length+',1fr);gap:4px;align-items:center">';
g+='<div></div>'+mos.map(function(m){return '<div style="font-size:10px;color:var(--gray-500);text-align:center;font-weight:600">'+m.slice(5)+'</div>';}).join('');
for(var d0=0;d0<7;d0++){g+='<div style="font-size:11px;color:var(--gray-500);font-weight:600;padding-right:6px">'+WD[d0]+'</div>';
g+=mos.map(function(m){var v=hm[d0+'|'+m]||0;return '<div class="ds-hm-cell" title="'+WD[d0]+' '+m+': '+v+'건" style="aspect-ratio:1;min-height:22px;background:'+cell(v)+'"></div>';}).join('');}
g+='</div>';html('heatmap',g);}}

// ── 월 요약 표 (전월 대비) ──
if(has('monthTbl')&&mMetric.ks.length){var rows6=mMetric.ks.slice(-6);
var body=rows6.map(function(k){var i=mMetric.ks.indexOf(k);var cur=mMetric.vs[i],prev=i>0?mMetric.vs[i-1]:0;var cnt=mCount.vs[i];
return '<tr><td>'+k+'</td><td>'+fmt(cnt)+'</td><td>'+money(cur)+'</td><td>'+(prev?deltaBadge(cur,prev):'<span class="muted">–</span>')+'</td></tr>';}).join('');
html('monthTblHead','<tr><th>월</th><th>건수</th><th>'+S.metricLabel+'</th><th>전월대비</th></tr>');html('monthTblBody',body);}

// ── 범주 그룹1: 도넛 + 랭킹(아바타) + 상세표 ──
var cat0=(S.catCols||[])[0];
if(cat0){var g0=groupSum(cat0,MC?function(r){return num(r[MC]);}:null);var t0=top(g0,8);var sum0=t0.reduce(function(a,b){return a+b[1];},0);
set('grp0Title',cat0+'별 '+(MC?S.metricLabel+' 비중':'분포'));set('grp0Title2',cat0+'별 실적');set('grp0RankTitle',cat0+' 순위');
mkChart(document.getElementById('grp0Chart'),{type:'doughnut',data:{labels:t0.map(function(p){return p[0];}),datasets:[{data:t0.map(function(p){return p[1];}),backgroundColor:PAL,borderWidth:2,borderColor:'#fff'}]},options:{cutout:'64%',plugins:{legend:{position:'bottom',labels:{boxWidth:8,usePointStyle:true,font:{size:12}}}}}});
html('grp0Rank',t0.slice(0,6).map(function(p,i){return '<div class="ds-row"><div class="ds-row-avatar">'+esc(String(p[0]).slice(0,2))+'</div><div class="ds-row-main"><div class="ds-row-title">'+esc(p[0])+'</div><div class="ds-row-sub">비중 '+pct(p[1],sum0)+'%</div></div><div class="ds-row-val">'+(MC?money(p[1]):fmt(p[1]))+'</div></div>';}).join(''));
html('grp0TblHead','<tr><th>'+cat0+'</th><th>건수</th><th>'+(MC?S.metricLabel:'비율')+'</th><th>비중</th></tr>');
var cnt0=groupSum(cat0,null);
html('grp0TblBody',t0.map(function(p){return '<tr><td>'+esc(p[0])+'</td><td>'+fmt(cnt0[p[0]]||0)+'</td><td>'+(MC?money(p[1]):fmt(p[1]))+'</td><td class="muted">'+pct(p[1],sum0)+'%</td></tr>';}).join(''));}

// ── 스택바 + 범례 (범주 그룹2) ──
var cat1=(S.catCols||[])[1]||(S.catCols||[])[0];
if(has('stackbar')&&cat1){var g1=groupSum(cat1,null);var t1=top(g1,6);var s1=t1.reduce(function(a,b){return a+b[1];},0);set('grp1Title',cat1+' 구성');
html('stackbar',t1.map(function(p,i){return '<div style="width:'+pct(p[1],s1)+'%;background:'+PAL[i%PAL.length]+'"></div>';}).join(''));
html('stackLegend',t1.map(function(p,i){return '<div class="ds-legend-item"><span class="ds-legend-dot" style="background:'+PAL[i%PAL.length]+'"></span>'+esc(p[0])+' <span class="ds-legend-pct">'+pct(p[1],s1)+'%</span></div>';}).join(''));}

// ── 범주 그룹3 막대 ──
var cat2=(S.catCols||[])[2]||(S.catCols||[])[0];
if(has('grp2Chart')&&cat2){var g2=groupSum(cat2,MC?function(r){return num(r[MC]);}:null);var t2=top(g2,8);set('grp2Title',cat2+'별 '+(MC?S.metricLabel:'건수'));
mkChart(document.getElementById('grp2Chart'),{type:'bar',data:{labels:t2.map(function(p){return p[0];}),datasets:[{data:t2.map(function(p){return p[1];}),backgroundColor:PAL[0],borderRadius:6,maxBarThickness:40}]},options:{plugins:{legend:{display:false}},scales:{x:{grid:{display:false}},y:{beginAtZero:true,border:{display:false},grid:{color:'#F2F4F6'},ticks:{callback:function(v){return MC?money(v):fmt(v);}}}}}});}

// ── 상품(엔티티) 카드 + TOP 랭킹 ──
var EC=S.entityCol;
if(EC){var ge=groupSum(EC,MC?function(r){return num(r[MC]);}:null);var te=top(ge,6);var cntE=groupSum(EC,null);
function mono(s){return esc(String(s).replace(/\s/g,'').slice(0,2));}
if(has('prodGrid'))set('prodGridTitle',EC+' 베스트'),html('prodGrid',te.map(function(p,i){return '<div class="ds-prod"><div class="ds-prod-img" style="background:'+PAL[3]+'33;color:'+PAL[0]+';font-size:22px;font-weight:800">'+mono(p[0])+'</div><div class="ds-prod-body"><div class="ds-prod-cat">'+esc(cat0?String((D.find(function(r){return String(r[EC])===String(p[0]);})||{})[cat0]||''):'')+'</div><div class="ds-prod-name">'+esc(p[0])+'</div><div class="ds-prod-price">'+(MC?money(p[1]):fmt(p[1])+'건')+'</div></div></div>';}).join(''));
if(has('topEntities'))set('topEntTitle',EC+' TOP '+Math.min(5,te.length)),html('topEntities',te.slice(0,5).map(function(p,i){return '<div class="ds-row"><div class="ds-row-rank">'+(i+1)+'</div><div class="ds-row-thumb" style="background:'+PAL[3]+'33;color:'+PAL[0]+';font-size:14px;font-weight:700">'+mono(p[0])+'</div><div class="ds-row-main"><div class="ds-row-title">'+esc(p[0])+'</div><div class="ds-row-sub">'+fmt(cntE[p[0]]||0)+'건</div></div><div class="ds-row-val">'+(MC?money(p[1]):fmt(p[1]))+'</div></div>';}).join(''));}

// ── 인사이트: 팁 / 알림 / 피드 / 리포트 ──
if(has('tipText')&&cat0){var tb=top(groupSum(cat0,MC?function(r){return num(r[MC]);}:null),1)[0];if(tb)set('tipText',cat0+' 중 "'+tb[0]+'"이(가) '+(MC?S.metricLabel:'건수')+' 1위입니다. 전체의 '+pct(tb[1],MC?totMetric:N)+'%를 차지합니다.');}
if(has('notiList')){var noti=[];var tb2=cat0?top(groupSum(cat0,MC?function(r){return num(r[MC]);}:null),1)[0]:null;
if(tb2)noti.push(['최다 '+cat0,tb2[0]+' — '+(MC?money(tb2[1]):fmt(tb2[1])+'건')]);
if(S.binaryCol)noti.push([S.binaryCol+' 비율',pct(D.filter(function(r){return String(r[S.binaryCol]).trim()===S.binaryPositive;}).length,N)+'%']);
if(mMetric.ks.length>=2){var bm=mMetric.ks[mMetric.vs.indexOf(Math.max.apply(null,mMetric.vs))];noti.push(['최고 실적 월',bm+' — '+money(Math.max.apply(null,mMetric.vs))]);}
if(EC){var te2=top(groupSum(EC,MC?function(r){return num(r[MC]);}:null),1)[0];if(te2)noti.push(['베스트 '+EC,te2[0]]);}
html('notiList',noti.slice(0,4).map(function(x){return '<div class="ds-noti"><div class="ds-noti-icon" style="background:var(--blue-100)"><span style="width:8px;height:8px;border-radius:50%;background:var(--blue-500)"></span></div><div><div class="ds-noti-title">'+esc(x[0])+'</div><div class="ds-noti-body">'+esc(x[1])+'</div></div></div>';}).join(''));}
if(has('feedList')&&DC){var sorted=D.slice().filter(function(r){return String(r[DC]);}).sort(function(a,b){return String(b[DC]).localeCompare(String(a[DC]));}).slice(0,6);
html('feedList',sorted.map(function(r){var t=EC?esc(r[EC]):(cat0?esc(r[cat0]):'레코드');return '<div class="ds-feed-item"><div class="ds-noti-title" style="font-size:14px">'+t+'</div><div class="ds-noti-time">'+esc(String(r[DC]).slice(0,10))+(MC?' · '+money(num(r[MC])):'')+'</div></div>';}).join(''));}
if(has('reportBody')){var parts=[];var tb3=cat0?top(groupSum(cat0,MC?function(r){return num(r[MC]);}:null),3):[];
parts.push('<p>총 <strong>'+fmt(N)+'건</strong>의 레코드를 분석했습니다.'+(MC?' 총 '+S.metricLabel+'은(는) <strong>'+money(totMetric)+'</strong>, 평균 객단가는 <strong>'+money(avgTicket)+'</strong>입니다.':'')+'</p>');
if(tb3.length)parts.push('<div class="ds-quote">'+cat0+' 1위는 '+tb3[0][0]+', 전체의 '+pct(tb3[0][1],MC?totMetric:N)+'%를 차지합니다.</div>');
if(mMetric.ks.length>=2){var g=deltaBadge(mMetric.vs[mMetric.vs.length-1],mMetric.vs[mMetric.vs.length-2]);parts.push('<p>최근 월 '+S.metricLabel+'은(는) 전월 대비 '+g.replace(/<[^>]+>/g,'').trim()+' 변화했습니다.</p>');}
if(tb3.length)parts.push('<div style="margin-top:14px;display:flex;gap:8px;flex-wrap:wrap">'+tb3.map(function(p){return '<span class="ds-tag">'+esc(p[0])+'</span>';}).join('')+'</div>');
html('reportBody',parts.join(''));}

// ── 전체 표 (검색 + 페이지네이션) ──
var cols=S.tableCols||Object.keys(D[0]||{}),nums=S.numericCols||[];
var th=document.getElementById('thead');if(th)th.innerHTML='<tr>'+cols.map(function(c){return '<th>'+esc(c)+'</th>';}).join('')+'</tr>';
var P=1,SZ=12,F=D,tb=document.getElementById('tb'),q=document.getElementById('q'),cn=document.getElementById('cnt'),pv=document.getElementById('pv'),nx=document.getElementById('nx'),pi=document.getElementById('pi');
function draw(){if(!tb)return;var pg=Math.max(1,Math.ceil(F.length/SZ));if(P>pg)P=pg;var sl=F.slice((P-1)*SZ,(P-1)*SZ+SZ);
tb.innerHTML=sl.length?sl.map(function(r){return '<tr>'+cols.map(function(c){return '<td'+(nums.indexOf(c)>=0?'':' class="muted"')+'>'+esc(r[c])+'</td>';}).join('')+'</tr>';}).join(''):'<tr><td colspan="'+cols.length+'" style="text-align:center;color:var(--gray-500);padding:24px">검색 결과가 없습니다.</td></tr>';
if(cn)cn.textContent='전체 '+fmt(F.length)+'건';if(pi)pi.textContent=P+' / '+pg;if(pv)pv.disabled=P<=1;if(nx)nx.disabled=P>=pg;}
if(q)q.addEventListener('input',function(){var s=q.value.trim().toLowerCase();F=!s?D:D.filter(function(r){return cols.some(function(c){return String(r[c]).toLowerCase().indexOf(s)>=0;});});P=1;draw();});
if(pv)pv.onclick=function(){if(P>1){P--;draw();}};if(nx)nx.onclick=function(){P++;draw();};draw();
})();</script>`;

// 생성 대시보드 보조 CSS (디자인시스템 토큰 사용)
const EXTRA_CSS = `
*{margin:0;padding:0;box-sizing:border-box}
.g-header{padding:16px 4px 24px;display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap}
.g-eyebrow{font-size:14px;font-weight:600;color:var(--gray-500);margin-bottom:6px}
.g-header h1{font-size:26px;font-weight:800;letter-spacing:-.03em}
.g-period{font-size:14px;color:var(--gray-500);margin-top:6px;font-weight:500}
.g-hero{background:var(--white);border-radius:var(--radius-card);padding:28px;margin-bottom:var(--card-gap);display:flex;justify-content:space-between;align-items:center;gap:20px}
.g-hero .label{font-size:15px;font-weight:600;color:var(--gray-700)}
.g-hero .value{font-size:var(--text-display);font-weight:800;letter-spacing:-.035em;margin-top:6px}
.g-hero .sub{font-size:13px;color:var(--gray-500);margin-top:12px;font-weight:500}
.g-hero .hv{flex-shrink:0;width:200px;height:70px}
.g-kpi-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:var(--card-gap);margin-bottom:var(--card-gap)}
.g-kpi-grid .ds-card{margin-bottom:0;padding:20px 22px 14px;min-width:0}
.g-spark{height:34px;margin-top:10px;overflow:hidden}
.g-spark canvas,.g-chart-box canvas{max-width:100%}
@media(max-width:760px){.g-kpi-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
.g-goal{background:linear-gradient(135deg,var(--blue-500) 0%,#1B64DA 100%);border-radius:var(--radius-card);padding:26px 28px;margin-bottom:var(--card-gap);color:#fff}
.g-goal .gh{display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px}
.g-goal .gt{font-size:16px;font-weight:700}.g-goal .gp{font-size:28px;font-weight:800;letter-spacing:-.03em}
.g-goal .gbar{height:12px;background:rgba(255,255,255,.25);border-radius:6px;margin:16px 0 12px;overflow:hidden}
.g-goal .gfill{height:100%;width:0;background:#fff;border-radius:6px;transition:width 1.2s cubic-bezier(.2,.7,.3,1)}
.g-goal .gs{font-size:13px;font-weight:500;opacity:.9;line-height:1.5}
.g-chart-box{position:relative;height:280px}.g-chart-box.sm{height:240px}
.g-search{padding:9px 14px;border:1px solid var(--gray-200);border-radius:10px;font:inherit;font-size:14px;color:var(--gray-900);background:var(--white)}
.g-pager{display:flex;gap:6px;justify-content:flex-end;align-items:center;margin-top:14px}
.g-pager button{border:none;background:var(--gray-100);color:var(--gray-700);font:inherit;font-weight:600;font-size:13px;padding:7px 12px;border-radius:8px;cursor:pointer}
.g-pager button:disabled{opacity:.4;cursor:default}
.g-tbl-scroll{overflow-x:auto;margin:0 -4px;padding:0 4px}
.ds-tbl td.muted{color:var(--gray-700);font-weight:600;font-size:14px}
.g-prod-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
@media(max-width:760px){.g-prod-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
.ds-two-col{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
.ds-two-col > *{min-width:0}
@media(max-width:760px){.ds-two-col{grid-template-columns:minmax(0,1fr)}}
`;

// ── HTML 조립 (모든 섹션; 데이터에 따라 일부 블록은 런타임에 자동 비움) ──
function card(title: string, inner: string, sub?: string, sm?: boolean): string {
  return `<div class="ds-card"><div class="ds-card-head"><div><div class="ds-card-title">${title}</div>${sub ? `<div class="ds-card-desc">${sub}</div>` : ""}</div></div>${inner}</div>`;
}
function chartCard(id: string, titleId: string, sm: boolean): string {
  return `<div class="ds-card"><div class="ds-card-head"><div><div class="ds-card-title" id="${titleId}">차트</div></div></div><div class="g-chart-box${sm ? " sm" : ""}"><canvas id="${id}"></canvas></div></div>`;
}

export function renderDashboard(spec: DashboardSpec, dataFile: string, sheet: string, templateId: string): string {
  const t = TEMPLATES[templateId] ?? TEMPLATES.template1;
  const hasDate = !!spec.dateCol;
  const hasMetric = !!spec.metricCol;

  const hero = `<div class="g-hero"><div><div class="label" id="heroLabel">–</div><div class="value" id="heroVal">–</div><div id="heroDelta" style="margin-top:10px"></div><div class="sub" id="heroSub"></div></div><div class="hv"><canvas id="heroSpark"></canvas></div></div>`;

  const kpiGrid =
    `<div class="g-kpi-grid">` +
    [0, 1, 2, 3]
      .map(
        (i) =>
          `<div class="ds-card"><div class="ds-kpi-label" id="kLabel${i}">–</div><div class="ds-kpi-value" id="kVal${i}">–</div><div class="g-spark"><canvas id="spark${i}"></canvas></div></div>`,
      )
      .join("") +
    `</div>`;

  const goal = hasDate && hasMetric
    ? `<div class="g-goal"><div class="gh"><div class="gt" id="goalTitle">목표</div><div class="gp" id="goalPct">–</div></div><div class="gbar"><div class="gfill" id="goalFill"></div></div><div class="gs" id="goalSub"></div></div>`
    : "";

  // 추이 섹션
  const trendCard = hasDate
    ? `<div class="ds-card"><div class="ds-card-head"><div><div class="ds-card-title">${hasMetric ? spec.metricLabel + " 추이" : "월별 건수 추이"}</div></div>${hasMetric ? `<div class="ds-seg" id="trendSeg"><button class="on" data-mode="metric">${spec.metricLabel}</button><button data-mode="count">건수</button></div>` : ""}</div><div class="g-chart-box"><canvas id="trendChart"></canvas></div></div>`
    : "";
  const combo = hasDate && hasMetric ? chartCard("comboChart", "comboTitle", false).replace('id="comboTitle">차트', 'id="comboTitle">건수와 객단가') : "";
  const heatAndMonth = hasDate
    ? `<div class="ds-two-col">${card("요일 × 월 히트맵", `<div id="heatmap"></div>`, "주문 밀도")}${card(`최근 6개월 요약`, `<div class="g-tbl-scroll"><table class="ds-tbl"><thead id="monthTblHead"></thead><tbody id="monthTblBody"></tbody></table></div>`)}</div>`
    : "";
  const trendSection = hasDate ? `<div class="ds-section-title">추이</div>${trendCard}${combo}${heatAndMonth}` : "";

  // 범주 그룹1
  const cat0 = spec.catCols[0];
  const grp0 = cat0
    ? `<div class="ds-section-title" id="grp0Section">${cat0}</div>` +
      `<div class="ds-two-col">` +
      `<div class="ds-card"><div class="ds-card-head"><div><div class="ds-card-title" id="grp0Title">비중</div></div></div><div class="g-chart-box sm"><canvas id="grp0Chart"></canvas></div></div>` +
      `<div class="ds-card"><div class="ds-card-head"><div><div class="ds-card-title" id="grp0RankTitle">순위</div></div></div><div id="grp0Rank"></div></div>` +
      `</div>` +
      `<div class="ds-card"><div class="ds-card-head"><div><div class="ds-card-title" id="grp0Title2">상세</div></div></div><div class="g-tbl-scroll"><table class="ds-tbl"><thead id="grp0TblHead"></thead><tbody id="grp0TblBody"></tbody></table></div></div>`
    : "";

  // 구성(스택바) + 범주3 막대
  const cat1 = spec.catCols[1];
  const cat2 = spec.catCols[2];
  const compRow =
    (cat1 ? card(`<span id="grp1Title">구성</span>`, `<div class="ds-stackbar" id="stackbar" style="margin:18px 0 16px"></div><div class="ds-legend" id="stackLegend"></div>`) : "") +
    (cat2 ? chartCard("grp2Chart", "grp2Title", true) : "");
  const compSection = cat1 || cat2 ? `<div class="ds-section-title">구성</div>${cat1 && cat2 ? `<div class="ds-two-col">${compRow}</div>` : compRow}` : "";

  // 엔티티(상품)
  const entity = spec.entityCol
    ? `<div class="ds-section-title" id="entSection">${spec.entityCol}</div>` +
      `<div class="ds-card"><div class="ds-card-head"><div><div class="ds-card-title" id="prodGridTitle">베스트</div></div></div><div class="g-prod-grid" id="prodGrid"></div></div>` +
      `<div class="ds-card"><div class="ds-card-head"><div><div class="ds-card-title" id="topEntTitle">TOP</div></div></div><div id="topEntities"></div></div>`
    : "";

  // 인사이트
  const insight =
    `<div class="ds-section-title">인사이트</div>` +
    (cat0 ? `<div class="ds-tip" id="tipText" style="margin-bottom:var(--card-gap)"></div>` : "") +
    `<div class="ds-two-col">` +
    `<div class="ds-card"><div class="ds-card-head"><div><div class="ds-card-title">주요 알림</div></div></div><div id="notiList"></div></div>` +
    (hasDate ? `<div class="ds-card"><div class="ds-card-head"><div><div class="ds-card-title">최근 활동</div></div></div><div class="ds-feed" id="feedList"></div></div>` : `<div class="ds-card"><div class="ds-card-title">요약 리포트</div><div class="ds-report" id="reportBody" style="margin-top:12px"></div></div>`) +
    `</div>` +
    (hasDate ? `<div class="ds-card"><div class="ds-card-title">요약 리포트</div><div class="ds-report" id="reportBody" style="margin-top:12px"></div></div>` : "");

  const table =
    `<div class="ds-section-title">데이터</div>` +
    `<div class="ds-card"><div class="ds-card-head"><div><div class="ds-card-title">전체 데이터</div><div class="ds-card-desc" id="cnt"></div></div><input id="q" class="g-search" type="search" placeholder="검색"></div>` +
    `<div class="g-tbl-scroll"><table class="ds-tbl"><thead id="thead"></thead><tbody id="tb"></tbody></table></div>` +
    `<div class="g-pager"><span id="pi" style="margin-right:auto;font-size:12px;color:var(--gray-500)"></span><button id="pv">이전</button><button id="nx">다음</button></div></div>`;

  const specJson = JSON.stringify({ ...spec, palette: t.palette });

  return (
    `<!doctype html><html lang="ko"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width,initial-scale=1"><title>${spec.title}</title>` +
    `<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">` +
    `<script>{{BCAVE_CHARTJS}}</script>` +
    `<style>${t.css}\n${EXTRA_CSS}\n:where(body){word-break:keep-all;overflow-wrap:break-word}</style></head>` +
    `<body class="ds-body"><div class="ds-wrap">` +
    `<div class="g-header"><div><div class="g-eyebrow">DASHBOARD</div><h1>${spec.title}</h1><div class="g-period">${spec.subtitle}</div></div></div>` +
    `<div class="ds-section-title">핵심 지표</div>${hero}${kpiGrid}${goal}` +
    trendSection +
    grp0 +
    compSection +
    entity +
    insight +
    table +
    `</div>` +
    `<script>window.__SPEC=${specJson};window.__DATA={{BCAVE_DATA:${dataFile}#${sheet}}};</script>` +
    RENDER_SCRIPT +
    `</body></html>`
  );
}

export function buildDashboard(filePath: string, templateId: string): { html: string; sheet: string; rowCount: number; spec: DashboardSpec } {
  const { rows, sheet } = readRows(filePath);
  const title = filePath.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "대시보드";
  const spec = buildSpec(profileColumns(rows), title, rows.length);
  const html = renderDashboard(spec, filePath, sheet, templateId);
  return { html, sheet, rowCount: rows.length, spec };
}
