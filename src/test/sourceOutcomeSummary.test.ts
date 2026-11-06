import { describe, expect, it } from "vitest";
import type { AbandonedFact, OrderFact } from "@/components/business-report/types";
import {
  EMPTY_FILTERS,
  NOT_SET,
  countOutcomes,
  filterOptions,
  summarizeAbandoned,
  summarizeOrders,
} from "@/lib/sourceOutcomeSummary";

const fact = (overrides: Partial<OrderFact> = {}): OrderFact => ({
  source: "website",
  products: ["Ghee"],
  courier: null,
  payment: "cod",
  outcome: "pending",
  held: false,
  ...overrides,
});

const facts: OrderFact[] = [
  fact({ outcome: "approved", courier: "Steadfast" }),
  fact({ held: true }),
  fact({ outcome: "returned" }),
  fact({ source: "facebook", products: ["Ghee", "Honey"], outcome: "cancelled" }),
  fact({ source: "facebook", products: ["Honey"], outcome: "approved", payment: null }),
];

describe("countOutcomes", () => {
  it("counts every order as got, folds RTO into cancelled, and keeps plain pending out of the columns", () => {
    expect(countOutcomes([...facts, fact()])).toEqual({ got: 6, confirmed: 2, hold: 1, cancelled: 2 });
  });
});

describe("summarizeOrders", () => {
  it("groups by source, biggest first, with a distinct-order total", () => {
    const { rows, total } = summarizeOrders(facts, EMPTY_FILTERS, "source");
    expect(rows).toEqual([
      { key: "website", got: 3, confirmed: 1, hold: 1, cancelled: 1 },
      { key: "facebook", got: 2, confirmed: 1, hold: 0, cancelled: 1 },
    ]);
    expect(total.got).toBe(5);
  });

  it("groups by product, counting a multi-product order under each product", () => {
    const { rows, total } = summarizeOrders(facts, EMPTY_FILTERS, "product");
    expect(rows.map((row) => [row.key, row.got])).toEqual([["Ghee", 4], ["Honey", 2]]);
    expect(total.got).toBe(5);
  });

  it("applies filters across dimensions and hides unselected products in the product view", () => {
    const filters = { ...EMPTY_FILTERS, product: ["Honey"] };
    expect(summarizeOrders(facts, filters, "source").rows).toEqual([
      { key: "facebook", got: 2, confirmed: 1, hold: 0, cancelled: 1 },
    ]);
    expect(summarizeOrders(facts, filters, "product").rows.map((row) => row.key)).toEqual(["Honey"]);
    expect(summarizeOrders(facts, { ...EMPTY_FILTERS, courier: ["Steadfast"] }, "source").total.got).toBe(1);
    expect(summarizeOrders(facts, { ...EMPTY_FILTERS, payment: [NOT_SET] }, "source").total.got).toBe(1);
  });
});

describe("filterOptions", () => {
  it("lists every value with counts that respect the other filters but not its own", () => {
    const filters = { ...EMPTY_FILTERS, source: ["facebook"], product: ["Ghee"] };
    expect(filterOptions(facts, filters, "product")).toEqual([
      { value: "Honey", count: 2 },
      { value: "Ghee", count: 1 },
    ]);
    expect(filterOptions(facts, EMPTY_FILTERS, "courier")).toEqual([
      { value: NOT_SET, count: 4 },
      { value: "Steadfast", count: 1 },
    ]);
  });
});

describe("summarizeAbandoned", () => {
  const abandoned: AbandonedFact[] = [
    { status: "confirmed", products: ["Honey"] },
    { status: "dismissed", products: ["Ghee"] },
    { status: "open", products: [] },
  ];

  it("counts by status and respects the product filter", () => {
    expect(summarizeAbandoned(abandoned, EMPTY_FILTERS)).toEqual({ abandoned: 3, confirmed: 1, dismissed: 1, open: 1 });
    expect(summarizeAbandoned(abandoned, { ...EMPTY_FILTERS, product: ["Honey"] })).toEqual({ abandoned: 1, confirmed: 1, dismissed: 0, open: 0 });
  });

  it("returns null when the source filter excludes the website", () => {
    expect(summarizeAbandoned(abandoned, { ...EMPTY_FILTERS, source: ["facebook"] })).toBeNull();
    expect(summarizeAbandoned(abandoned, { ...EMPTY_FILTERS, source: ["website", "facebook"] })).not.toBeNull();
  });
});
