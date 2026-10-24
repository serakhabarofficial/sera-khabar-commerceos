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

// Photos, documents and voice messages. The team-attachments bucket accepts
// the same types and size (supabase/migrations/20261024120000_team_chat_attachments.sql).
export const TEAM_CHAT_ATTACHMENTS_PER_MESSAGE = 10;
export const TEAM_CHAT_ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;
export const TEAM_CHAT_ATTACHMENT_NAME_MAX = 200;
export const TEAM_CHAT_VOICE_MAX_MS = 5 * 60_000;

// Each allowed type, its kind, and the extension its stored copy gets.
// No HTML or SVG: a browser would run them.
export const TEAM_CHAT_ATTACHMENT_TYPES = Object.freeze({
  "image/jpeg": ["image", "jpg"],
  "image/png": ["image", "png"],
  "image/webp": ["image", "webp"],
  "image/gif": ["image", "gif"],
  "application/pdf": ["file", "pdf"],
  "application/msword": ["file", "doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ["file", "docx"],
  "application/vnd.ms-excel": ["file", "xls"],
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ["file", "xlsx"],
  "text/csv": ["file", "csv"],
  "text/plain": ["file", "txt"],
  "audio/webm": ["voice", "webm"],
  "audio/mp4": ["voice", "m4a"],
  "audio/ogg": ["voice", "ogg"],
  "audio/mpeg": ["voice", "mp3"],
});

/** "audio/webm;codecs=opus" → "audio/webm". */
export function teamChatBaseMime(type) {
  return String(type ?? "").split(";")[0].trim().toLowerCase();
}

/** "image", "file" or "voice" for an allowed type, else null. */
export function teamChatAttachmentKind(type) {
  return TEAM_CHAT_ATTACHMENT_TYPES[teamChatBaseMime(type)]?.[0] ?? null;
}

/** The extension the stored copy of this type gets. */
export function teamChatAttachmentExtension(type) {
  return TEAM_CHAT_ATTACHMENT_TYPES[teamChatBaseMime(type)]?.[1] ?? null;
}

/** The file's own name without folders or control characters, or a plain one for its kind. */
export function cleanAttachmentName(name, kind) {
  const base = String(name ?? "").split(/[\\/]/).pop().replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
  return base.slice(0, TEAM_CHAT_ATTACHMENT_NAME_MAX) || (kind === "image" ? "Photo" : kind === "voice" ? "Voice message" : "File");
}
