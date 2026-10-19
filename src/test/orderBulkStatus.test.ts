import { describe, expect, it } from "vitest";
import {
  BULK_STATUS_TARGETS,
  MAX_BULK_STATUS_ORDERS,
  buildBulkStatusPatch,
  bulkStatusTransitionError,
  parseBulkStatusRequest,
  planBulkStatusUpdate,
} from "../../server/orderBulkStatus.js";
import { planBulkStatusChange } from "@/lib/orderTransitions";

const actorId = "00000000-0000-4000-8000-000000000001";
const now = "2026-10-19T08:00:00.000Z";
const groupId = "00000000-0000-4000-8000-0000000000aa";

function order(id: string, status: string | null, overrides: Record<string, unknown> = {}) {
  return { id, order_number: `#${id}`, status, customer_name: "Rahim", phone: "01712345678", address: "Dhaka", ...overrides };
}

describe("bulk status transition rules", () => {
  it("rejects moving an order to the status it already has", () => {
    expect(bulkStatusTransitionError(order("a", "pending"), "pending")).toBe("Order already has this status");
    expect(bulkStatusTransitionError(order("a", "Print"), "print")).toBe("Order already has this status");
  });

  it("only lets Approved or Confirmed orders enter Print", () => {
    expect(bulkStatusTransitionError(order("a", "confirmed"), "print")).toBeNull();
    expect(bulkStatusTransitionError(order("a", "approved"), "print")).toBeNull();
    for (const status of ["pending", "processing", "on_hold", "cancelled", null]) {
      expect(bulkStatusTransitionError(order("a", status), "print")).toBe("Only Approved orders can move to Print");
    }
  });

  it("only lets Print orders leave to Processing, Approved, On Hold or Cancelled", () => {
    for (const target of ["processing", "confirmed", "approved", "on_hold", "cancelled"]) {
      expect(bulkStatusTransitionError(order("a", "print"), target)).toBeNull();
    }
    expect(bulkStatusTransitionError(order("a", "print"), "pending")).toBe("Print orders can only move to Processing, Approved, On Hold, or Cancelled");
  });

  it("requires customer details before approving", () => {
    expect(bulkStatusTransitionError(order("a", "pending", { phone: "" }), "confirmed")).toBe("Add the phone number before approving this order.");
    expect(bulkStatusTransitionError(order("a", "pending", { phone: "" }), "on_hold")).toBeNull();
    // Already approved orders are not re-checked when moving between approved spellings.
    expect(bulkStatusTransitionError(order("a", "approved", { phone: "" }), "confirmed")).toBeNull();
  });

  it("agrees with the frontend plan for every bulk target", () => {
    const statuses = ["pending", "confirmed", "approved", "print", "processing", "on_hold", "cancelled"];
    for (const from of statuses) {
      for (const target of BULK_STATUS_TARGETS) {
        const client = planBulkStatusChange([{ id: "a", status: from }], ["a"], target).validIds.length === 1;
        const server = bulkStatusTransitionError(order("a", from), target) === null;
        expect({ from, target, allowed: server }).toEqual({ from, target, allowed: client });
      }
    }
  });
});

describe("bulk status patch", () => {
  it("stamps who approved and when", () => {
    expect(buildBulkStatusPatch({ fromStatus: "pending", targetStatus: "confirmed", actorId, now })).toEqual({
      status: "confirmed", confirmed_by: actorId, confirmed_at: now, updated_at: now,
    });
  });

  it("records the cancellation reason and who cancelled", () => {
    expect(buildBulkStatusPatch({ fromStatus: "pending", targetStatus: "cancelled", actorId, now, cancellationReason: { code: "duplicate_order", note: null } })).toEqual({
      status: "cancelled", cancellation_reason_code: "duplicate_order", cancellation_reason_note: null,
      cancelled_by: actorId, cancelled_at: now, updated_at: now,
    });
  });

  it("clears the cancellation reason and cancel stamp when reopening into Approved", () => {
    expect(buildBulkStatusPatch({ fromStatus: "cancelled", targetStatus: "confirmed", actorId, now })).toEqual({
      status: "confirmed", cancellation_reason_code: null, cancellation_reason_note: null,
      confirmed_by: actorId, confirmed_at: now, cancelled_by: null, cancelled_at: null, updated_at: now,
    });
    expect(buildBulkStatusPatch({ fromStatus: "cancelled", targetStatus: "pending", actorId, now })).toEqual({
      status: "pending", cancellation_reason_code: null, cancellation_reason_note: null, updated_at: now,
    });
  });

  it("writes the hold details when moving to On Hold", () => {
    expect(buildBulkStatusPatch({ fromStatus: "pending", targetStatus: "on_hold", actorId, now, holdDetails: { reasonCode: "other", reasonDetail: "Call after Friday", holdUntilDate: null } })).toEqual({
      status: "on_hold", hold_reason_code: "other", hold_reason_detail: "Call after Friday", hold_until_date: null, updated_at: now,
    });
  });
});

describe("bulk status plan", () => {
  it("groups orders by stored status and reports missing or blocked orders", () => {
    const orders = [order("a", "confirmed"), order("b", "approved"), order("c", "confirmed"), order("d", "pending"), order("e", null)];
    const { groups, failures } = planBulkStatusUpdate({ orderIds: ["a", "b", "c", "d", "e", "missing"], orders, targetStatus: "print", actorId, now });
    expect(groups.map((group) => [group.fromStatus, group.ids])).toEqual([["confirmed", ["a", "c"]], ["approved", ["b"]]]);
    expect(groups[0].patch).toEqual({ status: "print", updated_at: now });
    expect(failures).toEqual([
      { orderId: "d", orderNumber: "#d", reason: "Only Approved orders can move to Print" },
      { orderId: "e", orderNumber: "#e", reason: "Only Approved orders can move to Print" },
      { orderId: "missing", orderNumber: null, reason: "Order not found" },
    ]);
  });

  it("keeps a null stored status as its own group", () => {
    const { groups } = planBulkStatusUpdate({ orderIds: ["a", "b"], orders: [order("a", null), order("b", "pending")], targetStatus: "on_hold", actorId, now, holdDetails: { reasonCode: "contact_later", reasonDetail: null, holdUntilDate: null } });
    expect(groups.map((group) => group.fromStatus)).toEqual([null, "pending"]);
  });
});

describe("bulk status request", () => {
  const ids = ["00000000-0000-4000-8000-000000000101"];

  it("dedupes ids and normalizes hold details", () => {
    expect(parseBulkStatusRequest({ orderIds: [ids[0], ` ${ids[0]} `], status: "on_hold", activity_group_id: groupId, hold_reason_code: "other", hold_reason_detail: "  Later  ", hold_until_date: null }, { currentDate: "2026-10-19" })).toEqual({
      value: { orderIds: ids, status: "on_hold", activityGroupId: groupId, holdDetails: { reasonCode: "other", reasonDetail: "Later", holdUntilDate: null }, cancellationReason: null },
    });
  });

  it("rejects bad requests", () => {
    const tooMany = Array.from({ length: MAX_BULK_STATUS_ORDERS + 1 }, (_, index) => `id-${index}`);
    const bad = [
      {}, { orderIds: [], status: "print" }, { orderIds: [""], status: "print" }, { orderIds: [1], status: "print" },
      { orderIds: tooMany, status: "print" },
      { orderIds: ids, status: "delivered" },
      { orderIds: ids, status: "print", activity_group_id: "not-a-uuid" },
      { orderIds: ids, status: "on_hold" },
      { orderIds: ids, status: "on_hold", hold_reason_code: "made_up" },
      { orderIds: ids, status: "print", hold_reason_code: "other" },
      { orderIds: ids, status: "cancelled" },
      { orderIds: ids, status: "cancelled", cancellation_reason_code: "other" },
    ];
    for (const body of bad) expect(parseBulkStatusRequest(body, { currentDate: "2026-10-19" })).toHaveProperty("error");
  });

  it("accepts a valid cancellation reason", () => {
    expect(parseBulkStatusRequest({ orderIds: ids, status: "cancelled", cancellation_reason_code: "duplicate_order" })).toMatchObject({
      value: { cancellationReason: { code: "duplicate_order", note: null } },
    });
  });
});
