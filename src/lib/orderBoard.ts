import { matchesOrderSearch } from "@/lib/orderSearch";

export const BOARD_COLORS = ["amber", "rose", "violet", "blue", "teal", "slate", "green"] as const;
export type BoardColor = (typeof BOARD_COLORS)[number];

export const BOARD_COLOR_CLASSES: Record<BoardColor, { dot: string; chip: string }> = {
  amber: { dot: "bg-amber-500", chip: "bg-amber-50 text-amber-800" },
  rose: { dot: "bg-rose-500", chip: "bg-rose-50 text-rose-700" },
  violet: { dot: "bg-violet-500", chip: "bg-violet-50 text-violet-700" },
  blue: { dot: "bg-blue-500", chip: "bg-blue-50 text-blue-700" },
  teal: { dot: "bg-teal-500", chip: "bg-teal-50 text-teal-700" },
  slate: { dot: "bg-stone-400", chip: "bg-stone-100 text-stone-600" },
  green: { dot: "bg-emerald-500", chip: "bg-emerald-50 text-emerald-700" },
};

// An order with this many items or more is a heavy parcel.
export const HEAVY_PARCEL_ITEMS = 6;

export type BoardList = { id: string; name: string; color: BoardColor; position: number };

export type BoardOrderItem = { product_name: string | null; variant_name: string | null; quantity: number };

export type BoardOrder = {
  id: string;
  order_number: string;
  customer_name: string | null;
  phone: string | null;
  address: string | null;
  status: string;
  courier_status: string | null;
  price: number | null;
  items: BoardOrderItem[];
};

export type BoardCard = {
  id: string;
  list_id: string;
  order_id: string;
  note: string;
  remind_on: string | null;
  position: number;
  updated_at: string;
  order: BoardOrder | null;
};

export type BoardData = { lists: BoardList[]; cards: BoardCard[] };

export type BoardUpdate = {
  id: string;
  card_id: string;
  staff_id: string | null;
  staff_name: string;
  kind: "added" | "moved" | "note";
  body: string;
  created_at: string;
};

// The orders the search can pick from (the Orders page already has them loaded).
export type BoardSearchOrder = {
  id: string;
  order_number: string;
  customer_name: string | null;
  phone: string | null;
  address: string | null;
  status: string;
  price: number | null;
  quantity: number | null;
  created_at: string;
  items?: Array<{ quantity: number }>;
};

export function cardsInList(cards: BoardCard[], listId: string): BoardCard[] {
  return cards.filter((card) => card.list_id === listId).sort((a, b) => a.position - b.position);
}

export function positionBetween(before?: number, after?: number): number {
  if (before === undefined && after === undefined) return 0;
  if (before === undefined) return (after as number) - 1;
  if (after === undefined) return before + 1;
  return (before + after) / 2;
}

// Position for a card dropped at `index` among the other cards of `listId`.
export function dropPosition(cards: BoardCard[], cardId: string, listId: string, index: number): number {
  const others = cardsInList(cards, listId).filter((card) => card.id !== cardId);
  return positionBetween(others[index - 1]?.position, others[index]?.position);
}

export function itemCount(items: Array<{ quantity: number }> | undefined, fallback?: number | null): number {
  if (items?.length) return items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
  return fallback ?? 0;
}

export function isHeavyParcel(items: Array<{ quantity: number }> | undefined, fallback?: number | null): boolean {
  return itemCount(items, fallback) >= HEAVY_PARCEL_ITEMS;
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export type ReminderState = "overdue" | "today" | "tomorrow" | "later";

export function reminderState(remindOn: string, today: string): ReminderState {
  if (remindOn < today) return "overdue";
  if (remindOn === today) return "today";
  if (remindOn === addDaysToDateKey(today, 1)) return "tomorrow";
  return "later";
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function reminderLabel(remindOn: string, today: string): string {
  const [, month, day] = remindOn.split("-");
  const short = `${MONTHS[Number(month) - 1]} ${Number(day)}`;
  const state = reminderState(remindOn, today);
  if (state === "overdue") return `Overdue · ${short}`;
  if (state === "today") return "Today";
  if (state === "tomorrow") return "Tomorrow";
  return short;
}

// Newest orders first when there is no query, so the merchant sees recent orders straight away.
export function searchBoardOrders<T extends BoardSearchOrder>(orders: T[], query: string, limit = 8): T[] {
  const trimmed = query.trim();
  const matches = trimmed
    ? orders.filter((order) => matchesOrderSearch({ ...order, consignment_id: null, tracking_code: null }, trimmed))
    : [...orders].sort((a, b) => b.created_at.localeCompare(a.created_at));
  return matches.slice(0, limit);
}

// Variant names are sometimes stored as JSON ({"size": "১ কেজি"}); show just the values.
export function boardVariantLabel(variantName: string | null): string | null {
  const raw = variantName?.trim();
  if (!raw) return null;
  if (!raw.startsWith("{")) return raw;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      const label = Object.values(parsed as Record<string, unknown>).filter((v) => v !== null && v !== "").map(String).join(" · ");
      return label || null;
    }
  } catch {
    // Not JSON after all; show it as written.
  }
  return raw;
}
