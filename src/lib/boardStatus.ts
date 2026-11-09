// VIP and Pre-Order are picked like statuses in the order editor, but they are
// Board lists: the order stays Confirmed (so reports and Print rules count it as
// confirmed) and sits on the Board list with the matching name.

export const BOARD_STATUSES = ["vip", "pre_order"] as const;
export type BoardStatus = (typeof BOARD_STATUSES)[number];

export const BOARD_STATUS_LABELS: Record<BoardStatus, string> = {
  vip: "VIP",
  pre_order: "Pre-Order",
};

export function isBoardStatus(value: string | null | undefined): value is BoardStatus {
  return value === "vip" || value === "pre_order";
}

// "Pre-Order", "pre order" and "PreOrder" all name the same list.
const listKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "");
const STATUS_KEYS: Record<BoardStatus, string> = { vip: "vip", pre_order: "preorder" };

type NamedList = { id: string; name: string };
type PlacedCard = { id: string; list_id: string; order_id: string };

/** The Board list a board status puts orders in, matched by name. */
export function boardStatusList<L extends NamedList>(lists: L[], status: BoardStatus): L | null {
  return lists.find((list) => listKey(list.name) === STATUS_KEYS[status]) ?? null;
}

/** The board status of a Board list, or null for any other list (e.g. বিশেষ নির্দেশনা). */
export function boardStatusOfList(list: NamedList | null | undefined): BoardStatus | null {
  if (!list) return null;
  return BOARD_STATUSES.find((status) => STATUS_KEYS[status] === listKey(list.name)) ?? null;
}

/** The order's card on the Board, and its board status when that card is in the VIP or Pre-Order list. */
export function boardPlacementOf<C extends PlacedCard>(board: { lists?: NamedList[]; cards?: C[] } | undefined, orderId: string | undefined) {
  const card = orderId ? board?.cards?.find((entry) => entry.order_id === orderId) ?? null : null;
  const list = card ? board?.lists?.find((entry) => entry.id === card.list_id) ?? null : null;
  return { card, list, status: boardStatusOfList(list) };
}
