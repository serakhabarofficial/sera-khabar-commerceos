import { describe, expect, it } from "vitest";
import { format } from "date-fns";
import { buildDateRangeMenu, buildDateRangePresets } from "@/lib/dateRangePresets";

function ymd(date: Date | undefined) {
  return date ? format(date, "yyyy-MM-dd") : null;
}

function find(label: string, today: Date, hour?: number) {
  return buildDateRangePresets(today, hour).find((preset) => preset.label === label);
}

describe("buildDateRangePresets", () => {
  it("uses a Sunday-start Bangladesh week through the current date", () => {
    const weekToDate = find("Week to date", new Date(2026, 8, 16));

    expect(ymd(weekToDate?.range?.from)).toBe("2026-09-13");
    expect(ymd(weekToDate?.range?.to)).toBe("2026-09-16");
  });

  it("uses the complete preceding calendar month", () => {
    const lastMonth = find("Last month", new Date(2026, 2, 15));

    expect(ymd(lastMonth?.range?.from)).toBe("2026-02-01");
    expect(ymd(lastMonth?.range?.to)).toBe("2026-02-28");
  });

  it("puts the eleven Last options in one submenu, in order", () => {
    const last = buildDateRangeMenu(new Date(2026, 9, 15))
      .flatMap((group) => group.items)
      .find((item) => item.kind === "submenu" && item.label === "Last");

    expect(last?.kind === "submenu" && last.presets.map((preset) => preset.label)).toEqual([
      "Last 30 minutes", "Last 12 hours", "Last 7 days", "Last 30 days", "Last 90 days", "Last 365 days",
      "Last week", "Last month", "Last quarter", "Last 12 months", "Last year",
    ]);
  });

  it("reaches back into yesterday for Last 12 hours only before noon", () => {
    const today = new Date(2026, 9, 15);

    expect(ymd(find("Last 12 hours", today, 9)?.range?.from)).toBe("2026-10-14");
    expect(ymd(find("Last 12 hours", today, 15)?.range?.from)).toBe("2026-10-15");
  });

  it("covers whole previous periods for Last week, Last quarter and Last year", () => {
    const today = new Date(2026, 9, 15);

    expect([ymd(find("Last week", today)?.range?.from), ymd(find("Last week", today)?.range?.to)]).toEqual(["2026-10-04", "2026-10-10"]);
    expect([ymd(find("Last quarter", today)?.range?.from), ymd(find("Last quarter", today)?.range?.to)]).toEqual(["2026-07-01", "2026-09-30"]);
    expect([ymd(find("Last year", today)?.range?.from), ymd(find("Last year", today)?.range?.to)]).toEqual(["2025-01-01", "2025-12-31"]);
  });

  it("offers the latest Eid that has already happened, as the week up to Eid day", () => {
    const eid = find("Eid ul-Adha 2026", new Date(2026, 9, 15));

    expect([ymd(eid?.range?.from), ymd(eid?.range?.to)]).toEqual(["2026-05-21", "2026-05-27"]);
    expect(find("Eid ul-Adha 2026", new Date(2026, 3, 1))).toBeUndefined();
  });

  it("keeps the current quarter open-ended at today", () => {
    const q4 = find("Q4 2026", new Date(2026, 9, 15));

    expect([ymd(q4?.range?.from), ymd(q4?.range?.to)]).toEqual(["2026-10-01", "2026-10-15"]);
  });
});
