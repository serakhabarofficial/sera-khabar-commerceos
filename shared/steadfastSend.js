// Why a Steadfast send did not finish, saved on the order as courier_message
// ("Wrong phone: …") so the Print tab can show it after a refresh. Shared by the
// bulk send route and the orders table.

/** @typedef {"checking" | "phone" | "address" | "rejected" | "not_received" | "no_code"} SteadfastIssueKind */

/** @type {Record<SteadfastIssueKind, string>} */
export const STEADFAST_ISSUE_TITLES = {
  checking: "Checking with Steadfast",
  phone: "Wrong phone",
  address: "No address",
  rejected: "Steadfast said no",
  not_received: "Steadfast didn't get it",
  no_code: "At Steadfast, no tracking code",
};

/** @type {Record<SteadfastIssueKind, string>} */
const DEFAULT_DETAILS = {
  checking: "Not confirmed yet. It is checked before any resend, so it is never sent twice.",
  phone: "Steadfast needs 11 digits that start with 01.",
  address: "Add the full delivery address.",
  rejected: "Steadfast gave no reason. Check the phone, address and amount.",
  not_received: "Safe to send again.",
  no_code: "Find this order's invoice in the Steadfast portal.",
};

const KINDS = /** @type {SteadfastIssueKind[]} */ (Object.keys(STEADFAST_ISSUE_TITLES));

/**
 * @param {SteadfastIssueKind} kind
 * @param {string | null | undefined} [detail]
 */
export function steadfastIssueMessage(kind, detail) {
  const text = typeof detail === "string" ? detail.replace(/\s+/g, " ").trim() : "";
  return `${STEADFAST_ISSUE_TITLES[kind]}: ${text || DEFAULT_DETAILS[kind]}`.slice(0, 500);
}

export function steadfastInvoice(order) {
  return `ORD-${String(order.order_number || String(order.id).slice(-8)).replace(/[^a-zA-Z0-9_-]/g, "").toUpperCase()}`;
}

/**
 * The saved send problem on an order, or null. Only "no_code" belongs to a
 * sent order; every other kind belongs to one that is still waiting to go.
 * @param {{ courier_message?: string | null, sent_to_courier?: boolean | null } | null | undefined} order
 * @returns {{ kind: SteadfastIssueKind, title: string, detail: string } | null}
 */
export function steadfastSendIssue(order) {
  const message = typeof order?.courier_message === "string" ? order.courier_message.trim() : "";
  if (!message) return null;
  for (const kind of KINDS) {
    const title = STEADFAST_ISSUE_TITLES[kind];
    if (message !== title && !message.startsWith(`${title}:`)) continue;
    if ((kind === "no_code") !== (order?.sent_to_courier === true)) return null;
    return { kind, title, detail: message.slice(title.length + 1).trim() || DEFAULT_DETAILS[kind] };
  }
  return null;
}

/** Orders whose last send may have reached Steadfast must be looked up before any resend. */
export function needsSteadfastLookup(order) {
  const kind = steadfastSendIssue(order)?.kind;
  return kind === "checking" || kind === "not_received";
}
