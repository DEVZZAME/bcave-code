# AXIS Design System — RULES v0.1 (기계용)

너는 AXIS 디자인 시스템으로 화면을 설계한다. 토큰과 컴포넌트 스타일은 만들지 않지만, 정보 구조와 레이아웃은 데이터의 목적에 맞게 선택한다.

AXIS의 정체성: 쿨그레이 + 코발트 단일 액센트, "하나의 토큰, 두 가지 밀도"(플랫폼=comfortable,
대시보드=compact), 차트는 8색 팔레트로 카테고리를 뚜렷이 구분한다 (BCAVE처럼 모노톤이 아님).

## 출력 범위

- 출력 = `<body>` 내부 마크업 + 차트/데이터 바인딩 스크립트 1개.
- `axis-tokens.css` / `axis-ui.css` / `axis-chart.js` 는 CLI가 주입한다.

## NEVER (하나라도 위반하면 실패)

1. `<style>` 블록 작성 금지. CSS 선언 금지.
2. `style=` 인라인 속성 금지. (진행률 등은 `.w-70` 유틸 클래스 사용)
3. hex 색상(`#xxxxxx`) · `rgb()` · 색상명 직접 입력 금지.
4. `font-family` 지정 금지. 외부 폰트 로드 금지.
5. `new Chart(...)` 직접 호출 금지 → 런타임 예외. 반드시 `AXIS.chart.*` 사용.
6. 차트 색상 직접 지정 금지 (팔레트는 래퍼가 자동 배정).
7. 이중 Y축 금지.
8. 시리즈·카테고리 8개 초과 금지 (도넛·막대는 상위 7 + "기타"로 묶기).
9. `axis-ui.css`에 없는 클래스 발명 금지.
10. 금액을 `13,531,000원` 형태로 출력 금지 → 반드시 `AXIS.fmt.krw()`.
11. `.delta` 클래스는 증감률 전용. 설명 텍스트에 사용 금지 (설명은 `.kpi .sub`).
12. 밀도는 `data-density` 속성으로만 전환. 컴포넌트별 크기를 직접 재정의 금지.

## MUST

- `.topbar`와 `.page`를 기본 셸로 사용한다. `.density-toggle`, `.hero`, `.sec-head`, KPI, 차트, 표의 존재와 순서는 목적에 따라 선택한다.
- 모든 숫자 표기: 금액 `AXIS.fmt.krw(n)` · 건수 `AXIS.fmt.num(n)+'건'` · 비율 `AXIS.fmt.pct(x)` · 증감 `AXIS.fmt.delta(x)`.
- 숫자를 담는 요소에 `class="num"`.
- 차트 범례는 `AXIS.chart.legendHtml()` 로 생성 (Chart.js 기본 범례는 이미 꺼져 있음).
- 테이블 증감 셀: `<td class="r num up">` / `down`.
- 카테고리(브랜드·세그먼트 등) 비교는 막대·도넛에서 팔레트 자동 순환을 그대로 둔다 — 강제로 단색화하지 말 것 (BCAVE 규칙과 반대).

## 레이아웃 선택

마크업 전에 내부적으로 `사용자 질문 → 핵심 결론 → 주 시각화 → 보조 근거 → 레이아웃`을 정한다. 아래 중 하나를 주 구조로 선택하며, 모든 대시보드를 KPI 4개 + 선형 차트 + 도넛 + 표 순서로 만들지 않는다.

- 경영 요약: `.metric-strip` + 핵심 차트 하나 + `.insight-panel`
- 실시간 모니터링: `.metric-strip` + `.layout-main-rail`(시계열/경고)
- 비교 분석: `.split-feature` 또는 `.grid-2`
- 원인 진단: `.layout-main-rail`(원인 분해/근거 목록)
- 상세 운영: 필터 + `.table-wrap` 중심, 지표는 필요한 만큼만
- 흐름·퍼널: `.section-flow` 안에 단계/진행률과 보조 추이

hero와 도넛은 데이터와 목적이 정당화할 때만 사용한다. 최근 산출물이나 예제의 섹션 순서를 복제하지 않는다.

## 마크업 레시피 (필요한 것만 선택)

### 페이지 골격
```html
<div class="topbar"><div class="topbar-inner">
  <div class="logo">AXIS</div>
  <nav><a href="#s1">개요</a><a href="#s2">브랜드</a></nav>
  <div class="density-toggle">
    <button class="on" onclick="AXIS.setDensity('comfortable');this.classList.add('on');this.nextElementSibling.classList.remove('on')">플랫폼</button>
    <button onclick="AXIS.setDensity('compact');this.classList.add('on');this.previousElementSibling.classList.remove('on')">대시보드</button>
  </div>
</div></div>
<div class="page">
  <div class="sec-head" id="s1">
    <div class="kicker">Overview</div><h2>월별 매출 추이</h2>
    <p>보조 설명 한 줄.</p>
  </div>
  <!-- 콘텐츠 블록 -->
</div>
```

### KPI 예시 (개수 가변)
```html
<div class="kpi-grid">
  <div class="kpi"><div class="lb">총매출</div><div class="val num" id="kpiSales"></div><span class="delta up" id="kpiSalesDelta"></span></div>
  <div class="kpi"><div class="lb">주문건수</div><div class="val num" id="kpiOrders"></div><div class="sub">누적 주문</div></div>
  <div class="kpi"><div class="lb">평균객단가</div><div class="val num" id="kpiAov"></div><div class="sub">매출 ÷ 주문</div></div>
  <div class="kpi"><div class="lb">고객수</div><div class="val num" id="kpiCust"></div><div class="sub">RFM 기준</div></div>
</div>
```

### 차트 카드 (선형)
```html
<div class="card full">
  <h3>월별 매출 추이</h3>
  <div class="chart-box"><canvas id="salesChart"></canvas></div>
  <div id="salesLegend"></div>
</div>
```
```js
AXIS.chart.line(document.getElementById('salesChart'), {
  labels: months, unit: 'krw',
  series: [
    { label: '총매출', data: sales, emphasis: true },
    { label: '전년 동기', data: lastYear, compare: true }
  ]
});
AXIS.chart.legendHtml(document.getElementById('salesLegend'),
  [{label:'총매출', colorIndex:0, line:true}, {label:'전년 동기', line:true, compare:true}]);
```

### 도넛 · 막대 · 곡선 · 게이지
```js
AXIS.chart.donut(el, { labels, data, centerKpi: AXIS.fmt.krw(total), centerSub: '6월 총매출' });
AXIS.chart.bar(el, { labels: brands, data: values, unit: 'krw' });   // 카테고리별 자동 다색
AXIS.chart.curve(el, { labels, series: [{ label:'이번 달', data: cur, emphasis:true },
                                         { label:'지난 달', data: prev, compare:true }] });
AXIS.chart.gauge(el, { value: 0.82 });
```

### 테이블
```html
<div class="card full">
  <h3>브랜드별 실적</h3>
  <table class="axis"><thead><tr>
    <th>브랜드</th><th class="r">총매출</th><th class="r">전월 대비</th><th>상태</th>
  </tr></thead><tbody id="brandRows"></tbody></table>
</div>
```
```js
rows.map(r => `<tr><td>${r.name}</td><td class="r num">${AXIS.fmt.krw(r.sales)}</td>
  <td class="r num ${r.mom >= 0 ? 'up' : 'down'}">${AXIS.fmt.delta(r.mom)}</td>
  <td><span class="badge ${r.ok ? 'badge-success' : 'badge-danger'}"><i></i>${r.ok ? '정상' : '이탈 위험'}</span></td></tr>`).join('')
```

### 진행률 · 배지
```html
<div class="progress"><i class="w-72"></i></div>
<span class="badge badge-primary"><i></i>진행 중</span>
```

## 제출 전 자가 점검

- [ ] `<style>` / `style=` / hex / font-family 0건
- [ ] 모든 차트가 `AXIS.chart.*` 경유
- [ ] 모든 금액이 `AXIS.fmt.krw` 경유 (…원 표기 0건)
- [ ] 사용 클래스 전부 axis-ui.css에 존재
- [ ] 밀도 전환은 `data-density` 속성으로만
