import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CalendarBlank, CaretDown, MagnifyingGlass, Plus, X, ArrowUpRight } from "@phosphor-icons/react";
import { Badge } from "@/components/reui/badge";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/reui/frame";
import { useOrderBoard } from "@/hooks/useOrderBoard";
import { useIsMobile } from "@/hooks/use-mobile";
import { pickerPrimaryButtonClassName } from "@/components/base/date-picker/shared";
import { cn } from "@/lib/utils";
import { toast } from "@/components/ui/sonner";
import { matchesOrderSearch } from "@/lib/orderSearch";
import { displayStatusLabel } from "@/lib/orderTransitions";
import {
  BOARD_COLORS,
  BOARD_COLOR_CLASSES,
  cardsInList,
  dropPosition,
  itemCount,
  reminderLabel,
  reminderState,
  searchBoardOrders,
  type BoardCard,
  type BoardColor,
  type BoardList,
  type BoardSearchOrder,
} from "@/lib/orderBoard";
import { getBangladeshDateKey } from "../../../../shared/orderHold.js";
import { BoardCardDialog } from "./BoardCardDialog";
import { BoardCardDetail } from "./BoardCardDetail";

const LIST_SUGGESTIONS = ["ফোন ধরছে না", "কাস্টমার নিচ্ছে না", "ঠিকানা ভুল", "অগ্রিম পেমেন্ট"];
const NO_LISTS: BoardList[] = [];
// Dropdowns open with a quick ease-out and close a little faster than they open.
const MENU_EASE = [0.23, 1, 0.32, 1] as const;
const MENU_IN = { duration: 0.18, ease: MENU_EASE };
const MENU_OUT = { duration: 0.12, ease: MENU_EASE };
// The list's Add order panel grows open and folds shut, so the list resizes smoothly.
const PANEL_IN = { duration: 0.24, ease: MENU_EASE };
const PANEL_OUT = { duration: 0.18, ease: MENU_EASE };
// The selected list's highlight slides between rail rows; the detail pane cross-fades.
const RAIL_SLIDE = { duration: 0.22, ease: MENU_EASE };
const DETAIL_IN = { duration: 0.18, ease: MENU_EASE };
const NO_CARDS: BoardCard[] = [];

function fmtTaka(n: number | null) {
  return "৳" + Number(n || 0).toLocaleString("en-BD", { maximumFractionDigits: 0 });
}

function OrderResult({
  order,
  inList,
  action,
  onOpen,
}: {
  order: BoardSearchOrder;
  inList: BoardList | undefined;
  action: ReactNode;
  onOpen: () => void;
}) {
  const count = itemCount(order.items, order.quantity);
  return (
    <div className="flex items-center justify-between gap-3 rounded-[calc(var(--frame-panel-radius,0.5rem)-2px)] px-2.5 py-2 transition-colors duration-100 hover:bg-muted/50">
      <div className="grid min-w-0 gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-[11px] text-muted-foreground">#{order.order_number}</span>
          <span className="text-sm font-medium">{order.customer_name || "Unnamed customer"}</span>
          <Badge variant="outline" size="sm">{displayStatusLabel(order.status)}</Badge>
        </div>
        <span className="truncate text-xs text-muted-foreground">
          {[order.phone, order.address, `${count} ${count === 1 ? "item" : "items"}`, fmtTaka(order.price)].filter(Boolean).join(" · ")}
        </span>
      </div>
      {inList ? (
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-border bg-card px-2 text-xs text-muted-foreground shadow-xs transition-colors duration-100 hover:text-foreground"
        >
          <span className={cn("size-2 rounded-full", BOARD_COLOR_CLASSES[inList.color].dot)} />
          <span className="max-w-[120px] truncate">{inList.name}</span>
          <ArrowUpRight weight="light" className="size-3" />
        </button>
      ) : action}
    </div>
  );
}

function AddToListMenu({
  lists,
  counts,
  orderNumber,
  onPick,
}: {
  lists: BoardList[];
  counts: Map<string, number>;
  orderNumber: string;
  onPick: (listId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const reduceMotion = useReducedMotion();
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label={`Add order ${orderNumber} to a list`}
          className="group inline-flex h-7 shrink-0 items-center gap-1 rounded-md bg-primary pl-2 pr-1.5 text-xs font-medium text-primary-foreground shadow-xs transition-[transform,background-color] duration-150 ease-out hover:bg-primary/90 active:scale-[0.97] data-[state=open]:bg-primary/85"
        >
          <Plus weight="light" className="size-3.5" />
          Add
          <CaretDown weight="light" className="size-3 opacity-70 transition-transform duration-200 ease-out group-data-[state=open]:rotate-180" />
        </button>
      </PopoverPrimitive.Trigger>
      <AnimatePresence>
        {open && (
          <PopoverPrimitive.Portal forceMount>
            <PopoverPrimitive.Content forceMount asChild align="end" side="bottom" sideOffset={6} collisionPadding={12} data-board-add-menu="">
              <motion.div
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0, transition: MENU_IN }}
                exit={reduceMotion ? { opacity: 0, transition: MENU_OUT } : { opacity: 0, scale: 0.96, y: -4, transition: MENU_OUT }}
                style={{ transformOrigin: "var(--radix-popover-content-transform-origin)" }}
                className="z-[60] w-64 rounded-xl bg-card shadow-lg outline-none"
              >
                <Frame spacing="xs">
                  <FrameHeader className="flex flex-row items-center justify-between">
                    <FrameTitle className="text-xs">Add to list</FrameTitle>
                    <span className="font-mono text-[11px] text-muted-foreground">#{orderNumber}</span>
                  </FrameHeader>
                  <FramePanel className="p-1">
                    {lists.map((list) => (
                      <button
                        key={list.id}
                        type="button"
                        onClick={() => { setOpen(false); onPick(list.id); }}
                        className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm outline-none transition-colors duration-100 hover:bg-muted/60 focus-visible:bg-muted/60"
                      >
                        <span className={cn("size-2 shrink-0 rounded-full", BOARD_COLOR_CLASSES[list.color].dot)} />
                        <span className="min-w-0 flex-1 truncate">{list.name}</span>
                        <Badge variant="outline" size="sm" className="tabular-nums">{counts.get(list.id) ?? 0}</Badge>
                      </button>
                    ))}
                  </FramePanel>
                </Frame>
              </motion.div>
            </PopoverPrimitive.Content>
          </PopoverPrimitive.Portal>
        )}
      </AnimatePresence>
    </PopoverPrimitive.Root>
  );
}


/** "+ New list": a small popover with a live preview, a colour and quick-start names. */
function NewListPopover({
  lists,
  side,
  onCreate,
}: {
  lists: BoardList[];
  side: "right" | "bottom";
  onCreate: (name: string, color: BoardColor) => Promise<boolean>;
}) {
  const reduceMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [color, setColor] = useState<BoardColor>(BOARD_COLORS[0]);
  const [saving, setSaving] = useState(false);
  const suggestions = LIST_SUGGESTIONS.filter((s) => !lists.some((l) => l.name === s));
  const trimmed = name.trim();
  const tone = BOARD_COLOR_CLASSES[color];

  const changeOpen = (next: boolean) => {
    setOpen(next);
    if (!next) return;
    // Each new list starts on the next colour so neighbours look different.
    setName("");
    setColor(BOARD_COLORS[lists.length % BOARD_COLORS.length]);
  };

  const create = async () => {
    if (!trimmed || saving) return;
    setSaving(true);
    const created = await onCreate(trimmed, color);
    setSaving(false);
    if (created) setOpen(false);
  };

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={changeOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          className="flex h-8 w-full items-center gap-1.5 whitespace-nowrap rounded-lg px-2 text-[12.5px] text-black/45 transition-[background-color,color,transform] duration-150 hover:bg-black/[0.03] hover:text-black active:scale-[0.98] data-[state=open]:bg-black/[0.04] data-[state=open]:text-black"
        >
          <Plus weight="light" className="size-4" /> New list
        </button>
      </PopoverPrimitive.Trigger>
      <AnimatePresence>
        {open && (
          <PopoverPrimitive.Portal forceMount>
            <PopoverPrimitive.Content forceMount asChild side={side} align="end" sideOffset={10} collisionPadding={12}>
              <motion.form
                onSubmit={(e) => { e.preventDefault(); void create(); }}
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1, transition: MENU_IN }}
                exit={reduceMotion ? { opacity: 0, transition: MENU_OUT } : { opacity: 0, scale: 0.96, transition: MENU_OUT }}
                style={{ transformOrigin: "var(--radix-popover-content-transform-origin)" }}
                className="z-[60] grid w-[296px] gap-4 rounded-2xl bg-white p-4 shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_16px_40px_-12px_rgba(0,0,0,0.22)] outline-none"
              >
                <div className="grid gap-0.5">
                  <span className="text-[14px] font-semibold tracking-[-0.01em]">New list</span>
                  <span className="text-[12px] text-black/45">Name it for whatever your team needs to follow up.</span>
                </div>

                {/* How the list will look in the rail. */}
                <div className={cn("flex h-10 items-center gap-2.5 rounded-xl px-3 transition-colors duration-200", tone.column)}>
                  <span className={cn("size-2 shrink-0 rounded-full transition-colors duration-200", tone.dot)} />
                  <span className={cn("min-w-0 flex-1 truncate text-[13px] font-semibold transition-colors duration-200", trimmed ? tone.ink : "text-black/30")}>
                    {trimmed || "List name"}
                  </span>
                  <span className="text-[11px] tabular-nums text-black/35">0</span>
                </div>

                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={60}
                  placeholder="যেমন: ফোন ধরছে না"
                  aria-label="New list name"
                  className="h-10 rounded-xl bg-black/[0.04] px-3 text-[13.5px] outline-none transition-[background-color,box-shadow] duration-150 placeholder:text-black/35 focus:bg-white focus:shadow-[0_0_0_1px_rgba(0,0,0,0.15)]"
                />

                <div className="grid gap-2">
                  <span className="text-[9px] font-medium uppercase tracking-[0.3em] text-black/45">Colour</span>
                  <div className="flex items-center gap-2" role="radiogroup" aria-label="List colour">
                    {BOARD_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        role="radio"
                        aria-checked={c === color}
                        aria-label={c}
                        onClick={() => setColor(c)}
                        className={cn(
                          "grid size-6 place-items-center rounded-full transition-transform duration-150 ease-out active:scale-90",
                          c === color && "ring-2 ring-black/80 ring-offset-2",
                        )}
                      >
                        <span className={cn("size-4 rounded-full", BOARD_COLOR_CLASSES[c].dot)} />
                      </button>
                    ))}
                  </div>
                </div>

                {suggestions.length > 0 && (
                  <div className="grid gap-2">
                    <span className="text-[9px] font-medium uppercase tracking-[0.3em] text-black/45">Quick start</span>
                    <div className="flex flex-wrap gap-1.5">
                      {suggestions.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setName(s)}
                          className={cn(
                            "h-7 rounded-full px-2.5 text-[12px] transition-[background-color,color,transform] duration-150 ease-out active:scale-[0.97]",
                            name === s ? "bg-black text-white" : "bg-black/[0.04] text-black/65 hover:bg-black/[0.07] hover:text-black",
                          )}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center justify-end gap-1.5 border-t border-black/[0.06] pt-3">
                  <PopoverPrimitive.Close className="h-8 rounded-lg px-3 text-[12.5px] text-black/55 transition-colors duration-150 hover:bg-black/[0.04] hover:text-black">
                    Cancel
                  </PopoverPrimitive.Close>
                  <button
                    type="submit"
                    disabled={!trimmed || saving}
                    className="h-8 rounded-lg bg-black px-3.5 text-[12.5px] font-medium text-white transition-[transform,opacity] duration-150 ease-out active:scale-[0.97] disabled:opacity-35"
                  >
                    {saving ? "Creating…" : "Create list"}
                  </button>
                </div>
              </motion.form>
            </PopoverPrimitive.Content>
          </PopoverPrimitive.Portal>
        )}
      </AnimatePresence>
    </PopoverPrimitive.Root>
  );
}

function OrderRow({ card, list, today, selected, onSelect }: {
  card: BoardCard;
  list: BoardList;
  today: string;
  selected: boolean;
  onSelect: () => void;
}) {
  const order = card.order;
  const state = card.remind_on ? reminderState(card.remind_on, today) : null;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected || undefined}
      data-board-row={card.id}
      className={cn(
        "grid w-full gap-1 border-l-2 px-4 py-3 text-left outline-none transition-colors duration-100 focus-visible:bg-black/[0.03]",
        selected ? cn(BOARD_COLOR_CLASSES[list.color].column, BOARD_COLOR_CLASSES[list.color].edge) : "border-l-transparent [@media(hover:hover)]:hover:bg-[#FAFAF8]",
      )}
    >
      <span className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[13px] font-medium">{order?.customer_name || "Unnamed customer"}</span>
        {card.remind_on && (
          <span className={cn(
            "inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[10.5px] font-medium",
            state === "overdue" ? "text-rose-600" : state === "today" ? "text-amber-700" : "text-black/45",
          )}>
            <CalendarBlank weight="light" className="size-3" />
            {reminderLabel(card.remind_on, today)}
          </span>
        )}
      </span>
      <span className="truncate text-[11.5px] text-black/50">
        {card.note || (
          <>
            <span className="font-mono text-[10.5px]">#{order?.order_number ?? "—"}</span> · {fmtTaka(order?.price ?? 0)}
          </>
        )}
      </span>
    </button>
  );
}

export function OrderBoard({ orders, onOrderStatusChange }: { orders: BoardSearchOrder[]; onOrderStatusChange?: (orderId: string, status: string) => void }) {
  const board = useOrderBoard();
  const isMobile = useIsMobile();
  const reduceMotion = useReducedMotion();
  const today = getBangladeshDateKey();
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const rowsRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [listSearch, setListSearch] = useState<{ listId: string; query: string } | null>(null);
  const [pickedListId, setPickedListId] = useState<string | null>(null);
  const [pickedCardId, setPickedCardId] = useState<string | null>(null);
  // Phones have no room for the detail pane, so a picked order opens in a dialog there.
  const [dialogCardId, setDialogCardId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [rowQuery, setRowQuery] = useState("");

  const lists = board.data?.lists ?? NO_LISTS;
  const cards = board.data?.cards ?? NO_CARDS;
  const listById = useMemo(() => new Map(lists.map((l) => [l.id, l])), [lists]);
  const listByOrder = useMemo(() => new Map(cards.map((c) => [c.order_id, listById.get(c.list_id)])), [cards, listById]);
  const cardByOrder = useMemo(() => new Map(cards.map((c) => [c.order_id, c])), [cards]);
  const countByList = useMemo(() => {
    const counts = new Map<string, number>();
    for (const c of cards) counts.set(c.list_id, (counts.get(c.list_id) ?? 0) + 1);
    return counts;
  }, [cards]);

  // The picked list and order fall back to the first one whenever theirs is gone
  // (deleted, removed from the board, or moved to another list).
  const activeList = (pickedListId ? listById.get(pickedListId) : undefined) ?? lists[0];
  const listCards = useMemo(() => (activeList ? cardsInList(cards, activeList.id) : NO_CARDS), [cards, activeList]);
  // The search above the rows narrows the selected list by order number, name, phone, address or note.
  const visibleCards = useMemo(() => {
    const trimmed = rowQuery.trim();
    if (!trimmed) return listCards;
    return listCards.filter((card) =>
      (card.order && matchesOrderSearch({ ...card.order, consignment_id: null, tracking_code: null }, trimmed))
      || card.note.toLowerCase().includes(trimmed.toLowerCase()));
  }, [listCards, rowQuery]);
  const activeCard = listCards.find((c) => c.id === pickedCardId) ?? visibleCards[0] ?? null;
  const dialogCard = cards.find((c) => c.id === dialogCardId) ?? null;

  const showCard = (card: BoardCard) => {
    setPickedListId(card.list_id);
    setPickedCardId(card.id);
    if (isMobile) setDialogCardId(card.id);
  };

  const pickList = (listId: string) => {
    setPickedListId(listId);
    setPickedCardId(null);
    setListSearch(null);
    setRenaming(null);
    setRowQuery("");
  };

  // Up and down arrows walk the order list, like a mail inbox.
  const walkRows = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    if (!activeCard) return;
    e.preventDefault();
    const index = visibleCards.findIndex((c) => c.id === activeCard.id);
    const next = visibleCards[Math.min(visibleCards.length - 1, Math.max(0, index + (e.key === "ArrowDown" ? 1 : -1)))];
    if (!next) return;
    setPickedCardId(next.id);
    rowsRef.current?.querySelector<HTMLElement>(`[data-board-row="${next.id}"]`)?.focus();
  };

  useEffect(() => {
    if (!searchOpen) return;
    const close = (e: PointerEvent) => {
      const target = e.target as Element;
      // The list picker renders in a portal; clicks inside it belong to the search.
      if (searchRef.current?.contains(target) || target.closest?.("[data-board-add-menu], [data-board-search-toggle]")) return;
      setSearchOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [searchOpen]);

  // The list's "Add order" panel closes on any click outside it.
  const listSearchOpen = listSearch !== null;
  useEffect(() => {
    if (!listSearchOpen) return;
    const close = (e: PointerEvent) => {
      const target = e.target as Element;
      if (target.closest?.("[data-board-list-search], [data-board-add-menu]")) return;
      setListSearch(null);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [listSearchOpen]);

  const addOrder = async (orderId: string, listId: string) => {
    const card = await board.addCard(orderId, listId);
    if (!card) return;
    setSearchOpen(false);
    setQuery("");
    setListSearch(null);
    showCard(card);
  };

  const createList = async (name: string, color: BoardColor) => {
    const list = await board.addList(name, color);
    if (list) pickList(list.id);
    return Boolean(list);
  };

  const cardActions = {
    onUpdate: (cardId: string, patch: Partial<Pick<BoardCard, "note" | "remind_on">>) => void board.updateCard(cardId, patch),
    onMove: (cardId: string, listId: string) => void board.updateCard(cardId, { list_id: listId, position: dropPosition(cards, cardId, listId, 0) }),
    onRemove: (cardId: string) => { setDialogCardId(null); void board.removeCard(cardId); },
    // Moving to Print takes the order off the Board, so it shows in the Print tab.
    onMoveToPrint: (cardId: string, orderId: string) => {
      void board.setOrderStatus(orderId, "print").then((saved) => {
        if (!saved) return;
        setDialogCardId(null);
        void board.removeCard(cardId);
        onOrderStatusChange?.(orderId, "print");
        toast.success("Moved to Print");
      });
    },
  };

  if (board.isLoading) {
    return <div className="flex min-h-[560px] items-center justify-center text-[13px] text-black/40">Loading the board…</div>;
  }
  if (board.isError) {
    return (
      <div className="flex min-h-[560px] flex-col items-center justify-center gap-3 text-[13px] text-black/55">
        {board.error instanceof Error ? board.error.message : "Could not load the board."}
        <button type="button" onClick={() => void board.refetch()} className="h-8 rounded-lg bg-white px-3 text-[12px] font-medium shadow-[0_0_0_1px_rgba(0,0,0,0.08)]">Try again</button>
      </div>
    );
  }

  const searchResults = searchBoardOrders(orders, query);
  const ink = activeList ? BOARD_COLOR_CLASSES[activeList.color].ink : "";

  return (
    <div className="flex min-h-[560px] flex-col" data-testid="order-board">
      <div className="flex flex-wrap items-center justify-between gap-3 px-3 pb-3 pt-4">
        <div className="flex items-baseline gap-2.5">
          <span className="text-[14px] font-medium">{cards.length} {cards.length === 1 ? "order" : "orders"} on the board</span>
          <span className="text-[12px] text-black/45">{lists.length} {lists.length === 1 ? "list" : "lists"}</span>
        </div>
        <div className="flex min-w-0 flex-[0_1_540px] items-center justify-end gap-2 max-md:flex-[1_1_100%]">
          <div ref={searchRef} className="relative min-w-0 flex-1">
            <label className="flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-3 text-muted-foreground shadow-xs transition-[border-color,box-shadow] duration-150 focus-within:border-ring/40 focus-within:ring-[3px] focus-within:ring-ring/10">
              <MagnifyingGlass weight="light" className="size-4 shrink-0" />
              <input
                ref={searchInputRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setSearchOpen(true); }}
                onFocus={() => setSearchOpen(true)}
                onKeyDown={(e) => { if (e.key === "Escape") { setSearchOpen(false); e.currentTarget.blur(); } }}
                placeholder="Search any order: number, name or phone"
                aria-label="Search any order to add it to the board"
                className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
                data-testid="board-search"
              />
            </label>
            <AnimatePresence>
            {searchOpen && (
            <motion.div
              key="board-search-results"
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.98, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0, transition: MENU_IN }}
              exit={reduceMotion ? { opacity: 0, transition: MENU_OUT } : { opacity: 0, scale: 0.98, y: -4, transition: MENU_OUT }}
              style={{ transformOrigin: "top center" }}
              className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 rounded-xl bg-card shadow-lg"
            >
              <Frame spacing="xs">
                <FrameHeader className="flex flex-row items-center justify-between">
                  <FrameTitle className="text-xs">{query.trim() ? "Matching orders" : "Recent orders"}</FrameTitle>
                  <span className="text-[11px] text-muted-foreground">Number, name or phone</span>
                </FrameHeader>
                <FramePanel className="max-h-[340px] overflow-y-auto p-1">
                  {searchResults.length === 0 ? (
                    <div className="px-3 py-6 text-center text-xs text-muted-foreground">No order matches “{query}”. Try the order number or the last digits of the phone.</div>
                  ) : searchResults.map((order) => (
                    <OrderResult
                      key={order.id}
                      order={order}
                      inList={listByOrder.get(order.id)}
                      onOpen={() => {
                        setSearchOpen(false);
                        const card = cardByOrder.get(order.id);
                        if (card) showCard(card);
                      }}
                      action={(
                        <AddToListMenu
                          lists={lists}
                          counts={countByList}
                          orderNumber={order.order_number}
                          onPick={(listId) => void addOrder(order.id, listId)}
                        />
                      )}
                    />
                  ))}
                </FramePanel>
              </Frame>
            </motion.div>
            )}
            </AnimatePresence>
          </div>
          <button
            type="button"
            data-board-search-toggle
            aria-expanded={searchOpen}
            onClick={() => {
              if (searchOpen) { setSearchOpen(false); searchInputRef.current?.blur(); return; }
              setSearchOpen(true);
              searchInputRef.current?.focus();
            }}
            className={cn(pickerPrimaryButtonClassName, "inline-flex h-9 shrink-0 items-center gap-1.5 px-3 text-sm")}
          >
            <Plus weight="light" className="size-4" /> Add order
          </button>
        </div>
      </div>

      <div className="mx-3 mb-4 grid h-[min(760px,calc(100dvh-240px))] min-h-[560px] shrink-0 overflow-hidden rounded-2xl bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.07)] md:grid-cols-[200px_300px_minmax(0,1fr)] md:grid-rows-[minmax(0,1fr)] max-md:grid-rows-[auto_minmax(0,1fr)]">
        {/* Lists */}
        <nav aria-label="Board lists" className="flex gap-0.5 bg-[#FAFAF8] p-2.5 md:flex-col md:border-r md:border-black/[0.07] max-md:overflow-x-auto max-md:border-b max-md:border-black/[0.07]">
          <span className="px-2 pb-2 pt-1 text-[9px] font-medium uppercase tracking-[0.3em] text-black/40 max-md:hidden">Lists</span>
          {lists.map((list) => {
            const active = list.id === activeList?.id;
            return (
              <button
                key={list.id}
                type="button"
                onClick={() => pickList(list.id)}
                aria-current={active || undefined}
                className={cn(
                  "relative flex h-8 shrink-0 items-center gap-2 rounded-lg px-2 text-left text-[12.5px] transition-colors duration-150",
                  active ? "font-medium text-black" : "text-black/60 hover:text-black",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="board-rail-active"
                    transition={reduceMotion ? { duration: 0 } : RAIL_SLIDE}
                    className="absolute inset-0 rounded-lg bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_1px_2px_rgba(0,0,0,0.04)]"
                  />
                )}
                <span className={cn("relative size-2 shrink-0 rounded-full", BOARD_COLOR_CLASSES[list.color].dot)} />
                <span className="relative min-w-0 flex-1 truncate">{list.name}</span>
                {/* Every count wears its list's colour: solid when the list has orders, a light tint when empty. */}
                <span
                  className={cn(
                    "relative min-w-[22px] rounded-full px-1.5 py-px text-center text-[11px] font-semibold tabular-nums transition-colors duration-150",
                    (countByList.get(list.id) ?? 0) > 0
                      ? cn(BOARD_COLOR_CLASSES[list.color].dot, "text-white")
                      : BOARD_COLOR_CLASSES[list.color].chip,
                  )}
                >
                  {countByList.get(list.id) ?? 0}
                </span>
              </button>
            );
          })}

          <div className="shrink-0 md:mt-auto md:pt-2">
            <NewListPopover lists={lists} side={isMobile ? "bottom" : "right"} onCreate={createList} />
          </div>
        </nav>

        {/* Orders in the selected list */}
        <section className="flex min-h-0 flex-col md:border-r md:border-black/[0.07]">
          {activeList ? (
            <>
              <div className="flex min-h-12 items-center gap-2 border-b border-black/[0.07] px-4 py-2">
                {renaming === activeList.id ? (
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                    <input
                      autoFocus
                      defaultValue={activeList.name}
                      maxLength={60}
                      aria-label="List name"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") e.currentTarget.blur();
                        if (e.key === "Escape") { e.currentTarget.value = activeList.name; e.currentTarget.blur(); }
                      }}
                      onBlur={(e) => {
                        const name = e.currentTarget.value.trim();
                        if (name && name !== activeList.name) void board.updateList(activeList.id, { name });
                        setRenaming(null);
                      }}
                      className="h-7 min-w-0 flex-1 rounded-md bg-white px-1.5 text-[14px] font-semibold outline-none ring-1 ring-black/10"
                    />
                    {BOARD_COLORS.map((color: BoardColor) => (
                      <button
                        key={color}
                        type="button"
                        aria-label={`Color ${color}`}
                        onPointerDown={(e) => e.preventDefault()}
                        onClick={() => void board.updateList(activeList.id, { color })}
                        className={cn("size-3 shrink-0 rounded-full transition-transform active:scale-90", BOARD_COLOR_CLASSES[color].dot, activeList.color === color && "ring-2 ring-black/25 ring-offset-1")}
                      />
                    ))}
                  </div>
                ) : (
                  <>
                    <button
                      type="button"
                      title="Rename or recolor"
                      onClick={() => setRenaming(activeList.id)}
                      className={cn("-ml-1 min-w-0 truncate rounded-md px-1 py-0.5 text-left text-[14px] font-semibold tracking-[-0.01em] transition-colors duration-150 hover:bg-black/[0.04]", ink)}
                    >
                      {activeList.name}
                    </button>
                    <span className="text-[12px] tabular-nums text-black/40">{listCards.length}</span>
                    {listCards.length === 0 && (
                      <button
                        type="button"
                        aria-label={`Delete list ${activeList.name}`}
                        onClick={() => void board.removeList(activeList.id)}
                        className="grid size-6 place-items-center rounded-md text-black/40 hover:bg-black/[0.04] hover:text-black"
                      >
                        <X weight="light" className="size-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setListSearch(listSearch ? null : { listId: activeList.id, query: "" })}
                      className={cn("ml-auto inline-flex h-7 shrink-0 items-center gap-1 rounded-lg px-2 text-[12px] font-medium transition-[background-color,transform] duration-150 hover:bg-black/[0.04] active:scale-[0.97]", ink)}
                    >
                      <Plus weight="light" className="size-3.5" /> Add
                    </button>
                  </>
                )}
              </div>

              <AnimatePresence initial={false}>
                {listSearch?.listId === activeList.id && (
                  <motion.div
                    key="list-search"
                    data-board-list-search
                    initial={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto", transition: PANEL_IN }}
                    exit={reduceMotion ? { opacity: 0, transition: PANEL_OUT } : { opacity: 0, height: 0, transition: PANEL_OUT }}
                    className="shrink-0 overflow-hidden border-b border-black/[0.07]"
                  >
                    <div className="grid gap-1 p-2">
                      <input
                        autoFocus
                        value={listSearch.query}
                        onChange={(e) => setListSearch({ listId: activeList.id, query: e.target.value })}
                        onKeyDown={(e) => { if (e.key === "Escape") setListSearch(null); }}
                        placeholder="Order no, name or phone"
                        aria-label={`Find an order to add to ${activeList.name}`}
                        className="h-8 rounded-lg bg-black/[0.04] px-2.5 text-[12.5px] outline-none"
                      />
                      {searchBoardOrders(orders, listSearch.query, 5).map((order) => (
                        <OrderResult
                          key={order.id}
                          order={order}
                          inList={listByOrder.get(order.id)}
                          onOpen={() => {
                            setListSearch(null);
                            const card = cardByOrder.get(order.id);
                            if (card) showCard(card);
                          }}
                          action={(
                            <button type="button" onClick={() => void addOrder(order.id, activeList.id)} className="h-7 shrink-0 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground shadow-xs transition-[transform,background-color] duration-150 hover:bg-primary/90 active:scale-[0.97]">
                              Add
                            </button>
                          )}
                        />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {listCards.length > 0 && (
                <div className="shrink-0 border-b border-black/[0.07] px-3 py-2">
                <label className="flex h-9 items-center gap-2 rounded-lg border border-black/10 bg-black/[0.03] px-3 text-black/55 transition-[border-color,background-color,box-shadow] duration-150 focus-within:border-black/25 focus-within:bg-white focus-within:ring-[3px] focus-within:ring-black/[0.06]">
                  <MagnifyingGlass weight="light" className="size-4 shrink-0" />
                  <input
                    value={rowQuery}
                    onChange={(e) => setRowQuery(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Escape") setRowQuery(""); }}
                    placeholder="Search this list"
                    aria-label={`Search orders in ${activeList.name}`}
                    data-testid="board-list-filter"
                    className="min-w-0 flex-1 bg-transparent text-[13px] text-black outline-none placeholder:text-black/50"
                  />
                  {rowQuery && (
                    <button
                      type="button"
                      aria-label="Clear search"
                      onClick={() => setRowQuery("")}
                      className="grid size-5 shrink-0 place-items-center rounded-md hover:bg-black/[0.04] hover:text-black"
                    >
                      <X weight="light" className="size-3" />
                    </button>
                  )}
                </label>
                </div>
              )}

              <div ref={rowsRef} onKeyDown={walkRows} className="min-h-0 flex-1 divide-y divide-black/[0.05] overflow-y-auto">
                {visibleCards.map((card) => (
                  <OrderRow
                    key={card.id}
                    card={card}
                    list={activeList}
                    today={today}
                    selected={!isMobile && card.id === activeCard?.id}
                    onSelect={() => showCard(card)}
                  />
                ))}
                {listCards.length > 0 && visibleCards.length === 0 && (
                  <div className="px-6 py-12 text-center text-[12.5px] text-black/40">No orders in this list match “{rowQuery.trim()}”.</div>
                )}
                {listCards.length === 0 && (
                  <div className="px-6 py-12 text-center text-[12.5px] text-black/40">
                    এই লিস্টে কোনো অর্ডার নেই।
                    <br />
                    Use <span className="font-medium text-black/60">+ Add</span> or search above to put one here.
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center px-6 text-center text-[12.5px] text-black/40">Create a list to start using the board.</div>
          )}
        </section>

        {/* The picked order */}
        <section className="min-h-0 max-md:hidden">
          {activeCard && activeList ? (
            <motion.div
              key={activeCard.id}
              initial={reduceMotion ? { opacity: 0 } : { opacity: 0, filter: "blur(2px)" }}
              animate={{ opacity: 1, filter: "blur(0px)", transition: DETAIL_IN }}
              className="h-full"
            >
              <BoardCardDetail card={activeCard} lists={lists} today={today} className="h-full" {...cardActions} />
            </motion.div>
          ) : (
            <div className="flex h-full items-center justify-center px-8 text-center text-[12.5px] text-black/40">
              Pick an order to see its note, follow-up date and updates.
            </div>
          )}
        </section>
      </div>

      {isMobile && (
        <BoardCardDialog
          card={dialogCard}
          lists={lists}
          today={today}
          onClose={() => setDialogCardId(null)}
          {...cardActions}
        />
      )}
    </div>
  );
}
