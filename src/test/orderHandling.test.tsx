import { StrictMode } from "react";
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useOrderHandling } from "@/hooks/useOrderHandling";
import { OrderHandlingNotice, OrderHandlingWorkspace } from "@/components/orders/OrderHandlingNotice";
import { ORDER_HANDLING_CONFLICT_EVENT } from "@/lib/orderHandling";

const { apiFetch } = vi.hoisted(() => ({ apiFetch: vi.fn() }));
vi.mock("@/lib/api", () => ({ apiFetch }));
const handling = { status: "handling", holder: null, expires_at: null };
const available = { status: "available", holder: null, expires_at: null };
const occupied = { status: "view_only", holder: { name: "Sadia" }, expires_at: null };
const response = (body: unknown, ok = true) => ({ ok, json: async () => body }) as Response;
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
const actions: Array<{ action: string; active?: boolean; session_id: string }> = [];
beforeEach(() => {
  vi.useFakeTimers(); actions.length = 0;
  apiFetch.mockReset().mockImplementation(async (_url: string, options: RequestInit) => {
    const body = JSON.parse(String(options.body)); actions.push(body);
    return response(body.action === "release" ? available : handling);
  });
});
afterEach(async () => { cleanup(); await flush(); vi.useRealTimers(); });

describe("order handling lifecycle", () => {
  it("fails closed while acquiring, then enables handling", async () => {
    const { result } = renderHook(() => useOrderHandling("order", "a"));
    expect(result.current.canEdit).toBe(false);
    await flush();
    expect(result.current.canEdit).toBe(true);
  });
  it("refreshes after initial acquisition and keeps editing disabled until refresh completes", async () => {
    let finish: () => void = () => {};
    const refresh = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const { result } = renderHook(() => useOrderHandling("abandoned", "initial-refresh", { beforeStart: refresh }));
    await flush();
    expect(refresh).toHaveBeenCalledOnce();
    expect(result.current.canEdit).toBe(false);
    await act(async () => { finish(); });
    expect(result.current.canEdit).toBe(true);
  });
  it("fails closed and releases when the initial refresh fails", async () => {
    const { result } = renderHook(() => useOrderHandling("abandoned", "failed-refresh", {
      beforeStart: async () => { throw new Error("Could not refresh checkout"); },
    }));
    await flush(); await flush();
    expect(result.current.canEdit).toBe(false);
    expect(result.current.status).toBe("error");
    expect(actions.some(action => action.action === "release")).toBe(true);
  });
  it("releases after five minutes without activity despite heartbeat polling", async () => {
    const { result } = renderHook(() => useOrderHandling("order", "idle")); await flush();
    await act(async () => { await vi.advanceTimersByTimeAsync(300_000); });
    expect(result.current.canEdit).toBe(false);
    expect(actions.some(x => x.action === "release")).toBe(true);
    expect(actions.filter(x => x.action === "heartbeat").every(x => x.active === false)).toBe(true);
    fireEvent.pointerDown(window); await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(actions.filter(x => x.action === "acquire")).toHaveLength(1);
  });
  it("sends active only once for real activity since the preceding heartbeat", async () => {
    renderHook(() => useOrderHandling("order", "active")); await flush();
    fireEvent.keyDown(window, { key: "a" });
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
    expect(actions.filter(x => x.action === "heartbeat").map(x => x.active)).toEqual([true, false]);
  });
  it("polls status without claiming and explicitly refreshes before restarting", async () => {
    let busy = true;
    apiFetch.mockImplementation(async (_url: string, options: RequestInit) => {
      const body = JSON.parse(String(options.body)); actions.push(body);
      return response(busy ? occupied : body.action === "acquire" ? handling : available);
    });
    let refreshed = false;
    const { result } = renderHook(() => useOrderHandling("review", "b", { beforeStart: async () => { refreshed = true; } }));
    await flush(); busy = false;
    await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    expect(result.current.canEdit).toBe(false);
    expect(result.current.status).toBe("available");
    expect(actions.filter(x => x.action === "acquire")).toHaveLength(1);
    await act(async () => { await result.current.startHandling(); });
    expect(refreshed).toBe(true); expect(result.current.canEdit).toBe(true);
  });
  it("demotes immediately on mutation conflict without clearing a draft", async () => {
    const { result } = renderHook(() => useOrderHandling("order", "lost")); await flush();
    act(() => window.dispatchEvent(new CustomEvent(ORDER_HANDLING_CONFLICT_EVENT, { detail: { holder: { name: "Sadia" } } })));
    expect(result.current.canEdit).toBe(false);
  });
  it("keeps errors closed and Retry status never acquires", async () => {
    apiFetch.mockResolvedValue(response({}, false));
    const { result } = renderHook(() => useOrderHandling("order", "error")); await flush();
    expect(result.current.status).toBe("error"); expect(result.current.canEdit).toBe(false);
    apiFetch.mockResolvedValue(response(available));
    await act(async () => { await result.current.retryStatus(); });
    expect(result.current.status).toBe("available"); expect(result.current.canEdit).toBe(false);
  });
  it("serializes release after late acquire and before StrictMode reacquisition", async () => {
    let finish: (value: Response) => void = () => {};
    const order: string[] = [];
    apiFetch.mockImplementation(async (_url: string, options: RequestInit) => {
      const action = JSON.parse(String(options.body)).action; order.push(action);
      if (order.length === 1) return new Promise<Response>(resolve => { finish = resolve; });
      return response(handling);
    });
    const { unmount } = renderHook(() => useOrderHandling("order", "strict"), { wrapper: StrictMode }); await flush();
    finish(response(handling)); await flush(); await flush();
    expect(order).toEqual(["release", "acquire"]);
    unmount(); await flush(); expect(order.at(-1)).toBe("release");
  });
  it("releases an acquire response arriving after unmount without resurrecting the owner", async () => {
    let finish: (value: Response) => void = () => {};
    const sequence: string[] = [];
    apiFetch.mockImplementation(async (_url: string, options: RequestInit) => {
      const action = JSON.parse(String(options.body)).action; sequence.push(action);
      if (action === "acquire") return new Promise<Response>(resolve => { finish = resolve; });
      return response(available);
    });
    const { result, unmount } = renderHook(() => useOrderHandling("order", "late")); await flush();
    unmount(); finish(response(handling)); await flush(); await flush();
    expect(sequence).toEqual(["acquire", "release"]);
    expect(result.current.canEdit).toBe(false);
  });
  it("expires the confirmed lease even when a heartbeat hangs", async () => {
    apiFetch.mockImplementation(async (_url: string, options: RequestInit) => {
      const action = JSON.parse(String(options.body)).action;
      if (action === "heartbeat") return new Promise<Response>(() => {});
      return response({ ...handling, expires_at: new Date(Date.now() + 20_000).toISOString() });
    });
    const { result } = renderHook(() => useOrderHandling("order", "hung")); await flush();
    await act(async () => { await vi.advanceTimersByTimeAsync(20_000); });
    expect(result.current.canEdit).toBe(false);
  });
  it("restores from BFCache as available and permits only an explicit start", async () => {
    const { result } = renderHook(() => useOrderHandling("order", "bfcache")); await flush();
    fireEvent(window, new Event("pagehide")); await flush();
    fireEvent(window, new PageTransitionEvent("pageshow", { persisted: true })); await flush();
    expect(result.current.canEdit).toBe(false);
    expect(actions.filter(x => x.action === "acquire")).toHaveLength(1);
    await act(async () => { await result.current.startHandling(); });
    expect(result.current.canEdit).toBe(true);
  });
  it("pagehide disables immediately and releases with keepalive", async () => {
    const { result } = renderHook(() => useOrderHandling("abandoned", "hide")); await flush();
    fireEvent(window, new Event("pagehide")); await flush();
    expect(result.current.canEdit).toBe(false);
    expect(apiFetch.mock.calls.some(([, options]) => options.keepalive && JSON.parse(options.body).action === "release")).toBe(true);
  });
  it("uses a new generation on a later visit so delayed cleanup cannot release it", async () => {
    const first = renderHook(() => useOrderHandling("order", "revisit")); await flush();
    const oldSession = actions.find(x => x.action === "acquire")!.session_id;
    first.unmount(); await flush();
    renderHook(() => useOrderHandling("order", "revisit")); await flush();
    const visits = actions.filter(x => x.action === "acquire");
    expect(visits[1].session_id).not.toBe(oldSession);
    expect(actions.find(x => x.action === "release")!.session_id).toBe(oldSession);
  });
});

it("disables actual action controls and contact links while preserving reading and copy", () => {
  const click = vi.fn();
  render(<OrderHandlingWorkspace canEdit={false}><button onClick={click}>Save changes</button><input aria-label="Quantity" /><a href="tel:01711111111" onClick={click}>Call</a><a href="https://wa.me/8801711111111" onClick={click}>WhatsApp</a><button aria-label="Copy phone" onClick={click}>Copy</button><a href="/orders">Read orders</a></OrderHandlingWorkspace>);
  expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  expect(screen.getByRole("textbox")).toBeDisabled();
  expect(screen.getByText("Call")).not.toHaveAttribute("href");
  expect(screen.getByText("WhatsApp")).not.toHaveAttribute("href");
  fireEvent.click(screen.getByText("Call")); fireEvent.click(screen.getByText("WhatsApp")); expect(click).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Copy phone" })); expect(click).toHaveBeenCalledOnce();
});

it("offers accessible view-only dialog then a persistent retained-draft notice", async () => {
  function Notice() { const state = useOrderHandling("order", "notice"); return <OrderHandlingNotice handling={state} dirty onBack={() => {}} />; }
  apiFetch.mockResolvedValue(response(occupied)); render(<Notice />); await flush();
  expect(screen.getByRole("dialog")).toHaveTextContent("Sadia is working on this order");
  fireEvent.click(screen.getByRole("button", { name: "View only" }));
  expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  expect(screen.getByRole("status")).toHaveTextContent(/draft.*retained/i);
});
