import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_BOARD_LISTS,
  parseBoardCardPatch,
  parseBoardList,
  parseBoardUpdate,
} from "../../server/orderBoard.js";

const LIST_ID = "4f7c2a51-3b8e-4d1a-9c6f-2e5b8a7d1c30";

describe("order board input", () => {
  it("starts with the merchant's four lists", () => {
    expect(DEFAULT_BOARD_LISTS.map((list) => list.name)).toEqual([
      "Reschedule · পরে পাঠাবে",
      "VIP",
      "Heavy Parcels",
      "বিশেষ নির্দেশনা",
    ]);
  });

  it("requires a list name and a known color", () => {
    expect(parseBoardList({ name: "  ফোন   ধরছে না " })).toEqual({ list: { name: "ফোন ধরছে না" } });
    expect(parseBoardList({ name: "  " }).error).toBe("Give the list a name");
    expect(parseBoardList({ name: "x".repeat(61) }).error).toMatch(/under 60/);
    expect(parseBoardList({ name: "VIP", color: "pink" }).error).toBe("Choose one of the list colors");
    expect(parseBoardList({ color: "rose" }, { partial: true })).toEqual({ list: { color: "rose" } });
    expect(parseBoardList({}, { partial: true }).error).toBe("Nothing to save");
  });

  it("accepts only the card fields that were sent", () => {
    expect(parseBoardCardPatch({ list_id: LIST_ID, position: 1.5 })).toEqual({ patch: { list_id: LIST_ID, position: 1.5 } });
    expect(parseBoardCardPatch({ note: "সন্ধ্যা ৬টার পরে" })).toEqual({ patch: { note: "সন্ধ্যা ৬টার পরে" } });
    expect(parseBoardCardPatch({ remind_on: null })).toEqual({ patch: { remind_on: null } });
    expect(parseBoardCardPatch({ remind_on: "2026-10-25" })).toEqual({ patch: { remind_on: "2026-10-25" } });
  });

  it("rejects bad card input", () => {
    expect(parseBoardCardPatch({}).error).toBe("Nothing to save");
    expect(parseBoardCardPatch({ list_id: "abc" }).error).toBe("Invalid list");
    expect(parseBoardCardPatch({ position: Number.NaN }).error).toBe("Invalid position");
    expect(parseBoardCardPatch({ remind_on: "2026-02-30" }).error).toBe("Choose a valid reminder date");
    expect(parseBoardCardPatch({ note: "x".repeat(2001) }).error).toMatch(/under 2000/);
  });

  it("trims updates and refuses empty ones", () => {
    expect(parseBoardUpdate({ body: "  কাল আবার   কল " })).toEqual({ text: "কাল আবার কল" });
    expect(parseBoardUpdate({ body: " " }).error).toBe("Write the update first");
  });

  it("keeps the migration in step with the list colors", () => {
    const sql = readFileSync("supabase/migrations/20261022090000_order_board.sql", "utf8");
    expect(sql).toContain("color in ('amber', 'rose', 'violet', 'blue', 'teal', 'slate', 'green')");
    expect(sql).toContain("unique (org_id, order_id)");
  });
});
