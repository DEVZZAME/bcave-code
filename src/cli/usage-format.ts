import type { HubUsage } from "../auth/hub.js";

export function formatUsd(value: number): string {
  if (value === 0) return "$0.00";
  return value < 1 ? `$${value.toFixed(4)}` : `$${value.toFixed(2)}`;
}

export interface UsageRow {
  key: "daily" | "weekly" | "monthly";
  label: string;
  used: string;
  limit: string;
  percentage: string;
  reset: string;
}

export function usageRows(usage: HubUsage, locale = "ko-KR"): UsageRow[] {
  const labels = { daily: "오늘", weekly: "이번 주", monthly: "이번 달" } as const;
  return (["daily", "weekly", "monthly"] as const).map((key) => {
    const period = usage.periods[key];
    return {
      key,
      label: labels[key],
      used: formatUsd(period.used),
      limit: period.limit === 0 ? "무제한" : formatUsd(period.limit),
      percentage: period.limit > 0 ? ` (${Math.min(100, Math.round((period.used / period.limit) * 100))}%)` : "",
      reset: new Date(period.reset).toLocaleString(locale, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }),
    };
  });
}
