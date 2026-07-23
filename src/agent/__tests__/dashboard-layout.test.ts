import { describe, expect, it } from "vitest";
import { dashboardLayoutBrief } from "../dashboard-layout.js";

describe("dashboardLayoutBrief", () => {
  it("selects distinct structures from the dashboard purpose", () => {
    expect(dashboardLayoutBrief("실시간 장애 모니터링 대시보드").layout).toBe("monitoring");
    expect(dashboardLayoutBrief("브랜드별 전년 대비 대시보드").layout).toBe("comparison");
    expect(dashboardLayoutBrief("매출 감소 원인 분석 대시보드").layout).toBe("diagnostic");
    expect(dashboardLayoutBrief("주문 상세 목록 대시보드").layout).toBe("table-first");
  });
});
