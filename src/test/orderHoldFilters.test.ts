import { describe, expect, it } from "vitest";
import { countHoldAttempts, countHoldReasons, filterHeldOrders, holdAttempt, holdDays } from "@/lib/orderHoldFilters";

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

describe("holdAttempt", () => {
  it("reads the stored call attempt and treats a missing one as the 1st", () => {
    expect([1, 2, 3, null, undefined, 7].map((hold_call_attempt) => holdAttempt({ hold_call_attempt }))).toEqual([1, 2, 3, 1, 1, 1]);
  });
});

describe("filterHeldOrders and counts", () => {
  const held = (id: string, attempt: number | null, code: string | null) => ({ ...order(id, "2026-10-21T05:00:00Z", code), hold_call_attempt: attempt });
  const orders = [
    held("first", 1, "contact_later"),
    held("second", 2, "contact_later"),
    held("final", 3, "advance_payment_pending"),
    held("legacy", null, null),
  ];

  it("filters by reason and by call attempt together", () => {
    expect(filterHeldOrders(orders, { reason: null, attempt: null })).toHaveLength(4);
    expect(filterHeldOrders(orders, { reason: "contact_later", attempt: null }).map((o) => o.id)).toEqual(["first", "second"]);
    expect(filterHeldOrders(orders, { reason: null, attempt: 1 }).map((o) => o.id)).toEqual(["first", "legacy"]);
    expect(filterHeldOrders(orders, { reason: "contact_later", attempt: 2 }).map((o) => o.id)).toEqual(["second"]);
  });

  it("counts each call attempt and each reason", () => {
    expect(countHoldAttempts(orders)).toEqual({ 1: 2, 2: 1, 3: 1 });
    expect(countHoldReasons(orders)).toEqual({ contact_later: 2, advance_payment_pending: 1 });
  });
});
