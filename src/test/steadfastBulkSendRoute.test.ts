import { describe, expect, it, vi } from "vitest";
import { database, handlers, http, orgId, uuid } from "./campaignHandlerHarness";
import * as steadfastBulkSend from "../../server/steadfastBulkSend.js";
import * as steadfastSend from "../../shared/steadfastSend.js";
import { buildDetailedActivityEvent } from "../../server/orderActivity.js";
import { mapWithConcurrency } from "../../server/customerSms.js";
import { parseLegacyProductLines } from "../../server/orderItemParsing.js";

// The real Steadfast bulk send and check routes, run against the in-memory
// database with a fake Steadfast.

type Row = Record<string, unknown>;
type Resolve = (value: unknown) => unknown;
type Query = ReturnType<ReturnType<typeof database>["from"]>;
type Lookup = "found" | "missing" | "unknown";

const SEND = "/api/send-to-courier/bulk";
const CHECK = "/api/send-to-courier/bulk/check";
const SINGLE = "/api/send-to-courier";
const CHECKING = steadfastSend.steadfastIssueMessage("checking");

function order(n: number, overrides: Row = {}): Row {
  return {
    id: uuid(n), org_id: orgId, order_number: `#${n}`, status: "print", customer_name: "Rahim", phone: "01712345678",
    address: "House 9, Dhanmondi", price: 800, delivery_rate: 60, advanced_payment: 0, product: "Honey", quantity: 1,
    sent_to_courier: false, consignment_id: null, tracking_code: null, courier_message: null, ...overrides,
  };
}

type Reply = { status: number; body: unknown } | "timeout";

// Steadfast accepts every invoice unless the test says otherwise.
function acceptAll(payload: Row[]): Reply {
  return { status: 200, body: { status: 200, data: payload.map((row, index) => ({ invoice: row.invoice, status: "success", consignment_id: 9000 + index, tracking_code: `TRK${index}` })) } };
}

function fixture(seed: Row[], options: { reply?: (payload: Row[]) => Reply; lookups?: Record<string, Lookup>; failSentSave?: boolean } = {}) {
  const db = database({ orders: seed, order_items: [], user_roles: [{ user_id: uuid(1), org_id: orgId, display_name: "Nadia" }], order_activity_events: [] });
  const baseFrom = db.from;
  const from = (table: string) => {
    const query = baseFrom(table) as Query & Record<string, unknown>;
    const run = query.then.bind(query) as (resolve: Resolve, reject?: Resolve) => Promise<unknown>;
    const update = query.update.bind(query);
    let payload: Row | null = null;
    query.update = (value: Row) => { payload = value; return update(value); };
    query.then = (async (resolve: Resolve, reject?: Resolve) => {
      if (table === "orders" && options.failSentSave && payload?.consignment_id) return resolve({ data: null, error: { message: "db down" } });
      return run((value) => resolve(structuredClone(value)), reject);
    }) as Query["then"];
    return query;
  };

  const sentPayloads: Row[][] = [];
  const messagesAtSend: unknown[][] = [];
  const fetch = vi.fn(async (_url: string, init: RequestInit) => {
    const payload = JSON.parse(JSON.parse(String(init.body)).data) as Row[];
    sentPayloads.push(payload);
    messagesAtSend.push(db.tables.orders.map((row) => row.courier_message));
    const reply = (options.reply ?? acceptAll)(payload);
    if (reply === "timeout") throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    return { status: reply.status, ok: reply.status < 300, json: async () => reply.body };
  });
  const lookupSteadfastInvoice = vi.fn(async ({ invoice }: { invoice: string }) => options.lookups?.[invoice] ?? "unknown");
  const sendBulkSms = vi.fn(async (_orgId: string, _type: string, row: Row) => {
    // SMS only goes out for an order that is already saved as sent.
    expect(db.tables.orders.find((saved) => saved.id === row.id)?.sent_to_courier).toBe(true);
  });

  const harness = handlers({ ...db, from } as unknown as ReturnType<typeof database>, {
    ...steadfastBulkSend, ...steadfastSend, buildDetailedActivityEvent, mapWithConcurrency, parseLegacyProductLines,
    fetch, lookupSteadfastInvoice, sendBulkSms,
    getOrgSettings: async () => ({ steadfast_api_key: "key", steadfast_secret_key: "secret" }),
  });
  harness.load([
    "MAX_EVENT_INSERT_ATTEMPTS", "saveSteadfastIssues", "settleSteadfastLookups", "steadfastFailureEvents", "sortByRequest",
    "isOrderDispatched", "getCourierOrderItems", "formatCourierItems", "readableVariantName", "variantDisplay",
    "buildOperationRequestId", "recordOrderActivity", "recordOrderActivities", "isMissingDetailedActivityTable", "delay",
    "errorMessage", "sendError", "chunkIds", "normalizeBusinessStatus", "normalizeOperationalFailureCode",
  ], [`app.post("${CHECK}"`, `app.post("${SEND}"`, `app.post("${SINGLE}", `]);
  const saved = (n: number) => db.tables.orders.find((row) => row.id === uuid(n))!;
  return { app: harness.app, db, fetch, lookupSteadfastInvoice, sendBulkSms, sentPayloads, messagesAtSend, saved };
}

describe("POST /api/send-to-courier/bulk", () => {
  it("sends good orders in one Steadfast call and saves each reason for the rest", async () => {
    const t = fixture([order(1), order(2, { phone: "01712" }), order(3, { address: "  " }), order(4)]);
    const result = await http(t.app, "POST", SEND, { orderIds: [uuid(1), uuid(2), uuid(3), uuid(4)] });

    expect(result.status).toBe(200);
    expect(t.fetch).toHaveBeenCalledTimes(1);
    expect(t.sentPayloads[0].map((row) => row.invoice)).toEqual(["ORD-1", "ORD-4"]);
    expect(t.sentPayloads[0][0]).toMatchObject({ recipient_phone: "01712345678", recipient_address: "House 9, Dhanmondi", cod_amount: 860, note: "" });
    // Write ahead: Steadfast is only called once the orders say "Checking".
    expect(t.messagesAtSend[0][0]).toBe(CHECKING);
    expect(t.messagesAtSend[0][3]).toBe(CHECKING);

    expect(result.body).toMatchObject({ success: false, processed: 2, failed: 2 });
    expect(result.body.succeeded.map((row: Row) => row.orderId)).toEqual([uuid(1), uuid(4)]);
    expect(result.body.failures).toEqual([
      expect.objectContaining({ orderId: uuid(2), code: "phone", reason: steadfastSend.steadfastIssueMessage("phone"), order: expect.objectContaining({ id: uuid(2) }) }),
      expect.objectContaining({ orderId: uuid(3), code: "address", reason: steadfastSend.steadfastIssueMessage("address") }),
    ]);
    expect(t.saved(1)).toMatchObject({ sent_to_courier: true, consignment_id: "9000", tracking_code: "TRK0", courier_message: "Sent to Steadfast successfully" });
    expect(t.saved(2).courier_message).toBe(steadfastSend.steadfastIssueMessage("phone"));
    expect(t.saved(2).sent_to_courier).toBe(false);
    expect(t.sendBulkSms).toHaveBeenCalledTimes(2);
    expect(t.db.tables.order_activity_events.map((row) => [row.order_id, row.event_type])).toEqual([
      [uuid(1), "courier.submitted"], [uuid(4), "courier.submitted"], [uuid(2), "courier.failed"], [uuid(3), "courier.failed"],
    ]);
  });

  it("saves Steadfast's no for the rows it turned down", async () => {
    const t = fixture([order(1), order(2)], {
      reply: (payload) => ({ status: 200, body: { data: [
        { invoice: payload[0].invoice, status: "success", consignment_id: 1, tracking_code: "A" },
        { invoice: payload[1].invoice, status: "error" },
      ] } }),
    });
    const result = await http(t.app, "POST", SEND, { orderIds: [uuid(1), uuid(2)] });
    expect(result.body.failures).toEqual([expect.objectContaining({ orderId: uuid(2), code: "rejected" })]);
    expect(t.saved(2).courier_message).toBe(steadfastSend.steadfastIssueMessage("rejected"));
    expect(t.sendBulkSms).toHaveBeenCalledTimes(1);
  });

  it("calls every order turned down when Steadfast answers 4xx with no rows", async () => {
    const t = fixture([order(1), order(2)], { reply: () => ({ status: 422, body: { message: "Invalid COD amount" } }) });
    const result = await http(t.app, "POST", SEND, { orderIds: [uuid(1), uuid(2)] });
    expect(result.body.failures.map((row: Row) => row.code)).toEqual(["rejected", "rejected"]);
    expect(t.saved(1).courier_message).toBe("Steadfast said no: Invalid COD amount");
  });

  it("keeps orders as checking when Steadfast's reply never arrives", async () => {
    for (const reply of ["timeout", { status: 502, body: null }, { status: 200, body: { status: 200 } }] as Reply[]) {
      const t = fixture([order(1)], { reply: () => reply });
      const result = await http(t.app, "POST", SEND, { orderIds: [uuid(1)] });
      expect(result.status).toBe(200);
      expect(result.body.failures).toEqual([expect.objectContaining({ orderId: uuid(1), code: "checking", reason: CHECKING })]);
      expect(t.saved(1)).toMatchObject({ sent_to_courier: false, courier_message: CHECKING });
      expect(t.sendBulkSms).not.toHaveBeenCalled();
    }
  });

  it("leaves the checking note when Steadfast took the order but our save failed", async () => {
    const t = fixture([order(1)], { failSentSave: true });
    const result = await http(t.app, "POST", SEND, { orderIds: [uuid(1)] });
    expect(result.body.failures).toEqual([expect.objectContaining({ code: "checking" })]);
    expect(t.saved(1).courier_message).toBe(CHECKING);
    expect(t.sendBulkSms).not.toHaveBeenCalled();
  });

  it("looks up orders a past send may have reached before sending them again", async () => {
    const t = fixture([
      order(1, { courier_message: CHECKING }),
      order(2, { courier_message: CHECKING }),
      order(3, { courier_message: steadfastSend.steadfastIssueMessage("not_received") }),
    ], { lookups: { "ORD-1": "found", "ORD-2": "unknown", "ORD-3": "missing" } });
    const result = await http(t.app, "POST", SEND, { orderIds: [uuid(1), uuid(2), uuid(3)] });

    expect(t.lookupSteadfastInvoice).toHaveBeenCalledTimes(3);
    expect(t.sentPayloads[0].map((row) => row.invoice)).toEqual(["ORD-3"]);
    expect(result.body.succeeded.map((row: Row) => row.orderId)).toEqual([uuid(3)]);
    expect(result.body.failures.map((row: Row) => [row.orderId, row.code])).toEqual([[uuid(1), "no_code"], [uuid(2), "checking"]]);
    expect(t.saved(1)).toMatchObject({ sent_to_courier: true, courier_name: "steadfast", courier_status: "in_review", consignment_id: null, courier_message: steadfastSend.steadfastIssueMessage("no_code") });
    expect(t.saved(2)).toMatchObject({ sent_to_courier: false, courier_message: CHECKING });
    expect(t.sendBulkSms).toHaveBeenCalledTimes(1);
  });

  it("skips orders that are not ready without saving anything on them", async () => {
    const t = fixture([order(1, { status: "confirmed" }), order(2, { sent_to_courier: true, consignment_id: "5" })]);
    const result = await http(t.app, "POST", SEND, { orderIds: [uuid(1), uuid(2), uuid(9)] });
    expect(t.fetch).not.toHaveBeenCalled();
    expect(result.body.failures.map((row: Row) => [row.orderId, row.code, row.reason])).toEqual([
      [uuid(1), "other", "Only Print orders can be sent to Steadfast"],
      [uuid(2), "other", "Order already sent to courier"],
      [uuid(9), "other", "Order not found"],
    ]);
    expect(t.db.calls.some((call) => call.table === "orders" && call.method === "update")).toBe(false);
  });
});

describe("POST /api/send-to-courier/bulk/check", () => {
  it("settles each order the browser is waiting on", async () => {
    const t = fixture([
      order(1, { courier_message: CHECKING }),
      order(2, { courier_message: CHECKING }),
      order(3, { courier_message: CHECKING }),
      order(4, { sent_to_courier: true, consignment_id: "77", courier_message: "Sent to Steadfast successfully" }),
      order(5),
    ], { lookups: { "ORD-1": "missing", "ORD-2": "found", "ORD-3": "unknown" } });
    const result = await http(t.app, "POST", CHECK, { orderIds: [uuid(1), uuid(2), uuid(3), uuid(4), uuid(5)] });

    expect(result.status).toBe(200);
    expect(t.fetch).not.toHaveBeenCalled();
    expect(t.lookupSteadfastInvoice).toHaveBeenCalledTimes(3);
    expect(result.body.succeeded.map((row: Row) => row.orderId)).toEqual([uuid(4)]);
    expect(result.body.failures.map((row: Row) => [row.orderId, row.code])).toEqual([
      [uuid(1), "not_received"], [uuid(2), "no_code"], [uuid(3), "checking"], [uuid(5), "not_sent"],
    ]);
    expect(t.saved(1).courier_message).toBe(steadfastSend.steadfastIssueMessage("not_received"));
    expect(t.saved(2)).toMatchObject({ sent_to_courier: true, courier_message: steadfastSend.steadfastIssueMessage("no_code") });
    expect(t.saved(3).courier_message).toBe(CHECKING);
    expect(t.saved(5).courier_message).toBeNull();
  });

  it("rejects bad requests and signed-out users", async () => {
    const t = fixture([order(1)]);
    expect((await http(t.app, "POST", CHECK, { orderIds: [uuid(1)] }, {})).status).toBe(401);
    for (const body of [{}, { orderIds: [] }, { orderIds: [""] }, { orderIds: Array.from({ length: 501 }, (_, i) => uuid(100 + i)) }]) {
      expect((await http(t.app, "POST", CHECK, body)).status).toBe(400);
    }
  });
});

describe("POST /api/send-to-courier after a lost bulk reply", () => {
  it("won't send an order Steadfast already has, and saves it as sent", async () => {
    const t = fixture([order(1, { courier_message: CHECKING })], { lookups: { "ORD-1": "found" } });
    const result = await http(t.app, "POST", SINGLE, { orderId: uuid(1) });
    expect(result.status).toBe(409);
    expect(result.body.order).toMatchObject({ id: uuid(1), sent_to_courier: true });
    expect(t.fetch).not.toHaveBeenCalled();
    expect(t.saved(1).courier_message).toBe(steadfastSend.steadfastIssueMessage("no_code"));
  });

  it("waits when Steadfast can't confirm, and sends when it has never seen the order", async () => {
    const unsure = fixture([order(1, { courier_message: CHECKING })], { lookups: { "ORD-1": "unknown" } });
    expect((await http(unsure.app, "POST", SINGLE, { orderId: uuid(1) })).status).toBe(503);
    expect(unsure.fetch).not.toHaveBeenCalled();
    expect(unsure.saved(1).courier_message).toBe(CHECKING);

    const missing = fixture([order(1, { courier_message: CHECKING })], { lookups: { "ORD-1": "missing" } });
    // The single route calls create_order, which answers with one consignment.
    missing.fetch.mockImplementationOnce(async () => ({
      status: 200, ok: true, json: async () => ({ status: 200, consignment: { consignment_id: 55, tracking_code: "T55", status: "in_review" } }),
    }));
    const sent = await http(missing.app, "POST", SINGLE, { orderId: uuid(1) });
    expect(sent.status).toBe(200);
    expect(missing.saved(1)).toMatchObject({ sent_to_courier: true, consignment_id: "55", courier_message: "Sent to Steadfast successfully" });
  });
});
