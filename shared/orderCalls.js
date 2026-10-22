// Order call log rules, shared by the server and the order editor. Pure.
//
// A call row starts when someone clicks Call (outcome "ringing") or when
// MicroSIP reports a call. MicroSIP then reports the pick-up and the hang-up,
// which finish the row as answered (with talk time) or no answer.

// What the customer said, in the order the editor shows them. The database
// accepts only these codes (supabase/migrations/20261022080131_order_calls.sql).
export const CALL_SAID_OPTIONS = Object.freeze([
  { code: "confirmed", label: "অর্ডার নিশ্চিত" },
  { code: "send_later", label: "পরে পাঠান" },
  { code: "call_later", label: "পরে কল দিন" },
  { code: "address_change", label: "ঠিকানা বদল" },
  { code: "order_change", label: "অর্ডার বদল" },
  { code: "refused", label: "নিচ্ছেন না" },
  { code: "cancel", label: "ক্যান্সেল" },
].map((option) => Object.freeze(option)));

export const CALL_SAID_CODES = new Set(CALL_SAID_OPTIONS.map((option) => option.code));
export const CALL_NOTE_MAX = 300;
export const MICROSIP_EVENTS = new Set(["incoming", "answer", "start", "end"]);
// A clicked call with no word from MicroSIP after this long is shown as dialled.
export const CALL_RINGING_WINDOW_MS = 2 * 60 * 1000;
// MicroSIP events only finish calls that started within this window.
export const CALL_OPEN_WINDOW_MS = 2 * 60 * 60 * 1000;

/** The BD mobile number in a MicroSIP caller ID ("sip:+8801712345678@pbx"), or null. */
export function callerIdPhone(raw) {
  const text = String(raw ?? "");
  const sip = text.match(/<?(?:sips?|tel):([^@>;]+)/i);
  let digits = (sip ? sip[1] : text.split("@")[0]).replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  if (digits.startsWith("880")) digits = digits.slice(3);
  if (digits.length === 10 && digits.startsWith("1")) digits = `0${digits}`;
  return /^01[0-9]{9}$/.test(digits) ? digits : null;
}

/**
 * What a MicroSIP event does to the call log. `openCall` is the newest
 * unfinished call by the same staff member to the same number, or null.
 */
export function planMicrosipEvent(event, openCall, now = new Date()) {
  const at = now.toISOString();
  if (event === "incoming") return { action: "insert", row: { direction: "incoming", outcome: "ringing", source: "microsip", started_at: at } };
  if (event === "start" || event === "answer") {
    if (openCall) return openCall.answered_at ? { action: "ignore", reason: "already_answered" } : { action: "update", patch: { outcome: "answered", answered_at: at } };
    // Dialled in MicroSIP itself, without the Call button.
    if (event === "start") return { action: "insert", row: { direction: "outgoing", outcome: "answered", source: "microsip", started_at: at, answered_at: at } };
    return { action: "ignore", reason: "no_open_call" };
  }
  if (event === "end") {
    if (!openCall) return { action: "ignore", reason: "no_open_call" };
    if (!openCall.answered_at) return { action: "update", patch: { ended_at: at, outcome: "no_answer" } };
    const seconds = Math.max(0, Math.round((now.getTime() - Date.parse(openCall.answered_at)) / 1000));
    return { action: "update", patch: { ended_at: at, outcome: "answered", duration_seconds: seconds } };
  }
  return { action: "reject", reason: "unknown_event" };
}

/** ringing | talking | answered | no_answer | dialed (clicked, but MicroSIP never reported back). */
export function callStatus(call, now = new Date()) {
  const time = now.getTime();
  if (call.outcome === "no_answer") return "no_answer";
  if (call.outcome === "answered") {
    if (call.ended_at) return "answered";
    return time - Date.parse(call.answered_at || call.started_at) < CALL_OPEN_WINDOW_MS ? "talking" : "answered";
  }
  return time - Date.parse(call.started_at) < CALL_RINGING_WINDOW_MS ? "ringing" : "dialed";
}

/** Counts for the Calls card. `calls` are newest first. */
export function summarizeCalls(calls, now = new Date()) {
  const summary = { total: calls.length, answered: 0, noAnswer: 0, missedInARow: 0, talkSeconds: 0, byStaff: {} };
  let run = true;
  for (const call of calls) {
    const status = callStatus(call, now);
    const staff = (summary.byStaff[call.staff_id] ||= { calls: 0, noAnswer: 0 });
    staff.calls += 1;
    if (status === "answered" || status === "talking") summary.answered += 1;
    if (status === "no_answer") { summary.noAnswer += 1; staff.noAnswer += 1; }
    summary.talkSeconds += Number(call.duration_seconds) || 0;
    // Dialled calls have no known result, so they neither count nor break the run.
    if (run && status === "no_answer") summary.missedInARow += 1;
    else if (status !== "dialed" && status !== "ringing") run = false;
  }
  return summary;
}
