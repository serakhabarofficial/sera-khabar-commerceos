import { describe, expect, it, vi } from "vitest";
import { attachHoldStartedAt, latestHoldStartByOrder } from "../../server/orderHoldStart.js";

function fakeSupabase(rows: unknown[]) {
  const calls: Array<[string, ...unknown[]]> = [];
  const chain = {
    select: (...args: unknown[]) => { calls.push(["select", ...args]); return chain; },
    eq: (...args: unknown[]) => { calls.push(["eq", ...args]); return chain; },
    in: (...args: unknown[]) => {
      calls.push(["in", ...args]);
      return args[0] === "to_status" ? Promise.resolve({ data: rows, error: null }) : chain;
    },
  };
  return { client: { from: vi.fn(() => chain) }, calls };
}

describe("latestHoldStartByOrder", () => {
  it("keeps the newest move into a hold status per order", () => {
    const starts = latestHoldStartByOrder([
      { order_id: "a", to_status: "on_hold", created_at: "2026-10-18T10:00:00Z" },
      { order_id: "a", to_status: "on_hold", created_at: "2026-10-20T10:00:00Z" },
      { order_id: "a", to_status: "confirmed", created_at: "2026-10-21T10:00:00Z" },
      { order_id: "b", to_status: "hold", created_at: "2026-10-19T08:00:00Z" },
    ]);
    expect(starts.get("a")).toBe("2026-10-20T10:00:00.000Z");
    expect(starts.get("b")).toBe("2026-10-19T08:00:00.000Z");
  });
});

describe("attachHoldStartedAt", () => {
  it("adds hold_started_at to held orders only, scoped to the workspace", async () => {
    const { client, calls } = fakeSupabase([{ order_id: "held", to_status: "on_hold", created_at: "2026-10-21T15:08:28Z" }]);
    const result = await attachHoldStartedAt(client, "org-1", [
      { id: "held", status: "on_hold", updated_at: "2026-10-21T15:10:00Z" },
      { id: "fallback", status: "on_hold", updated_at: "2026-10-20T09:00:00Z" },
      { id: "other", status: "confirmed", updated_at: "2026-10-21T09:00:00Z" },
    ]);

    expect(result[0]).toMatchObject({ hold_started_at: "2026-10-21T15:08:28.000Z" });
    expect(result[1]).toMatchObject({ hold_started_at: "2026-10-20T09:00:00Z" });
    expect(result[2]).not.toHaveProperty("hold_started_at");
    expect(client.from).toHaveBeenCalledWith("order_status_events");
    expect(calls).toContainEqual(["eq", "org_id", "org-1"]);
    expect(calls).toContainEqual(["in", "order_id", ["held", "fallback"]]);
  });

  it("skips the query when nothing is on hold", async () => {
    const { client } = fakeSupabase([]);
    const orders = [{ id: "x", status: "pending" }];
    expect(await attachHoldStartedAt(client, "org-1", orders)).toBe(orders);
    expect(client.from).not.toHaveBeenCalled();
  });
});
