// Rules for moving many orders to one status in a single request.
//
// This module is intentionally free of Express and Supabase. The route in
// server/index.js reads the orders, passes them here, and writes the resulting
// patches. Every rule mirrors PATCH /api/orders/:id and
// src/lib/orderTransitions.ts — keep all three in sync.

import { buildAttributionPatch, isApprovedStatus } from "./orderAttribution.js";
import { getOrderApprovalDetailsError } from "./orderApprovalDetails.js";
import { normalizeActivityGroupId, validateCancellationReason } from "./orderActivity.js";
import { validateOrderHoldDetails } from "../shared/orderHold.js";

export const MAX_BULK_STATUS_ORDERS = 500;

export const BULK_STATUS_TARGETS = Object.freeze([
  "pending",
  "confirmed",
  "approved",
  "print",
  "processing",
  "on_hold",
  "cancelled",
]);

const HOLD_FIELDS = ["hold_reason_code", "hold_reason_detail", "hold_until_date"];

function normalizeStatus(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function isOnHold(normalized) {
  return normalized === "on_hold" || normalized === "hold";
}

// Returns a reason the order cannot move to the target, or null when it can.
export function bulkStatusTransitionError(order, targetStatus) {
  const from = normalizeStatus(order?.status);
  const to = normalizeStatus(targetStatus);
  if (from === to) return "Order already has this status";

  const fromApproved = from === "approved" || from === "confirmed";
  const toApproved = to === "approved" || to === "confirmed";
  if (to === "print" && !fromApproved) return "Only Confirmed orders can move to Print";
  if (from === "print" && !(to === "processing" || toApproved || to === "cancelled" || to === "canceled" || isOnHold(to))) {
    return "Print orders can only move to Ready to Transit, Confirmed, On Hold, or Cancelled";
  }

  if (isApprovedStatus(targetStatus) && !isApprovedStatus(order?.status)) {
    const approvalError = getOrderApprovalDetailsError(order);
    if (approvalError) return approvalError.error;
  }
  return null;
}

// The fields PATCH /api/orders/:id writes for a status-only change.
export function buildBulkStatusPatch({ fromStatus, targetStatus, actorId, now, holdDetails = null, cancellationReason = null }) {
  const from = normalizeStatus(fromStatus);
  const to = normalizeStatus(targetStatus);
  const patch = { status: targetStatus };

  if (isOnHold(to) && holdDetails) {
    patch.hold_reason_code = holdDetails.reasonCode;
    patch.hold_reason_detail = holdDetails.reasonDetail ?? null;
    patch.hold_until_date = holdDetails.holdUntilDate ?? null;
  }

  if (to === "cancelled" && from !== "cancelled") {
    patch.cancellation_reason_code = cancellationReason?.code ?? null;
    patch.cancellation_reason_note = cancellationReason?.note ?? null;
  } else if (from === "cancelled" && to !== "cancelled") {
    patch.cancellation_reason_code = null;
    patch.cancellation_reason_note = null;
  }

  Object.assign(patch, buildAttributionPatch({ fromStatus, toStatus: targetStatus, actorId, actorKind: "user", now }));
  patch.updated_at = now;
  return patch;
}

// Groups movable orders by their stored status so each group can be written
// with one conditional update. Missing or blocked orders become failures.
export function planBulkStatusUpdate({ orderIds, orders, targetStatus, actorId, now, holdDetails = null, cancellationReason = null }) {
  const byId = new Map((orders || []).map((order) => [order.id, order]));
  const groupsByStatus = new Map();
  const failures = [];

  for (const orderId of orderIds) {
    const order = byId.get(orderId);
    if (!order) {
      failures.push({ orderId, orderNumber: null, reason: "Order not found" });
      continue;
    }
    const reason = bulkStatusTransitionError(order, targetStatus);
    if (reason) {
      failures.push({ orderId, orderNumber: order.order_number ?? null, reason });
      continue;
    }
    const fromStatus = order.status ?? null;
    if (!groupsByStatus.has(fromStatus)) {
      groupsByStatus.set(fromStatus, {
        fromStatus,
        ids: [],
        patch: buildBulkStatusPatch({ fromStatus, targetStatus, actorId, now, holdDetails, cancellationReason }),
      });
    }
    groupsByStatus.get(fromStatus).ids.push(orderId);
  }

  return { groups: [...groupsByStatus.values()], failures };
}

// Validates the whole request body once. Returns { value } or { error, code? }.
export function parseBulkStatusRequest(body, { currentDate } = {}) {
  const rawIds = body?.orderIds;
  if (!Array.isArray(rawIds) || rawIds.length === 0 || rawIds.some((id) => typeof id !== "string" || !id.trim())) {
    return { error: "orderIds must be a non-empty array of order IDs" };
  }
  const orderIds = [...new Set(rawIds.map((id) => id.trim()))];
  if (orderIds.length > MAX_BULK_STATUS_ORDERS) {
    return { error: `A maximum of ${MAX_BULK_STATUS_ORDERS} orders can be updated at once` };
  }

  const status = body?.status;
  if (typeof status !== "string" || !BULK_STATUS_TARGETS.includes(status)) {
    return { error: "Choose a valid status" };
  }

  let activityGroupId;
  try {
    activityGroupId = normalizeActivityGroupId(body?.activity_group_id);
  } catch (error) {
    return { error: error.message };
  }

  const to = normalizeStatus(status);
  const holdTouched = HOLD_FIELDS.some((field) => body?.[field] !== undefined);
  if (holdTouched && !isOnHold(to)) {
    return { error: "Hold details can only be changed while an order is On Hold", code: "hold_metadata_requires_hold" };
  }

  let holdDetails = null;
  if (isOnHold(to)) {
    const reasonCode = body?.hold_reason_code;
    const reasonDetail = body?.hold_reason_detail ?? "";
    const holdUntilDate = body?.hold_until_date;
    const holdError = validateOrderHoldDetails({ reasonCode, reasonDetail, holdUntilDate, ...(currentDate ? { currentDate } : {}) });
    if (holdError) return { error: holdError.error, code: holdError.code };
    holdDetails = {
      reasonCode,
      reasonDetail: reasonDetail.trim() || null,
      holdUntilDate: typeof holdUntilDate === "string" ? holdUntilDate.trim() || null : null,
    };
  }

  let cancellationReason = null;
  if (to === "cancelled") {
    try {
      cancellationReason = validateCancellationReason({ code: body?.cancellation_reason_code, note: body?.cancellation_reason_note });
    } catch (error) {
      return { error: error.message };
    }
  }

  return { value: { orderIds, status, activityGroupId, holdDetails, cancellationReason } };
}
