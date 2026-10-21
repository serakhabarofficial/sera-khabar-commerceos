import { describe, expect, it } from "vitest";
import { countHoldAges, countHoldReasons, filterHeldOrders, holdAgeKey, holdDays } from "@/lib/orderHoldFilters";

// 21 Oct 2026, 6 pm in Dhaka.
const NOW = new Date("2026-10-21T12:00:00Z");

const order = (id: string, startedAt: string, code: string | null) => ({ id, hold_started_at: startedAt, hold_reason_code: code, updated_at: startedAt });

describe("holdDays", () => {
  it("counts Bangladesh calendar days since the order went on hold", () => {
    expect(holdDays(order("a", "2026-10-21T03:00:00Z", null), NOW)).toBe(0);
    // 20 Oct 11:30 pm in Dhaka is still yesterday there.
    expect(holdDays(order("b", "2026-10-20T17:30:00Z", null), NOW)).toBe(1);
    // 20 Oct 6:30 pm UTC is already 21 Oct in Dhaka.
    expect(holdDays(order("c", "2026-10-20T18:30:00Z", null), NOW)).toBe(0);
    expect(holdDays(order("d", "2026-10-15T08:00:00Z", null), NOW)).toBe(6);
  });

  it("falls back to updated_at and never goes negative", () => {
    expect(holdDays({ updated_at: "2026-10-19T08:00:00Z" }, NOW)).toBe(2);
    expect(holdDays({ hold_started_at: "2026-10-25T08:00:00Z" }, NOW)).toBe(0);
    expect(holdDays({}, NOW)).toBe(0);
  });
});

describe("holdAgeKey", () => {
  it("groups days into 0–1, 2–4 and 5+", () => {
    expect([0, 1, 2, 4, 5, 30].map(holdAgeKey)).toEqual(["new", "new", "soon", "soon", "long", "long"]);
  });
});

describe("filterHeldOrders and counts", () => {
  const orders = [
    order("new", "2026-10-21T05:00:00Z", "contact_later"),
    order("soon", "2026-10-18T05:00:00Z", "contact_later"),
    order("long", "2026-10-13T05:00:00Z", "advance_payment_pending"),
    order("none", "2026-10-12T05:00:00Z", null),
  ];

  it("filters by reason and by hold age together", () => {
    expect(filterHeldOrders(orders, { reason: null, age: null }, NOW)).toHaveLength(4);
    expect(filterHeldOrders(orders, { reason: "contact_later", age: null }, NOW).map((o) => o.id)).toEqual(["new", "soon"]);
    expect(filterHeldOrders(orders, { reason: null, age: "long" }, NOW).map((o) => o.id)).toEqual(["long", "none"]);
    expect(filterHeldOrders(orders, { reason: "contact_later", age: "soon" }, NOW).map((o) => o.id)).toEqual(["soon"]);
  });

  it("counts each age group and each reason", () => {
    expect(countHoldAges(orders, NOW)).toEqual({ new: 1, soon: 1, long: 2 });
    expect(countHoldReasons(orders)).toEqual({ contact_later: 2, advance_payment_pending: 1 });
  });
});
