import { afterEach, expect, it, vi } from "vitest";
import { transferableAbortController } from "node:util";
import { orderHandlingFetch, withOrderHandlingOperation } from "../../server/orderHandlingOperation.js";

afterEach(() => vi.unstubAllGlobals());
it("bounds and aborts operation requests, and prevents later side effects after ownership loss", async () => {
  const fetch = vi.fn(async (_input: string, _options?: RequestInit) => new Response("{}"));
  vi.stubGlobal("fetch", fetch);
  const operation = transferableAbortController();
  vi.stubGlobal("AbortSignal", Object.getPrototypeOf(operation.signal).constructor);
  await withOrderHandlingOperation(operation.signal, () => orderHandlingFetch("https://example.test"));
  const signal = fetch.mock.calls[0][1]!.signal!;
  expect(signal.aborted).toBe(false);
  operation.abort(new Error("Lost reservation"));
  expect(signal.aborted).toBe(true);
  expect(() => withOrderHandlingOperation(operation.signal, () => orderHandlingFetch("https://example.test"))).toThrow("Lost reservation");
  expect(fetch).toHaveBeenCalledOnce();
});
it("does not change unrelated system requests", async () => {
  const fetch = vi.fn(async () => new Response("{}")); vi.stubGlobal("fetch", fetch);
  await orderHandlingFetch("https://example.test", { method: "GET" });
  expect(fetch).toHaveBeenCalledWith("https://example.test", { method: "GET" });
});
