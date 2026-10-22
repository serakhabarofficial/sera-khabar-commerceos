import { describe, expect, it } from "vitest";
import { CALL_SAID_OPTIONS, callStatus, callerIdPhone, planMicrosipEvent, summarizeCalls } from "../../shared/orderCalls.js";

const now = new Date("2026-10-22T08:00:00.000Z");
const ago = (seconds: number) => new Date(now.getTime() - seconds * 1000).toISOString();

describe("MicroSIP caller IDs", () => {
  it("reads BD mobile numbers in the formats MicroSIP passes", () => {
    for (const raw of ["01712345678", "+8801712345678", "8801712345678", "008801712345678", "sip:01712345678@sip.example.com", "sip:+8801712345678@10.0.0.1:5060", "\"Rumana\" <sip:01712345678@pbx>", "1712345678"]) {
      expect(callerIdPhone(raw)).toBe("01712345678");
    }
  });

  it("rejects anything that is not a BD mobile number", () => {
    for (const raw of ["", null, undefined, "1234", "sip:101@pbx", "02712345678"]) expect(callerIdPhone(raw)).toBeNull();
  });
});

describe("MicroSIP events", () => {
  it("starts an incoming call as ringing", () => {
    expect(planMicrosipEvent("incoming", null, now)).toEqual({ action: "insert", row: { direction: "incoming", outcome: "ringing", source: "microsip", started_at: now.toISOString() } });
  });

  it("marks the open call answered when the customer picks up", () => {
    const open = { id: "c1", answered_at: null };
    for (const event of ["start", "answer"]) {
      expect(planMicrosipEvent(event, open, now)).toEqual({ action: "update", patch: { outcome: "answered", answered_at: now.toISOString() } });
    }
    expect(planMicrosipEvent("start", { id: "c1", answered_at: ago(5) }, now)).toMatchObject({ action: "ignore" });
  });

  it("records a call dialled straight from MicroSIP when it connects", () => {
    expect(planMicrosipEvent("start", null, now)).toEqual({ action: "insert", row: { direction: "outgoing", outcome: "answered", source: "microsip", started_at: now.toISOString(), answered_at: now.toISOString() } });
    expect(planMicrosipEvent("answer", null, now)).toMatchObject({ action: "ignore" });
  });

  it("ends an answered call with its talk time, and an unanswered one as no answer", () => {
    expect(planMicrosipEvent("end", { id: "c1", answered_at: ago(134) }, now)).toEqual({ action: "update", patch: { ended_at: now.toISOString(), outcome: "answered", duration_seconds: 134 } });
    expect(planMicrosipEvent("end", { id: "c1", answered_at: null }, now)).toEqual({ action: "update", patch: { ended_at: now.toISOString(), outcome: "no_answer" } });
    expect(planMicrosipEvent("end", null, now)).toMatchObject({ action: "ignore" });
  });

  it("rejects unknown events", () => {
    expect(planMicrosipEvent("hold", null, now)).toMatchObject({ action: "reject" });
  });
});

describe("call status", () => {
  it("follows a call from ringing to talking to finished", () => {
    expect(callStatus({ outcome: "ringing", started_at: ago(10) }, now)).toBe("ringing");
    expect(callStatus({ outcome: "ringing", started_at: ago(10 * 60) }, now)).toBe("dialed");
    expect(callStatus({ outcome: "answered", started_at: ago(30), answered_at: ago(20) }, now)).toBe("talking");
    expect(callStatus({ outcome: "answered", started_at: ago(300), answered_at: ago(290), ended_at: ago(100) }, now)).toBe("answered");
    expect(callStatus({ outcome: "no_answer", started_at: ago(60), ended_at: ago(30) }, now)).toBe("no_answer");
  });
});

describe("call summary", () => {
  it("counts calls, misses, the current run of misses and each staff member's calls", () => {
    const calls = [
      { staff_id: "a", outcome: "no_answer", started_at: ago(10), ended_at: ago(5) },
      { staff_id: "b", outcome: "ringing", started_at: ago(3600) },
      { staff_id: "b", outcome: "no_answer", started_at: ago(7200), ended_at: ago(7100) },
      { staff_id: "a", outcome: "answered", started_at: ago(9000), answered_at: ago(8990), ended_at: ago(8800), duration_seconds: 190 },
    ];
    expect(summarizeCalls(calls, now)).toEqual({
      total: 4, answered: 1, noAnswer: 2, missedInARow: 2, talkSeconds: 190,
      byStaff: { a: { calls: 2, noAnswer: 1 }, b: { calls: 2, noAnswer: 1 } },
    });
  });

  it("keeps the said options to the fixed codes the database accepts", () => {
    expect(CALL_SAID_OPTIONS.map((option) => option.code)).toEqual(["confirmed", "send_later", "call_later", "address_change", "order_change", "refused", "cancel"]);
  });
});
