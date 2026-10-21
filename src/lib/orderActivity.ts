import type { OrderEditorItem } from "@/lib/orderEditor";

export const ADDITION_REASON_OPTIONS = [
  { value: "upsell", label: "Upsell" }, { value: "customer_request", label: "Customer request" },
  { value: "correction", label: "Correction" }, { value: "replacement", label: "Replacement" }, { value: "other", label: "Other" },
] as const;
export const CANCELLATION_REASON_OPTIONS = [
  { value: "customer_changed_mind", label: "গ্রাহক মত পরিবর্তন করেছেন" }, { value: "customer_unreachable", label: "গ্রাহকের সাথে যোগাযোগ করা যায়নি" },
  { value: "duplicate_order", label: "ডুপ্লিকেট অর্ডার" }, { value: "wrong_product_or_quantity", label: "ভুল পণ্য বা পরিমাণ" },
  { value: "pricing_issue", label: "মূল্যসংক্রান্ত সমস্যা" }, { value: "delivery_charge_objection", label: "ডেলিভারি চার্জ নিয়ে আপত্তি" },
  { value: "delivery_delay", label: "ডেলিভারিতে দেরি" }, { value: "out_of_stock", label: "পণ্য স্টকে নেই" },
  { value: "fraud_or_suspicious", label: "জালিয়াতি বা সন্দেহজনক অর্ডার" }, { value: "invalid_contact_information", label: "ভুল যোগাযোগের তথ্য" },
  { value: "service_area_unavailable", label: "ডেলিভারি এলাকা সেবার বাইরে" }, { value: "test_or_fake_order", label: "পরীক্ষামূলক বা ভুয়া অর্ডার" }, { value: "zone_change", label: "এলাকা পরিবর্তন" }, { value: "other", label: "অন্যান্য" },
] as const;
export type AdditionReason = (typeof ADDITION_REASON_OPTIONS)[number]["value"];
export type CancellationReason = (typeof CANCELLATION_REASON_OPTIONS)[number]["value"];
export const CANCELLATION_DIALOG_REASON_OPTIONS = CANCELLATION_REASON_OPTIONS;
export const orderItemActivityKey = (item: Pick<OrderEditorItem, "product_id" | "variant_id">) => `${item.product_id || ""}:${item.variant_id || ""}`;
export const createActivityGroupId = () => crypto.randomUUID();
export function orderViewSurface(state: unknown) {
  const value = state && typeof state === "object" ? state as { activitySurface?: unknown; fulfillmentTab?: unknown } : null;
  if (["search", "customer_history", "activity_log", "notification"].includes(String(value?.activitySurface))) return String(value?.activitySurface);
  if (value?.fulfillmentTab === "pending") return "pending_queue";
  return "direct_link";
}
