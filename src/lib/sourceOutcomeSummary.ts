import type { AbandonedFact, OrderFact } from "@/components/business-report/types";

export type OrderFilterKey = "product" | "source" | "courier" | "payment";
export type OrderFilters = Record<OrderFilterKey, string[]>;
export type GroupBy = "source" | "product";

export const EMPTY_FILTERS: OrderFilters = { product: [], source: [], courier: [], payment: [] };

/** Label shown for an order with no courier / payment recorded. */
export const NOT_SET = "Not set";

export type OutcomeCounts = { got: number; confirmed: number; hold: number; cancelled: number };
export type OutcomeRow = OutcomeCounts & { key: string };

/** The values an order exposes for each filter. */
function factValues(fact: OrderFact, key: OrderFilterKey): string[] {
  if (key === "product") return fact.products;
  if (key === "source") return [fact.source];
  if (key === "courier") return [fact.courier ?? NOT_SET];
  return [fact.payment ?? NOT_SET];
}

/** Order matches when, for every active filter, it has at least one selected value. */
export function matchesFilters(fact: OrderFact, filters: OrderFilters, skip?: OrderFilterKey): boolean {
  return (Object.keys(filters) as OrderFilterKey[]).every((key) => {
    if (key === skip || filters[key].length === 0) return true;
    return factValues(fact, key).some((value) => filters[key].includes(value));
  });
}

/** Got counts every order. Cancelled includes RTO (both are lost orders).
 *  Hold is an order still awaiting a decision, so it is never confirmed. */
export function countOutcomes(facts: OrderFact[]): OutcomeCounts {
  const counts: OutcomeCounts = { got: 0, confirmed: 0, hold: 0, cancelled: 0 };
  for (const fact of facts) {
    counts.got += 1;
    if (fact.outcome === "approved") counts.confirmed += 1;
    else if (fact.outcome === "cancelled" || fact.outcome === "returned") counts.cancelled += 1;
    else if (fact.held) counts.hold += 1;
  }
  return counts;
}

/** One row per source or product, biggest first. With "product", an order
 *  holding two products counts once under each, so rows can sum past the total. */
export function summarizeOrders(facts: OrderFact[], filters: OrderFilters, groupBy: GroupBy) {
  const matching = facts.filter((fact) => matchesFilters(fact, filters));
  const groups = new Map<string, OrderFact[]>();
  for (const fact of matching) {
    const keys = groupBy === "source" ? [fact.source] : fact.products;
    for (const key of new Set(keys)) {
      if (groupBy === "product" && filters.product.length > 0 && !filters.product.includes(key)) continue;
      groups.set(key, [...(groups.get(key) ?? []), fact]);
    }
  }
  const rows: OutcomeRow[] = [...groups.entries()]
    .map(([key, group]) => ({ key, ...countOutcomes(group) }))
    .sort((a, b) => b.got - a.got || a.key.localeCompare(b.key));
  return { rows, total: countOutcomes(matching) };
}

/** Options for one filter, with how many orders each would show given the other filters. */
export function filterOptions(facts: OrderFact[], filters: OrderFilters, key: OrderFilterKey) {
  const counts = new Map<string, number>();
  for (const fact of facts) {
    const others = matchesFilters(fact, filters, key);
    for (const value of new Set(factValues(fact, key))) {
      counts.set(value, (counts.get(value) ?? 0) + (others ? 1 : 0));
    }
  }
  return [...counts.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

export type AbandonedCounts = { abandoned: number; confirmed: number; dismissed: number; open: number };

/** Abandoned checkouts only come from the website, so a source filter that
 *  excludes the website hides them (null). */
export function summarizeAbandoned(facts: AbandonedFact[], filters: OrderFilters, websiteKey = "website"): AbandonedCounts | null {
  if (filters.source.length > 0 && !filters.source.includes(websiteKey)) return null;
  const counts: AbandonedCounts = { abandoned: 0, confirmed: 0, dismissed: 0, open: 0 };
  for (const fact of facts) {
    if (filters.product.length > 0 && !fact.products.some((product) => filters.product.includes(product))) continue;
    counts.abandoned += 1;
    counts[fact.status] += 1;
  }
  return counts;
}
