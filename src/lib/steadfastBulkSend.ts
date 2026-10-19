import { apiFetch } from "@/lib/api";
import { steadfastIssueMessage, steadfastSendIssue } from "../../shared/steadfastSend.js";

// Bulk Steadfast sends go out in small batches, one after another, so the Print
// tab can count "Sending 125/500" and a slow batch never holds up the rest.
export const STEADFAST_SEND_BATCH_SIZE = 25;
// Orders whose reply was lost are checked again after a short wait.
export const STEADFAST_CHECK_DELAY_MS = 5_000;

export type SteadfastFailureCode = "checking" | "phone" | "address" | "rejected" | "not_received" | "no_code" | "not_sent" | "other";

export interface SteadfastSendFailure<TOrder = unknown> {
  orderId: string;
  orderNumber: string | null;
  reason: string;
  code: SteadfastFailureCode;
  order?: TOrder;
}

export interface SteadfastSendSuccess<TOrder = unknown> {
  orderId: string;
  orderNumber: string | null;
  order?: TOrder;
}

export interface SteadfastSendReply<TOrder = unknown> {
  succeeded: SteadfastSendSuccess<TOrder>[];
  failures: SteadfastSendFailure<TOrder>[];
}

const CODES = new Set<SteadfastFailureCode>(["checking", "phone", "address", "rejected", "not_received", "no_code", "not_sent", "other"]);
const CHECKING_REASON = steadfastIssueMessage("checking");
const STOPPED_REASON = "Not sent: The send stopped before this order. Safe to send again.";

async function postOrders<TOrder>(url: string, orderIds: string[]): Promise<SteadfastSendReply<TOrder>> {
  const response = await apiFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderIds }),
  });
  const data = await response.json().catch(() => ({})) as Partial<SteadfastSendReply<TOrder>> & { error?: string };
  if (!response.ok) throw new Error(data.error || "Steadfast request failed");
  return {
    succeeded: Array.isArray(data.succeeded) ? data.succeeded : [],
    failures: (Array.isArray(data.failures) ? data.failures : []).map((failure) => ({
      ...failure,
      code: CODES.has(failure.code) ? failure.code : "other",
    })),
  };
}

export const sendSteadfastBatch = <TOrder>(orderIds: string[]) => postOrders<TOrder>("/api/send-to-courier/bulk", orderIds);
const CHECK_LIMIT = 500;

export async function checkSteadfastOrders<TOrder>(orderIds: string[]): Promise<SteadfastSendReply<TOrder>> {
  const merged: SteadfastSendReply<TOrder> = { succeeded: [], failures: [] };
  for (let start = 0; start < orderIds.length; start += CHECK_LIMIT) {
    const reply = await postOrders<TOrder>("/api/send-to-courier/bulk/check", orderIds.slice(start, start + CHECK_LIMIT));
    merged.succeeded.push(...reply.succeeded);
    merged.failures.push(...reply.failures);
  }
  return merged;
}

export interface SteadfastBatchUpdate<TOrder> {
  done: number;
  reply: SteadfastSendReply<TOrder>;
}

/**
 * Sends orders in batches, one after another, and reports each batch. If a
 * batch request fails, that batch may have reached Steadfast, so it is
 * "checking"; the batches after it were never sent.
 */
export async function runSteadfastSend<TOrder>(
  orderIds: string[],
  {
    onBatch,
    send = sendSteadfastBatch,
    batchSize = STEADFAST_SEND_BATCH_SIZE,
  }: {
    onBatch: (update: SteadfastBatchUpdate<TOrder>) => void;
    send?: (orderIds: string[]) => Promise<SteadfastSendReply<TOrder>>;
    batchSize?: number;
  },
): Promise<{ stoppedReason: string | null }> {
  let done = 0;
  for (let start = 0; start < orderIds.length; start += batchSize) {
    const batch = orderIds.slice(start, start + batchSize);
    let reply: SteadfastSendReply<TOrder>;
    try {
      reply = await send(batch);
    } catch (error) {
      const rest = orderIds.slice(start + batchSize);
      onBatch({
        done: orderIds.length,
        reply: {
          succeeded: [],
          failures: [
            ...batch.map((orderId) => ({ orderId, orderNumber: null, code: "checking" as const, reason: CHECKING_REASON })),
            ...rest.map((orderId) => ({ orderId, orderNumber: null, code: "not_sent" as const, reason: STOPPED_REASON })),
          ],
        },
      });
      return { stoppedReason: error instanceof Error ? error.message : "Steadfast request failed" };
    }
    // An order the server didn't answer for is checked like a lost reply.
    const answered = new Set([...reply.succeeded, ...reply.failures].map((row) => row.orderId));
    const unanswered = batch
      .filter((orderId) => !answered.has(orderId))
      .map((orderId) => ({ orderId, orderNumber: null, code: "checking" as const, reason: CHECKING_REASON }));
    done += batch.length;
    onBatch({ done, reply: { succeeded: reply.succeeded, failures: [...reply.failures, ...unanswered] } });
  }
  return { stoppedReason: null };
}

// ─── Run state ───────────────────────────────────────────────────────────────

// One run covers the first send and any "Send again", so "{sent} of {total}"
// keeps counting; `progress` is the pass that is going out right now.
export interface SteadfastRun {
  phase: "sending" | "done";
  total: number;
  progress: { done: number; total: number };
  sentIds: string[];
  failures: Record<string, { code: SteadfastFailureCode; reason: string }>;
  fixedIds: string[];
  checking: boolean;
  stoppedReason: string | null;
}

export function startSteadfastRun(total: number): SteadfastRun {
  return { phase: "sending", total, progress: { done: 0, total }, sentIds: [], failures: {}, fixedIds: [], checking: false, stoppedReason: null };
}

export function resendSteadfastRun(run: SteadfastRun, count: number): SteadfastRun {
  return { ...run, phase: "sending", progress: { done: 0, total: count }, stoppedReason: null };
}

/** Folds a send or check reply into the run. A later answer replaces an earlier one. */
export function applySteadfastReply(run: SteadfastRun, reply: SteadfastSendReply<unknown>): SteadfastRun {
  const failures = { ...run.failures };
  const sentIds = new Set(run.sentIds);
  for (const row of reply.succeeded) {
    delete failures[row.orderId];
    sentIds.add(row.orderId);
  }
  for (const row of reply.failures) {
    failures[row.orderId] = { code: row.code, reason: row.reason };
  }
  const answered = new Set(reply.failures.map((row) => row.orderId));
  return { ...run, sentIds: [...sentIds], failures, fixedIds: run.fixedIds.filter((id) => !answered.has(id)) };
}

export type SteadfastIssueGroup = "phone" | "address" | "rejected" | "not_sent" | "checking" | "no_code";

export const STEADFAST_ISSUE_GROUPS: { id: SteadfastIssueGroup; label: string }[] = [
  { id: "phone", label: "Wrong phone" },
  { id: "address", label: "No address" },
  { id: "rejected", label: "Steadfast said no" },
  { id: "not_sent", label: "Not sent" },
  { id: "no_code", label: "No tracking code" },
  { id: "checking", label: "Checking" },
];

export function steadfastIssueGroup(code: SteadfastFailureCode): SteadfastIssueGroup {
  if (code === "not_received" || code === "not_sent" || code === "other") return "not_sent";
  return code;
}

export function countSteadfastIssues(run: SteadfastRun) {
  const counts: Record<SteadfastIssueGroup, number> = { phone: 0, address: 0, rejected: 0, not_sent: 0, no_code: 0, checking: 0 };
  for (const failure of Object.values(run.failures)) counts[steadfastIssueGroup(failure.code)] += 1;
  return counts;
}

/** Orders worth sending again: everything except ones that may already be at Steadfast. */
export function steadfastRetryIds(run: SteadfastRun) {
  return Object.entries(run.failures)
    .filter(([, failure]) => failure.code !== "checking" && failure.code !== "no_code")
    .map(([orderId]) => orderId);
}

export function steadfastCheckingIds(run: SteadfastRun) {
  return Object.entries(run.failures).filter(([, failure]) => failure.code === "checking").map(([orderId]) => orderId);
}

export function steadfastGroupIds(run: SteadfastRun, group: SteadfastIssueGroup) {
  return new Set(Object.entries(run.failures).filter(([, failure]) => steadfastIssueGroup(failure.code) === group).map(([orderId]) => orderId));
}

type RowOrder = { id: string; sent_to_courier?: boolean | null; courier_message?: string | null };

/**
 * The reason a row shows: this run's answer first, else the one saved on the
 * order, so reasons survive a refresh. Sent orders only show "No tracking code".
 */
export function steadfastRowFailure(order: RowOrder, run: SteadfastRun | null): { code: SteadfastFailureCode; reason: string } | null {
  const saved = steadfastSendIssue(order);
  const savedFailure = saved && order.courier_message ? { code: saved.kind as SteadfastFailureCode, reason: order.courier_message } : null;
  if (order.sent_to_courier) return savedFailure?.code === "no_code" ? savedFailure : null;
  return run?.failures[order.id] ?? savedFailure;
}

/** The title and help line for a failure. Unsaved reasons ("Order not found") read as "Not sent". */
export function describeSteadfastFailure(failure: { code: SteadfastFailureCode; reason: string }) {
  const issue = steadfastSendIssue({ courier_message: failure.reason, sent_to_courier: failure.code === "no_code" });
  if (issue) return { kind: issue.kind as SteadfastFailureCode, title: issue.title, detail: issue.detail };
  return { kind: failure.code, title: "Not sent", detail: failure.reason.replace(/^Not sent:\s*/, "") || "Safe to send again." };
}
