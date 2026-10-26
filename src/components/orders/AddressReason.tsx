import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { isOnHoldStatus, normalizeBusinessStatus } from "@/lib/orderTransitions";
import { holdDays } from "@/lib/orderHoldFilters";
import { cancellationReasonKey, cancellationReasonLabel, type CancelledOrder } from "@/lib/cancellationInsights";
import { ORDER_HOLD_REASONS } from "../../../shared/orderHold.js";

type ReasonOrder = CancelledOrder & {
  status?: string | null;
  updated_at?: string | null;
  hold_reason_code?: string | null;
  hold_reason_detail?: string | null;
  hold_until_date?: string | null;
  hold_started_at?: string | null;
};

/** Why an order is on hold or cancelled, shown at the right end of the address bar. */
export function AddressReason({ order }: { order: ReasonOrder }) {
  const onHold = isOnHoldStatus(order.status);
  const status = normalizeBusinessStatus(order.status);
  const cancelled = status === "cancelled" || status === "canceled";
  if (!onHold && !cancelled) return null;

  let text: string;
  let suffix: string | null = null;
  if (onHold) {
    const label = ORDER_HOLD_REASONS.find((option) => option.code === order.hold_reason_code)?.label ?? "No reason";
    text = order.hold_reason_detail ? `${label} — ${order.hold_reason_detail}` : label;
    suffix = order.hold_until_date ? `until ${format(parseISO(order.hold_until_date), "d MMM")}` : `${holdDays(order)}d`;
  } else {
    const label = cancellationReasonLabel(cancellationReasonKey(order));
    text = order.cancellation_reason_note ? `${label} — ${order.cancellation_reason_note}` : label;
  }

  return (
    <span
      data-testid={`order-address-reason-${order.id}`}
      title={suffix ? `${text} · ${suffix}` : text}
      className="flex max-w-[55%] shrink-0 items-center gap-[7px] self-center border-l border-emerald-200 pl-3 text-[12px] text-black/55 animate-in fade-in duration-200 motion-reduce:animate-none"
    >
      <span aria-hidden className={cn("h-1.5 w-1.5 shrink-0 rounded-full", onHold ? "bg-amber-500" : "bg-red-500")} />
      <span className={cn("shrink-0 font-semibold", onHold ? "text-amber-700" : "text-red-600")}>{onHold ? "Hold" : "Cancelled"}</span>
      <span className="min-w-0 truncate">{text}</span>
      {suffix && <span className="shrink-0 tabular-nums">· {suffix}</span>}
    </span>
  );
}
