import type { NotchToastType } from "notch-toast";
import { deliveryTier } from "@/lib/fraudRisk";

type FraudTotals = { total_parcels?: number; total_delivered?: number } | null | undefined;

/** The notch toast shown when a manual fraud check finishes: the order and its delivery rate. */
export function fraudCheckToast(orderNumber: string | number | null | undefined, fraudData: FraudTotals): { type: NotchToastType; title: string } {
  const label = String(orderNumber ?? "").replace(/^#+/, "");
  const parcels = fraudData?.total_parcels ?? 0;
  const rate = parcels > 0 ? ((fraudData?.total_delivered ?? 0) / parcels) * 100 : null;
  const tier = deliveryTier(rate);
  if (rate === null) return { type: "info", title: `${label} · New customer, no past parcels` };
  const percent = `${label} · ${Math.round(rate)}% delivered`;
  if (tier === "poor") return { type: "warning", title: `${percent} · high risk` };
  if (tier === "caution") return { type: "warning", title: percent };
  return { type: "success", title: percent };
}
