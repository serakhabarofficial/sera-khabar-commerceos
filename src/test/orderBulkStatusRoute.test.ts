import { describe, expect, it, vi } from "vitest";
import { database, foreignOrg, handlers, http, orgId, uuid } from "./campaignHandlerHarness";
import { parseBulkStatusRequest, planBulkStatusUpdate } from "../../server/orderBulkStatus.js";
import { buildStatusEvent } from "../../server/orderAttribution.js";
import { buildDetailedActivityEvent, buildOrderChanges } from "../../server/orderActivity.js";
import { getBangladeshDateKey } from "../../shared/orderHold.js";

// The real POST /api/orders/bulk-status handler, run against the in-memory database.

type Row = Record<string, unknown>;
type Resolve = (value: unknown) => unknown;
type Query = ReturnType<ReturnType<typeof database>["from"]>;

const actorId = uuid(1);
const groupId = "00000000-0000-4000-8000-0000000000aa";
const ROUTE = "/api/orders/bulk-status";

function order(n: number, status: string | null, overrides: Row = {}): Row {
  return { id: uuid(n), org_id: orgId, order_number: `#${n}`, status, customer_name: "Rahim", phone: "01712345678", address: "Dhaka", ...overrides };
}

// The base adapter hands out its stored objects, so an update would also
// rewrite the "before" rows the handler already read. This wrapper returns
// copies, enforces the activity table's unique (org_id, request_id) index, and
// lets a test change a row while an update is in flight.
type DbError = { code?: string; message: string };

function fixture(seed: Row[], options: { onOrdersUpdate?: (tables: Record<string, Row[]>, index: number) => DbError | void } = {}) {
  let ordersUpdates = 0;
  const db = database({
    orders: seed,
    user_roles: [{ user_id: actorId, org_id: orgId, display_name: "Nadia" }],
    order_status_events: [],
    order_activity_events: [],
  });
  const baseFrom = db.from;
  const from = (table: string) => {
    const query = baseFrom(table) as Query & Record<string, unknown>;
    const run = query.then.bind(query) as (resolve: Resolve, reject?: Resolve) => Promise<unknown>;
    const insert = query.insert.bind(query);
    const update = query.update.bind(query);
    let inserted: Row[] = [];
    let updating = false;
    query.insert = (value: Row | Row[]) => { inserted = Array.isArray(value) ? value : [value]; return insert(value); };
    query.update = (value: Row) => { updating = true; return update(value); };
    query.then = (async (resolve: Resolve, reject?: Resolve) => {
      if (table === "order_activity_events" && inserted.some((row) => row.request_id && db.tables.order_activity_events.some((saved) => saved.org_id === row.org_id && saved.request_id === row.request_id))) {
        return resolve({ data: null, error: { code: "23505", message: "duplicate key" } });
      }
      if (table === "orders" && updating) {
        const error = options.onOrdersUpdate?.(db.tables, ordersUpdates++);
        if (error) return resolve({ data: null, error });
      }
      return run((value) => resolve(structuredClone(value)), reject);
    }) as Query["then"];
    return query;
  };
  const risk = vi.fn(async () => {});
  const harness = handlers({ ...db, from } as unknown as ReturnType<typeof database>, {
    parseBulkStatusRequest, planBulkStatusUpdate, buildStatusEvent, buildDetailedActivityEvent, buildOrderChanges, getBangladeshDateKey,
    labelOrderRiskAttempt: risk,
  });
  harness.load([
    "MAX_EVENT_INSERT_ATTEMPTS", "BULK_STATUS_STALE_REASON", "BULK_STATUS_WRITE_FAILED_REASON",
    "prepareStatusEvent", "buildOperationRequestId", "recordStatusEvent", "recordOrderActivity", "recordStatusEvents", "recordOrderActivities",
    "isMissingDetailedActivityTable", "delay", "errorMessage", "sendError", "chunkIds", "normalizeBusinessStatus",
  ], [`app.post("${ROUTE}"`]);
  const count = (table: string, method: string) => db.calls.filter((call) => call.table === table && call.method === method).length;
  return { app: harness.app, db, risk, count };
}

describe("POST /api/orders/bulk-status", () => {
  it("moves 40 orders with one update, one insert per event table and one name lookup", async () => {
    const seed = Array.from({ length: 40 }, (_, index) => order(100 + index, "confirmed"));
    const { app, db, risk, count } = fixture(seed);
    const ids = seed.map((row) => String(row.id));

    const result = await http(app, "POST", ROUTE, { orderIds: ids, status: "print", activity_group_id: groupId });

    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ success: true, processed: 40, failed: 0, failures: [] });
    expect(result.body.updated).toHaveLength(40);
    expect(db.tables.orders.every((row) => row.status === "print")).toBe(true);

    expect(count("orders", "update")).toBe(1);
    expect(count("order_status_events", "insert")).toBe(1);
    expect(count("order_activity_events", "insert")).toBe(1);
    expect(count("user_roles", "select")).toBe(1);
    expect(risk).toHaveBeenCalledTimes(40);

    expect(db.tables.order_status_events).toHaveLength(40);
    expect(db.tables.order_status_events[0]).toMatchObject({ org_id: orgId, order_table: "orders", from_status: "confirmed", to_status: "print", actor_id: actorId, actor_kind: "user" });
    expect(db.tables.order_activity_events).toHaveLength(40);
    expect(db.tables.order_activity_events[0]).toMatchObject({
      org_id: orgId, order_id: ids[0], event_type: "order.status_changed", category: "status", actor_display_name: "Nadia",
      group_id: groupId, request_id: `${groupId}:${ids[0]}:bulk_status`, summary: "Status changed to print",
      changes: [{ field: "status", before: "confirmed", after: "print" }],
      metadata: { from_status: "confirmed", to_status: "print", legacy_status_event_id: db.tables.order_status_events[0].id },
    });
  });

  it("uses one update per stored status and stamps approval", async () => {
    const { app, db, count } = fixture([order(1, "pending"), order(2, "on_hold"), order(3, "pending"), order(4, null)]);
    const result = await http(app, "POST", ROUTE, { orderIds: [uuid(1), uuid(2), uuid(3), uuid(4)], status: "confirmed" });
    expect(result.body).toMatchObject({ processed: 4, failed: 0 });
    expect(count("orders", "update")).toBe(3);
    expect(db.calls.some((call) => call.table === "orders" && call.method === "is" && call.args[0] === "status" && call.args[1] === null)).toBe(true);
    expect(db.tables.orders[0]).toMatchObject({ status: "confirmed", confirmed_by: actorId });
    expect(typeof db.tables.orders[0].confirmed_at).toBe("string");
  });

  it("does not touch orders from another workspace", async () => {
    const foreign = order(9, "confirmed", { org_id: foreignOrg });
    const { app, db } = fixture([order(1, "confirmed"), foreign]);
    const result = await http(app, "POST", ROUTE, { orderIds: [uuid(1), uuid(9)], status: "print" });
    expect(result.body).toMatchObject({ success: false, processed: 1, failed: 1, failures: [{ orderId: uuid(9), orderNumber: null, reason: "Order not found" }] });
    expect(db.tables.orders[1].status).toBe("confirmed");
    expect(db.calls.filter((call) => call.table === "orders" && call.method === "eq" && call.args[0] === "org_id").every((call) => call.args[1] === orgId)).toBe(true);
    expect(db.tables.order_activity_events.map((row) => row.order_id)).toEqual([uuid(1)]);
  });

  it("reports an order another person changed mid-update instead of overwriting it", async () => {
    const { app, db } = fixture([order(1, "confirmed"), order(2, "confirmed")], {
      onOrdersUpdate: (tables) => { tables.orders[1].status = "cancelled"; },
    });
    const result = await http(app, "POST", ROUTE, { orderIds: [uuid(1), uuid(2)], status: "print" });
    expect(result.body).toMatchObject({
      success: false, processed: 1, failed: 1,
      failures: [{ orderId: uuid(2), orderNumber: "#2", reason: "Order changed before it could be saved. Refresh and try again." }],
    });
    expect(db.tables.orders.map((row) => row.status)).toEqual(["print", "cancelled"]);
    expect(db.tables.order_status_events.map((row) => row.order_id)).toEqual([uuid(1)]);
  });

  it("reports blocked orders and still moves the rest", async () => {
    const { app } = fixture([order(1, "confirmed"), order(2, "pending"), order(3, "pending", { address: "" })]);
    const result = await http(app, "POST", ROUTE, { orderIds: [uuid(1), uuid(2), uuid(3)], status: "print" });
    expect(result.body).toMatchObject({ processed: 1, failed: 2, failures: [
      { orderId: uuid(2), reason: "Only Confirmed orders can move to Print" },
      { orderId: uuid(3), reason: "Only Confirmed orders can move to Print" },
    ] });
    const approve = await http(fixture([order(3, "pending", { address: "" })]).app, "POST", ROUTE, { orderIds: [uuid(3)], status: "confirmed" });
    expect(approve.body.failures).toEqual([{ orderId: uuid(3), orderNumber: "#3", reason: "Add the delivery address before approving this order." }]);
  });

  it("applies the hold reason to every order", async () => {
    const { app, db } = fixture([order(1, "pending"), order(2, "confirmed"), order(3, "print")]);
    const result = await http(app, "POST", ROUTE, {
      orderIds: [uuid(1), uuid(2), uuid(3)], status: "on_hold", hold_reason_code: "other", hold_reason_detail: "  Call after Eid  ", hold_until_date: null,
    });
    expect(result.body).toMatchObject({ processed: 3, failed: 0 });
    for (const row of db.tables.orders) {
      expect(row).toMatchObject({ status: "on_hold", hold_reason_code: "other", hold_reason_detail: "Call after Eid", hold_until_date: null });
    }
    expect(db.tables.order_activity_events.map((row) => [row.reason_code, row.reason_note])).toEqual([
      ["other", "Call after Eid"], ["other", "Call after Eid"], ["other", "Call after Eid"],
    ]);
  });

  it("logs cancellations and reopenings like the single-order PATCH", async () => {
    const cancel = fixture([order(1, "pending")]);
    await http(cancel.app, "POST", ROUTE, { orderIds: [uuid(1)], status: "cancelled", cancellation_reason_code: "duplicate_order" });
    expect(cancel.db.tables.orders[0]).toMatchObject({ status: "cancelled", cancellation_reason_code: "duplicate_order", cancelled_by: actorId });
    expect(cancel.db.tables.order_activity_events[0]).toMatchObject({ event_type: "order.cancelled", summary: "Cancelled order", reason_code: "duplicate_order" });

    const reopen = fixture([order(1, "cancelled", { cancellation_reason_code: "duplicate_order", cancelled_by: actorId })]);
    await http(reopen.app, "POST", ROUTE, { orderIds: [uuid(1)], status: "pending" });
    expect(reopen.db.tables.orders[0]).toMatchObject({ status: "pending", cancellation_reason_code: null, cancellation_reason_note: null });
    expect(reopen.db.tables.order_activity_events[0]).toMatchObject({ event_type: "order.reopened", summary: "Reopened order" });
  });

  it("falls back to row-by-row activity inserts when a retried request hits a duplicate key", async () => {
    const { app, db } = fixture([order(1, "confirmed"), order(2, "confirmed")]);
    db.tables.order_activity_events.push({ id: uuid(500), org_id: orgId, order_id: uuid(1), request_id: `${groupId}:${uuid(1)}:bulk_status` });
    const result = await http(app, "POST", ROUTE, { orderIds: [uuid(1), uuid(2)], status: "print", activity_group_id: groupId });
    expect(result.body).toMatchObject({ success: true, processed: 2 });
    expect(db.tables.order_activity_events.map((row) => row.request_id)).toEqual([
      `${groupId}:${uuid(1)}:bulk_status`, `${groupId}:${uuid(2)}:bulk_status`,
    ]);
  });

  it("marks only the batch whose update fails", async () => {
    // Two stored statuses make two batches; only the second ("approved") one errors.
    const { app, db } = fixture([order(1, "confirmed"), order(2, "approved")], {
      onOrdersUpdate: (_tables, index) => (index === 1 ? { message: "boom" } : undefined),
    });
    const result = await http(app, "POST", ROUTE, { orderIds: [uuid(1), uuid(2)], status: "print" });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      success: false, processed: 1, failed: 1,
      failures: [{ orderId: uuid(2), orderNumber: "#2", reason: "Could not save this order. Try again." }],
    });
    expect(db.tables.orders.map((row) => row.status)).toEqual(["print", "approved"]);
  });

  it("rejects bad requests with 400 and signed-out requests with 401", async () => {
    const { app, db } = fixture([order(1, "confirmed")]);
    expect((await http(app, "POST", ROUTE, { orderIds: [uuid(1)], status: "print" }, {})).status).toBe(401);
    const bad = [
      {}, { orderIds: [], status: "print" }, { orderIds: "x", status: "print" }, { orderIds: [uuid(1)], status: "delivered" },
      { orderIds: Array.from({ length: 501 }, (_, index) => uuid(1000 + index)), status: "print" },
      { orderIds: [uuid(1)], status: "print", activity_group_id: "nope" },
      { orderIds: [uuid(1)], status: "on_hold" },
      { orderIds: [uuid(1)], status: "print", hold_reason_code: "other" },
      { orderIds: [uuid(1)], status: "cancelled" },
    ];
    for (const body of bad) expect((await http(app, "POST", ROUTE, body)).status).toBe(400);
    expect(db.calls.filter((call) => call.table === "orders")).toHaveLength(0);
  });
});
