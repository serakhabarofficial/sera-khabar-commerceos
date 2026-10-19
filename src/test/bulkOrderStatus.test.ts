import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestBulkStatusChange } from "@/lib/bulkOrderStatus";

const apiFetch = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api", () => ({ apiFetch }));

type Body = { orderIds: string[]; status: string; activity_group_id: string; hold_reason_code?: string };

const bodyOf = (call: unknown[]) => JSON.parse(String((call[1] as RequestInit).body)) as Body;
const response = (body: unknown, ok = true) => ({ ok, json: async () => body });

describe("requestBulkStatusChange", () => {
  beforeEach(() => {
    apiFetch.mockReset();
  });

  it("sends one POST per 500 orders with a shared activity group", async () => {
    apiFetch.mockImplementation(async (_url: string, init: RequestInit) => {
      const body = JSON.parse(String(init.body)) as Body;
      return response({ updated: body.orderIds.map((id) => ({ id, status: body.status })), failures: [] });
    });
    const ids = Array.from({ length: 1001 }, (_, index) => `o${index}`);

    const result = await requestBulkStatusChange<{ id: string }>(ids, "print");

    expect(apiFetch).toHaveBeenCalledTimes(3);
    expect(apiFetch.mock.calls.every(([url, init]) => url === "/api/orders/bulk-status" && init.method === "POST")).toBe(true);
    expect(apiFetch.mock.calls.map((call) => bodyOf(call).orderIds.length)).toEqual([500, 500, 1]);
    const groups = new Set(apiFetch.mock.calls.map((call) => bodyOf(call).activity_group_id));
    expect(groups.size).toBe(1);
    expect([...groups][0]).toMatch(/^[0-9a-f-]{36}$/);
    expect(result.updated).toHaveLength(1001);
    expect(result.failedIds.size).toBe(0);
    expect(result.error).toBeNull();
  });

  it("sends hold details and collects per-order failures", async () => {
    apiFetch.mockResolvedValue(response({
      updated: [{ id: "a" }],
      failures: [{ orderId: "b", orderNumber: "#2", reason: "Order changed before it could be saved. Refresh and try again." }],
    }));
    const result = await requestBulkStatusChange(["a", "b"], "on_hold", { hold_reason_code: "contact_later", hold_reason_detail: null, hold_until_date: null });
    expect(bodyOf(apiFetch.mock.calls[0])).toMatchObject({ status: "on_hold", hold_reason_code: "contact_later" });
    expect(result.updated).toEqual([{ id: "a" }]);
    expect([...result.failedIds]).toEqual(["b"]);
    expect(result.error).toBe("Order changed before it could be saved. Refresh and try again.");
  });

  it("counts every id in a failed chunk as failed and keeps the server error", async () => {
    apiFetch.mockResolvedValue(response({ error: "Choose a hold reason" }, false));
    const result = await requestBulkStatusChange(["a", "b"], "on_hold");
    expect(result.updated).toEqual([]);
    expect([...result.failedIds]).toEqual(["a", "b"]);
    expect(result.error).toBe("Choose a hold reason");
  });
});
