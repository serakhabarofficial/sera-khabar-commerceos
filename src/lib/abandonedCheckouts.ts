export type AbandonedCheckoutStatus = "open" | "contacted";

export type AbandonedCheckoutCartItem = {
  productName: string;
  variantName: string | null;
  quantity: number;
  unitPrice: number;
};

export type AbandonedCheckout = {
  id: string;
  status: AbandonedCheckoutStatus;
  customer_name: string | null;
  phone: string | null;
  address: string | null;
  cart: AbandonedCheckoutCartItem[];
  subtotal: number | null;
  delivery_rate: number | null;
  total: number | null;
  source: string;
  source_path: string;
  campaign: Record<string, string>;
  contacted_at: string | null;
  created_at: string;
  updated_at: string;
  /** Staff note; copied onto the order when the checkout is moved. */
  notes?: string | null;
  /** Set while this shopper's order is waiting in Order Protection. */
  protection_review_id?: string | null;
};

/** A dismissed checkout, kept until its expiry so staff can restore it. */
export type DismissedCheckout = Omit<AbandonedCheckout, "status"> & {
  status: "dismissed";
  resolved_at: string | null;
  /** "dismissed" by staff, or "already_ordered" when the customer had a pending order. */
  resolution: string | null;
  dismissed_by: string | null;
};

export type AbandonedCheckoutResponse = {
  checkouts: AbandonedCheckout[];
  activeCount: number;
};

export type AbandonedCheckoutConvertStatus = "pending" | "on_hold" | "approved";

export type AbandonedCheckoutConvertOverrides = {
  customer_name?: string;
  address?: string;
  hold_reason_code?: string | null;
  hold_reason_detail?: string | null;
  hold_until_date?: string | null;
};

const SOURCE_LABELS: Record<string, string> = {
  storefront: "Storefront checkout",
  sundarbans_honey: "Sundarbans Honey",
  kalojira_mixed: "Kalojira Mixed",
  honey_nut: "Honey Nut",
  am_sotto_achar: "আমসত্ত্ব আচার",
};

function normalizedPhone(phone: string | null | undefined) {
  const digits = String(phone || "").replace(/\D/g, "");
  return /^01\d{9}$/.test(digits) ? digits : null;
}

function normalizeSearchValue(value: string) {
  return value.trim().toLocaleLowerCase();
}

function formatTaka(amount: number | null) {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return "—";
  return `৳${amount.toLocaleString("en-BD", { maximumFractionDigits: 0 })}`;
}

/** "/step/katimon-mango" → "Katimon Mango": landing pages are named from their address. */
function landingPageName(sourcePath: string | null | undefined) {
  const slug = /^\/step\/([a-z0-9]+(?:-[a-z0-9]+)*)$/.exec(sourcePath || "")?.[1];
  return slug ? slug.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ") : null;
}

export function abandonedCheckoutSourceLabel(source: string, sourcePath?: string | null) {
  if (source === "landing") return landingPageName(sourcePath) || "Landing page";
  return SOURCE_LABELS[source] || "Checkout";
}

export function abandonedCheckoutCartSummary(cart: AbandonedCheckoutCartItem[]) {
  if (!cart.length) return "No cart details";
  return cart
    .map((item) => `${item.quantity} × ${item.productName}${item.variantName ? ` — ${item.variantName}` : ""}`)
    .join(", ");
}

export function matchesAbandonedCheckoutSearch(
  checkout: Pick<AbandonedCheckout, "customer_name" | "phone" | "address" | "source" | "source_path" | "cart">,
  query: string,
) {
  const normalizedQuery = normalizeSearchValue(query);
  if (!normalizedQuery) return true;

  const searchableFields = [
    checkout.customer_name,
    checkout.phone,
    checkout.address,
    abandonedCheckoutSourceLabel(checkout.source, checkout.source_path),
    checkout.source_path,
    ...checkout.cart.flatMap((item) => [item.productName, item.variantName]),
  ];

  return searchableFields.some((value) => normalizeSearchValue(value || "").includes(normalizedQuery));
}

export function abandonedCheckoutTelHref(phone: string | null | undefined) {
  const normalized = normalizedPhone(phone);
  return normalized ? `tel:${normalized}` : null;
}

export function abandonedCheckoutWhatsAppHref(phone: string | null | undefined) {
  const normalized = normalizedPhone(phone);
  return normalized ? `https://wa.me/88${normalized}` : null;
}

export function abandonedCheckoutCopySummary(checkout: AbandonedCheckout) {
  return [
    "Incomplete order",
    `Source: ${abandonedCheckoutSourceLabel(checkout.source, checkout.source_path)}`,
    `Name: ${checkout.customer_name || "Not provided"}`,
    `Phone: ${checkout.phone || "Not provided"}`,
    `Address: ${checkout.address || "Not provided"}`,
    `Cart: ${abandonedCheckoutCartSummary(checkout.cart)}`,
    `Estimated total: ${formatTaka(checkout.total)}`,
  ].join("\n");
}

export function computeAbandonedCheckoutTotals(
  cart: AbandonedCheckoutCartItem[],
  deliveryRate: number,
) {
  const round = (value: number) => Math.round(value * 100) / 100;
  const subtotal = round(cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0));
  const rate = Number.isFinite(deliveryRate) ? deliveryRate : 0;
  return { subtotal, total: round(subtotal + rate) };
}
