import { describe, expect, it } from "vitest";
import {
  boardVariantLabel,
  cardsInList,
  dropPosition,
  isHeavyParcel,
  positionBetween,
  reminderLabel,
  searchBoardOrders,
  type BoardCard,
} from "@/lib/orderBoard";

const card = (id: string, list_id: string, position: number): BoardCard => ({
  id, list_id, position, order_id: `o-${id}`, note: "", remind_on: null, updated_at: "", order: null,
});

describe("order board helpers", () => {
  it("orders cards in a list by position", () => {
    const cards = [card("a", "l1", 2), card("b", "l2", 0), card("c", "l1", 1)];
    expect(cardsInList(cards, "l1").map((c) => c.id)).toEqual(["c", "a"]);
  });

  it("places a dropped card between its new neighbours", () => {
    expect(positionBetween()).toBe(0);
    expect(positionBetween(undefined, 3)).toBe(2);
    expect(positionBetween(3)).toBe(4);
    expect(positionBetween(1, 2)).toBe(1.5);

    const cards = [card("a", "l1", 1), card("b", "l1", 2), card("c", "l1", 3), card("d", "l2", 1)];
    // Moving "a" between "b" and "c" ignores its own old slot.
    expect(dropPosition(cards, "a", "l1", 1)).toBe(2.5);
    // Top of another list.
    expect(dropPosition(cards, "a", "l2", 0)).toBe(0);
    // Into an empty list.
    expect(dropPosition(cards, "a", "l3", 0)).toBe(0);
  });

  it("calls an order with 6 or more items a heavy parcel", () => {
    expect(isHeavyParcel([{ quantity: 4 }, { quantity: 2 }])).toBe(true);
    expect(isHeavyParcel([{ quantity: 5 }])).toBe(false);
    expect(isHeavyParcel(undefined, 7)).toBe(true);
  });

  it("labels reminder dates relative to today in Dhaka", () => {
    expect(reminderLabel("2026-10-21", "2026-10-22")).toBe("Overdue · Oct 21");
    expect(reminderLabel("2026-10-22", "2026-10-22")).toBe("Today");
    expect(reminderLabel("2026-10-23", "2026-10-22")).toBe("Tomorrow");
    expect(reminderLabel("2026-11-02", "2026-10-22")).toBe("Nov 2");
  });

  it("shows JSON variant names as plain values", () => {
    expect(boardVariantLabel('{"size": "১ কেজি"}')).toBe("১ কেজি");
    expect(boardVariantLabel('{"size": "Large", "pack": "2"}')).toBe("Large · 2");
    expect(boardVariantLabel("৫০০ গ্রাম")).toBe("৫০০ গ্রাম");
    expect(boardVariantLabel("{not json")).toBe("{not json");
    expect(boardVariantLabel(null)).toBeNull();
  });

  it("finds orders by number, name or phone and shows the newest first otherwise", () => {
    const base = { address: null, status: "pending", price: 900, quantity: 1 };
    const orders = [
      { ...base, id: "1", order_number: "SK-2051", customer_name: "রাশেদ আহমেদ", phone: "01712448902", created_at: "2026-10-20T10:00:00Z" },
      { ...base, id: "2", order_number: "SK-2058", customer_name: "শাহরিয়ার কবির", phone: "01716882405", created_at: "2026-10-22T10:00:00Z" },
    ];
    expect(searchBoardOrders(orders, "#SK-2051").map((o) => o.id)).toEqual(["1"]);
    expect(searchBoardOrders(orders, "882405").map((o) => o.id)).toEqual(["2"]);
    expect(searchBoardOrders(orders, "রাশেদ").map((o) => o.id)).toEqual(["1"]);
    expect(searchBoardOrders(orders, "").map((o) => o.id)).toEqual(["2", "1"]);
  });
});
