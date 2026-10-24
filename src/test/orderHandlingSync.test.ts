import express from "express";
import { runInContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { createOrderHandling } from "../../server/orderHandling.js";
import { database, handlers, http, orgId, foreignOrg, uuid } from "./campaignHandlerHarness";

const session = uuid(9);
const routes = [
  ["POST", "/api/fetch-shopify-orders", {}],
  ["DELETE", `/api/warehouses/${uuid(8)}`, {}],
  ["POST", "/api/products/bulk-assign-warehouse", { product_ids: [uuid(7)], warehouse_id: null }],
  ["PATCH", `/api/products/${uuid(7)}`, { warehouse_id: null }],
] as const;

function guarded(rows: Record<string, unknown>[], conflict = false) {
  const db = database({ orders: rows });
  const rpc = vi.fn(async (_name: string, _args: Record<string, unknown>) => ({ data: { status: conflict ? "view_only" : "available", success: !conflict }, error: null }));
  const app = express(); app.use(express.json());
  app.use(createOrderHandling({ authenticate: async () => ({ orgId, user: { id: uuid(2) }, supabase: { from: db.from, rpc } }) }).guard);
  const mutations: unknown[] = [];
  app.use((req, res) => { mutations.push(req.path); res.json({ ids: (req as express.Request & { orderHandlingIds?: string[] }).orderHandlingIds }); });
  return { app, mutations, rpc };
}
const headers = { authorization: "Bearer test", "x-order-handling-session": session };

describe("sync and warehouse handling reservations", () => {
  it.each(routes)("blocks %s %s before any route side effect", async (method, path, body) => {
    const f = guarded([{ id: uuid(1), org_id: orgId }], true);
    expect((await http(f.app, method, path, body, headers)).status).toBe(409);
    expect(f.mutations).toEqual([]);
    expect(f.rpc.mock.calls[0]?.[1]).toMatchObject({ p_resources: [{ kind: "order", id: uuid(1) }] });
  });
  it.each(routes)("rejects oversized snapshots before %s %s can mutate", async (method, path, body) => {
    const f = guarded(Array.from({ length: 501 }, (_, i) => ({ id: uuid(i + 1), org_id: orgId })));
    expect((await http(f.app, method, path, body, headers)).status).toBe(400);
    expect(f.mutations).toEqual([]); expect(f.rpc).not.toHaveBeenCalled();
  });
  it("passes only this workspace's snapshot and permits empty-workspace imports", async () => {
    const f = guarded([{ id: uuid(1), org_id: orgId }, { id: uuid(2), org_id: foreignOrg }]);
    expect((await http(f.app, "POST", routes[0][1], {}, headers)).body.ids).toEqual([uuid(1)]);
    const empty = guarded([]);
    expect((await http(empty.app, "POST", routes[0][1], {}, headers)).body.ids).toEqual([]);
  });
  it("does not reserve orders for unrelated product edits", async () => {
    const f = guarded([{ id: uuid(1), org_id: orgId }], true);
    expect((await http(f.app, "PATCH", routes[3][1], { name: "Honey" }, headers)).status).toBe(200);
    expect(f.rpc).not.toHaveBeenCalled();
  });
});

describe("reserved warehouse snapshot", () => {
  it("never reroutes an order linked after reservation", async () => {
    const db = database({ orders: [uuid(1), uuid(2)].map(id => ({ id, org_id: orgId, warehouse_id: uuid(3), warehouse_auto: true, status: "pending" })),
      order_items: [uuid(1), uuid(2)].map(order_id => ({ order_id, org_id: orgId, product_id: uuid(7), quantity: 1 })) });
    const h = handlers(db, { normalizeBusinessStatus: (s: string) => s, resolveOrderRouting: async () => ({ warehouseId: uuid(4) }) });
    h.load(["resyncAutoOrderWarehouses"]);
    h.context.db = db; h.context.workspace = orgId; h.context.product = uuid(7); h.context.snapshot = [uuid(1)];
    expect(await runInContext("resyncAutoOrderWarehouses(db, workspace, [product], snapshot)", h.context)).toBe(1);
    expect(db.tables.orders.map(row => row.warehouse_id)).toEqual([uuid(4), uuid(3)]);
  });
});

describe("Shopify snapshot writes", () => {
  async function sync({ empty = false, failRead = false } = {}) {
    const existing = { id: uuid(1), org_id: orgId, shopify_order_id: 101, price: 88, fraud_checked: true, fraud_data: { safe: true } };
    const db = database({ orders: empty ? [] : [existing] });
    const insertCalls: { rows: Record<string, unknown>[]; options: Record<string, unknown> }[] = [];
    const supabase = { ...db, from(table: string) {
      const q = db.from(table);
      return Object.assign(q, { upsert: async (rows: Record<string, unknown>[], options: Record<string, unknown>) => {
        insertCalls.push({ rows, options });
        for (const row of rows) {
          const duplicate = db.tables.orders.find(saved => saved.org_id === row.org_id && saved.shopify_order_id === row.shopify_order_id);
          if (duplicate && !options.ignoreDuplicates) Object.assign(duplicate, row);
          if (!duplicate) db.tables.orders.push(row);
        }
        return { data: null, error: null };
      } });
    } };
    const h = handlers(db, {
      getServiceSupabase: () => supabase,
      getOrgSettings: async () => ({ shopify_store_url: "example.myshopify.com", shopify_admin_api_token: "test-only" }),
      fetch: async () => {
        // Captured after reservation; this record is intentionally unreserved.
        db.tables.orders.push({ id: uuid(2), org_id: orgId, shopify_order_id: 102, price: 777, customer_name: "Reserved by another tab" });
        if (failRead) db.failures.orders = { message: "read unavailable" };
        return { ok: true, json: async () => ({ orders: [101, 102, 103].map(id => ({ id, name: `#${id}`, subtotal_price: "10", shipping_address: { name: "Shopify name" } })) }) };
      },
      sendError: (res: express.Response) => res.status(500).json({ error: "Failed" }),
      errorMessage: (error: Error) => error.message,
    });
    h.app.use(createOrderHandling({ authenticate: async () => ({ orgId, user: { id: uuid(3) }, supabase: { from: db.from, rpc: async () => ({ data: { success: true, status: "available" }, error: null }) } }) }).guard);
    h.load(["chunkIds"], ['app.post("/api/fetch-shopify-orders"']);
    const result = await http(h.app, "POST", "/api/fetch-shopify-orders", {}, headers);
    return { db, result, insertCalls };
  }
  it("updates reserved rows, preserves manual price/fraud, and never overwrites a concurrent import", async () => {
    const { db, result, insertCalls } = await sync();
    expect(result.status).toBe(200);
    expect(db.tables.orders.find(row => row.id === uuid(1))).toMatchObject({ customer_name: "Shopify name", price: 88, fraud_checked: true, fraud_data: { safe: true } });
    expect(db.tables.orders.find(row => row.id === uuid(2))).toMatchObject({ customer_name: "Reserved by another tab", price: 777 });
    expect(db.tables.orders.find(row => row.shopify_order_id === 103)).toMatchObject({ customer_name: "Shopify name", org_id: orgId });
    expect(insertCalls[0].options).toMatchObject({ ignoreDuplicates: true });
    expect(insertCalls[0].rows.every(row => typeof row.id === "string" && row.id !== uuid(1) && row.id !== uuid(2))).toBe(true);
  });
  it("allows initial imports with an empty reserved snapshot", async () => {
    const { db, result } = await sync({ empty: true });
    expect(result.status).toBe(200);
    expect(db.tables.orders).toHaveLength(3);
    expect(db.tables.orders.find(row => row.id === uuid(2))?.price).toBe(777);
  });
  it("fails without writes when the reserved existing rows cannot be loaded", async () => {
    const { db, result, insertCalls } = await sync({ failRead: true });
    expect(result.status).toBe(500);
    expect(db.tables.orders[0].price).toBe(88);
    expect(insertCalls).toEqual([]);
  });
});
