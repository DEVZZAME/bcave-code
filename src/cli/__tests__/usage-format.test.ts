import { describe, expect, it } from "vitest";
import { formatUsd, usageRows } from "../usage-format.js";

describe("usage formatting", () => {
  it("keeps precision for sub-dollar usage", () => {
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(0.01234)).toBe("$0.0123");
    expect(formatUsd(12.345)).toBe("$12.35");
  });

  it("formats limits and caps percentages", () => {
    const period = { used: 2, limit: 1, reset: "2026-07-23T00:00:00Z" };
    const rows = usageRows({ role: "USER", tierName: "Basic", hasAccess: true, periods: { daily: period, weekly: { ...period, limit: 0 }, monthly: period } }, "en-US");
    expect(rows[0].percentage).toBe(" (100%)");
    expect(rows[1].limit).toBe("무제한");
  });
});
