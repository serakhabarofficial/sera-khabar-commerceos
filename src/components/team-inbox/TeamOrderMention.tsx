import { useCallback, useEffect, useMemo, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Package } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import { formatTaka } from "@/lib/orderEditor";
import { teamOrderStatusTone, type TeamChatOrder } from "@/lib/teamChat";

type MentionOrder = TeamChatOrder & { phone: string | null };
type Mention = { textarea: HTMLTextAreaElement; query: string; start: number; end: number };

// "@" at the start or after a space, then the search typed so far.
const MENTION_RE = /(?:^|\s)@([^\s@]{0,30})$/;

// Sets a React-controlled textarea's value the way typing would, so the
// composer's own state follows.
function typeInto(textarea: HTMLTextAreaElement, value: string, caret: number) {
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set?.call(textarea, value);
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.setSelectionRange(caret, caret);
  textarea.focus();
}

/**
 * Type @ in the message box to tag an order by number, customer name or
 * phone. Picking one writes its order number into the message, which then
 * shows as an order card. Attach onInput and onKeyDownCapture to an element
 * around the composer and render `menu` inside it (it is absolutely placed).
 */
export function useOrderMention(onPick?: (order: TeamChatOrder) => void) {
  const reduceMotion = useReducedMotion();
  const [mention, setMention] = useState<Mention | null>(null);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  // A short pause before searching, so each keystroke is not a request.
  useEffect(() => {
    const timer = setTimeout(() => setQuery(mention?.query ?? ""), 120);
    return () => clearTimeout(timer);
  }, [mention?.query]);

  const { data, isFetching } = useQuery({
    queryKey: ["/api/team-chat/orders", query],
    enabled: !!mention,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
    queryFn: async () => {
      const response = await apiFetch(`/api/team-chat/orders?q=${encodeURIComponent(query)}`);
      if (!response.ok) throw new Error("Could not search orders");
      return (await response.json()) as { orders: MentionOrder[] };
    },
  });
  const orders = useMemo(() => (mention ? data?.orders ?? [] : []), [mention, data?.orders]);

  const read = useCallback((target: EventTarget | null) => {
    if (!(target instanceof HTMLTextAreaElement)) return;
    const caret = target.selectionStart;
    const match = target.value.slice(0, caret).match(MENTION_RE);
    if (!match) return setMention(null);
    setMention((current) => {
      if (current?.query !== match[1]) setActive(0);
      return { textarea: target, query: match[1], start: caret - match[1].length - 1, end: caret };
    });
  }, []);

  const pick = useCallback((order: MentionOrder) => {
    if (!mention) return;
    const { textarea, start, end } = mention;
    const insert = `${order.order_number} `;
    onPick?.(order);
    typeInto(textarea, textarea.value.slice(0, start) + insert + textarea.value.slice(end), start + insert.length);
    setMention(null);
  }, [mention, onPick]);

  const onInput = useCallback((event: FormEvent) => read(event.target), [read]);

  const onKeyDownCapture = useCallback((event: KeyboardEvent) => {
    if (!mention) return;
    if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setMention(null); return; }
    if (!orders.length) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault(); event.stopPropagation();
      setActive((index) => (index + (event.key === "ArrowDown" ? 1 : orders.length - 1)) % orders.length);
    } else if ((event.key === "Enter" && !event.shiftKey) || event.key === "Tab") {
      // Picks the order instead of sending the message.
      event.preventDefault(); event.stopPropagation();
      pick(orders[Math.min(active, orders.length - 1)]!);
    }
  }, [mention, orders, active, pick]);

  // Moving the caret out of the @word, or leaving the box, closes the menu.
  useEffect(() => {
    if (!mention) return;
    const { textarea } = mention;
    const recheck = () => read(textarea);
    const close = () => setTimeout(() => setMention(null), 120);
    textarea.addEventListener("click", recheck);
    textarea.addEventListener("keyup", recheck);
    textarea.addEventListener("blur", close);
    return () => {
      textarea.removeEventListener("click", recheck);
      textarea.removeEventListener("keyup", recheck);
      textarea.removeEventListener("blur", close);
    };
  }, [mention, read]);

  const menu: ReactNode = (
    <AnimatePresence>
      {mention && (
        <motion.div
          role="listbox" aria-label="Tag an order"
          className="team-chat-theme absolute bottom-[68px] left-3 z-30 w-[min(360px,calc(100%-24px))] overflow-hidden rounded-2xl border border-[#e6e5e0] bg-white p-1 shadow-[0_20px_48px_rgba(0,0,0,0.1),0_3px_10px_rgba(0,0,0,0.045)]"
          style={{ transformOrigin: "16px 100%" }}
          initial={reduceMotion ? { opacity: 0 } : { opacity: 0, scale: 0.97, y: 4 }}
          animate={{ opacity: 1, scale: 1, y: 0, transition: { duration: 0.16, ease: [0.23, 1, 0.32, 1] } }}
          exit={{ opacity: 0, transition: { duration: 0.12 } }}
        >
          <p className="px-2.5 pb-1 pt-1.5 text-[8px] font-medium uppercase tracking-[0.3em] text-black/45">
            {mention.query ? `Orders matching “${mention.query}”` : "Recent orders"}
          </p>
          {orders.map((order, index) => (
            <button key={order.id} type="button" role="option" aria-selected={index === active}
              onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setActive(index)} onClick={() => pick(order)}
              className={cn("flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left", index === active && "bg-black/[0.045]")}>
              <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-[#F4EFE6]"><Package weight="light" size={15} /></span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-medium">#{order.order_number} <span className="font-normal text-black/40">·</span> {formatTaka(order.price)}</span>
                <span className="block truncate text-[11px] text-black/50">{[order.customer_name, order.phone].filter(Boolean).join(" · ") || "No customer details"}</span>
              </span>
              <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold capitalize", teamOrderStatusTone(order.status))}>{order.status.replace(/_/g, " ")}</span>
            </button>
          ))}
          {!orders.length && <p className="px-2.5 pb-2.5 pt-1 text-[12px] text-black/45">{isFetching ? "Searching…" : "No orders match. Try a name, phone or order number."}</p>}
          <p className="border-t border-[#f0efea] px-2.5 pb-1 pt-1.5 text-[10.5px] text-black/35">↑↓ to choose · Enter to tag · Esc to close</p>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return { onInput, onKeyDownCapture, menu };
}
