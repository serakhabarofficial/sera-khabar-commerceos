import { addressMatchesSearch } from "@/lib/bdDistricts";
import { isMixedOrder, orderProductNames, type OrderProductRecord } from "@/lib/orderProducts";

export interface OrderSearchRecord extends OrderProductRecord {
  order_number: string | null | undefined;
  customer_name: string | null | undefined;
  phone: string | null | undefined;
  consignment_id?: string | number | null | undefined;
  tracking_code?: string | null | undefined;
  address?: string | null | undefined;
}

// Typing one of these finds every order with more than one product.
const MIXED_KEYWORDS = new Set(["mix", "mixed", "মিক্স", "মিক্সড"]);

// Order numbers are shown as "#ML-152172" but stored as "ML-152172", so a
// leading "#" is ignored on both the query and the stored number.
const stripLeadingHash = (value: string) => value.replace(/^#+/, "");

export function matchesOrderSearch(order: OrderSearchRecord, query: string): boolean {
  const normalizedQuery = stripLeadingHash(query.trim().toLowerCase()).trim();
  if (!normalizedQuery) return true;
  if (MIXED_KEYWORDS.has(normalizedQuery)) return isMixedOrder(order);

  const matchesField = [
    stripLeadingHash(String(order.order_number ?? "")),
    order.customer_name,
    order.phone,
    order.consignment_id,
    order.tracking_code,
  ].some((value) => String(value ?? "").toLowerCase().includes(normalizedQuery));
  return matchesField
    || orderProductNames(order).some((name) => name.toLowerCase().includes(normalizedQuery))
    || addressMatchesSearch(order.address, query);
}

/** Search results list single-product orders before mixed ones; otherwise keeps their order. */
export function singleProductOrdersFirst<T extends OrderProductRecord>(orders: T[]): T[] {
  return [...orders].sort((a, b) => Number(isMixedOrder(a)) - Number(isMixedOrder(b)));
}
