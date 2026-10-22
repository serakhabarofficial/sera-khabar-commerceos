import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BellSimple, Plus } from "@phosphor-icons/react";
import { apiFetch } from "@/lib/api";
import { toast } from "@/components/ui/sonner";
import {
  CALL_NEXT_STEPS, CALL_NOTE_MAX, CALL_SAID_OPTIONS, callStatus, callTimeParts, formatCallDuration, saidLabel, statusForStep, summarizeCalls,
  type CallNextStep, type CallSaidCode, type CallStatus, type CallSummary, type OrderCall,
} from "@/lib/orderCalls";
import { MicrosipSetupDialog, useCallHelperKey } from "./MicrosipSetupDialog";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
// An answered call asks "what did they say?" for this long after it ends.
const FOLLOW_UP_PROMPT_MS = 15 * 60 * 1000;
const LIVE: CallStatus[] = ["ringing", "talking"];

export const orderCallsKey = (orderId: string) => [`/api/orders/${orderId}/calls`];

async function readJson<T>(res: Response): Promise<T> {
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((json as { error?: string }).error || "Something went wrong");
  return json as T;
}

/** The order's calls, refreshed every 2 seconds while one is ringing or in progress. */
export function useOrderCallLog(orderId: string | undefined) {
  const queryClient = useQueryClient();
  const query = useQuery<{ calls: OrderCall[]; viewer_id?: string }>({
    queryKey: orderCallsKey(orderId || ""),
    enabled: Boolean(orderId),
    queryFn: async () => readJson(await apiFetch(`/api/orders/${orderId}/calls`)),
    refetchInterval: (q) => ((q.state.data?.calls ?? []).some((call) => LIVE.includes(callStatus(call))) ? 2000 : false),
  });
  const dial = useMutation({
    mutationFn: async () => readJson(await apiFetch(`/api/orders/${orderId}/calls`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "dial" }) })),
    onSettled: () => queryClient.invalidateQueries({ queryKey: orderCallsKey(orderId || "") }),
  });
  return { orderId, calls: query.data?.calls ?? [], viewerId: query.data?.viewer_id ?? null, loading: query.isPending, dial: () => { if (orderId) dial.mutate(); } };
}

export type OrderCallLog = ReturnType<typeof useOrderCallLog>;

type OrderCallsCardProps = {
  callLog: OrderCallLog;
  /** Whether the editor can move the order to this status now. */
  canSetStatus: (status: string) => boolean;
  onNextStep?: (step: CallNextStep) => void;
  onEditAddress: () => void;
};

const pin: Record<OrderCall["direction"], string> = { outgoing: "bg-[#8E8E86]", incoming: "bg-[#2563EB]" };
const dirTag: Record<OrderCall["direction"], string> = { outgoing: "bg-black/[0.05] text-black/60", incoming: "bg-[#0262B8]/[0.08] text-[#0262B8]" };
const chipBase = "rounded-[9px] px-2.5 py-1.5 text-[12px] transition-[background-color,color,transform] duration-150 active:scale-[0.97]";

function useNow(active: boolean) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    if (!active) return;
    const timer = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(timer);
  }, [active]);
  return active ? now : new Date();
}

export function OrderCallsCard({ callLog, canSetStatus, onNextStep, onEditAddress }: OrderCallsCardProps) {
  const { calls, orderId, viewerId } = callLog;
  const queryClient = useQueryClient();
  const reduceMotion = useReducedMotion();
  const helperKey = useCallHelperKey();
  const [showAll, setShowAll] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(() => new Set());

  const live = calls.find((call) => LIVE.includes(callStatus(call)));
  const now = useNow(Boolean(live));
  const summary = summarizeCalls(calls, now);
  const latest = calls[0];
  const promptCall = !live && latest && latest.staff_id === viewerId && callStatus(latest, now) === "answered" && !latest.said_code && !latest.note
    && latest.ended_at && now.getTime() - Date.parse(latest.ended_at) < FOLLOW_UP_PROMPT_MS && !dismissed.has(latest.id) ? latest : null;
  const optionsCall = live && callStatus(live, now) === "talking" ? live : calls.find((call) => call.id === noteFor) || promptCall;
  const shown = showAll ? calls : calls.slice(0, 3);

  const patch = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      readJson<{ call: OrderCall }>(await apiFetch(`/api/order-calls/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })),
    onSuccess: ({ call }) => queryClient.setQueryData<{ calls: OrderCall[] }>(orderCallsKey(orderId || ""), (data) => data && { ...data, calls: data.calls.map((row) => (row.id === call.id ? call : row)) }),
    onError: (error: Error) => toast.error(error.message),
  });
  const savePatch = (id: string, body: Record<string, unknown>) => patch.mutate({ id, body });

  const takeStep = (step: CallNextStep) => {
    if (step.kind === "edit_address") return onEditAddress();
    onNextStep?.(step);
    toast.success("Set in Status. Press Save changes to keep it.");
  };

  const ans = summary.answered;
  const miss = summary.noAnswer;

  return (
    <div className="min-w-0 overflow-hidden rounded-[14px] bg-white ring-1 ring-inset ring-black/[0.06]">
      <div className="flex items-baseline gap-2 px-3.5 pt-3">
        <h3 className="text-[14px] font-semibold text-black">Calls</h3>
        <span className="truncate text-[12px] tabular-nums text-black/45">
          {calls.length ? <>{calls.length} {calls.length === 1 ? "call" : "calls"} · <span className="text-emerald-700">{ans} answered</span>{miss > 0 && <> · <span className="text-red-600">{miss} no answer</span></>}</> : "No calls yet"}
        </span>
        {calls.length > 0 && (
          <button type="button" aria-expanded={detailsOpen} onClick={() => setDetailsOpen((open) => !open)} className="ml-auto shrink-0 text-[12px] text-[#0262B8] hover:underline">
            {detailsOpen ? "Hide" : "Details"}
          </button>
        )}
      </div>

      <AnimatePresence initial={false}>
        {detailsOpen && (
          <motion.div initial={reduceMotion ? false : { height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={reduceMotion ? undefined : { height: 0, opacity: 0 }} transition={{ duration: 0.22, ease: EASE_OUT }} className="overflow-hidden">
            <CallDetails calls={calls} summary={summary} />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex flex-col gap-2 border-b border-black/[0.06] px-3.5 pb-3 pt-2.5">
        {live ? (
          <LiveBar call={live} now={now} />
        ) : (
          <div className="flex flex-wrap items-center gap-2 text-[12px] text-black/60">
            {helperKey.data?.configured ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"><span aria-hidden className="h-1.5 w-1.5 rounded-full bg-emerald-500" />MicroSIP connected</span>
            ) : (
              <button type="button" onClick={() => setSetupOpen(true)} className="text-[#0262B8] hover:underline">Set up MicroSIP so calls save by themselves</button>
            )}
            <button type="button" onClick={() => setAdding((open) => !open)} aria-expanded={adding} className="ml-auto inline-flex items-center gap-1 text-[#0262B8] hover:underline">
              <Plus weight="light" size={12} />Add by hand
            </button>
          </div>
        )}

        {summary.missedInARow >= 2 && !live && (
          <div className="flex items-center gap-2 rounded-[9px] bg-red-50 px-2.5 py-1.5 text-[12px] text-red-700">
            <span aria-hidden className="flex gap-[3px]">{Array.from({ length: Math.min(summary.missedInARow, 5) }, (_, i) => <span key={i} className="h-[7px] w-[7px] rounded-full bg-red-500" />)}</span>
            {summary.missedInARow} calls in a row with no answer{summary.missedInARow >= 3 ? " · can't reach" : ""}
          </div>
        )}

        <AnimatePresence initial={false}>
          {adding && !live && (
            <motion.div key="add" initial={reduceMotion ? false : { height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={reduceMotion ? undefined : { height: 0, opacity: 0 }} transition={{ duration: 0.22, ease: EASE_OUT }} className="overflow-hidden">
              <AddCallForm orderId={orderId || ""} onDone={() => setAdding(false)} />
            </motion.div>
          )}
          {optionsCall && (
            <motion.div key={`options-${optionsCall.id}`} initial={reduceMotion ? false : { opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={reduceMotion ? undefined : { opacity: 0 }} transition={{ duration: 0.2, ease: EASE_OUT }}>
              <CallOptions
                call={optionsCall}
                title={optionsCall === live ? "What is the customer saying? Tap while you talk." : `Saved: Answered${optionsCall.duration_seconds != null ? ` · ${formatCallDuration(optionsCall.duration_seconds)}` : ""}. What did the customer say?`}
                canSetStatus={canSetStatus}
                // Keep the options open after a pick, through the hang-up, until Done.
                onSave={(body) => { setNoteFor(optionsCall.id); savePatch(optionsCall.id, body); }}
                onStep={takeStep}
                onDone={optionsCall === live ? undefined : () => { setNoteFor(null); setDismissed((ids) => new Set(ids).add(optionsCall.id)); }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {calls.length ? (
        <ol className="flex flex-col px-3.5 pt-3.5" aria-label="Call history">
          {shown.map((call, index) => (
            <CallEntry key={call.id} call={call} now={now} last={index === shown.length - 1}
              onAddNote={() => setNoteFor(call.id)} onSetOutcome={(outcome) => savePatch(call.id, { outcome })} />
          ))}
        </ol>
      ) : (
        <p className="px-3.5 py-3 text-[12px] text-black/45">No calls yet. Click Call above.</p>
      )}
      {calls.length > 3 && (
        <div className="px-3.5 pb-3">
          <button type="button" onClick={() => setShowAll((all) => !all)} className="text-[12px] text-[#0262B8] hover:underline">{showAll ? "Show less" : `See all ${calls.length} calls`}</button>
        </div>
      )}

      <MicrosipSetupDialog open={setupOpen} onOpenChange={setSetupOpen} />
    </div>
  );
}

function CallDetails({ calls, summary }: { calls: OrderCall[]; summary: CallSummary }) {
  const names = new Map(calls.map((call) => [call.staff_id, call.staff_name || "Unnamed member"]));
  const outgoing = calls.filter((call) => call.direction === "outgoing").length;
  return (
    <div className="mt-2.5 flex flex-col gap-1.5 bg-black/[0.03] px-3.5 py-2.5 text-[12px] text-black/60">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="w-[70px] text-[10px] font-medium uppercase tracking-[0.16em] text-black/40">By staff</span>
        {Object.entries(summary.byStaff).map(([id, row]) => (
          <span key={id}>{names.get(id)} <b className="font-medium tabular-nums text-black">{row.calls}</b>{row.noAnswer > 0 && <span className="text-red-600"> ({row.noAnswer} no answer)</span>}</span>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="w-[70px] text-[10px] font-medium uppercase tracking-[0.16em] text-black/40">Who called</span>
        <span>We <b className="font-medium tabular-nums text-black">{outgoing}</b></span>
        <span>Customer <b className="font-medium tabular-nums text-black">{calls.length - outgoing}</b></span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="w-[70px] text-[10px] font-medium uppercase tracking-[0.16em] text-black/40">Talk time</span>
        <span><b className="font-medium tabular-nums text-black">{formatCallDuration(summary.talkSeconds)}</b> total</span>
      </div>
    </div>
  );
}

function LiveBar({ call, now }: { call: OrderCall; now: Date }) {
  const talking = callStatus(call, now) === "talking";
  const since = Date.parse((talking ? call.answered_at : call.started_at) || call.started_at);
  const seconds = Math.max(0, Math.round((now.getTime() - since) / 1000));
  return (
    <div role="status" className={`flex items-center gap-2.5 rounded-[11px] px-3 py-2 text-[12.5px] ${talking ? "bg-emerald-50 text-emerald-700" : "bg-black/[0.04] text-black"}`}>
      <span aria-hidden className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-40 motion-reduce:animate-none" /><span className="relative inline-flex h-2 w-2 rounded-full bg-current" /></span>
      <span className="min-w-0 truncate">
        {talking ? `Talking · ${call.direction === "incoming" ? "customer called" : "answered"}` : `${call.direction === "incoming" ? "Customer calling" : `Calling ${call.phone}`} · ringing`}
        {call.staff_name ? <span className="opacity-60"> · {call.staff_name}</span> : null}
      </span>
      <span className="ml-auto font-mono tabular-nums">{formatCallDuration(seconds)}</span>
    </div>
  );
}

function CallOptions({ call, title, canSetStatus, onSave, onStep, onDone }: {
  call: OrderCall; title: string; canSetStatus: (status: string) => boolean;
  onSave: (body: Record<string, unknown>) => void; onStep: (step: CallNextStep) => void; onDone?: () => void;
}) {
  const [note, setNote] = useState(call.note ?? "");
  useEffect(() => setNote(call.note ?? ""), [call.id, call.note]);
  const said = call.said_code;
  const next = said ? CALL_NEXT_STEPS[said] : null;
  const actions = (next?.actions ?? []).filter(({ step }) => { const status = statusForStep(step); return status ? canSetStatus(status) : true; });
  const saveNote = () => { if (note.trim() !== (call.note ?? "")) onSave({ note }); };

  return (
    <div className="flex flex-col gap-2 rounded-[11px] bg-black/[0.03] p-2.5">
      <p className="text-[12px] text-black/60">{title}</p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label="What the customer said">
        {CALL_SAID_OPTIONS.map((option) => {
          const pressed = said === option.code;
          return (
            <button key={option.code} type="button" aria-pressed={pressed} onClick={() => onSave({ said_code: pressed ? null : option.code as CallSaidCode })}
              className={`${chipBase} ${pressed ? "bg-black text-white" : "bg-black/[0.05] text-black/70 hover:bg-black/[0.08] hover:text-black"}`}>
              {option.label}
            </button>
          );
        })}
      </div>
      <input aria-label="Call note" value={note} maxLength={CALL_NOTE_MAX} onChange={(event) => setNote(event.target.value)} onBlur={saveNote}
        onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); saveNote(); } }}
        placeholder="নোট লিখুন… (ঐচ্ছিক)" className="h-9 w-full rounded-[9px] bg-white px-2.5 text-[12.5px] text-black outline-none ring-1 ring-inset ring-black/[0.1] focus:ring-black/30" />
      {next && (
        <div className="flex flex-col gap-2 rounded-[10px] bg-white p-2.5 ring-1 ring-inset ring-black/[0.06]">
          <span className="flex items-center gap-1.5 text-[12px] text-black/60"><BellSimple weight="light" size={13} />Next step: <b className="font-semibold text-black">{next.title}</b></span>
          {actions.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {actions.map((action) => (
                <button key={action.label} type="button" onClick={() => onStep(action.step)}
                  className={`${chipBase} font-medium ${action.primary ? "bg-black text-white hover:bg-[#262626]" : "bg-black/[0.05] text-black hover:bg-black/[0.08]"}`}>
                  {action.label}
                </button>
              ))}
            </div>
          ) : next.actions.length > 0 && <span className="text-[11.5px] text-black/45">The status can't change now. Saved as a note.</span>}
        </div>
      )}
      {onDone && (
        <div className="flex justify-end">
          <button type="button" onClick={() => { saveNote(); onDone(); }} className={`${chipBase} bg-black/[0.05] text-black hover:bg-black/[0.08]`}>{said || note.trim() ? "Done" : "Skip"}</button>
        </div>
      )}
    </div>
  );
}

const missText = "ফোন ধরেননি";

function CallEntry({ call, now, last, onAddNote, onSetOutcome }: { call: OrderCall; now: Date; last: boolean; onAddNote: () => void; onSetOutcome: (outcome: "answered" | "no_answer") => void }) {
  const status = callStatus(call, now);
  const [day, time] = callTimeParts(call.started_at, now);
  const said = saidLabel(call.said_code);
  const text = [said, call.note].filter(Boolean).join(" · ");
  const source = call.source === "manual" ? "added by hand" : call.source === "microsip" || call.ended_at ? "saved by MicroSIP" : "Call button";
  return (
    <li className="relative grid grid-cols-[58px_11px_minmax(0,1fr)] gap-x-3 pb-[18px]">
      {!last && <span aria-hidden className="absolute bottom-0 left-[calc(58px+12px+5px)] top-[15px] w-px bg-black/[0.12]" />}
      <time dateTime={call.started_at} className="pt-0.5 text-right text-[11.5px] leading-[1.5] tabular-nums text-black/45">{day}<span className="block">{time}</span></time>
      <span aria-hidden className={`relative z-[1] mt-[6px] h-[11px] w-[11px] rounded-full ${pin[call.direction]}`} />
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-medium ${dirTag[call.direction]}`}>{call.direction === "incoming" ? "Customer called" : "We called"}</span>
          {status === "answered" && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">Answered{call.duration_seconds != null ? ` · ${formatCallDuration(call.duration_seconds)}` : ""}</span>}
          {status === "talking" && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">Talking now</span>}
          {status === "no_answer" && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-600">No answer</span>}
          {status === "ringing" && <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[11px] font-medium text-black/60">Ringing</span>}
          {status === "dialed" && <span className="rounded-full bg-black/[0.05] px-2 py-0.5 text-[11px] font-medium text-black/60">Dialled</span>}
        </div>
        {text ? <p className="text-[13px] leading-[1.55] text-black">{text}</p> : status === "no_answer" ? <p className="text-[13px] leading-[1.55] text-black/40">{missText}</p> : null}
        {status === "answered" && !text && <button type="button" onClick={onAddNote} className="self-start text-[12px] text-[#0262B8] hover:underline">+ Add what they said</button>}
        {status === "dialed" && (
          <span className="flex flex-wrap items-center gap-1.5 text-[11.5px] text-black/45">
            MicroSIP didn't report back. How did it go?
            <button type="button" onClick={() => onSetOutcome("answered")} className="rounded-md bg-emerald-50 px-2 py-0.5 text-emerald-700 hover:bg-emerald-100">Answered</button>
            <button type="button" onClick={() => onSetOutcome("no_answer")} className="rounded-md bg-red-50 px-2 py-0.5 text-red-600 hover:bg-red-100">No answer</button>
          </span>
        )}
        <span className="text-[11.5px] text-black/45">{call.staff_name || "Unnamed member"} · {source}</span>
      </div>
    </li>
  );
}

function AddCallForm({ orderId, onDone }: { orderId: string; onDone: () => void }) {
  const queryClient = useQueryClient();
  const [direction, setDirection] = useState<OrderCall["direction"]>("outgoing");
  const [outcome, setOutcome] = useState<"answered" | "no_answer">("answered");
  const [said, setSaid] = useState<CallSaidCode | null>(null);
  const [note, setNote] = useState("");
  const add = useMutation({
    mutationFn: async () => readJson(await apiFetch(`/api/orders/${orderId}/calls`, { method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "manual", direction, outcome, said_code: outcome === "answered" ? said : null, note: note.trim() || null }) })),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: orderCallsKey(orderId) }); toast.success("Call saved"); onDone(); },
    onError: (error: Error) => toast.error(error.message),
  });
  const seg = (active: boolean) => `${chipBase} flex-1 ${active ? "bg-white text-black shadow-[0_1px_2px_rgba(0,0,0,0.06),0_0_0_1px_rgba(0,0,0,0.06)]" : "text-black/60 hover:text-black"}`;
  return (
    <form className="flex flex-col gap-2 pt-1" onSubmit={(event) => { event.preventDefault(); add.mutate(); }}>
      <div className="flex gap-0.5 rounded-[10px] bg-black/[0.05] p-[3px]" role="group" aria-label="Who called">
        <button type="button" aria-pressed={direction === "outgoing"} onClick={() => setDirection("outgoing")} className={seg(direction === "outgoing")}>We called</button>
        <button type="button" aria-pressed={direction === "incoming"} onClick={() => setDirection("incoming")} className={seg(direction === "incoming")}>Customer called</button>
      </div>
      <div className="flex gap-0.5 rounded-[10px] bg-black/[0.05] p-[3px]" role="group" aria-label="How the call went">
        <button type="button" aria-pressed={outcome === "answered"} onClick={() => setOutcome("answered")} className={seg(outcome === "answered")}>Answered</button>
        <button type="button" aria-pressed={outcome === "no_answer"} onClick={() => setOutcome("no_answer")} className={seg(outcome === "no_answer")}>No answer</button>
      </div>
      {outcome === "answered" && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="What the customer said">
          {CALL_SAID_OPTIONS.map((option) => (
            <button key={option.code} type="button" aria-pressed={said === option.code} onClick={() => setSaid(said === option.code ? null : option.code as CallSaidCode)}
              className={`${chipBase} ${said === option.code ? "bg-black text-white" : "bg-black/[0.05] text-black/70 hover:bg-black/[0.08]"}`}>{option.label}</button>
          ))}
        </div>
      )}
      <input aria-label="Call note" value={note} maxLength={CALL_NOTE_MAX} onChange={(event) => setNote(event.target.value)} placeholder="নোট (ঐচ্ছিক)"
        className="h-9 w-full rounded-[9px] bg-white px-2.5 text-[12.5px] text-black outline-none ring-1 ring-inset ring-black/[0.1] focus:ring-black/30" />
      <div className="flex justify-end gap-1.5">
        <button type="button" onClick={onDone} className={`${chipBase} bg-black/[0.05] text-black hover:bg-black/[0.08]`}>Cancel</button>
        <button type="submit" disabled={add.isPending} className={`${chipBase} bg-black font-medium text-white hover:bg-[#262626] disabled:opacity-40`}>{add.isPending ? "Saving…" : "Save call"}</button>
      </div>
    </form>
  );
}
