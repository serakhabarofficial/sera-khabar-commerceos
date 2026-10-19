import { describe, expect, it, vi } from "vitest";
import {
  applySteadfastReply,
  countSteadfastIssues,
  describeSteadfastFailure,
  resendSteadfastRun,
  runSteadfastSend,
  startSteadfastRun,
  steadfastGroupIds,
  steadfastRetryIds,
  steadfastRowFailure,
  type SteadfastBatchUpdate,
  type SteadfastSendReply,
} from "@/lib/steadfastBulkSend";
import { steadfastIssueMessage } from "../../shared/steadfastSend.js";

vi.mock("@/lib/api", () => ({ apiFetch: vi.fn() }));

const ids = (count: number) => Array.from({ length: count }, (_, index) => `o${index + 1}`);
const sendAll = async (orderIds: string[]): Promise<SteadfastSendReply<unknown>> => ({
  succeeded: orderIds.map((orderId) => ({ orderId, orderNumber: orderId })),
  failures: [],
});

describe("runSteadfastSend", () => {
  it("sends batches one after another and counts each", async () => {
    const send = vi.fn(sendAll);
    const updates: SteadfastBatchUpdate<unknown>[] = [];
    const result = await runSteadfastSend(ids(60), { send, batchSize: 25, onBatch: (update) => updates.push(update) });

    expect(result).toEqual({ stoppedReason: null });
    expect(send.mock.calls.map(([batch]) => batch.length)).toEqual([25, 25, 10]);
    expect(updates.map((update) => update.done)).toEqual([25, 50, 60]);
  });

  it("stops when a batch fails: that batch is checking and the rest were never sent", async () => {
    const send = vi.fn(sendAll).mockImplementationOnce(sendAll).mockRejectedValueOnce(new Error("Gateway timeout"));
    const updates: SteadfastBatchUpdate<unknown>[] = [];
    const result = await runSteadfastSend(ids(6), { send, batchSize: 2, onBatch: (update) => updates.push(update) });

    expect(result.stoppedReason).toBe("Gateway timeout");
    expect(send).toHaveBeenCalledTimes(2);
    const last = updates.at(-1)!;
    expect(last.done).toBe(6);
    expect(last.reply.failures.map((row) => [row.orderId, row.code])).toEqual([
      ["o3", "checking"], ["o4", "checking"], ["o5", "not_sent"], ["o6", "not_sent"],
    ]);
  });

  it("treats an order the server didn't answer for as checking", async () => {
    const updates: SteadfastBatchUpdate<unknown>[] = [];
    await runSteadfastSend(ids(2), {
      send: async () => ({ succeeded: [{ orderId: "o1", orderNumber: "#1" }], failures: [] }),
      onBatch: (update) => updates.push(update),
    });
    expect(updates[0].reply.failures).toEqual([expect.objectContaining({ orderId: "o2", code: "checking" })]);
  });
});

describe("Steadfast run state", () => {
  const phone = steadfastIssueMessage("phone");

  it("keeps counting sent orders across Send again", () => {
    let run = startSteadfastRun(3);
    run = applySteadfastReply(run, {
      succeeded: [{ orderId: "o1", orderNumber: "#1" }],
      failures: [
        { orderId: "o2", orderNumber: "#2", code: "phone", reason: phone },
        { orderId: "o3", orderNumber: "#3", code: "checking", reason: steadfastIssueMessage("checking") },
      ],
    });
    expect(countSteadfastIssues(run)).toMatchObject({ phone: 1, checking: 1 });
    // Orders that may already be at Steadfast are never sent again from the banner.
    expect(steadfastRetryIds(run)).toEqual(["o2"]);
    expect(steadfastGroupIds(run, "phone")).toEqual(new Set(["o2"]));

    run = { ...run, fixedIds: ["o2"] };
    run = resendSteadfastRun(run, 1);
    expect(run.progress).toEqual({ done: 0, total: 1 });
    run = applySteadfastReply(run, { succeeded: [{ orderId: "o2", orderNumber: "#2" }], failures: [] });
    expect(run.sentIds).toEqual(["o1", "o2"]);
    expect(run.total).toBe(3);
    expect(run.failures.o2).toBeUndefined();
  });

  it("shows this run's reason first, then the saved one", () => {
    const run = applySteadfastReply(startSteadfastRun(1), {
      succeeded: [],
      failures: [{ orderId: "o1", orderNumber: "#1", code: "other", reason: "Order already sent to courier" }],
    });
    expect(steadfastRowFailure({ id: "o1", courier_message: phone }, run)).toEqual({ code: "other", reason: "Order already sent to courier" });
    expect(steadfastRowFailure({ id: "o1", courier_message: phone }, null)).toEqual({ code: "phone", reason: phone });
    expect(steadfastRowFailure({ id: "o1", courier_message: null }, null)).toBeNull();
    expect(steadfastRowFailure({ id: "o1", sent_to_courier: true, courier_message: "Sent to Steadfast successfully" }, run)).toBeNull();
    expect(steadfastRowFailure({ id: "o1", sent_to_courier: true, courier_message: steadfastIssueMessage("no_code") }, null)?.code).toBe("no_code");
  });

  it("reads saved reasons as a title and a hint", () => {
    expect(describeSteadfastFailure({ code: "phone", reason: phone })).toEqual({
      kind: "phone", title: "Wrong phone", detail: "Steadfast needs 11 digits that start with 01.",
    });
    expect(describeSteadfastFailure({ code: "other", reason: "Order not found" })).toEqual({ kind: "other", title: "Not sent", detail: "Order not found" });
    expect(describeSteadfastFailure({ code: "not_sent", reason: "Not sent: Safe to send again." }).detail).toBe("Safe to send again.");
  });
});
