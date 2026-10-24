import { randomUUID } from "node:crypto";
import { getOrderForAudit } from "./ai-actions.js";
import { withOrderHandlingOperation, withoutOrderHandlingOperation } from "./orderHandlingOperation.js";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS = new Set(["order", "abandoned", "review"]);
const ACTIONS = new Set(["acquire", "heartbeat", "status", "release"]);
const MAX_TARGETS = 500;

function problem(status, message) {
  return Object.assign(new Error(message), { statusCode: status });
}

function targets(kind, ids) {
  if (!Array.isArray(ids) || !ids.length || ids.length > MAX_TARGETS || ids.some(id => typeof id !== "string" || !UUID.test(id))) {
    throw problem(400, "Choose valid records (up to 500 per action).");
  }
  return [...new Set(ids)].map(id => ({ kind, id }));
}

// The policy covers staff processing, including side effects. Customer capture,
// courier webhooks, and scheduled maintenance retain their own system authority.
function policy(req) {
  const path = req.path.replace(/\/$/, "");
  const method = req.method;
  if (method === "GET" && path === "/api/returns/sync") return { implicit: "all" };
  if (!["POST", "PATCH", "PUT", "DELETE"].includes(method)) return null;
  if (/\/activity\/view$/.test(path)) return null;
  // These staff actions can rewrite existing orders indirectly. Reserve the
  // whole bounded workspace before any import/product/warehouse side effect.
  if (method === "POST" && path === "/api/fetch-shopify-orders") return { implicit: "all" };
  if (method === "DELETE" && /^\/api\/warehouses\/[^/]+$/.test(path)) return { implicit: "all" };
  if (method === "POST" && path === "/api/products/bulk-assign-warehouse") return { implicit: "all" };
  if (method === "PATCH" && /^\/api\/products\/[^/]+$/.test(path) && req.body?.warehouse_id !== undefined) return { implicit: "all" };
  let match = path.match(/^\/api\/orders\/([^/]+)(?:\/(items|calls|send-sms))?$/);
  if (match && UUID.test(match[1])) return { kind: "order", id: match[1] };
  match = path.match(/^\/api\/abandoned-checkouts\/([^/]+)(?:\/convert)?$/);
  if (match) return { kind: "abandoned", id: match[1] };
  match = path.match(/^\/api\/order-protection\/reviews\/([^/]+)$/);
  if (match) return { kind: "review", id: match[1] };
  match = path.match(/^\/api\/order-calls\/([^/]+)$/);
  if (match) return { lookup: "order_calls", id: match[1] };
  match = path.match(/^\/api\/order-board\/cards\/([^/]+)(?:\/updates)?$/);
  if (match) return { lookup: "order_board_cards", id: match[1] };
  match = path.match(/^\/api\/order-protection\/attempts\/([^/]+)\/label$/);
  if (match) return { attempt: match[1] };
  switch (path) {
    case "/api/orders": return method === "DELETE" ? { kind: "order", ids: req.body?.ids } : null;
    case "/api/orders/bulk-status": return { kind: "order", ids: req.body?.orderIds };
    case "/api/orders/follow-up": return { kind: "order", ids: req.body?.order_ids };
    case "/api/send-to-courier":
    case "/api/send-to-pathao": return { kind: "order", id: req.body?.orderId };
    case "/api/send-to-courier/bulk":
    case "/api/send-to-courier/bulk/check": return { kind: "order", ids: req.body?.orderIds };
    case "/api/check-fraud": return req.body?.orderId ? { kind: "order", id: req.body.orderId } : { implicit: "fraud" };
    case "/api/returns/request": return req.body?.source === "inbox" ? null : { kind: "order", id: req.body?.orderId };
    case "/api/pathao/refresh-status": return { implicit: "courier" };
    case "/api/returns/backfill-fees": return { implicit: "fees" };
    case "/api/order-board/cards": return { kind: "order", id: req.body?.order_id };
    case "/api/order-protection/lists": return req.body?.attemptId ? { attempt: req.body.attemptId } : null;
    case "/api/order-chat/apply": return ["update_order", "dispatch_to_courier"].includes(req.body?.tool) ? { ai: req.body } : null;
    default: return null;
  }
}

async function lookup(supabase, orgId, table, id, fields) {
  if (!UUID.test(String(id))) throw problem(400, "Invalid record.");
  const { data, error } = await supabase.from(table).select(fields).eq("org_id", orgId).eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw problem(404, "Record not found.");
  return data;
}

export async function resolveHandlingTargets(req, supabase, orgId, selected = policy(req)) {
  if (!selected) return null;
  if (selected.kind) return targets(selected.kind, selected.ids === undefined ? [selected.id] : selected.ids);
  if (selected.lookup) {
    const row = await lookup(supabase, orgId, selected.lookup, selected.id, "order_id");
    return targets("order", [row.order_id]);
  }
  if (selected.attempt) {
    const row = await lookup(supabase, orgId, "order_risk_attempts", selected.attempt, "order_id,review_id");
    if (row.order_id) return targets("order", [row.order_id]);
    if (row.review_id) return targets("review", [row.review_id]);
    return []; // Assessment with no order/review is not a processing workspace.
  }
  if (selected.ai) {
    const body = selected.ai;
    const ids = body.tool === "update_order" ? [body.args?.order_id] : body.args?.order_ids;
    if (!Array.isArray(ids) || !ids.length || ids.length > 25 || ids.some(id => typeof id !== "string")) throw problem(400, "Choose valid orders.");
    const rows = await Promise.all(ids.map(id => getOrderForAudit(supabase, orgId, id)));
    if (rows.some(row => !row)) throw problem(404, "Order not found.");
    return targets("order", rows.map(row => row.id));
  }
  let query = supabase.from("orders").select("id").eq("org_id", orgId);
  if (selected.implicit === "fraud") query = query.order("shopify_order_id", { ascending: false }).limit(15);
  else {
    if (selected.implicit === "courier" || selected.implicit === "fees") query = query.eq("sent_to_courier", true);
    if (selected.implicit === "fees") query = query.is("courier_fee", null);
    query = query.limit(MAX_TARGETS + 1);
  }
  const { data, error } = await query;
  if (error) throw error;
  const ids = (data || []).map(row => row.id);
  // Handlers with implicit selections use this same snapshot, so a newly
  // matching order cannot enter the batch after its reservation was checked.
  req.orderHandlingIds = ids;
  return ids.length ? targets("order", ids) : [];
}

async function invoke(context, session, resources, action, { active = false, operation = null } = {}) {
  const request = context.supabase.rpc("order_handling", {
    p_org: context.orgId, p_user: context.user.id, p_session: session,
    p_resources: resources, p_action: action, p_active: active, p_operation: operation,
  });
  const { data, error } = await (request.abortSignal ? request.abortSignal(AbortSignal.timeout(12_000)) : request);
  if (error) {
    if (error.code === "22023" || error.code === "22P02") throw problem(400, "Invalid handling request.");
    if (error.code === "P0002") throw problem(404, "Record not found.");
    throw problem(503, "Order handling is temporarily unavailable. Please try again.");
  }
  if (!data || !["handling", "view_only", "available"].includes(data.status)) throw problem(503, "Order handling is temporarily unavailable. Please try again.");
  return data;
}

function sendProblem(res, error) {
  const status = error.statusCode || 503;
  return res.status(status).json({ error: error.statusCode ? error.message : "Order handling is temporarily unavailable. Please try again.",
    ...(status === 503 ? { code: "ORDER_HANDLING_UNAVAILABLE" } : {}) });
}

export function createOrderHandling({ authenticate, logger = console, renewIntervalMs = 30_000 }) {
  async function endpoint(req, res) {
    try {
      const context = await authenticate(req);
      if (!context) return res.status(401).json({ error: "Unauthorized" });
      const { action, session_id: session, active = false } = req.body || {};
      if (!KINDS.has(req.params.kind) || !ACTIONS.has(action) || !UUID.test(String(session)) || typeof active !== "boolean") throw problem(400, "Invalid handling request.");
      const resources = targets(req.params.kind, [req.params.id]);
      const data = await invoke(context, session, resources, action, { active });
      return res.json(data);
    } catch (error) { return sendProblem(res, error); }
  }

  async function guard(req, res, next) {
    const selected = policy(req);
    if (!selected) return next();
    try {
      const context = await authenticate(req);
      if (!context) return res.status(401).json({ error: "Unauthorized" });
      const session = req.headers["x-order-handling-session"];
      if (typeof session !== "string" || !UUID.test(session)) throw problem(400, "Refresh this page before processing the order.");
      const resources = await resolveHandlingTargets(req, context.supabase, context.orgId, selected);
      if (!resources.length) return next();
      const operation = randomUUID();
      const result = await invoke(context, session, resources, "begin_write", { operation });
      if (result.success !== true) return res.status(409).json({ code: "ORDER_HANDLING_CONFLICT", holder: result.holder,
        error: `${result.holder?.name || "Another teammate"} is working on this order. You can view it for now.` });
      const controller = new AbortController();
      req.orderHandlingSignal = controller.signal;
      let renewing = false;
      const timer = setInterval(async () => {
        if (renewing) return;
        renewing = true;
        try {
          const renewal = await invoke(context, session, [], "renew_write", { operation });
          if (!renewal.success) throw new Error("Operation reservation lost");
        } catch {
          clearInterval(timer);
          controller.abort(new Error("Order handling could not be renewed"));
          logger.warn("[OrderHandling] Operation renewal failed");
        } finally { renewing = false; }
      }, renewIntervalMs);
      timer.unref?.();
      // A response acknowledges completed processing only after token cleanup.
      // This also runs when the client disconnected: close itself must never
      // release a courier request that is still running.
      const end = res.end;
      let ending = false;
      res.end = function (...args) {
        if (ending) return res;
        ending = true;
        clearInterval(timer);
        void withoutOrderHandlingOperation(() => invoke(context, session, [], "end_write", { operation }))
          .catch(() => logger.warn("[OrderHandling] Operation cleanup deferred to expiry"))
          .finally(() => end.apply(res, args));
        return res;
      };
      return withOrderHandlingOperation(controller.signal, next);
    } catch (error) { return sendProblem(res, error); }
  }
  return { endpoint, guard };
}
