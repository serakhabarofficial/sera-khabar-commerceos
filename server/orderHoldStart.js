// When each held order went on hold, so the Hold tab can sort holds by age.
// The moment comes from order_status_events (the latest move into a hold
// status); an order with no recorded event falls back to its updated_at.

const HOLD_STATUSES = ["on_hold", "hold"];
const ID_BATCH_SIZE = 100;

const isHeld = (status) => HOLD_STATUSES.includes(String(status || "").trim().toLowerCase());

/** Latest hold start per order id from status events (newest wins). */
export function latestHoldStartByOrder(events) {
  const starts = new Map();
  for (const event of events || []) {
    if (!event?.order_id || !isHeld(event.to_status)) continue;
    const time = Date.parse(event.created_at);
    if (Number.isNaN(time)) continue;
    const current = starts.get(event.order_id);
    if (!current || time > Date.parse(current)) starts.set(event.order_id, new Date(time).toISOString());
  }
  return starts;
}

/** Returns the orders with hold_started_at set on the held ones. */
export async function attachHoldStartedAt(supabase, orgId, orders) {
  const heldIds = orders.filter((order) => isHeld(order.status)).map((order) => order.id).filter(Boolean);
  if (heldIds.length === 0) return orders;

  const events = [];
  for (let i = 0; i < heldIds.length; i += ID_BATCH_SIZE) {
    const { data, error } = await supabase
      .from("order_status_events")
      .select("order_id, to_status, created_at")
      .eq("org_id", orgId)
      .eq("order_table", "orders")
      .in("order_id", heldIds.slice(i, i + ID_BATCH_SIZE))
      .in("to_status", HOLD_STATUSES);
    if (error) throw error;
    events.push(...(data || []));
  }

  const starts = latestHoldStartByOrder(events);
  return orders.map((order) => (isHeld(order.status)
    ? { ...order, hold_started_at: starts.get(order.id) || order.updated_at || null }
    : order));
}
