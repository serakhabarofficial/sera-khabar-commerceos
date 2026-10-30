import { getBangladeshDateKey } from "../../shared/orderHold.js";

export type HoldAttempt = 1 | 2 | 3;

/** Unanswered call stages; staff move a held order forward by hand. */
export const HOLD_ATTEMPTS: { attempt: HoldAttempt; label: string }[] = [
  { attempt: 1, label: "1st attempt" },
  { attempt: 2, label: "2nd attempt" },
  { attempt: 3, label: "3rd attempt" },
];

type HeldOrder = {
  hold_started_at?: string | null;
  updated_at?: string | null;
  hold_reason_code?: string | null;
  hold_call_attempt?: number | null;
};

export type HoldFilters = { reason: string | null; attempt: HoldAttempt | null };

const dayNumber = (dateKey: string) => Date.parse(`${dateKey}T00:00:00Z`) / 86_400_000;

/** Whole Bangladesh calendar days since the order went on hold. */
export function holdDays(order: HeldOrder, now: Date = new Date()): number {
  const started = order.hold_started_at || order.updated_at;
  const time = started ? Date.parse(started) : Number.NaN;
  if (Number.isNaN(time)) return 0;
  return Math.max(0, Math.round(dayNumber(getBangladeshDateKey(now)) - dayNumber(getBangladeshDateKey(new Date(time)))));
}

/** The call attempt a held order is on; orders held before attempts existed read as the 1st. */
export function holdAttempt(order: HeldOrder): HoldAttempt {
  const attempt = order.hold_call_attempt;
  return attempt === 2 || attempt === 3 ? attempt : 1;
}

export function filterHeldOrders<T extends HeldOrder>(orders: T[], filters: HoldFilters): T[] {
  return orders.filter((order) => (
    (!filters.reason || order.hold_reason_code === filters.reason)
    && (!filters.attempt || holdAttempt(order) === filters.attempt)
  ));
}

export function countHoldAttempts(orders: HeldOrder[]): Record<HoldAttempt, number> {
  const counts: Record<HoldAttempt, number> = { 1: 0, 2: 0, 3: 0 };
  for (const order of orders) counts[holdAttempt(order)] += 1;
  return counts;
}

export function countHoldReasons(orders: HeldOrder[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const order of orders) {
    if (order.hold_reason_code) counts[order.hold_reason_code] = (counts[order.hold_reason_code] || 0) + 1;
  }
  return counts;
}
