import crypto from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { database, foreignOrg, handlers, http, orgId, uuid } from "./campaignHandlerHarness";
import { buildDetailedActivityEvent } from "../../server/orderActivity.js";
import { normalizeBdPhone } from "../../server/abandonedCheckouts.js";
import * as orderCalls from "../../shared/orderCalls.js";

const ORDER = uuid(50);
const OTHER_STAFF = uuid(2);
const helperKey = "skc_test-key";
const hash = (key: string) => crypto.createHash("sha256").update(key).digest("hex");
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

// The real order call routes, run against the in-memory database.
function fixture(seed: Record<string, Record<string, unknown>[]> = {}) {
  const db = database({
    orders: [
      { id: ORDER, org_id: orgId, phone: "+880 1712345678", order_number: "SK1187", customer_name: "Rumana", status: "on_hold", created_at: "2026-10-20T10:00:00.000Z" },
      { id: uuid(51), org_id: foreignOrg, phone: "01712345678", created_at: "2026-10-21T10:00:00.000Z" },
      { id: uuid(52), org_id: orgId, phone: "", created_at: "2026-10-19T10:00:00.000Z" },
    ],
    user_roles: [{ user_id: uuid(1), org_id: orgId, display_name: "Sadia" }, { user_id: OTHER_STAFF, org_id: orgId, display_name: "Rakib" }],
    order_calls: [],
    call_helper_keys: [],
    ...seed,
  });
  const activity = vi.fn(async (_supabase: unknown, _event: Record<string, unknown>) => ({ recorded: true }));
  const harness = handlers(db, {
    ...orderCalls, normalizeBdPhone, recordOrderActivity: activity, buildDetailedActivityEvent,
    // MicroSIP's key owner resolves through user_roles in production.
    getUserOrg: async (_supabase: unknown, userId: string) => ({ orgId: [uuid(1), OTHER_STAFF].includes(userId) ? orgId : null }),
    sendError: (res: { status: (code: number) => { json: (body: unknown) => unknown } }, e: Error) => res.status(500).json({ error: e.message }),
  });
  harness.load(
    ["ORDER_ID_RE", "ORDER_CALL_FIELDS", "ORDER_CALLS_LIMIT", "ORDER_CALL_INCOMING_WINDOW_MS", "hashCallHelperKey", "formatCallDuration", "orderCallSummary", "recordOrderCallActivity", "withStaffNames", "staffCache", "getOrgStaff", "getActiveOrgStaff", "getStaffNameMap", "parseOrderCallDetails", "activeCallHelperKey"],
    ['app.get("/api/orders/:id/calls"', 'app.post("/api/orders/:id/calls"', 'app.patch("/api/order-calls/:id"', 'app.get("/api/order-calls/helper-key"', 'app.post("/api/order-calls/helper-key"', 'app.get("/api/order-calls/incoming"', 'app.post("/api/webhooks/microsip"'],
  );
  return { ...harness, db, activity };
}

const microsip = (app: Parameters<typeof http>[0], event: string, number: string, key = helperKey) =>
  http(app, "POST", `/api/webhooks/microsip?event=${event}&number=${encodeURIComponent(number)}`, undefined, key ? { authorization: `Bearer ${key}` } : {});
const withKey = () => ({ call_helper_keys: [{ id: uuid(70), org_id: orgId, user_id: uuid(1), key_hash: hash(helperKey), revoked_at: null }] });

describe("order call log", () => {
  it("starts a ringing call when someone clicks Call, using the order's number", async () => {
    const { app, db } = fixture();
    const result = await http(app, "POST", `/api/orders/${ORDER}/calls`, { kind: "dial" });
    expect(result.status).toBe(201);
    expect(result.body.call).toMatchObject({ order_id: ORDER, staff_id: uuid(1), staff_name: "Sadia", direction: "outgoing", phone: "01712345678", outcome: "ringing", source: "click" });
    expect(db.tables.order_calls[0]).toMatchObject({ org_id: orgId });
  });

  it("only calls this workspace's orders with a valid number", async () => {
    const { app } = fixture();
    expect((await http(app, "POST", `/api/orders/${uuid(51)}/calls`, { kind: "dial" })).status).toBe(404);
    expect((await http(app, "POST", `/api/orders/${uuid(52)}/calls`, { kind: "dial" })).status).toBe(400);
    expect((await http(app, "POST", `/api/orders/not-an-id/calls`, { kind: "dial" })).status).toBe(400);
    expect((await http(app, "POST", `/api/orders/${ORDER}/calls`, { kind: "dial" }, {})).status).toBe(401);
  });

  it("adds a call by hand with what the customer said, and logs it on the order", async () => {
    const { app, activity } = fixture();
    const result = await http(app, "POST", `/api/orders/${ORDER}/calls`, { kind: "manual", direction: "incoming", outcome: "answered", said_code: "send_later", note: "  রবিবারের পর  " });
    expect(result.status).toBe(201);
    expect(result.body.call).toMatchObject({ direction: "incoming", outcome: "answered", source: "manual", said_code: "send_later", note: "রবিবারের পর" });
    expect(activity.mock.calls[0][1]).toMatchObject({ order_id: ORDER, event_type: "order.call_logged", summary: "Customer called: answered · পরে পাঠান · রবিবারের পর" });
    for (const body of [{ kind: "manual", direction: "outgoing", outcome: "ringing" }, { kind: "manual", direction: "outgoing", outcome: "answered", said_code: "maybe" }, { kind: "manual", direction: "outgoing", outcome: "answered", note: "x".repeat(301) }, { kind: "other" }]) {
      expect((await http(app, "POST", `/api/orders/${ORDER}/calls`, body)).status).toBe(400);
    }
  });

  it("lists the order's calls newest first with staff names, never another workspace's", async () => {
    const { app } = fixture({ order_calls: [
      { id: uuid(80), org_id: orgId, order_id: ORDER, staff_id: OTHER_STAFF, direction: "outgoing", phone: "01712345678", outcome: "no_answer", source: "microsip", started_at: minutesAgo(60), ended_at: minutesAgo(59) },
      { id: uuid(81), org_id: orgId, order_id: ORDER, staff_id: uuid(1), direction: "incoming", phone: "01712345678", outcome: "answered", source: "microsip", started_at: minutesAgo(5), ended_at: minutesAgo(3), duration_seconds: 100 },
      { id: uuid(82), org_id: foreignOrg, order_id: ORDER, staff_id: uuid(1), direction: "outgoing", phone: "01712345678", outcome: "answered", source: "microsip", started_at: minutesAgo(1) },
    ] });
    const result = await http(app, "GET", `/api/orders/${ORDER}/calls`);
    expect(result.status).toBe(200);
    expect(result.body.viewer_id).toBe(uuid(1));
    expect(result.body.calls.map((call: { id: string; staff_name: string }) => [call.id, call.staff_name])).toEqual([[uuid(81), "Sadia"], [uuid(80), "Rakib"]]);
  });

  it("saves what the customer said, and lets staff give a dialled call its result", async () => {
    const { app, db, activity } = fixture({ order_calls: [{ id: uuid(80), org_id: orgId, order_id: ORDER, staff_id: uuid(1), direction: "outgoing", phone: "01712345678", outcome: "ringing", source: "click", started_at: minutesAgo(10), ended_at: null }] });
    const said = await http(app, "PATCH", `/api/order-calls/${uuid(80)}`, { said_code: "address_change", note: "বনানী অফিস" });
    expect(said.status).toBe(200);
    expect(db.tables.order_calls[0]).toMatchObject({ said_code: "address_change", note: "বনানী অফিস", outcome: "ringing" });
    expect(activity).not.toHaveBeenCalled();

    const result = await http(app, "PATCH", `/api/order-calls/${uuid(80)}`, { outcome: "no_answer" });
    expect(result.status).toBe(200);
    expect(db.tables.order_calls[0]).toMatchObject({ outcome: "no_answer" });
    expect(typeof db.tables.order_calls[0].ended_at).toBe("string");
    expect(activity).toHaveBeenCalledOnce();
    expect((await http(app, "PATCH", `/api/order-calls/${uuid(80)}`, { outcome: "answered" })).status).toBe(409);
    expect((await http(app, "PATCH", `/api/order-calls/${uuid(80)}`, {})).status).toBe(400);
  });

  it("does not edit another workspace's calls", async () => {
    const { app } = fixture({ order_calls: [{ id: uuid(82), org_id: foreignOrg, order_id: ORDER, staff_id: uuid(1), direction: "outgoing", phone: "01712345678", outcome: "ringing", started_at: minutesAgo(1) }] });
    expect((await http(app, "PATCH", `/api/order-calls/${uuid(82)}`, { said_code: "cancel" })).status).toBe(404);
  });
});

describe("MicroSIP key", () => {
  it("creates a key once, keeps only its hash, and replaces the old key", async () => {
    const { app, db } = fixture({ call_helper_keys: [{ id: uuid(70), org_id: orgId, user_id: uuid(1), key_hash: hash("old"), revoked_at: null }] });
    const result = await http(app, "POST", "/api/order-calls/helper-key");
    expect(result.status).toBe(201);
    expect(result.body.key).toMatch(/^skc_[A-Za-z0-9_-]{43}$/);
    expect(db.tables.call_helper_keys[0].revoked_at).toEqual(expect.any(String));
    expect(db.tables.call_helper_keys[1]).toMatchObject({ org_id: orgId, user_id: uuid(1), key_hash: hash(result.body.key) });
    expect(JSON.stringify(db.tables.call_helper_keys)).not.toContain(result.body.key);
    const status = await http(app, "GET", "/api/order-calls/helper-key");
    expect(status.body).toMatchObject({ configured: true });
  });
});

describe("MicroSIP events", () => {
  it("finishes the clicked call: answered, then ended with talk time, logged on the order", async () => {
    const { app, db, activity } = fixture({ ...withKey(), order_calls: [{ id: uuid(80), org_id: orgId, order_id: ORDER, staff_id: uuid(1), direction: "outgoing", phone: "01712345678", outcome: "ringing", source: "click", started_at: minutesAgo(1), answered_at: null, ended_at: null }] });
    expect((await microsip(app, "start", "sip:+8801712345678@pbx")).body).toMatchObject({ action: "update" });
    expect(db.tables.order_calls[0]).toMatchObject({ outcome: "answered" });
    db.tables.order_calls[0].answered_at = new Date(Date.now() - 134_000).toISOString();
    expect((await microsip(app, "end", "01712345678")).body).toMatchObject({ action: "update" });
    expect(db.tables.order_calls[0]).toMatchObject({ outcome: "answered", duration_seconds: 134 });
    expect(activity.mock.calls[0][1]).toMatchObject({ order_id: ORDER, actor_id: uuid(1), source_surface: "microsip", summary: "Called customer: answered (2:14)" });
  });

  it("saves a call nobody picked up as no answer", async () => {
    const { app, db } = fixture({ ...withKey(), order_calls: [{ id: uuid(80), org_id: orgId, order_id: ORDER, staff_id: uuid(1), direction: "outgoing", phone: "01712345678", outcome: "ringing", source: "click", started_at: minutesAgo(1), answered_at: null, ended_at: null }] });
    await microsip(app, "end", "01712345678");
    expect(db.tables.order_calls[0]).toMatchObject({ outcome: "no_answer" });
  });

  it("matches an incoming call to the customer's latest order in this workspace", async () => {
    const { app, db } = fixture(withKey());
    expect((await microsip(app, "incoming", "01712345678")).status).toBe(200);
    expect(db.tables.order_calls[0]).toMatchObject({ org_id: orgId, order_id: ORDER, staff_id: uuid(1), direction: "incoming", outcome: "ringing", phone: "01712345678" });
    const popup = await http(app, "GET", "/api/order-calls/incoming");
    expect(popup.body).toMatchObject({ enabled: true, call: { direction: "incoming", order: { id: ORDER, order_number: "SK1187", customer_name: "Rumana" } } });
    await microsip(app, "answer", "01712345678");
    expect(db.tables.order_calls[0]).toMatchObject({ outcome: "answered" });
  });

  it("rejects missing or revoked keys and unknown events, and ignores non-mobile numbers", async () => {
    const { app } = fixture({ call_helper_keys: [{ id: uuid(70), org_id: orgId, user_id: uuid(1), key_hash: hash(helperKey), revoked_at: "2026-10-01T00:00:00.000Z" }] });
    expect((await microsip(app, "start", "01712345678")).status).toBe(401);
    expect((await microsip(app, "start", "01712345678", "")).status).toBe(401);
    const { app: keyed, db } = fixture(withKey());
    expect((await microsip(keyed, "hold", "01712345678")).status).toBe(400);
    expect((await microsip(keyed, "incoming", "sip:101@pbx")).body).toMatchObject({ ignored: "not_a_bd_mobile" });
    expect(db.tables.order_calls).toHaveLength(0);
  });

  it("stops working for staff who were removed from the workspace", async () => {
    const { app } = fixture({ call_helper_keys: [{ id: uuid(70), org_id: orgId, user_id: uuid(9), key_hash: hash(helperKey), revoked_at: null }] });
    expect((await microsip(app, "incoming", "01712345678")).status).toBe(401);
  });

  it("tells staff without a key that there is nothing to watch", async () => {
    const { app } = fixture();
    expect((await http(app, "GET", "/api/order-calls/incoming")).body).toEqual({ enabled: false, call: null });
  });
});
