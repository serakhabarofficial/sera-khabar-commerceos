import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { apiFetch } from "@/lib/api";
import { getOrderHandlingSession, ORDER_HANDLING_CONFLICT_EVENT } from "@/lib/orderHandling";
const { getSession, refreshSession } = vi.hoisted(() => ({ getSession: vi.fn(), refreshSession: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: { getSession, refreshSession } } }));
beforeEach(() => { getSession.mockResolvedValue({ data: { session: { access_token: "old" } } }); refreshSession.mockResolvedValue({ data: { session: { access_token: "new" } } }); });
afterEach(() => vi.unstubAllGlobals());
it("attaches the tab UUID and preserves caller Headers on all requests and auth retries", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response("", { status: 401 })).mockResolvedValue(new Response("{}"));
  vi.stubGlobal("fetch", fetch);
  await apiFetch("/api/orders/a", { method: "PATCH", headers: new Headers({ "Content-Type": "application/json" }), body: "{}" });
  expect(getOrderHandlingSession()).toMatch(/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i);
  for (const [, init] of fetch.mock.calls) {
    expect(new Headers(init.headers).get("X-Order-Handling-Session")).toBe(getOrderHandlingSession());
    expect(new Headers(init.headers).get("Content-Type")).toBe("application/json");
  }
  expect(new Headers(fetch.mock.calls[1][1].headers).get("Authorization")).toBe("Bearer new");
});
it("broadcasts handling conflicts, including auth retries, while preserving the response body", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response("", { status: 401 })).mockResolvedValue(new Response(JSON.stringify({ code: "ORDER_HANDLING_CONFLICT", holder: { name: "Sadia" } }), { status: 409 }));
  vi.stubGlobal("fetch", fetch);
  const listener = vi.fn(); window.addEventListener(ORDER_HANDLING_CONFLICT_EVENT, listener);
  try {
    const result = await apiFetch("/api/orders/a", { method: "PATCH" });
    expect(listener).toHaveBeenCalledOnce();
    expect(await result.json()).toMatchObject({ code: "ORDER_HANDLING_CONFLICT" });
  } finally { window.removeEventListener(ORDER_HANDLING_CONFLICT_EVENT, listener); }
});
it("does not demote for unrelated optimistic conflicts", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: "stale_write" }), { status: 409 })));
  const listener = vi.fn(); window.addEventListener(ORDER_HANDLING_CONFLICT_EVENT, listener);
  try { await apiFetch("/api/orders/a"); expect(listener).not.toHaveBeenCalled(); }
  finally { window.removeEventListener(ORDER_HANDLING_CONFLICT_EVENT, listener); }
});
