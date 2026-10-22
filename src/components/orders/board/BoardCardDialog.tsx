import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, X } from "@phosphor-icons/react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Calendar } from "react-aria-components";
import { parseDate, type CalendarDate } from "@internationalized/date";
import { format } from "date-fns";
import { SolarCalendarIcon } from "@/components/SolarDateIcons";
import { MonthPanel, pickerPrimaryButtonClassName, pickerSecondaryButtonClassName } from "@/components/base/date-picker/shared";
import { toast } from "@/components/ui/sonner";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { displayStatusLabel } from "@/lib/orderTransitions";
import {
  addDaysToDateKey,
  BOARD_COLOR_CLASSES,
  boardVariantLabel,
  isHeavyParcel,
  itemCount,
  type BoardCard,
  type BoardList,
  type BoardUpdate,
} from "@/lib/orderBoard";
import { getBangladeshDateKey } from "../../../../shared/orderHold.js";

const NOTE_SAVE_DELAY_MS = 700;
// Opens with a quick ease-out; closes a little faster than it opens.
const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const OPEN = { duration: 0.24, ease: EASE_OUT };
const CLOSE = { duration: 0.16, ease: EASE_OUT };

function fmtTaka(n: number | null) {
  return "৳" + Number(n || 0).toLocaleString("en-BD", { maximumFractionDigits: 0 });
}

function updateTime(iso: string) {
  return new Date(iso).toLocaleString("en-GB", { timeZone: "Asia/Dhaka", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false });
}

export function BoardCardDialog({
  card: incomingCard,
  lists,
  today,
  onClose,
  onUpdate,
  onMove,
  onRemove,
}: {
  card: BoardCard | null;
  lists: BoardList[];
  today: string;
  onClose: () => void;
  onUpdate: (cardId: string, patch: Partial<Pick<BoardCard, "note" | "remind_on">>) => void;
  onMove: (cardId: string, listId: string) => void;
  onRemove: (cardId: string) => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const reduceMotion = useReducedMotion();
  // Keep showing the last card while the dialog animates closed.
  const lastCard = useRef<BoardCard | null>(null);
  if (incomingCard) lastCard.current = incomingCard;
  const card = incomingCard ?? lastCard.current;
  const open = Boolean(incomingCard);
  const [note, setNote] = useState("");
  const [updateText, setUpdateText] = useState("");
  const [posting, setPosting] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const saveTimer = useRef<number>();
  const cardId = card?.id;
  const savedNote = useRef("");

  // Load the note when a different card opens; edits on this card stay local until saved.
  useEffect(() => {
    setNote(card?.note ?? "");
    savedNote.current = card?.note ?? "";
    setUpdateText("");
    setConfirmRemove(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardId]);

  const updatesKey = ["/api/order-board/cards", cardId, "updates"];
  const updates = useQuery({
    queryKey: updatesKey,
    enabled: Boolean(cardId),
    queryFn: async () => {
      const res = await apiFetch(`/api/order-board/cards/${cardId}/updates`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not load updates");
      return (data.updates || []) as BoardUpdate[];
    },
  });

  const flushNote = (value = note) => {
    window.clearTimeout(saveTimer.current);
    if (!cardId || value === savedNote.current) return;
    savedNote.current = value;
    onUpdate(cardId, { note: value });
  };

  const changeNote = (value: string) => {
    setNote(value);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => flushNote(value), NOTE_SAVE_DELAY_MS);
  };

  const close = () => {
    flushNote();
    onClose();
  };

  const postUpdate = async () => {
    const text = updateText.trim();
    if (!cardId || !text || posting) return;
    setPosting(true);
    try {
      const res = await apiFetch(`/api/order-board/cards/${cardId}/updates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || "Could not add the update");
      queryClient.setQueryData<BoardUpdate[]>(updatesKey, (prev) => [data.update, ...(prev || [])]);
      setUpdateText("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add the update");
    } finally {
      setPosting(false);
    }
  };

  // Moving the card logs an update on the server; reload the list once it lands.
  const move = (listId: string) => {
    if (!cardId || listId === card?.list_id) return;
    onMove(cardId, listId);
    window.setTimeout(() => void queryClient.invalidateQueries({ queryKey: updatesKey }), 600);
  };

  const order = card?.order;
  const items = order?.items ?? [];
  const heavy = isHeavyParcel(items);
  const quickDates = [
    { label: "Today", value: today },
    { label: "Tomorrow", value: addDaysToDateKey(today, 1) },
    { label: "+3 days", value: addDaysToDateKey(today, 3) },
  ];

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => { if (!next) close(); }}>
      <AnimatePresence>
        {open && card && (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay forceMount asChild>
              <motion.div
                className="fixed inset-0 z-50 bg-black/30"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1, transition: OPEN }}
                exit={{ opacity: 0, transition: CLOSE }}
              />
            </DialogPrimitive.Overlay>
            <DialogPrimitive.Content forceMount asChild aria-describedby={undefined}>
              <motion.div
                className="fixed left-1/2 top-1/2 z-50 flex max-h-[min(760px,calc(100dvh-32px))] w-[min(560px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.06),0_16px_40px_rgba(0,0,0,0.16)] outline-none"
                style={{ x: "-50%", y: "-50%" }}
                initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1, transition: OPEN }}
                exit={reduceMotion ? { opacity: 0, transition: CLOSE } : { opacity: 0, scale: 0.97, transition: CLOSE }}
              >
              <DialogPrimitive.Close
                aria-label="Close"
                className="absolute right-3.5 top-3.5 grid h-8 w-8 place-items-center rounded-lg text-black/45 transition-[background-color,color,transform] duration-150 hover:bg-black/[0.05] hover:text-black active:scale-[0.96]"
              >
                <X weight="light" className="h-4 w-4" />
              </DialogPrimitive.Close>
          <div className="flex max-h-[inherit] flex-col">
            <div className="border-b border-black/[0.07] px-5 pb-4 pt-5 pr-12">
              <span className="font-mono text-[12px] text-black/45">#{order?.order_number ?? "—"}</span>
              <DialogPrimitive.Title className="mt-0.5 text-[19px] font-medium leading-snug">{order?.customer_name || "Unnamed customer"}</DialogPrimitive.Title>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {order && <span className="rounded-md bg-black/[0.05] px-2 py-0.5 text-[11px] font-medium text-black/60">{displayStatusLabel(order.status)}</span>}
                {heavy && <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[11px] font-medium text-blue-700">Heavy · {itemCount(items)} items</span>}
              </div>
            </div>

            <div className="flex flex-col gap-5 overflow-y-auto px-5 pb-5 pt-4">
              <section className="flex flex-col gap-2">
                <span className="text-[9px] font-medium uppercase tracking-[0.3em] text-black/50">List</span>
                <div className="flex flex-wrap gap-1.5">
                  {lists.map((list) => (
                    <button
                      key={list.id}
                      type="button"
                      onClick={() => move(list.id)}
                      aria-pressed={list.id === card.list_id}
                      className={cn(
                        "inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12.5px] transition-[transform,background-color] duration-150 ease-out active:scale-[0.97]",
                        list.id === card.list_id ? "bg-black/[0.06] font-medium text-black" : "text-black/55 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.08)] hover:bg-black/[0.03]",
                      )}
                    >
                      <span className={cn("h-2 w-2 rounded-full", BOARD_COLOR_CLASSES[list.color].dot)} />
                      {list.name}
                    </button>
                  ))}
                </div>
              </section>

              <section className="flex flex-col gap-2">
                <label htmlFor="board-card-note" className="text-[9px] font-medium uppercase tracking-[0.3em] text-black/50">Note</label>
                <textarea
                  id="board-card-note"
                  value={note}
                  onChange={(e) => changeNote(e.target.value)}
                  onBlur={() => flushNote()}
                  maxLength={2000}
                  placeholder="যা খুশি লিখুন: কী হয়েছে, কী করতে হবে…"
                  className="min-h-[96px] resize-y rounded-xl bg-black/[0.04] px-3 py-2.5 text-[13.5px] leading-relaxed outline-none transition-[background-color,box-shadow] duration-150 placeholder:text-black/35 focus:bg-white focus:shadow-[0_0_0_1px_rgba(0,0,0,0.15)]"
                />
              </section>

              <section className="flex flex-col gap-2">
                <span className="text-[9px] font-medium uppercase tracking-[0.3em] text-black/50">Reminder date</span>
                <div className="flex flex-wrap items-center gap-1.5">
                  <ReminderDatePicker
                    value={card.remind_on}
                    onChange={(next) => onUpdate(card.id, { remind_on: next })}
                  />
                  {quickDates.map((d) => (
                    <button
                      key={d.label}
                      type="button"
                      onClick={() => onUpdate(card.id, { remind_on: d.value })}
                      className={cn(
                        "h-8 rounded-lg px-2.5 text-[12px] font-medium transition-[transform,background-color] duration-150 ease-out active:scale-[0.97]",
                        card.remind_on === d.value ? "bg-black text-white" : "bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.08)] hover:bg-black/[0.03]",
                      )}
                    >
                      {d.label}
                    </button>
                  ))}
                  {card.remind_on && (
                    <button type="button" onClick={() => onUpdate(card.id, { remind_on: null })} className="h-8 rounded-lg px-2.5 text-[12px] text-black/50 hover:bg-black/[0.04] hover:text-black">
                      Clear
                    </button>
                  )}
                </div>
              </section>

              <section className="flex flex-col gap-2">
                <span className="text-[9px] font-medium uppercase tracking-[0.3em] text-black/50">Updates</span>
                <form
                  className="flex gap-2"
                  onSubmit={(e) => { e.preventDefault(); void postUpdate(); }}
                >
                  <input
                    value={updateText}
                    onChange={(e) => setUpdateText(e.target.value)}
                    maxLength={500}
                    placeholder="আপডেট লিখে Enter চাপুন"
                    aria-label="Add an update"
                    className="h-9 min-w-0 flex-1 rounded-xl bg-black/[0.04] px-3 text-[13px] outline-none placeholder:text-black/35 focus:bg-white focus:shadow-[0_0_0_1px_rgba(0,0,0,0.15)]"
                  />
                  <button type="submit" disabled={!updateText.trim() || posting} className="h-9 rounded-xl bg-white px-3 text-[12.5px] font-medium shadow-[0_0_0_1px_rgba(0,0,0,0.08)] transition-transform duration-150 active:scale-[0.97] disabled:opacity-40">
                    Add
                  </button>
                </form>
                <div className="flex flex-col gap-2">
                  {updates.isLoading && <span className="text-[12px] text-black/40">Loading updates…</span>}
                  {updates.data?.map((u) => (
                    <div key={u.id} className="grid grid-cols-[92px_minmax(0,1fr)] gap-2 text-[12.5px]">
                      <time className="pt-px font-mono text-[11px] tabular-nums text-black/40">{updateTime(u.created_at)}</time>
                      <span className={cn(u.kind === "note" ? "text-black" : "text-black/55")}>
                        {u.body}
                        <span className="text-black/35"> · {u.staff_name}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              {order && (
                <section className="flex flex-col gap-1.5 rounded-xl bg-black/[0.035] p-3 text-[12.5px]">
                  <div className="flex justify-between gap-3"><span className="text-black/50">Phone</span><span className="select-all font-mono">{order.phone || "—"}</span></div>
                  <div className="flex justify-between gap-3"><span className="text-black/50">Address</span><span className="text-right">{order.address || "—"}</span></div>
                  <div className="flex justify-between gap-3">
                    <span className="text-black/50">Items</span>
                    <span className="text-right">{items.length ? items.map((i) => `${i.product_name ?? "Item"}${boardVariantLabel(i.variant_name) ? ` (${boardVariantLabel(i.variant_name)})` : ""} × ${i.quantity}`).join(", ") : "—"}</span>
                  </div>
                  <div className="flex justify-between gap-3"><span className="text-black/50">Total</span><span className="font-mono tabular-nums">{fmtTaka(order.price)}</span></div>
                </section>
              )}

              <div className="flex items-center justify-between gap-2">
                {confirmRemove ? (
                  <span className="flex items-center gap-1.5 text-[12.5px]">
                    Remove from the board?
                    <button type="button" onClick={() => onRemove(card.id)} className="h-8 rounded-lg bg-rose-600 px-2.5 text-[12px] font-medium text-white active:scale-[0.97]">Remove</button>
                    <button type="button" onClick={() => setConfirmRemove(false)} className="h-8 rounded-lg bg-black/[0.06] px-2.5 text-[12px] font-medium text-black/75 transition-[transform,background-color] duration-150 ease-out hover:bg-black/[0.09] hover:text-black active:scale-[0.97]">Keep</button>
                  </span>
                ) : (
                  <button type="button" onClick={() => setConfirmRemove(true)} className="h-8 rounded-lg px-2.5 text-[12px] font-medium text-rose-600 hover:bg-rose-50">
                    Remove from board
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { flushNote(); navigate(`/orders/${card.order_id}`, { state: { fulfillmentTab: "board" } }); }}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-white px-3 text-[12px] font-medium shadow-[0_0_0_1px_rgba(0,0,0,0.08)] transition-transform duration-150 active:scale-[0.97]"
                >
                  Open order <ArrowUpRight weight="light" className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
              </motion.div>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        )}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}

/**
 * The app's date picker panel (month grid, Clear, Today) in a Radix popover, so it
 * layers correctly over this Radix dialog. It always opens above the field.
 */
function ReminderDatePicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (value: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  let selected: CalendarDate | null = null;
  try { selected = value ? parseDate(value) : null; } catch { selected = null; }
  const label = selected ? format(new Date(selected.year, selected.month - 1, selected.day), "MMM d, yyyy") : "Pick a date";
  const pick = (next: string | null) => { onChange(next); setOpen(false); };

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger
        aria-label={`Reminder date: ${selected ? label : "not set"}`}
        className={cn(
          "flex h-8 w-[150px] items-center gap-2 rounded-lg bg-white px-2.5 text-[12.5px] shadow-[0_0_0_1px_rgba(0,0,0,0.08)] transition-[background-color,transform] duration-150 ease-out hover:bg-black/[0.03] active:scale-[0.97] data-[state=open]:shadow-[0_0_0_1px_rgba(0,0,0,0.2)]",
          selected ? "text-black" : "text-black/70",
        )}
      >
        <SolarCalendarIcon size={15} className="shrink-0 text-black/70" />
        <span className="flex-1 text-left">{label}</span>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          side="top"
          align="start"
          sideOffset={4}
          avoidCollisions={false}
          className="z-[60] origin-[var(--radix-popover-content-transform-origin)] overflow-hidden rounded-xl bg-white outline-none shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_4px_6px_-2px_rgba(26,26,26,0.2),0_12px_24px_-4px_rgba(26,26,26,0.12)] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:duration-200 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:duration-150 motion-reduce:data-[state=open]:zoom-in-100 motion-reduce:data-[state=closed]:zoom-out-100"
        >
          <Calendar aria-label="Reminder date" value={selected} onChange={(date) => pick(date.toString())}>
            <div className="flex flex-col">
              <div className="px-[15px] pt-1 pb-3">
                <MonthPanel offset={0} showPrev showNext />
              </div>
              <div className="flex h-[50px] items-center justify-end gap-2 border-t border-[#EBEBEB] px-3.5">
                <button type="button" className={pickerSecondaryButtonClassName} onClick={() => pick(null)}>Clear</button>
                <button type="button" className={pickerPrimaryButtonClassName} onClick={() => pick(getBangladeshDateKey())}>Today</button>
              </div>
            </div>
          </Calendar>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
