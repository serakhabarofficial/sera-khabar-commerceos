import { useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { CalendarBlank, CaretDown, MagnifyingGlass, Plus, X, ArrowUpRight } from "@phosphor-icons/react";
import { Badge } from "@/components/reui/badge";
import { Frame, FrameHeader, FramePanel, FrameTitle } from "@/components/reui/frame";
import {
  Kanban,
  KanbanBoard,
  KanbanColumn,
  KanbanColumnContent,
  KanbanItem,
  KanbanItemHandle,
  KanbanOverlay,
  type KanbanCommitMeta,
} from "@/components/reui/kanban";
import { useOrderBoard } from "@/hooks/useOrderBoard";
import { pickerPrimaryButtonClassName } from "@/components/base/date-picker/shared";
import { cn } from "@/lib/utils";
import { displayStatusLabel } from "@/lib/orderTransitions";
import {
  BOARD_COLORS,
  BOARD_COLOR_CLASSES,
  cardsInList,
  dropPosition,
  isHeavyParcel,
  itemCount,
  positionBetween,
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

const LIST_SUGGESTIONS = ["ফোন ধরছে না", "কাস্টমার নিচ্ছে না", "ঠিকানা ভুল", "অগ্রিম পেমেন্ট"];
const NO_LISTS: BoardList[] = [];
// Dropdowns open with a quick ease-out and close a little faster than they open.
const MENU_EASE = [0.23, 1, 0.32, 1] as const;
const MENU_IN = { duration: 0.18, ease: MENU_EASE };
const MENU_OUT = { duration: 0.12, ease: MENU_EASE };
// The list's Add order panel grows open and folds shut, so the list resizes smoothly.
const PANEL_IN = { duration: 0.24, ease: MENU_EASE };
const PANEL_OUT = { duration: 0.18, ease: MENU_EASE };
const NO_CARDS: BoardCard[] = [];
const cardKey = (card: BoardCard) => card.id;

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

function CardBody({ card, today }: { card: BoardCard; today: string }) {
  const order = card.order;
  const items = order?.items ?? [];
  const count = itemCount(items);
  const state = card.remind_on ? reminderState(card.remind_on, today) : null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-[11px] text-muted-foreground">#{order?.order_number ?? "—"}</span>
        {card.remind_on ? (
          <span className={cn(
            "inline-flex items-center gap-1 whitespace-nowrap text-[11px] font-medium",
            state === "overdue" ? "text-rose-600" : state === "today" ? "text-amber-700" : "text-muted-foreground",
          )}>
            <CalendarBlank weight="light" className="size-3.5" />
            {reminderLabel(card.remind_on, today)}
          </span>
        ) : (
          <span className="font-mono text-[11px] tabular-nums text-muted-foreground">{fmtTaka(order?.price ?? 0)}</span>
        )}
      </div>
      <span className="text-sm font-medium leading-snug">{order?.customer_name || "Unnamed customer"}</span>
      {card.note ? (
        <p className="line-clamp-2 whitespace-pre-line text-xs text-muted-foreground">{card.note}</p>
      ) : (
        <p className="text-xs italic text-muted-foreground/60">Click to add a note</p>
      )}
      {order && (
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] tabular-nums text-muted-foreground">
            {displayStatusLabel(order.status)} · {count} {count === 1 ? "item" : "items"}
          </span>
          {isHeavyParcel(items) && <Badge variant="info-outline" size="sm">Heavy</Badge>}
        </div>
      )}
    </div>
  );
}

function BoardCardItem({
  card,
  today,
  onOpen,
  ...props
}: { card: BoardCard; today: string; onOpen: () => void } & Omit<ComponentProps<typeof KanbanItem>, "value" | "children">) {
  return (
    <KanbanItem
      value={card.id}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onOpen(); } }}
      aria-label={`Order ${card.order?.order_number ?? ""}, ${card.order?.customer_name ?? ""}. Press Enter to open.`}
      className="rounded-(--frame-panel-radius) outline-none focus-visible:ring-2 focus-visible:ring-ring"
      {...props}
    >
      <KanbanItemHandle onClick={onOpen}>
        <Frame variant="ghost" spacing="sm" className="p-0">
          <FramePanel className="p-3 transition-shadow duration-150 hover:shadow-sm">
            <CardBody card={card} today={today} />
          </FramePanel>
        </Frame>
      </KanbanItemHandle>
    </KanbanItem>
  );
}

export function OrderBoard({ orders }: { orders: BoardSearchOrder[] }) {
  const board = useOrderBoard();
  const reduceMotion = useReducedMotion();
  const today = getBangladeshDateKey();
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const boardRootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [listSearch, setListSearch] = useState<{ listId: string; query: string } | null>(null);
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [addingList, setAddingList] = useState(false);
  const [newListName, setNewListName] = useState("");

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
  const openCard = cards.find((c) => c.id === openCardId) ?? null;

  // While a card is dragged the kanban previews the move in local state; the drop saves it.
  const [dragColumns, setDragColumns] = useState<Record<string, BoardCard[]> | null>(null);
  const savedColumns = useMemo(
    () => Object.fromEntries(lists.map((list) => [list.id, cardsInList(cards, list.id)])) as Record<string, BoardCard[]>,
    [lists, cards],
  );
  const columns = dragColumns ?? savedColumns;
  // The kanban can still apply its final reorder after onDragEnd; clear once it has.
  const endDrag = () => queueMicrotask(() => setDragColumns(null));
  const commitMove = (value: Record<string, BoardCard[]>, meta: KanbanCommitMeta<BoardCard>) => {
    if (meta.kind !== "item") return;
    const list = value[meta.overContainer] ?? [];
    const position = positionBetween(list[meta.overIndex - 1]?.position, list[meta.overIndex + 1]?.position);
    void board.updateCard(String(meta.event.active.id), { list_id: meta.overContainer, position });
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

  // A list's "Add order" panel closes on any click outside it.
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

  // Fade the board's edge only on the side that has more lists to scroll to.
  const listCount = board.data?.lists.length ?? 0;
  useEffect(() => {
    const el = boardRootRef.current?.querySelector<HTMLElement>("[data-slot=kanban-board]");
    if (!el) return;
    const update = () => {
      const max = el.scrollWidth - el.clientWidth;
      el.toggleAttribute("data-more-left", el.scrollLeft > 2);
      el.toggleAttribute("data-more-right", el.scrollLeft < max - 2);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const resize = new ResizeObserver(update);
    resize.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      resize.disconnect();
    };
  }, [board.isLoading, listCount]);

  const addOrder = async (orderId: string, listId: string) => {
    const card = await board.addCard(orderId, listId);
    if (!card) return;
    setSearchOpen(false);
    setQuery("");
    setListSearch(null);
    setOpenCardId(card.id);
  };

  const createList = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const color = BOARD_COLORS[lists.length % BOARD_COLORS.length];
    if (await board.addList(trimmed, color)) {
      setAddingList(false);
      setNewListName("");
    }
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

  return (
    <div ref={boardRootRef} className="flex min-h-[560px] flex-col" data-testid="order-board">
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
                      onOpen={() => { setSearchOpen(false); setOpenCardId(cardByOrder.get(order.id)?.id ?? null); }}
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

      <Kanban
        value={columns}
        onValueChange={setDragColumns}
        getItemValue={cardKey}
        restoreOnCancel
        onDragStart={() => setDragColumns(savedColumns)}
        onDragEnd={endDrag}
        onDragCancel={endDrag}
        onValueCommit={commitMove}
        className="flex flex-1 flex-col"
      >
        {/* Runs to the card edge; the empty ::after keeps a 12px gap after the last list. */}
        <KanbanBoard className="board-edge-fade flex flex-1 items-start gap-3 overflow-x-auto pb-6 pl-3 pt-1 [scrollbar-width:thin] after:w-0 after:shrink-0 after:self-stretch after:content-['']">
          {lists.map((list) => {
            const listCards = columns[list.id] ?? [];
            return (
              <KanbanColumn key={list.id} value={list.id} className="w-[290px] shrink-0 max-md:w-[82vw]">
                <Frame spacing="sm" className="max-h-[720px]">
                  <FrameHeader className="flex flex-row items-center gap-2">
                    {renaming === list.id ? (
                      <>
                        <input
                          autoFocus
                          defaultValue={list.name}
                          maxLength={60}
                          aria-label="List name"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") e.currentTarget.blur();
                            if (e.key === "Escape") { e.currentTarget.value = list.name; e.currentTarget.blur(); }
                          }}
                          onBlur={(e) => {
                            const name = e.currentTarget.value.trim();
                            if (name && name !== list.name) void board.updateList(list.id, { name });
                            setRenaming(null);
                          }}
                          className="min-w-0 flex-1 rounded-md bg-background px-1.5 py-0.5 text-sm font-semibold outline-none ring-1 ring-ring/40"
                        />
                        {BOARD_COLORS.map((color: BoardColor) => (
                          <button
                            key={color}
                            type="button"
                            aria-label={`Color ${color}`}
                            onPointerDown={(e) => e.preventDefault()}
                            onClick={() => void board.updateList(list.id, { color })}
                            className={cn("size-3 shrink-0 rounded-full transition-transform active:scale-90", BOARD_COLOR_CLASSES[color].dot, list.color === color && "ring-2 ring-black/25 ring-offset-1")}
                          />
                        ))}
                      </>
                    ) : (
                      <>
                        <div className={cn("size-2 shrink-0 rounded-full", BOARD_COLOR_CLASSES[list.color].dot)} />
                        <FrameTitle className="min-w-0 flex-1">
                          <button
                            type="button"
                            title="Rename or recolor"
                            onClick={() => setRenaming(list.id)}
                            className="-ml-1 max-w-full truncate rounded-md px-1 py-0.5 text-left hover:bg-background"
                          >
                            {list.name}
                          </button>
                        </FrameTitle>
                        <Badge variant="outline" size="sm" className="ml-auto tabular-nums">{listCards.length}</Badge>
                        {listCards.length === 0 && (
                          <button
                            type="button"
                            aria-label={`Delete list ${list.name}`}
                            onClick={() => void board.removeList(list.id)}
                            className="grid size-5 place-items-center rounded-md text-muted-foreground hover:bg-background hover:text-foreground"
                          >
                            <X weight="light" className="size-3.5" />
                          </button>
                        )}
                      </>
                    )}
                  </FrameHeader>

                  <KanbanColumnContent value={list.id} className="flex min-h-16 flex-col gap-2 overflow-y-auto p-0.5">
                    {listCards.map((card) => (
                      <BoardCardItem key={card.id} card={card} today={today} onOpen={() => setOpenCardId(card.id)} />
                    ))}
                    {listCards.length === 0 && (
                      <div className="rounded-lg border border-dashed border-border px-3 py-5 text-center text-xs text-muted-foreground">এখানে অর্ডার টেনে আনুন</div>
                    )}
                  </KanbanColumnContent>

                  <div>
                  <AnimatePresence initial={false}>
                    {listSearch?.listId === list.id ? (
                      <motion.div
                        key="list-search"
                        data-board-list-search
                        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto", transition: PANEL_IN }}
                        exit={reduceMotion ? { opacity: 0, transition: PANEL_OUT } : { opacity: 0, height: 0, transition: PANEL_OUT }}
                        className="overflow-hidden"
                      >
                      <div className="grid gap-1 rounded-(--frame-panel-radius) border border-border bg-card p-1.5 shadow-sm">
                        <input
                          autoFocus
                          value={listSearch.query}
                          onChange={(e) => setListSearch({ listId: list.id, query: e.target.value })}
                          onKeyDown={(e) => { if (e.key === "Escape") setListSearch(null); }}
                          placeholder="Order no, name or phone"
                          aria-label={`Find an order to add to ${list.name}`}
                          className="h-8 rounded-lg bg-muted/60 px-2.5 text-[12.5px] outline-none"
                        />
                        {searchBoardOrders(orders, listSearch.query, 5).map((order) => (
                          <OrderResult
                            key={order.id}
                            order={order}
                            inList={listByOrder.get(order.id)}
                            onOpen={() => { setListSearch(null); setOpenCardId(cardByOrder.get(order.id)?.id ?? null); }}
                            action={(
                              <button type="button" onClick={() => void addOrder(order.id, list.id)} className="h-7 shrink-0 rounded-md bg-primary px-2.5 text-xs font-medium text-primary-foreground shadow-xs transition-[transform,background-color] duration-150 hover:bg-primary/90 active:scale-[0.97]">
                                Add
                              </button>
                            )}
                          />
                        ))}
                        <button type="button" onClick={() => setListSearch(null)} className="h-7 rounded-lg text-[12px] text-muted-foreground hover:bg-muted/60">Cancel</button>
                      </div>
                      </motion.div>
                    ) : (
                      <motion.div
                        key="list-add"
                        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto", transition: PANEL_IN }}
                        exit={reduceMotion ? { opacity: 0, transition: PANEL_OUT } : { opacity: 0, height: 0, transition: PANEL_OUT }}
                        className="overflow-hidden"
                      >
                        <button
                          type="button"
                          onClick={() => setListSearch({ listId: list.id, query: "" })}
                          className="flex h-8 w-full items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-muted-foreground transition-colors duration-150 hover:bg-background hover:text-foreground"
                        >
                          <Plus weight="light" className="size-4" /> Add order
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  </div>
                </Frame>
              </KanbanColumn>
            );
          })}

          <div className="w-[260px] shrink-0">
            {addingList ? (
              <Frame spacing="sm">
                <form
                  className="grid gap-2 p-0.5"
                  onSubmit={(e) => { e.preventDefault(); void createList(newListName); }}
                >
                  <input
                    autoFocus
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Escape") setAddingList(false); }}
                    maxLength={60}
                    placeholder="List name"
                    aria-label="New list name"
                    className="h-9 rounded-lg border border-border bg-card px-2.5 text-[13px] outline-none focus:ring-1 focus:ring-ring/40"
                  />
                  <div className="flex flex-wrap gap-1">
                    {LIST_SUGGESTIONS.filter((s) => !lists.some((l) => l.name === s)).map((s) => (
                      <button key={s} type="button" onClick={() => void createList(s)} className="rounded-md border border-border bg-card px-2 py-0.5 text-[11.5px] text-muted-foreground hover:text-foreground">
                        {s}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1.5">
                    <button type="submit" className="h-8 rounded-lg bg-black px-3 text-[12px] font-medium text-white active:scale-[0.97]">Add list</button>
                    <button type="button" onClick={() => setAddingList(false)} className="h-8 rounded-lg px-3 text-[12px] text-muted-foreground hover:bg-background">Cancel</button>
                  </div>
                </form>
              </Frame>
            ) : (
              <button
                type="button"
                onClick={() => setAddingList(true)}
                className="flex h-11 w-full items-center gap-2 rounded-xl border border-dashed border-border px-3.5 text-[13px] text-muted-foreground transition-[background-color,transform] duration-150 hover:bg-muted/50 hover:text-foreground active:scale-[0.98]"
              >
                <Plus weight="light" className="size-4" /> New list
              </button>
            )}
          </div>
        </KanbanBoard>
        <KanbanOverlay className="rounded-md border-2 border-dashed bg-muted/10" />
      </Kanban>

      <BoardCardDialog
        card={openCard}
        lists={lists}
        today={today}
        onClose={() => setOpenCardId(null)}
        onUpdate={(cardId, patch) => void board.updateCard(cardId, patch)}
        onMove={(cardId, listId) => void board.updateCard(cardId, { list_id: listId, position: dropPosition(cards, cardId, listId, 0) })}
        onRemove={(cardId) => { setOpenCardId(null); void board.removeCard(cardId); }}
      />
    </div>
  );
}
