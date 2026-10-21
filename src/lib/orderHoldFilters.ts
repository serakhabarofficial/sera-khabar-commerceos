import { getBangladeshDateKey } from "../../shared/orderHold.js";

export type HoldAgeKey = "new" | "soon" | "long";

export const HOLD_AGE_GROUPS: { key: HoldAgeKey; label: string; min: number; max: number }[] = [
  { key: "new", label: "0–1 days", min: 0, max: 1 },
  { key: "soon", label: "2–4 days", min: 2, max: 4 },
  { key: "long", label: "5+ days", min: 5, max: Number.POSITIVE_INFINITY },
];

type HeldOrder = {
  hold_started_at?: string | null;
  updated_at?: string | null;
  hold_reason_code?: string | null;
};

export type HoldFilters = { reason: string | null; age: HoldAgeKey | null };

const dayNumber = (dateKey: string) => Date.parse(`${dateKey}T00:00:00Z`) / 86_400_000;

/** Whole Bangladesh calendar days since the order went on hold. */
export function holdDays(order: HeldOrder, now: Date = new Date()): number {
  const started = order.hold_started_at || order.updated_at;
  const time = started ? Date.parse(started) : Number.NaN;
  if (Number.isNaN(time)) return 0;
  return Math.max(0, Math.round(dayNumber(getBangladeshDateKey(now)) - dayNumber(getBangladeshDateKey(new Date(time)))));
}

export function holdAgeKey(days: number): HoldAgeKey {
  return HOLD_AGE_GROUPS.find((group) => days >= group.min && days <= group.max)?.key ?? "long";
}

export function filterHeldOrders<T extends HeldOrder>(orders: T[], filters: HoldFilters, now: Date = new Date()): T[] {
  return orders.filter((order) => (
    (!filters.reason || order.hold_reason_code === filters.reason)
    && (!filters.age || holdAgeKey(holdDays(order, now)) === filters.age)
  ));
}

export function countHoldAges(orders: HeldOrder[], now: Date = new Date()): Record<HoldAgeKey, number> {
  const counts: Record<HoldAgeKey, number> = { new: 0, soon: 0, long: 0 };
  for (const order of orders) counts[holdAgeKey(holdDays(order, now))] += 1;
  return counts;
}

export function countHoldReasons(orders: HeldOrder[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const order of orders) {
    if (order.hold_reason_code) counts[order.hold_reason_code] = (counts[order.hold_reason_code] || 0) + 1;
  }
  return counts;
}
