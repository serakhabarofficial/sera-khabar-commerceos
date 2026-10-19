import { apiFetch } from "@/lib/api";
import { createActivityGroupId } from "@/lib/orderActivity";
import type { OrderHoldMetadata } from "@/components/orders/OrderHoldFields";

// Matches MAX_BULK_STATUS_ORDERS in server/orderBulkStatus.js.
export const BULK_STATUS_CHUNK_SIZE = 500;

export type BulkStatusFailure = {
  orderId: string;
  orderNumber: string | null;
  reason: string;
};

export type BulkStatusChangeResult<TOrder> = {
  updated: TOrder[];
  failedIds: Set<string>;
  // A whole-request error, or the one reason every failed order shares.
  error: string | null;
};

function isFailure(value: unknown): value is BulkStatusFailure {
  return Boolean(value) && typeof (value as BulkStatusFailure).orderId === "string";
}

// Moves the given orders to one status with POST /api/orders/bulk-status,
// one request per 500 orders, all sharing one activity group.
export async function requestBulkStatusChange<TOrder>(
  orderIds: string[],
  status: string,
  holdDetails?: OrderHoldMetadata,
): Promise<BulkStatusChangeResult<TOrder>> {
  const activityGroupId = createActivityGroupId();
  const updated: TOrder[] = [];
  const failedIds = new Set<string>();
  const failureReasons = new Set<string>();
  let requestError: string | null = null;

  for (let start = 0; start < orderIds.length; start += BULK_STATUS_CHUNK_SIZE) {
    const chunk = orderIds.slice(start, start + BULK_STATUS_CHUNK_SIZE);
    try {
      const response = await apiFetch("/api/orders/bulk-status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderIds: chunk, status, activity_group_id: activityGroupId, ...(holdDetails || {}) }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        chunk.forEach((id) => failedIds.add(id));
        requestError ??= typeof data?.error === "string" ? data.error : "Failed to update status";
        continue;
      }
      if (Array.isArray(data?.updated)) updated.push(...(data.updated as TOrder[]));
      for (const failure of Array.isArray(data?.failures) ? data.failures : []) {
        if (!isFailure(failure)) continue;
        failedIds.add(failure.orderId);
        if (failure.reason) failureReasons.add(failure.reason);
      }
    } catch (error) {
      chunk.forEach((id) => failedIds.add(id));
      requestError ??= error instanceof Error && error.message ? error.message : "Failed to update status";
    }
  }

  const sharedReason = failureReasons.size === 1 ? [...failureReasons][0] : null;
  return { updated, failedIds, error: requestError ?? sharedReason };
}
