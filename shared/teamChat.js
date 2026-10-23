// Team Inbox rules, shared by the server and the inbox page. Pure.
//
// Messages that mention an order number (SK-1042, #SK1042) show that order as
// a card. The database keeps at most ten order numbers per message and
// accepts channel names in the shape normalizeChannelName returns
// (supabase/migrations/20261023184948_team_chat.sql).

export const TEAM_CHAT_MESSAGE_MAX = 4000;
export const TEAM_CHAT_ORDERS_PER_MESSAGE = 10;
export const TEAM_CHAT_REACTIONS = Object.freeze(["👍", "❤️", "😂", "🎉", "👀", "🙏"]);

const ORDER_MENTION_RE = /(?<![\w-])#?SK-?(\d{3,8})(?![\w-])/gi;

/** The text split into plain runs and order mentions, in order. */
export function splitOrderMentions(text) {
  const value = String(text ?? "");
  const parts = [];
  let at = 0;
  for (const match of value.matchAll(ORDER_MENTION_RE)) {
    if (match.index > at) parts.push({ type: "text", value: value.slice(at, match.index) });
    parts.push({ type: "order", value: `SK-${match[1]}`, raw: match[0] });
    at = match.index + match[0].length;
  }
  if (at < value.length) parts.push({ type: "text", value: value.slice(at) });
  return parts;
}

/** The distinct order numbers a message mentions, as stored on orders ("SK-1042"). */
export function extractOrderNumbers(text) {
  const numbers = splitOrderMentions(text).filter((part) => part.type === "order").map((part) => part.value);
  return [...new Set(numbers)].slice(0, TEAM_CHAT_ORDERS_PER_MESSAGE);
}

/** "Eid Stock!" → "eid-stock". Null when nothing usable is left. */
export function normalizeChannelName(input) {
  const name = String(input ?? "").toLowerCase().trim().replace(/^#+/, "")
    .replace(/[\s_]+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-{2,}/g, "-")
    .replace(/^-+/, "").slice(0, 40).replace(/-+$/, "");
  return name || null;
}

/** One key per pair of people, whichever of them starts the DM. */
export function teamChatDmKey(a, b) {
  return [String(a), String(b)].sort().join(":");
}
