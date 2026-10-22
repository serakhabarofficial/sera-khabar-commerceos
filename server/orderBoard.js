// Order Board: input checks for the manual kanban tab. Routes live in index.js.

export const BOARD_COLORS = Object.freeze(["amber", "rose", "violet", "blue", "teal", "slate", "green"]);

// The lists a new board starts with. The merchant can rename, recolor or delete them.
export const DEFAULT_BOARD_LISTS = Object.freeze([
  { name: "Reschedule · পরে পাঠাবে", color: "amber" },
  { name: "VIP", color: "violet" },
  { name: "Heavy Parcels", color: "blue" },
  { name: "বিশেষ নির্দেশনা", color: "teal" },
]);

export const BOARD_LIST_NAME_MAX = 60;
export const BOARD_NOTE_MAX = 2000;
export const BOARD_UPDATE_MAX = 500;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const isBoardId = (value) => typeof value === "string" && UUID_RE.test(value);

function isRealDate(value) {
  if (!DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// Name and color for a new list (partial: only the fields that were sent).
export function parseBoardList(body, { partial = false } = {}) {
  const list = {};
  if (body?.name !== undefined || !partial) {
    if (typeof body?.name !== "string") return { error: "Give the list a name" };
    const name = body.name.replace(/\s+/g, " ").trim();
    if (!name) return { error: "Give the list a name" };
    if (name.length > BOARD_LIST_NAME_MAX) return { error: `Keep the list name under ${BOARD_LIST_NAME_MAX} characters` };
    list.name = name;
  }
  if (body?.color !== undefined) {
    if (!BOARD_COLORS.includes(body.color)) return { error: "Choose one of the list colors" };
    list.color = body.color;
  }
  if (body?.position !== undefined) {
    if (typeof body.position !== "number" || !Number.isFinite(body.position)) return { error: "Invalid position" };
    list.position = body.position;
  }
  if (partial && !Object.keys(list).length) return { error: "Nothing to save" };
  return { list };
}

// List, position, note and reminder date for a card; only the fields that were sent.
export function parseBoardCardPatch(body) {
  const patch = {};
  if (body?.list_id !== undefined) {
    if (!isBoardId(body.list_id)) return { error: "Invalid list" };
    patch.list_id = body.list_id;
  }
  if (body?.position !== undefined) {
    if (typeof body.position !== "number" || !Number.isFinite(body.position)) return { error: "Invalid position" };
    patch.position = body.position;
  }
  if (body?.note !== undefined) {
    if (typeof body.note !== "string") return { error: "Invalid note" };
    if (body.note.length > BOARD_NOTE_MAX) return { error: `Keep the note under ${BOARD_NOTE_MAX} characters` };
    patch.note = body.note;
  }
  if (body?.remind_on !== undefined) {
    if (body.remind_on !== null && (typeof body.remind_on !== "string" || !isRealDate(body.remind_on))) return { error: "Choose a valid reminder date" };
    patch.remind_on = body.remind_on;
  }
  if (!Object.keys(patch).length) return { error: "Nothing to save" };
  return { patch };
}

export function parseBoardUpdate(body) {
  if (typeof body?.body !== "string") return { error: "Write the update first" };
  const text = body.body.replace(/\s+/g, " ").trim();
  if (!text) return { error: "Write the update first" };
  if (text.length > BOARD_UPDATE_MAX) return { error: `Keep the update under ${BOARD_UPDATE_MAX} characters` };
  return { text };
}
