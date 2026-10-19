// Steadfast bulk send rules. Pure apart from lookupSteadfastInvoice, which takes
// its fetch; the routes in index.js do the database work.
//
// An order can reach Steadfast even when we never read the reply (a timeout or
// a 5xx). Those orders keep the "Checking with Steadfast" note and are looked
// up by invoice before any resend, so an order is never sent twice.
import { steadfastSendIssue } from "../shared/steadfastSend.js";

export const STEADFAST_API_BASE = "https://portal.packzy.com/api/v1";
export const STEADFAST_SEND_TIMEOUT_MS = 30_000;
export const STEADFAST_LOOKUP_TIMEOUT_MS = 10_000;
export const STEADFAST_LOOKUP_CONCURRENCY = 5;

/**
 * What Steadfast's status_by_invoice reply says about an invoice.
 * @returns {"found" | "missing" | "unknown"}
 */
export function interpretInvoiceLookup(httpStatus, body) {
  if (httpStatus === 404 || Number(body?.status) === 404) return "missing";
  const ok = httpStatus >= 200 && httpStatus < 300;
  const deliveryStatus = typeof body?.delivery_status === "string" ? body.delivery_status.trim() : "";
  if (ok && Number(body?.status) === 200 && deliveryStatus) return "found";
  return "unknown";
}

/** @returns {Promise<"found" | "missing" | "unknown">} */
export async function lookupSteadfastInvoice({ apiKey, secretKey, invoice, fetchImpl = fetch }) {
  try {
    const response = await fetchImpl(`${STEADFAST_API_BASE}/status_by_invoice/${encodeURIComponent(invoice)}`, {
      headers: { "Api-Key": apiKey, "Secret-Key": secretKey, "Content-Type": "application/json" },
      signal: AbortSignal.timeout(STEADFAST_LOOKUP_TIMEOUT_MS),
    });
    const body = await response.json().catch(() => null);
    return interpretInvoiceLookup(response.status, body);
  } catch {
    return "unknown";
  }
}

function providerMessage(value) {
  if (typeof value?.message === "string" && value.message.trim()) return value.message;
  const errors = value?.errors;
  if (errors && typeof errors === "object") {
    const text = Object.values(errors).flat().filter((item) => typeof item === "string").join(" ");
    if (text.trim()) return text;
  }
  return null;
}

/**
 * Read Steadfast's bulk-order reply into one outcome per invoice.
 * `reply` is `{ httpStatus, body }`, or `{ failed: true }` when no reply was read.
 * A 4xx with no rows means nothing was created. Anything else we can't read may
 * have created the orders, so they stay "checking".
 * @param {string[]} invoices
 * @returns {Map<string, { outcome: "sent", consignmentId: string, trackingCode: string } | { outcome: "rejected", detail: string | null } | { outcome: "checking" }>}
 */
export function readBulkOrderReply(invoices, reply) {
  const outcomes = new Map();
  const body = reply && !reply.failed ? reply.body : null;
  const rows = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : null;

  if (!rows) {
    const saidNo = Boolean(reply && !reply.failed && reply.httpStatus >= 400 && reply.httpStatus < 500);
    const detail = saidNo ? providerMessage(body) : null;
    for (const invoice of invoices) outcomes.set(invoice, saidNo ? { outcome: "rejected", detail } : { outcome: "checking" });
    return outcomes;
  }

  const byInvoice = new Map();
  for (const row of rows) {
    if (row && typeof row === "object" && row.invoice != null) byInvoice.set(String(row.invoice), row);
  }
  for (const invoice of invoices) {
    const row = byInvoice.get(invoice);
    if (row?.status === "success" && row.consignment_id != null && String(row.consignment_id).trim() && row.tracking_code) {
      outcomes.set(invoice, { outcome: "sent", consignmentId: String(row.consignment_id), trackingCode: String(row.tracking_code) });
    } else if (row?.status === "error") {
      outcomes.set(invoice, { outcome: "rejected", detail: providerMessage(row) });
    } else {
      outcomes.set(invoice, { outcome: "checking" });
    }
  }
  return outcomes;
}

/**
 * What the check route reports for an order the browser is waiting on.
 * @returns {{ action: "sent" } | { action: "lookup" } | { action: "report", code: string, reason: string }}
 */
export function planSteadfastCheck(order) {
  const issue = steadfastSendIssue(order);
  if (order.sent_to_courier === true) {
    if (issue?.kind === "no_code") return { action: "report", code: "no_code", reason: order.courier_message };
    return { action: "sent" };
  }
  if (issue?.kind === "checking") return { action: "lookup" };
  if (issue) return { action: "report", code: issue.kind, reason: order.courier_message };
  return { action: "report", code: "not_sent", reason: "Not sent: Safe to send again." };
}

/** Group order ids by the courier_message they should get, so each group is one update. */
export function groupIdsByMessage(entries) {
  const groups = new Map();
  for (const { orderId, message } of entries) {
    if (!groups.has(message)) groups.set(message, []);
    groups.get(message).push(orderId);
  }
  return groups;
}
