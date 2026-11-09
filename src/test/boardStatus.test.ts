import { describe, expect, it } from "vitest";
import { boardPlacementOf, boardStatusList, boardStatusOfList, isBoardStatus } from "@/lib/boardStatus";

const lists = [
  { id: "l1", name: "বিশেষ নির্দেশনা" },
  { id: "l2", name: "Pre-Order" },
  { id: "l3", name: "VIP" },
];

describe("board statuses", () => {
  it("knows VIP and Pre-Order only", () => {
    expect(isBoardStatus("vip")).toBe(true);
    expect(isBoardStatus("pre_order")).toBe(true);
    expect(isBoardStatus("confirmed")).toBe(false);
    expect(isBoardStatus(null)).toBe(false);
  });

  it("finds the matching list by name, ignoring case, spaces and dashes", () => {
    expect(boardStatusList(lists, "vip")?.id).toBe("l3");
    expect(boardStatusList(lists, "pre_order")?.id).toBe("l2");
    expect(boardStatusList([{ id: "x", name: "pre order" }], "pre_order")?.id).toBe("x");
    expect(boardStatusList([{ id: "x", name: "Heavy Parcels" }], "vip")).toBeNull();
  });

  it("gives other lists no board status", () => {
    expect(boardStatusOfList(lists[0])).toBeNull();
    expect(boardStatusOfList(lists[2])).toBe("vip");
    expect(boardStatusOfList(null)).toBeNull();
  });

  it("reads an order's placement from the board", () => {
    const board = { lists, cards: [{ id: "c1", list_id: "l2", order_id: "o1" }, { id: "c2", list_id: "l1", order_id: "o2" }] };
    expect(boardPlacementOf(board, "o1")).toMatchObject({ card: { id: "c1" }, status: "pre_order" });
    expect(boardPlacementOf(board, "o2")).toMatchObject({ card: { id: "c2" }, status: null });
    expect(boardPlacementOf(board, "o3")).toEqual({ card: null, list: null, status: null });
    expect(boardPlacementOf(undefined, "o1").status).toBeNull();
  });
});
