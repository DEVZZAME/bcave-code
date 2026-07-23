export type DashboardLayout = "executive" | "monitoring" | "comparison" | "diagnostic" | "funnel" | "table-first";

export interface DashboardLayoutBrief {
  layout: DashboardLayout;
  guide: string;
}

export function dashboardLayoutBrief(message: string): DashboardLayoutBrief {
  if (/퍼널|전환|단계|이탈|funnel|conversion/i.test(message)) {
    return { layout: "funnel", guide: "단계 흐름형: KPI 그리드 대신 전환 단계와 이탈 지점을 주인공으로 두고, 보조 추이는 하단에 배치한다." };
  }
  if (/실시간|모니터링|관제|상태|장애|알림|운영/i.test(message)) {
    return { layout: "monitoring", guide: "모니터링형: 상태 스트립과 주요 시계열을 먼저 보여주고, 경고·이상 항목을 사이드 레일에 배치한다." };
  }
  if (/비교|대비|전년|전월|조직별|지역별|브랜드별|compare/i.test(message)) {
    return { layout: "comparison", guide: "비교형: 동일 기준의 두 집단 또는 기간을 나란히 놓고 차이와 순위를 중심으로 구성한다." };
  }
  if (/원인|분석|기여|상관|왜|진단|diagnos/i.test(message)) {
    return { layout: "diagnostic", guide: "진단형: 핵심 결과 하나와 원인 분해 차트를 2:1로 배치하고 근거 테이블을 이어 붙인다." };
  }
  if (/목록|현황표|표\s*중심|테이블|상세|명세|재고|주문|table/i.test(message)) {
    return { layout: "table-first", guide: "테이블 우선형: 검색·필터와 상세 테이블을 중심에 두고 필요한 요약 지표만 얇은 스트립으로 제공한다." };
  }
  return { layout: "executive", guide: "경영 요약형: 가장 중요한 결론과 추세를 먼저 보여주되, 관성적인 KPI 4개·hero·도넛 조합은 데이터가 정당화할 때만 사용한다." };
}
