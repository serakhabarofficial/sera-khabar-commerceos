import { CALL_NOTE_MAX, CALL_SAID_OPTIONS, callStatus as sharedCallStatus, summarizeCalls as sharedSummarizeCalls } from "../../shared/orderCalls.js";
import { getBangladeshDateKey } from "../../shared/orderHold.js";
import type { CancellationReason } from "@/lib/orderActivity";

export { CALL_NOTE_MAX, CALL_SAID_OPTIONS };

export type CallSaidCode = "confirmed" | "send_later" | "call_later" | "address_change" | "order_change" | "refused" | "cancel";
export type CallStatus = "ringing" | "talking" | "answered" | "no_answer" | "dialed";

export type OrderCall = {
  id: string;
  order_id: string | null;
  staff_id: string;
  staff_name?: string;
  direction: "outgoing" | "incoming";
  phone: string;
  outcome: "ringing" | "answered" | "no_answer";
  source: "click" | "microsip" | "manual";
  started_at: string;
  answered_at: string | null;
  ended_at: string | null;
  duration_seconds: number | null;
  said_code: CallSaidCode | null;
  note: string | null;
};

export type CallSummary = {
  total: number; answered: number; noAnswer: number; missedInARow: number; talkSeconds: number;
  byStaff: Record<string, { calls: number; noAnswer: number }>;
};

type CallTimes = Pick<OrderCall, "outcome" | "started_at" | "answered_at" | "ended_at">;
export const callStatus = (call: CallTimes, now?: Date) => sharedCallStatus(call, now) as CallStatus;
export const summarizeCalls = (calls: OrderCall[], now?: Date) => sharedSummarizeCalls(calls, now) as CallSummary;

/** What the order editor does when staff pick a next step after a call. */
export type CallNextStep =
  | { kind: "confirm" }
  | { kind: "hold_send_on"; days: number }
  | { kind: "hold_contact_later" }
  | { kind: "cancel"; reason: CancellationReason }
  | { kind: "edit_address" };

type NextStepAction = { label: string; step: CallNextStep; primary?: boolean };

// The next step offered for each thing the customer can say. Status steps only
// show when the order's status can still change (see statusForStep).
export const CALL_NEXT_STEPS: Record<CallSaidCode, { title: string; actions: NextStepAction[] }> = {
  confirmed: { title: "Confirm the order", actions: [{ label: "Confirm order", step: { kind: "confirm" }, primary: true }] },
  send_later: { title: "Put on hold. When should it go?", actions: [
    { label: "Send tomorrow", step: { kind: "hold_send_on", days: 1 } },
    { label: "In 3 days", step: { kind: "hold_send_on", days: 3 }, primary: true },
    { label: "In a week", step: { kind: "hold_send_on", days: 7 } },
  ] },
  call_later: { title: "Put on hold and call back", actions: [{ label: "Hold: call later", step: { kind: "hold_contact_later" }, primary: true }] },
  address_change: { title: "Change the address", actions: [{ label: "Edit address", step: { kind: "edit_address" }, primary: true }] },
  order_change: { title: "Change the items in the cart", actions: [] },
  refused: { title: "Cancel the order? The customer refused it.", actions: [{ label: "Cancel order", step: { kind: "cancel", reason: "customer_changed_mind" }, primary: true }] },
  cancel: { title: "Cancel the order", actions: [{ label: "Cancel order", step: { kind: "cancel", reason: "customer_changed_mind" }, primary: true }] },
};

/** The order status a next step sets, or null when it does not change the status. */
export function statusForStep(step: CallNextStep): string | null {
  if (step.kind === "confirm") return "confirmed";
  if (step.kind === "hold_send_on" || step.kind === "hold_contact_later") return "on_hold";
  if (step.kind === "cancel") return "cancelled";
  return null;
}

const dayNumber = (dateKey: string) => Date.parse(`${dateKey}T00:00:00Z`) / 86_400_000;
const dateKeyFromDay = (day: number) => new Date(day * 86_400_000).toISOString().slice(0, 10);

/**
 * The hold date for "send in N days". Holds end the day after their date
 * (server/orderHoldMaintenance.js), so the order is back in Pending on day N.
 */
export function holdUntilForSendIn(days: number, now: Date = new Date()): string {
  return dateKeyFromDay(dayNumber(getBangladeshDateKey(now)) + Math.max(1, days) - 1);
}

export function formatCallDuration(seconds: number | null | undefined): string {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

const dhakaDay = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", weekday: "short", day: "numeric", month: "short" });
const dhakaTime = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Dhaka", hour: "2-digit", minute: "2-digit", hour12: false });

/** ["Today" | "Wed 21 Oct", "11:40"] in Bangladesh time. */
export function callTimeParts(iso: string, now: Date = new Date()): [string, string] {
  const date = new Date(iso);
  const sameDay = getBangladeshDateKey(date) === getBangladeshDateKey(now);
  return [sameDay ? "Today" : dhakaDay.format(date).replace(",", ""), dhakaTime.format(date)];
}

export const saidLabel = (code: string | null | undefined) => CALL_SAID_OPTIONS.find((option) => option.code === code)?.label ?? null;
