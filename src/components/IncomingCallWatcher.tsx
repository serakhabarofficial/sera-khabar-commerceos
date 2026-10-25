import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { PhoneIncoming, X } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api";
import type { OrderCall } from "@/lib/orderCalls";

type IncomingCall = OrderCall & { order: { id: string; order_number: string | null; customer_name: string | null; status: string | null } | null };
const POLL_MS = 10_000;

/**
 * Shows MicroSIP's incoming calls on every page, with the caller's latest
 * order. Polls only for staff who set up MicroSIP, and only in the visible
 * tab; a tab that comes back into focus checks straight away.
 */
export function IncomingCallWatcher() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const reduceMotion = useReducedMotion();
  const [dismissed, setDismissed] = useState<string | null>(null);
  const seen = useRef<string | null>(null);
  const { data } = useQuery<{ enabled: boolean; call: IncomingCall | null }>({
    queryKey: ["/api/order-calls/incoming"],
    queryFn: async () => {
      const res = await apiFetch("/api/order-calls/incoming");
      if (!res.ok) throw new Error("Could not check calls");
      return res.json();
    },
    refetchInterval: (query) => (query.state.data?.enabled === false ? false : POLL_MS),
    refetchIntervalInBackground: false,
    staleTime: 0,
  });
  const call = data?.call ?? null;

  // A new incoming call refreshes that order's call log if it is open.
  useEffect(() => {
    if (!call || seen.current === call.id) return;
    seen.current = call.id;
    if (call.order_id) void queryClient.invalidateQueries({ queryKey: [`/api/orders/${call.order_id}/calls`] });
  }, [call, queryClient]);

  const onThatOrder = Boolean(call?.order_id && location.pathname === `/orders/${call.order_id}`);
  const visible = Boolean(call && dismissed !== call.id && !onThatOrder);

  return (
    <AnimatePresence>
      {visible && call && (
        <motion.div
          key={call.id}
          role="alertdialog"
          aria-label="Incoming call"
          initial={reduceMotion ? false : { opacity: 0, y: -12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={reduceMotion ? undefined : { opacity: 0, y: -8 }}
          transition={{ duration: 0.24, ease: [0.23, 1, 0.32, 1] }}
          className="fixed right-4 top-[calc(env(safe-area-inset-top,0px)+56px)] z-50 flex w-[300px] flex-col gap-2 rounded-2xl bg-black p-3.5 text-white shadow-[0_12px_32px_-8px_rgba(0,0,0,0.35)]"
        >
          <div className="flex items-center gap-2 text-[10.5px] uppercase tracking-[0.14em] text-white/60">
            <PhoneIncoming weight="light" size={14} className="text-emerald-400" />
            {call.outcome === "answered" ? "On call · MicroSIP" : "Incoming call · MicroSIP"}
            <button type="button" aria-label="Hide" onClick={() => setDismissed(call.id)} className="ml-auto rounded-md p-0.5 text-white/60 hover:bg-white/10 hover:text-white"><X weight="light" size={14} /></button>
          </div>
          <p className="text-[16px] font-medium">{call.order?.customer_name || call.phone}</p>
          <p className="text-[12px] text-white/70">
            {call.order ? <>{call.phone} · #{call.order.order_number || "—"}{call.order.status ? ` · ${call.order.status.replace(/_/g, " ")}` : ""}</> : "No order with this number"}
          </p>
          {call.order && (
            <button type="button" onClick={() => { setDismissed(call.id); navigate(`/orders/${call.order!.id}`); }}
              className="self-start rounded-[9px] bg-white px-3 py-1.5 text-[12.5px] font-medium text-black transition hover:bg-white/90 active:scale-[0.97]">
              Open order
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
