import express from "express";
import { createServer } from "node:http";
import { describe, expect, it, vi } from "vitest";
import { createOrderHandling } from "../../server/orderHandling.js";
import { orderHandlingFetch } from "../../server/orderHandlingOperation.js";
import { database, foreignOrg } from "./campaignHandlerHarness";

const orgId = "10000000-0000-4000-8000-000000000001";
const userId = "10000000-0000-4000-8000-000000000002";
const session = "10000000-0000-4000-8000-000000000003";
const id = "10000000-0000-4000-8000-000000000004";

async function fixture(options: { denied?: boolean; error?: string; conflict?: boolean; cleanup?: () => Promise<void>; tables?: Record<string, Record<string, unknown>[]> } = {}) {
  const db = database(options.tables || {});
  const rpc = vi.fn(async (_name: string, args: Record<string, unknown>) => {
    if (args.p_action === "end_write") await options.cleanup?.();
    return ({
    data: { success: !options.conflict, status: options.conflict ? "view_only" : args.p_action === "status" || args.p_action === "begin_write" ? "available" : "handling", holder: options.conflict ? { name: "Rahim" } : null, expires_at: null },
    error: options.error ? { code: options.error } : null,
  }); });
  const authenticate = vi.fn(async () => options.denied ? null : { user: { id: userId }, orgId, supabase: { rpc, from: db.from } });
  const handling = createOrderHandling({ authenticate });
  const app = express(); app.use(express.json()); app.use(handling.guard);
  app.post("/api/order-handling/:kind/:id", handling.endpoint);
  const changed: string[] = [];
  app.patch("/api/orders/:id", (req, res) => { changed.push(req.params.id); res.json({ saved: true }); });
  app.post("/api/orders/bulk-status", (_req, res) => { changed.push("bulk"); res.json({ saved: true }); });
  app.post("/api/orders/:id/activity/view", (_req, res) => res.json({ viewed: true }));
  app.use((req, res) => { changed.push(req.path); res.json({ saved: true }); });
  const server = createServer(app); await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); if (!address || typeof address === "string") throw new Error("No server");
  const request = async (path: string, body: unknown = {}, method = "POST", headers: Record<string, string> = {}) => {
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, { method, headers: { "Content-Type": "application/json", "X-Order-Handling-Session": session, ...headers }, body: JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  };
  const close = () => new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); });
  return { rpc, authenticate, changed, request, close };
}

describe("order handling HTTP enforcement", () => {
  it("denies unauthenticated acquisition and mutations", async () => {
    const f = await fixture({ denied: true }); try {
      expect((await f.request(`/api/order-handling/order/${id}`, { action: "acquire", session_id: session })).status).toBe(401);
      expect((await f.request(`/api/orders/${id}`, {}, "PATCH")).status).toBe(401);
      expect(f.changed).toEqual([]); expect(f.rpc).not.toHaveBeenCalled();
    } finally { await f.close(); }
  });
  it("uses authenticated workspace and rejects invalid scope/actions/sessions", async () => {
    const f = await fixture(); try {
      expect((await f.request(`/api/order-handling/order/${id}`, { action: "acquire", session_id: session, org_id: "foreign" })).status).toBe(200);
      expect(f.rpc.mock.calls[0][1]).toMatchObject({ p_org: orgId, p_user: userId, p_session: session, p_resources: [{ kind: "order", id }], p_action: "acquire" });
      for (const [kind, record, body] of [["tenant", id, { action: "status", session_id: session }], ["order", "bad", { action: "status", session_id: session }], ["order", id, { action: "begin_write", session_id: session }], ["order", id, { action: "acquire", session_id: "bad" }]]) {
        expect((await f.request(`/api/order-handling/${kind}/${record}`, body)).status).toBe(400);
      }
    } finally { await f.close(); }
  });
  it("blocks a conflicting save and the entire conflicting bulk action before effects", async () => {
    const f = await fixture({ conflict: true }); try {
      const single = await f.request(`/api/orders/${id}`, {}, "PATCH");
      expect(single).toMatchObject({ status: 409, body: { code: "ORDER_HANDLING_CONFLICT", holder: { name: "Rahim" } } });
      expect((await f.request("/api/orders/bulk-status", { orderIds: [id], status: "confirmed" })).status).toBe(409);
      expect(f.changed).toEqual([]);
    } finally { await f.close(); }
  });
  it("claims a mutation and cleans up with the same opaque operation after response", async () => {
    const f = await fixture(); try {
      expect((await f.request(`/api/orders/${id}`, {}, "PATCH")).status).toBe(200);
      await new Promise(resolve => setImmediate(resolve));
      expect(f.changed).toEqual([id]);
      const args = f.rpc.mock.calls.map(call => call[1]);
      expect(args.map(value => value.p_action)).toEqual(["begin_write", "end_write"]);
      expect(args[0].p_operation).toMatch(/^[0-9a-f-]{36}$/);
      expect(args[1].p_operation).toBe(args[0].p_operation);
      expect(args[0].p_session).toBe(session);
    } finally { await f.close(); }
  });
  it("fails closed when persistence is missing without exposing internals", async () => {
    const f = await fixture({ error: "PGRST202" }); try {
      expect(await f.request(`/api/orders/${id}`, {}, "PATCH")).toMatchObject({ status: 503, body: { code: "ORDER_HANDLING_UNAVAILABLE" } });
      expect(f.changed).toEqual([]);
    } finally { await f.close(); }
  });
  it("does not acknowledge a completed write before delayed token cleanup", async () => {
    let release: () => void = () => {};
    const cleaned = new Promise<void>(resolve => { release = resolve; });
    const f = await fixture({ cleanup: () => cleaned });
    try {
      let acknowledged = false;
      const saving = f.request(`/api/orders/${id}`, {}, "PATCH").then(result => { acknowledged = true; return result; });
      await vi.waitFor(() => expect(f.rpc.mock.calls.some(([, args]) => args.p_action === "end_write")).toBe(true));
      expect(acknowledged).toBe(false);
      release(); expect((await saving).status).toBe(200);
    } finally { release(); await f.close(); }
  });
  it("lets order protection reviews proceed without a handling reservation", async () => {
    const f = await fixture({ conflict: true }); try {
      expect((await f.request(`/api/order-protection/reviews/${id}`, { action: "approve" }, "PATCH")).status).toBe(200);
      expect(f.rpc).not.toHaveBeenCalled();
      expect(f.changed).toEqual([`/api/order-protection/reviews/${id}`]);
    } finally { await f.close(); }
  });
  it("leaves read telemetry accessible to viewers without a write claim", async () => {
    const f = await fixture({ conflict: true }); try {
      expect((await f.request(`/api/orders/${id}/activity/view`)).status).toBe(200);
      expect(f.rpc).not.toHaveBeenCalled();
    } finally { await f.close(); }
  });
  it("requires a tab session for protected writes", async () => {
    const f = await fixture(); try {
      expect((await f.request(`/api/orders/${id}`, {}, "PATCH", { "X-Order-Handling-Session": "" })).status).toBe(400);
      expect(f.changed).toEqual([]);
    } finally { await f.close(); }
  });
  it.each([
    ["PATCH", `/api/orders/${id}/items`, {}],
    ["POST", `/api/orders/${id}/calls`, { kind: "dial" }],
    ["POST", `/api/orders/${id}/send-sms`, {}],
    ["PATCH", `/api/abandoned-checkouts/${id}`, { action: "contacted" }],
    ["POST", `/api/abandoned-checkouts/${id}/convert`, {}],
    ["POST", "/api/send-to-courier", { orderId: id }],
    ["POST", "/api/send-to-pathao", { orderId: id }],
    ["POST", "/api/send-to-courier/bulk", { orderIds: [id] }],
    ["POST", "/api/send-to-courier/bulk/check", { orderIds: [id] }],
    ["POST", "/api/orders/follow-up", { order_ids: [id] }],
    ["POST", "/api/check-fraud", { orderId: id }],
    ["POST", "/api/returns/request", { orderId: id }],
    ["DELETE", "/api/orders", { ids: [id] }],
    ["POST", "/api/order-board/cards", { order_id: id }],
  ])("blocks conflicting processing through %s %s", async (method, path, body) => {
    const f = await fixture({ conflict: true }); try {
      expect((await f.request(String(path), body, String(method))).status).toBe(409);
      expect(f.changed).toEqual([]);
    } finally { await f.close(); }
  });
  it("resolves a call to its actual order and hides foreign call ownership", async () => {
    const callId = "10000000-0000-4000-8000-000000000005";
    const f = await fixture({ conflict: true, tables: { order_calls: [{ id: callId, org_id: orgId, order_id: id }] } });
    try {
      expect((await f.request(`/api/order-calls/${callId}`, {}, "PATCH")).status).toBe(409);
      expect(f.rpc.mock.calls[0][1].p_resources).toEqual([{ kind: "order", id }]);
    } finally { await f.close(); }
    const foreign = await fixture({ tables: { order_calls: [{ id: callId, org_id: foreignOrg, order_id: id }] } });
    try {
      expect((await foreign.request(`/api/order-calls/${callId}`, {}, "PATCH")).status).toBe(404);
      expect(foreign.rpc).not.toHaveBeenCalled(); expect(foreign.changed).toEqual([]);
    } finally { await foreign.close(); }
  });
  it("resolves AI displayed order numbers before allowing any mutation", async () => {
    const f = await fixture({ conflict: true, tables: { orders: [{ id, org_id: orgId, order_number: "SK-1042" }] } });
    try {
      expect((await f.request("/api/order-chat/apply", { tool: "update_order", args: { order_id: "SK-1042", fields: { status: "cancelled" } } })).status).toBe(409);
      expect(f.rpc.mock.calls[0][1].p_resources).toEqual([{ kind: "order", id }]);
      expect(f.changed).toEqual([]);
    } finally { await f.close(); }
  });
  it("never passes malformed batches or unresolved AI records to the handler", async () => {
    const f = await fixture(); try {
      expect((await f.request("/api/orders/bulk-status", { orderIds: [id, "bad"] })).status).toBe(400);
      expect((await f.request("/api/order-chat/apply", { tool: "dispatch_to_courier", args: { order_ids: ["missing"] } })).status).toBe(404);
      expect(f.changed).toEqual([]);
    } finally { await f.close(); }
  });
  it("stops a protected request before later side effects when reservation renewal fails", async () => {
    const rpc = vi.fn(async (_name: string, args: Record<string, unknown>) => ({
      data: { success: args.p_action !== "renew_write", status: "available" as const, holder: null, expires_at: null },
      error: null,
    }));
    const authenticate = vi.fn(async () => ({ user: { id: userId }, orgId, supabase: { rpc, from: () => ({}) } }));
    const handling = createOrderHandling({ authenticate, renewIntervalMs: 10 });
    const app = express();
    app.use(express.json());
    app.use(handling.guard);
    const external = vi.fn(async () => new Response("{}"));
    const realFetch = globalThis.fetch.bind(globalThis);
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.includes("127.0.0.1")) return realFetch(input, init);
      return external(input, init);
    });
    let reached = false;
    app.post("/api/orders/:id/send-sms", async (_req, res) => {
      await vi.waitFor(() => expect(rpc.mock.calls.some(([, args]) => args.p_action === "renew_write")).toBe(true));
      try {
        await orderHandlingFetch("https://courier.test/send");
        reached = true;
        res.json({ sent: true });
      } catch {
        res.status(503).json({ error: "stopped" });
      }
    });
    const server = createServer(app);
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No server");
    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/api/orders/${id}/send-sms`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Order-Handling-Session": session },
        body: "{}",
      });
      expect(response.status).toBe(503);
      expect(await response.json()).toMatchObject({ error: "stopped" });
      expect(reached).toBe(false);
      expect(external).not.toHaveBeenCalled();
      expect(rpc.mock.calls.map(call => call[1].p_action)).toContain("end_write");
    } finally {
      vi.unstubAllGlobals();
      await new Promise<void>(resolve => { server.closeAllConnections(); server.close(() => resolve()); });
    }
  });
});
