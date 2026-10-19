import { describe, expect, it, vi } from "vitest";
import { interpretInvoiceLookup, lookupSteadfastInvoice, planSteadfastCheck, readBulkOrderReply } from "../../server/steadfastBulkSend.js";
import { needsSteadfastLookup, steadfastInvoice, steadfastIssueMessage, steadfastSendIssue } from "../../shared/steadfastSend.js";

describe("Steadfast send reasons", () => {
  it("saves a title and a plain detail, and reads it back", () => {
    expect(steadfastIssueMessage("phone")).toBe("Wrong phone: Steadfast needs 11 digits that start with 01.");
    expect(steadfastIssueMessage("rejected", "  Invalid\n COD ")).toBe("Steadfast said no: Invalid COD");
    expect(steadfastSendIssue({ courier_message: "Steadfast said no: Invalid COD", sent_to_courier: false })).toEqual({
      kind: "rejected", title: "Steadfast said no", detail: "Invalid COD",
    });
  });

  it("ignores other courier messages and mismatched sent states", () => {
    expect(steadfastSendIssue({ courier_message: "Sent to Steadfast successfully", sent_to_courier: true })).toBeNull();
    expect(steadfastSendIssue({ courier_message: steadfastIssueMessage("phone"), sent_to_courier: true })).toBeNull();
    expect(steadfastSendIssue({ courier_message: steadfastIssueMessage("no_code"), sent_to_courier: false })).toBeNull();
    expect(steadfastSendIssue({ courier_message: steadfastIssueMessage("no_code"), sent_to_courier: true })?.kind).toBe("no_code");
  });

  it("only looks up orders a past send may have reached", () => {
    expect(needsSteadfastLookup({ courier_message: steadfastIssueMessage("checking") })).toBe(true);
    expect(needsSteadfastLookup({ courier_message: steadfastIssueMessage("not_received") })).toBe(true);
    expect(needsSteadfastLookup({ courier_message: steadfastIssueMessage("phone") })).toBe(false);
    expect(needsSteadfastLookup({ courier_message: null })).toBe(false);
  });

  it("builds the same invoice the routes always used", () => {
    expect(steadfastInvoice({ id: "abc", order_number: "#1042 a" })).toBe("ORD-1042A");
    expect(steadfastInvoice({ id: "0000-1111-2222-abcdef12", order_number: null })).toBe("ORD-ABCDEF12");
  });
});

describe("Steadfast invoice lookup", () => {
  // jsdom's AbortSignal has no timeout(); Node 20, where the server runs, does.
  if (typeof AbortSignal.timeout !== "function") {
    Object.assign(AbortSignal, { timeout: () => new AbortController().signal });
  }

  it("reads found, missing and unknown replies", () => {
    expect(interpretInvoiceLookup(200, { status: 200, delivery_status: "in_review" })).toBe("found");
    expect(interpretInvoiceLookup(404, null)).toBe("missing");
    expect(interpretInvoiceLookup(200, { status: 404, message: "Not found" })).toBe("missing");
    expect(interpretInvoiceLookup(200, { status: 200, delivery_status: null })).toBe("unknown");
    expect(interpretInvoiceLookup(500, null)).toBe("unknown");
    expect(interpretInvoiceLookup(401, { message: "Unauthorized" })).toBe("unknown");
  });

  it("calls status_by_invoice and treats network errors as unknown", async () => {
    const fetchImpl = vi.fn(async () => ({ status: 200, json: async () => ({ status: 200, delivery_status: "pending" }) }));
    await expect(lookupSteadfastInvoice({ apiKey: "k", secretKey: "s", invoice: "ORD-1", fetchImpl })).resolves.toBe("found");
    expect(fetchImpl).toHaveBeenCalledWith("https://portal.packzy.com/api/v1/status_by_invoice/ORD-1", expect.objectContaining({
      headers: expect.objectContaining({ "Api-Key": "k", "Secret-Key": "s" }),
    }));
    const failing = vi.fn(async () => { throw new Error("offline"); });
    await expect(lookupSteadfastInvoice({ apiKey: "k", secretKey: "s", invoice: "ORD-1", fetchImpl: failing })).resolves.toBe("unknown");
  });
});

describe("Steadfast bulk reply", () => {
  const invoices = ["ORD-1", "ORD-2", "ORD-3", "ORD-4"];

  it("matches each row by invoice", () => {
    const outcomes = readBulkOrderReply(invoices, { httpStatus: 200, body: { data: [
      { invoice: "ORD-1", status: "success", consignment_id: 11, tracking_code: "T1" },
      { invoice: "ORD-2", status: "error", message: "Bad phone" },
      { invoice: "ORD-3", status: "success", consignment_id: 13 },
    ] } });
    expect(outcomes.get("ORD-1")).toEqual({ outcome: "sent", consignmentId: "11", trackingCode: "T1" });
    expect(outcomes.get("ORD-2")).toEqual({ outcome: "rejected", detail: "Bad phone" });
    // Accepted without a code, or missing from the reply: it may be at Steadfast.
    expect(outcomes.get("ORD-3")).toEqual({ outcome: "checking" });
    expect(outcomes.get("ORD-4")).toEqual({ outcome: "checking" });
  });

  it("accepts a bare array reply", () => {
    const outcomes = readBulkOrderReply(["ORD-1"], { httpStatus: 200, body: [{ invoice: "ORD-1", status: "success", consignment_id: 1, tracking_code: "T" }] });
    expect(outcomes.get("ORD-1")?.outcome).toBe("sent");
  });

  it("treats a 4xx with no rows as a no, and anything unreadable as checking", () => {
    const no = readBulkOrderReply(["ORD-1"], { httpStatus: 422, body: { errors: { cod_amount: ["COD must be a number"] } } });
    expect(no.get("ORD-1")).toEqual({ outcome: "rejected", detail: "COD must be a number" });
    for (const reply of [{ failed: true }, { httpStatus: 500, body: null }, { httpStatus: 200, body: { status: 200 } }]) {
      expect(readBulkOrderReply(["ORD-1"], reply).get("ORD-1")).toEqual({ outcome: "checking" });
    }
  });
});

describe("Steadfast check plan", () => {
  it("decides what to report for each order", () => {
    expect(planSteadfastCheck({ sent_to_courier: true, courier_message: "Sent to Steadfast successfully" })).toEqual({ action: "sent" });
    expect(planSteadfastCheck({ sent_to_courier: true, courier_message: steadfastIssueMessage("no_code") })).toMatchObject({ action: "report", code: "no_code" });
    expect(planSteadfastCheck({ sent_to_courier: false, courier_message: steadfastIssueMessage("checking") })).toEqual({ action: "lookup" });
    expect(planSteadfastCheck({ sent_to_courier: false, courier_message: steadfastIssueMessage("phone") })).toMatchObject({ action: "report", code: "phone" });
    expect(planSteadfastCheck({ sent_to_courier: false, courier_message: null })).toMatchObject({ action: "report", code: "not_sent" });
  });
});
